import Link from "next/link";
import { notFound } from "next/navigation";
import { getRepo } from "@/lib/db";
import { snapshots } from "@/lib/agents/ops/service";
import { AGENT_BY_CODE } from "@/lib/agents/ops/registry";
import { ROSTER } from "@/lib/talent/roster";
import type { AgentCode } from "@/lib/db/records";
import { agentControlAction } from "../../actions";
import { ChatPanel } from "@/components/ChatPanel";
import { AgentStatusPill, Btn, Card, Empty, PageHeader, Pill, StatusPill, ago } from "@/components/ui";

const TABS = ["chat", "activity", "queue", "reports", "settings"] as const;
const SUGGEST: Partial<Record<AgentCode, string[]>> = {
  ORCHESTRATOR: ["What is everyone doing?", "Prioritize Vesper", "Pause Skye production", "Resume Skye production"],
  CONTENT_STRATEGIST: ["give me three concepts for Sienna", "what are you doing?"], CREATIVE_DIRECTOR: ["create three concepts for Sienna", "what are you doing?"],
  GROWTH_STRATEGIST: ["give me recommendations", "what are you doing?"], PERFORMANCE_AGENT: ["report", "what are you doing?"], IDENTITY_QA: ["why did you reject the last production?", "what are you doing?"],
};

export default async function AgentWorkspace({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ tab?: string }> }) {
  const code = (await params).code.toUpperCase() as AgentCode;
  const def = AGENT_BY_CODE[code];
  if (!def) notFound();
  const tab = (TABS as readonly string[]).includes((await searchParams).tab ?? "") ? (await searchParams).tab! : "chat";
  const repo = await getRepo();
  const snap = (await snapshots(repo)).find((s) => s.agent.code === code)!;
  const [messages, events, tasks, runs, reports, schedules] = await Promise.all([
    repo.list("agentMessages", { agentId: code }), repo.list("agentEvents", { agentId: code }), repo.list("agentTasks", { agentId: code }),
    repo.list("agentRuns", { agentId: code }), repo.list("agentReports", { agentId: code }), repo.list("agentSchedules", { agentId: code }),
  ]);
  const byNew = <T extends { createdAt: string }>(a: T[]) => [...a].sort((x, y) => y.createdAt.localeCompare(x.createdAt));
  const ctl = (op: string, extra: Record<string, string> = {}) => <><input type="hidden" name="agent" value={code} /><input type="hidden" name="op" value={op} />{Object.entries(extra).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}</>;
  const active = tasks.filter((t) => t.status === "QUEUED" || t.status === "RUNNING" || t.status === "WAITING").sort((a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt));
  const history = byNew(tasks.filter((t) => ["COMPLETE", "FAILED", "CANCELLED"].includes(t.status))).slice(0, 25);
  return (
    <>
      <PageHeader title={def.name} sub={def.role} actions={<span className="flex items-center gap-2"><AgentStatusPill status={snap.status} />{snap.current && <Pill tone="info">{snap.current.title.slice(0, 40)}</Pill>}</span>} />
      <nav className="mb-4 flex flex-wrap gap-1 border-b border-edge" aria-label="Agent workspace">
        {TABS.map((t) => <Link key={t} href={`/agents/${code}?tab=${t}`} aria-current={tab === t ? "page" : undefined} className={`rounded-t-lg px-4 py-2 font-semibold capitalize ${tab === t ? "border-b-2 border-blue2 text-ink" : "text-muted hover:text-ink"}`}>{t}{t === "queue" && snap.queued + snap.waiting > 0 ? ` (${snap.queued + snap.waiting})` : ""}{t === "reports" && reports.filter((r) => !r.read).length ? ` (${reports.filter((r) => !r.read).length})` : ""}</Link>)}
        <Link href="/agents" className="ml-auto px-3 py-2 text-muted">← All agents</Link>
      </nav>

      {tab === "chat" && <Card><ChatPanel agent={code} name={def.name} messages={messages} suggestions={SUGGEST[code] ?? ["what are you doing?"]} /></Card>}

      {tab === "activity" && (
        <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
          <Card>
            <h2 className="mb-1 font-bold">Activity log</h2><p className="mb-2 text-[12px] text-faint">Operational events and task results — not model reasoning.</p>
            {events.length === 0 ? <Empty>No activity recorded yet. This agent is idle until work arrives.</Empty> : byNew(events).slice(0, 80).map((e) => (
              <div key={e.id} className="flex gap-2 border-t border-edge py-1.5 text-[12.5px] first:border-0">
                <span className="w-16 flex-none font-mono text-faint" title={e.createdAt}>{ago(e.createdAt)}</span>
                <span className="w-36 flex-none truncate font-mono text-[11px] text-blue2">{e.kind}</span>
                <span className={e.level === "error" ? "text-bad" : e.level === "warn" ? "text-warn" : ""}>{e.message}</span>
              </div>
            ))}
          </Card>
          <Card>
            <h2 className="mb-2 font-bold">Run history</h2>
            {runs.length === 0 ? <Empty>No runs yet.</Empty> : byNew(runs).slice(0, 20).map((r) => (
              <div key={r.id} className="border-t border-edge py-1.5 text-[12.5px] first:border-0"><div className="flex items-center justify-between"><span className="font-mono text-faint">{r.startedAt.slice(0, 16).replace("T", " ")} · {r.trigger}</span><StatusPill status={r.state} /></div><div className="text-muted">{r.error ?? r.summary}</div><div className="text-[11px] text-faint">model cost: {r.costUsd == null ? "none (no model call)" : `$${r.costUsd}`}</div></div>
            ))}
          </Card>
        </div>
      )}

      {tab === "queue" && (
        <div className="grid gap-5">
          <Card>
            <div className="mb-2 flex items-center justify-between"><h2 className="font-bold">Queue ({active.length})</h2><form action={agentControlAction}>{ctl("run")}<Btn>Run eligible tasks now</Btn></form></div>
            {active.length === 0 ? <Empty>Nothing queued. {def.name} is idle and using no model/API calls.</Empty> : active.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-edge py-2 first:border-0">
                <span><b>{t.title}</b> <span className="font-mono text-[11px] text-faint">{t.kind} · P{t.priority} · by {t.createdBy}{t.talent ? ` · ${t.talent}` : ""}{t.waitingOn ? ` · waiting on ${t.waitingOn}` : ""}{t.dependsOn.length ? ` · ${t.dependsOn.length} dep(s)` : ""}</span></span>
                <span className="flex items-center gap-2"><StatusPill status={t.status} />
                  {t.status === "QUEUED" && <form action={agentControlAction}>{ctl("prioritize", { taskId: t.id })}<Btn>Prioritise</Btn></form>}
                  {(t.status === "QUEUED" || t.status === "WAITING") && <form action={agentControlAction}>{ctl("cancel", { taskId: t.id })}<Btn>Cancel</Btn></form>}</span>
              </div>
            ))}
          </Card>
          <Card>
            <h2 className="mb-2 font-bold">Task history</h2>
            {history.length === 0 ? <Empty>No finished tasks.</Empty> : history.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-edge py-2 first:border-0">
                <span>{t.title}<span className="block font-mono text-[11px] text-faint">{t.kind} · {t.finishedAt?.slice(0, 16).replace("T", " ")}{t.error ? ` · ${t.error}` : ""}</span></span>
                <span className="flex items-center gap-2"><StatusPill status={t.status} />{t.status === "FAILED" && <form action={agentControlAction}>{ctl("retry", { taskId: t.id })}<Btn>Retry</Btn></form>}</span>
              </div>
            ))}
          </Card>
        </div>
      )}

      {tab === "reports" && (
        <Card>
          <h2 className="mb-2 font-bold">Reports from {def.name}</h2>
          {reports.length === 0 ? <Empty>No reports yet. Reports appear when this agent completes a report task or flags something.</Empty> : byNew(reports).map((r) => (
            <details key={r.id} className="border-t border-edge py-2 first:border-0"><summary className="cursor-pointer">{!r.read && <span className="mr-2 text-warn">●</span>}<b>{r.title}</b> <span className="text-[11px] text-faint">{ago(r.createdAt)} · {r.kind}</span></summary><pre className="mt-2 whitespace-pre-wrap text-[12.5px] text-[#c6cdf0]">{r.body}</pre><p className="mt-1 text-[11px] text-faint">Sources: {r.sources.join(", ")}</p></details>
          ))}
          <Link href="/agents/reports" className="mt-2 inline-block text-blue2">Open reports inbox →</Link>
        </Card>
      )}

      {tab === "settings" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <h2 className="mb-2 font-bold">Identity &amp; configuration</h2>
            <p className="text-[13px] text-muted">{def.purpose}</p>
            <dl className="mt-3 grid grid-cols-[110px_1fr] gap-y-1 text-[13px]"><dt className="text-muted">Code</dt><dd className="font-mono">{code}</dd><dt className="text-muted">Engine</dt><dd>{def.mode} (no model calls)</dd><dt className="text-muted">Task kinds</dt><dd className="font-mono text-[12px]">{def.handles.join(", ") || "runs inside production workflows"}</dd></dl>
            <div className="mt-3 flex items-center gap-2">{snap.agent.paused ? <form action={agentControlAction}>{ctl("resume")}<Btn primary>Resume agent</Btn></form> : <form action={agentControlAction}>{ctl("pause")}<Btn>Pause agent</Btn></form>}<AgentStatusPill status={snap.status} /></div>
            <form action={agentControlAction} className="mt-3 grid gap-2">{ctl("notes")}<label className="text-[12px] text-muted">Operator notes<textarea name="notes" rows={3} defaultValue={snap.agent.notes} /></label><Btn>Save notes</Btn></form>
            {code === "ORCHESTRATOR" && <div className="mt-4 text-[13px]"><b>Creator controls</b><p className="text-muted">Prioritised: {snap.agent.config.priorityTalent?.map((c) => ROSTER.find((t) => t.code === c)!.first).join(", ") || "none"} · Production held: {snap.agent.config.pausedTalent?.map((c) => ROSTER.find((t) => t.code === c)!.first).join(", ") || "none"}. Change via chat ("Prioritize Vesper", "Pause Skye production").</p></div>}
          </Card>
          <div className="grid content-start gap-5">
            <Card>
              <h2 className="mb-2 font-bold">Schedules</h2>
              {schedules.length === 0 ? <Empty>No schedules for this agent.</Empty> : schedules.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-edge py-2 first:border-0">
                  <span>{s.name}<span className="block font-mono text-[11px] text-faint">{s.cron} UTC · next {s.nextRunAt?.slice(0, 16).replace("T", " ") ?? "—"} · last {s.lastRunAt?.slice(0, 16).replace("T", " ") ?? "never"}</span></span>
                  <form action={agentControlAction}>{ctl("schedule", { scheduleId: s.id, enabled: s.enabled ? "0" : "1" })}<Btn primary={!s.enabled}>{s.enabled ? "Disable" : "Enable"}</Btn></form>
                </div>
              ))}
              <p className="mt-2 text-[12px] text-faint">Schedules fire when the worker tick runs (POST /api/agents/tick from n8n/cron) — not from the browser. See docs/agents.md.</p>
            </Card>
            <Card>
              <h2 className="mb-2 font-bold">Error history</h2>
              {tasks.filter((t) => t.status === "FAILED").length === 0 && events.filter((e) => e.level === "error").length === 0 ? <Empty>No errors recorded.</Empty> : byNew(events.filter((e) => e.level === "error")).slice(0, 10).map((e) => <div key={e.id} className="border-t border-edge py-1.5 text-[12.5px] text-bad first:border-0"><span className="font-mono text-faint">{e.createdAt.slice(0, 16).replace("T", " ")}</span> {e.message}</div>)}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
