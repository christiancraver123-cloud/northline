// Queue worker. Runs ONLY when invoked (operator message, event, or the tick endpoint) — never polls, never idles on a model.
// Independent tasks run concurrently, scheduled per "lane" (provider) so one rate-limited vendor can't stall the others.
import type { Repo } from "@/lib/db/repo";
import type { AgentRun, AgentTask, AgentReport, Agent } from "@/lib/db/records";
import { HANDLERS, PARTIAL_DEPS_OK, type HandlerCtx, type LlmOutcome } from "./handlers";
import { ensureAgents, heldTalent, logEvent } from "./service";
import { defaultDeps, type Deps } from "@/lib/orchestrator/execute";
import { defaultRouter, type Router } from "@/lib/llm/router";
import type { LlmRequest } from "@/lib/llm/types";

export interface ProcessOptions { max?: number; onlyIds?: string[]; trigger?: AgentRun["trigger"]; deps?: Partial<Deps>; now?: Date; router?: Router; concurrency?: number; laneConcurrency?: number }
export interface ProcessResult { ran: { taskId: string; agent: string; status: string; summary: string; provider: string | null; model: string | null }[]; remainingQueued: number }

const envInt = (n: string, d: number) => { const v = parseInt(process.env[n] ?? "", 10); return v > 0 ? v : d; };

/** Which lane (provider) a task will use. Production workflows use the still-image provider; LLM-routed jobs use the router's first usable provider; else "rules". */
export function laneOf(task: AgentTask, agent: Agent | undefined, router: Router, deps?: Partial<Deps>): string {
  if (task.kind === "production.create") return (deps?.image ?? defaultDeps().image).name;
  return router.laneFor(task.agentId, task.kind, agent?.config.model);
}

export async function processQueue(repo: Repo, opts: ProcessOptions = {}): Promise<ProcessResult> {
  const now = (opts.now ?? new Date()).toISOString();
  const router = opts.router ?? defaultRouter();
  const agents = await ensureAgents(repo);
  const agentBy = new Map(agents.map((a) => [a.code, a]));
  const paused = new Set(agents.filter((a) => a.paused).map((a) => a.code));
  const held = await heldTalent(repo);
  const prio = new Set(agents.find((a) => a.code === "ORCHESTRATOR")?.config.priorityTalent ?? []);
  const maxConc = opts.concurrency ?? envInt("AGENT_CONCURRENCY", 4);
  const laneMax = opts.laneConcurrency ?? envInt("AGENT_LANE_CONCURRENCY", 2);
  const ran: ProcessResult["ran"] = [];
  let budget = opts.max ?? 20;
  while (budget > 0) {
    const all = await repo.list("agentTasks");
    const byId = new Map(all.map((t) => [t.id, t]));
    const eligible = all.filter((t) => {
      if (t.status !== "QUEUED" || paused.has(t.agentId)) return false;
      if (opts.onlyIds && !opts.onlyIds.includes(t.id)) return false;
      if (t.talent && held.includes(t.talent)) return false;
      if (t.runAfter && t.runAfter > now) return false;
      return t.dependsOn.every((d) => { const x = byId.get(d); return x && (x.status === "COMPLETE" || (PARTIAL_DEPS_OK.has(t.kind) && (x.status === "FAILED" || x.status === "CANCELLED"))); });
    }).sort((a, b) => (prio.has(a.talent!) ? 0 : 1) - (prio.has(b.talent!) ? 0 : 1) || a.priority - b.priority || a.createdAt.localeCompare(b.createdAt));
    if (!eligible.length) break;
    // Pick a concurrent batch: one task per agent, bounded per provider lane.
    const batch: AgentTask[] = [];
    const laneCount = new Map<string, number>();
    const busyAgents = new Set(all.filter((t) => t.status === "RUNNING").map((t) => t.agentId));
    for (const t of eligible) {
      if (batch.length >= Math.min(maxConc, budget)) break;
      if (busyAgents.has(t.agentId)) continue;
      const lane = laneOf(t, agentBy.get(t.agentId), router, opts.deps);
      const limit = lane === "rules" ? maxConc : laneMax;
      if ((laneCount.get(lane) ?? 0) >= limit) continue;
      laneCount.set(lane, (laneCount.get(lane) ?? 0) + 1);
      busyAgents.add(t.agentId);
      batch.push(t);
    }
    if (!batch.length) break;
    budget -= batch.length;
    ran.push(...(await Promise.all(batch.map((t) => runTask(repo, t, opts, router, agentBy.get(t.agentId))))));
  }
  return { ran, remainingQueued: (await repo.list("agentTasks", { status: "QUEUED" })).length };
}

async function runTask(repo: Repo, task: AgentTask, opts: ProcessOptions, router: Router, agent: Agent | undefined) {
  const t0 = new Date().toISOString();
  const run = await repo.insert("agentRuns", { agentId: task.agentId, taskId: task.id, trigger: task.createdBy.startsWith("schedule:") ? "schedule" : task.createdBy.startsWith("event:") ? "event" : task.createdBy === "n8n" ? "n8n" : opts.trigger ?? "queue", state: "RUNNING", startedAt: t0, finishedAt: null, error: null, summary: "", costUsd: null, tokens: null, provider: null, model: null, usedFallback: false, origin: task.origin });
  await repo.update("agentTasks", task.id, { status: "RUNNING", startedAt: t0 });
  await logEvent(repo, task.agentId, "TASK_STARTED", `Started: ${task.title}`, { taskId: task.id, runId: run.id, origin: task.origin });
  const handler = HANDLERS[task.kind];
  const calls = { n: 0, tokens: 0, tokensKnown: true, cost: 0, costKnown: true, provider: null as string | null, model: null as string | null, fallback: false };

  const llm = async (req: LlmRequest): Promise<LlmOutcome> => {
    const out = await router.run(task.agentId, task.kind, req, agent?.config.model);
    for (const a of out.attempts) {
      await repo.insert("llmCalls", { runId: run.id, taskId: task.id, agentId: task.agentId, provider: a.provider, model: a.model, status: a.status, error: a.error, startedAt: a.startedAt, finishedAt: a.finishedAt, latencyMs: a.latencyMs, inputTokens: a.usage?.inputTokens ?? null, outputTokens: a.usage?.outputTokens ?? null, totalTokens: a.usage?.totalTokens ?? null, costUsd: a.costUsd, fallbackFrom: a.fallbackFrom, origin: task.origin });
      await logEvent(repo, task.agentId, a.status === "COMPLETE" ? "LLM_CALL" : "LLM_ATTEMPT_FAILED",
        a.status === "COMPLETE" ? `Model call via ${a.provider}/${a.model} (${a.latencyMs}ms${a.usage?.totalTokens != null ? `, ${a.usage.totalTokens} tokens` : ""})${a.fallbackFrom ? ` — fallback from ${a.fallbackFrom}` : ""}` : `${a.provider}/${a.model} ${a.status.toLowerCase()}: ${a.error ?? ""}`,
        { taskId: task.id, runId: run.id, level: a.status === "COMPLETE" ? "info" : "warn", origin: task.origin, data: { provider: a.provider, model: a.model, status: a.status } });
    }
    if (out.result) {
      calls.n++; calls.provider = out.result.provider; calls.model = out.result.model; calls.fallback ||= out.usedFallback;
      if (out.result.usage?.totalTokens != null) calls.tokens += out.result.usage.totalTokens; else calls.tokensKnown = false;
      if (out.result.costUsd != null) calls.cost += out.result.costUsd; else calls.costKnown = false;
    }
    return { text: out.result?.text ?? null, provider: out.result?.provider ?? null, model: out.result?.model ?? null, error: out.error?.message ?? null, usedFallback: out.usedFallback, attempted: out.attempts.length > 0 };
  };

  const ctx: HandlerCtx = {
    repo, task, runId: run.id, origin: task.origin, deps: opts.deps, llm,
    log: async (kind, message, o) => { await logEvent(repo, o?.agent ?? task.agentId, kind, message, { taskId: task.id, runId: run.id, level: o?.level, data: o?.data, origin: task.origin }); },
    report: async (d, agent) => repo.insert("agentReports", { agentId: agent ?? task.agentId, ...d, runId: run.id, read: false, origin: task.origin }) as Promise<AgentReport>,
  };
  const finish = (t1: string) => ({
    finishedAt: t1,
    provider: task.kind === "production.create" ? (opts.deps?.image ?? defaultDeps().image).name : calls.provider ?? "rules",
    model: calls.model, usedFallback: calls.fallback,
    tokens: calls.n && calls.tokensKnown ? calls.tokens : null, costUsd: calls.n && calls.costKnown ? calls.cost : null,
  });
  try {
    if (!handler) throw new Error(`No handler for task kind "${task.kind}"`);
    const res = await handler(ctx);
    const t1 = new Date().toISOString();
    await repo.update("agentTasks", task.id, { status: "COMPLETE", output: { ...res.output, reportIds: res.reportIds ?? [] }, finishedAt: t1 });
    const f = finish(t1);
    await repo.update("agentRuns", run.id, { state: "COMPLETE", summary: res.summary, ...f });
    await logEvent(repo, task.agentId, "TASK_COMPLETE", `Completed: ${task.title} — ${res.summary}`, { taskId: task.id, runId: run.id, origin: task.origin });
    for (const rid of res.reportIds ?? []) await logEvent(repo, task.agentId, "REPORT_PUBLISHED", "Published a report to the operator inbox", { taskId: task.id, runId: run.id, data: { reportId: rid }, origin: task.origin });
    return { taskId: task.id, agent: task.agentId, status: "COMPLETE", summary: res.summary, provider: f.provider, model: f.model };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    const t1 = new Date().toISOString();
    await repo.update("agentTasks", task.id, { status: "FAILED", error: msg, finishedAt: t1 });
    const f = finish(t1);
    await repo.update("agentRuns", run.id, { state: "FAILED", error: msg, summary: msg, ...f });
    await logEvent(repo, task.agentId, "TASK_FAILED", `Failed: ${task.title} — ${msg}`, { taskId: task.id, runId: run.id, level: "error", origin: task.origin });
    return { taskId: task.id, agent: task.agentId, status: "FAILED", summary: msg, provider: f.provider, model: f.model };
  }
}
