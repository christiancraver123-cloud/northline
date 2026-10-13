import Link from "next/link";
import { getRepo, storeDriver } from "@/lib/db";
import { snapshots } from "@/lib/agents/ops/service";
import { loadDashboard, type Tone } from "@/lib/ops/dashboard";
import { CommandCenterPanel } from "@/components/command-center";
import { isReadOnly } from "@/lib/runtime/mode";
import { ROSTER_BY_CODE } from "@/lib/talent/roster";
import { AgentStatusPill, SectionHead, ago } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { CreatorAvatar, CreatorPortrait } from "@/components/cc";
import { loadPortraits } from "@/lib/talent/portraits-server";
import { missedSlots, nightSteps, tonightSlots } from "@/lib/ops/tonight";
import { CopyButton } from "@/components/CopyButton";
import { markPostedAction, rescheduleSlotAction } from "./actions";

const dot: Record<Tone, string> = { ok: "bg-ok", warn: "bg-warn", bad: "bg-bad", info: "bg-blue2", mute: "bg-faint" };
const txt: Record<Tone, string> = { ok: "text-ok", warn: "text-warn", bad: "text-bad", info: "text-blue2", mute: "text-muted" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const repo = await getRepo();
  const [d, snaps, portraits, cal, prods, captions, assets] = await Promise.all([loadDashboard(repo), snapshots(repo), loadPortraits(repo), repo.list("calendarEntries"), repo.list("productions"), repo.list("captions"), repo.list("assets")]);
  const prodBy = new Map(prods.map((p) => [p.id, p]));
  const now = new Date();
  const slotCard = (e: (typeof cal)[number]) => { const p = prodBy.get(e.productionId); const img = assets.find((a) => a.productionId === e.productionId && a.current && a.kind === "IMG" && a.storagePath); return p ? { e, p, img, caption: captions.find((c) => c.productionId === p.id)?.text ?? "", steps: nightSteps(p, !!img) } : null; };
  const tonight = tonightSlots(cal, now).map(slotCard).filter((x) => x !== null);
  const missed = missedSlots(cal, now).map(slotCard).filter((x) => x !== null);
  const readOnly = isReadOnly();
  const get = (label: string) => d.status.find((s) => s.label === label)!;
  const signals = [
    { label: readOnly ? "Read-only" : "Running", value: readOnly ? "changes off" : storeDriver() === "file" ? "on this Mac" : get("Environment").value.toLowerCase(), tone: (readOnly ? "warn" : "ok") as Tone, href: "/settings" },
    { label: "Instagram", value: "blocked", tone: "bad" as Tone, href: "/inbox" },
    { label: "Approvals", value: get("Approvals").value, tone: get("Approvals").tone, href: "/approvals" },
    { label: "Failed jobs", value: get("Failed (7d)").value, tone: get("Failed (7d)").tone, href: "/productions?status=FAILED" },
    { label: "Usage today", value: `${get("Images today").value} img · ${get("Spend today").value}`, tone: "mute" as Tone, href: "/settings", title: get("Budget left").value },
  ];
  const stage = (k: string) => d.pipeline.find((p) => p.key === k)?.count ?? 0;
  const activity = [["In review", stage("REVIEW"), "/approvals"], ["Approved, ready", stage("APPROVED"), "/approvals"], ["Published", stage("PUBLISHED"), "/analytics"], ["Queued / in progress", stage("RUNNING") + stage("QA") + stage("QUEUED"), "/productions"], ["Failed", stage("FAILED"), "/productions?status=FAILED"]] as const;
  const attention = d.attention.slice(0, 5);
  const nyNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const hour = nyNow.getHours();
  const greeting = hour < 5 ? "Working late." : hour < 12 ? "Good morning." : hour < 18 ? "Good afternoon." : "Good evening.";
  const dateLine = now.toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric" });
  const pendingN = d.approvals.length;
  const summary = [pendingN ? `${pendingN} ${pendingN === 1 ? "image is" : "images are"} waiting for your review` : "Approvals are clear", tonight.length ? `${tonight.length} ${tonight.length === 1 ? "post" : "posts"} planned for tonight` : "nothing is scheduled tonight"].join(", and ") + ".";
  return (
    <>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <p className="text-[13px] text-muted">{dateLine}</p>
          <h1 className="display mt-1 text-[40px] leading-[1.02] sm:text-[52px]">{greeting}</h1>
          <p className="mt-2.5 max-w-[60ch] text-[15px] text-muted">{summary}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/create?mode=generate" className="inline-flex items-center gap-2 rounded-xl border border-edge bg-panel2 px-4 py-2.5 text-[13.5px] font-semibold hover:border-[#4a414c]"><Icon name="spark" size={15} />Generate</Link>
          <Link href="/create" className="inline-flex items-center gap-2 rounded-xl bg-blue2 px-4 py-2.5 text-[13.5px] font-semibold text-[#1a1410] shadow-[0_1px_0_rgba(255,255,255,.35)_inset,0_8px_20px_-10px_rgba(226,200,150,.6)] hover:bg-[#ecd6ab]"><Icon name="upload" size={15} />Import images</Link>
        </div>
      </header>

      <nav aria-label="Signals" className="mb-9 flex flex-wrap items-center gap-x-1 gap-y-2 rounded-2xl border border-edge/70 bg-panel/50 p-1.5">
        {signals.map((s) => <Link key={s.label} href={s.href} title={s.title} className="flex items-center gap-2 rounded-xl px-3 py-1.5 text-[13px] hover:bg-white/[0.04]"><span className={`h-1.5 w-1.5 rounded-full ${dot[s.tone]}`} /><span className="text-muted">{s.label}</span><span className={`font-semibold ${txt[s.tone]}`}>{s.value}</span></Link>)}
      </nav>

      <section aria-label="Creators" className="mb-10">
        <SectionHead title="Your creators" action={<Link href="/talent" className="text-[13px] text-muted hover:text-ink">Ordered by who needs content most</Link>} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {d.creators.map((c, i) => (
            <Link key={c.code} href={`/talent/${c.code}`} className="group relative block overflow-hidden rounded-2xl bg-sheet ring-1 ring-edge/70 transition-[box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:ring-[color:var(--c)]" style={{ ["--c" as string]: c.color }}>
              <CreatorPortrait code={c.code} portrait={portraits[c.code]} className="aspect-[3/4] w-full transition duration-500 group-hover:scale-[1.035]" />
              <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-2.5">
                <span className="flex items-center gap-1.5 rounded-full bg-black/45 px-2 py-0.5 text-[11px] font-medium text-ink/90 backdrop-blur-md"><span className={`h-1.5 w-1.5 rounded-full ${c.active ? "bg-ok" : "bg-warn"}`} />{c.active ? "Active" : "In setup"}</span>
                {i === 0 && <span className="rounded-full bg-black/45 px-2 py-0.5 text-[11px] font-medium text-blue2 backdrop-blur-md" title={c.priority.reasons.join("; ")}>Next up</span>}
              </div>
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-3.5 pb-3 pt-14">
                <div className="mb-1.5 h-px w-6" style={{ background: c.color }} />
                <b className="display block truncate text-[22px] font-semibold leading-none">{c.name.split(" ")[0]}</b>
                <div className="mt-1.5 flex items-center justify-between gap-2 text-[11.5px] text-ink/75">
                  <span title="Approved and ready to post"><b className="font-semibold text-ink">{c.approvedReady}</b> ready</span>
                  <span className="truncate" title={`Priority ${c.priority.score}: ${c.priority.reasons.join("; ")}`}>{c.lastContentAt ? `posted ${ago(c.lastContentAt)}` : "not posted yet"}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-x-8 gap-y-10 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid min-w-0 content-start gap-10">
      <section aria-label="Tonight">
        <SectionHead title="Tonight" count={tonight.length} action={missed.length > 0 ? <span className="text-[13px] text-bad">{missed.length} missed</span> : <Link href="/calendar" className="text-[13px] text-muted hover:text-ink">Calendar</Link>} />
        {sp.ok && <div role="status" className="mb-2 rounded-xl border border-ok/40 bg-ok/10 p-2.5 text-[13px] text-ok">{sp.ok}</div>}
        {sp.error && <div role="alert" className="mb-2 rounded-xl border border-bad/40 bg-bad/10 p-2.5 text-[13px] text-bad">{sp.error}</div>}
        {tonight.length === 0 && missed.length === 0 ? <div className="flex items-center gap-4 rounded-2xl border border-dashed border-edge/80 px-5 py-5 text-[13.5px] text-muted"><Icon name="calendar" size={20} className="text-faint" /><span>Nothing is scheduled for tonight. Approving an image puts it on the calendar.</span></div> : (
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="grid content-start gap-3">{tonight.map(({ e, p, img, caption, steps }) => (
              <div key={e.id} className="flex gap-3 rounded-2xl border border-edge bg-panel/70 p-3">
                <div className="h-28 w-[5.6rem] flex-none overflow-hidden rounded-xl border border-edge" style={{ background: ROSTER_BY_CODE[e.talent].color }}>{img && /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/api/assets/${img.id}/file`} alt={p.code} className="h-full w-full object-cover" />}</div>
                <div className="min-w-0 flex-1 text-[13px]">
                  <div className="flex flex-wrap items-center gap-2"><CreatorAvatar code={e.talent} portrait={portraits[e.talent]} size={24} /><b>{ROSTER_BY_CODE[e.talent].first}</b><span className="font-mono text-[12px] text-muted">{e.time} · {p.code}</span></div>
                  <p className="mt-1 truncate text-muted">{p.concept}</p>
                  {caption && <div className="mt-1 flex items-center gap-2"><span className="min-w-0 truncate">“{caption}”</span><CopyButton text={caption} label="Copy caption" /></div>}
                  <ol className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px]">{steps.map((s, i) => <li key={s.label} className={s.done ? "text-ok" : "text-muted"}>{s.done ? "✓" : `${i + 1}.`} {s.label}</li>)}</ol>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {steps[1].done && !steps[2].done && <form action={markPostedAction} className="flex items-center gap-2"><input type="hidden" name="entryId" value={e.id} /><label className="flex items-center gap-1.5 text-[12px]"><input type="checkbox" name="confirm" value="yes" required className="size-4 !w-auto" />I posted it</label><button className="rounded-lg bg-ok/80 px-3 py-1 text-[12px] font-bold text-[#141016]">Record</button></form>}
                    <form action={rescheduleSlotAction}><input type="hidden" name="entryId" value={e.id} /><button className="rounded-lg border border-edge px-3 py-1 text-[12px]">Not tonight → next open slot</button></form>
                    {!steps[1].done && <Link href="/approvals" className="text-[12px] text-blue2">Approvals</Link>}
                    {steps[1].done && <Link href={`/post/${p.id}`} className="rounded-lg bg-ok/85 px-3 py-1 text-[12px] font-bold text-[#141016]">Post kit</Link>}
                  </div>
                </div>
              </div>))}
              {tonight.length === 0 && <p className="text-[13px] text-muted">Nothing for tonight.</p>}
            </div>
            <div><h3 className="mb-2 h-label">Missed slots · {missed.length}</h3>
              {missed.length === 0 ? <p className="text-[12.5px] text-muted">Nothing missed.</p> : <ul className="grid gap-2">{missed.map(({ e, p }) => (
                <li key={e.id} className="rounded-xl border border-edge p-2.5 text-[12.5px]"><div className="flex items-center gap-2"><CreatorAvatar code={e.talent} portrait={portraits[e.talent]} size={20} /><span className="font-mono text-[11px] text-muted">{p.code} · was {e.date} {e.time}</span></div><p className="my-1 truncate">{p.concept}</p>
                  <form action={rescheduleSlotAction}><input type="hidden" name="entryId" value={e.id} /><button className="rounded-lg border border-edge px-2.5 py-1 text-[11.5px]">Move to next open slot</button></form></li>))}</ul>}
            </div>
          </div>
        )}
      </section>

      <section aria-label="Approvals">
        <SectionHead title="Waiting for approval" count={d.approvals.length} action={d.approvals.length > 0 && <Link href="/approvals" className="text-[13px] font-medium text-blue2 hover:text-ink">Review all</Link>} />
        {d.approvals.length === 0 ? <p className="rounded-xl border border-dashed border-edge p-6 text-center text-muted">Nothing waiting. <Link href="/create" className="text-blue2">Import an image</Link></p> : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{d.approvals.slice(0, 8).map((a) => (
            <Link key={a.approvalId} href={`/approvals?id=${a.approvalId}`} className="group block overflow-hidden rounded-2xl border border-edge/70 bg-panel/50 transition-colors hover:border-[#4a414c]">
              <div className="relative aspect-[4/5]" style={{ background: "linear-gradient(160deg,#2a2228,#0c0a0d)" }}>
                {a.asset?.storagePath ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/api/assets/${a.asset.id}/file`} alt={a.production.code} className="h-full w-full object-cover transition group-hover:scale-[1.02]" /> : <span className="grid h-full place-items-center text-[11px] text-muted">no image file</span>}
                {a.triad && <span className={`absolute bottom-2 left-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium backdrop-blur-md ${a.triad.overall === "PASS" ? "text-ok" : a.triad.overall === "FAIL" ? "text-bad" : "text-warn"}`}>QA {a.triad.overall.toLowerCase()}</span>}
              </div>
              <div className="flex items-center gap-2 px-2.5 py-2 text-[12px]"><CreatorAvatar code={a.production.talent[0]} portrait={portraits[a.production.talent[0]]} size={24} /><b className="truncate">{ROSTER_BY_CODE[a.production.talent[0]].first}</b><span className="ml-auto flex-none text-faint">{a.ageHours < 1 ? "new" : `${a.ageHours}h`}</span></div>
            </Link>
          ))}</div>
        )}
      </section>

      </div>
      <aside className="grid content-start gap-10">
      <section aria-label="Needs attention">
        <SectionHead title="Needs attention" count={attention.length} />
        {attention.length === 0 ? <p className="text-[13px] text-muted">Nothing needs you right now.</p> : <ul className="overflow-hidden rounded-2xl border border-edge/70 bg-panel/50">{attention.map((a, i) => (
          <li key={i} className="border-t border-edge/60 first:border-0"><Link href={a.href} className="group flex items-start gap-3 px-4 py-3 text-[13.5px] hover:bg-white/[0.03]"><span className={`mt-[7px] h-1.5 w-1.5 flex-none rounded-full ${dot[a.tone]}`} /><span className="min-w-0 flex-1">{a.text}</span><Icon name="chevron" size={14} className="mt-[3px] text-faint group-hover:text-ink" /></Link></li>
        ))}</ul>}
      </section>
      <section aria-label="Production activity">
        <SectionHead title="Pipeline" action={<Link href="/productions" className="text-[13px] text-muted hover:text-ink">Productions</Link>} />
        <div className="grid grid-cols-2 gap-2">{activity.map(([label, n, href]) => <Link key={label} href={href} className={`rounded-xl border px-3.5 py-3 transition-colors hover:border-[#4a414c] ${label === "Failed" && n ? "border-bad/35 bg-bad/[0.06]" : "border-edge/70 bg-panel/50"} ${n ? "" : "opacity-60"}`}><div className={`num text-[22px] font-semibold leading-tight ${label === "Failed" && n ? "text-bad" : ""}`}>{n}</div><div className="mt-0.5 text-[12px] text-muted">{label}</div></Link>)}</div>
      </section>
      </aside>
      </div>

      <details className="mt-10 rounded-2xl border border-edge/70 bg-panel/30 px-4 py-3">
        <summary className="flex cursor-pointer items-center font-semibold text-muted">System status, agents and operations</summary>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <div className="grid content-start gap-0 text-[13px]">{d.system.map((s) => <div key={s.name} className="flex items-start justify-between gap-3 border-t border-edge py-1.5 first:border-0"><span className="min-w-0"><b>{s.name}</b><span className="block text-[11.5px] text-muted break-words">{s.detail}</span></span><span className={`flex-none font-mono text-[11.5px] font-semibold ${txt[s.tone]}`}>{s.state}</span></div>)}</div>
          <div className="grid content-start gap-3 text-[13px]">
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-edge bg-edge sm:grid-cols-3">{d.status.map((s) => <div key={s.label} className="bg-panel/95 px-2.5 py-1.5" title={s.title}><div className="text-[11.5px] font-semibold text-faint">{s.label}</div><div className={`truncate font-mono text-[12px] ${txt[s.tone]}`}>{s.value}</div></div>)}</div>
            <div>{snaps.filter((x) => x.status !== "IDLE" && x.status !== "SCHEDULED").map((x) => <Link key={x.agent.code} href={`/agents/${x.agent.code}`} className="flex items-center justify-between gap-2 border-t border-edge py-1.5 first:border-0"><span className="truncate">{x.agent.name}</span><AgentStatusPill status={x.status} /></Link>)}<Link href="/agents" className="mt-1 block text-blue2">All agents</Link></div>
          </div>
        </div>
        <div className="mt-4"><CommandCenterPanel cc={d.cc} readOnly={readOnly} /></div>
      </details>
    </>
  );
}
