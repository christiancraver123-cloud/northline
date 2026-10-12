// Publishing workflow: APPROVED asset → founder clicks Publish → confirmation → publishing job → provider → PUBLISHED record.
// Guarantees: only APPROVED assets publish; an explicit founder confirmation is required; read-only mode refuses; nothing is
// automatic (no schedule, agent or webhook calls this); retries are bounded; MOCK_INSTAGRAM makes no network call.
import type { Repo } from "@/lib/db/repo";
import type { Publication } from "@/lib/db/records";
import { assertPublishable, ApprovalRequiredError } from "./gate";
import { mockInstagram, metaInstagram, type MockOutcome, type PublishProvider } from "./provider";
import { instagramLiveRequested, publishingMode } from "@/lib/flags";
import { isReadOnly, ReadOnlyError } from "@/lib/runtime/mode";
import { ProviderError } from "@/lib/providers/types";

type Env = Record<string, string | undefined>;
export class PublishError extends Error {}

/** Which provider a publish would use right now, or why publishing is unavailable. */
export function resolvePublisher(env: Env = process.env): { provider: PublishProvider | null; reason: string | null } {
  const mode = publishingMode(env);
  if (mode === "off") return { provider: null, reason: "Publishing is OFF (NORTHLINE_PUBLISHING)." };
  if (mode === "live") return instagramLiveRequested(env) ? { provider: metaInstagram, reason: null } : { provider: null, reason: "Live publishing needs NORTHLINE_INSTAGRAM_LIVE=on, and no live Meta adapter exists yet." };
  return { provider: mockInstagram(env), reason: null };
}

export interface PublishInput { assetId: string; confirmed: boolean; requestedBy: string; mockOutcome?: MockOutcome; env?: Env; provider?: PublishProvider }

/** Reasons this asset cannot be published (empty = publishable). Read-only check; never writes. */
export async function publishBlockers(repo: Repo, assetId: string, opts: { requireFile?: boolean } = {}): Promise<string[]> {
  const asset = await repo.get("assets", assetId);
  if (!asset) return ["Asset not found"];
  const out: string[] = [];
  if (asset.status !== "APPROVED" || asset.approval !== "APPROVED") out.push(`Asset is ${asset.status}; only APPROVED assets can be published`);
  if (asset.kind === "REEL") out.push("Reels are not publishable yet (images only)");
  if (!asset.storagePath && (opts.requireFile ?? true)) out.push("Asset has no stored image file");
  const prod = await repo.get("productions", asset.productionId);
  if (!prod) out.push("Production not found");
  else {
    const approved = (await repo.list("approvals", { productionId: prod.id })).some((a) => a.state === "APPROVED" && a.selectedAssetIds.includes(asset.id));
    try { assertPublishable(prod, approved); } catch (e) { if (e instanceof ApprovalRequiredError) out.push(e.message); else throw e; }
  }
  if ((await repo.list("publications", { assetId })).some((p) => p.status === "PUBLISHED" || p.status === "PUBLISHING")) out.push("Already published");
  return out;
}

export async function publishAsset(repo: Repo, i: PublishInput): Promise<Publication> {
  const env = i.env ?? process.env;
  if (isReadOnly(env)) throw new ReadOnlyError("publishing");
  if (!i.confirmed) throw new PublishError("Publishing needs an explicit founder confirmation.");
  const { provider, reason } = i.provider ? { provider: i.provider, reason: null } : resolvePublisher(env);
  if (!provider) throw new PublishError(reason ?? "Publishing unavailable.");
  const blockers = await publishBlockers(repo, i.assetId, { requireFile: provider.live }); // the mock provider can publish file-less demo assets
  if (blockers.length) throw new PublishError(`Cannot publish: ${blockers.join("; ")}`);
  const asset = (await repo.get("assets", i.assetId))!;
  const caption = (await repo.list("captions", { productionId: asset.productionId })).find((c) => c.kind === "FEED")?.text ?? "";
  const now = new Date().toISOString();
  let pub = await repo.insert("publications", {
    talent: asset.talent[0], productionId: asset.productionId, assetId: asset.id, provider: provider.name, status: "QUEUED", providerPostId: null, permalink: null, caption,
    error: null, retryable: false, attempts: 0, maxAttempts: 3, requestedBy: i.requestedBy, confirmedAt: now, publishedAt: null, jobId: null, origin: asset.origin,
  });
  pub = await runAttempt(repo, pub, provider, i.mockOutcome);
  return pub;
}

/** Retry a FAILED, retryable publication. Bounded by maxAttempts. */
export async function retryPublication(repo: Repo, publicationId: string, opts: { env?: Env; provider?: PublishProvider; mockOutcome?: MockOutcome } = {}): Promise<Publication> {
  const env = opts.env ?? process.env;
  if (isReadOnly(env)) throw new ReadOnlyError("publishing");
  const pub = await repo.get("publications", publicationId);
  if (!pub) throw new PublishError("Publication not found");
  if (pub.status !== "FAILED") throw new PublishError(`Only FAILED publications can be retried (this one is ${pub.status}).`);
  if (!pub.retryable) throw new PublishError("This failure is not retryable. Fix the cause and publish again.");
  if (pub.attempts >= pub.maxAttempts) throw new PublishError(`Retry limit reached (${pub.maxAttempts} attempts).`);
  const provider = opts.provider ?? (pub.provider === "MOCK_INSTAGRAM" ? mockInstagram(env) : resolvePublisher(env).provider);
  if (!provider) throw new PublishError("Publishing unavailable.");
  return runAttempt(repo, pub, provider, opts.mockOutcome);
}

async function runAttempt(repo: Repo, pub: Publication, provider: PublishProvider, mockOutcome?: MockOutcome): Promise<Publication> {
  const attempt = pub.attempts + 1;
  const job = await repo.insert("providerJobs", {
    runId: null, productionId: pub.productionId, provider: provider.name, model: null, operation: "publish.instagram", state: "SUBMITTED", externalId: null, error: null,
    assetId: pub.assetId, shotN: 1, costUsd: null, credits: null, briefId: null, attemptId: null, promptId: null, retryCount: attempt - 1, retryOfJobId: pub.jobId,
    startedAt: new Date().toISOString(), finishedAt: null, failureCategory: null, metadata: { publicationId: pub.id }, origin: pub.origin,
  });
  pub = await repo.update("publications", pub.id, { status: "PUBLISHING", attempts: attempt, jobId: job.id, error: null });
  const handle = (await repo.list("launchStates")).find((l) => l.talent === pub.talent)?.handle ?? null;
  try {
    const r = await provider.publish({ publicationId: pub.id, talent: pub.talent, handle, imageUrl: `/api/assets/${pub.assetId}/file`, caption: pub.caption, attempt, mockOutcome });
    const at = new Date().toISOString();
    await repo.update("providerJobs", job.id, { state: "SUCCEEDED", finishedAt: at, externalId: r.providerPostId });
    pub = await repo.update("publications", pub.id, { status: "PUBLISHED", providerPostId: r.providerPostId, permalink: r.permalink, publishedAt: at, retryable: false, error: null });
    await repo.update("assets", pub.assetId, { publication: "PUBLISHED" });
    await repo.update("productions", pub.productionId, { status: "PUBLISHED" });
    for (const c of await repo.list("calendarEntries", { productionId: pub.productionId })) await repo.update("calendarEntries", c.id, { state: "PUBLISHED" });
    if (!provider.live) await recordInsights(repo, pub, provider).catch(() => undefined); // mock snapshot so Analytics has something to show (labelled MOCK)
    return pub;
  } catch (e) {
    const pe = e instanceof ProviderError ? e : null;
    const msg = e instanceof Error ? e.message : "publish failed";
    const retryable = (pe?.retryable ?? false) && attempt < pub.maxAttempts;
    await repo.update("providerJobs", job.id, { state: "FAILED", finishedAt: new Date().toISOString(), error: msg, failureCategory: pe?.category ?? "unknown" });
    return repo.update("publications", pub.id, { status: "FAILED", error: msg, retryable });
  }
}

/** Store one insights snapshot for a published post. Mock provider rows are source "mock"; the live adapter does not exist. */
export async function recordInsights(repo: Repo, pub: Publication, provider: PublishProvider = mockInstagram(), now = new Date()) {
  if (pub.status !== "PUBLISHED" || !pub.providerPostId || !pub.publishedAt) throw new PublishError("Only published posts have insights.");
  const s = await provider.insights({ providerPostId: pub.providerPostId, publishedAt: pub.publishedAt, talent: pub.talent }, now);
  return repo.insert("analytics", {
    productionId: pub.productionId, publicationId: pub.id, talent: pub.talent, source: provider.live ? "imported" : "mock",
    views: s.views, reach: s.reach, likes: s.likes, comments: s.comments, shares: s.shares, saves: s.saves, profileVisits: s.profileVisits, follows: s.follows,
    watchTimeSec: null, completionRate: null, origin: pub.origin,
  });
}

/** Rows from a table that may not exist yet (migration not applied). Returns null instead of throwing so pages can say NOT MIGRATED. */
export async function listIfMigrated<T extends "publications">(repo: Repo, t: T) {
  try { return await repo.list(t); } catch { return null; }
}
