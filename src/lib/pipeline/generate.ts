// Image generation for one shot: creates the asset + a provider job with explicit state, stores bytes, records full lineage.
import type { Repo } from "@/lib/db/repo";
import type { Asset, GenerationAttempt, GenerationBrief, Production, Prompt, ProviderJob, ReferenceAsset } from "@/lib/db/records";
import { inspectImage } from "@/lib/media/inspect";
import { selectReferences } from "@/lib/references/service";
import { ProviderError, type FailureCategory, type ImageReference } from "@/lib/providers/types";
import type { Deps } from "./deps";
import { traceOf } from "./deps";
import { guardImage, settleImage } from "@/lib/governor/service";

export const filenameFor = (code: string, kind: string, seq: number, status: string, ext: string, attemptNo = 1) =>
  `${code}_${kind}-${String(seq).padStart(2, "0")}${attemptNo > 1 ? `_A${String(attemptNo).padStart(2, "0")}` : ""}_${status}.${ext}`;

const setJob = (repo: Repo, id: string, patch: Partial<ProviderJob>) => repo.update("providerJobs", id, patch);

/** Load reference image bytes for a shot. References whose files are missing are skipped (and reported), never invented. */
async function loadRefImages(deps: Deps, refs: ReferenceAsset[]): Promise<{ images: ImageReference[]; used: ReferenceAsset[]; missing: string[] }> {
  const images: ImageReference[] = [], used: ReferenceAsset[] = [], missing: string[] = [];
  for (const r of refs) {
    const f = await deps.storage.read(r.storagePath);
    if (!f) { missing.push(r.id); continue; }
    images.push({ bytes: f.bytes, mime: f.mime, type: r.referenceType }); used.push(r);
  }
  return { images, used, missing };
}

export interface ShotJob { production: Production; brief: GenerationBrief; attempt: GenerationAttempt; prompt: Prompt; asset: Asset; refs: ReferenceAsset[]; retryOf?: ProviderJob | null }

/** Run one image job through QUEUED → SUBMITTED → PROCESSING → SUCCEEDED | FAILED. Never throws; failures are persisted with a category. */
export async function runImageJob(repo: Repo, deps: Deps, j: ShotJob, runId: string | null = null): Promise<{ ok: boolean; error: string | null; job: ProviderJob }> {
  const tr = traceOf(deps);
  const shot = j.brief.data.shots.find((s) => s.n === j.asset.seq) ?? { description: "" };
  const { images, used, missing } = await loadRefImages(deps, selectReferences(j.refs, shot));
  if (missing.length) await tr("PRODUCTION_MANAGER", "REFERENCE_MISSING_FILE", `${missing.length} reference file(s) missing from storage for ${j.production.code}; continuing without them`, { level: "warn" });
  let job = await repo.insert("providerJobs", {
    runId, productionId: j.production.id, provider: deps.image.name, model: deps.image.model ?? null, operation: "image.generate", state: "QUEUED", externalId: null, error: null,
    assetId: j.asset.id, shotN: j.asset.seq, costUsd: null, credits: null, briefId: j.brief.id, attemptId: j.attempt.id, promptId: j.prompt.id,
    retryCount: j.retryOf ? j.retryOf.retryCount + 1 : 0, retryOfJobId: j.retryOf?.id ?? null, startedAt: null, finishedAt: null, failureCategory: null, metadata: {}, origin: deps.origin,
  });
  await repo.update("assets", j.asset.id, { status: "PENDING", generationJobId: job.id, referenceIds: used.map((r) => r.id) });
  // BUDGET GUARD: reserve immediately before the provider call. A refusal makes NO provider call and is recorded on the job (category budget_blocked).
  const gctx = { creator: j.production.talent[0], provider: deps.image.name, productionId: j.production.id, jobId: job.id };
  const guard = await guardImage(repo, gctx);
  if (!guard.allowed) {
    const msg = guard.decision.allowed ? "blocked" : guard.decision.reason;
    job = await setJob(repo, job.id, { state: "FAILED", finishedAt: new Date().toISOString(), error: msg, failureCategory: "budget_blocked", metadata: { blockedCode: guard.decision.allowed ? null : guard.decision.code } });
    await repo.update("assets", j.asset.id, { status: "FAILED" });
    await tr("PRODUCTION_MANAGER", "BUDGET_BLOCKED", `${j.production.code} shot ${j.asset.seq}: ${msg}`, { level: "warn" });
    return { ok: false, error: msg, job };
  }
  job = await setJob(repo, job.id, { state: "SUBMITTED", startedAt: new Date().toISOString() });
  job = await setJob(repo, job.id, { state: "PROCESSING" });
  try {
    const r = await deps.image.generate({ productionCode: j.production.code, shotN: j.asset.seq, prompt: j.prompt.positive, negative: j.prompt.negative, talent: j.production.talent[0], references: images, size: j.brief.data.providerRequirements.size });
    let storagePath: string | null = null, meta: Partial<Asset> = {};
    if (r.bytes) {
      const info = inspectImage(r.bytes);
      const ext = info.ext ?? "png";
      const name = j.asset.filename.replace(/\.\w+$/, `.${ext}`);
      storagePath = await deps.storage.save(`${j.production.code}/${name}`, r.bytes, r.mime);
      meta = { width: info.width, height: info.height, bytes: info.bytes, sha256: info.sha256, filename: name };
    }
    job = await setJob(repo, job.id, { state: "SUCCEEDED", finishedAt: new Date().toISOString(), model: r.model, costUsd: r.costUsd, credits: r.credits, externalId: r.externalId, metadata: r.metadata ?? {} });
    await repo.update("assets", j.asset.id, { status: "RAW", provider: r.provider, model: r.model, storagePath, ...meta });
    if (r.costUsd) await repo.update("productions", j.production.id, { costUsd: j.production.costUsd + r.costUsd });
    await settleImage(repo, guard, { kind: "success" }, gctx);
    return { ok: true, error: null, job };
  } catch (e) {
    const pe = e instanceof ProviderError ? e : null;
    const msg = e instanceof Error ? e.message : "unknown provider error"; // adapters never include secrets/bodies in messages
    const category: FailureCategory = pe?.category ?? "unknown";
    job = await setJob(repo, job.id, { state: "FAILED", finishedAt: new Date().toISOString(), error: msg, failureCategory: category });
    await repo.update("assets", j.asset.id, { status: "FAILED" });
    await settleImage(repo, guard, { kind: "failure", category }, gctx);
    return { ok: false, error: msg, job };
  }
}

/** Create the asset row for a shot in an attempt. Earlier assets for the same shot are kept (lineage) but no longer current. */
export async function createShotAsset(repo: Repo, deps: Deps, p: Production, brief: GenerationBrief, attempt: GenerationAttempt, prompt: Prompt | null, seq: number, kind: Asset["kind"], ext = "png"): Promise<Asset> {
  for (const old of (await repo.list("assets", { productionId: p.id })).filter((a) => a.seq === seq && a.kind === kind && a.current)) await repo.update("assets", old.id, { current: false });
  return repo.insert("assets", {
    productionId: p.id, talent: p.talent, kind, seq, status: "PENDING", approval: "PENDING", provider: deps.image.name, promptId: prompt?.id ?? null, storagePath: null,
    filename: filenameFor(p.code, kind, seq, "RAW", ext, attempt.attemptNo), isReference: false, publication: "UNPUBLISHED",
    attemptId: attempt.id, attemptNo: attempt.attemptNo, briefId: brief.id, generationJobId: null, identityVersion: brief.data.identityVersion, referenceIds: [], model: deps.image.model ?? null,
    qaStatus: "QA_PENDING", current: true, width: null, height: null, bytes: null, sha256: null, origin: deps.origin,
  });
}
