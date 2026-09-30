// Runs a CreateRequest end-to-end: plan -> agents -> production records -> provider jobs -> assets -> QA -> approval queue.
// Nothing here publishes or schedules externally.
import type { Repo } from "@/lib/db/repo";
import type { Asset, CreativeBrief, Production, WorkflowRun } from "@/lib/db/records";
import type { Origin, TalentCode } from "@/lib/domain/types";
import { CreateRequestSchema, type CreateRequestInput } from "./contracts";
import { planRequest, type PlannedProduction, type TaskPlan } from "./plan";
import { captionWriter, contentQa, creativeDirector, promptEngineer, strategist, type AgentContext } from "@/lib/agents/agents";
import { getImageProvider, getVideoProvider } from "@/lib/providers";
import { localStorageProvider } from "@/lib/providers/storage";
import type { ImageProvider, StorageProvider, VideoProvider } from "@/lib/providers/types";

export interface Deps { image: ImageProvider; video: VideoProvider; storage: StorageProvider; origin: Origin; now?: () => Date }
export const defaultDeps = (): Deps => ({ image: getImageProvider(), video: getVideoProvider(), storage: localStorageProvider, origin: "live" });

export interface CreateResult { runId: string; campaignId: string | null; productions: { id: string; code: string; status: string; qaOk: boolean }[]; plan: TaskPlan; failures: string[] }

const pad = (n: number) => String(n).padStart(3, "0");
export const filenameFor = (code: string, kind: string, seq: number, status: string, ext: string) => `${code}_${kind}-${String(seq).padStart(2, "0")}_${status}.${ext}`;

async function contextFor(repo: Repo, talent: TalentCode, variant: number): Promise<AgentContext> {
  const prods = (await repo.list("productions")).filter((p) => p.talent[0] === talent && p.status !== "REJECTED").slice(0, 8);
  return { recentLocations: prods.map((p) => p.brief?.location).filter(Boolean) as string[], recentConcepts: prods.map((p) => p.concept), variant: variant + prods.length };
}

export async function executeCreate(repo: Repo, input: CreateRequestInput, deps: Deps = defaultDeps()): Promise<CreateResult> {
  const req = CreateRequestSchema.parse(input);
  const year = (deps.now?.() ?? new Date()).getFullYear();
  const origin = deps.origin;
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
    const res = await produce(repo, pp, req.platform, campaign?.id ?? null, year, variant++, deps, run.id, failures);
    out.push(res.summary);
    outputAssets.push(...res.assetIds);
  }
  if (campaign) await repo.update("campaigns", campaign.id, { status: out.every((p) => p.status === "REVIEW") ? "REVIEW" : "RAW" });
  await repo.update("workflowRuns", run.id, {
    state: failures.length ? "FAILED" : "COMPLETE", finishedAt: new Date().toISOString(), error: failures.length ? failures.join("; ") : null, outputAssetIds: outputAssets,
  });
  return { runId: run.id, campaignId: campaign?.id ?? null, productions: out, plan, failures };
}

async function produce(repo: Repo, pp: PlannedProduction, platform: "instagram" | "tiktok", campaignId: string | null, year: number, variant: number, deps: Deps, runId: string, failures: string[]) {
  const primary = pp.talent[0];
  const code = `${primary}-${year}-${pad(await repo.nextProductionSeq(primary, year))}`;
  const ctx = await contextFor(repo, primary, variant);
  const strat = strategist(primary, pp.contentType, pp.concept, ctx);
  const brief: CreativeBrief = creativeDirector(primary, pp.contentType, strat.concept, strat.angle, ctx, pp.assetCount);
  const prompts = promptEngineer(primary, brief);
  const qaNotes = [...contentQa(prompts, ctx, brief.location), ...prompts.flatMap((p) => p.qa.issues.map((i) => `Shot ${p.shotN}: ${i}`))];
  const identityOk = prompts.every((p) => p.qa.ok);
  const scope = pp.talent.length === 1 ? "SOLO" : pp.talent.length === 2 ? "DUO" : pp.talent.length >= 6 ? "ALL_SIX" : "GROUP";

  let production: Production = await repo.insert("productions", {
    code, talent: pp.talent, scope, contentType: pp.contentType, platform, concept: strat.concept, status: identityOk ? "GENERATING" : "IDEA",
    campaignId, storylineId: null, brief, qaNotes, costUsd: 0, origin: deps.origin,
  });

  const promptRows = [];
  for (const p of prompts) {
    promptRows.push(await repo.insert("prompts", { productionId: production.id, provider: deps.image.name, version: 1, shotN: p.shotN, positive: p.positive, negative: p.negative, identityRefs: ["MASTER_FACE", "FRONT", "THREE_QUARTER"], qa: p.qa, origin: deps.origin }));
  }
  await repo.insert("captions", { productionId: production.id, talent: primary, text: captionWriter(primary, strat.concept, pp.talent.slice(1)), kind: "FEED", approval: "PENDING", origin: deps.origin });

  const assetIds: string[] = [];
  if (!identityOk) {
    failures.push(`${code}: identity QA blocked generation`);
    return { summary: { id: production.id, code, status: production.status, qaOk: false }, assetIds };
  }

  for (const [i, shot] of brief.shots.entries()) {
    const prompt = promptRows[i];
    const asset = await repo.insert("assets", {
      productionId: production.id, talent: pp.talent, kind: shot.kind, seq: shot.n, status: "PENDING", approval: "PENDING", provider: deps.image.name,
      promptId: prompt.id, storagePath: null, filename: filenameFor(code, shot.kind, shot.n, "RAW", "png"), isReference: false, publication: "UNPUBLISHED", origin: deps.origin,
    });
    assetIds.push(asset.id);
    await runImageJob(repo, deps, production, asset, prompt.positive, prompt.negative, runId, failures);
  }
  if (pp.contentType === "REEL") {
    const reel = await repo.insert("assets", {
      productionId: production.id, talent: pp.talent, kind: "REEL", seq: 1, status: "PENDING", approval: "PENDING", provider: deps.video.name, promptId: null,
      storagePath: null, filename: filenameFor(code, "REEL", 1, "RAW", "mp4"), isReference: false, publication: "UNPUBLISHED", origin: deps.origin,
    });
    assetIds.push(reel.id); // video stage runs separately (submitReelVideo) once the source still is reviewed
  }

  const assets = await repo.list("assets", { productionId: production.id });
  const anyFailed = assets.some((a) => a.status === "FAILED");
  const awaitingVideo = assets.some((a) => a.kind === "REEL" && a.status === "PENDING");
  production = await repo.update("productions", production.id, { status: anyFailed || awaitingVideo ? "RAW" : "REVIEW" });
  if (production.status === "REVIEW") await repo.insert("approvals", { productionId: production.id, subject: "PRODUCTION", subjectId: production.id, state: "PENDING", decidedBy: null, decidedAt: null, notes: "", origin: deps.origin });
  return { summary: { id: production.id, code, status: production.status, qaOk: true }, assetIds };
}

/** Generate (or targeted-retry) a single still. A failure here never invalidates the rest of the production. */
export async function runImageJob(repo: Repo, deps: Deps, production: Production, asset: Asset, positive: string, negative: string, runId: string | null, failures: string[] = []) {
  const job = await repo.insert("providerJobs", { runId, productionId: production.id, provider: deps.image.name, model: null, operation: "image.generate", state: "RUNNING", externalId: null, error: null, assetId: asset.id, shotN: asset.seq, costUsd: null, credits: null, origin: deps.origin });
  try {
    const r = await deps.image.generate({ productionCode: production.code, shotN: asset.seq, prompt: positive, negative, talent: production.talent[0], referencePaths: [] });
    let storagePath: string | null = null;
    if (r.bytes) storagePath = await deps.storage.save(`${production.code}/${asset.filename}`, r.bytes, r.mime);
    await repo.update("providerJobs", job.id, { state: "COMPLETE", model: r.model, costUsd: r.costUsd, credits: r.credits });
    await repo.update("assets", asset.id, { status: "RAW", provider: r.provider, storagePath });
    if (r.costUsd) await repo.update("productions", production.id, { costUsd: production.costUsd + r.costUsd });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown provider error";
    await repo.update("providerJobs", job.id, { state: "FAILED", error: msg });
    await repo.update("assets", asset.id, { status: "FAILED" });
    failures.push(`${production.code} shot ${asset.seq}: ${msg}`);
  }
}

/** Targeted retry of one failed asset. */
export async function retryAsset(repo: Repo, assetId: string, deps: Deps = defaultDeps()) {
  const asset = await repo.get("assets", assetId);
  if (!asset || asset.status !== "FAILED" || !asset.promptId) throw new Error("Only failed image assets with a stored prompt can be retried.");
  const [production, prompt] = await Promise.all([repo.get("productions", asset.productionId), repo.get("prompts", asset.promptId)]);
  if (!production || !prompt) throw new Error("Production or prompt record missing.");
  await repo.update("assets", asset.id, { status: "PENDING" });
  const failures: string[] = [];
  await runImageJob(repo, deps, production, asset, prompt.positive, prompt.negative, null, failures);
  const assets = await repo.list("assets", { productionId: production.id });
  if (!assets.some((a) => a.status === "FAILED") && production.status === "RAW" && !assets.some((a) => a.status === "PENDING")) {
    await repo.update("productions", production.id, { status: "REVIEW" });
    await repo.insert("approvals", { productionId: production.id, subject: "PRODUCTION", subjectId: production.id, state: "PENDING", decidedBy: null, decidedAt: null, notes: "", origin: production.origin });
  }
  return failures;
}

/** Video stage (separate from stills): submits the Reel prompt to the video provider. */
export async function submitReelVideo(repo: Repo, productionId: string, deps: Deps = defaultDeps()) {
  const production = await repo.get("productions", productionId);
  const reelPrompt = production?.brief?.reel?.higgsfieldPrompt;
  if (!production || !reelPrompt) throw new Error("Production has no Reel plan.");
  const assets = await repo.list("assets", { productionId });
  const reel = assets.find((a) => a.kind === "REEL");
  const still = assets.find((a) => a.kind === "IMG" && a.status !== "FAILED");
  if (!reel || !still) throw new Error("Source still missing — generate and review the still first.");
  const job = await repo.insert("providerJobs", { runId: null, productionId, provider: deps.video.name, model: null, operation: "video.generate", state: "RUNNING", externalId: null, error: null, assetId: reel.id, shotN: 1, costUsd: null, credits: null, origin: production.origin });
  try {
    const r = await deps.video.submit({ productionCode: production.code, prompt: reelPrompt, sourceStillPath: still.storagePath, durationSec: production.brief?.reel?.durationSec ?? 6 });
    await repo.update("providerJobs", job.id, { state: r.state === "FAILED" ? "FAILED" : r.state === "COMPLETE" ? "COMPLETE" : "RUNNING", externalId: r.externalId, credits: r.credits });
    await repo.update("assets", reel.id, { status: r.state === "COMPLETE" ? "RAW" : "PENDING", provider: r.provider });
    const all = await repo.list("assets", { productionId });
    if (!all.some((a) => a.status === "PENDING" || a.status === "FAILED")) {
      await repo.update("productions", productionId, { status: "REVIEW" });
      await repo.insert("approvals", { productionId, subject: "PRODUCTION", subjectId: productionId, state: "PENDING", decidedBy: null, decidedAt: null, notes: "", origin: production.origin });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "video provider error";
    await repo.update("providerJobs", job.id, { state: "FAILED", error: msg });
    await repo.update("assets", reel.id, { status: "FAILED" });
    throw new Error(msg);
  }
}
