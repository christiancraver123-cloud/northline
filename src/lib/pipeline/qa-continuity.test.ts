// Tests for: transient QA retry, QA supersession + history, no silent fallback, carousel Continuity QA, hard-lock/negative propagation,
// shared continuity spec propagation, RAW -> 4:5 derivative lineage, and the operator "re-run QA without regenerating" path.
import { beforeEach, describe, expect, it } from "vitest";
import { FileRepo } from "@/lib/db/file-store";
import { mockImageWithBytes, mockVideo } from "@/lib/providers/mock";
import type { StorageProvider } from "@/lib/providers/types";
import { executeCreate, type Deps } from "@/lib/orchestrator/execute";
import { buildCanonicalIdentity } from "@/lib/identity/canonical";
import { TALENT_CODES, type TalentCode } from "@/lib/domain/types";
import type { GenerationBriefData, QaResult } from "@/lib/db/records";
import { buildPrompts, GLOBAL_NEGATIVES, hardLockLines } from "./prompts";
import { activeQa, aggregateQa, runIdentityQa, type VisionOutcome, type VisionRequest } from "./qa";
import { visionWithRetry } from "./qa-retry";
import { qaPreview } from "./continuity";
import { createDelivery45, crop45Box } from "./derive";
import { cropRaster, decodePng, downscaleRaster, encodePng, type Raster } from "@/lib/media/png";
import { inspectImage } from "@/lib/media/inspect";
import { loadIdentity } from "@/lib/identity/service";
import { loadReferences } from "@/lib/references/service";
import { rerunQa } from "@/lib/agents/ops/commands";
import { ensureAgents, setModelPreference } from "@/lib/agents/ops/service";
import { createRouter } from "@/lib/llm/router";
import { resetHealth } from "@/lib/llm/health";
import { mockLlm } from "@/lib/llm/mock";
import { LlmError, type LlmProvider } from "@/lib/llm/types";

// ---------- helpers ----------
const gradient = (w: number, h: number, channels: 3 | 4 = 3): Raster => {
  const data = new Uint8Array(w * h * channels);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < channels; c++) data[(y * w + x) * channels + c] = (x * 7 + y * 13 + c * 50 + ((x * y) % 17)) & 255;
  return { width: w, height: h, channels, data };
};
const realPng = (w = 120, h = 180) => encodePng(gradient(w, h));
const mem = (): StorageProvider & { files: Map<string, Uint8Array> } => {
  const files = new Map<string, Uint8Array>();
  return { files, async save(p, b) { files.set(p, b); return p; }, async read(p) { const b = files.get(p); return b ? { bytes: b, mime: "image/png" } : null; } };
};
const instant = { sleep: async () => {}, backoffMs: [10, 20] };
const mkDeps = (o: Partial<Deps> = {}) => ({ image: mockImageWithBytes(realPng()), video: mockVideo, storage: mem(), origin: "demo", qaRetry: instant, ...o }) as Deps & { storage: ReturnType<typeof mem> };

const idOk = (req: VisionRequest): VisionOutcome => ({ text: JSON.stringify({ locks: [...req.prompt.matchAll(/^- (\S+) \(/gm)].map((m) => ({ id: m[1], verdict: "PASS", note: "ok" })) }), provider: "gemini", model: "gemini-test", error: null });
const CHECKS = ["anatomy", "hands", "objects", "background_geometry", "reflections", "unwanted_text", "unwanted_logos", "generation_artifacts", "camera_plausibility", "lighting_plausibility"];
const techOk = (): VisionOutcome => ({ text: JSON.stringify({ checks: CHECKS.map((id) => ({ id, verdict: "PASS" })) }), provider: "gemini", model: "gemini-test", error: null });
const CONT = ["same_person", "outfit", "jewelry", "hair", "time_of_day", "lighting_progression", "location_progression", "recurring_props", "unwanted_text_signage", "story_coherence"];
const contWith = (bad: Record<string, { verdict: string; note: string; frames?: number[] }> = {}) => (): VisionOutcome => ({ text: JSON.stringify({ checks: CONT.map((id) => ({ id, ...(bad[id] ?? { verdict: "PASS" }) })) }), provider: "gemini", model: "gemini-test", error: null });
const transient = (): VisionOutcome => ({ text: null, provider: "gemini", model: "gemini-test", error: "[gemini] service unavailable (HTTP 503)", transient: true });
const hardDown = (): VisionOutcome => ({ text: null, provider: "gemini", model: "gemini-test", error: "[gemini] credentials rejected (HTTP 401)", transient: false });

type Step = (r: VisionRequest) => VisionOutcome;
/** Scripted vision inspector: per request kind, a list of steps (the last step repeats). Records every request. */
const vision = (script: Partial<Record<VisionRequest["kind"], Step[]>>) => {
  const calls: VisionRequest[] = [];
  const counts: Record<string, number> = {};
  const fn = Object.assign(async (req: VisionRequest) => {
    calls.push(req);
    const steps = script[req.kind] ?? [req.kind === "IDENTITY" ? idOk : req.kind === "TECHNICAL" ? techOk : contWith()];
    const i = (counts[req.kind] = (counts[req.kind] ?? 0));
    counts[req.kind]++;
    return steps[Math.min(i, steps.length - 1)](req);
  }, { calls });
  return fn;
};
const SIE_CREATIVE = {
  hook: "Sienna documents her morning", location: "Miami neighborhood", outfit: "fitted white ribbed tank, black high-waisted leggings, white sneakers", lighting: "soft Miami morning daylight", storyBeat: "one continuous morning",
  continuity: { timeWindow: "one Miami morning, about 8:30-10:30 AM", bag: "the same cream canvas tote", props: ["clear iced coffee cup with a straw"], cameraStyle: "handheld iPhone feel", locationProgression: ["studio mirror", "studio door", "palm-lined sidewalk", "coffee window", "sunlit step"] },
  shots: [1, 2, 3, 4, 5].map((n) => ({ n, kind: "IMG" as const, description: `scene ${n}` })),
};
const make = async (r: FileRepo, d: Deps, n = 3, extra: Record<string, unknown> = {}) =>
  executeCreate(r, { talent: ["SIE"], format: "CAROUSEL", concept: "Pilates to coffee", asset_count: n, creative: { ...SIE_CREATIVE, shots: SIE_CREATIVE.shots.slice(0, n) }, ...extra }, d);
const identityRows = async (r: FileRepo, assetId: string) => (await r.list("qaResults")).filter((q) => q.kind === "IDENTITY" && q.assetId === assetId && q.method !== "prompt_rules");

beforeEach(() => resetHealth());

// ---------- transient QA retry ----------
describe("transient Identity QA retry (bounded, same provider)", () => {
  it("retries 503s with backoff and records the retry on the result", async () => {
    const r = new FileRepo(null), sleeps: number[] = [];
    const v = vision({ IDENTITY: [transient, transient, idOk] });
    await make(r, mkDeps({ vision: v, qaRetry: { sleep: async (ms) => { sleeps.push(ms); }, backoffMs: [10, 20] } }), 2);
    const first = (await r.list("assets")).sort((a, b) => a.seq - b.seq)[0];
    const rows = await identityRows(r, first.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ method: "vision_model", inspectedImage: true, status: "PASS", qaAttempt: 1 });
    expect(rows[0].retry).toMatchObject({ attempts: 3, maxAttempts: 3, exhausted: false });
    expect(rows[0].retry!.errors).toHaveLength(2);
    expect(v.calls.filter((c) => c.kind === "IDENTITY").slice(0, 3).map((c) => c.retryAttempt)).toEqual([1, 2, 3]);
    expect(sleeps.slice(0, 2)).toEqual([10, 20]); // bounded backoff schedule
  });
  it("is bounded: gives up after maxAttempts, and later assets in the same run only get one attempt", async () => {
    const r = new FileRepo(null);
    const v = vision({ IDENTITY: [transient] });
    await make(r, mkDeps({ vision: v }), 3);
    expect(v.calls.filter((c) => c.kind === "IDENTITY")).toHaveLength(3 + 1 + 1); // 3 tries, then 1 + 1
    const assets = (await r.list("assets")).sort((a, b) => a.seq - b.seq);
    const rows = await Promise.all(assets.map((a) => identityRows(r, a.id)));
    expect(rows.every((x) => x[0].method === "manual" && x[0].status === "MANUAL_REVIEW_REQUIRED" && x[0].inspectedImage === false)).toBe(true);
    expect(rows[0][0].retry).toMatchObject({ attempts: 3, exhausted: true });
    expect(rows[1][0].retry).toMatchObject({ attempts: 1, exhausted: true });
    expect(rows[1][0].retry!.note).toMatch(/already failed all retries/);
    expect(rows[0][0].recommendation).toMatch(/re-run Identity QA/i);
  });
  it("never retries a non-transient error (e.g. rejected credentials)", async () => {
    const r = new FileRepo(null);
    const v = vision({ IDENTITY: [hardDown] });
    await make(r, mkDeps({ vision: v }), 2);
    expect(v.calls.filter((c) => c.kind === "IDENTITY")).toHaveLength(2); // one per asset, no retries
    const a = (await r.list("assets"))[0];
    expect((await identityRows(r, a.id))[0].retry).toBeNull();
  });
  it("visionWithRetry honours a short Retry-After and caps long waits", async () => {
    const waits: number[] = [];
    let n = 0;
    const v = async (): Promise<VisionOutcome> => (++n < 3 ? { ...transient(), retryAfterMs: n === 1 ? 3000 : 999_000 } : idOk({ prompt: "- X (HARD_FAIL)" } as VisionRequest));
    const { outcome, retry } = await visionWithRetry(v, { kind: "IDENTITY", system: "", prompt: "", images: [] }, { maxAttempts: 3, backoffMs: [1], maxWaitMs: 20_000, sleep: async (ms) => { waits.push(ms); } });
    expect(outcome.text).toBeTruthy();
    expect(waits).toEqual([3000, 20_000]);
    expect(retry).toMatchObject({ attempts: 3, exhausted: false });
  });
});

// ---------- supersession + history ----------
describe("QA supersession and history", () => {
  it("a newer successful result supersedes an unavailable one for the same asset + QA type; nothing is deleted", async () => {
    const r = new FileRepo(null), d = mkDeps({ vision: vision({ IDENTITY: [transient] }) });
    await make(r, d, 2);
    const p = (await r.list("productions"))[0], attempt = (await r.list("generationAttempts"))[0];
    const assets = (await r.list("assets")).filter((a) => a.current).sort((a, b) => a.seq - b.seq);
    const before = await r.list("qaResults");
    const beforeIds = new Set(before.map((q) => q.id));
    const manual = (await identityRows(r, assets[0].id))[0];
    expect(aggregateQa(before.filter((q) => q.assetId === assets[0].id && q.kind === "IDENTITY"))).toBe("MANUAL_REVIEW_REQUIRED");

    const { identity } = await loadIdentity(r, "SIE");
    const retryDeps = mkDeps({ vision: vision({ IDENTITY: [idOk] }), storage: d.storage });
    const fresh = await runIdentityQa(r, retryDeps, p, attempt, assets, identity, await loadReferences(r, "SIE"), { promptRules: false });
    expect(fresh.every((x) => x.method === "vision_model" && x.status === "PASS" && x.qaAttempt === 2)).toBe(true);

    const after = await r.list("qaResults");
    for (const id of beforeIds) expect(after.some((q) => q.id === id), "history row kept").toBe(true); // never deleted
    expect(after.length).toBe(before.length + assets.length);
    const old = after.find((q) => q.id === manual.id)!;
    expect(old.supersededById).toBe(fresh.find((x) => x.assetId === assets[0].id)!.id); // superseded, not removed
    expect(old.status).toBe("MANUAL_REVIEW_REQUIRED"); // original verdict untouched
    expect(aggregateQa(after.filter((q) => q.assetId === assets[0].id && q.kind === "IDENTITY"))).toBe("PASS"); // no longer poisoned
    expect(activeQa(after.filter((q) => q.assetId === assets[0].id && q.kind === "IDENTITY" && q.method !== "prompt_rules"))).toHaveLength(1);
  });
  it("an unavailable retry never replaces an earlier conclusive result (kept as history only)", async () => {
    const r = new FileRepo(null), d = mkDeps({ vision: vision({ IDENTITY: [idOk] }) });
    await make(r, d, 2);
    const p = (await r.list("productions"))[0], attempt = (await r.list("generationAttempts"))[0];
    const assets = (await r.list("assets")).filter((a) => a.current);
    const good = (await identityRows(r, assets[0].id))[0];
    expect(good).toMatchObject({ method: "vision_model", status: "PASS" });
    const { identity } = await loadIdentity(r, "SIE");
    await runIdentityQa(r, mkDeps({ vision: vision({ IDENTITY: [transient] }), storage: d.storage }), p, attempt, assets, identity, [], { promptRules: false });
    const rows = (await identityRows(r, assets[0].id)).sort((a, b) => a.qaAttempt - b.qaAttempt);
    expect(rows.map((x) => x.method)).toEqual(["vision_model", "manual"]);
    expect(rows[1].supersededById).toBe(good.id); // the failed retry is history
    expect(rows[0].supersededById).toBeNull();
    expect(aggregateQa(rows)).toBe("PASS");
  });
  it("supersession is scoped: a re-run of Identity QA does not touch Technical results or other assets", async () => {
    const r = new FileRepo(null), d = mkDeps({ vision: vision({ IDENTITY: [transient] }) });
    await make(r, d, 2);
    const p = (await r.list("productions"))[0], attempt = (await r.list("generationAttempts"))[0];
    const assets = (await r.list("assets")).filter((a) => a.current).sort((a, b) => a.seq - b.seq);
    const techBefore = (await r.list("qaResults")).filter((q) => q.kind === "TECHNICAL").map((q) => q.supersededById);
    const { identity } = await loadIdentity(r, "SIE");
    await runIdentityQa(r, mkDeps({ vision: vision({ IDENTITY: [idOk] }), storage: d.storage }), p, attempt, [assets[0]], identity, [], { promptRules: false });
    expect((await r.list("qaResults")).filter((q) => q.kind === "TECHNICAL").map((q) => q.supersededById)).toEqual(techBefore);
    expect((await identityRows(r, assets[1].id))[0].supersededById).toBeNull(); // asset 2 untouched, still manual
  });
});

// ---------- operator re-run (agent path, real router, no fallback, no regeneration) ----------
describe("operator QA re-run through the agent/router path", () => {
  const fakeGemini = (failTimes: number, calls: { n: number }): LlmProvider => ({
    name: "gemini", defaultModel: "gemini-test", vision: true, configured: () => true,
    async complete(req) {
      calls.n++;
      if (calls.n <= failTimes) throw new LlmError("gemini", "unavailable", "service unavailable (HTTP 503)");
      const locks = [...req.prompt.matchAll(/^- (\S+) \(/gm)].map((m) => ({ id: m[1], verdict: "PASS", note: "ok" }));
      const text = req.prompt.includes("Verify each identity lock") ? JSON.stringify({ locks })
        : req.prompt.includes("same_person") ? JSON.stringify({ checks: CONT.map((id) => ({ id, verdict: "PASS" })) }) : JSON.stringify({ checks: CHECKS.map((id) => ({ id, verdict: "PASS" })) });
      return { provider: "gemini", model: "gemini-test", text, usage: null, requestId: null };
    },
  });
  const openaiSpy = (calls: { n: number }): LlmProvider => ({ name: "openai", defaultModel: "gpt-test", vision: true, configured: () => true, async complete() { calls.n++; throw new Error("OpenAI must never be used as a silent fallback for Identity QA"); } });

  it("re-runs Identity QA on an existing asset: retries through the provider cooldown, never falls back, never regenerates", async () => {
    const r = new FileRepo(null), d = mkDeps();
    await make(r, d, 2); // no vision: every visual QA is MANUAL_REVIEW_REQUIRED
    const jobsBefore = (await r.list("providerJobs")).map((j) => j.id), assetsBefore = (await r.list("assets")).map((a) => ({ id: a.id, sha: a.sha256, path: a.storagePath, status: a.status }));
    const p = (await r.list("productions"))[0];
    await ensureAgents(r);
    await setModelPreference(r, "IDENTITY_QA", { provider: "gemini", allowFallback: false });
    const g = { n: 0 }, o = { n: 0 };
    const router = createRouter({ gemini: fakeGemini(2, g), openai: openaiSpy(o), mock: mockLlm({ configured: false }) });
    const target = (await r.list("assets")).filter((a) => a.current).sort((a, b) => a.seq - b.seq)[0];

    const out = await rerunQa(r, { productionId: p.id, assetIds: [target.id], kinds: ["IDENTITY"], deps: { ...d }, router });
    expect(out.tasks.map((t) => t.status)).toEqual(["COMPLETE", "COMPLETE"]); // identity task + finalize
    const rows = (await identityRows(r, target.id)).sort((a, b) => a.qaAttempt - b.qaAttempt);
    expect(rows.map((x) => x.method)).toEqual(["manual", "vision_model"]);
    expect(rows[1]).toMatchObject({ status: "PASS", inspectedImage: true, provider: "gemini", qaAttempt: 2 });
    expect(rows[1].retry).toMatchObject({ attempts: 3, exhausted: false });
    expect(rows[0].supersededById).toBe(rows[1].id);
    expect(g.n).toBe(3); // 2 transient failures (retried through the cooldown) + 1 success
    expect(o.n).toBe(0); // NO silent fallback to OpenAI

    // no regeneration, no mutation of the RAW assets
    expect((await r.list("providerJobs")).map((j) => j.id)).toEqual(jobsBefore);
    expect((await r.list("assets")).map((a) => ({ id: a.id, sha: a.sha256, path: a.storagePath, status: a.status }))).toEqual(assetsBefore);
    expect((await r.list("generationAttempts"))).toHaveLength(1);
  });
  it("when Gemini stays down the result stays honestly unavailable, with retry state exposed, and OpenAI is still never called", async () => {
    const r = new FileRepo(null), d = mkDeps();
    await make(r, d, 2);
    const p = (await r.list("productions"))[0];
    await ensureAgents(r);
    await setModelPreference(r, "IDENTITY_QA", { provider: "gemini", allowFallback: false });
    const g = { n: 0 }, o = { n: 0 };
    const router = createRouter({ gemini: fakeGemini(999, g), openai: openaiSpy(o), mock: mockLlm({ configured: false }) });
    await rerunQa(r, { productionId: p.id, kinds: ["IDENTITY"], deps: { ...d }, router });
    const rows = (await r.list("qaResults")).filter((q) => q.kind === "IDENTITY" && q.method === "manual" && q.qaAttempt === 2);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].retry).toMatchObject({ exhausted: true, attempts: 3 });
    expect(rows[0].summary).toMatch(/Identity NOT visually verified/);
    expect(o.n).toBe(0);
    expect(g.n).toBeLessThanOrEqual(3 + 1 + 1 + 1 + 1); // bounded
  });
  it("router policy: identity-critical kinds with allowFallback:false only ever try the configured provider", async () => {
    const g = { n: 0 }, o = { n: 0 };
    const router = createRouter({ gemini: fakeGemini(999, g), openai: openaiSpy(o), mock: mockLlm({ configured: false }) });
    expect(router.candidates("IDENTITY_QA", "identity_qa.attempt", { provider: "gemini", allowFallback: false }).map((c) => c.provider)).toEqual(["gemini"]);
    expect(router.candidates("IDENTITY_QA", "continuity_qa.attempt", { provider: "gemini", allowFallback: false }).map((c) => c.provider)).toEqual(["gemini"]);
    const res = await router.run("IDENTITY_QA", "continuity_qa.attempt", { prompt: "x" }, { provider: "gemini", allowFallback: false });
    expect(res.attempts.map((a) => a.provider)).toEqual(["gemini"]);
    expect(o.n).toBe(0);
  });
});

// ---------- continuity QA ----------
describe("Continuity QA (carousel evaluated as a sequence)", () => {
  const contRows = async (r: FileRepo) => (await r.list("qaResults")).filter((q) => q.kind === "CONTINUITY");
  it("sends ALL frames, in order, in ONE request with the shared spec; persists the sequence result", async () => {
    const r = new FileRepo(null), v = vision({});
    await make(r, mkDeps({ vision: v }), 4);
    const calls = v.calls.filter((c) => c.kind === "CONTINUITY");
    expect(calls).toHaveLength(1);
    expect(calls[0].images).toHaveLength(4);
    expect(calls[0].prompt).toContain("one Miami morning, about 8:30-10:30 AM");
    expect(calls[0].prompt).toMatch(/morning→sunset→dusk→night/);
    for (const c of ["same_person", "outfit", "jewelry", "hair", "time_of_day", "lighting_progression", "location_progression", "recurring_props", "unwanted_text_signage", "story_coherence"]) expect(calls[0].prompt).toContain(c);
    const rows = await contRows(r);
    expect(rows.map((x) => `${x.method}:${x.status}`).sort()).toEqual(["prompt_rules:PASS", "vision_model:PASS"]);
    expect(rows.every((x) => x.assetId === null && x.attemptId)).toBe(true);
    expect(rows.find((x) => x.method === "vision_model")!.inspectedImage).toBe(true);
  });
  it("a time-of-day drift (morning → night) is a HARD_FAIL that blocks approval and names the frame", async () => {
    const r = new FileRepo(null);
    const out = await make(r, mkDeps({ vision: vision({ CONTINUITY: [contWith({ time_of_day: { verdict: "HARD_FAIL", note: "frame 5 is night with street lights", frames: [5] } })] }) }), 3);
    const row = (await contRows(r)).find((x) => x.method === "vision_model")!;
    expect(row.status).toBe("HARD_FAIL");
    expect(row.findings[0].message).toMatch(/time_of_day.*frame 5.*\(frame 5\)/);
    expect(out.productions[0].status).toBe("RAW"); // HARD_FAIL: regenerate required, no approval created
    expect((await r.list("approvals")).filter((a) => a.state === "PENDING")).toHaveLength(0);
  });
  it("soft continuity problems are REVIEW, not HARD_FAIL; unverifiable checks never count as PASS", async () => {
    const r = new FileRepo(null);
    await make(r, mkDeps({ vision: vision({ CONTINUITY: [contWith({ jewelry: { verdict: "REVIEW", note: "pendant appears in frame 3", frames: [3] }, hair: { verdict: "UNCLEAR", note: "" } })] }) }), 3);
    const row = (await contRows(r)).find((x) => x.method === "vision_model")!;
    expect(row.status).toBe("REVIEW");
    expect(row.findings.map((f) => f.severity)).toEqual(["REVIEW", "REVIEW"]);
  });
  it("without a vision inspector the sequence is MANUAL_REVIEW_REQUIRED (never a fabricated PASS)", async () => {
    const r = new FileRepo(null);
    await make(r, mkDeps(), 3);
    const row = (await contRows(r)).find((x) => x.method === "manual")!;
    expect(row).toMatchObject({ status: "MANUAL_REVIEW_REQUIRED", inspectedImage: false });
  });
  it("is not applicable to a single image", async () => {
    const r = new FileRepo(null);
    await executeCreate(r, { talent: ["SIE"], format: "POST", concept: "coffee" }, mkDeps({ vision: vision({}) }));
    expect(await contRows(r)).toHaveLength(0);
  });
  it("retries a transient inspector failure for the sequence too, and flags the exhausted case as re-runnable", async () => {
    const r = new FileRepo(null);
    await make(r, mkDeps({ vision: vision({ CONTINUITY: [transient] }) }), 3);
    const row = (await contRows(r)).find((x) => x.method === "manual")!;
    expect(row.retry).toMatchObject({ attempts: 3, exhausted: true });
    expect(row.recommendation).toMatch(/re-run Continuity QA/i);
  });
  it("QA preview copies are downscaled valid PNGs (RAW is not touched)", () => {
    const raw = realPng(1024, 1536);
    const pv = qaPreview(raw, 640);
    const d = decodePng(pv.bytes);
    expect(d.width).toBe(640);
    expect(d.height).toBe(960);
    expect(inspectImage(raw).ok).toBe(true);
  });
});

// ---------- hard locks, negatives, shared continuity ----------
const miniBrief = (code: TalentCode): GenerationBriefData => {
  const ci = buildCanonicalIdentity(code);
  return {
    production: { code: `${code}-2026-001`, format: "CAROUSEL", platform: "instagram" }, creator: { code, name: ci.name }, identityVersion: ci.id, identityBlock: ci.providerBlock,
    hardLocks: ci.hardLocks.map((l) => ({ id: l.id, label: l.label })), negativeConstraints: [...new Set(ci.negativeConstraints)], references: [], referencePolicy: "", concept: "test", location: "somewhere", timeOfDay: "daytime",
    visualDirection: { outfit: "denim jacket", lighting: "soft daylight", palette: [], mood: "" }, continuity: ["c"], recentConsiderations: [], providerRequirements: { provider: "mock", model: null, size: "1024x1536", aspect: "2:3", count: 2 },
    shots: [{ n: 1, kind: "IMG", description: "a" }, { n: 2, kind: "IMG", description: "b" }],
    continuitySpec: { outfit: "denim jacket", hair: ci.core.hair, jewelry: ci.core.jewelry, bag: "none", props: [], timeWindow: "one continuous daytime window", lighting: "soft daylight", locationProgression: ["a", "b"], cameraStyle: "handheld" },
    revision: null,
  };
};
describe("prompt constraints (loaded from the canonical identity)", () => {
  it("states every canonical HARD lock explicitly in every frame prompt, for every creator", () => {
    for (const code of TALENT_CODES) {
      const ci = buildCanonicalIdentity(code);
      for (const p of buildPrompts(miniBrief(code), ci)) {
        expect(p.positive).toMatch(/HARD IDENTITY LOCKS/);
        for (const line of hardLockLines(ci)) expect(p.positive, `${code} frame ${p.shotN}: ${line}`).toContain(line);
      }
    }
  });
  it("Sienna's matching light green-gray eyes come from her canonical identity (not hard-coded in the pipeline)", () => {
    const ci = buildCanonicalIdentity("SIE");
    expect(hardLockLines(ci).join(" ")).toMatch(/Both eyes match: light green-gray/);
    for (const p of buildPrompts(miniBrief("SIE"), ci)) {
      expect(p.positive).toMatch(/Both eyes match: light green-gray/);
      expect(p.findings.filter((f) => f.severity === "HARD_FAIL")).toEqual([]); // quoting "No heterochromia" is not a violation
    }
    // generic code carries no creator facts: Vesper's prompt gets HER locks and none of Sienna's
    const ves = buildPrompts(miniBrief("VES"), buildCanonicalIdentity("VES"))[0];
    expect(ves.positive).not.toMatch(/light green-gray/);
  });
  it("propagates global negatives to every frame and keeps creator-specific ones identity-driven", () => {
    const sie = buildPrompts(miniBrief("SIE"), buildCanonicalIdentity("SIE"));
    for (const p of sie) {
      for (const g of GLOBAL_NEGATIVES) expect(p.negative).toContain(`NO ${g}`);
      expect(p.negative).toMatch(/NO generated text/);
      expect(p.negative).toMatch(/NO readable signage/);
      expect(p.negative).toMatch(/NO logos/);
      expect(p.negative).toMatch(/NO watermarks/);
      expect(p.negative).toMatch(/NO eye-color drift/);
      expect(p.negative).toMatch(/NO jewelry changes unless the scene asks/);
      expect(p.negative).toMatch(/NO heterochromia/); // from Sienna's identity forbidden list
      expect(p.positive).toMatch(/no generated text; no readable signage/);
    }
    const ves = buildPrompts(miniBrief("VES"), buildCanonicalIdentity("VES"))[0];
    expect(ves.negative).not.toMatch(/NO heterochromia/); // Vesper's canonical eyes differ by design — never banned globally
    expect(ves.negative).toMatch(/NO generated text/);
  });
  it("asks for a 4:5-safe composition", () => {
    expect(buildPrompts(miniBrief("SIE"), buildCanonicalIdentity("SIE"))[0].positive).toMatch(/centered 4:5 crop/);
  });
});

describe("shared continuity specification", () => {
  it("is established once, persisted in the Generation Brief, and inherited by every frame prompt", async () => {
    const r = new FileRepo(null);
    await make(r, mkDeps(), 5);
    const brief = (await r.list("generationBriefs"))[0];
    const spec = brief.data.continuitySpec!;
    const ci = buildCanonicalIdentity("SIE");
    expect(spec).toMatchObject({
      outfit: SIE_CREATIVE.outfit, hair: ci.core.hair, jewelry: ci.core.jewelry, bag: "the same cream canvas tote", props: ["clear iced coffee cup with a straw"],
      timeWindow: "one Miami morning, about 8:30-10:30 AM", lighting: SIE_CREATIVE.lighting, cameraStyle: "handheld iPhone feel",
    });
    expect(spec.locationProgression).toEqual(["studio mirror", "studio door", "palm-lined sidewalk", "coffee window", "sunlit step"]);
    const prompts = (await r.list("prompts")).sort((a, b) => a.shotN - b.shotN);
    expect(prompts).toHaveLength(5);
    for (const p of prompts) {
      for (const f of [spec.outfit, spec.hair, spec.jewelry, spec.bag, spec.timeWindow, spec.cameraStyle, "clear iced coffee cup with a straw"]) expect(p.positive, `frame ${p.shotN}`).toContain(f);
      expect(p.positive).toContain(`frame ${p.shotN} of 5`);
      expect(p.positive).toContain(spec.locationProgression[p.shotN - 1]);
      if (p.shotN > 1) expect(p.positive).toContain(`the previous frame was: ${spec.locationProgression[p.shotN - 2]}`);
    }
    // the deterministic prompt-inheritance QA row agrees
    expect((await r.list("qaResults")).find((q) => q.kind === "CONTINUITY" && q.method === "prompt_rules")).toMatchObject({ status: "PASS" });
  });
  it("derives a single-window default from the lighting when the operator gives none, and omits the spec for single images", async () => {
    const r = new FileRepo(null);
    await executeCreate(r, { talent: ["SIE"], format: "CAROUSEL", concept: "x", asset_count: 3, creative: { ...SIE_CREATIVE, continuity: undefined, shots: SIE_CREATIVE.shots.slice(0, 3) } }, mkDeps());
    const spec = (await r.list("generationBriefs"))[0].data.continuitySpec!;
    expect(spec.timeWindow).toMatch(/^one continuous morning/);
    expect(spec.timeWindow).toMatch(/no midday, sunset, dusk or night/);
    const r2 = new FileRepo(null);
    await executeCreate(r2, { talent: ["SIE"], format: "POST", concept: "x" }, mkDeps());
    expect((await r2.list("generationBriefs"))[0].data.continuitySpec).toBeUndefined();
  });
});

// ---------- PNG codec ----------
describe("PNG codec", () => {
  it("decodes every scanline filter and round-trips pixels exactly", () => {
    const src = gradient(37, 29, 4);
    for (const f of [0, 1, 2, 3, 4] as const) {
      const d = decodePng(encodePng(src, f));
      expect({ w: d.width, h: d.height, c: d.channels }).toEqual({ w: 37, h: 29, c: 4 });
      expect(Buffer.compare(Buffer.from(d.data), Buffer.from(src.data)), `filter ${f}`).toBe(0);
    }
  });
  it("crop copies pixels exactly (no scaling) and downscale keeps aspect ratio", () => {
    const src = gradient(20, 30);
    const c = cropRaster(src, 0, 3, 20, 25);
    expect(Buffer.compare(Buffer.from(c.data.subarray(0, 20 * 3)), Buffer.from(src.data.subarray(3 * 20 * 3, 4 * 20 * 3)))).toBe(0);
    const s = downscaleRaster(gradient(100, 150), 50);
    expect([s.width, s.height]).toEqual([50, 75]);
    expect(() => cropRaster(src, 0, 10, 20, 25)).toThrow();
  });
});

// ---------- RAW -> 4:5 derivative lineage ----------
describe("4:5 delivery derivatives", () => {
  it("crop geometry: 1024x1536 -> 1024x1280 (top-biased), wider images trim the sides, 4:5 is untouched", () => {
    expect(crop45Box(1024, 1536)).toEqual({ x: 0, y: 64, width: 1024, height: 1280 });
    expect(crop45Box(1000, 1000)).toEqual({ x: 100, y: 0, width: 800, height: 1000 });
    expect(crop45Box(800, 1000)).toEqual({ x: 0, y: 0, width: 800, height: 1000 });
  });
  it("creates a separate derived file with lineage; the RAW original is never overwritten; no distortion", async () => {
    const r = new FileRepo(null), d = mkDeps({ image: mockImageWithBytes(realPng(200, 300)) });
    await make(r, d, 2);
    const raw = (await r.list("assets")).sort((a, b) => a.seq - b.seq)[0];
    const rawBefore = d.storage.files.get(raw.storagePath!)!.slice();
    const assetCount = (await r.list("assets")).length;

    const { derivative, created } = await createDelivery45(r, d.storage, raw.id, { createdBy: "test" });
    expect(created).toBe(true);
    // lineage
    expect(derivative).toMatchObject({ sourceAssetId: raw.id, productionId: raw.productionId, kind: "DELIVERY_4X5", sourceSha256: raw.sha256, mime: "image/png", width: 200, height: 250 });
    expect(derivative.derivation).toMatchObject({ operation: "crop", aspect: "4:5", scaled: false, upscaled: false, sourceWidth: 200, sourceHeight: 300, sourceStoragePath: raw.storagePath, sourceAttemptNo: 1 });
    expect(derivative.filename).toMatch(/_IMG-01_4x5\.png$/);
    // RAW preserved: same path, same bytes, same record
    expect(derivative.storagePath).not.toBe(raw.storagePath);
    expect(Buffer.compare(Buffer.from(d.storage.files.get(raw.storagePath!)!), Buffer.from(rawBefore))).toBe(0);
    const rawAfter = (await r.get("assets", raw.id))!;
    expect({ path: rawAfter.storagePath, sha: rawAfter.sha256, bytes: rawAfter.bytes, w: rawAfter.width, h: rawAfter.height, status: rawAfter.status }).toEqual({ path: raw.storagePath, sha: raw.sha256, bytes: raw.bytes, w: 200, h: 300, status: raw.status });
    expect((await r.list("assets")).length).toBe(assetCount); // a delivery copy is not a new generated asset / frame
    // the derived pixels are an exact crop of the RAW pixels (proves nothing was stretched or resampled)
    const rawPx = decodePng(rawBefore), dPx = decodePng(d.storage.files.get(derivative.storagePath)!);
    const box = derivative.derivation.cropBox as { x: number; y: number; width: number; height: number };
    expect(Buffer.compare(Buffer.from(dPx.data), Buffer.from(cropRaster(rawPx, box.x, box.y, box.width, box.height).data))).toBe(0);
    expect(inspectImage(d.storage.files.get(derivative.storagePath)!).sha256).toBe(derivative.sha256);
    // idempotent: asking again returns the same derivative
    const again = await createDelivery45(r, d.storage, raw.id);
    expect(again.created).toBe(false);
    expect(again.derivative.id).toBe(derivative.id);
    expect(await r.list("assetDerivatives")).toHaveLength(1);
  });
  it("refuses assets without a file and non-PNG sources instead of guessing", async () => {
    const r = new FileRepo(null), d = mkDeps({ image: mockImageWithBytes(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])) });
    await make(r, d, 2);
    const a = (await r.list("assets"))[0];
    await expect(createDelivery45(r, d.storage, a.id)).rejects.toThrow();
    await expect(createDelivery45(r, d.storage, "missing")).rejects.toThrow(/not found/i);
  });
});

export type { QaResult };
