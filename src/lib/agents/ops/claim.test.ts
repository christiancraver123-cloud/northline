import { describe, expect, it } from "vitest";
import { FileRepo } from "@/lib/db/file-store";
import { mockImage, mockImageWithBytes, mockVideo } from "@/lib/providers/mock";
import type { Deps } from "@/lib/orchestrator/execute";
import { ensureAgents, enqueue, snapshots, setModelPreference } from "./service";
import { createRouter } from "@/lib/llm/router";
import { mockLlm } from "@/lib/llm/mock";
import { processQueue, reclaimExpired } from "./worker";
import { submitCreate, submitRegenerate } from "./commands";
import { handleMessage } from "./chat";
import { pngBytes } from "@/test/png";
import type { Tables, TableName } from "@/lib/db/records";

class SlowRepo extends FileRepo {
  // Force both workers to read the same queue snapshot before either claims → guaranteed contention.
  async list<T extends TableName>(t: T, filter?: Partial<Tables[T]>) { const r = await super.list(t, filter); if (t === "agentTasks") await new Promise((x) => setTimeout(x, 8)); return r; }
}
const mem = () => { const files = new Map<string, Uint8Array>(); return { async save(p: string, b: Uint8Array) { files.set(p, b); return p; }, async read(p: string) { const b = files.get(p); return b ? { bytes: b, mime: "image/png" } : null; } }; };
const deps: Partial<Deps> = { image: mockImage, video: mockVideo, storage: mem() };

describe("safe task claiming (no duplicate execution)", () => {
  it("repo.claim is compare-and-set: exactly one caller wins", async () => {
    const r = new FileRepo(null);
    await ensureAgents(r);
    const t = await enqueue(r, { agentId: "CONTENT_STRATEGIST", kind: "strategist.concepts", title: "t", input: { talent: "SIE" }, talent: "SIE" });
    const results = await Promise.all([1, 2, 3, 4].map((w) => r.claim("agentTasks", t.id, { status: "QUEUED" }, { status: "RUNNING", claimedBy: `w${w}` })));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await r.get("agentTasks", t.id))!.claimedBy).toBe(results.find(Boolean)!.claimedBy);
  });
  it("two workers draining the same queue run every task exactly once", async () => {
    const r = new SlowRepo(null);
    await ensureAgents(r);
    const ids: string[] = [];
    for (let i = 0; i < 8; i++) ids.push((await enqueue(r, { agentId: i % 2 ? "CONTENT_STRATEGIST" : "CREATIVE_DIRECTOR", kind: i % 2 ? "strategist.concepts" : "director.concepts", title: `t${i}`, input: { talent: "SIE", count: 1 }, talent: "SIE" })).id);
    const [a, b] = await Promise.all([processQueue(r, { max: 20 }), processQueue(r, { max: 20 })]);
    const runs = await r.list("agentRuns");
    expect(runs).toHaveLength(8);
    expect(new Set(runs.map((x) => x.taskId)).size).toBe(8);
    expect(a.ran.length + b.ran.length).toBe(8);
    const tasks = await r.list("agentTasks");
    expect(tasks.every((t) => t.status === "COMPLETE" && t.attempts === 1 && t.claimedBy === null)).toBe(true);
  });
  it("two concurrent production requests with the same idempotency key create ONE production", async () => {
    const r = new SlowRepo(null);
    const req = { talent: ["SIE" as const], format: "POST" as const, concept: "beach" };
    await Promise.all([submitCreate(r, req, { deps, idempotencyKey: "n8n-exec-42" }), submitCreate(r, req, { deps, idempotencyKey: "n8n-exec-42" })]);
    expect(await r.list("productions")).toHaveLength(1);
    expect((await r.list("agentTasks")).filter((t) => t.kind === "production.create")).toHaveLength(1);
    // a different key is a different request
    await submitCreate(r, req, { deps, idempotencyKey: "n8n-exec-43" });
    expect(await r.list("productions")).toHaveLength(2);
  });
  it("expired lease: re-queues safe tasks, fails non-idempotent ones, gives up after max attempts", async () => {
    const r = new FileRepo(null);
    await ensureAgents(r);
    const past = new Date(Date.now() - 60_000).toISOString();
    const safe = await enqueue(r, { agentId: "CONTENT_STRATEGIST", kind: "strategist.concepts", title: "safe", input: { talent: "SIE" }, talent: "SIE" });
    const create = await enqueue(r, { agentId: "PRODUCTION_MANAGER", kind: "production.create", title: "create", input: {} });
    const tired = await enqueue(r, { agentId: "GROWTH_STRATEGIST", kind: "growth.recommendations", title: "tired" });
    await r.update("agentTasks", safe.id, { status: "RUNNING", claimedBy: "dead", leaseExpiresAt: past, attempts: 1 });
    await r.update("agentTasks", create.id, { status: "RUNNING", claimedBy: "dead", leaseExpiresAt: past, attempts: 1 });
    await r.update("agentTasks", tired.id, { status: "RUNNING", claimedBy: "dead", leaseExpiresAt: past, attempts: 3 });
    expect(await reclaimExpired(r)).toBe(3);
    expect((await r.get("agentTasks", safe.id))!).toMatchObject({ status: "QUEUED", claimedBy: null });
    expect((await r.get("agentTasks", create.id))!.status).toBe("FAILED");
    expect((await r.get("agentTasks", create.id))!.error).toMatch(/not auto-retried/);
    expect((await r.get("agentTasks", tired.id))!.status).toBe("FAILED");
    expect((await r.list("agentEvents")).filter((e) => e.kind === "TASK_LEASE_EXPIRED")).toHaveLength(3);
    await processQueue(r);
    expect((await r.get("agentTasks", safe.id))!.status).toBe("COMPLETE"); // recovered task then runs once
    expect((await r.list("agentRuns")).filter((x) => x.taskId === safe.id)).toHaveLength(1);
  });
  it("a live (unexpired) lease is never stolen", async () => {
    const r = new FileRepo(null);
    await ensureAgents(r);
    const t = await enqueue(r, { agentId: "CONTENT_STRATEGIST", kind: "strategist.concepts", title: "busy", input: { talent: "SIE" }, talent: "SIE" });
    await r.update("agentTasks", t.id, { status: "RUNNING", claimedBy: "alive", leaseExpiresAt: new Date(Date.now() + 600_000).toISOString(), attempts: 1 });
    expect(await reclaimExpired(r)).toBe(0);
    expect((await r.get("agentTasks", t.id))!.status).toBe("RUNNING");
  });
});

describe("first real production pipeline (Sienna carousel, end to end through agents)", () => {
  it("request → production → identity/reference load → brief → prompts → jobs → assets → QA tasks → approval", async () => {
    const r = new FileRepo(null);
    const d: Partial<Deps> = { image: mockImageWithBytes(pngBytes()), video: mockVideo, storage: mem() };
    // use the chat path the operator would use; inject deps via submitCreate's underlying worker opts
    const out = await submitCreate(r, { talent: ["SIE"], format: "CAROUSEL", concept: "Pilates to coffee run", asset_count: 5 }, { deps: d, origin: "demo" });
    expect(out.task.status).toBe("COMPLETE");
    const tasks = await r.list("agentTasks");
    const byKind = Object.fromEntries(tasks.map((t) => [t.kind, t]));
    for (const k of ["production.create", "identity_qa.attempt", "technical_qa.attempt", "content_qa.production", "continuity_qa.attempt", "production.finalize"]) expect(byKind[k]?.status, k).toBe("COMPLETE");
    expect(byKind["production.finalize"].dependsOn).toHaveLength(4); // finalize waits for all three QA tasks
    expect(byKind["identity_qa.attempt"].agentId).toBe("IDENTITY_QA");
    const [p] = await r.list("productions");
    expect(p).toMatchObject({ status: "REVIEW", identityVersion: "SIE-IDENTITY-v1.0" });
    expect(await r.list("generationBriefs")).toHaveLength(1);
    expect((await r.list("assets")).filter((a) => a.current)).toHaveLength(5);
    expect((await r.list("providerJobs")).every((j) => j.state === "SUCCEEDED")).toBe(true);
    expect((await r.list("approvals")).filter((a) => a.state === "PENDING")).toHaveLength(1);
    const qa = await r.list("qaResults");
    expect(qa.filter((x) => x.kind === "IDENTITY" && x.assetId)).toHaveLength(5);
    expect(qa.every((x) => x.inspectedImage === false)).toBe(true); // no inspector ran: nothing pretends otherwise
    expect((await snapshots(r)).find((s) => s.agent.code === "PRODUCTION_MANAGER")!.status).toBe("WAITING"); // waiting on the human
    const kinds = (await r.list("agentEvents")).map((e) => e.kind);
    for (const k of ["LOAD_IDENTITY", "GENERATION_BRIEF", "PROMPTS_BUILT", "ASSET_GENERATED", "MANUAL_REVIEW_REQUIRED", "WAITING_APPROVAL"]) expect(kinds, k).toContain(k);
  });
  it("chat: 'Create a Sienna Pilates to coffee carousel with 5 images' parses frames and runs the pipeline", async () => {
    const r = new FileRepo(null);
    const a = await handleMessage(r, "ORCHESTRATOR", "Create a Sienna Pilates to coffee carousel with 5 images.");
    expect(a.reply).toMatch(/SIE-\d{4}-001 — REVIEW/);
    expect((await r.list("assets"))).toHaveLength(5);
    expect((await r.list("generationBriefs"))[0].data.concept.toLowerCase()).toContain("pilates to coffee");
  });
  it("HARD_FAIL → agent-driven regenerate keeps lineage and re-runs the QA family", async () => {
    const r = new FileRepo(null);
    const storage = mem();
    let hard = true;
    const vision = async (req: { kind: string; prompt: string }) => {
      const ids = [...req.prompt.matchAll(/^- (\S+) \(/gm)].map((m) => m[1]);
      const checks = ["anatomy", "hands", "objects", "background_geometry", "reflections", "unwanted_text", "unwanted_logos", "generation_artifacts", "camera_plausibility", "lighting_plausibility"];
      return { text: req.kind === "IDENTITY" ? JSON.stringify({ locks: ids.map((id) => ({ id, verdict: hard && id === "SIE-EYES-MATCH" ? "HARD_FAIL" : "PASS" })) }) : JSON.stringify({ checks: checks.map((id) => ({ id, verdict: "PASS" })) }), provider: "gemini", model: "g", error: null };
    };
    const d = { image: mockImageWithBytes(pngBytes()), video: mockVideo, storage, vision } as Partial<Deps>;
    await submitCreate(r, { talent: ["SIE"], format: "POST", concept: "beach" }, { deps: d });
    // the production.create handler wires its own vision (router) — with no provider configured it reports manual review, so force the HARD_FAIL path via direct QA rows:
    const [p] = await r.list("productions");
    const [asset] = await r.list("assets");
    await r.update("assets", asset.id, { qaStatus: "HARD_FAIL" });
    await r.update("productions", p.id, { status: "RAW" });
    const [ap] = await r.list("approvals"); await r.update("approvals", ap.id, { state: "REVISION_REQUESTED" });
    hard = false;
    const t = await submitRegenerate(r, p.id, { notes: "eyes must match", deps: d });
    expect(t.status).toBe("COMPLETE");
    expect((await r.list("generationAttempts")).map((a) => a.attemptNo).sort()).toEqual([1, 2]);
    expect((await r.list("assets"))).toHaveLength(2);
    expect((await r.get("productions", p.id))!.status).toBe("REVIEW");
    expect((await r.list("agentTasks")).filter((x) => x.kind === "identity_qa.attempt")).toHaveLength(2);
  });
});

describe("image QA through the model router (identity-critical stays conservative)", () => {
  
  
  
  const reply = (p: string) => {
    if (p.includes('"locks"')) return JSON.stringify({ locks: [...p.matchAll(/^- (\S+) \(/gm)].map((m) => ({ id: m[1], verdict: "PASS" })) });
    return JSON.stringify({ checks: ["anatomy", "hands", "objects", "background_geometry", "reflections", "unwanted_text", "unwanted_logos", "generation_artifacts", "camera_plausibility", "lighting_plausibility"].map((id) => ({ id, verdict: "PASS" })) });
  };
  const mk = (calls: { prompt: string; model: string; images?: number }[]) => createRouter({ gemini: mockLlm({ name: "gemini", reply, calls }), openai: mockLlm({ name: "openai", configured: false }), mock: mockLlm({ configured: false }) });
  const d = (): Partial<Deps> => ({ image: mockImageWithBytes(pngBytes()), video: mockVideo, storage: mem() });

  it("default: Identity QA does NOT auto-route to a model (manual review), technical QA may use the configured vision model", async () => {
    const r = new FileRepo(null); const calls: { prompt: string; model: string; images?: number }[] = [];
    await submitCreate(r, { talent: ["SIE"], format: "POST", concept: "beach" }, { deps: d(), router: mk(calls) });
    const qa = await r.list("qaResults");
    expect(qa.find((x) => x.kind === "IDENTITY" && x.assetId)).toMatchObject({ method: "manual", status: "MANUAL_REVIEW_REQUIRED", inspectedImage: false });
    expect(qa.find((x) => x.kind === "TECHNICAL" && x.method === "vision_model")).toMatchObject({ status: "PASS", inspectedImage: true, provider: "gemini" });
    expect(calls.every((c) => !c.prompt.includes("identity lock"))).toBe(true);
    expect((await r.list("assets"))[0].qaStatus).toBe("MANUAL_REVIEW_REQUIRED");
  });
  it("operator sets Identity QA's provider explicitly → real visual identity check, images sent, recorded provider/model", async () => {
    const r = new FileRepo(null); const calls: { prompt: string; model: string; images?: number }[] = [];
    await ensureAgents(r);
    await setModelPreference(r, "IDENTITY_QA", { provider: "gemini", allowFallback: false });
    await submitCreate(r, { talent: ["SIE"], format: "POST", concept: "beach" }, { deps: d(), router: mk(calls) });
    const idv = (await r.list("qaResults")).find((x) => x.kind === "IDENTITY" && x.assetId)!;
    expect(idv).toMatchObject({ method: "vision_model", status: "PASS", inspectedImage: true, provider: "gemini" });
    expect(calls.some((c) => (c.images ?? 0) >= 1)).toBe(true);
    expect((await r.list("agentRuns")).find((x) => x.agentId === "IDENTITY_QA")).toMatchObject({ provider: "gemini" });
    expect((await r.list("assets"))[0].qaStatus).toBe("PASS");
  });
  it("Identity QA provider down + no fallback → manual review, never a silent switch or fake pass", async () => {
    const r = new FileRepo(null);
    await ensureAgents(r);
    await setModelPreference(r, "IDENTITY_QA", { provider: "gemini", allowFallback: false });
    const router = createRouter({ gemini: mockLlm({ name: "gemini", failWith: "rate_limited" }), openai: mockLlm({ name: "openai", reply }), mock: mockLlm({ configured: false }) });
    await submitCreate(r, { talent: ["SIE"], format: "POST", concept: "beach" }, { deps: d(), router });
    const idv = (await r.list("qaResults")).find((x) => x.kind === "IDENTITY" && x.assetId)!;
    expect(idv).toMatchObject({ method: "manual", status: "MANUAL_REVIEW_REQUIRED", inspectedImage: false });
    expect((await r.list("llmCalls")).filter((c) => c.agentId === "IDENTITY_QA").every((c) => c.provider === "gemini")).toBe(true); // openai was never used
  });
});
