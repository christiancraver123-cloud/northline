// Operator chat. Messages are persisted; replies are built from REAL Northline state, and instructions become
// structured tasks / config changes / existing workflows. Deterministic intent routing (v0) — no hidden model calls.
import type { Repo } from "@/lib/db/repo";
import type { AgentCode, AgentMessage } from "@/lib/db/records";
import type { TalentCode } from "@/lib/domain/types";
import { ROSTER_BY_CODE } from "@/lib/talent/roster";
import { detectTalent, parseIntent } from "@/lib/orchestrator/intent";
import { AGENT_BY_CODE, AGENT_DEFS } from "./registry";
import { boostTalentTasks, cancelTask, enqueue, ensureAgents, logEvent, setPaused, setTalentFlag, snapshots } from "./service";
import { ASSIGNABLE, createAssignment, delegate, submitCreate } from "./commands";
import { explainQa } from "./reports";
import { summarise } from "./handlers";
import { processQueue } from "./worker";

const ALIASES: [AgentCode, RegExp][] = [
  ["GROWTH_STRATEGIST", /\bgrowth(?: strategist)?\b/], ["CONTENT_STRATEGIST", /\b(?:content )?strategist\b/], ["CREATIVE_DIRECTOR", /\bcreative director\b|\bdirector\b/],
  ["PROMPT_ENGINEER", /\bprompt engineer\b/], ["CAPTION_WRITER", /\bcaption(?: writer)?\b/], ["IDENTITY_QA", /\bidentity qa\b/], ["CONTENT_QA", /\bcontent qa\b/],
  ["PRODUCTION_MANAGER", /\bproduction manager\b/], ["PERFORMANCE_AGENT", /\bperformance(?: agent)?\b/], ["ORCHESTRATOR", /\borchestrator\b|\bnorthline\b/],
];
export function findAgents(text: string): AgentCode[] {
  let rest = text.toLowerCase();
  const found: { code: AgentCode; at: number }[] = [];
  for (const [code, re] of ALIASES) { const m = re.exec(rest); if (m) { found.push({ code, at: m.index }); rest = rest.replace(re, " ".repeat(m[0].length)); } }
  return found.sort((a, b) => a.at - b.at).map((f) => f.code);
}
const NUMW: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
function countIn(text: string): number {
  const m = text.toLowerCase().replace(/[a-z]{3}-\d{4}-\d{3}/gi, "").match(/\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\b/);
  return m ? Math.min(10, Math.max(1, NUMW[m[1]] ?? parseInt(m[1], 10))) : 3;
}
const PROD_CODE = /\b([A-Z]{3}-\d{4}-\d{3})\b/i;
const name = (c: TalentCode) => ROSTER_BY_CODE[c].first;

export interface ChatReply { reply: string; taskIds: string[]; reportIds: string[] }

export async function handleMessage(repo: Repo, agent: AgentCode, text: string): Promise<ChatReply> {
  await ensureAgents(repo);
  const clean = text.trim().slice(0, 2000);
  await repo.insert("agentMessages", { agentId: agent, role: "operator", content: clean, taskIds: [], reportIds: [], origin: "live" });
  let r: ChatReply;
  try { r = clean ? await route(repo, agent, clean) : { reply: "Say something and I'll act on it.", taskIds: [], reportIds: [] }; }
  catch (e) { r = { reply: `I couldn't do that: ${e instanceof Error ? e.message : "unknown error"}`, taskIds: [], reportIds: [] }; }
  await repo.insert("agentMessages", { agentId: agent, role: "agent", content: r.reply, taskIds: r.taskIds, reportIds: r.reportIds, origin: "live" });
  await logEvent(repo, agent, "OPERATOR_MESSAGE", `Operator message handled${r.taskIds.length ? ` — ${r.taskIds.length} task(s) created` : ""}`, { data: { text: clean.slice(0, 200) } });
  return r;
}

async function route(repo: Repo, me: AgentCode, text: string): Promise<ChatReply> {
  const lower = text.toLowerCase();
  const talent = detectTalent(text);
  const agents = findAgents(text);
  const none = (reply: string): ChatReply => ({ reply, taskIds: [], reportIds: [] });

  // --- self / status questions (valid for every agent) ---
  if (/\b(what (is|are|'s)|whats)\b.*\b(everyone|everybody|all (the )?agents|the team)\b.*\b(doing|up to)\b|\bagent status\b|^status\b/.test(lower) && me === "ORCHESTRATOR") return none(await statusAll(repo));
  if (/\b(what are you doing|your status|your queue|what('s| is) in your queue|your errors?|what failed for you|your history|recent activity)\b/.test(lower) || (me !== "ORCHESTRATOR" && /^(status|queue|errors?|history)\??$/.test(lower.trim()))) return none(await statusSelf(repo, me));

  // --- pause / resume ---
  const pr = lower.match(/^(?:please\s+)?(pause|resume|unpause|hold|release)\b(.*)$/);
  if (pr) {
    const pausing = pr[1] === "pause" || pr[1] === "hold";
    if (me !== "ORCHESTRATOR") { if (pausing) { await setPaused(repo, me, true); return none(`${AGENT_BY_CODE[me].name} is paused. It will not run queued work until resumed.`); } await setPaused(repo, me, false); return none(`${AGENT_BY_CODE[me].name} resumed.`); }
    if (talent.length && talent.length < 6) {
      for (const t of talent) await setTalentFlag(repo, "pausedTalent", t, pausing);
      const q = (await repo.list("agentTasks", { status: "QUEUED" })).filter((t) => t.talent && talent.includes(t.talent)).length;
      return none(pausing ? `Held production for ${talent.map(name).join(", ")}. ${q} queued task(s) for ${talent.length > 1 ? "them" : "her"} will wait; nothing new runs for ${talent.length > 1 ? "them" : "her"} until you resume.` : `Resumed production for ${talent.map(name).join(", ")}.`);
    }
    if (agents.length) { for (const a of agents) await setPaused(repo, a, pausing); return none(`${agents.map((a) => AGENT_BY_CODE[a].name).join(", ")} ${pausing ? "paused" : "resumed"}.`); }
    return none("Tell me what to " + pr[1] + ": a creator (e.g. \"Pause Skye production\") or an agent (e.g. \"Pause Content QA\").");
  }

  // --- prioritise ---
  const pri = lower.match(/^(?:please\s+)?(prioriti[sz]e|deprioriti[sz]e)\b/);
  if (pri && me === "ORCHESTRATOR") {
    if (!talent.length || talent.length === 6) return none("Which creator should I prioritise? e.g. \"Prioritize Vesper\".");
    const on = !pri[1].startsWith("de");
    let moved = 0;
    for (const t of talent) { await setTalentFlag(repo, "priorityTalent", t, on); if (on) moved += await boostTalentTasks(repo, t); }
    return none(on ? `${talent.map(name).join(", ")} prioritised: her queued work moves to the front (${moved} queued task(s) raised to priority 1) and new work for ${talent.length > 1 ? "them" : "her"} is scheduled ahead of others.` : `${talent.map(name).join(", ")} no longer prioritised.`);
  }
  const cancel = lower.match(/^cancel\b/);
  if (cancel && me === "ORCHESTRATOR" && talent.length === 1) {
    const qs = (await repo.list("agentTasks", { status: "QUEUED", talent: talent[0] }));
    for (const t of qs) await cancelTask(repo, t.id);
    return none(`Cancelled ${qs.length} queued task(s) for ${name(talent[0])}.`);
  }

  // --- explain QA ---
  if (/\bwhy\b.*\b(reject|rejected|fail|failed|block|blocked|flag|flagged)\b/.test(lower) || /\b(explain|what did)\b.*\b(qa)\b/.test(lower)) {
    const code = text.match(PROD_CODE)?.[1]?.toUpperCase();
    const prods = await repo.list("productions");
    let p = code ? prods.find((x) => x.code === code) : undefined;
    let note = "";
    if (!p && code) return none(`I can't find a production with code ${code}.`);
    if (!p) {
      const approvals = await repo.list("approvals");
      const flagged = prods.filter((x) => x.qaNotes.length || x.status === "REJECTED" || approvals.some((a) => a.productionId === x.id && (a.state === "REJECTED" || a.state === "REVISION_REQUESTED")));
      p = flagged[0];
      if (!p) return none("No production currently has a QA flag, rejection or revision request on record.");
      note = `(No production code given — showing the most recent flagged one.)\n`;
    }
    const ex = await explainQa(repo, p.id);
    return none(note + ex.text);
  }

  // --- specialist asked for its own report/audit ---
  if (me !== "ORCHESTRATOR" && ASSIGNABLE[me] && /\b(report|audit|recommend\w*)\b/.test(lower)) {
    const t = await delegate(repo, me, talent.length === 1 ? talent[0] : null, countIn(text));
    return taskReply(repo, t.id, AGENT_BY_CODE[me].name, true);
  }

  // --- reports ---
  if (/\breport\b/.test(lower) || /\bsummar(y|ise|ize)\b/.test(lower)) {
    if (agents.includes("PERFORMANCE_AGENT") || /\b(performance|analytics)\b/.test(lower)) {
      const t = await delegate(repo, "PERFORMANCE_AGENT", null, 1);
      return taskReply(repo, t.id, "Performance Agent");
    }
    const scope = /\b(six|all|every|creators?|roster)\b/.test(lower) || talent.length ? "creators" : "status";
    const t = await enqueue(repo, { agentId: "ORCHESTRATOR", kind: "orchestrator.report", title: `Report: ${scope}`, input: { scope }, createdBy: "operator", priority: 2 });
    await processQueue(repo, { onlyIds: [t.id], trigger: "operator" });
    return taskReply(repo, t.id, "Orchestrator", true);
  }

  // --- what failed / approvals ---
  if (/\b(what|which|anything)\b.*\b(fail|failed|broken|errors?)\b/.test(lower)) return none(await failures(repo));
  if (/\b(what|which|anything)\b.*\b(approval|approve|review)\b/.test(lower)) return none(await approvals(repo));

  // --- delegation: "Have X [and Y] ..." ---
  const have = lower.match(/^(?:please\s+)?(?:have|ask|tell|get)\s+/);
  const targetAgents = me !== "ORCHESTRATOR" ? [me] : (have ? agents : []);
  if ((have && agents.length) || (me !== "ORCHESTRATOR" && ASSIGNABLE[me] && /\b(create|give|propose|come up|develop|draft|generate|make)\b/.test(lower))) {
    const assignable = targetAgents.filter((a) => a !== "ORCHESTRATOR");
    const t = talent.length === 1 ? talent[0] : null;
    if (assignable.includes("CONTENT_QA") && /\baudit\b/.test(lower)) {
      const task = await delegate(repo, "CONTENT_QA", null, 1);
      return taskReply(repo, task.id, "Content QA", true);
    }
    if (assignable.some((a) => a === "IDENTITY_QA" || a === "CONTENT_QA")) {
      const code = text.match(PROD_CODE)?.[1]?.toUpperCase();
      const p = code ? (await repo.list("productions")).find((x) => x.code === code) : undefined;
      if (!p) return none(`${assignable[0] === "IDENTITY_QA" ? "Identity QA" : "Content QA"} needs a production code to review, e.g. "Have Identity QA review SIE-2026-001".`);
      const a = assignable.find((x) => x === "IDENTITY_QA" || x === "CONTENT_QA")!;
      const task = await enqueue(repo, { agentId: a, kind: a === "IDENTITY_QA" ? "identity_qa.review" : "content_qa.review", title: `Review ${p.code}`, input: { productionId: p.id }, productionId: p.id, talent: p.talent[0], createdBy: "operator" });
      await processQueue(repo, { onlyIds: [task.id], trigger: "operator" });
      return taskReply(repo, task.id, AGENT_BY_CODE[a].name);
    }
    if (assignable.length >= 2) {
      if (talent.length > 1) return none("Give a multi-agent assignment one creator at a time, e.g. \"Have Content Strategist, Creative Director and Growth Strategist develop a Sienna campaign\".");
      const a = await createAssignment(repo, { title: `${t ? name(t) : "Roster"} campaign development`, agents: assignable, talent: t, count: countIn(text) });
      const out = a.consolidate.output as { reportId?: string; complete?: boolean } | null;
      const rep = out?.reportId ? await repo.get("agentReports", out.reportId) : null;
      return { reply: `${a.consolidate.status === "COMPLETE" ? "Assignment complete" : `Assignment ${a.consolidate.status}`}: ${assignable.map((x) => AGENT_BY_CODE[x].name).join(", ")} contributed, and I consolidated the result.\n\n${rep?.body ?? a.consolidate.error ?? ""}\n\n(Full report is in the Reports inbox.)`, taskIds: [...a.children.map((c) => c.id), a.consolidate.id], reportIds: out?.reportId ? [out.reportId] : [] };
    }
    if (assignable.length === 1) {
      const ag = assignable[0];
      if (!ASSIGNABLE[ag]) return none(`${AGENT_BY_CODE[ag].name} doesn't take standalone assignments yet. It works as part of production workflows — try "Create a carousel for Sienna".`);
      if (ag !== "PERFORMANCE_AGENT" && ag !== "GROWTH_STRATEGIST" && !t) return none(`Which creator is this for? e.g. "Have ${AGENT_BY_CODE[ag].name} create three concepts for Sienna".`);
      const task = await delegate(repo, ag, t, countIn(text));
      return taskReply(repo, task.id, AGENT_BY_CODE[ag].name);
    }
  }

  // --- create content through the existing production workflow ---
  if (me === "ORCHESTRATOR" && /^(?:please\s+)?(create|make|build|give|generate|produce|plan)\b/.test(lower)) {
    const { request, issues } = parseIntent(text);
    if (!request) return none(issues.join(" "));
    const r = await submitCreate(repo, request, { createdBy: "operator" });
    const prods = r.output?.productions ?? [];
    const lines = prods.map((p) => `• ${p.code} — ${p.status}${p.qaOk ? "" : " (blocked by Identity QA)"}`);
    if (r.task.status === "FAILED") return { reply: `The production workflow failed: ${r.task.error}`, taskIds: [r.task.id], reportIds: [] };
    return { reply: `Started the production workflow (${request.format}, ${request.talent.map(name).join(" + ")}). ${prods.length} production(s):\n${lines.join("\n")}\n${r.output?.failures?.length ? `\nAttention: ${r.output.failures.join("; ")}` : "\nEverything is waiting in Approvals — nothing is published."}`, taskIds: [r.task.id], reportIds: (r.task.output?.reportIds as string[]) ?? [] };
  }

  if (me !== "ORCHESTRATOR") return none(`That's outside my role (${AGENT_BY_CODE[me].role}). Ask the Orchestrator, or try "what are you doing?".`);
  return none(HELP);
}

const HELP = `I can act on real Northline state. Try:
• "What is everyone doing?" · "Give me a report on all six creators" · "What failed?" · "What needs approval?"
• "Why did Identity QA reject SIE-2026-001?"
• "Prioritize Vesper" · "Pause Skye production" · "Resume Skye production"
• "Have the Creative Director create three concepts for Sienna"
• "Have Content Strategist, Creative Director and Growth Strategist develop a Sienna campaign"
• "Create a Pilates to coffee carousel for Zoe" (runs the production workflow; nothing is published)`;

async function taskReply(repo: Repo, taskId: string, who: string, showReportBody = false): Promise<ChatReply> {
  const t = (await repo.get("agentTasks", taskId))!;
  const reportIds = (t.output?.reportIds as string[] | undefined) ?? [];
  if (t.status === "FAILED") return { reply: `${who} couldn't complete that: ${t.error}`, taskIds: [t.id], reportIds };
  if (t.status !== "COMPLETE") return { reply: `${who} queued the task (${t.status}). It will run when it becomes eligible (paused agents/creators and unmet dependencies hold work).`, taskIds: [t.id], reportIds };
  let body = summarise(t.output ?? {});
  if (showReportBody && reportIds[0]) body = (await repo.get("agentReports", reportIds[0]))?.body ?? body;
  return { reply: `${who} finished: ${(await repo.list("agentRuns", { taskId: t.id }))[0]?.summary ?? t.title}\n\n${body}${reportIds.length ? "\n\n(Saved to the Reports inbox.)" : ""}`, taskIds: [t.id], reportIds };
}

async function statusAll(repo: Repo) {
  const snaps = await snapshots(repo);
  const lines = snaps.map((s) => `• ${s.agent.name}: ${s.status}${s.current ? ` — ${s.current.title}` : ""}${s.queued ? ` · ${s.queued} queued` : ""}${s.waiting ? ` · ${s.waiting} waiting` : ""}${s.status === "FAILED" && s.lastError ? ` · last error: ${s.lastError}` : ""}${s.nextSchedule ? ` · next scheduled ${s.nextSchedule.nextRunAt?.slice(0, 16).replace("T", " ")} UTC` : ""}`);
  const held = snaps[0].agent.config;
  const flags = [held.priorityTalent?.length && `Prioritised: ${held.priorityTalent.map(name).join(", ")}`, held.pausedTalent?.length && `Production held: ${held.pausedTalent.map(name).join(", ")}`].filter(Boolean);
  return `${lines.join("\n")}${flags.length ? `\n\n${flags.join(" · ")}` : ""}\n\nAgents only work when a task is queued, an event arrives, or a schedule fires; otherwise they are IDLE.`;
}
async function statusSelf(repo: Repo, me: AgentCode) {
  const s = (await snapshots(repo)).find((x) => x.agent.code === me)!;
  const [tasks, events] = await Promise.all([repo.list("agentTasks"), repo.list("agentEvents")]);
  const mine = tasks.filter((t) => t.agentId === me);
  const recent = events.filter((e) => e.agentId === me).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3);
  return `${AGENT_BY_CODE[me].name}: ${s.status}${s.current ? ` — ${s.current.title}` : ""}.\nQueue: ${s.queued} queued, ${s.waiting} waiting, ${s.blocked} blocked. History: ${mine.filter((t) => t.status === "COMPLETE").length} complete, ${mine.filter((t) => t.status === "FAILED").length} failed.${s.lastError ? `\nLast error: ${s.lastError}` : ""}${recent.length ? `\nRecent: ${recent.map((e) => e.message).join(" | ")}` : "\nNo activity recorded yet."}`;
}
async function failures(repo: Repo) {
  const [tasks, jobs, prods] = await Promise.all([repo.list("agentTasks", { status: "FAILED" }), repo.list("providerJobs", { state: "FAILED" }), repo.list("productions")]);
  const byId = new Map(prods.map((p) => [p.id, p.code]));
  const l = [...tasks.map((t) => `• Task "${t.title}" (${t.agentId}): ${t.error}`), ...jobs.map((j) => `• Provider job ${j.operation} #${j.shotN} on ${byId.get(j.productionId) ?? "?"} via ${j.provider}: ${j.error}`)];
  return l.length ? `Failures on record:\n${l.join("\n")}` : "Nothing has failed: no failed agent tasks or provider jobs on record.";
}
async function approvals(repo: Repo) {
  const [ap, prods] = await Promise.all([repo.list("approvals", { state: "PENDING" }), repo.list("productions")]);
  const byId = new Map(prods.map((p) => [p.id, p]));
  return ap.length ? `${ap.length} production(s) awaiting your approval:\n${ap.map((a) => { const p = byId.get(a.productionId); return `• ${p?.code} — ${p?.contentType} "${p?.concept}"`; }).join("\n")}` : "Nothing is waiting for approval.";
}
export { AGENT_DEFS };
