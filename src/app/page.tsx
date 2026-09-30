import Link from "next/link";
import { getRepo } from "@/lib/db";
import { ROSTER } from "@/lib/talent/roster";
import { snapshots } from "@/lib/agents/ops/service";
import { AgentStatusPill, Avatar, Card, ProviderPill, ago, DemoBadge, Empty, PageHeader, Pill, ProdLink, StatusPill, TalentChips } from "@/components/ui";

export default async function Dashboard() {
  const repo = await getRepo();
  const [snaps, reports] = await Promise.all([snapshots(repo), repo.list("agentReports", { read: false })]);
  const [prods, approvals, jobs, runs, cal, launch] = await Promise.all([
    repo.list("productions"), repo.list("approvals", { state: "PENDING" }), repo.list("providerJobs"), repo.list("workflowRuns"), repo.list("calendarEntries"), repo.list("launchStates"),
  ]);
  const failedJobs = jobs.filter((j) => j.state === "FAILED");
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
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map(([l, n, href, tone]) => <Link key={l} href={href}><Card><div className="text-xs text-muted">{l}</div><div className={`font-mono text-3xl font-semibold ${tone}`}>{n}</div></Card></Link>)}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <div className="grid gap-5">
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
