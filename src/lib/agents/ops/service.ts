// Agent Operations service: persistent identity, queue, status derivation, activity log.
// Agents are persistent workers: they do nothing (and cost nothing) until a task is queued by an operator message,
// an event, or a due schedule. "Status" is derived from real rows, never stored or faked.
import type { Repo } from "@/lib/db/repo";
import type { Agent, AgentCode, AgentEvent, AgentSchedule, AgentStatus, AgentTask, TaskStatus } from "@/lib/db/records";
import type { Origin as OriginT, TalentCode } from "@/lib/domain/types";
import { AGENT_DEFS, DEFAULT_SCHEDULES } from "./registry";
import { nextRun } from "./cron";

type O = OriginT;

export async function ensureAgents(repo: Repo): Promise<Agent[]> {
  const existing = await repo.list("agents");
  const have = new Set(existing.map((a) => a.code));
  for (const d of AGENT_DEFS) {
    if (!have.has(d.code)) existing.push(await repo.insert("agents", { code: d.code, name: d.name, role: d.role, paused: false, notes: "", config: {} }));
  }
  if (!(await repo.list("agentSchedules")).length) {
    for (const s of DEFAULT_SCHEDULES) await repo.insert("agentSchedules", { ...s, taskInput: {}, enabled: false, lastRunAt: null, nextRunAt: null, source: "northline" });
  }
  const order = new Map(AGENT_DEFS.map((d, i) => [d.code, i]));
  return existing.sort((a, b) => (order.get(a.code)! - order.get(b.code)!));
}

export interface TraceCtx { taskId?: string | null; runId?: string | null; origin?: O }

export async function logEvent(repo: Repo, agentId: AgentCode, kind: string, message: string, ctx: TraceCtx & { level?: "info" | "warn" | "error"; data?: Record<string, unknown> } = {}): Promise<AgentEvent> {
  return repo.insert("agentEvents", { agentId, taskId: ctx.taskId ?? null, runId: ctx.runId ?? null, level: ctx.level ?? "info", kind, message, data: ctx.data ?? {}, origin: ctx.origin ?? "live" });
}

export interface EnqueueInput {
  agentId: AgentCode; kind: string; title: string; input?: Record<string, unknown>; priority?: number; dependsOn?: string[];
  parentTaskId?: string | null; assignmentId?: string | null; productionId?: string | null; talent?: TalentCode | null;
  createdBy?: string; waitingOn?: string | null; runAfter?: string | null; status?: TaskStatus; origin?: O;
}
export async function enqueue(repo: Repo, t: EnqueueInput): Promise<AgentTask> {
  const task = await repo.insert("agentTasks", {
    agentId: t.agentId, kind: t.kind, title: t.title, input: t.input ?? {}, output: null, status: t.status ?? "QUEUED", priority: t.priority ?? 3,
    dependsOn: t.dependsOn ?? [], parentTaskId: t.parentTaskId ?? null, assignmentId: t.assignmentId ?? null, productionId: t.productionId ?? null,
    talent: t.talent ?? null, createdBy: t.createdBy ?? "operator", waitingOn: t.waitingOn ?? null, runAfter: t.runAfter ?? null,
    startedAt: null, finishedAt: null, error: null, origin: t.origin ?? "live",
  });
  await logEvent(repo, t.agentId, t.status === "WAITING" ? "WAITING" : "TASK_QUEUED", `${t.status === "WAITING" ? "Waiting" : "Queued"}: ${t.title}`, { taskId: task.id, origin: t.origin, data: { kind: t.kind, createdBy: t.createdBy ?? "operator", priority: task.priority } });
  return task;
}

const TERMINAL: TaskStatus[] = ["COMPLETE", "FAILED", "CANCELLED"];

export interface AgentSnapshot {
  agent: Agent; status: AgentStatus; current: AgentTask | null; queued: number; blocked: number; waiting: number;
  lastEvent: AgentEvent | null; lastError: string | null; nextSchedule: AgentSchedule | null;
}

/** Derive an agent's status from real rows. Order: PAUSED > WORKING > FAILED > QUEUED > WAITING > SCHEDULED > IDLE. */
export function deriveStatus(agent: Agent, tasks: AgentTask[], schedules: AgentSchedule[], heldTalent: TalentCode[] = []): Pick<AgentSnapshot, "status" | "current" | "queued" | "blocked" | "waiting" | "lastError" | "nextSchedule"> {
  const mine = tasks.filter((t) => t.agentId === agent.code);
  const running = mine.find((t) => t.status === "RUNNING") ?? null;
  const queuedAll = mine.filter((t) => t.status === "QUEUED");
  const done = new Set(tasks.filter((t) => t.status === "COMPLETE").map((t) => t.id));
  const blockedFn = (t: AgentTask) => (t.talent && heldTalent.includes(t.talent)) || t.dependsOn.some((d) => !done.has(d)) || (t.runAfter != null && t.runAfter > new Date().toISOString());
  const eligible = queuedAll.filter((t) => !blockedFn(t));
  const waiting = mine.filter((t) => t.status === "WAITING").length;
  const lastTerminal = mine.filter((t) => t.status === "COMPLETE" || t.status === "FAILED").sort((a, b) => (b.finishedAt ?? "").localeCompare(a.finishedAt ?? ""))[0];
  const nextSchedule = schedules.filter((s) => s.agentId === agent.code && s.enabled && s.nextRunAt).sort((a, b) => a.nextRunAt!.localeCompare(b.nextRunAt!))[0] ?? null;
  let status: AgentStatus = "IDLE";
  if (agent.paused) status = "PAUSED";
  else if (running) status = "WORKING";
  else if (lastTerminal?.status === "FAILED") status = "FAILED";
  else if (eligible.length) status = "QUEUED";
  else if (waiting || queuedAll.length) status = "WAITING";
  else if (nextSchedule) status = "SCHEDULED";
  return { status, current: running ?? eligible[0] ?? null, queued: eligible.length, blocked: queuedAll.length - eligible.length, waiting, lastError: lastTerminal?.status === "FAILED" ? lastTerminal.error : null, nextSchedule };
}

export async function heldTalent(repo: Repo): Promise<TalentCode[]> {
  const o = (await repo.list("agents")).find((a) => a.code === "ORCHESTRATOR");
  return o?.config.pausedTalent ?? [];
}

export async function snapshots(repo: Repo): Promise<AgentSnapshot[]> {
  const agents = await ensureAgents(repo);
  const [tasks, schedules, events, held] = await Promise.all([repo.list("agentTasks"), repo.list("agentSchedules"), repo.list("agentEvents"), heldTalent(repo)]);
  return agents.map((agent) => {
    const d = deriveStatus(agent, tasks, schedules, held);
    const lastEvent = events.filter((e) => e.agentId === agent.code).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
    return { agent, lastEvent, ...d };
  });
}

// ---- operator controls ---------------------------------------------------------
async function agentRow(repo: Repo, code: AgentCode) {
  const a = (await ensureAgents(repo)).find((x) => x.code === code);
  if (!a) throw new Error(`Unknown agent ${code}`);
  return a;
}
export async function setPaused(repo: Repo, code: AgentCode, paused: boolean, by = "operator") {
  const a = await agentRow(repo, code);
  await repo.update("agents", a.id, { paused });
  await logEvent(repo, code, paused ? "PAUSED" : "RESUMED", `${paused ? "Paused" : "Resumed"} by ${by}`);
}
export async function setNotes(repo: Repo, code: AgentCode, notes: string) {
  const a = await agentRow(repo, code);
  await repo.update("agents", a.id, { notes: notes.slice(0, 1000) });
}
export async function setTalentFlag(repo: Repo, flag: "priorityTalent" | "pausedTalent", talent: TalentCode, on: boolean) {
  const o = await agentRow(repo, "ORCHESTRATOR");
  const cur = new Set(o.config[flag] ?? []);
  on ? cur.add(talent) : cur.delete(talent);
  await repo.update("agents", o.id, { config: { ...o.config, [flag]: [...cur] } });
  await logEvent(repo, "ORCHESTRATOR", flag === "pausedTalent" ? (on ? "TALENT_HELD" : "TALENT_RELEASED") : (on ? "TALENT_PRIORITISED" : "TALENT_DEPRIORITISED"), `${talent} ${flag === "pausedTalent" ? (on ? "production held" : "production resumed") : (on ? "prioritised" : "no longer prioritised")}`, { data: { talent } });
}
/** Promote queued tasks for a creator to priority 1. Returns how many were changed. */
export async function boostTalentTasks(repo: Repo, talent: TalentCode): Promise<number> {
  let n = 0;
  for (const t of await repo.list("agentTasks", { status: "QUEUED", talent })) if (t.priority > 1) { await repo.update("agentTasks", t.id, { priority: 1 }); n++; }
  return n;
}
export async function reprioritize(repo: Repo, taskId: string, priority: number) {
  const t = await repo.get("agentTasks", taskId);
  if (!t || t.status !== "QUEUED") throw new Error("Only queued tasks can be reprioritised.");
  await repo.update("agentTasks", taskId, { priority: Math.min(5, Math.max(1, priority)) });
  await logEvent(repo, t.agentId, "REPRIORITISED", `Priority of "${t.title}" set to ${priority}`, { taskId });
}
export async function cancelTask(repo: Repo, taskId: string) {
  const t = await repo.get("agentTasks", taskId);
  if (!t || TERMINAL.includes(t.status) || t.status === "RUNNING") throw new Error("Only queued or waiting tasks can be cancelled.");
  await repo.update("agentTasks", taskId, { status: "CANCELLED", finishedAt: new Date().toISOString() });
  await logEvent(repo, t.agentId, "TASK_CANCELLED", `Cancelled: ${t.title}`, { taskId });
}
export async function retryTask(repo: Repo, taskId: string) {
  const t = await repo.get("agentTasks", taskId);
  if (!t || t.status !== "FAILED") throw new Error("Only failed tasks can be retried.");
  await repo.update("agentTasks", taskId, { status: "QUEUED", error: null, finishedAt: null, startedAt: null });
  await logEvent(repo, t.agentId, "TASK_RETRY", `Retrying: ${t.title}`, { taskId });
}

// ---- schedules --------------------------------------------------------------------
export async function setScheduleEnabled(repo: Repo, id: string, enabled: boolean, now = new Date()) {
  const s = await repo.get("agentSchedules", id);
  if (!s) throw new Error("Schedule not found");
  const nx = enabled ? nextRun(s.cron, now) : null;
  await repo.update("agentSchedules", id, { enabled, nextRunAt: nx?.toISOString() ?? null });
  await logEvent(repo, s.agentId, enabled ? "SCHEDULE_ENABLED" : "SCHEDULE_DISABLED", `${enabled ? "Enabled" : "Disabled"} schedule "${s.name}" (${s.cron} UTC)`, {});
}
/** Turn due schedules into queued tasks. Called by the tick endpoint (n8n / cron), so it works with the browser closed. */
export async function materializeDueSchedules(repo: Repo, now = new Date()): Promise<AgentTask[]> {
  const out: AgentTask[] = [];
  for (const s of await repo.list("agentSchedules")) {
    if (!s.enabled) continue;
    if (!s.nextRunAt) { await repo.update("agentSchedules", s.id, { nextRunAt: nextRun(s.cron, now)?.toISOString() ?? null }); continue; }
    if (s.nextRunAt > now.toISOString()) continue;
    out.push(await enqueue(repo, { agentId: s.agentId, kind: s.taskKind, title: s.name, input: s.taskInput, createdBy: `schedule:${s.id}`, priority: 4 }));
    await repo.update("agentSchedules", s.id, { lastRunAt: now.toISOString(), nextRunAt: nextRun(s.cron, now)?.toISOString() ?? null });
  }
  return out;
}

// ---- approvals integration (event-driven WAITING) ------------------------------------
export async function ensureApprovalWait(repo: Repo, productionId: string, code: string, origin: O = "live") {
  const existing = (await repo.list("agentTasks", { kind: "approval.wait", productionId })).find((t) => t.status === "WAITING");
  if (existing) return existing;
  return enqueue(repo, { agentId: "PRODUCTION_MANAGER", kind: "approval.wait", title: `Waiting for approval: ${code}`, productionId, status: "WAITING", waitingOn: "human approval", origin, createdBy: "event:production.review" });
}
export async function resolveApprovalWaits(repo: Repo, productionId: string, decision: string) {
  for (const t of await repo.list("agentTasks", { kind: "approval.wait", productionId })) {
    if (t.status !== "WAITING") continue;
    await repo.update("agentTasks", t.id, { status: "COMPLETE", output: { decision }, finishedAt: new Date().toISOString() });
    await logEvent(repo, "PRODUCTION_MANAGER", "APPROVAL_DECIDED", `Approval ${decision} — ${t.title.replace("Waiting for approval: ", "")}`, { taskId: t.id, data: { decision } });
  }
}
