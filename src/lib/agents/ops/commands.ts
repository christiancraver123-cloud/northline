// High-level operator commands shared by chat, server actions, the n8n webhook and seeding.
import { randomUUID } from "node:crypto";
import type { Repo } from "@/lib/db/repo";
import type { AgentCode, AgentTask, Production } from "@/lib/db/records";
import type { Origin, TalentCode } from "@/lib/domain/types";
import type { CreateRequest } from "@/lib/orchestrator/contracts";
import { CreateRequestSchema, type CreateRequestInput } from "@/lib/orchestrator/contracts";
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
export async function submitRegenerate(repo: Repo, productionId: string, o: { notes?: string; shots?: number[]; deps?: Partial<Deps>; createdBy?: string } = {}) {
  const p = await repo.get("productions", productionId);
  if (!p) throw new Error("Production not found.");
  const task = await enqueue(repo, { agentId: "PRODUCTION_MANAGER", kind: "production.regenerate", title: `Regenerate ${p.code}`, input: { productionId, notes: o.notes ?? "", shots: o.shots }, productionId, talent: p.talent[0], createdBy: o.createdBy ?? "operator", origin: p.origin });
  await processFamily(repo, task.id, { deps: o.deps });
  return (await repo.get("agentTasks", task.id))!;
}
