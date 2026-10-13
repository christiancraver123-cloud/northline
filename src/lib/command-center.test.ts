// Command Center milestone: flags, mock publishing, insights, priority scoring, QA triad, read-only, secrets. No live calls.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileRepo } from "@/lib/db/file-store";
import { mockImageWithBytes, mockVideo } from "@/lib/providers/mock";
import type { StorageProvider } from "@/lib/providers/types";
import { executeCreate, type Deps } from "@/lib/orchestrator/execute";
import { decide } from "@/lib/orchestrator/approvals";
import { pngBytes } from "@/test/png";
import { flagViews, imageGenerationEnabled, instagramStatus, publishingMode } from "@/lib/flags";
import { publishAsset, publishBlockers, recordInsights, retryPublication, resolvePublisher, PublishError } from "@/lib/publishing/service";
import { mockInstagram } from "@/lib/publishing/provider";
import { DEFAULT_WEIGHTS, rankCreators, scoreCreator, weightsFromEnv, type PriorityInput } from "@/lib/priority";
import { qaTriad } from "@/lib/pipeline/qa-triad";
import { creatorOverviews, latestInsights } from "@/lib/ops/creators";
import type { QaResult } from "@/lib/db/records";

const memStore = (): StorageProvider => { const f = new Map<string, Uint8Array>(); return { async save(p, b) { f.set(p, b); return p; }, async read(p) { const b = f.get(p); return b ? { bytes: b, mime: "image/png" } : null; } }; };
const deps = (): Deps => ({ image: mockImageWithBytes(pngBytes()), video: mockVideo, storage: memStore(), origin: "demo" });
const DEV = { NODE_ENV: "development" } as Record<string, string>;

async function approvedAsset() {
  const repo = new FileRepo(null);
  await repo.insert("launchStates", { talent: "SIE", accountCreated: true, handle: "sienna.veyra", bioDone: true, aiDisclosure: true, profilePicture: true, masterFace: true, referencesDone: true, initialContent: false, approved: true });
  const r = await executeCreate(repo, { talent: ["SIE"], format: "POST", concept: "balcony coffee", asset_count: 1 }, deps());
  const prod = r.productions[0];
  const ap = (await repo.list("approvals", { productionId: prod.id }))[0];
  const asset = (await repo.list("assets", { productionId: prod.id })).find((a) => a.current)!;
  return { repo, prod, ap, asset };
}

let fetchSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => { fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => { throw new Error("network is not allowed in tests"); }); });
afterEach(() => { expect(fetchSpy).not.toHaveBeenCalled(); fetchSpy.mockRestore(); }); // no live Meta (or any) calls

describe("feature flags", () => {
  it("defaults: paid generation off, publishing mock in dev and off in production, Instagram blocked", () => {
    expect(imageGenerationEnabled({})).toBe(false);
    expect(imageGenerationEnabled({ NORTHLINE_IMAGE_GENERATION: "on" })).toBe(true);
    expect(publishingMode(DEV)).toBe("mock");
    expect(publishingMode({ NODE_ENV: "production" })).toBe("off");
    expect(publishingMode({ NODE_ENV: "production", NORTHLINE_PUBLISHING: "mock" })).toBe("mock");
    expect(instagramStatus({}).state).toBe("BLOCKED");
    expect(instagramStatus({}).label).toContain("blocked / disconnected");
    expect(instagramStatus({ NORTHLINE_INSTAGRAM_LIVE: "on" }).state).toBe("BLOCKED");
  });
  it("live publishing has no adapter: resolvePublisher refuses without NORTHLINE_INSTAGRAM_LIVE and the Meta stub never calls out", async () => {
    expect(resolvePublisher({ NORTHLINE_PUBLISHING: "live" }).provider).toBeNull();
    const meta = resolvePublisher({ NORTHLINE_PUBLISHING: "live", NORTHLINE_INSTAGRAM_LIVE: "on" }).provider!;
    await expect(meta.publish({ publicationId: "x", talent: "SIE", handle: null, imageUrl: null, caption: "", attempt: 1 })).rejects.toThrow(/not implemented/);
  });
  it("flag views expose names and states only, never secret values", () => {
    const env = { ...DEV, OPENAI_API_KEY: "sk-test-SECRET-123", SUPABASE_SERVICE_ROLE_KEY: "service-SECRET-456", NORTHLINE_IMAGE_GENERATION: "on" };
    const s = JSON.stringify(flagViews(env)) + JSON.stringify(instagramStatus(env));
    expect(s).not.toContain("SECRET");
  });
});

describe("mock publishing", () => {
  it("refuses non-approved assets and requires an explicit founder confirmation", async () => {
    const { repo, asset, ap } = await approvedAsset();
    expect(await publishBlockers(repo, asset.id)).toEqual(expect.arrayContaining([expect.stringMatching(/only APPROVED assets/)]));
    await expect(publishAsset(repo, { assetId: asset.id, confirmed: true, requestedBy: "founder", env: DEV })).rejects.toThrow(PublishError);
    await decide(repo, ap.id, "APPROVED", "", "founder", { selectedAssetIds: [asset.id] });
    await expect(publishAsset(repo, { assetId: asset.id, confirmed: false, requestedBy: "founder", env: DEV })).rejects.toThrow(/confirmation/);
    expect(await repo.list("publications")).toHaveLength(0);
  });
  it("publishes an APPROVED asset through the mock provider and stores the record, job and mock insights", async () => {
    const { repo, asset, ap, prod } = await approvedAsset();
    await decide(repo, ap.id, "APPROVED", "", "founder", { selectedAssetIds: [asset.id] });
    const pub = await publishAsset(repo, { assetId: asset.id, confirmed: true, requestedBy: "founder", env: DEV });
    expect(pub).toMatchObject({ status: "PUBLISHED", provider: "MOCK_INSTAGRAM", attempts: 1, talent: "SIE" });
    expect(pub.permalink).toMatch(/^mock:\/\/instagram\/sienna\.veyra\/p\//);
    expect((await repo.get("assets", asset.id))!.publication).toBe("PUBLISHED");
    expect((await repo.get("productions", prod.id))!.status).toBe("PUBLISHED");
    const job = (await repo.list("providerJobs")).find((j) => j.operation === "publish.instagram")!;
    expect(job).toMatchObject({ state: "SUCCEEDED", provider: "MOCK_INSTAGRAM" });
    const ins = (await repo.list("analytics")).filter((a) => a.publicationId === pub.id);
    expect(ins).toHaveLength(1);
    expect(ins[0].source).toBe("mock");
    expect(await publishBlockers(repo, asset.id)).toContain("Already published");
  });
  it("a permanent failure is visible and not retryable; a retryable failure succeeds on retry; retries are bounded", async () => {
    const a = await approvedAsset();
    await decide(a.repo, a.ap.id, "APPROVED", "", "founder", { selectedAssetIds: [a.asset.id] });
    const failed = await publishAsset(a.repo, { assetId: a.asset.id, confirmed: true, requestedBy: "founder", env: DEV, mockOutcome: "failure" });
    expect(failed).toMatchObject({ status: "FAILED", retryable: false });
    expect(failed.error).toMatch(/simulated permanent failure/);
    await expect(retryPublication(a.repo, failed.id, { env: DEV })).rejects.toThrow(/not retryable/);

    const b = await approvedAsset();
    await decide(b.repo, b.ap.id, "APPROVED", "", "founder", { selectedAssetIds: [b.asset.id] });
    const temp = await publishAsset(b.repo, { assetId: b.asset.id, confirmed: true, requestedBy: "founder", env: DEV, mockOutcome: "retryable" });
    expect(temp).toMatchObject({ status: "FAILED", retryable: true, attempts: 1 });
    // a retryable failure must be retried, not published a second time
    expect(await publishBlockers(b.repo, b.asset.id)).toEqual(expect.arrayContaining([expect.stringMatching(/use Retry/)]));
    await expect(publishAsset(b.repo, { assetId: b.asset.id, confirmed: true, requestedBy: "founder", env: DEV })).rejects.toThrow(/use Retry/);
    const ok = await retryPublication(b.repo, temp.id, { env: DEV, mockOutcome: "retryable" });
    expect(ok).toMatchObject({ status: "PUBLISHED", attempts: 2 });
    const jobs = (await b.repo.list("providerJobs")).filter((j) => j.operation === "publish.instagram");
    expect(jobs.map((j) => j.state)).toEqual(["FAILED", "SUCCEEDED"]);
    expect(jobs[1].retryOfJobId).toBe(jobs[0].id);

    // bounded: a provider that always fails temporarily stops being retryable at maxAttempts
    const c = await approvedAsset();
    await decide(c.repo, c.ap.id, "APPROVED", "", "founder", { selectedAssetIds: [c.asset.id] });
    const flaky = { ...mockInstagram(DEV), async publish() { const { ProviderError } = await import("@/lib/providers/types"); throw new ProviderError("MOCK_INSTAGRAM", "still down", true, "provider_unavailable"); } };
    let p = await publishAsset(c.repo, { assetId: c.asset.id, confirmed: true, requestedBy: "founder", env: DEV, provider: flaky });
    p = await retryPublication(c.repo, p.id, { env: DEV, provider: flaky });
    p = await retryPublication(c.repo, p.id, { env: DEV, provider: flaky });
    expect(p).toMatchObject({ status: "FAILED", attempts: 3, retryable: false });
    await expect(retryPublication(c.repo, p.id, { env: DEV, provider: flaky })).rejects.toThrow(PublishError);
  });
  it("read-only mode blocks publishing and retry; publishing OFF refuses", async () => {
    const { repo, asset, ap } = await approvedAsset();
    await decide(repo, ap.id, "APPROVED", "", "founder", { selectedAssetIds: [asset.id] });
    await expect(publishAsset(repo, { assetId: asset.id, confirmed: true, requestedBy: "founder", env: { ...DEV, NORTHLINE_READONLY: "true" } })).rejects.toThrow(/read-only/);
    await expect(publishAsset(repo, { assetId: asset.id, confirmed: true, requestedBy: "founder", env: { NODE_ENV: "production" } })).rejects.toThrow(/OFF/);
    await expect(retryPublication(repo, "anything", { env: { NORTHLINE_READONLY: "1" } })).rejects.toThrow(/read-only/);
    expect(await repo.list("publications")).toHaveLength(0);
  });
  it("insights persist as snapshots; the latest per post wins; mock data never counts as real", async () => {
    const { repo, asset, ap } = await approvedAsset();
    await decide(repo, ap.id, "APPROVED", "", "founder", { selectedAssetIds: [asset.id] });
    const pub = await publishAsset(repo, { assetId: asset.id, confirmed: true, requestedBy: "founder", env: DEV });
    const later = await recordInsights(repo, pub, mockInstagram(DEV), new Date(Date.now() + 3 * 86_400_000));
    const rows = await repo.list("analytics");
    expect(rows).toHaveLength(2);
    expect(latestInsights(rows).map((r) => r.id)).toEqual([later.id]);
    expect(later.views!).toBeGreaterThanOrEqual(rows[0].views!);
  });
});

describe("creator priority", () => {
  const base: PriorityInput = { code: "ZOE", name: "Zoe", active: true, daysSinceLastPost: 5, approvedReady: 0, plannedWithin2Days: 0, engagementRate: null, rosterEngagementRate: null, failures7d: 0 };
  it("is explainable: every point has a reason and the score is bounded", () => {
    const r = scoreCreator(base);
    expect(r.score).toBe(DEFAULT_WEIGHTS.base + 5 * DEFAULT_WEIGHTS.perGapDay + DEFAULT_WEIGHTS.noApprovedContent);
    expect(r.reasons).toEqual(expect.arrayContaining(["5 day posting gap", "no approved content queued"]));
    expect(scoreCreator({ ...base, daysSinceLastPost: 400, failures7d: 50, plannedWithin2Days: 3 }).score).toBeLessThanOrEqual(100);
  });
  it("ranks a gap + no content above a creator with a backlog; setup accounts are scaled down; weights are configurable", () => {
    const ranked = rankCreators([{ ...base, code: "SIE", name: "Sienna", daysSinceLastPost: 1, approvedReady: 4 }, base]);
    expect(ranked[0].code).toBe("ZOE");
    expect(scoreCreator({ ...base, active: false }).score).toBeLessThan(scoreCreator(base).score);
    expect(weightsFromEnv({ NORTHLINE_PRIORITY_WEIGHTS: '{"perGapDay":10,"bogus":1}' }).perGapDay).toBe(10);
    expect(weightsFromEnv({ NORTHLINE_PRIORITY_WEIGHTS: "not json" })).toEqual(DEFAULT_WEIGHTS);
  });
  it("uses engagement only when data exists", () => {
    const hi = scoreCreator({ ...base, engagementRate: 0.12, rosterEngagementRate: 0.06 });
    expect(hi.reasons).toContain("engagement above roster average");
    expect(scoreCreator(base).reasons.some((r) => r.includes("engagement"))).toBe(false);
  });
  it("creator overviews derive from rows without inventing data", async () => {
    const { repo } = await approvedAsset();
    const ov = creatorOverviews({ productions: await repo.list("productions"), assets: await repo.list("assets"), publications: null, analytics: [], calendar: [], jobs: [], launch: await repo.list("launchStates"), storylines: [], tasks: [] });
    expect(ov).toHaveLength(6);
    const sie = ov.find((o) => o.code === "SIE")!;
    expect(sie).toMatchObject({ lastContentAt: null, engagementRate: null, awaitingApproval: 1, published: 0 });
  });
});

describe("QA triad (identity / anatomy / realism)", () => {
  const q = (o: Partial<QaResult>): QaResult => ({ id: Math.random().toString(36), origin: "demo", createdAt: "", updatedAt: "", productionId: "p", attemptId: "a", assetId: "x", kind: "TECHNICAL", method: "vision_model", status: "PASS", inspectedImage: true, provider: "gemini", model: "m", findings: [], summary: "", recommendation: null, decidedBy: null, qaAttempt: 1, supersededBy: null, retry: null, ...o });
  it("PASS only when something inspected the image; uninspected = REVIEW with no confidence", () => {
    const t = qaTriad([q({ kind: "IDENTITY" }), q({})], "x");
    expect(t).toMatchObject({ overall: "PASS", identity: { verdict: "PASS", inspected: true }, anatomy: { verdict: "PASS" } });
    const u = qaTriad([q({ kind: "IDENTITY", method: "manual", inspectedImage: false, status: "MANUAL_REVIEW_REQUIRED" })], "x");
    expect(u.identity).toMatchObject({ verdict: "REVIEW", confidence: "none" });
    expect(u.anatomy.verdict).toBe("NOT RUN");
  });
  it("routes technical findings to anatomy vs realism and keeps the worst", () => {
    const t = qaTriad([q({ status: "HARD_FAIL", findings: [{ lockId: "hands", severity: "HARD_FAIL", message: "six fingers" }, { lockId: "unwanted_text", severity: "REVIEW", message: "sign text" }] })], "x");
    expect(t.anatomy).toMatchObject({ verdict: "FAIL", issues: ["six fingers"] });
    expect(t.realism).toMatchObject({ verdict: "REVIEW", issues: ["sign text"] });
    expect(t.overall).toBe("FAIL");
  });
});

import { resolveImageProvider } from "@/lib/providers";
import { previewPrompt, toCreative, EMPTY_BRIEF } from "@/lib/pipeline/preview";
const studio = { ...EMPTY_BRIEF, scene: "Morning coffee on her balcony", location: "Brickell balcony, Miami", outfit: "white linen shirt", lighting: "soft morning sun", pose: "leaning on the railing", camera: "candid phone photo" };

describe("Create studio: one image, settings, preview, flags", () => {
  it("one click = one image with the founder's settings recorded on the brief; the preview matches the pipeline prompt", async () => {
    const repo = new FileRepo(null);
    const r = await executeCreate(repo, { talent: ["SIE"], format: "POST", concept: studio.scene, asset_count: 1, creative: toCreative(studio, { aspectRatio: "4:5", quality: "medium", identityMode: "strict" }) }, deps());
    const pid = r.productions[0].id;
    expect((await repo.list("assets", { productionId: pid })).filter((a) => a.kind === "IMG")).toHaveLength(1);
    const brief = (await repo.list("generationBriefs", { productionId: pid }))[0];
    expect(brief.data.providerRequirements).toMatchObject({ size: "1024x1536", quality: "medium", inputFidelity: "high", targetAspect: "4:5", count: 1 });
    const stored = (await repo.list("prompts", { productionId: pid }))[0].positive;
    expect(previewPrompt("SIE", studio, { aspectRatio: "4:5", quality: "medium", identityMode: "strict" }, []).finalPrompt).toBe(stored);
    const sq = await executeCreate(repo, { talent: ["SIE"], format: "POST", concept: "square", asset_count: 1, creative: toCreative(studio, { aspectRatio: "1:1", quality: "high", identityMode: "strict" }) }, deps());
    expect((await repo.list("generationBriefs", { productionId: sq.productions[0].id }))[0].data.providerRequirements.size).toBe("1024x1024");
  });
  it("a founder-edited prompt is used, and it still has to pass the identity hard-lock gate", async () => {
    const repo = new FileRepo(null);
    const good = previewPrompt("SIE", studio, { aspectRatio: "4:5", quality: "high", identityMode: "strict" }, []).finalPrompt + " Add a small white ceramic cup.";
    const r = await executeCreate(repo, { talent: ["SIE"], format: "POST", concept: "edited", asset_count: 1, creative: toCreative(studio, { aspectRatio: "4:5", quality: "high", identityMode: "strict", promptOverride: good }) }, deps());
    expect((await repo.list("prompts", { productionId: r.productions[0].id }))[0].positive).toBe(good);
    const bad = await executeCreate(repo, { talent: ["SIE"], format: "POST", concept: "stripped", asset_count: 1, creative: toCreative(studio, { aspectRatio: "4:5", quality: "high", identityMode: "strict", promptOverride: "A photorealistic portrait of a smiling woman with heterochromia on a balcony at sunset." }) }, deps());
    expect(bad.productions[0].status).toBe("IDEA"); // blocked before generation
    expect((await repo.list("providerJobs")).filter((j) => j.productionId === bad.productions[0].id)).toHaveLength(0);
  });
  it("paid generation is OFF by default: the openai provider is unavailable and no network call is made", async () => {
    const res = resolveImageProvider({ IMAGE_PROVIDER: "openai", OPENAI_API_KEY: "sk-test" } as never);
    expect(res.mode).toBe("unavailable");
    expect(res.reason).toMatch(/NORTHLINE_IMAGE_GENERATION/);
    const repo = new FileRepo(null);
    const r = await executeCreate(repo, { talent: ["SIE"], format: "POST", concept: "x", asset_count: 1, creative: toCreative(studio, { aspectRatio: "4:5", quality: "high", identityMode: "strict" }) }, { ...deps(), image: res.provider });
    const job = (await repo.list("providerJobs")).find((j) => j.productionId === r.productions[0].id)!;
    expect(job).toMatchObject({ state: "FAILED", failureCategory: "provider_unavailable" });
    expect(job.error).not.toContain("sk-test");
  });
});

import { loadDashboard } from "@/lib/ops/dashboard";
import { seedDemo } from "@/lib/db/seed";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

describe("founder dashboard view-model", () => {
  it("loads all six creators and never reports Instagram or a mock provider as healthy", async () => {
    const repo = new FileRepo(null);
    await seedDemo(repo, { productions: true });
    const d = await loadDashboard(repo, new Date(), { NODE_ENV: "development" });
    expect(d.creators.map((c) => c.code).sort()).toEqual(["ALE", "MIL", "SIE", "SKY", "VES", "ZOE"]);
    expect(d.status.find((s) => s.label === "Instagram")).toMatchObject({ value: "BLOCKED", tone: "bad" });
    expect(d.status.find((s) => s.label === "Image provider")!.value).toBe("MOCK");
    expect(d.system.find((s) => s.name === "Instagram / Meta")!.state).toBe("BLOCKED");
    expect(d.system.find((s) => s.name === "Database")!.state).toBe("LOCAL FILE (demo)");
    expect(d.attention[0].text).toMatch(/Instagram blocked/);
    expect(d.pipeline.map((p) => p.key)).toEqual(["IDEA", "QUEUED", "RUNNING", "QA", "REVIEW", "APPROVED", "SCHEDULED", "PUBLISHED", "FAILED", "BLOCKED"]);
    expect(d.creators[0].priority.score).toBeGreaterThanOrEqual(d.creators[5].priority.score); // sorted by priority
  });
  it("paid image provider without the flag shows NOT CONFIGURED, not healthy", async () => {
    const d = await loadDashboard(new FileRepo(null), new Date(), { NODE_ENV: "development", IMAGE_PROVIDER: "openai", OPENAI_API_KEY: "sk-test-SECRET" });
    expect(d.status.find((s) => s.label === "Image provider")!.value).toBe("NOT CONFIGURED");
    expect(JSON.stringify(d.status) + JSON.stringify(d.system)).not.toContain("SECRET");
  });
});

describe("migration 0009 (embedded Postgres)", () => {
  it("applies after 0001-0008 and allows only one PUBLISHED row per asset; analytics accepts mock rows", async () => {
    const dir = path.join(process.cwd(), "supabase", "migrations");
    const db = new PGlite();
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) await db.exec(fs.readFileSync(path.join(dir, f), "utf8"));
    const p = await db.query<{ id: string }>("insert into productions (code, talent, content_type) values ('SIE-2026-900','{SIE}','POST') returning id");
    const a = await db.query<{ id: string }>("insert into assets (production_id, talent, kind, seq, provider, filename) values ($1,'{SIE}','IMG',1,'mock','f.png') returning id", [p.rows[0].id]);
    const ins = (status: string) => db.query<{ id: string }>("insert into publications (talent, production_id, asset_id, provider, status, requested_by, confirmed_at) values ('SIE',$1,$2,'MOCK_INSTAGRAM',$3,'founder',now()) returning id", [p.rows[0].id, a.rows[0].id, status]);
    await ins("FAILED"); const ok = await ins("PUBLISHED");
    await expect(ins("PUBLISHED")).rejects.toThrow();
    await expect(db.query("insert into publications (talent, production_id, asset_id, provider, requested_by, confirmed_at) values ('SIE',$1,$2,'TWITTER','f',now())", [p.rows[0].id, a.rows[0].id])).rejects.toThrow();
    await db.query("insert into analytics (production_id, source, views, publication_id, talent) values ($1,'mock',10,$2,'SIE')", [p.rows[0].id, ok.rows[0].id]);
    await expect(db.query("insert into analytics (production_id, source) values ($1,'scraped')", [p.rows[0].id])).rejects.toThrow();
  });
});
