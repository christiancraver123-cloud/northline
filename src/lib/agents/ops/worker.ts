// Queue worker. Runs ONLY when invoked (operator message, event, or the tick endpoint) — never polls, never idles on a model.
import type { Repo } from "@/lib/db/repo";
import type { AgentRun, AgentTask, AgentReport } from "@/lib/db/records";
import { HANDLERS, PARTIAL_DEPS_OK, type HandlerCtx } from "./handlers";
import { ensureAgents, heldTalent, logEvent } from "./service";
import type { Deps } from "@/lib/orchestrator/execute";

export interface ProcessOptions { max?: number; onlyIds?: string[]; trigger?: AgentRun["trigger"]; deps?: Partial<Deps>; now?: Date }
export interface ProcessResult { ran: { taskId: string; agent: string; status: string; summary: string }[]; remainingQueued: number }

export async function processQueue(repo: Repo, opts: ProcessOptions = {}): Promise<ProcessResult> {
  const now = (opts.now ?? new Date()).toISOString();
  const agents = await ensureAgents(repo);
  const paused = new Set(agents.filter((a) => a.paused).map((a) => a.code));
  const held = await heldTalent(repo);
  const prio = new Set(agents.find((a) => a.code === "ORCHESTRATOR")?.config.priorityTalent ?? []);
  const ran: ProcessResult["ran"] = [];
  for (let i = 0; i < (opts.max ?? 20); i++) {
    const all = await repo.list("agentTasks");
    const byId = new Map(all.map((t) => [t.id, t]));
    const eligible = all.filter((t) => {
      if (t.status !== "QUEUED" || paused.has(t.agentId)) return false;
      if (opts.onlyIds && !opts.onlyIds.includes(t.id)) return false;
      if (t.talent && held.includes(t.talent)) return false;
      if (t.runAfter && t.runAfter > now) return false;
      return t.dependsOn.every((d) => { const x = byId.get(d); return x && (x.status === "COMPLETE" || (PARTIAL_DEPS_OK.has(t.kind) && (x.status === "FAILED" || x.status === "CANCELLED"))); });
    }).sort((a, b) => (prio.has(a.talent!) ? 0 : 1) - (prio.has(b.talent!) ? 0 : 1) || a.priority - b.priority || a.createdAt.localeCompare(b.createdAt));
    const task = eligible[0];
    if (!task) break;
    ran.push(await runTask(repo, task, opts));
  }
  const left = (await repo.list("agentTasks", { status: "QUEUED" })).length;
  return { ran, remainingQueued: left };
}

async function runTask(repo: Repo, task: AgentTask, opts: ProcessOptions) {
  const t0 = new Date().toISOString();
  const run = await repo.insert("agentRuns", { agentId: task.agentId, taskId: task.id, trigger: task.createdBy.startsWith("schedule:") ? "schedule" : task.createdBy.startsWith("event:") ? "event" : task.createdBy === "n8n" ? "n8n" : opts.trigger ?? "queue", state: "RUNNING", startedAt: t0, finishedAt: null, error: null, summary: "", costUsd: null, tokens: null, origin: task.origin });
  await repo.update("agentTasks", task.id, { status: "RUNNING", startedAt: t0 });
  await logEvent(repo, task.agentId, "TASK_STARTED", `Started: ${task.title}`, { taskId: task.id, runId: run.id, origin: task.origin });
  const handler = HANDLERS[task.kind];
  const ctx: HandlerCtx = {
    repo, task, runId: run.id, origin: task.origin, deps: opts.deps,
    log: async (kind, message, o) => { await logEvent(repo, o?.agent ?? task.agentId, kind, message, { taskId: task.id, runId: run.id, level: o?.level, data: o?.data, origin: task.origin }); },
    report: async (d, agent) => repo.insert("agentReports", { agentId: agent ?? task.agentId, ...d, runId: run.id, read: false, origin: task.origin }) as Promise<AgentReport>,
  };
  try {
    if (!handler) throw new Error(`No handler for task kind "${task.kind}"`);
    const res = await handler(ctx);
    const t1 = new Date().toISOString();
    await repo.update("agentTasks", task.id, { status: "COMPLETE", output: { ...res.output, reportIds: res.reportIds ?? [] }, finishedAt: t1 });
    await repo.update("agentRuns", run.id, { state: "COMPLETE", finishedAt: t1, summary: res.summary });
    await logEvent(repo, task.agentId, "TASK_COMPLETE", `Completed: ${task.title} — ${res.summary}`, { taskId: task.id, runId: run.id, origin: task.origin });
    for (const rid of res.reportIds ?? []) await logEvent(repo, task.agentId, "REPORT_PUBLISHED", "Published a report to the operator inbox", { taskId: task.id, runId: run.id, data: { reportId: rid }, origin: task.origin });
    return { taskId: task.id, agent: task.agentId, status: "COMPLETE", summary: res.summary };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    const t1 = new Date().toISOString();
    await repo.update("agentTasks", task.id, { status: "FAILED", error: msg, finishedAt: t1 });
    await repo.update("agentRuns", run.id, { state: "FAILED", finishedAt: t1, error: msg, summary: msg });
    await logEvent(repo, task.agentId, "TASK_FAILED", `Failed: ${task.title} — ${msg}`, { taskId: task.id, runId: run.id, level: "error", origin: task.origin });
    return { taskId: task.id, agent: task.agentId, status: "FAILED", summary: msg };
  }
}
