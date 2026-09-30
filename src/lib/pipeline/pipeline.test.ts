import { describe, expect, it } from "vitest";
import { FileRepo } from "@/lib/db/file-store";
import { TABLE_NAMES } from "@/lib/db/records";
import { mockImage, mockImageWithBytes, mockVideo } from "@/lib/providers/mock";
import { resolveImageProvider, providerStatus } from "@/lib/providers";
import { openaiImage } from "@/lib/providers/openai";
import { ProviderError } from "@/lib/providers/types";
import type { StorageProvider } from "@/lib/providers/types";
import { executeCreate, retryAsset, submitReelVideo, type Deps } from "@/lib/orchestrator/execute";
import { decide, approvalBlockers } from "@/lib/orchestrator/approvals";
import { buildCanonicalIdentity, identityHash, IDENTITY_VERSION } from "@/lib/identity/canonical";
import { identityPromptFindings } from "@/lib/agents/identity";
import { ensureIdentities, loadIdentity } from "@/lib/identity/service";
import { archiveReference, loadReferences, promoteGeneratedAsset, selectReferences, setMaster, uploadReference, ReferenceError } from "@/lib/references/service";
import { inspectImage } from "@/lib/media/inspect";
import { regenerateProduction } from "./revise";
import { completeAttempt } from "@/lib/orchestrator/execute";
import { evaluateContent } from "./content";
import type { VisionInspector } from "./qa";
import { ROSTER } from "@/lib/talent/roster";

import { pngBytes } from "@/test/png";
const memStore = (): StorageProvider & { files: Map<string, Uint8Array> } => {
  const files = new Map<string, Uint8Array>();
  return { files, async save(p, bytes) { files.set(p, bytes); return p; }, async read(p) { const b = files.get(p); return b ? { bytes: b, mime: "image/png" } : null; } };
};
const mkDeps = (o: Partial<Deps> = {}): Deps & { storage: ReturnType<typeof memStore> } => ({ image: mockImage, video: mockVideo, storage: memStore(), origin: "demo", ...o }) as never;
const fresh = () => new FileRepo(null);
const enableDisclosure = async (r: FileRepo, codes: string[]) => { for (const c of codes) await r.insert("launchStates", { talent: c as never, accountCreated: false, handle: null, bioDone: false, aiDisclosure: true, profilePicture: false, masterFace: false, referencesDone: false, initialContent: false, approved: false }); };

/** Vision inspector stub: answers every lock/check PASS except the ones listed. */
const vision = (opts: { hardFail?: string[]; review?: string[]; techHard?: string[]; unusable?: boolean } = {}): VisionInspector & { calls: number } => {
  const fn = (async (req) => {
    fn.calls++;
    if (opts.unusable) return { text: "not json at all", provider: "gemini", model: "gemini-test", error: null };
    if (req.kind === "IDENTITY") {
      const ids = [...req.prompt.matchAll(/^- (\S+) \(/gm)].map((m) => m[1]);
      return { text: JSON.stringify({ locks: ids.map((id) => ({ id, verdict: opts.hardFail?.includes(id) ? "HARD_FAIL" : opts.review?.includes(id) ? "REVIEW" : "PASS", note: "checked" })) }), provider: "gemini", model: "gemini-test", error: null };
    }
    const checks = ["anatomy", "hands", "objects", "background_geometry", "reflections", "unwanted_text", "unwanted_logos", "generation_artifacts", "camera_plausibility", "lighting_plausibility"];
    return { text: JSON.stringify({ checks: checks.map((id) => ({ id, verdict: opts.techHard?.includes(id) ? "HARD_FAIL" : "PASS" })) }), provider: "gemini", model: "gemini-test", error: null };
  }) as VisionInspector & { calls: number };
  fn.calls = 0;
  return fn;
};

describe("canonical identity architecture", () => {
  it("versioned ids, stable hash, structured categories", () => {
    const ci = buildCanonicalIdentity("SIE");
    expect(ci.id).toBe("SIE-IDENTITY-v1.0");
    expect(identityHash(ci)).toBe(identityHash(buildCanonicalIdentity("SIE")));
    for (const k of ["core", "hardLocks", "softLocks", "creativeVariables", "negativeConstraints", "visualLanguage", "personalityVoice", "contentUniverse", "qaRules", "providerBlock", "referenceHierarchy"]) expect(ci, k).toHaveProperty(k);
    expect(ci.referenceHierarchy[0]).toMatchObject({ type: "MASTER_FACE", authority: "MASTER", rank: 100 });
    expect(ROSTER.map((t) => buildCanonicalIdentity(t.code).id)).toEqual(["SIE-IDENTITY-v1.0", "ALE-IDENTITY-v1.0", "MIL-IDENTITY-v1.0", "VES-IDENTITY-v1.0", "ZOE-IDENTITY-v1.0", "SKY-IDENTITY-v1.0"]);
  });
  it("creator-specific hard locks come from identity data", () => {
    const ids = (c: Parameters<typeof buildCanonicalIdentity>[0]) => buildCanonicalIdentity(c).hardLocks.map((l) => l.id);
    expect(ids("VES")).toEqual(expect.arrayContaining(["VES-HETERO", "VES-SCAR"]));
    expect(ids("ZOE")).toEqual(expect.arrayContaining(["ZOE-EYES", "ZOE-NOSTRIL"]));
    expect(ids("SKY")).toContain("SKY-MARK");
    expect(ids("SIE")).toContain("SIE-EYES-MATCH");
    const ves = buildCanonicalIdentity("VES").hardLocks.find((l) => l.id === "VES-HETERO")!;
    expect(ves.visualCheck).toMatch(/LEFT side of the image is GREEN/);
    expect(buildCanonicalIdentity("SIE").hardLocks.find((l) => l.id === "SIE-EYES-MATCH")!.description).toMatch(/No heterochromia/);
  });
  it("prompt severity: hard lock violation = HARD_FAIL, missing signature jewelry = REVIEW", () => {
    const base = buildCanonicalIdentity("VES").providerBlock;
    expect(identityPromptFindings("VES", base)).toEqual([]);
    const noHetero = base.replace(/heterochromia: image-left eye emerald green, image-right eye icy blue-gray;/, "");
    expect(identityPromptFindings("VES", noHetero).some((f) => f.severity === "HARD_FAIL")).toBe(true);
    const noSilver = base.replace("silver jewelry only", "jewelry");
    const f = identityPromptFindings("VES", noSilver);
    expect(f.length).toBeGreaterThan(0);
    expect(f.every((x) => x.severity === "REVIEW")).toBe(true);
    expect(identityPromptFindings("SIE", buildCanonicalIdentity("SIE").providerBlock + " heterochromia").some((x) => x.severity === "HARD_FAIL")).toBe(true);
    expect(identityPromptFindings("ZOE", buildCanonicalIdentity("ZOE").providerBlock.replace("gold stud in LEFT nostril", "gold stud in right nostril")).some((x) => x.lockId === "ZOE-NOSTRIL" && x.severity === "HARD_FAIL")).toBe(true);
  });
  it("stored snapshots are immutable and productions record the version used", async () => {
    const r = fresh();
    const recs = await ensureIdentities(r);
    expect(recs).toHaveLength(6);
    expect((await ensureIdentities(r))).toHaveLength(6); // idempotent, no duplicates
    const l = await loadIdentity(r, "SIE");
    expect(l).toMatchObject({ identityId: "SIE-IDENTITY-v1.0", version: IDENTITY_VERSION, drift: false });
    await executeCreate(r, { talent: ["SIE"], format: "POST", concept: "beach" }, mkDeps());
    const [p] = await r.list("productions");
    expect(p.identityVersion).toBe("SIE-IDENTITY-v1.0");
    expect(JSON.stringify(p)).not.toContain("green-gray"); // facts are not duplicated into production records
  });
});

describe("canonical reference library", () => {
  it("master = highest authority; supporting refs; one master; replace/archive/setMaster", async () => {
    const r = fresh(), st = memStore();
    const master = await uploadReference(r, st, { talent: "SIE", type: "MASTER_FACE", bytes: pngBytes(800, 800), filename: "m.png" });
    expect(master).toMatchObject({ authority: "MASTER", identityVersion: "SIE-IDENTITY-v1.0", status: "ACTIVE", source: "upload" });
    const front = await uploadReference(r, st, { talent: "SIE", type: "FACE_FRONT", bytes: pngBytes(800, 800), filename: "f.png" });
    expect(front.authority).toBe("SUPPORTING");
    await expect(uploadReference(r, st, { talent: "SIE", type: "MASTER_FACE", bytes: pngBytes(800, 800), filename: "m2.png" })).rejects.toThrow(/master face already exists/);
    const m2 = await uploadReference(r, st, { talent: "SIE", type: "MASTER_FACE", bytes: pngBytes(900, 900), filename: "m2.png", replaceId: master.id });
    expect((await r.get("referenceAssets", master.id))).toMatchObject({ status: "ARCHIVED", replacedById: m2.id });
    await setMaster(r, front.id);
    expect(await r.get("referenceAssets", front.id)).toMatchObject({ referenceType: "MASTER_FACE", authority: "MASTER" });
    expect(await r.get("referenceAssets", m2.id)).toMatchObject({ referenceType: "FACE_FRONT", authority: "SUPPORTING", status: "ACTIVE" });
    const active = await loadReferences(r, "SIE");
    expect(active[0].id).toBe(front.id); // master first
    expect(active.filter((x) => x.referenceType === "MASTER_FACE")).toHaveLength(1);
    await archiveReference(r, m2.id);
    expect((await loadReferences(r, "SIE")).map((x) => x.id)).toEqual([front.id]);
  });
  it("rejects non-images and oversized files", async () => {
    const r = fresh(), st = memStore();
    await expect(uploadReference(r, st, { talent: "SIE", type: "FACE_FRONT", bytes: new TextEncoder().encode("hello"), filename: "x.png" })).rejects.toThrow(ReferenceError);
    expect(inspectImage(new Uint8Array(0)).ok).toBe(false);
    expect(inspectImage(pngBytes(10, 10)).ok).toBe(true);
    expect(await r.list("referenceAssets")).toHaveLength(0);
  });
  it("selects master first then shot-relevant supporting references", async () => {
    const r = fresh(), st = memStore();
    await uploadReference(r, st, { talent: "SIE", type: "FULL_BODY", bytes: pngBytes(800, 1200), filename: "fb.png" });
    await uploadReference(r, st, { talent: "SIE", type: "MASTER_FACE", bytes: pngBytes(800, 800), filename: "m.png" });
    await uploadReference(r, st, { talent: "SIE", type: "FACE_FRONT", bytes: pngBytes(800, 800), filename: "f.png" });
    const refs = await loadReferences(r, "SIE");
    expect(selectReferences(refs, { description: "walking / full-body shot" }).map((x) => x.referenceType)).toEqual(["MASTER_FACE", "FULL_BODY", "FACE_FRONT"]);
  });
  it("GENERATED ASSETS NEVER BECOME REFERENCES AUTOMATICALLY — only explicit, noted promotion of an approved asset", async () => {
    const r = fresh(), png = pngBytes();
    const deps = mkDeps({ image: mockImageWithBytes(png) });
    await enableDisclosure(r, ["SIE"]);
    await executeCreate(r, { talent: ["SIE"], format: "POST", concept: "beach" }, deps);
    const [ap] = await r.list("approvals");
    await decide(r, ap.id, "APPROVED", "good");
    expect(await r.list("referenceAssets")).toHaveLength(0); // full pipeline + approval created none
    const [asset] = await r.list("assets");
    expect(asset).toMatchObject({ isReference: false, approval: "APPROVED" });
    await expect(promoteGeneratedAsset(r, deps.storage, asset.id, "NATURAL_CANDID", "op", "")).rejects.toThrow(/note/);
    const ref = await promoteGeneratedAsset(r, deps.storage, asset.id, "NATURAL_CANDID", "christian", "Approved natural candid; matches master");
    expect(ref).toMatchObject({ source: "promoted_from_generated", sourceAssetId: asset.id, authority: "SUPPORTING", createdBy: "christian" });
    expect((await r.get("assets", asset.id))!.isReference).toBe(false);
    // unapproved / file-less assets cannot be promoted
    await executeCreate(r, { talent: ["SIE"], format: "POST", concept: "cafe" }, deps);
    const other = (await r.list("assets")).find((a) => a.approval !== "APPROVED")!;
    await expect(promoteGeneratedAsset(r, deps.storage, other.id, "NATURAL_CANDID", "op", "why")).rejects.toThrow(/approved/);
    const mockAsset = mkDeps();
    const r2 = fresh(); await enableDisclosure(r2, ["ZOE"]);
    await executeCreate(r2, { talent: ["ZOE"], format: "POST", concept: "matcha" }, mockAsset);
    await decide(r2, (await r2.list("approvals"))[0].id, "APPROVED");
    await expect(promoteGeneratedAsset(r2, mockAsset.storage, (await r2.list("assets"))[0].id, "NATURAL_CANDID", "op", "why")).rejects.toThrow(/no image file/);
  });
});

describe("generation brief, attempts, jobs, lineage", () => {
  it("persists the brief and links identity version, references, prompts, assets and jobs", async () => {
    const r = fresh(), st = memStore();
    const master = await uploadReference(r, st, { talent: "SIE", type: "MASTER_FACE", bytes: pngBytes(800, 800), filename: "m.png" });
    const deps = mkDeps({ image: mockImageWithBytes(pngBytes()), storage: st });
    await executeCreate(r, { talent: ["SIE"], format: "CAROUSEL", concept: "Pilates to coffee run", asset_count: 5 }, deps);
    const [p] = await r.list("productions");
    const [brief] = await r.list("generationBriefs");
    expect(brief).toMatchObject({ productionId: p.id, version: 1, identityVersion: "SIE-IDENTITY-v1.0", referenceIds: [master.id] });
    expect(brief.data.shots).toHaveLength(5);
    expect(brief.data.hardLocks.map((l) => l.id)).toContain("SIE-EYES-MATCH");
    expect(brief.data.references[0]).toMatchObject({ id: master.id, authority: "MASTER" });
    const [attempt] = await r.list("generationAttempts");
    expect(attempt).toMatchObject({ attemptNo: 1, briefId: brief.id, trigger: "initial" });
    const prompts = await r.list("prompts");
    expect(prompts).toHaveLength(5);
    expect(prompts.every((x) => x.briefId === brief.id && x.attemptId === attempt.id)).toBe(true);
    expect(prompts[0].positive).toMatch(/canonical reference images/);
    expect(prompts[0].positive.length).toBeLessThan(1400); // compact, not a pasted biography
    const assets = await r.list("assets");
    const jobs = await r.list("providerJobs");
    expect(assets).toHaveLength(5);
    for (const a of assets) {
      expect(a).toMatchObject({ attemptId: attempt.id, attemptNo: 1, briefId: brief.id, identityVersion: "SIE-IDENTITY-v1.0", isReference: false, current: true, status: "RAW", model: "mock-image-bytes", width: 1024, height: 1536 });
      expect(a.referenceIds).toEqual([master.id]);
      const j = jobs.find((x) => x.id === a.generationJobId)!;
      expect(j).toMatchObject({ state: "SUCCEEDED", attemptId: attempt.id, briefId: brief.id, retryCount: 0, provider: "mock", failureCategory: null });
      expect(j.startedAt).toBeTruthy(); expect(j.finishedAt).toBeTruthy();
      expect(deps.storage.files.has(a.storagePath!)).toBe(true);
    }
  });
  it("a production existing is not an image existing: failed jobs record category; retry links to the failed job", async () => {
    const r = fresh();
    const deps = mkDeps({ image: mockImageWithBytes(pngBytes(), { failShots: [2] }) });
    const res = await executeCreate(r, { talent: ["ZOE"], format: "CAROUSEL", concept: "matcha", asset_count: 3 }, deps);
    expect(res.failures).toHaveLength(1);
    expect(res.productions[0].status).toBe("RAW"); // not REVIEW: an image is missing
    const failed = (await r.list("assets")).find((a) => a.status === "FAILED")!;
    const fj = (await r.list("providerJobs")).find((j) => j.assetId === failed.id)!;
    expect(fj).toMatchObject({ state: "FAILED", failureCategory: "provider_unavailable" });
    expect(fj.error).toMatch(/simulated/);
    await retryAsset(r, failed.id, { ...deps, image: mockImageWithBytes(pngBytes()) });
    const jobs = (await r.list("providerJobs")).filter((j) => j.assetId === failed.id);
    expect(jobs).toHaveLength(2);
    expect(jobs.find((j) => j.state === "SUCCEEDED")).toMatchObject({ retryCount: 1, retryOfJobId: fj.id });
    expect((await r.list("productions"))[0].status).toBe("REVIEW");
  });
});

describe("QA states are honest", () => {
  it("mock assets (no image) → MANUAL_REVIEW_REQUIRED, never PASS; still goes to human approval", async () => {
    const r = fresh();
    const res = await executeCreate(r, { talent: ["SIE"], format: "POST", concept: "beach" }, mkDeps());
    expect(res.productions[0].status).toBe("REVIEW");
    const [a] = await r.list("assets");
    expect(a.qaStatus).toBe("MANUAL_REVIEW_REQUIRED");
    const qa = await r.list("qaResults");
    const idv = qa.find((x) => x.kind === "IDENTITY" && x.assetId === a.id)!;
    expect(idv).toMatchObject({ method: "manual", status: "MANUAL_REVIEW_REQUIRED", inspectedImage: false });
    expect(idv.summary).toMatch(/NOT visually verified/);
    expect(qa.some((x) => x.inspectedImage)).toBe(false); // nothing claims to have seen an image
    expect(qa.find((x) => x.kind === "IDENTITY" && x.method === "prompt_rules")!.summary).toMatch(/PROMPT, not the image/);
  });
  it("real file, no vision inspector → file inspection is real, visual checks are manual", async () => {
    const r = fresh();
    await executeCreate(r, { talent: ["SIE"], format: "POST", concept: "beach" }, mkDeps({ image: mockImageWithBytes(pngBytes()) }));
    const qa = await r.list("qaResults");
    expect(qa.find((x) => x.method === "file_inspection")).toMatchObject({ status: "PASS", inspectedImage: false });
    expect(qa.filter((x) => x.method === "manual").length).toBe(2); // identity + technical visual
    expect((await r.list("assets"))[0].qaStatus).toBe("MANUAL_REVIEW_REQUIRED");
  });
  it("vision inspector that verifies all locks → PASS; unusable output → manual review (not PASS)", async () => {
    const r = fresh(), v = vision();
    await executeCreate(r, { talent: ["VES"], format: "POST", concept: "rooftop" }, mkDeps({ image: mockImageWithBytes(pngBytes()), vision: v }));
    expect((await r.list("assets"))[0].qaStatus).toBe("PASS"); // only reachable when an inspector really verified identity + technical
    const qa = await r.list("qaResults");
    expect(qa.filter((x) => x.method === "vision_model").every((x) => x.status === "PASS" && x.inspectedImage)).toBe(true);
    expect(v.calls).toBe(2);
    const r2 = fresh();
    await executeCreate(r2, { talent: ["VES"], format: "POST", concept: "rooftop" }, mkDeps({ image: mockImageWithBytes(pngBytes()), vision: vision({ unusable: true }) }));
    expect((await r2.list("assets"))[0].qaStatus).toBe("MANUAL_REVIEW_REQUIRED");
    expect((await r2.list("qaResults")).some((x) => x.inspectedImage)).toBe(false);
  });
  it("HARD_FAIL (Vesper eye orientation) blocks approval; creative differences do not fail", async () => {
    const r = fresh();
    await enableDisclosure(r, ["VES"]);
    const deps = mkDeps({ image: mockImageWithBytes(pngBytes()), vision: vision({ hardFail: ["VES-HETERO"] }) });
    const res = await executeCreate(r, { talent: ["VES"], format: "POST", concept: "rooftop party" }, deps);
    expect(res.productions[0].status).toBe("RAW");
    expect((await r.list("assets"))[0].qaStatus).toBe("HARD_FAIL");
    expect((await r.list("generationAttempts"))[0].status).toBe("HARD_FAIL");
    expect(await r.list("approvals")).toHaveLength(0); // never reaches human approval
    const f = (await r.list("qaResults")).find((x) => x.status === "HARD_FAIL")!;
    expect(f.findings[0]).toMatchObject({ lockId: "VES-HETERO", severity: "HARD_FAIL" });
  });
  it("soft-lock violation (missing jewelry) is REVIEW, not a rejection", async () => {
    const r = fresh();
    await executeCreate(r, { talent: ["SIE"], format: "POST", concept: "beach" }, mkDeps({ image: mockImageWithBytes(pngBytes()), vision: vision({ review: ["SIE-GOLD-HOOPS"] }) }));
    expect((await r.list("assets"))[0].qaStatus).toBe("REVIEW");
    expect((await r.list("productions"))[0].status).toBe("REVIEW");
  });
  it("content QA uses real history: third rooftop among previous five → REVIEW with recommendation", async () => {
    const r = fresh();
    const mk = async (i: number, loc: string, concept: string) => r.insert("productions", { code: `SIE-2026-0${i}`, talent: ["SIE"], scope: "SOLO", contentType: "POST", platform: "instagram", concept, status: "APPROVED", campaignId: null, storylineId: null, qaNotes: [], costUsd: 0, identityVersion: null, currentAttemptId: null,
      brief: { hook: "", location: loc, outfit: "", lighting: "", storyBeat: "", shots: [] } });
    await mk(1, "Miami beach", "beach day"); await mk(2, "Brickell rooftop", "rooftop night"); await mk(3, "boutique hotel", "hotel"); await mk(4, "Brickell rooftop", "rooftop drinks"); await mk(5, "Pilates studio", "pilates");
    await new Promise((x) => setTimeout(x, 5));
    const cur = await mk(6, "Brickell rooftop", "rooftop sunset");
    const o = await evaluateContent(r, cur);
    expect(o.status).toBe("REVIEW");
    expect(o.summary).toMatch(/third rooftop production among Sienna's previous 5 productions/);
    expect(o.findings.some((f) => /Brickell rooftop.* 2 times/.test(f.message))).toBe(true);
    expect(o.recommendation).toMatch(/schedule it later/);
    const clean = await mk(7, "coffee shop", "coffee run");
    expect((await evaluateContent(fresh(), clean)).status).toBe("PASS");
  });
});

describe("revision loop", () => {
  it("HARD_FAIL → regenerate creates attempt 2 in the same production, preserves attempt 1, feeds QA feedback, then PASS → approval", async () => {
    const r = fresh();
    await enableDisclosure(r, ["VES"]);
    const storage = memStore();
    const fail = mkDeps({ image: mockImageWithBytes(pngBytes()), storage, vision: vision({ hardFail: ["VES-HETERO"] }) });
    await executeCreate(r, { talent: ["VES"], format: "POST", concept: "rooftop party" }, fail);
    const [p] = await r.list("productions");
    const a1 = (await r.list("assets"))[0];
    const good = mkDeps({ image: mockImageWithBytes(pngBytes()), storage, vision: vision() });
    const res = await regenerateProduction(r, good, p.id, { notes: "keep the eyes exactly as in the master" });
    expect(res.attempt.attemptNo).toBe(2);
    expect(res.attempt).toMatchObject({ trigger: "regenerate", parentAttemptId: expect.any(String) });
    await completeAttempt(r, good, p.id, res.attempt.id);
    expect(await r.list("productions")).toHaveLength(1); // same production
    const attempts = (await r.list("generationAttempts")).sort((a, b) => a.attemptNo - b.attemptNo);
    expect(attempts.map((a) => a.attemptNo)).toEqual([1, 2]);
    expect(attempts[0].status).toBe("HARD_FAIL"); // preserved
    expect(attempts[1].status).not.toBe("HARD_FAIL");
    const assets = await r.list("assets");
    expect(assets).toHaveLength(2); // failed asset NOT overwritten
    expect(assets.find((a) => a.id === a1.id)).toMatchObject({ current: false, qaStatus: "HARD_FAIL", attemptNo: 1 });
    expect(assets.find((a) => a.attemptNo === 2)!.current).toBe(true);
    const briefs = (await r.list("generationBriefs")).sort((a, b) => a.version - b.version);
    expect(briefs[1].data.revision!.feedback.join(" ")).toMatch(/VES-HETERO/);
    expect(briefs[1].data.revision!.feedback.join(" ")).toMatch(/keep the eyes exactly/);
    const p2 = (await r.list("prompts")).find((x) => x.attemptId === attempts[1].id)!;
    expect(p2.positive).toMatch(/Identity corrections for this revision: .*image-LEFT eye = emerald green/); // positive rule restated
    expect(p2.negative).toMatch(/Revision notes from review/);
    expect(p2.qa.ok).toBe(true);
    expect((await r.get("productions", p.id))!.status).toBe("REVIEW");
    expect((await r.list("approvals")).filter((a) => a.state === "PENDING")).toHaveLength(1);
  });
  it("only hard-failed shots regenerate by default; approved productions cannot be regenerated", async () => {
    const r = fresh(); await enableDisclosure(r, ["SIE"]);
    const deps = mkDeps({ image: mockImageWithBytes(pngBytes(), { failShots: [2] }) });
    await executeCreate(r, { talent: ["SIE"], format: "CAROUSEL", concept: "coffee", asset_count: 3 }, deps);
    const [p] = await r.list("productions");
    const res = await regenerateProduction(r, { ...deps, image: mockImageWithBytes(pngBytes()) }, p.id);
    expect(res.shots).toEqual([2]);
    await completeAttempt(r, { ...deps, image: mockImage }, p.id, res.attempt.id);
    await decide(r, (await r.list("approvals")).find((a) => a.state === "PENDING")!.id, "APPROVED");
    await expect(regenerateProduction(r, deps, p.id)).rejects.toThrow(/not allowed after approval/);
  });
});

describe("human approval gate", () => {
  it("blocks while HARD_FAIL/failed; approving only the selected assets; only approved assets are eligible", async () => {
    const r = fresh(); await enableDisclosure(r, ["SIE"]);
    await executeCreate(r, { talent: ["SIE"], format: "CAROUSEL", concept: "coffee", asset_count: 3 }, mkDeps());
    const [ap] = await r.list("approvals");
    const assets = (await r.list("assets")).sort((a, b) => a.seq - b.seq);
    await expect(decide(r, ap.id, "APPROVED", "", "op", { selectedAssetIds: [] })).rejects.toThrow(/at least one/);
    await decide(r, ap.id, "APPROVED", "use 1 and 3", "christian", { selectedAssetIds: [assets[0].id, assets[2].id] });
    const after = (await r.list("assets")).sort((a, b) => a.seq - b.seq);
    expect(after.map((a) => a.approval)).toEqual(["APPROVED", "PENDING", "APPROVED"]);
    expect(after[1].status).toBe("RAW"); // not eligible
    const done = (await r.get("approvals", ap.id))!;
    expect(done).toMatchObject({ state: "APPROVED", decidedBy: "christian", notes: "use 1 and 3" });
    expect(done.selectedAssetIds.sort()).toEqual([assets[0].id, assets[2].id].sort());
    expect(done.decidedAt).toBeTruthy();
    expect(await r.list("calendarEntries")).toHaveLength(1);
  });
  it("HARD_FAIL asset blocks approval even if a pending approval exists", async () => {
    const r = fresh(); await enableDisclosure(r, ["SIE"]);
    await executeCreate(r, { talent: ["SIE"], format: "POST", concept: "beach" }, mkDeps());
    const [a] = await r.list("assets"); await r.update("assets", a.id, { qaStatus: "HARD_FAIL" });
    expect((await approvalBlockers(r, a.productionId)).join()).toMatch(/HARD_FAILED/);
  });
  it("reel: video stage completes and needs human review (video is not inspected)", async () => {
    const r = fresh(); const d = mkDeps();
    await executeCreate(r, { talent: ["VES"], format: "REEL", concept: "rooftop party" }, d);
    const [p] = await r.list("productions");
    expect(p.status).toBe("RAW");
    await submitReelVideo(r, p.id, d);
    expect((await r.list("assets")).find((a) => a.kind === "REEL")!.qaStatus).toBe("MANUAL_REVIEW_REQUIRED");
    expect((await r.get("productions", p.id))!.status).toBe("REVIEW");
  });
});

describe("OpenAI provider behaviour", () => {
  const okBody = { data: [{ b64_json: Buffer.from(pngBytes()).toString("base64") }], usage: { total_tokens: 10 } };
  it("uses generations without references and edits (multipart) with references; key only in header", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const f = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify(okBody), { status: 200 }); }) as never;
    const p = openaiImage("SECRETKEY123", "gpt-image-1", f);
    const r1 = await p.generate({ productionCode: "SIE-2026-001", shotN: 1, prompt: "x", negative: "y", talent: "SIE", references: [] });
    expect(calls[0].url).toBe("https://api.openai.com/v1/images/generations");
    expect(r1.metadata).toMatchObject({ endpoint: "generations" });
    await p.generate({ productionCode: "SIE-2026-001", shotN: 1, prompt: "x", negative: "y", talent: "SIE", references: [{ bytes: pngBytes(8, 8), mime: "image/png", type: "MASTER_FACE" }] });
    expect(calls[1].url).toBe("https://api.openai.com/v1/images/edits");
    expect(calls[1].init.body).toBeInstanceOf(FormData);
    expect((calls[1].init.body as FormData).getAll("image[]")).toHaveLength(1);
    for (const c of calls) { expect(c.url).not.toContain("SECRETKEY123"); expect((c.init.headers as Record<string, string>).authorization).toBe("Bearer SECRETKEY123"); }
    expect(r1.bytes!.length).toBeGreaterThan(0);
  });
  it("maps failures to categories and never leaks the key or upstream body", async () => {
    const run = async (status: number, body: unknown = { error: { message: "SECRETKEY123 echoed", code: "x" } }) => { try { await openaiImage("SECRETKEY123", "m", (async () => new Response(JSON.stringify(body), { status })) as never).generate({ productionCode: "c", shotN: 1, prompt: "p", negative: "", talent: "SIE", references: [] }); } catch (e) { return e as ProviderError; } throw new Error("expected failure"); };
    expect((await run(429)).category).toBe("rate_limited");
    const quota = await run(429, { error: { type: "insufficient_quota", code: "credit_balance_exhausted", message: "SECRETKEY123" } }); // seen live
    expect([quota.category, quota.retryable]).toEqual(["quota_exceeded", false]);
    expect((await run(401)).category).toBe("auth");
    expect((await run(400)).category).toBe("invalid_request");
    expect((await run(500)).category).toBe("provider_unavailable");
    const cp = await run(400, { error: { code: "content_policy_violation", message: "SECRETKEY123" } });
    expect([cp.category, cp.retryable]).toEqual(["content_policy", false]);
    for (const s of [429, 401, 400, 500]) expect((await run(s)).message).not.toContain("SECRETKEY123");
  });
  it("IMAGE_PROVIDER=openai without a key is UNAVAILABLE (never a silent mock); default/no key = mock mode", async () => {
    expect(resolveImageProvider({} as never).mode).toBe("mock");
    const u = resolveImageProvider({ IMAGE_PROVIDER: "openai" } as never);
    expect(u.mode).toBe("unavailable");
    expect(resolveImageProvider({ IMAGE_PROVIDER: "openai", OPENAI_API_KEY: "k" } as never).mode).toBe("openai");
    const r = fresh();
    const res = await executeCreate(r, { talent: ["SIE"], format: "POST", concept: "beach" }, mkDeps({ image: u.provider }));
    expect(res.productions[0].status).toBe("RAW");
    const job = (await r.list("providerJobs"))[0];
    expect(job).toMatchObject({ state: "FAILED", failureCategory: "provider_unavailable", provider: "openai" });
    expect((await r.list("assets"))[0].status).toBe("FAILED");
  });
  it("no secret leakage: keys never appear in persisted records, events or provider status", async () => {
    const r = fresh();
    const key = "SECRETKEY123";
    const p = openaiImage(key, "gpt-image-1", (async () => new Response("{}", { status: 500 })) as never);
    await executeCreate(r, { talent: ["SIE"], format: "POST", concept: "beach" }, mkDeps({ image: p }));
    const dump = JSON.stringify(Object.fromEntries(await Promise.all(TABLE_NAMES.map(async (t) => [t, await r.list(t)]))));
    expect(dump).not.toContain(key);
    process.env.OPENAI_API_KEY = key;
    expect(JSON.stringify(providerStatus())).not.toContain(key);
    delete process.env.OPENAI_API_KEY;
  });
});
