import Link from "next/link";
import { getRepo } from "@/lib/db";
import { snapshots } from "@/lib/agents/ops/service";
import { loadDashboard, type Tone } from "@/lib/ops/dashboard";
import { CommandCenterPanel } from "@/components/command-center";
import { isReadOnly } from "@/lib/runtime/mode";
import { ROSTER_BY_CODE } from "@/lib/talent/roster";
import { AgentStatusPill, ago } from "@/components/ui";
import { CreatorAvatar, CreatorPortrait } from "@/components/cc";
import { loadPortraits } from "@/lib/talent/portraits-server";

const dot: Record<Tone, string> = { ok: "bg-ok", warn: "bg-warn", bad: "bg-bad", info: "bg-blue2", mute: "bg-faint" };
const txt: Record<Tone, string> = { ok: "text-ok", warn: "text-warn", bad: "text-bad", info: "text-blue2", mute: "text-muted" };

export default async function Dashboard() {
  const repo = await getRepo();
  const [d, snaps, portraits] = await Promise.all([loadDashboard(repo), snapshots(repo), loadPortraits(repo)]);
  const readOnly = isReadOnly();
  const get = (label: string) => d.status.find((s) => s.label === label)!;
  const signals = [
    { label: readOnly ? "Read-only" : "Live", value: readOnly ? "changes off" : get("Environment").value.toLowerCase(), tone: (readOnly ? "warn" : "ok") as Tone, href: "/settings" },
    { label: "Instagram", value: "blocked", tone: "bad" as Tone, href: "/inbox" },
    { label: "Approvals", value: get("Approvals").value, tone: get("Approvals").tone, href: "/approvals" },
    { label: "Failed jobs", value: get("Failed (7d)").value, tone: get("Failed (7d)").tone, href: "/productions?status=FAILED" },
    { label: "Usage today", value: `${get("Images today").value} img · ${get("Spend today").value}`, tone: "mute" as Tone, href: "/settings", title: get("Budget left").value },
  ];
  const stage = (k: string) => d.pipeline.find((p) => p.key === k)?.count ?? 0;
  const activity = [["In review", stage("REVIEW"), "/approvals"], ["Approved, ready", stage("APPROVED"), "/approvals"], ["Published", stage("PUBLISHED"), "/analytics"], ["Queued / in progress", stage("RUNNING") + stage("QA") + stage("QUEUED"), "/productions"], ["Failed", stage("FAILED"), "/productions?status=FAILED"]] as const;
  const attention = d.attention.slice(0, 5);
  return (
    <>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div><h1 className="text-2xl font-extrabold tracking-tight">Studio</h1><p className="text-[13.5px] text-muted">What needs you, and who needs content.</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/create" className="rounded-xl bg-gradient-to-br from-blue to-[#4d5cf0] px-4 py-2 font-bold">⇪ Import</Link>
          <Link href="/create?mode=generate" className="rounded-xl border border-edge bg-panel2 px-4 py-2 font-bold">✦ Generate</Link>
        </div>
      </header>

      <nav aria-label="Signals" className="mb-6 flex flex-wrap gap-2">
        {signals.map((s) => <Link key={s.label} href={s.href} title={s.title} className="flex items-center gap-2 rounded-full border border-edge bg-panel/70 px-3.5 py-1.5 text-[13px] hover:border-blue2/50"><span className={`h-2 w-2 rounded-full ${dot[s.tone]}`} /><span className="text-muted">{s.label}</span><b className={`font-mono ${txt[s.tone]}`}>{s.value}</b></Link>)}
      </nav>

      <section aria-label="Creators" className="mb-8">
        <div className="mb-3 flex items-baseline justify-between"><h2 className="text-[12px] font-bold uppercase tracking-wider text-muted">Your creators · by priority</h2><Link href="/talent" className="text-[13px] text-blue2">Talent →</Link></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {d.creators.map((c) => (
            <Link key={c.code} href={`/talent/${c.code}`} className="group relative overflow-hidden rounded-2xl border border-edge bg-panel/70 transition hover:-translate-y-0.5 hover:border-blue2/60" style={{ boxShadow: `0 10px 30px -18px ${c.color}` }}>
              <CreatorPortrait code={c.code} portrait={portraits[c.code]} className="aspect-[3/4] w-full transition duration-300 group-hover:scale-[1.03]" />
              <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-2.5">
                <span className="flex items-center gap-1.5 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold backdrop-blur"><span className={`h-2 w-2 rounded-full ${c.active ? "bg-ok" : "bg-warn"}`} />{c.active ? "Active" : "In setup"}</span>
                <span className="rounded-lg bg-black/60 px-2 py-0.5 font-mono text-[13px] font-bold backdrop-blur" style={{ color: c.color }} title={`Priority · ${c.priority.reasons.join(" · ")}`}>P{c.priority.score}</span>
              </div>
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-3 pb-2.5 pt-10">
                <b className="block truncate text-[17px] leading-tight">{c.name.split(" ")[0]}</b>
                <div className="mt-1 flex items-center justify-between gap-2 text-[11.5px] text-ink/80">
                  <span title="Approved and ready to publish"><b className="font-mono text-ok">{c.approvedReady}</b> ready</span>
                  <span className="truncate" title="Last post">{c.lastContentAt ? `posted ${ago(c.lastContentAt)}` : "never posted"}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section aria-label="Needs attention" className="mb-8">
        <h2 className="mb-2 text-[12px] font-bold uppercase tracking-wider text-muted">Needs attention</h2>
        <ul className="grid gap-1.5">{attention.map((a, i) => (
          <li key={i}><Link href={a.href} className="flex items-center gap-3 rounded-xl border border-edge bg-panel/60 px-4 py-2.5 text-[14px] hover:border-blue2/50"><span className={`h-2 w-2 flex-none rounded-full ${dot[a.tone]}`} /><span className="min-w-0 flex-1">{a.text}</span><span className="text-faint">→</span></Link></li>
        ))}</ul>
      </section>

      <section aria-label="Approvals" className="mb-8">
        <div className="mb-2 flex items-baseline justify-between"><h2 className="text-[12px] font-bold uppercase tracking-wider text-muted">Approvals {d.approvals.length > 0 && <span className="text-warn">· {d.approvals.length}</span>}</h2>{d.approvals.length > 0 && <Link href="/approvals" className="text-[13px] text-blue2">Review all →</Link>}</div>
        {d.approvals.length === 0 ? <p className="rounded-xl border border-dashed border-edge p-6 text-center text-muted">Nothing waiting. <Link href="/create" className="text-blue2">Import an image →</Link></p> : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-6">{d.approvals.slice(0, 6).map((a) => (
            <Link key={a.approvalId} href={`/approvals?id=${a.approvalId}`} className="group block overflow-hidden rounded-2xl border border-edge">
              <div className="relative aspect-[4/5]" style={{ background: "linear-gradient(160deg,#1a2350,#0b1128)" }}>
                {a.asset?.storagePath ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/api/assets/${a.asset.id}/file`} alt={a.production.code} className="h-full w-full object-cover transition group-hover:scale-[1.02]" /> : <span className="grid h-full place-items-center text-[11px] text-muted">no image file</span>}
                {a.triad && <span className={`absolute bottom-2 left-2 rounded-md bg-black/65 px-1.5 py-0.5 font-mono text-[10.5px] ${a.triad.overall === "PASS" ? "text-ok" : a.triad.overall === "FAIL" ? "text-bad" : "text-warn"}`}>QA {a.triad.overall}</span>}
              </div>
              <div className="flex items-center gap-2 px-2.5 py-2 text-[12px]"><CreatorAvatar code={a.production.talent[0]} portrait={portraits[a.production.talent[0]]} size={24} /><b className="truncate">{ROSTER_BY_CODE[a.production.talent[0]].first}</b><span className="ml-auto flex-none text-muted">{a.ageHours}h</span></div>
            </Link>
          ))}</div>
        )}
      </section>

      <section aria-label="Production activity" className="mb-8">
        <h2 className="mb-2 text-[12px] font-bold uppercase tracking-wider text-muted">Production activity</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{activity.map(([label, n, href]) => <Link key={label} href={href} className={`rounded-xl border px-3 py-2.5 ${n ? (label === "Failed" ? "border-bad/40 bg-bad/10" : "border-edge bg-panel/70") : "border-edge opacity-60"}`}><div className="font-mono text-2xl font-bold">{n}</div><div className="text-[12px] text-muted">{label}</div></Link>)}</div>
      </section>

      <details className="rounded-2xl border border-edge p-3">
        <summary className="cursor-pointer font-bold text-muted">System status, agents and operations</summary>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <div className="grid content-start gap-0 text-[13px]">{d.system.map((s) => <div key={s.name} className="flex items-start justify-between gap-3 border-t border-edge py-1.5 first:border-0"><span className="min-w-0"><b>{s.name}</b><span className="block text-[11.5px] text-muted break-words">{s.detail}</span></span><span className={`flex-none font-mono text-[11.5px] font-semibold ${txt[s.tone]}`}>{s.state}</span></div>)}</div>
          <div className="grid content-start gap-3 text-[13px]">
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-edge bg-edge sm:grid-cols-3">{d.status.map((s) => <div key={s.label} className="bg-panel/95 px-2.5 py-1.5" title={s.title}><div className="text-[10px] font-bold uppercase tracking-wider text-faint">{s.label}</div><div className={`truncate font-mono text-[12px] ${txt[s.tone]}`}>{s.value}</div></div>)}</div>
            <div>{snaps.filter((x) => x.status !== "IDLE" && x.status !== "SCHEDULED").map((x) => <Link key={x.agent.code} href={`/agents/${x.agent.code}`} className="flex items-center justify-between gap-2 border-t border-edge py-1.5 first:border-0"><span className="truncate">{x.agent.name}</span><AgentStatusPill status={x.status} /></Link>)}<Link href="/agents" className="mt-1 block text-blue2">All agents →</Link></div>
          </div>
        </div>
        <div className="mt-4"><CommandCenterPanel cc={d.cc} readOnly={readOnly} /></div>
      </details>
    </>
  );
}
