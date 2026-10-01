// Budget governor wiring. EXPLICIT FEATURE FLAG: NORTHLINE_GOVERNOR=on enables DB-backed limits, counters and audit (requires migration 0007).
// Flag OFF  -> behaviour is unchanged, EXCEPT the NORTHLINE_PAUSE env override, which is always honoured (it needs no database).
// Flag ON   -> every decision is audited in budget_decisions; unreadable/missing governor state fails CLOSED (no provider call).
// Reservation is taken immediately before the provider call. Release only for definitively non-billable failures; unknown outcomes stay counted.
import type { Repo } from "@/lib/db/repo";
import type { BudgetDecision } from "@/lib/db/records";
import { applicableImageLimits, checkAttempts, checkPause, dayKey, releaseImage, reserveImage, shouldRelease } from "./governor";
import { RepoGovernorStore } from "./repo-store";
import type { BudgetLimit, Decision, ImageRequest, Reservation } from "./types";

type Env = Record<string, string | undefined>;
export const governorEnabled = (env: Env = process.env) => (env.NORTHLINE_GOVERNOR ?? "").trim().toLowerCase() === "on";
/** Unattended (schedule / n8n / event-created) generation stays OFF unless this is explicitly "on". Operator-initiated work is never affected. */
export const autonomousGenerationEnabled = (env: Env = process.env) => (env.NORTHLINE_AUTONOMOUS_GENERATION ?? "").trim().toLowerCase() === "on";
export const isOperatorOrigin = (createdBy: string) => createdBy === "operator" || createdBy.startsWith("operator ");

export interface GuardCtx { creator: string; provider: string; productionId?: string | null; jobId?: string | null; now?: Date; env?: Env }
export interface Guard { allowed: boolean; decision: Decision; reservation: Reservation | null; limits: BudgetLimit[] }

type AuditRow = Omit<BudgetDecision, "id" | "createdAt" | "updatedAt" | "origin">;
async function audit(repo: Repo, row: Partial<AuditRow> & Pick<AuditRow, "decision" | "metric" | "scope" | "scopeKey">, c: GuardCtx) {
  await repo.insert("budgetDecisions", { limitValue: null, usedBefore: null, requested: 1, usedAfter: null, blockedReason: null, note: null, creator: c.creator, provider: c.provider, productionId: c.productionId ?? null, jobId: c.jobId ?? null, ...row });
}

/** Decide + reserve ONE image generation. Never throws. */
export async function guardImage(repo: Repo, c: GuardCtx): Promise<Guard> {
  const env = c.env ?? process.env, now = c.now ?? new Date();
  if (!governorEnabled(env)) {
    const pause = await checkPause({ getPause: async () => ({ enabled: false, reason: null, setBy: null, setAt: null }) } as never, env);
    return { allowed: pause.allowed, decision: pause, reservation: null, limits: [] };
  }
  const store = new RepoGovernorStore(repo);
  const req: ImageRequest = { creator: c.creator, provider: c.provider, now };
  let limits: BudgetLimit[] = [];
  try { limits = applicableImageLimits(await store.listLimits(), req); } catch { /* reserveImage fails closed on the same read */ }
  const { decision, reservation } = await reserveImage(store, req, env);
  try {
    if (!decision.allowed) {
      await audit(repo, { decision: "BLOCKED", metric: "images_per_day", scope: decision.scope ?? "global", scopeKey: decision.scopeKey ?? "", limitValue: decision.limit ?? null, usedBefore: decision.used ?? null, usedAfter: decision.used ?? null, blockedReason: `${decision.code}: ${decision.reason}`, requested: 1 }, c);
    } else {
      for (const ref of reservation!.refs) {
        const l = limits.find((x) => x.scope === ref.scope && x.scopeKey === ref.scopeKey);
        const after = await store.getUsed(ref);
        await audit(repo, { decision: "ALLOWED", metric: "images_per_day", scope: ref.scope, scopeKey: ref.scopeKey, limitValue: l?.limitValue ?? null, usedBefore: Math.max(0, after - 1), usedAfter: after, note: `window ${dayKey(now)}` }, c);
      }
    }
  } catch (e) {
    // "Every decision auditable": if the audit cannot be written, do not proceed — give the reservation back and refuse.
    await releaseImage(store, reservation).catch(() => undefined);
    const reason = `Budget audit could not be written (${e instanceof Error ? e.message : "error"}); refusing to generate (fail closed).`;
    return { allowed: false, decision: { allowed: false, code: "GOVERNOR_UNAVAILABLE", reason }, reservation: null, limits };
  }
  return { allowed: decision.allowed, decision, reservation, limits };
}

export type Outcome = { kind: "success" } | { kind: "failure"; category: string | null | undefined };
/** After the provider call: success → SETTLED_BILLABLE; definitively non-billable failure → release + RELEASED; anything else stays counted (SETTLED_UNKNOWN). */
export async function settleImage(repo: Repo, g: Guard, o: Outcome, c: GuardCtx): Promise<"billable" | "released" | "unknown" | "none"> {
  if (!g.reservation) return "none";
  const store = new RepoGovernorStore(repo);
  const kind: "billable" | "released" | "unknown" = o.kind === "success" ? "billable" : shouldRelease(o.category) ? "released" : "unknown";
  if (kind === "released") await releaseImage(store, g.reservation);
  for (const ref of g.reservation.refs) {
    const l = g.limits.find((x) => x.scope === ref.scope && x.scopeKey === ref.scopeKey);
    let used: number | null = null; try { used = await store.getUsed(ref); } catch { /* audit best-effort after the fact */ }
    try {
      await audit(repo, { decision: kind === "billable" ? "SETTLED_BILLABLE" : kind === "released" ? "RELEASED" : "SETTLED_UNKNOWN", metric: "images_per_day", scope: ref.scope, scopeKey: ref.scopeKey, limitValue: l?.limitValue ?? null, usedBefore: used === null ? null : kind === "released" ? used + 1 : used, usedAfter: used, note: o.kind === "success" ? "image produced" : `failure=${o.category ?? "unknown"}${kind === "unknown" ? " (billing unknown: kept counted)" : ""}` }, c);
    } catch { /* the reservation outcome is already applied; a lost settle row must not mask the generation result */ }
  }
  return kind;
}

/** Lifetime attempt caps for a regeneration. Returns a blocking Decision (audited) or {allowed:true}. Reads limits only when the flag is on. */
export async function guardAttempts(repo: Repo, c: GuardCtx & { attemptsForAsset: number; attemptsForProduction: number }): Promise<Decision> {
  const env = c.env ?? process.env;
  if (!governorEnabled(env)) return { allowed: true };
  let d: Decision;
  try { d = checkAttempts(await new RepoGovernorStore(repo).listLimits(), c); } catch { d = { allowed: false, code: "GOVERNOR_UNAVAILABLE", reason: "Budget limits could not be read; refusing to regenerate (fail closed)." }; }
  if (!d.allowed) {
    const metric = d.code === "ATTEMPTS_PER_ASSET" ? "attempts_per_asset" : d.code === "ATTEMPTS_PER_PRODUCTION" ? "attempts_per_production" : "images_per_day";
    try { await audit(repo, { decision: "BLOCKED", metric, scope: "global", scopeKey: "", limitValue: d.limit ?? null, usedBefore: d.used ?? null, usedAfter: d.used ?? null, blockedReason: `${d.code}: ${d.reason}` }, c); } catch { /* still blocked */ }
  }
  return d;
}

/** Task kinds that spend image-generation budget. */
export const GENERATION_KINDS = new Set(["production.create", "production.regenerate"]);

/** Why queued generation tasks must not START right now (pause), or null. Env override always wins; DB pause only when the flag is on; unreadable state with the flag on fails closed. */
export async function generationHold(repo: Repo, env: Env = process.env): Promise<string | null> {
  const store = governorEnabled(env) ? new RepoGovernorStore(repo) : { getPause: async () => ({ enabled: false, reason: null, setBy: null, setAt: null }) };
  const d = await checkPause(store as never, env);
  return d.allowed ? null : d.reason;
}
/** Why a QUEUED task may not be picked up by the background worker (undefined = eligible). Operator-created work is never held by the autonomy switch. */
export function holdForTask(t: { kind: string; createdBy: string }, hold: string | null, env: Env = process.env): string | undefined {
  if (!GENERATION_KINDS.has(t.kind)) return undefined;
  if (hold) return hold;
  if (!isOperatorOrigin(t.createdBy) && !autonomousGenerationEnabled(env)) return "Autonomous generation is DISABLED (NORTHLINE_AUTONOMOUS_GENERATION is not on); only operator-started generation runs.";
  return undefined;
}
