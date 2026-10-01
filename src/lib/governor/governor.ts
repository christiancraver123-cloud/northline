import type { BlockCode, BudgetLimit, CounterRef, Decision, GovernorStore, ImageRequest, Metric, Reservation, Scope } from "./types";

/** Reset semantics: image caps are per UTC calendar day; a new day is a NEW counter row (old rows are kept for audit). */
export const dayKey = (now: Date) => now.toISOString().slice(0, 10);
export const nextReset = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();

const envPaused = (env: Record<string, string | undefined>) => ["true", "1", "yes"].includes((env.NORTHLINE_PAUSE ?? "").trim().toLowerCase());

/** Which limit rows apply to an image request: global, this creator, this provider (enabled only). */
export const applicableImageLimits = (limits: BudgetLimit[], req: ImageRequest): BudgetLimit[] =>
  limits.filter((l) => l.enabled && l.metric === "images_per_day" && (l.scope === "global" || (l.scope === "creator" && l.scopeKey === req.creator) || (l.scope === "provider" && l.scopeKey === req.provider)));

const scopeLabel = (s: Scope, k: string) => (s === "global" ? "global" : `${s} ${k}`);

/**
 * Check the emergency pause. The env override (NORTHLINE_PAUSE) ALWAYS wins and cannot be lifted from the database.
 * Fail closed: if the pause state cannot be read, unattended generation is refused.
 */
export async function checkPause(store: GovernorStore, env: Record<string, string | undefined> = process.env): Promise<Decision> {
  if (envPaused(env)) return { allowed: false, code: "EMERGENCY_PAUSE", reason: "Emergency pause is ON (NORTHLINE_PAUSE environment override)." };
  try {
    const p = await store.getPause();
    if (p.enabled) return { allowed: false, code: "EMERGENCY_PAUSE", reason: `Emergency pause is ON${p.reason ? `: ${p.reason}` : ""}${p.setBy ? ` (set by ${p.setBy})` : ""}.` };
    return { allowed: true };
  } catch {
    return { allowed: false, code: "GOVERNOR_UNAVAILABLE", reason: "Budget governor state could not be read; refusing to generate (fail closed)." };
  }
}

/** Lifetime attempt caps. Counts come from existing rows (assets per production+shot; generation_attempts per production), so no counter table is needed. */
export function checkAttempts(limits: BudgetLimit[], c: { attemptsForAsset: number; attemptsForProduction: number }): Decision {
  const find = (m: Metric) => limits.find((l) => l.enabled && l.scope === "global" && l.metric === m);
  const a = find("attempts_per_asset"), p = find("attempts_per_production");
  if (a && c.attemptsForAsset >= a.limitValue) return { allowed: false, code: "ATTEMPTS_PER_ASSET", reason: `This frame already has ${c.attemptsForAsset} generation attempt(s); the limit is ${a.limitValue}. Raise the limit explicitly to continue.`, scope: "global", limit: a.limitValue, used: c.attemptsForAsset, resetsAt: null };
  if (p && c.attemptsForProduction >= p.limitValue) return { allowed: false, code: "ATTEMPTS_PER_PRODUCTION", reason: `This production already has ${c.attemptsForProduction} attempt(s); the limit is ${p.limitValue}. Raise the limit explicitly to continue.`, scope: "global", limit: p.limitValue, used: c.attemptsForProduction, resetsAt: null };
  return { allowed: true };
}

const refFor = (l: BudgetLimit, now: Date): CounterRef => ({ metric: "images_per_day", scope: l.scope, scopeKey: l.scopeKey, windowKey: dayKey(now) });

/**
 * Reserve ONE image generation against every applicable daily cap (global + creator + provider), all-or-nothing:
 * each counter is incremented with an atomic compare-and-set; if a later scope refuses, the earlier increments are rolled back.
 * Concurrent workers can therefore never jointly exceed a cap. Call BEFORE the provider call; `release` after a non-billable failure.
 */
export async function reserveImage(store: GovernorStore, req: ImageRequest, env: Record<string, string | undefined> = process.env): Promise<{ decision: Decision; reservation: Reservation | null }> {
  const now = req.now ?? new Date();
  const pause = await checkPause(store, env);
  if (!pause.allowed) return { decision: pause, reservation: null };
  let limits: BudgetLimit[];
  try { limits = applicableImageLimits(await store.listLimits(), req); if (!limits.some((l) => l.scope === "global")) throw new Error("no global daily image limit"); } catch { return { decision: { allowed: false, code: "GOVERNOR_UNAVAILABLE", reason: "Budget limits could not be read; refusing to generate (fail closed)." }, reservation: null }; }
  const taken: CounterRef[] = [];
  for (const l of limits) {
    const ref = refFor(l, now);
    const r = await store.incrementIfBelow(ref, l.limitValue);
    if (!r.ok) {
      for (const t of taken) await store.decrement(t); // roll back what this request already took
      return { decision: { allowed: false, code: "IMAGES_PER_DAY", reason: `Daily image cap reached for ${scopeLabel(l.scope, l.scopeKey)}: ${r.used}/${l.limitValue} today (UTC). Resets ${nextReset(now)}.`, scope: l.scope, scopeKey: l.scopeKey, limit: l.limitValue, used: r.used, resetsAt: nextReset(now) }, reservation: null };
    }
    taken.push(ref);
  }
  return { decision: { allowed: true }, reservation: { refs: taken, at: now.toISOString() } };
}

/** Give a reservation back (the provider call produced no billable image). Idempotent per call site: call once per reservation. */
export async function releaseImage(store: GovernorStore, r: Reservation | null): Promise<void> { if (r) for (const ref of r.refs) await store.decrement(ref); }

/** Failure categories after which NO image was billed, so the reservation is released. Timeouts/unknown stay counted (conservative: they may have billed). */
export const NON_BILLABLE_FAILURES = new Set(["quota_exceeded", "auth", "invalid_request", "provider_unavailable", "rate_limited"]);
export const shouldRelease = (failureCategory: string | null | undefined) => !!failureCategory && NON_BILLABLE_FAILURES.has(failureCategory);

export interface BudgetStatusRow { scope: Scope; scopeKey: string; metric: Metric; limit: number; used: number | null; remaining: number | null; resetsAt: string | null; enabled: boolean }
/** Operator-visible status: pause state + every limit with today's usage. */
export async function budgetStatus(store: GovernorStore, now = new Date(), env: Record<string, string | undefined> = process.env) {
  const pause = await store.getPause();
  const rows: BudgetStatusRow[] = [];
  for (const l of await store.listLimits()) {
    const windowed = l.metric === "images_per_day";
    const used = windowed ? await store.getUsed(refFor(l, now)) : null;
    rows.push({ scope: l.scope, scopeKey: l.scopeKey, metric: l.metric, limit: l.limitValue, used, remaining: used === null ? null : Math.max(0, l.limitValue - used), resetsAt: windowed ? nextReset(now) : null, enabled: l.enabled });
  }
  return { paused: pause.enabled || envPaused(env), pause, envOverride: envPaused(env), limits: rows };
}
export type { BlockCode };
