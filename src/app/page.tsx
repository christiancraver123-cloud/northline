import Link from "next/link";
import { getRepo } from "@/lib/db";
import { newestFirst } from "@/lib/db/order";
import { ROSTER } from "@/lib/talent/roster";
import { snapshots } from "@/lib/agents/ops/service";
import { deriveProviderHealth, HEALTH_TONE } from "@/lib/llm/health-derived";
import { summarizeUsage } from "@/lib/usage";
import { loadCommandCenter } from "@/lib/ops/load";
import { CommandCenterPanel } from "@/components/command-center";
import { isReadOnly } from "@/lib/runtime/mode";
import { AgentStatusPill, Avatar, Card, ProviderPill, ago, DemoBadge, Empty, PageHeader, Pill, ProdLink, StatusPill, TalentChips } from "@/components/ui";

export default async function Dashboard() {
  const repo = await getRepo();
  const [snaps, reports, llmCalls, tasks, assetsAll] = await Promise.all([snapshots(repo), repo.list("agentReports", { read: false }), repo.list("llmCalls"), repo.list("agentTasks"), repo.list("assets")]);
  const [prods, approvals, jobs, runs, cal, launch] = await Promise.all([
    repo.list("productions").then(newestFirst), repo.list("approvals", { state: "PENDING" }), repo.list("providerJobs"), repo.list("workflowRuns").then(newestFirst), repo.list("calendarEntries"), repo.list("launchStates"),
  ]);
  const cc = await loadCommandCenter(repo);
  const failedJobs = jobs.filter((j) => j.state === "FAILED");
  const health = deriveProviderHealth({ llmCalls, jobs });
  const usage7 = summarizeUsage({ jobs, llmCalls, tasks, since: new Date(Date.now() - 7 * 86_400_000) });
  const usage1 = summarizeUsage({ jobs, llmCalls, tasks, since: new Date(Date.now() - 86_400_000) });
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const failedTasks = tasks.filter((t) => t.status === "FAILED" && t.createdAt >= weekAgo);
  const needsQa = prods.filter((p) => (p.status === "REVIEW" || p.status === "RAW") && assetsAll.some((a) => a.productionId === p.id && a.current && ["HARD_FAIL", "MANUAL_REVIEW_REQUIRED", "REVIEW"].includes(a.qaStatus)));
  const providerProblems = health.filter((h) => !["HEALTHY", "UNKNOWN"].includes(h.state));
  const attention: [string, number, string][] = [
    ["Productions with QA needing a human", needsQa.length, "/productions"],
    ["Failed agent tasks (7 days)", failedTasks.length, "/agents"],
    ["Providers with problems", providerProblems.length, "/settings"],
    ["Unread agent reports", reports.length, "/agents/reports"],
  ];
  const generating = prods.filter((p) => p.status === "GENERATING" || p.status === "RAW");
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = cal.filter((c) => c.date >= today).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).slice(0, 5);
  const byId = Object.fromEntries(prods.map((p) => [p.id, p]));
  const kpis: [string, number, string, string][] = [
    ["Awaiting approval", approvals.length, "/approvals", approvals.length ? "text-warn" : ""],
    ["In production", generating.length, "/productions", ""],
    ["Failed jobs", failedJobs.length, "/productions", failedJobs.length ? "text-bad" : ""],
    ["Approved / scheduled", prods.filter((p) => p.status === "APPROVED" || p.status === "SCHEDULED").length, "/calendar", ""],
  ];
  return (
    <>
      <PageHeader title="Dashboard" sub="What needs you right now." actions={<Link href="/create" className="rounded-xl bg-gradient-to-br from-blue to-[#4d5cf0] px-4 py-2 font-bold">+ Create</Link>} />
      <CommandCenterPanel cc={cc} readOnly={isReadOnly()} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map(([l, n, href, tone]) => <Link key={l} href={href}><Card><div className="text-xs text-muted">{l}</div><div className={`font-mono text-3xl font-semibold ${tone}`}>{n}</div></Card></Link>)}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <div className="grid content-start gap-5">
          <Card>
            <h2 className="mb-3 font-bold">Needs approval</h2>
            {approvals.length === 0 ? <Empty>Nothing waiting. Use Create to start a production.</Empty> : approvals.slice(0, 6).map((a) => {
              const p = byId[a.productionId]; if (!p) return null;
              return <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-edge py-2 first:border-0"><span className="flex items-center gap-3"><ProdLink p={p} /><TalentChips codes={p.talent} /><span className="text-muted">{p.concept}</span><DemoBadge origin={p.origin} /></span><Link className="text-blue2" href="/approvals">Review →</Link></div>;
            })}
          </Card>
          <Card>
            <h2 className="mb-3 font-bold">Recent productions</h2>
            {prods.length === 0 ? <Empty>No productions yet.</Empty> : prods.slice(0, 6).map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-edge py-2 first:border-0"><span className="flex items-center gap-3"><ProdLink p={p} /><TalentChips codes={p.talent} /><span className="text-muted">{p.contentType} · {p.concept}</span></span><StatusPill status={p.status} /></div>
            ))}
          </Card>
        </div>
        <div className="grid content-start gap-5">
          <Card>
            <h2 className="mb-3 font-bold">Needs attention</h2>
            <div className="grid gap-1.5 text-[13px]">{attention.map(([l, n, href]) => <Link key={l} href={href} className="flex items-center justify-between gap-2 py-1"><span>{l}</span><Pill tone={n ? "warn" : "mute"}>{n}</Pill></Link>)}</div>
          </Card>
          <Card>
            <h2 className="mb-1 font-bold">Usage</h2>
            <p className="mb-2 text-[11.5px] text-faint">Recorded units. {usage7.costNote}.</p>
            <div className="grid gap-1.5 text-[13px]">
              {([["24 hours", usage1], ["7 days", usage7]] as const).map(([label, u]) => <div key={label} className="border-t border-edge pt-2 first:border-0 first:pt-0"><b>{label}</b><br /><span className="text-muted">{u.images.succeeded} image(s) generated · {u.images.failed} failed · {u.images.inputTokens.toLocaleString()} in ({u.images.imageInputTokens.toLocaleString()} image) / {u.images.outputTokens.toLocaleString()} out · {u.llm.calls} model call(s), {u.llm.failed} failed · {u.tasks.complete} task(s) done, {u.tasks.failed} failed</span></div>)}
            </div>
          </Card>
          <Card>
            <h2 className="mb-1 font-bold">Provider health</h2>
            <p className="mb-2 text-[11.5px] text-faint">Derived from recorded calls, so it is the same after a restart. “Unknown” = nothing recent to judge by.</p>
            <div className="grid gap-2 text-[13px]">{health.map((h) => <div key={h.id} className="flex flex-wrap items-start justify-between gap-2 border-t border-edge pt-2 first:border-0 first:pt-0"><span className="min-w-0"><b>{h.label}</b><br /><span className="text-[11.5px] text-muted break-words">{h.detail}</span></span><Pill tone={HEALTH_TONE[h.state]}>{h.state.replace("_", " ")}</Pill></div>)}</div>
          </Card>
          <Card>
            <div className="mb-3 flex items-center justify-between"><h2 className="font-bold">Agent activity</h2><Link className="text-blue2" href="/agents">Open →</Link></div>
            <div className="mb-3 flex flex-wrap gap-1.5 text-[12px]">{(["WORKING", "QUEUED", "WAITING", "SCHEDULED", "IDLE", "FAILED", "PAUSED"] as const).map((k) => { const n = snaps.filter((x) => x.status === k).length; return n ? <span key={k} className="inline-flex items-center gap-1"><AgentStatusPill status={k} /><b className="font-mono">{n}</b></span> : null; })}</div>
            <div className="grid gap-1.5">{snaps.map((x) => <Link key={x.agent.code} href={`/agents/${x.agent.code}`} className="flex items-center justify-between gap-2 text-[13px]"><span className="truncate">{x.agent.name}<span className="ml-2 text-[11px] text-faint">{x.current ? x.current.title.slice(0, 34) : x.lastEvent ? ago(x.lastEvent.createdAt) : ""}</span></span><span className="flex items-center gap-1.5">{x.lastRun && <ProviderPill provider={x.lastRun.provider} />}<AgentStatusPill status={x.status} /></span></Link>)}</div>
            {reports.length > 0 && <Link href="/agents/reports" className="mt-3 block text-warn">{reports.length} unread agent report{reports.length > 1 ? "s" : ""} →</Link>}
          </Card>
          <Card>
            <h2 className="mb-3 font-bold">Creators</h2>
            <div className="grid gap-2">{ROSTER.map((t) => {
              const l = launch.find((x) => x.talent === t.code);
              return <Link key={t.code} href={`/talent/${t.code}`} className="flex items-center justify-between gap-2"><span className="flex items-center gap-2"><Avatar code={t.code} size={28} />{t.name}</span><Pill tone={t.launchStatus === "active" ? "ok" : "warn"}>{t.launchStatus}{l && !l.aiDisclosure ? " · disclosure ✗" : ""}</Pill></Link>;
            })}</div>
          </Card>
          <Card>
            <h2 className="mb-3 font-bold">Upcoming</h2>
            {upcoming.length === 0 ? <Empty>Approved content appears here with a suggested slot.</Empty> : upcoming.map((c) => <div key={c.id} className="flex justify-between border-t border-edge py-1.5 first:border-0"><span className="font-mono text-muted">{c.date} {c.time}</span><span>{byId[c.productionId]?.code}</span></div>)}
          </Card>
          <Card>
            <h2 className="mb-3 font-bold">Workflow runs</h2>
            {runs.length === 0 ? <Empty>No runs yet.</Empty> : runs.slice(0, 4).map((r) => <div key={r.id} className="flex items-center justify-between border-t border-edge py-1.5 first:border-0"><span>{r.workflow}</span><StatusPill status={r.state} /></div>)}
          </Card>
        </div>
      </div>
    </>
  );
}
