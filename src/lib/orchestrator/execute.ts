// Runs a CreateRequest through the real production pipeline:
//   plan → production (identity version) → load references/history → Generation Brief (persisted) → prompts (QA-gated)
//   → image jobs (explicit job states) → assets with lineage → [Identity QA, Technical QA, Content QA] → finalize → human approval.
// Nothing here publishes or schedules externally. QA never fabricates a PASS: see pipeline/qa.ts.
import type { Repo } from "@/lib/db/repo";
import type { Asset, CreativeBrief, Production, WorkflowRun } from "@/lib/db/records";
import type { TalentCode } from "@/lib/domain/types";
import { CreateRequestSchema, type CreateRequestInput } from "./contracts";
import { planRequest, type PlannedProduction, type TaskPlan } from "./plan";
import { captionWriter, creativeDirector, strategist, type AgentContext } from "@/lib/agents/agents";
import { loadIdentity } from "@/lib/identity/service";
import { loadReferences, selectReferences } from "@/lib/references/service";
import { briefData, saveBrief } from "@/lib/pipeline/brief";
import { contentHistory } from "@/lib/pipeline/content";
import { buildPrompts } from "@/lib/pipeline/prompts";
import { createShotAsset, filenameFor, runImageJob } from "@/lib/pipeline/generate";
import { runContentQa, runIdentityQa, runTechnicalQa } from "@/lib/pipeline/qa";
import { finalizeAttempt } from "@/lib/pipeline/finalize";
import { defaultDeps, traceOf, type Deps, type Trace } from "@/lib/pipeline/deps";
import { ensureIdentities } from "@/lib/identity/service";

export { defaultDeps, filenameFor, type Deps, type Trace };

export interface CreateResult {
  runId: string; campaignId: string | null; plan: TaskPlan; failures: string[];
  productions: { id: string; code: string; status: string; qaOk: boolean; attemptId: string | null }[];
}
export interface ExecuteOpts { /** Skip inline QA/finalize: the caller (agent tasks) runs QA stages as separate tasks. */ deferQa?: boolean }

const pad = (n: number) => String(n).padStart(3, "0");

async function contextFor(repo: Repo, talent: TalentCode, variant: number): Promise<AgentContext> {
  const prods = (await repo.list("productions")).filter((p) => p.talent[0] === talent && p.status !== "REJECTED").slice(0, 8);
  return { recentLocations: prods.map((p) => p.brief?.location).filter(Boolean) as string[], recentConcepts: prods.map((p) => p.concept), variant: variant + prods.length };
}

export async function executeCreate(repo: Repo, input: CreateRequestInput, deps: Deps = defaultDeps(), opts: ExecuteOpts = {}): Promise<CreateResult> {
  const req = CreateRequestSchema.parse(input);
  const year = (deps.now?.() ?? new Date()).getFullYear();
  const origin = deps.origin;
  await ensureIdentities(repo);
  const plan = planRequest(req);
  const failures: string[] = [];
  const run = await repo.insert("workflowRuns", {
    workflow: "NL-01 Production Orchestrator", state: "RUNNING", productionId: null, provider: deps.image.name, startedAt: new Date().toISOString(),
    finishedAt: null, error: null, retryCount: 0, costUsd: 0, outputAssetIds: [], input: req, origin,
  } satisfies Omit<WorkflowRun, "id" | "createdAt" | "updatedAt">);

  const campaign = plan.campaign
    ? await repo.insert("campaigns", { name: plan.campaign.name, concept: req.concept, scope: plan.campaign.scope, talent: plan.campaign.talent, status: "GENERATING", origin })
    : null;

  const out: CreateResult["productions"] = [];
  const outputAssets: string[] = [];
  let variant = 0;
  for (const pp of plan.productions) {
    const res = await produce(repo, pp, req.platform, campaign?.id ?? null, year, variant++, deps, run.id, failures, opts);
    out.push(res.summary);
    outputAssets.push(...res.assetIds);
  }
  if (campaign) await repo.update("campaigns", campaign.id, { status: out.every((p) => p.status === "REVIEW") ? "REVIEW" : "RAW" });
  await repo.update("workflowRuns", run.id, {
    state: failures.length ? "FAILED" : "COMPLETE", finishedAt: new Date().toISOString(), error: failures.length ? failures.join("; ") : null, outputAssetIds: outputAssets,
  });
  return { runId: run.id, campaignId: campaign?.id ?? null, productions: out, plan, failures };
}

async function produce(repo: Repo, pp: PlannedProduction, platform: "instagram" | "tiktok", campaignId: string | null, year: number, variant: number, deps: Deps, runId: string, failures: string[], opts: ExecuteOpts) {
  const primary = pp.talent[0];
  const tr = traceOf(deps);
  const code = `${primary}-${year}-${pad(await repo.nextProductionSeq(primary, year))}`;
  await tr("PRODUCTION_MANAGER", "PRODUCTION_ID", `Reserved production ID ${code} (${pp.contentType}, ${pp.talent.join("+")})`, { data: { code } });

  // 1. canonical identity + references + recent history (all from persisted records)
  const { identity, drift } = await loadIdentity(repo, primary);
  const refs = await loadReferences(repo, primary);
  await tr("ORCHESTRATOR", "LOAD_IDENTITY", `Loaded ${identity.id} (${identity.hardLocks.length} hard locks) and ${refs.length} canonical reference(s) for ${primary}${refs.some((r) => r.referenceType === "MASTER_FACE") ? "" : " — NO master face uploaded"}`, { level: refs.length ? "info" : "warn", data: { identityVersion: identity.id } });
  if (drift) await tr("ORCHESTRATOR", "IDENTITY_DRIFT", `Identity facts in code changed without a version bump (${identity.id}); using the stored snapshot`, { level: "warn" });
  const ctx = await contextFor(repo, primary, variant);
  await tr("ORCHESTRATOR", "LOAD_HISTORY", `Read ${ctx.recentConcepts.length} recent production(s) for ${primary}`, { data: { recentLocations: ctx.recentLocations } });

  // 2. strategy + creative direction
  const strat = strategist(primary, pp.contentType, pp.concept, ctx);
  await tr("CONTENT_STRATEGIST", "CONCEPT_CHOSEN", `Concept "${strat.concept}" — ${strat.angle}`);
  const cd: CreativeBrief = creativeDirector(primary, pp.contentType, strat.concept, strat.angle, ctx, pp.assetCount);
  await tr("CREATIVE_DIRECTOR", "BRIEF_CREATED", `Creative direction for ${code}: ${cd.location}, ${cd.lighting}, ${cd.shots.length} shot(s)`);
  const scope = pp.talent.length === 1 ? "SOLO" : pp.talent.length === 2 ? "DUO" : pp.talent.length >= 6 ? "ALL_SIX" : "GROUP";

  let production: Production = await repo.insert("productions", {
    code, talent: pp.talent, scope, contentType: pp.contentType, platform, concept: strat.concept, status: "GENERATING", campaignId, storylineId: null, brief: cd, qaNotes: [], costUsd: 0,
    identityVersion: identity.id, currentAttemptId: null, origin: deps.origin,
  });

  // 3. persisted Generation Brief + attempt 1
  const history = await contentHistory(repo, production);
  const data = briefData({ production, identity, brief: cd, refs, history, deps, revision: null });
  const brief = await saveBrief(repo, production.id, data, refs.map((r) => r.id), deps.origin);
  await tr("PRODUCTION_MANAGER", "GENERATION_BRIEF", `Generation Brief v${brief.version} saved for ${code} (${identity.id}, ${refs.length} reference(s))`);
  const attempt = await repo.insert("generationAttempts", { productionId: production.id, attemptNo: 1, briefId: brief.id, trigger: "initial", status: "GENERATING", shots: cd.shots.map((s) => s.n), parentAttemptId: null, reason: "initial generation", feedback: [], finishedAt: null, origin: deps.origin });
  production = await repo.update("productions", production.id, { currentAttemptId: attempt.id });

  // 4. prompts (prompt-level identity gate: HARD findings block generation)
  const refsByShot = Object.fromEntries(cd.shots.map((sh) => [sh.n, selectReferences(refs, sh).map((r) => r.id)]));
  const built = buildPrompts(data, identity, { refsByShot });
  await tr("PROMPT_ENGINEER", "PROMPTS_BUILT", `Built ${built.length} prompt(s) for ${code} from the Generation Brief`);
  const prompts = [];
  for (const b of built) prompts.push(await repo.insert("prompts", { productionId: production.id, provider: deps.image.name, version: 1, shotN: b.shotN, positive: b.positive, negative: b.negative, identityRefs: b.identityRefs, qa: { ok: !b.findings.length, issues: b.findings.map((f) => f.message) }, briefId: brief.id, attemptId: attempt.id, origin: deps.origin }));
  const hard = built.filter((b) => b.severity === "HARD_FAIL");
  const notes = built.flatMap((b) => b.findings.map((f) => `Shot ${b.shotN}: ${f.message}`));
  if (notes.length) production = await repo.update("productions", production.id, { qaNotes: notes });
  await repo.insert("captions", { productionId: production.id, talent: primary, text: captionWriter(primary, strat.concept, pp.talent.slice(1)), kind: "FEED", approval: "PENDING", origin: deps.origin });
  await tr("CAPTION_WRITER", "CAPTION_DRAFTED", `Drafted caption for ${code}`);
  if (hard.length) {
    failures.push(`${code}: identity QA blocked generation`);
    await repo.update("generationAttempts", attempt.id, { status: "HARD_FAIL", reason: "prompt failed canonical identity hard locks", finishedAt: new Date().toISOString() });
    production = await repo.update("productions", production.id, { status: "IDEA" });
    await tr("IDENTITY_QA", "QA_REJECTED", `Identity QA rejected ${code} before generation: ${hard.flatMap((b) => b.findings.map((f) => f.message)).join("; ")}`, { level: "warn" });
    await tr("PRODUCTION_MANAGER", "BLOCKED", `${code} blocked before generation by Identity QA`, { level: "warn" });
    return { summary: { id: production.id, code, status: production.status, qaOk: false, attemptId: attempt.id }, assetIds: [] as string[] };
  }

  // 5. generation jobs → assets
  const assetIds: string[] = [];
  for (const [i, shot] of cd.shots.entries()) {
    const asset = await createShotAsset(repo, deps, production, brief, attempt, prompts[i], shot.n, shot.kind);
    assetIds.push(asset.id);
    const r = await runImageJob(repo, deps, { production, brief, attempt, prompt: prompts[i], asset, refs }, runId);
    if (!r.ok) failures.push(`${code} shot ${shot.n}: ${r.error}`);
    await tr("PRODUCTION_MANAGER", r.ok ? "ASSET_GENERATED" : "ASSET_FAILED", r.ok ? `Asset ${shot.n} of ${code} generated via ${deps.image.name}${deps.image.model ? `/${deps.image.model}` : ""} (job ${r.job.state})` : `Asset ${shot.n} of ${code} failed (${deps.image.name}, ${r.job.failureCategory})`, { level: r.ok ? "info" : "error" });
  }
  if (pp.contentType === "REEL") {
    const reel = await repo.insert("assets", {
      productionId: production.id, talent: pp.talent, kind: "REEL", seq: 1, status: "PENDING", approval: "PENDING", provider: deps.video.name, promptId: null, storagePath: null,
      filename: filenameFor(code, "REEL", 1, "RAW", "mp4"), isReference: false, publication: "UNPUBLISHED", attemptId: attempt.id, attemptNo: 1, briefId: brief.id, generationJobId: null,
      identityVersion: identity.id, referenceIds: [], model: null, qaStatus: "QA_PENDING", current: true, width: null, height: null, bytes: null, sha256: null, origin: deps.origin,
    });
    assetIds.push(reel.id); // video stage runs separately (submitReelVideo) once the source still is reviewed
  }

  // 6. QA → finalize (inline library mode), or left to QA tasks (agent mode)
  if (opts.deferQa) return { summary: { id: production.id, code, status: "GENERATING", qaOk: true, attemptId: attempt.id }, assetIds };
  const final = await completeAttempt(repo, deps, production.id, attempt.id);
  return { summary: { id: production.id, code, status: final.productionStatus, qaOk: true, attemptId: attempt.id }, assetIds };
}

/** Inline QA + finalize for an attempt (library mode). Agent mode runs the same functions as separate tasks. */
export async function completeAttempt(repo: Repo, deps: Deps, productionId: string, attemptId: string) {
  const p = (await repo.get("productions", productionId))!;
  const attempt = (await repo.get("generationAttempts", attemptId))!;
  const { identity } = await loadIdentity(repo, p.talent[0]);
  const refs = await loadReferences(repo, p.talent[0]);
  const assets = (await repo.list("assets", { productionId })).filter((a) => a.attemptId === attemptId && a.kind !== "REEL" && a.status === "RAW");
  await runIdentityQa(repo, deps, p, attempt, assets, identity, refs);
  await runTechnicalQa(repo, deps, p, attempt, assets);
  await runContentQa(repo, deps, p, attempt);
  return finalizeAttempt(repo, deps, productionId, attemptId);
}

/** Targeted retry of one failed asset (new provider job linked to the failed one; attempt QA re-runs once nothing is pending/failed). */
export async function retryAsset(repo: Repo, assetId: string, deps: Deps = defaultDeps()) {
  const asset = await repo.get("assets", assetId);
  if (!asset || asset.status !== "FAILED" || !asset.promptId || !asset.briefId || !asset.attemptId) throw new Error("Only failed image assets with a stored prompt and brief can be retried.");
  const [production, prompt, brief, attempt] = await Promise.all([repo.get("productions", asset.productionId), repo.get("prompts", asset.promptId), repo.get("generationBriefs", asset.briefId), repo.get("generationAttempts", asset.attemptId)]);
  if (!production || !prompt || !brief || !attempt) throw new Error("Production, prompt, brief or attempt record missing.");
  const prev = (await repo.list("providerJobs", { assetId })).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  const refs = await loadReferences(repo, production.talent[0]);
  const r = await runImageJob(repo, deps, { production, brief, attempt, prompt, asset, refs, retryOf: prev }, null);
  const failures = r.ok ? [] : [`${production.code} shot ${asset.seq}: ${r.error}`];
  const assets = (await repo.list("assets", { productionId: production.id })).filter((a) => a.attemptId === attempt.id);
  if (!assets.some((a) => a.status === "FAILED" || (a.status === "PENDING" && a.kind !== "REEL"))) await completeAttempt(repo, deps, production.id, attempt.id);
  return failures;
}

/** Video stage (separate from stills): submits the Reel prompt to the video provider. */
export async function submitReelVideo(repo: Repo, productionId: string, deps: Deps = defaultDeps()) {
  const production = await repo.get("productions", productionId);
  const reelPrompt = production?.brief?.reel?.higgsfieldPrompt;
  if (!production || !reelPrompt) throw new Error("Production has no Reel plan.");
  const assets = await repo.list("assets", { productionId });
  const reel = assets.find((a) => a.kind === "REEL" && a.current);
  const still = assets.find((a) => a.kind === "IMG" && a.current && a.status !== "FAILED");
  if (!reel || !still) throw new Error("Source still missing — generate and review the still first.");
  const job = await repo.insert("providerJobs", { runId: null, productionId, provider: deps.video.name, model: null, operation: "video.generate", state: "QUEUED", externalId: null, error: null, assetId: reel.id, shotN: 1, costUsd: null, credits: null, briefId: reel.briefId, attemptId: reel.attemptId, promptId: null, retryCount: 0, retryOfJobId: null, startedAt: new Date().toISOString(), finishedAt: null, failureCategory: null, metadata: {}, origin: production.origin });
  try {
    const r = await deps.video.submit({ productionCode: production.code, prompt: reelPrompt, sourceStillPath: still.storagePath, durationSec: production.brief?.reel?.durationSec ?? 6 });
    const done = r.state === "COMPLETE";
    await repo.update("providerJobs", job.id, { state: r.state === "FAILED" ? "FAILED" : done ? "SUCCEEDED" : "PROCESSING", externalId: r.externalId, credits: r.credits, finishedAt: done ? new Date().toISOString() : null });
    // Video content is not inspected by any QA stage yet → a human must review it.
    await repo.update("assets", reel.id, { status: done ? "RAW" : "PENDING", provider: r.provider, generationJobId: job.id, qaStatus: done ? "MANUAL_REVIEW_REQUIRED" : "QA_PENDING" });
    const all = (await repo.list("assets", { productionId })).filter((a) => a.current);
    if (!all.some((a) => a.status === "PENDING" || a.status === "FAILED" || a.qaStatus === "HARD_FAIL")) {
      await repo.update("productions", productionId, { status: "REVIEW" });
      if (!(await repo.list("approvals", { productionId })).some((x) => x.state === "PENDING")) await repo.insert("approvals", { productionId, subject: "PRODUCTION", subjectId: productionId, state: "PENDING", decidedBy: null, decidedAt: null, notes: "", selectedAssetIds: [], origin: production.origin });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "video provider error";
    await repo.update("providerJobs", job.id, { state: "FAILED", error: msg, finishedAt: new Date().toISOString(), failureCategory: "unknown" });
    await repo.update("assets", reel.id, { status: "FAILED" });
    throw new Error(msg);
  }
}
export type { Asset };
