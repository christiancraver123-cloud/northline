// Reports built ONLY from real Northline records. Every report lists the tables it read; empty data is stated, never invented.
import type { Repo } from "@/lib/db/repo";
import { ROSTER } from "@/lib/talent/roster";
import { snapshots } from "./service";
import type { AgentReport } from "@/lib/db/records";

export type ReportDraft = Pick<AgentReport, "kind" | "title" | "body" | "data" | "sources">;
const stamp = () => new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";

export async function buildStatusReport(repo: Repo): Promise<ReportDraft> {
  const [snaps, approvals, prods, jobs] = await Promise.all([snapshots(repo), repo.list("approvals", { state: "PENDING" }), repo.list("productions"), repo.list("providerJobs")]);
  const lines = snaps.map((s) => `• ${s.agent.name}: ${s.status}${s.current ? ` — ${s.current.title}` : ""}${s.queued ? ` (${s.queued} queued)` : ""}${s.lastError && s.status === "FAILED" ? ` — last error: ${s.lastError}` : ""}`);
  const failed = jobs.filter((j) => j.state === "FAILED");
  const body = [`Status as of ${stamp()}`, "", ...lines, "", `Approvals pending: ${approvals.length}`, `Productions: ${prods.length} (${countBy(prods.map((p) => p.status))})`, `Failed provider jobs: ${failed.length}`].join("\n");
  return { kind: "STATUS", title: "Agent status report", body, data: { agents: snaps.map((s) => ({ code: s.agent.code, status: s.status })) }, sources: ["agents", "agent_tasks", "approvals", "productions", "provider_jobs"] };
}

export async function buildCreatorsReport(repo: Repo): Promise<ReportDraft> {
  const [prods, approvals, assets, launch, tasks, analytics, orch] = await Promise.all([
    repo.list("productions"), repo.list("approvals", { state: "PENDING" }), repo.list("assets"), repo.list("launchStates"), repo.list("agentTasks"), repo.list("analytics"),
    repo.list("agents").then((a) => a.find((x) => x.code === "ORCHESTRATOR")),
  ]);
  const real = analytics.filter((a) => a.source !== "demo");
  const sections = ROSTER.map((t) => {
    const mine = prods.filter((p) => p.talent[0] === t.code);
    const mineIds = new Set(mine.map((p) => p.id));
    const pend = approvals.filter((a) => mineIds.has(a.productionId)).length;
    const failed = assets.filter((a) => mineIds.has(a.productionId) && a.status === "FAILED").length;
    const blocked = mine.filter((p) => p.status === "IDEA" && p.qaNotes.length).length;
    const l = launch.find((x) => x.talent === t.code);
    const steps = l ? ["accountCreated", "bioDone", "aiDisclosure", "profilePicture", "masterFace", "referencesDone", "initialContent", "approved"].filter((k) => (l as unknown as Record<string, boolean>)[k]).length : 0;
    const open = tasks.filter((x) => x.talent === t.code && (x.status === "QUEUED" || x.status === "RUNNING")).length;
    const flags = [orch?.config.priorityTalent?.includes(t.code) && "PRIORITISED", orch?.config.pausedTalent?.includes(t.code) && "PRODUCTION HELD"].filter(Boolean).join(", ");
    const last = mine[0];
    return [`${t.name} (${t.code}) — launch ${steps}/8${l?.handle ? `, @${l.handle}` : ", no handle"}${flags ? ` [${flags}]` : ""}`,
      `  Productions: ${mine.length}${mine.length ? ` (${countBy(mine.map((p) => p.status))})` : ""}; awaiting approval: ${pend}; failed assets: ${failed}; identity-QA blocked: ${blocked}; open agent tasks: ${open}`,
      `  Latest: ${last ? `${last.code} ${last.contentType} "${last.concept}" (${last.status})` : "none yet"}`].join("\n");
  });
  const body = [`Creator report as of ${stamp()}`, "", ...sections, "", `Analytics: ${real.length ? `${real.length} real/manual record(s)` : "no real analytics data exists — no performance claims are made"}.`, `Published posts recorded: ${prods.filter((p) => p.status === "PUBLISHED").length}.`].join("\n");
  return { kind: "CREATORS", title: "Report on all six creators", body, data: { creators: ROSTER.map((t) => t.code) }, sources: ["productions", "approvals", "assets", "launch_states", "agent_tasks", "analytics", "agents"] };
}

function countBy(xs: string[]) {
  const m: Record<string, number> = {};
  for (const x of xs) m[x] = (m[x] ?? 0) + 1;
  return Object.entries(m).map(([k, v]) => `${v} ${k}`).join(", ") || "none";
}
export { countBy };

/** Explain why identity/content QA flagged a production, from stored prompt QA results, QA notes and activity events. */
export async function explainQa(repo: Repo, productionId: string): Promise<{ text: string; found: boolean }> {
  const p = await repo.get("productions", productionId);
  if (!p) return { text: "I can't find that production.", found: false };
  const [prompts, assets, events, approvals] = await Promise.all([repo.list("prompts", { productionId }), repo.list("assets", { productionId }), repo.list("agentEvents"), repo.list("approvals", { productionId })]);
  const bad = prompts.filter((x) => !x.qa.ok);
  const out = [`${p.code} (${p.contentType}, ${p.talent.join("+")}) is ${p.status}.`];
  if (bad.length) { out.push("Identity QA rejected these prompts:"); for (const b of bad) out.push(`  • Shot ${b.shotN}: ${b.qa.issues.join("; ")}`); out.push("Generation was blocked until the prompt matches the canonical identity."); }
  else out.push(`Identity QA found no prompt issues (${prompts.length} prompt(s) checked).`);
  const other = p.qaNotes.filter((n) => !n.startsWith("Shot"));
  if (other.length) out.push(`Content QA notes: ${other.join("; ")}`);
  const failedAssets = assets.filter((a) => a.status === "FAILED" || a.status === "REJECTED");
  if (failedAssets.length) out.push(`Assets with problems: ${failedAssets.map((a) => `${a.kind}-${a.seq} (${a.status})`).join(", ")}.`);
  const rej = approvals.filter((a) => a.state === "REJECTED" || a.state === "REVISION_REQUESTED");
  if (rej.length) out.push(`Human decisions: ${rej.map((a) => `${a.state}${a.notes ? ` — "${a.notes}"` : ""}`).join("; ")}.`);
  const ev = events.filter((e) => (e.kind === "QA_REJECTED" || e.kind === "QA_PASSED") && e.message.includes(p.code)).slice(-1)[0];
  if (ev) out.push(`Logged: ${ev.message}`);
  return { text: out.join("\n"), found: true };
}
