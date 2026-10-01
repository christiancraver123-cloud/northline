// Task handlers: one per task kind. Deterministic (no model calls) — they read real Northline state and write
// structured outputs, activity events and reports.
import type { Repo } from "@/lib/db/repo";
import type { AgentCode, AgentReport, AgentTask } from "@/lib/db/records";
import type { ContentType, TalentCode } from "@/lib/domain/types";
import { ROSTER_BY_CODE } from "@/lib/talent/roster";
import { CreateRequestSchema, CreativeInputSchema } from "@/lib/orchestrator/contracts";
import { executeCreate, defaultDeps, completeAttempt, type Deps } from "@/lib/orchestrator/execute";
import { regenerateProduction } from "@/lib/pipeline/revise";
import { runContentQa, runIdentityQa, runTechnicalQa, type VisionInspector } from "@/lib/pipeline/qa";
import { runContinuityQa, isSequence } from "@/lib/pipeline/continuity";
import { finalizeAttempt } from "@/lib/pipeline/finalize";
import { loadIdentity } from "@/lib/identity/service";
import { loadReferences } from "@/lib/references/service";
import { enqueue } from "./service";
import { identityQa } from "@/lib/agents/identity";
import { creativeDirector } from "@/lib/agents/agents";
import { buildCreatorsReport, buildStatusReport, countBy, explainQa, type ReportDraft } from "./reports";
import { ensureApprovalWait, logEvent } from "./service";
import type { LlmRequest } from "@/lib/llm/types";

export interface LlmOutcome { text: string | null; provider: string | null; model: string | null; error: string | null; errorKind?: "unavailable" | "rate_limited" | "auth" | "failed" | null; retryAfterSec?: number | null; usedFallback: boolean; attempted: boolean }
export interface HandlerCtx {
  /** Route a model call through the provider router (per-agent preference, fallback policy, usage tracking). text=null → no model output. */
  llm: (req: LlmRequest, opts?: { probe?: boolean }) => Promise<LlmOutcome>;
  repo: Repo; task: AgentTask; runId: string; origin: "demo" | "live";
  log: (kind: string, message: string, o?: { level?: "info" | "warn" | "error"; data?: Record<string, unknown>; agent?: AgentCode }) => Promise<void>;
  report: (d: ReportDraft, agent?: AgentCode) => Promise<AgentReport>;
  deps?: Partial<Deps>;
}
export interface HandlerResult { output: Record<string, unknown>; summary: string; reportIds?: string[] }
export type Handler = (c: HandlerCtx) => Promise<HandlerResult>;

/** Ask the routed model for grounded analysis of REAL facts. Returns a labelled block, or "" when no model ran (facts-only). */
async function narrate(c: HandlerCtx, what: string, facts: string): Promise<string> {
  const out = await c.llm({
    system: `You are the ${c.task.agentId.replace("_", " ").toLowerCase()} for Northline, a virtual-creator media studio. Write concise, practical analysis using ONLY the facts provided. If data is missing, say so; never invent metrics, results or background work.`,
    prompt: `Task: ${what}\n\nFACTS (authoritative):\n${facts}\n\nWrite 3-6 short bullet points.`, maxOutputTokens: 600,
  });
  if (out.text) return `\n\nAI analysis (${out.provider} · ${out.model}${out.usedFallback ? ", fallback" : ""}):\n${out.text.trim()}`;
  if (out.attempted) await c.log("LLM_UNAVAILABLE", `Model analysis unavailable (${out.error}); report contains facts only`, { level: "warn" });
  return "";
}

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
  const narrative = await narrate(c, "Recommend content experiments and mix changes", JSON.stringify({ analyticsRecords: real.length, recommendations: recs }));
  return { output: { basis: real.length ? "analytics+history" : "production-history-only", performanceDataAvailable: real.length > 0, recommendations: recs, narrative: narrative || null }, summary: real.length ? `Recommendations from ${real.length} analytics record(s)` : "Structural recommendations only (no performance data exists)" };
};

const performanceReport: Handler = async (c) => {
  const [analytics, prods] = await Promise.all([c.repo.list("analytics"), c.repo.list("productions")]);
  const real = analytics.filter((a) => a.source !== "demo");
  await c.log("READ_ANALYTICS", `Read ${analytics.length} analytics record(s); ${real.length} real/manual`);
  const published = prods.filter((p) => p.status === "PUBLISHED").length;
  const body = real.length
    ? `Analytics records: ${real.length} (${countBy(real.map((r) => r.source))}).\nTotal views: ${real.reduce((s, r) => s + (r.views ?? 0), 0)}; likes: ${real.reduce((s, r) => s + (r.likes ?? 0), 0)}.`
    : `No real or manual analytics data exists, and ${published} production(s) are recorded as published. There is nothing to interpret yet — no performance claims are made.`;
  const extra = await narrate(c, "Interpret performance data", body);
  const r = await c.report({ kind: "PERFORMANCE", title: "Performance report", body: body + extra, data: { real: real.length, published }, sources: ["analytics", "productions"] });
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

const contentAudit: Handler = async (c) => {
  const [prods, assets, prompts] = await Promise.all([c.repo.list("productions"), c.repo.list("assets"), c.repo.list("prompts")]);
  const recent = prods.slice(0, 30);
  const byLoc: Record<string, number> = {};
  for (const p of recent) if (p.brief?.location) byLoc[`${p.talent[0]} @ ${p.brief.location}`] = (byLoc[`${p.talent[0]} @ ${p.brief.location}`] ?? 0) + 1;
  const repeats = Object.entries(byLoc).filter(([, n]) => n > 1).map(([k, n]) => `${k} ×${n}`);
  const ids = new Set(recent.map((p) => p.id));
  const failed = assets.filter((a) => ids.has(a.productionId) && a.status === "FAILED").length;
  const idIssues = prompts.filter((p) => ids.has(p.productionId) && !p.qa.ok).length;
  await c.log("READ_STATE", `Audited ${recent.length} recent production(s)`);
  const facts = `Productions audited: ${recent.length}. Repeated creator/location pairs: ${repeats.join("; ") || "none"}. Failed assets: ${failed}. Prompts failing identity QA: ${idIssues}.`;
  const extra = await narrate(c, "Audit recent content for repetition, quality and brand fit", facts);
  const r = await c.report({ kind: "QA", title: "Content audit", body: `${facts}${extra}`, data: { audited: recent.length, repeats, failed, idIssues }, sources: ["productions", "assets", "prompts"] });
  return { output: { audited: recent.length, repeats, failed, idIssues }, summary: `Audited ${recent.length} production(s): ${repeats.length} repeat(s), ${failed} failed asset(s)`, reportIds: [r.id] };
};

const productionCreate: Handler = async (c) => {
  const req = CreateRequestSchema.parse(c.task.input.request);
  const base = { ...defaultDeps(), ...c.deps };
  const deps: Deps = { ...base, origin: c.origin, trace: async (agent, kind, message, o) => { await c.log(kind, message, { ...o, agent }); } };
  await c.log("RECEIVED", `Received production request: ${req.format} for ${req.talent.join("+")} — "${req.concept || "no concept"}"`, { agent: "ORCHESTRATOR" });
  const res = await executeCreate(c.repo, req, { ...deps, vision: visionOf(c) }, { deferQa: true });
  for (const p of res.productions) if (p.attemptId && p.status === "GENERATING") await enqueueQaFamily(c.repo, c.task, p.id, p.code, p.attemptId);
  const ids: string[] = [];
  if (res.failures.length) ids.push((await c.report({ kind: "ALERT", title: `Production needs attention (${res.productions.map((p) => p.code).join(", ")})`, body: res.failures.join("\n"), data: { runId: res.runId }, sources: ["productions", "provider_jobs", "prompts"] }, "PRODUCTION_MANAGER")).id);
  return { output: { runId: res.runId, productions: res.productions, failures: res.failures }, summary: `${res.productions.length} production(s): ${res.productions.map((p) => p.code).join(", ")}${res.failures.length ? ` — ${res.failures.length} issue(s)` : ""}`, reportIds: ids };
};

/** Vision inspector backed by the model router (per-agent preference; identity-critical kinds only use an explicitly configured provider). */
function visionOf(c: HandlerCtx): VisionInspector {
  return async (req) => {
    // retryAttempt > 1 = a deliberate retry after backoff: re-probe the SAME provider even though its failure cooldown is active.
    const o = await c.llm({ system: req.system, prompt: req.prompt, images: req.images, json: true, maxOutputTokens: 1500, temperature: 0 }, { probe: (req.retryAttempt ?? 1) > 1 });
    const transient = !o.text && (o.errorKind === "unavailable" || o.errorKind === "rate_limited") && o.attempted;
    return { text: o.text, provider: o.provider, model: o.model, error: o.error ?? (o.attempted ? null : "no vision-capable provider is configured for this agent (set a preferred provider in Agent settings)"), transient, retryAfterMs: o.retryAfterSec ? o.retryAfterSec * 1000 : null };
  };
}

/** QA as separate agent tasks (Identity QA, Technical QA, Content QA) followed by finalize (Production Manager), linked by dependencies. */
export async function enqueueQaFamily(repo: Repo, parent: AgentTask, productionId: string, code: string, attemptId: string) {
  const base = { parentTaskId: parent.id, productionId, talent: parent.talent, createdBy: `event:attempt.generated`, origin: parent.origin, input: { productionId, attemptId } };
  const idq = await enqueue(repo, { ...base, agentId: "IDENTITY_QA", kind: "identity_qa.attempt", title: `Identity QA: ${code}` });
  const tq = await enqueue(repo, { ...base, agentId: "CONTENT_QA", kind: "technical_qa.attempt", title: `Technical QA: ${code}` });
  const cq = await enqueue(repo, { ...base, agentId: "CONTENT_QA", kind: "content_qa.production", title: `Content QA: ${code}` });
  // Multi-frame productions are also judged as a SEQUENCE (same person/outfit/jewelry/hair/time-of-day/signage...).
  const frames = (await repo.list("assets", { productionId })).filter((a) => a.current && a.kind !== "REEL");
  const seq = isSequence(frames) ? await enqueue(repo, { ...base, agentId: "IDENTITY_QA", kind: "continuity_qa.attempt", title: `Continuity QA: ${code}` }) : null;
  const fin = await enqueue(repo, { ...base, agentId: "PRODUCTION_MANAGER", kind: "production.finalize", title: `Finalize: ${code}`, dependsOn: [idq.id, tq.id, cq.id, ...(seq ? [seq.id] : [])] });
  return [idq, tq, cq, ...(seq ? [seq] : []), fin];
}

async function attemptCtx(c: HandlerCtx) {
  const productionId = String(c.task.input.productionId), attemptId = String(c.task.input.attemptId);
  const [p, attempt] = await Promise.all([c.repo.get("productions", productionId), c.repo.get("generationAttempts", attemptId)]);
  if (!p || !attempt) throw new Error("Production or attempt not found.");
  const deps: Deps = { ...defaultDeps(), ...c.deps, origin: c.origin, vision: visionOf(c), trace: async (agent, kind, message, o) => { await c.log(kind, message, { ...o, agent }); } };
  const only = Array.isArray(c.task.input.assetIds) ? (c.task.input.assetIds as string[]) : null;
  const assets = (await c.repo.list("assets", { productionId })).filter((a) => a.attemptId === attemptId && a.kind !== "REEL" && a.status === "RAW" && (!only || only.includes(a.id)));
  return { p, attempt, deps, assets, rerun: c.task.input.rerun === true };
}

const identityQaAttempt: Handler = async (c) => {
  const { p, attempt, deps, assets, rerun } = await attemptCtx(c);
  const { identity } = await loadIdentity(c.repo, p.talent[0]);
  await c.log("LOAD_IDENTITY", `Loaded ${identity.id} and ${assets.length} asset(s) of attempt ${attempt.attemptNo} for Identity QA`);
  const rs = await runIdentityQa(c.repo, deps, p, attempt, assets, identity, await loadReferences(c.repo, p.talent[0]), { promptRules: !rerun });
  const inspected = rs.filter((r) => r.inspectedImage).length;
  return { output: { results: rs.map((r) => ({ id: r.id, assetId: r.assetId, status: r.status, method: r.method })), inspectedImages: inspected }, summary: `${rs.length} identity result(s); ${inspected} visually inspected; ${rs.filter((r) => r.status === "MANUAL_REVIEW_REQUIRED").length} need manual review` };
};
const technicalQaAttempt: Handler = async (c) => {
  const { p, attempt, deps, assets } = await attemptCtx(c);
  const rs = await runTechnicalQa(c.repo, deps, p, attempt, assets);
  return { output: { results: rs.map((r) => ({ id: r.id, assetId: r.assetId, status: r.status, method: r.method })) }, summary: `${rs.length} technical result(s); ${rs.filter((r) => r.inspectedImage).length} visually inspected` };
};
const continuityQaAttempt: Handler = async (c) => {
  const { p, attempt, deps } = await attemptCtx(c);
  const brief = await c.repo.get("generationBriefs", attempt.briefId);
  // the sequence = the production's CURRENT frames (latest attempt per shot), not just this attempt's subset
  const frames = (await c.repo.list("assets", { productionId: p.id })).filter((a) => a.current && a.kind !== "REEL" && a.status === "RAW");
  const rs = await runContinuityQa(c.repo, deps, p, attempt, frames, brief?.data.continuitySpec);
  const visual = rs.find((r) => r.method === "vision_model" || r.method === "manual");
  return { output: { results: rs.map((r) => ({ id: r.id, status: r.status, method: r.method, retry: r.retry })), inspectedImages: rs.filter((r) => r.inspectedImage).length }, summary: rs.length ? `${p.code} continuity: ${visual?.status ?? "n/a"}${visual?.retry?.exhausted ? ` (inspector unavailable after ${visual.retry.attempts} attempt(s))` : ""}` : `${p.code}: not a multi-frame sequence` };
};
const contentQaProduction: Handler = async (c) => {
  const { p, attempt, deps } = await attemptCtx(c);
  const r = await runContentQa(c.repo, deps, p, attempt);
  const ids: string[] = [];
  if (r.status === "REVIEW") ids.push((await c.report({ kind: "QA", title: `Content QA REVIEW — ${p.code}`, body: `${r.summary}\n\nRecommendation: ${r.recommendation ?? "—"}`, data: { productionId: p.id }, sources: ["productions", "qa_results"] })).id);
  return { output: { status: r.status, findings: r.findings }, summary: `${p.code}: ${r.status}${r.findings.length ? ` — ${r.summary}` : ""}`, reportIds: ids };
};
const productionFinalize: Handler = async (c) => {
  const { p, attempt, deps } = await attemptCtx(c);
  const f = await finalizeAttempt(c.repo, deps, p.id, attempt.id);
  if (f.productionStatus === "REVIEW") await ensureApprovalWait(c.repo, p.id, p.code, c.origin);
  const ids: string[] = [];
  if (f.attemptStatus === "HARD_FAIL") ids.push((await c.report({ kind: "ALERT", title: `${p.code} attempt ${attempt.attemptNo} HARD_FAIL`, body: `QA hard-failed this attempt. Previous attempts are preserved. Use Regenerate on the production page.`, data: { productionId: p.id }, sources: ["qa_results", "generation_attempts"] }, "PRODUCTION_MANAGER")).id);
  return { output: { ...f }, summary: `${p.code} attempt ${attempt.attemptNo}: ${f.attemptStatus} → ${f.productionStatus}`, reportIds: ids };
};
const productionRegenerate: Handler = async (c) => {
  const id = String(c.task.input.productionId);
  const deps: Deps = { ...defaultDeps(), ...c.deps, origin: c.origin, vision: visionOf(c), trace: async (agent, kind, message, o) => { await c.log(kind, message, { ...o, agent }); } };
  const r = await regenerateProduction(c.repo, deps, id, { notes: String(c.task.input.notes ?? ""), shots: c.task.input.shots as number[] | undefined, creative: c.task.input.creative ? CreativeInputSchema.parse(c.task.input.creative) : undefined }, null); // NOT the agent run id: provider_jobs.run_id is a foreign key to workflow_runs (agent-run lineage lives in agent_runs/events)
  const p = (await c.repo.get("productions", id))!;
  await enqueueQaFamily(c.repo, c.task, id, p.code, r.attempt.id);
  return { output: { attemptId: r.attempt.id, attemptNo: r.attempt.attemptNo, shots: r.shots, failures: r.failures }, summary: `${p.code} attempt ${r.attempt.attemptNo}: regenerated shot(s) ${r.shots.join(", ")}${r.failures.length ? ` — ${r.failures.length} issue(s)` : ""}` };
};

const productionDigest: Handler = async (c) => {
  const d = await buildStatusReport(c.repo);
  const extra = await narrate(c, "Summarise production status and what needs attention", d.body);
  const r = await c.report({ ...d, body: d.body + extra, kind: "DIGEST", title: "Production digest" }, "PRODUCTION_MANAGER");
  return { output: { reportId: r.id }, summary: "Production digest published", reportIds: [r.id] };
};

const orchestratorReport: Handler = async (c) => {
  const scope = c.task.input.scope === "status" ? "status" : "creators";
  await c.log("READ_STATE", `Reading Northline records for the ${scope} report`);
  const d = scope === "status" ? await buildStatusReport(c.repo) : await buildCreatorsReport(c.repo);
  const extra = await narrate(c, `Highlight what matters in this ${scope} report`, d.body);
  const r = await c.report({ ...d, body: d.body + extra });
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
  "performance.report": performanceReport, "identity_qa.review": identityReview, "content_qa.review": contentReview, "content_qa.audit": contentAudit,
  "production.create": productionCreate, "identity_qa.attempt": identityQaAttempt, "continuity_qa.attempt": continuityQaAttempt, "technical_qa.attempt": technicalQaAttempt, "content_qa.production": contentQaProduction, "production.finalize": productionFinalize, "production.regenerate": productionRegenerate, "production.digest": productionDigest, "orchestrator.report": orchestratorReport, "orchestrator.consolidate": consolidate,
};
/** Kinds whose dependencies may be FAILED/CANCELLED (they consolidate whatever completed). */
export const PARTIAL_DEPS_OK = new Set(["orchestrator.consolidate"]);
export { logEvent, explainQa };
