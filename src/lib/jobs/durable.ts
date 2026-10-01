// Durable jobs — STAGE 1 foundation. Everything here is behind NORTHLINE_DURABLE_JOBS=on (requires migrations 0007 + 0008); with the flag
// off the legacy worker semantics are untouched. Stages are cumulative and NEVER advance automatically (NORTHLINE_JOB_STAGE is set by a human):
//   1 durable non-provider test jobs (system.*)        2 + QA / read-only analysis jobs
//   3 + ONE controlled generation, operator-started    4 + scheduled generation under strict governor limits (also needs NORTHLINE_AUTONOMOUS_GENERATION=on)
//   5 + unattended content-buffer maintenance
// The stage gate applies to the BACKGROUND worker (tick / scripts/worker.ts). Operator-started inline work is not stage-gated.
import type { AgentTask } from "@/lib/db/records";

type Env = Record<string, string | undefined>;
export const durableEnabled = (env: Env = process.env) => (env.NORTHLINE_DURABLE_JOBS ?? "").trim().toLowerCase() === "on";
export type Stage = 1 | 2 | 3 | 4 | 5;
export function jobStage(env: Env = process.env): Stage {
  const n = parseInt(env.NORTHLINE_JOB_STAGE ?? "", 10);
  return (n >= 1 && n <= 5 ? n : 1) as Stage; // unset/invalid = the most conservative stage
}

const QA_ANALYSIS = /^(identity_qa|continuity_qa|technical_qa|content_qa)\.|^(orchestrator\.(report|consolidate)|production\.(digest|finalize)|performance\.report|growth\.recommendations|strategist\.concepts|director\.concepts)$/;
const GENERATION = new Set(["production.create", "production.regenerate"]);
/** May the background worker START this task at the current stage? Generation additionally needs an operator-created task before stage 4. */
export function stageAllows(stage: Stage, t: { kind: string; createdBy: string }): { ok: true } | { ok: false; reason: string } {
  if (t.kind.startsWith("system.")) return { ok: true };
  if (GENERATION.has(t.kind)) {
    if (stage < 3) return { ok: false, reason: `Job stage ${stage}: generation jobs are not enabled (needs stage 3+).` };
    const operator = t.createdBy === "operator" || t.createdBy.startsWith("operator ");
    if (!operator && stage < 4) return { ok: false, reason: `Job stage ${stage}: only operator-started generation runs (scheduled generation needs stage 4+).` };
    return { ok: true };
  }
  if (QA_ANALYSIS.test(t.kind)) return stage >= 2 ? { ok: true } : { ok: false, reason: `Job stage ${stage}: QA/analysis jobs need stage 2+.` };
  return stage >= 5 ? { ok: true } : { ok: false, reason: `Job stage ${stage}: "${t.kind}" is not enabled at this stage.` };
}

// ---- failure classification ------------------------------------------------------------
export type FailureClass = "transient" | "quota" | "auth" | "budget" | "invalid" | "stuck" | "unknown";
export interface Classified { class: FailureClass; retry: boolean }
/** Map an error to a class. Retry only transient failures; quota/auth/budget BLOCK (a human or a reset must clear them); invalid/unknown fail loudly. */
export function classifyFailure(e: unknown): Classified {
  const m = (e instanceof Error ? e.message : String(e ?? "")).toLowerCase();
  const cat = (e as { category?: string } | null)?.category;
  if (cat === "budget_blocked" || /budget limit|emergency pause|daily image cap|governor/.test(m)) return { class: "budget", retry: false };
  if (cat === "quota_exceeded" || /quota|insufficient_quota|billing/.test(m)) return { class: "quota", retry: false };
  if (cat === "auth" || /credentials rejected|http 40[13]|unauthori[sz]ed/.test(m)) return { class: "auth", retry: false };
  if (cat === "invalid_request" || cat === "content_policy" || /validation|invalid|no handler/.test(m)) return { class: "invalid", retry: false };
  if (cat === "rate_limited" || cat === "timeout" || cat === "provider_unavailable" || /rate limit|timed out|timeout|temporar|unavailable|econnreset|fetch failed|network/.test(m)) return { class: "transient", retry: true };
  return { class: "unknown", retry: false };
}
/** Exponential backoff with a cap. Deterministic (no jitter) so behaviour is testable; the cap keeps retries bounded in time. */
export const backoffMs = (attemptsSoFar: number, baseSec = 30, capSec = 1800) => Math.min(capSec, baseSec * 2 ** Math.max(0, attemptsSoFar - 1)) * 1000;

export type Outcome =
  | { status: "QUEUED"; runAfter: string; failureClass: FailureClass; error: string }
  | { status: "BLOCKED"; blockedReason: string; failureClass: FailureClass; error: string }
  | { status: "FAILED"; failureClass: FailureClass; error: string };
/** What to do with a task whose run just failed. Pure. Generation kinds are NEVER auto-requeued (would spend budget unattended / duplicate productions). */
export function planFailure(t: Pick<AgentTask, "kind" | "attempts" | "maxAttempts">, e: unknown, now: Date, o: { noRequeue: boolean }): Outcome {
  const c = classifyFailure(e), error = e instanceof Error ? e.message : String(e ?? "unknown error");
  const max = t.maxAttempts ?? 3;
  if (c.class === "quota" || c.class === "auth" || c.class === "budget") return { status: "BLOCKED", blockedReason: `${c.class}: ${error}`.slice(0, 500), failureClass: c.class, error };
  if (c.retry && !o.noRequeue && t.attempts < max) return { status: "QUEUED", runAfter: new Date(now.getTime() + backoffMs(t.attempts)).toISOString(), failureClass: c.class, error };
  return { status: "FAILED", failureClass: c.class, error: c.retry && t.attempts >= max ? `${error} (gave up after ${t.attempts} attempt(s))` : error };
}
