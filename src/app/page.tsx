import Link from "next/link";
import { getRepo } from "@/lib/db";
import { snapshots } from "@/lib/agents/ops/service";
import { loadDashboard, type Tone } from "@/lib/ops/dashboard";
import { CommandCenterPanel } from "@/components/command-center";
import { isReadOnly } from "@/lib/runtime/mode";
import { AgentStatusPill, Card, Pill, ProviderPill, ago } from "@/components/ui";
import { CreatorPortrait, TriadPills } from "@/components/cc";

const dot: Record<Tone, string> = { ok: "bg-ok", warn: "bg-warn", bad: "bg-bad", info: "bg-blue2", mute: "bg-faint" };
const txt: Record<Tone, string> = { ok: "text-ok", warn: "text-warn", bad: "text-bad", info: "text-blue2", mute: "text-muted" };
const pct = (x: number | null) => (x == null ? "—" : `${(x * 100).toFixed(1)}%`);
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "—");

export default async function Dashboard() {
  const repo = await getRepo();
  const [d, snaps] = await Promise.all([loadDashboard(repo), snapshots(repo)]);
  const readOnly = isReadOnly();
  const working = snaps.filter((s) => s.status === "WORKING" || s.status === "FAILED" || s.status === "WAITING");
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-extrabold tracking-tight">Northline</h1><p className="text-muted">What needs you, who needs content, and what the system is doing.</p></div>
        <Link href="/create" className="rounded-xl bg-gradient-to-br from-blue to-[#4d5cf0] px-4 py-2 font-bold">+ Create image</Link>
      </div>

      <section aria-label="Status" className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-edge bg-edge sm:grid-cols-3 lg:grid-cols-6">
        {d.status.map((s) => {
          const body = <div className="h-full bg-panel/95 px-3 py-2.5" title={s.title}><div className="text-[10.5px] font-bold uppercase tracking-wider text-faint">{s.label}</div><div className={`mt-0.5 flex items-center gap-1.5 font-mono text-[13px] font-semibold ${txt[s.tone]}`}><span className={`h-1.5 w-1.5 flex-none rounded-full ${dot[s.tone]}`} /><span className="truncate">{s.value}</span></div></div>;
          return s.href ? <Link key={s.label} href={s.href} className="hover:brightness-125">{body}</Link> : <div key={s.label}>{body}</div>;
        })}
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-5">
          <Card>
            <h2 className="mb-2 font-bold">Needs attention</h2>
            <ul className="grid gap-1">{d.attention.map((a, i) => (
              <li key={i}><Link href={a.href} className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-[13.5px] hover:bg-blue2/10"><span className={`mt-1.5 h-2 w-2 flex-none rounded-full ${dot[a.tone]}`} /><span className="min-w-0 flex-1">{a.text}</span><span className="text-faint">→</span></Link></li>
            ))}</ul>
          </Card>

          <section aria-label="Creators">
            <div className="mb-2 flex items-baseline justify-between"><h2 className="font-bold">Creators <span className="text-[12px] font-normal text-muted">· sorted by priority</span></h2><Link href="/talent" className="text-[13px] text-blue2">All talent →</Link></div>
            <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {d.creators.map((c) => (
                <Link key={c.code} href={`/talent/${c.code}`} className="group overflow-hidden rounded-2xl border border-edge bg-panel/80 hover:border-blue2/50">
                  <div className="flex gap-3 p-3">
                    <CreatorPortrait code={c.code} refId={d.masters[c.code]} className="h-24 w-20 flex-none rounded-xl" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2"><b className="truncate">{c.name}</b><span className="text-right"><span className="font-mono text-xl font-bold" style={{ color: c.color }}>{c.priority.score}</span><span className="block text-[10px] uppercase tracking-wider text-faint">priority</span></span></div>
                      <div className="mt-0.5 flex flex-wrap gap-1"><Pill tone={c.active ? "ok" : "warn"}>{c.active ? "active" : "setup"}</Pill>{!c.aiDisclosure && <Pill tone="warn">disclosure ✗</Pill>}{c.agentActivity && <Pill tone="info">agent working</Pill>}</div>
                      <p className="mt-1 truncate text-[12px] text-muted">{c.priority.reasons.slice(0, 2).join(" · ") || "No urgent signal"}</p>
                    </div>
                  </div>
                  <dl className="grid grid-cols-3 gap-px border-t border-edge bg-edge text-[11.5px]">
                    {([["Last post", day(c.lastContentAt)], ["Next planned", c.nextPlanned ?? "—"], ["Gap", c.postingGapDays == null ? "never" : `${c.postingGapDays}d`], ["Approved ready", String(c.approvedReady)], ["In review", String(c.awaitingApproval)], ["Engagement", c.engagementRate == null ? "no data" : `${pct(c.engagementRate)}${c.insightsAreMock ? " (mock)" : ""}`]] as const).map(([k, v]) => <div key={k} className="bg-panel/95 px-2.5 py-1.5"><dt className="text-faint">{k}</dt><dd className="truncate font-mono">{v}</dd></div>)}
                  </dl>
                  {c.storyline && <p className="truncate border-t border-edge px-3 py-1.5 text-[12px] text-muted">Story: {c.storyline}</p>}
                </Link>
              ))}
            </div>
          </section>

          <Card>
            <div className="mb-3 flex items-baseline justify-between"><h2 className="font-bold">Production pipeline</h2><Link href="/productions" className="text-[13px] text-blue2">Productions →</Link></div>
            <div className="grid grid-cols-5 gap-2 2xl:grid-cols-10">
              {d.pipeline.map((s) => (
                <Link key={s.key} href={s.key === "QUEUED" || s.key === "BLOCKED" ? "/agents" : `/productions?status=${s.key}`} title={s.note} className={`rounded-xl border px-2 py-2 text-center ${s.count ? (s.key === "FAILED" || s.key === "BLOCKED" ? "border-bad/40 bg-bad/10" : s.key === "REVIEW" ? "border-warn/40 bg-warn/10" : "border-edge bg-panel2") : "border-edge opacity-55"}`}>
                  <div className="font-mono text-xl font-bold">{s.count}</div><div className="text-[10.5px] uppercase tracking-wide text-muted">{s.label}</div>
                </Link>
              ))}
            </div>
          </Card>
        </div>

        <div className="grid content-start gap-5">
          <Card>
            <div className="mb-3 flex items-baseline justify-between"><h2 className="font-bold">Approvals <span className="font-mono text-warn">{d.approvals.length || ""}</span></h2><Link href="/approvals" className="text-[13px] text-blue2">Review →</Link></div>
            {d.approvals.length === 0 ? <p className="text-[13px] text-muted">Nothing waiting. <Link href="/create" className="text-blue2">Create an image →</Link></p> : (
              <div className="grid grid-cols-2 gap-3">{d.approvals.slice(0, 4).map((a) => (
                <Link key={a.approvalId} href={`/approvals?id=${a.approvalId}`} className="group block">
                  <div className="relative aspect-[4/5] overflow-hidden rounded-xl border border-edge" style={{ background: "linear-gradient(160deg,#1a2350,#0b1128)" }}>
                    {a.asset?.storagePath ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/api/assets/${a.asset.id}/file`} alt={a.production.code} className="h-full w-full object-cover transition group-hover:scale-[1.02]" /> : <span className="grid h-full place-items-center p-2 text-center text-[11px] text-muted">{a.asset ? `${a.asset.provider} · no image file` : "no asset"}</span>}
                    <span className="absolute left-1.5 top-1.5 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[10.5px]">{a.production.code}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">{a.triad ? <TriadPills triad={a.triad} compact /> : null}</div>
                  <p className="mt-0.5 truncate text-[12px] text-muted">{a.production.concept}</p>
                  <p className="text-[11px] text-faint">{a.ageHours}h old · {a.provider}{a.costUsd != null ? ` · $${a.costUsd.toFixed(2)}` : ""}</p>
                </Link>
              ))}</div>
            )}
          </Card>

          <Card>
            <h2 className="mb-2 font-bold">System</h2>
            <div className="grid gap-0">{d.system.map((s) => (
              <div key={s.name} className="flex items-start justify-between gap-3 border-t border-edge py-1.5 text-[13px] first:border-0">
                <span className="min-w-0"><b>{s.name}</b><span className="block text-[11.5px] text-muted break-words">{s.detail}</span></span>
                <span className={`flex-none font-mono text-[11.5px] font-semibold ${txt[s.tone]}`}>{s.state}</span>
              </div>
            ))}</div>
          </Card>

          <Card>
            <div className="mb-2 flex items-baseline justify-between"><h2 className="font-bold">Agents</h2><Link className="text-[13px] text-blue2" href="/agents">Open →</Link></div>
            {working.length === 0 ? <p className="text-[13px] text-muted">All agents idle or scheduled. Idle agents make no model calls.</p> : working.map((x) => (
              <Link key={x.agent.code} href={`/agents/${x.agent.code}`} className="flex items-center justify-between gap-2 border-t border-edge py-1.5 text-[13px] first:border-0">
                <span className="min-w-0"><b>{x.agent.name}</b><span className="block truncate text-[11.5px] text-muted">{x.current ? x.current.title : x.status === "FAILED" ? x.lastError : `${x.waiting} waiting`}{x.current?.startedAt ? ` · ${ago(x.current.startedAt)}` : ""}</span></span>
                <span className="flex flex-none items-center gap-1.5">{x.lastRun && <ProviderPill provider={x.lastRun.provider} model={x.lastRun.model} />}<AgentStatusPill status={x.status} /></span>
              </Link>
            ))}
          </Card>

          {d.recentPublications.length > 0 && (
            <Card>
              <div className="mb-2 flex items-baseline justify-between"><h2 className="font-bold">Recently published <Pill tone="warn">mock</Pill></h2><Link className="text-[13px] text-blue2" href="/analytics">Analytics →</Link></div>
              {d.recentPublications.map((p) => <div key={p.id} className="flex justify-between gap-2 border-t border-edge py-1.5 text-[12.5px] first:border-0"><span className="truncate">{p.talent} · {p.caption || "no caption"}</span><span className="flex-none text-faint">{ago(p.publishedAt)}</span></div>)}
            </Card>
          )}
        </div>
      </div>

      <details className="mt-6 rounded-2xl border border-edge p-3">
        <summary className="cursor-pointer font-bold text-muted">Operations detail — workers, queue, budget limits, emergency pause</summary>
        <div className="mt-3"><CommandCenterPanel cc={d.cc} readOnly={readOnly} /></div>
      </details>
    </>
  );
}
