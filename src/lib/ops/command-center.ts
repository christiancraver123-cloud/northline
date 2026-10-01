// Command Center view-model: a PURE derivation of operational state from persisted rows + env. Nothing here calls a provider or writes.
// Honesty rule: where the system has no instrumentation the value is "UNKNOWN" or "NOT CONFIGURED" — never a guess, never a placeholder number.
import type { AgentTask, LlmCall, Production, ProviderJob } from "@/lib/db/records";
import type { ProviderHealth } from "@/lib/llm/health-derived";
import type { BudgetStatusRow } from "@/lib/governor/governor";
import { autonomousGenerationEnabled, governorEnabled, holdForTask } from "@/lib/governor/service";
import { durableEnabled, jobStage } from "@/lib/jobs/durable";
import { isReadOnly } from "@/lib/runtime/mode";

type Env = Record<string, string | undefined>;
export const UNKNOWN = "UNKNOWN" as const;
export const NOT_CONFIGURED = "NOT CONFIGURED" as const;
const dayStart = (now: Date) => `${now.toISOString().slice(0, 10)}T00:00:00.000Z`;

export interface BudgetView {
  governor: "ON" | "OFF";
  pause: { paused: boolean | typeof UNKNOWN; source: "env" | "database" | "none" | typeof UNKNOWN; reason: string | null };
  /** Images actually produced today (UTC), counted from provider_jobs — available even when the governor is off. */
  imagesToday: { total: number; byCreator: Record<string, number>; byProvider: Record<string, number> };
  /** Configured limits + remaining. NOT CONFIGURED when the governor flag is off or migration 0007 is not applied. */
  limits: typeof NOT_CONFIGURED | typeof UNKNOWN | (BudgetStatusRow & { used: number })[];
  resetsAt: string;
}
export interface CommandCenter {
  system: { mode: "read-only" | "production" | "development"; store: string; durableJobs: "ON" | "OFF"; jobStage: number | "n/a"; governor: "ON" | "OFF"; autonomousGeneration: "ENABLED" | "DISABLED"; migrations: string };
  workers: { active: { workerId: string; tasks: number; lastHeartbeat: string | null }[]; idle: typeof UNKNOWN; failed24h: number; lastActivityAt: string | null; note: string };
  queue: { queued: number; running: number; blocked: number; failed: number; completed: number; waiting: number; held: { id: string; kind: string; reason: string }[]; retryScheduled: number };
  providers: { id: string; label: string; state: string; detail: string }[];
  budget: BudgetView;
  approvalsWaiting: number;
  productionsInProgress: { id: string; code: string; status: string }[];
  attention: { kind: "task" | "job" | "blocked"; id: string; text: string; at: string }[];
  recentCompleted: { id: string; kind: string; title: string; at: string }[];
  /** Stored learning states need the learnings table (proposed migration 0009, NOT applied) → NOT CONFIGURED until then. */
  learnings: typeof NOT_CONFIGURED | { proposed: number; testing: number; supported: number; awaitingApproval: number; active: number };
  /** Computed on the fly from human decisions; advisory, not stored, never applied. */
  learningDerived: { proposals: number; identityFlags: number; decisions: number };
}

export interface CommandCenterInput {
  tasks: AgentTask[]; jobs: ProviderJob[]; llmCalls?: LlmCall[]; productions: Production[]; approvalsPending: number; health: ProviderHealth[];
  budgetLimits?: BudgetStatusRow[] | null | "error"; dbPause?: { enabled: boolean; reason: string | null } | null | "error";
  learnings?: CommandCenter["learnings"]; learningDerived?: CommandCenter["learningDerived"]; storeDriver: string; now?: Date; env?: Env; lastRunAt?: string | null; migrationState?: string;
}

export function buildCommandCenter(i: CommandCenterInput): CommandCenter {
  const now = i.now ?? new Date(), env = i.env ?? process.env, since24 = new Date(now.getTime() - 86_400_000).toISOString(), since7 = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const gov = governorEnabled(env), durable = durableEnabled(env);
  const envPause = ["true", "1", "yes"].includes((env.NORTHLINE_PAUSE ?? "").trim().toLowerCase());
  const pauseView: BudgetView["pause"] = envPause ? { paused: true, source: "env", reason: "NORTHLINE_PAUSE environment override" }
    : !gov ? { paused: false, source: "none", reason: "DB pause not consulted (governor OFF)" }
    : i.dbPause === "error" || i.dbPause == null ? { paused: UNKNOWN, source: UNKNOWN, reason: "pause state could not be read" }
    : { paused: i.dbPause.enabled, source: "database", reason: i.dbPause.reason };

  const byCreator: Record<string, number> = {}, byProvider: Record<string, number> = {};
  const prodById = new Map(i.productions.map((p) => [p.id, p]));
  const today = dayStart(now);
  let total = 0;
  for (const j of i.jobs) {
    if (j.operation !== "image.generate" || j.state !== "SUCCEEDED" || (j.finishedAt ?? j.startedAt ?? "") < today) continue;
    total++;
    const c = prodById.get(j.productionId ?? "")?.talent[0] ?? UNKNOWN;
    byCreator[c] = (byCreator[c] ?? 0) + 1; byProvider[j.provider] = (byProvider[j.provider] ?? 0) + 1;
  }
  const limits: BudgetView["limits"] = !gov ? NOT_CONFIGURED : i.budgetLimits === "error" || i.budgetLimits == null ? UNKNOWN : i.budgetLimits.map((r) => ({ ...r, used: r.used ?? 0 }));
  const nextReset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();

  const by = (s: AgentTask["status"]) => i.tasks.filter((t) => t.status === s);
  const held: CommandCenter["queue"]["held"] = [];
  const genHold = envPause ? "Emergency pause (NORTHLINE_PAUSE)" : pauseView.paused === true ? "Emergency pause" : null;
  for (const t of by("QUEUED")) {
    const reason = holdForTask(t, genHold, env) ?? (t.runAfter && t.runAfter > now.toISOString() ? `retry scheduled for ${t.runAfter}` : undefined);
    if (reason) held.push({ id: t.id, kind: t.kind, reason });
  }
  const running = by("RUNNING"), workers = new Map<string, { tasks: number; lastHeartbeat: string | null }>();
  for (const t of running) { const w = t.claimedBy ?? UNKNOWN; const e = workers.get(w) ?? { tasks: 0, lastHeartbeat: null }; e.tasks++; if ((t.heartbeatAt ?? t.startedAt ?? "") > (e.lastHeartbeat ?? "")) e.lastHeartbeat = t.heartbeatAt ?? t.startedAt; workers.set(w, e); }

  const attention: CommandCenter["attention"] = [
    ...i.tasks.filter((t) => t.status === "FAILED" && (t.finishedAt ?? t.createdAt) >= since7).map((t) => ({ kind: "task" as const, id: t.id, text: `${t.kind}: ${t.error ?? "failed"}`, at: t.finishedAt ?? t.createdAt })),
    ...by("BLOCKED").map((t) => ({ kind: "blocked" as const, id: t.id, text: `${t.kind} BLOCKED — ${t.blockedReason ?? "reason not recorded"}`, at: t.updatedAt })),
    ...i.jobs.filter((j) => j.state === "FAILED" && j.failureCategory !== "budget_blocked" && (j.finishedAt ?? j.createdAt) >= since7).map((j) => ({ kind: "job" as const, id: j.id, text: `image job failed (${j.failureCategory ?? "unknown"}): ${j.error ?? ""}`.slice(0, 220), at: j.finishedAt ?? j.createdAt })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12);

  const completed = by("COMPLETE");
  return {
    system: { mode: isReadOnly(env) ? "read-only" : env.NODE_ENV === "production" ? "production" : "development", store: i.storeDriver, durableJobs: durable ? "ON" : "OFF", jobStage: durable ? jobStage(env) : "n/a", governor: gov ? "ON" : "OFF", autonomousGeneration: autonomousGenerationEnabled(env) ? "ENABLED" : "DISABLED", migrations: i.migrationState ?? UNKNOWN },
    workers: { active: [...workers].map(([workerId, v]) => ({ workerId, ...v })), idle: UNKNOWN, failed24h: i.tasks.filter((t) => t.status === "FAILED" && (t.finishedAt ?? "") >= since24).length, lastActivityAt: i.lastRunAt ?? null, note: "There is no worker registry: an idle worker leaves no trace, so idle workers are UNKNOWN. Active = workers currently holding a lease." },
    queue: { queued: by("QUEUED").length, running: running.length, blocked: by("BLOCKED").length, failed: by("FAILED").length, completed: completed.length, waiting: by("WAITING").length, held, retryScheduled: by("QUEUED").filter((t) => t.runAfter && t.runAfter > now.toISOString()).length },
    providers: i.health.map((h) => ({ id: h.id, label: h.label, state: h.state, detail: h.detail })),
    budget: { governor: gov ? "ON" : "OFF", pause: pauseView, imagesToday: { total, byCreator, byProvider }, limits, resetsAt: nextReset },
    approvalsWaiting: i.approvalsPending,
    productionsInProgress: i.productions.filter((p) => p.status === "GENERATING" || p.status === "RAW").map((p) => ({ id: p.id, code: p.code, status: p.status })),
    attention,
    recentCompleted: completed.sort((a, b) => (b.finishedAt ?? "").localeCompare(a.finishedAt ?? "")).slice(0, 6).map((t) => ({ id: t.id, kind: t.kind, title: t.title, at: t.finishedAt ?? t.updatedAt })),
    learnings: i.learnings ?? NOT_CONFIGURED,
    learningDerived: i.learningDerived ?? { proposals: 0, identityFlags: 0, decisions: 0 },
  };
}
