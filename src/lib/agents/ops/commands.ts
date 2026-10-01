// High-level operator commands shared by chat, server actions, the n8n webhook and seeding.
import { randomUUID } from "node:crypto";
import type { Repo } from "@/lib/db/repo";
import type { AgentCode, AgentTask, Production } from "@/lib/db/records";
import type { Origin, TalentCode } from "@/lib/domain/types";
import type { CreateRequest } from "@/lib/orchestrator/contracts";
import { CreateRequestSchema, type CreateRequestInput, type CreativeInput } from "@/lib/orchestrator/contracts";
import type { Deps } from "@/lib/orchestrator/execute";
import { enqueue, ensureApprovalWait, ensureAgents } from "./service";
import { processQueue } from "./worker";
import type { Router } from "@/lib/llm/router";

/** Which task kind each agent can take as a standalone operator assignment. */
export const ASSIGNABLE: Partial<Record<AgentCode, string>> = {
  CONTENT_STRATEGIST: "strategist.concepts", CREATIVE_DIRECTOR: "director.concepts", GROWTH_STRATEGIST: "growth.recommendations", PERFORMANCE_AGENT: "performance.report", CONTENT_QA: "content_qa.audit",
};

export interface SubmitOpts { createdBy?: string; origin?: Origin; deps?: Partial<Deps>; trigger?: "operator" | "n8n" | "queue"; idempotencyKey?: string | null; router?: Router }

/** Run a root task and every task it spawns (QA family, finalize) to completion. */
export async function processFamily(repo: Repo, rootId: string, o: { trigger?: "operator" | "n8n" | "queue"; deps?: Partial<Deps>; router?: Router } = {}) {
  const ran: Awaited<ReturnType<typeof processQueue>>["ran"] = [];
  for (let i = 0; i < 25; i++) {
    const all = await repo.list("agentTasks");
    const fam = new Set<string>([rootId]);
    for (let grew = true; grew;) { grew = false; for (const t of all) if (t.parentTaskId && fam.has(t.parentTaskId) && !fam.has(t.id)) { fam.add(t.id); grew = true; } }
    const res = await processQueue(repo, { onlyIds: [...fam], trigger: o.trigger ?? "operator", deps: o.deps, router: o.router });
    if (!res.ran.length) break;
    ran.push(...res.ran);
  }
  return ran;
}

/** Queue + run a production workflow through the Production Manager (existing executeCreate pipeline, now with activity logging). */
export async function submitCreate(repo: Repo, input: CreateRequestInput | CreateRequest, o: SubmitOpts = {}) {
  await ensureAgents(repo);
  const request = CreateRequestSchema.parse(input);
  const task = await enqueue(repo, {
    agentId: "PRODUCTION_MANAGER", kind: "production.create", title: `Create ${request.format} for ${request.talent.join("+")}${request.concept ? ` — ${request.concept}` : ""}`,
    input: { request }, talent: request.talent[0], priority: 3, createdBy: o.createdBy ?? "operator", origin: o.origin, idempotencyKey: o.idempotencyKey ?? request.idempotency_key ?? null,
  });
  const ran = await processFamily(repo, task.id, { trigger: o.trigger, deps: o.deps, router: o.router });
  const done = (await repo.get("agentTasks", task.id))!;
  const output = done.output as { runId?: string; productions?: { id: string; code: string; status: string; qaOk: boolean; attemptId?: string | null }[]; failures?: string[] } | null;
  // The handler reports status at generation time; QA/finalize ran afterwards as separate tasks — report the CURRENT status.
  if (output?.productions) for (const p of output.productions) p.status = (await repo.get("productions", p.id))?.status ?? p.status;
  return { task: done, result: ran[0], output };
}

export type QaKind = "IDENTITY" | "TECHNICAL" | "CONTINUITY";
const QA_TASK: Record<QaKind, { agentId: AgentCode; kind: string; label: string }> = {
  IDENTITY: { agentId: "IDENTITY_QA", kind: "identity_qa.attempt", label: "Identity QA" },
  TECHNICAL: { agentId: "CONTENT_QA", kind: "technical_qa.attempt", label: "Technical QA" },
  CONTINUITY: { agentId: "IDENTITY_QA", kind: "continuity_qa.attempt", label: "Continuity QA" },
};

/**
 * Operator re-run of QA on EXISTING assets. NEVER regenerates or modifies an image: it only adds new QA evaluations (older ones are kept and
 * superseded where appropriate) and re-finalizes the aggregate. Runs through the normal agent tasks, so routing, no-fallback policy,
 * bounded retry and activity logging are identical to a first-time QA run.
 */
export async function rerunQa(repo: Repo, o: { productionId: string; attemptId?: string; assetIds?: string[]; kinds?: QaKind[]; createdBy?: string; deps?: Partial<Deps>; router?: Router; run?: boolean }) {
  await ensureAgents(repo);
  const p = await repo.get("productions", o.productionId);
  if (!p) throw new Error("Production not found.");
  const attemptId = o.attemptId ?? p.currentAttemptId;
  if (!attemptId) throw new Error("This production has no attempt to re-run QA for.");
  const kinds = o.kinds?.length ? o.kinds : (["IDENTITY", "TECHNICAL", "CONTINUITY"] as QaKind[]);
  const input = { productionId: p.id, attemptId, rerun: true, ...(o.assetIds?.length ? { assetIds: o.assetIds } : {}) };
  const base = { productionId: p.id, talent: p.talent[0], createdBy: o.createdBy ?? "operator", origin: p.origin, input };
  const tasks: AgentTask[] = [];
  for (const k of kinds) tasks.push(await enqueue(repo, { ...base, agentId: QA_TASK[k].agentId, kind: QA_TASK[k].kind, title: `Re-run ${QA_TASK[k].label}: ${p.code}${o.assetIds?.length ? ` (${o.assetIds.length} asset(s))` : ""}` }));
  const fin = await enqueue(repo, { ...base, agentId: "PRODUCTION_MANAGER", kind: "production.finalize", title: `Finalize after QA re-run: ${p.code}`, dependsOn: tasks.map((t) => t.id) });
  const ids = [...tasks.map((t) => t.id), fin.id];
  if (o.run !== false) await processQueue(repo, { onlyIds: ids, trigger: "operator", deps: o.deps, router: o.router });
  return { taskIds: ids, tasks: await Promise.all(ids.map(async (id) => (await repo.get("agentTasks", id))!)) };
}

export async function delegate(repo: Repo, agentId: AgentCode, talent: TalentCode | null, count: number, o: { createdBy?: string; run?: boolean; input?: Record<string, unknown> } = {}) {
  const kind = ASSIGNABLE[agentId];
  if (!kind) throw new Error(`${agentId} has no standalone assignment type.`);
  const task = await enqueue(repo, { agentId, kind, title: `${kind.split(".")[0]} ${kind.endsWith("concepts") ? `${count} concept(s)` : "task"}${talent ? ` for ${talent}` : ""}`, input: { talent, count, ...o.input }, talent, createdBy: o.createdBy ?? "operator" });
  if (o.run !== false) await processQueue(repo, { onlyIds: [task.id], trigger: "operator" });
  return (await repo.get("agentTasks", task.id))!;
}

/** Multi-agent assignment: each agent contributes structured work, the Orchestrator consolidates. */
export async function createAssignment(repo: Repo, a: { title: string; agents: AgentCode[]; talent: TalentCode | null; count?: number; createdBy?: string; run?: boolean }) {
  const agents: AgentCode[] = [...new Set(a.agents)].filter((x) => x !== "ORCHESTRATOR");
  const bad = agents.filter((x) => !ASSIGNABLE[x]);
  if (bad.length) throw new Error(`These agents can't take standalone assignments yet: ${bad.join(", ")}.`);
  if (!agents.length) throw new Error("Name at least one agent.");
  const assignmentId = randomUUID();
  const children: AgentTask[] = [];
  const order: AgentCode[] = ["CONTENT_STRATEGIST", "CREATIVE_DIRECTOR", "GROWTH_STRATEGIST", "PERFORMANCE_AGENT", "CONTENT_QA"];
  for (const ag of order.filter((x) => agents.includes(x))) {
    const strat = children.find((c) => c.agentId === "CONTENT_STRATEGIST");
    children.push(await enqueue(repo, {
      agentId: ag, kind: ASSIGNABLE[ag]!, title: `${a.title} — ${ag.replace("_", " ").toLowerCase()}`, input: { talent: a.talent, count: a.count ?? 3 }, talent: a.talent,
      assignmentId, dependsOn: ag === "CREATIVE_DIRECTOR" && strat ? [strat.id] : [], createdBy: a.createdBy ?? "operator",
    }));
  }
  const consolidate = await enqueue(repo, { agentId: "ORCHESTRATOR", kind: "orchestrator.consolidate", title: `Consolidate: ${a.title}`, input: { title: a.title }, talent: a.talent, assignmentId, dependsOn: children.map((c) => c.id), createdBy: a.createdBy ?? "operator", priority: 3 });
  if (a.run !== false) await processQueue(repo, { onlyIds: [...children.map((c) => c.id), consolidate.id], trigger: "operator" });
  return { assignmentId, children, consolidate: (await repo.get("agentTasks", consolidate.id))! };
}

export { ensureApprovalWait };
export type { Production };

/** Regenerate a production (new attempt, same production) via the Production Manager, then run its QA family. */
export async function submitRegenerate(repo: Repo, productionId: string, o: { notes?: string; shots?: number[]; creative?: CreativeInput; deps?: Partial<Deps>; createdBy?: string } = {}) {
  const p = await repo.get("productions", productionId);
  if (!p) throw new Error("Production not found.");
  const task = await enqueue(repo, { agentId: "PRODUCTION_MANAGER", kind: "production.regenerate", title: `Regenerate ${p.code}`, input: { productionId, notes: o.notes ?? "", shots: o.shots, ...(o.creative ? { creative: o.creative } : {}) }, productionId, talent: p.talent[0], createdBy: o.createdBy ?? "operator", origin: p.origin });
  await processFamily(repo, task.id, { deps: o.deps });
  return (await repo.get("agentTasks", task.id))!;
}
