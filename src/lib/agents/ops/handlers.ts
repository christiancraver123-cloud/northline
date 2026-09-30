// Task handlers: one per task kind. Deterministic (no model calls) — they read real Northline state and write
// structured outputs, activity events and reports.
import type { Repo } from "@/lib/db/repo";
import type { AgentCode, AgentReport, AgentTask } from "@/lib/db/records";
import type { ContentType, TalentCode } from "@/lib/domain/types";
import { ROSTER_BY_CODE } from "@/lib/talent/roster";
import { CreateRequestSchema } from "@/lib/orchestrator/contracts";
import { executeCreate, defaultDeps, type Deps } from "@/lib/orchestrator/execute";
import { identityQa } from "@/lib/agents/identity";
import { creativeDirector } from "@/lib/agents/agents";
import { buildCreatorsReport, buildStatusReport, countBy, explainQa, type ReportDraft } from "./reports";
import { ensureApprovalWait, logEvent } from "./service";

export interface HandlerCtx {
  repo: Repo; task: AgentTask; runId: string; origin: "demo" | "live";
  log: (kind: string, message: string, o?: { level?: "info" | "warn" | "error"; data?: Record<string, unknown>; agent?: AgentCode }) => Promise<void>;
  report: (d: ReportDraft, agent?: AgentCode) => Promise<AgentReport>;
  deps?: Partial<Deps>;
}
export interface HandlerResult { output: Record<string, unknown>; summary: string; reportIds?: string[] }
export type Handler = (c: HandlerCtx) => Promise<HandlerResult>;

const talentOf = (t: AgentTask): TalentCode | null => (t.talent ?? (t.input.talent as TalentCode | undefined) ?? null);
const FORMATS: ContentType[] = ["POST", "CAROUSEL", "REEL"];

async function recentConcepts(repo: Repo, talent: TalentCode) {
  return (await repo.list("productions")).filter((p) => p.talent[0] === talent && p.status !== "REJECTED").slice(0, 10);
}
/** Real concept ideas: roster lifestyle × environment combos not already used in this creator's recent productions. */
function ideate(talent: TalentCode, count: number, used: string[]) {
  const t = ROSTER_BY_CODE[talent];
  const pool: { title: string; environment: string; theme: string }[] = [];
  for (const theme of t.visual.lifestyle) for (const env of t.visual.environments) pool.push({ title: `${theme} at ${env}`, environment: env, theme });
  const fresh = pool.filter((c) => !used.some((u) => u.toLowerCase().includes(c.theme.toLowerCase()) && u.toLowerCase().includes(c.environment.toLowerCase())));
  const src = fresh.length >= count ? fresh : pool;
  const stride = Math.max(1, Math.floor(src.length / count));
  return Array.from({ length: count }, (_, i) => src[(i * stride + i) % src.length]);
}

const strategistConcepts: Handler = async (c) => {
  const talent = talentOf(c.task); if (!talent) throw new Error("A creator is required (e.g. Sienna).");
  const count = Math.min(Math.max(Number(c.task.input.count) || 3, 1), 10);
  await c.log("LOAD_IDENTITY", `Loaded canonical identity for ${ROSTER_BY_CODE[talent].name}`);
  const history = await recentConcepts(c.repo, talent);
  await c.log("LOAD_HISTORY", `Read ${history.length} recent production(s) for ${talent} to avoid repeats`);
  const concepts = ideate(talent, count, history.map((p) => p.concept)).map((x, i) => ({
    title: x.title, format: FORMATS[i % FORMATS.length], environment: x.environment,
    rationale: `Fits ${ROSTER_BY_CODE[talent].first}'s ${x.theme} lane; not used in her last ${history.length} production(s).`,
  }));
  await c.log("CONCEPTS_CREATED", `Proposed ${concepts.length} concept(s) for ${talent}`, { data: { titles: concepts.map((x) => x.title) } });
  return { output: { talent, concepts }, summary: `${concepts.length} concept(s) for ${ROSTER_BY_CODE[talent].first}` };
};

const directorConcepts: Handler = async (c) => {
  const talent = talentOf(c.task); if (!talent) throw new Error("A creator is required (e.g. Sienna).");
  const count = Math.min(Math.max(Number(c.task.input.count) || 3, 1), 10);
  await c.log("LOAD_IDENTITY", `Loaded canonical identity and visual language for ${ROSTER_BY_CODE[talent].name}`);
  const history = await recentConcepts(c.repo, talent);
  let supplied = (c.task.input.concepts as { title: string }[] | undefined)?.map((x) => x.title);
  for (const d of c.task.dependsOn) { // use a completed Content Strategist contribution when this is part of an assignment
    const dep = await c.repo.get("agentTasks", d);
    const cs = dep?.status === "COMPLETE" ? (dep.output?.concepts as { title: string }[] | undefined) : undefined;
    if (cs?.length) { supplied = cs.map((x) => x.title); await c.log("HANDOFF", `Received ${cs.length} concept(s) from Content Strategist`); }
  }
  const titles = supplied?.length ? supplied.slice(0, count) : ideate(talent, count, history.map((p) => p.concept)).map((x) => x.title);
  const ctxBase = { recentLocations: history.map((p) => p.brief?.location).filter(Boolean) as string[], recentConcepts: history.map((p) => p.concept) };
  const directions = titles.map((title, i) => {
    const brief = creativeDirector(talent, "POST", title, "director concept", { ...ctxBase, variant: i + history.length }, 1);
    return { concept: title, location: brief.location, outfit: brief.outfit, lighting: brief.lighting, storyBeat: brief.storyBeat };
  });
  await c.log("BRIEF_CREATED", `Created ${directions.length} creative direction(s) for ${talent}`, { data: { locations: directions.map((d) => d.location) } });
  return { output: { talent, directions }, summary: `${directions.length} direction(s) for ${ROSTER_BY_CODE[talent].first}` };
};

const growthRecommendations: Handler = async (c) => {
  const talent = talentOf(c.task);
  const [prods, analytics] = await Promise.all([c.repo.list("productions"), c.repo.list("analytics")]);
  const real = analytics.filter((a) => a.source !== "demo");
  await c.log("READ_ANALYTICS", real.length ? `Read ${real.length} real/manual analytics record(s)` : "No real analytics data exists — recommendations are structural only", { level: real.length ? "info" : "warn" });
  const who = (talent ? [talent] : (Object.keys(ROSTER_BY_CODE) as TalentCode[]));
  const recs = who.map((t) => {
    const mine = prods.filter((p) => p.talent[0] === t);
    const byType = Object.fromEntries((["POST", "CAROUSEL", "REEL", "STORY"] as ContentType[]).map((k) => [k, mine.filter((p) => p.contentType === k).length]));
    const missing = Object.entries(byType).filter(([, n]) => n === 0).map(([k]) => k);
    return { talent: t, mix: byType, recommendation: missing.length ? `${ROSTER_BY_CODE[t].first} has no ${missing.join("/")} productions yet — try one to balance the mix.` : `${ROSTER_BY_CODE[t].first}'s format mix is balanced so far.` };
  });
  return { output: { basis: real.length ? "analytics+history" : "production-history-only", performanceDataAvailable: real.length > 0, recommendations: recs }, summary: real.length ? `Recommendations from ${real.length} analytics record(s)` : "Structural recommendations only (no performance data exists)" };
};

const performanceReport: Handler = async (c) => {
  const [analytics, prods] = await Promise.all([c.repo.list("analytics"), c.repo.list("productions")]);
  const real = analytics.filter((a) => a.source !== "demo");
  await c.log("READ_ANALYTICS", `Read ${analytics.length} analytics record(s); ${real.length} real/manual`);
  const published = prods.filter((p) => p.status === "PUBLISHED").length;
  const body = real.length
    ? `Analytics records: ${real.length} (${countBy(real.map((r) => r.source))}).\nTotal views: ${real.reduce((s, r) => s + (r.views ?? 0), 0)}; likes: ${real.reduce((s, r) => s + (r.likes ?? 0), 0)}.`
    : `No real or manual analytics data exists, and ${published} production(s) are recorded as published. There is nothing to interpret yet — no performance claims are made.`;
  const r = await c.report({ kind: "PERFORMANCE", title: "Performance report", body, data: { real: real.length, published }, sources: ["analytics", "productions"] });
  return { output: { real: real.length, published }, summary: real.length ? `Reported on ${real.length} analytics record(s)` : "No analytics data to report", reportIds: [r.id] };
};

const identityReview: Handler = async (c) => {
  const id = String(c.task.input.productionId ?? c.task.productionId ?? "");
  const p = await c.repo.get("productions", id); if (!p) throw new Error("Production not found.");
  const prompts = await c.repo.list("prompts", { productionId: id });
  await c.log("LOAD_IDENTITY", `Loaded canonical identity for ${p.talent[0]} and ${prompts.length} prompt(s) of ${p.code}`);
  const results = prompts.map((pr) => ({ shotN: pr.shotN, ...identityQa(p.talent[0], pr.positive) }));
  const issues = results.flatMap((r) => r.issues.map((i) => `Shot ${r.shotN}: ${i}`));
  await c.log(issues.length ? "QA_REJECTED" : "QA_PASSED", issues.length ? `Identity QA found ${issues.length} issue(s) in ${p.code}` : `Identity QA passed for ${p.code}`, { level: issues.length ? "warn" : "info", data: { issues } });
  const ids: string[] = [];
  if (issues.length) ids.push((await c.report({ kind: "QA", title: `Identity QA issues — ${p.code}`, body: issues.join("\n"), data: { productionId: id }, sources: ["prompts", "productions"] })).id);
  return { output: { ok: !issues.length, issues }, summary: issues.length ? `${issues.length} identity issue(s) in ${p.code}` : `${p.code} passed identity QA`, reportIds: ids };
};

const contentReview: Handler = async (c) => {
  const id = String(c.task.input.productionId ?? c.task.productionId ?? "");
  const p = await c.repo.get("productions", id); if (!p) throw new Error("Production not found.");
  const assets = await c.repo.list("assets", { productionId: id });
  const prompts = await c.repo.list("prompts", { productionId: id });
  const issues: string[] = [];
  if (assets.some((a) => a.status === "FAILED")) issues.push(`${assets.filter((a) => a.status === "FAILED").length} failed asset(s)`);
  if (assets.some((a) => a.status === "PENDING")) issues.push(`${assets.filter((a) => a.status === "PENDING").length} pending asset(s)`);
  if (new Set(prompts.map((x) => x.positive)).size < prompts.length) issues.push("duplicate prompts");
  issues.push(...p.qaNotes.filter((n) => !n.startsWith("Shot")));
  await c.log("QA_COMPLETE", issues.length ? `Content QA flagged ${p.code}: ${issues.join("; ")}` : `Content QA clean for ${p.code}`, { level: issues.length ? "warn" : "info" });
  return { output: { ok: !issues.length, issues }, summary: issues.length ? `${issues.length} content issue(s) in ${p.code}` : `${p.code} passed content QA` };
};

const productionCreate: Handler = async (c) => {
  const req = CreateRequestSchema.parse(c.task.input.request);
  const base = { ...defaultDeps(), ...c.deps };
  const deps: Deps = { ...base, origin: c.origin, trace: async (agent, kind, message, o) => { await c.log(kind, message, { ...o, agent }); } };
  await c.log("RECEIVED", `Received production request: ${req.format} for ${req.talent.join("+")} — "${req.concept || "no concept"}"`, { agent: "ORCHESTRATOR" });
  const res = await executeCreate(c.repo, req, deps);
  for (const p of res.productions) if (p.status === "REVIEW") await ensureApprovalWait(c.repo, p.id, p.code, c.origin);
  const ids: string[] = [];
  if (res.failures.length) ids.push((await c.report({ kind: "ALERT", title: `Production needs attention (${res.productions.map((p) => p.code).join(", ")})`, body: res.failures.join("\n"), data: { runId: res.runId }, sources: ["productions", "provider_jobs", "prompts"] }, "PRODUCTION_MANAGER")).id);
  return { output: { runId: res.runId, productions: res.productions, failures: res.failures }, summary: `${res.productions.length} production(s): ${res.productions.map((p) => p.code).join(", ")}${res.failures.length ? ` — ${res.failures.length} issue(s)` : ""}`, reportIds: ids };
};

const productionDigest: Handler = async (c) => {
  const d = await buildStatusReport(c.repo);
  const r = await c.report({ ...d, kind: "DIGEST", title: "Production digest" }, "PRODUCTION_MANAGER");
  return { output: { reportId: r.id }, summary: "Production digest published", reportIds: [r.id] };
};

const orchestratorReport: Handler = async (c) => {
  const scope = c.task.input.scope === "status" ? "status" : "creators";
  await c.log("READ_STATE", `Reading Northline records for the ${scope} report`);
  const r = await c.report(scope === "status" ? await buildStatusReport(c.repo) : await buildCreatorsReport(c.repo));
  return { output: { reportId: r.id, scope }, summary: `${r.title} created`, reportIds: [r.id] };
};

const consolidate: Handler = async (c) => {
  const kids = await Promise.all(c.task.dependsOn.map((id) => c.repo.get("agentTasks", id)));
  const parts = kids.filter((k): k is AgentTask => !!k);
  const lines: string[] = [];
  const contributions = parts.map((k) => {
    const ok = k.status === "COMPLETE";
    c.log("HANDOFF", `Received ${ok ? "result" : `${k.status} status`} from ${k.agentId}: ${k.title}`).catch(() => {});
    lines.push(`## ${k.agentId.replace("_", " ")} — ${ok ? "complete" : k.status}`);
    lines.push(ok ? summarise(k.output ?? {}) : `No contribution (${k.error ?? k.status}).`);
    return { agent: k.agentId, status: k.status, output: k.output };
  });
  const title = String(c.task.input.title ?? "Multi-agent assignment");
  const done = parts.filter((k) => k.status === "COMPLETE").length;
  const r = await c.report({ kind: "ASSIGNMENT", title: `${title} — consolidated`, body: `${done}/${parts.length} agent contribution(s) completed.\n\n${lines.join("\n")}`, data: { contributions }, sources: ["agent_tasks"] });
  return { output: { contributions, reportId: r.id, complete: done === parts.length }, summary: `Consolidated ${done}/${parts.length} contribution(s)`, reportIds: [r.id] };
};

function summarise(o: Record<string, unknown>): string {
  const out: string[] = [];
  const cs = o.concepts as { title: string; format: string; rationale: string }[] | undefined;
  if (cs) out.push(...cs.map((c) => `• ${c.title} (${c.format}) — ${c.rationale}`));
  const ds = o.directions as { concept: string; location: string; outfit: string; lighting: string }[] | undefined;
  if (ds) out.push(...ds.map((d) => `• ${d.concept}: ${d.location}; ${d.outfit}; ${d.lighting}`));
  const rs = o.recommendations as { recommendation: string }[] | undefined;
  if (rs) out.push(...rs.map((r) => `• ${r.recommendation}`), o.performanceDataAvailable ? "" : "(No performance data exists; structural recommendations only.)");
  return out.filter(Boolean).join("\n") || JSON.stringify(o).slice(0, 400);
}
export { summarise };

export const HANDLERS: Record<string, Handler> = {
  "strategist.concepts": strategistConcepts, "director.concepts": directorConcepts, "growth.recommendations": growthRecommendations,
  "performance.report": performanceReport, "identity_qa.review": identityReview, "content_qa.review": contentReview,
  "production.create": productionCreate, "production.digest": productionDigest, "orchestrator.report": orchestratorReport, "orchestrator.consolidate": consolidate,
};
/** Kinds whose dependencies may be FAILED/CANCELLED (they consolidate whatever completed). */
export const PARTIAL_DEPS_OK = new Set(["orchestrator.consolidate"]);
export { logEvent, explainQa };
