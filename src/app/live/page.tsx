import Link from "next/link";
import { getRepo } from "@/lib/db";
import { AreaChart, LiveClock } from "@/components/LiveBits";
import { CreatorAvatar } from "@/components/cc";
import { listIfMigrated } from "@/lib/publishing/service";
import { latestInsights } from "@/lib/ops/creators";
import { nyDay } from "@/lib/ops/tonight";
import { pickPortraits } from "@/lib/talent/portrait";
import { ROSTER } from "@/lib/talent/roster";

// Ops board (ported from the original Command Center): one dark screen, only real numbers. Mock/demo insights are excluded.
export const dynamic = "force-dynamic";

const Tile = ({ label, value, sub, dim }: { label: string; value: string; sub?: string; dim?: boolean }) => (
  <div className="min-w-0 rounded-xl border border-edge/70 bg-panel/50 px-4 py-3">
    <p className="text-[12.5px] text-muted">{label}</p>
    <p className={`num mt-0.5 text-[26px] font-semibold leading-tight ${dim ? "text-faint" : "text-ink"}`}>{value}</p>
    {sub && <p className="mt-0.5 truncate text-[12px] text-faint">{sub}</p>}
  </div>
);
const addDays = (day: string, n: number) => { const [y, m, d] = day.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n, 12)).toISOString().slice(0, 10); };

export default async function Live() {
  const repo = await getRepo();
  const [prods, cal, analytics, events, llm, launch, refs, assets] = await Promise.all([repo.list("productions"), repo.list("calendarEntries"), repo.list("analytics"), repo.list("agentEvents"), repo.list("llmCalls"), repo.list("launchStates"), repo.list("referenceAssets"), repo.list("assets")]);
  const pubs = (await listIfMigrated(repo, "publications")) ?? [];
  const portraits = pickPortraits(refs);
  const now = new Date(), today = nyDay(now), since28 = addDays(today, -27);
  const pubDay = new Map(pubs.filter((p) => p.publishedAt).map((p) => [p.id, nyDay(new Date(p.publishedAt!))]));
  const pubTalent = new Map(pubs.map((p) => [p.id, p.talent]));
  const real = latestInsights(analytics).filter((r) => r.source !== "mock" && r.source !== "demo");
  const in28 = real.filter((r) => (pubDay.get(r.publicationId!) ?? "") >= since28);
  const sum = (rows: typeof real, k: "views" | "follows" | "profileVisits") => rows.reduce((s, r) => s + (r[k] ?? 0), 0);
  const series = Array.from({ length: 14 }, (_, k) => addDays(today, k - 13)).map((day) => ({ day, value: sum(real.filter((r) => pubDay.get(r.publicationId!) === day), "views") }));
  const postedToday = new Set([...cal.filter((c) => c.state === "PUBLISHED" && c.date === today).map((c) => c.productionId), ...pubs.filter((p) => pubDay.get(p.id) === today).map((p) => p.productionId)]).size;
  const pipeline = prods.filter((p) => ["GENERATING", "RAW", "REVIEW", "APPROVED", "SCHEDULED"].includes(p.status)).length;
  const spend = llm.filter((c) => nyDay(new Date(c.startedAt)) >= since28).reduce((s, c) => s + (c.costUsd ?? 0), 0) + prods.filter((p) => nyDay(new Date(p.createdAt)) >= since28).reduce((s, p) => s + (p.costUsd ?? 0), 0);
  const roster = ROSTER.map((t) => {
    const l = launch.find((x) => x.talent === t.code), live = Boolean(l?.handle && l.aiDisclosure);
    const mine = real.filter((r) => pubTalent.get(r.publicationId!) === t.code);
    const next = cal.filter((c) => c.talent === t.code && c.state !== "PUBLISHED" && c.date >= today).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
    return { t, live, handle: l?.handle ?? "", posts: prods.filter((p) => p.talent[0] === t.code && p.status === "PUBLISHED").length, views: sum(mine, "views"), follows: sum(mine, "follows"), next };
  }).sort((a, b) => Number(b.live) - Number(a.live) || b.views - a.views);
  const feed = [...events].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 18);
  const wall = [
    ...refs.filter((r) => r.status === "ACTIVE").sort((a, b) => Number(b.referenceType === "MASTER_FACE") - Number(a.referenceType === "MASTER_FACE")).map((r) => ({ src: `/api/references/${r.id}/file`, label: `${r.talent} · ${r.referenceType.replace(/_/g, " ").toLowerCase()}` })),
    ...assets.filter((a) => a.storagePath && a.kind === "IMG" && a.status === "APPROVED").sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 14).map((a) => ({ src: `/api/assets/${a.id}/file`, label: `${a.talent[0]} · approved` })),
  ];
  const hms = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour12: false, timeZone: "America/New_York" });
  return (
    <div>
      <header className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div><div className="mb-1"><LiveClock /></div><h1 className="display text-[34px] leading-[1.05] sm:text-[42px]">Live</h1><p className="mt-2 text-[14.5px] text-muted">Real numbers only. Mock and demo data never show up here.</p></div>
        <Link href="/analytics" className="text-[13px] text-muted hover:text-ink">Open analytics</Link>
      </header>
      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <Tile label="Posted today" value={String(postedToday)} sub={`${pipeline} in the pipeline`} />
        <Tile label="Views · 28 days" value={sum(in28, "views").toLocaleString()} sub={`${in28.length} posts measured (real only)`} />
        <Tile label="Follows · 28 days" value={sum(in28, "follows").toLocaleString()} sub={`${sum(in28, "profileVisits").toLocaleString()} profile visits`} />
        <Tile label="Live accounts" value={`${roster.filter((r) => r.live).length}/${roster.length}`} sub="IG handle + AI disclosure" />
        <Tile label="AI spend · 28 days" value={`$${spend.toFixed(2)}`} sub="recorded costs only" />
        <Tile label="Revenue" value="—" sub="not connected yet" dim />
      </div>
      <div className="mb-4 grid gap-2 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0 rounded-2xl border border-edge/70 bg-panel/50 p-4"><AreaChart points={series} label="Views by publish day · 14 days (latest snapshot)" /></div>
        <div className="min-w-0 rounded-2xl border border-edge/70 bg-panel/50 p-4">
          <p className="mb-2 h-section">Event feed</p>
          <ul className="max-h-[210px] space-y-1 overflow-auto font-mono text-[10.5px]">{feed.map((l) => (
            <li key={l.id} className="flex min-w-0 gap-2 whitespace-nowrap"><span className="text-faint">{hms(l.createdAt)}</span><span className={l.level === "error" ? "text-bad" : l.level === "warn" ? "text-warn" : "text-muted"}>{l.kind}</span><span className="truncate text-faint" title={l.message}>{l.message}</span></li>))}
            {!feed.length && <li className="text-faint">No events yet.</li>}</ul>
        </div>
      </div>
      <div className="mb-4 rounded-2xl border border-edge/70 bg-panel/50 p-4">
        <p className="mb-3 h-section">Roster</p>
        <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left"><tbody>{roster.map((r) => (
          <tr key={r.t.code} className="border-b border-edge/60 last:border-0">
            <td className="w-12 py-2"><CreatorAvatar code={r.t.code} portrait={portraits[r.t.code]} size={36} /></td>
            <td className="py-2"><Link href={`/talent/${r.t.code}`} className="text-[13.5px] font-medium hover:underline">{r.t.name}</Link><p className="text-[12px] text-faint">{r.handle ? `@${r.handle}` : "no account yet"}</p></td>
            <td className="py-2 text-[12.5px]">{r.live ? <span className="inline-flex items-center gap-1.5 text-ok"><span className="h-1.5 w-1.5 rounded-full bg-ok" />Live</span> : <span className="inline-flex items-center gap-1.5 text-faint"><span className="h-1.5 w-1.5 rounded-full bg-faint" />In setup</span>}</td>
            <td className="py-2 num text-[12.5px] text-muted">{r.posts} posts</td>
            <td className="py-2 num text-[12.5px] text-muted">{r.views.toLocaleString()} views</td>
            <td className="py-2 num text-[12.5px] text-muted">{r.follows.toLocaleString()} follows</td>
            <td className="py-2 text-[12.5px] text-muted">{r.next ? `next ${r.next.date} ${r.next.time}` : "nothing scheduled"}</td>
          </tr>))}</tbody></table></div>
      </div>
      <div className="rounded-2xl border border-edge/70 bg-panel/50 p-4">
        <div className="mb-3 flex items-baseline justify-between"><p className="h-section">Face wall <span className="num ml-1 text-[12px] font-medium text-faint">{wall.length}</span></p><p className="text-[12px] text-faint">Canonical references and approved images. Drag any into ChatGPT.</p></div>
        {wall.length ? <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-9">{wall.map((w) => /* eslint-disable-next-line @next/next/no-img-element */ <img key={w.src} src={w.src} alt={w.label} title={w.label} loading="lazy" className="aspect-[3/4] w-full cursor-grab rounded-md border border-edge object-cover object-top" />)}</div>
          : <p className="text-[12.5px] text-muted">No canonical references uploaded yet.</p>}
      </div>
    </div>
  );
}
