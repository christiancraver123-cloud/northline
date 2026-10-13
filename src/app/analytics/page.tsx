import Link from "next/link";
import { getRepo } from "@/lib/db";
import { Avatar, Card, Empty, PageHeader, Pill, ago } from "@/components/ui";
import { pickPortraits } from "@/lib/talent/portrait";
import { listIfMigrated } from "@/lib/publishing/service";
import { engagementRate } from "@/lib/publishing/provider";
import { creatorOverviews, latestInsights } from "@/lib/ops/creators";
import { weightsFromEnv } from "@/lib/priority";
import { instagramStatus } from "@/lib/flags";
import { refreshInsightsAction } from "../actions";
import { isReadOnly } from "@/lib/runtime/mode";
import { ROSTER_BY_CODE } from "@/lib/talent/roster";
import type { AnalyticsRecord } from "@/lib/db/records";

const n = (x: number | null | undefined) => (x == null ? "—" : x.toLocaleString());
const pct = (x: number | null) => (x == null ? "—" : `${(x * 100).toFixed(1)}%`);
const er = (r: AnalyticsRecord) => engagementRate({ likes: r.likes ?? 0, comments: r.comments ?? 0, shares: r.shares ?? 0, saves: r.saves ?? 0, reach: r.reach ?? 0 });

export default async function Analytics({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const repo = await getRepo();
  const [analytics, productions, assets, calendar, jobs, launch, storylines, tasks, refs] = await Promise.all([repo.list("analytics"), repo.list("productions"), repo.list("assets"), repo.list("calendarEntries"), repo.list("providerJobs"), repo.list("launchStates"), repo.list("storylines"), repo.list("agentTasks"), repo.list("referenceAssets")]);
  const portraits = pickPortraits(refs); // canonical references only
  const assetById = new Map(assets.map((a) => [a.id, a]));
  const publications = await listIfMigrated(repo, "publications");
  const creators = creatorOverviews({ productions, assets, publications, analytics, calendar, jobs, launch, storylines, tasks }, new Date(), weightsFromEnv());
  const prod = new Map(productions.map((p) => [p.id, p]));
  const pubs = new Map((publications ?? []).map((p) => [p.id, p]));
  const posts = latestInsights(analytics).map((r) => ({ r, pub: pubs.get(r.publicationId!), p: prod.get(r.productionId), rate: er(r) })).filter((x) => x.pub).sort((a, b) => (b.pub!.publishedAt ?? "").localeCompare(a.pub!.publishedAt ?? ""));
  const ranked = posts.filter((x) => x.rate != null).sort((a, b) => b.rate! - a.rate!);
  const anyMock = posts.some((x) => x.r.source === "mock");
  const legacy = analytics.filter((r) => !r.publicationId);
  const next = [...creators].sort((a, b) => b.priority.score - a.priority.score).slice(0, 3);
  const byLocation = new Map<string, number[]>();
  for (const x of ranked) { const loc = x.p?.brief?.location; if (loc) byLocation.set(loc, [...(byLocation.get(loc) ?? []), x.rate!]); }
  const bestLoc = [...byLocation].map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length] as const).sort((a, b) => b[1] - a[1])[0];
  const ig = instagramStatus();

  const PostRow = ({ x }: { x: (typeof posts)[number] }) => (
    <tr className="border-t border-edge">
      <td className="whitespace-nowrap py-1.5 pr-4"><span className="flex items-center gap-2">{assetById.get(x.pub!.assetId)?.storagePath ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/api/assets/${x.pub!.assetId}/file`} alt="" loading="lazy" className="h-10 w-8 flex-none rounded-md object-cover" style={{ boxShadow: `0 0 0 2px ${ROSTER_BY_CODE[x.pub!.talent].color}` }} /> : null}<Avatar code={x.pub!.talent} portrait={portraits[x.pub!.talent]} size={26} /><b>{ROSTER_BY_CODE[x.pub!.talent].first}</b></span></td>
      <td className="max-w-[16rem] truncate"><Link href={`/productions/${x.r.productionId}`} className="text-blue2 hover:underline">{x.p?.code}</Link> <span className="text-muted">{x.p?.concept}</span></td>
      <td className="text-muted">{x.p?.contentType ?? "—"}</td><td className="max-w-[10rem] truncate text-muted">{x.p?.brief?.location ?? "—"}</td>
      <td className="text-right font-mono">{n(x.r.views)}</td><td className="text-right font-mono">{n(x.r.reach)}</td><td className="text-right font-mono">{n(x.r.saves)}</td><td className="text-right font-mono">{n(x.r.shares)}</td>
      <td className="text-right font-mono font-semibold">{pct(x.rate)}</td>
      <td className="text-right">{x.r.source === "mock" ? <Pill tone="warn">mock</Pill> : <Pill tone="ok">{x.r.source}</Pill>}</td>
    </tr>
  );
  const Head = () => <thead className="text-[12px] font-semibold text-faint"><tr><th className="text-left">Creator</th><th className="text-left">Post</th><th className="text-left">Type</th><th className="text-left">Location</th><th className="text-right">Views</th><th className="text-right">Reach</th><th className="text-right">Saves</th><th className="text-right">Shares</th><th className="text-right">Eng.</th><th /></tr></thead>;

  return (
    <>
      <PageHeader title="Analytics" sub="What is working, who is growing, who needs content, and what to make next." />
      {sp.error && <div role="alert" className="mb-4 rounded-xl border border-bad/40 bg-bad/10 p-3 text-bad">{sp.error}</div>}
      <div className="mb-5 rounded-xl border border-warn/40 bg-warn/10 p-3 text-[13px] text-warn"><b>{ig.label}.</b> {anyMock ? "Post numbers below come from the MOCK provider — they show how the page works, not real performance." : "No real Instagram data is connected."}{publications === null && " Migration 0009 is not applied, so no posts or insights can be stored yet."}</div>

      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <Card><h2 className="mb-2 font-bold">What is working?</h2>{ranked.length ? <><p className="text-[13px]">Best post: <b>{ranked[0].p?.code}</b> at {pct(ranked[0].rate)} engagement{ranked[0].r.source === "mock" ? " (mock)" : ""}.</p>{bestLoc && <p className="mt-1 text-[13px] text-muted">Strongest location so far: {bestLoc[0]} ({pct(bestLoc[1])}, {byLocation.get(bestLoc[0])!.length} post(s)).</p>}</> : <p className="text-[13px] text-muted">No published posts with insights yet.</p>}</Card>
        <Card><h2 className="mb-2 font-bold">Who needs content?</h2>{creators.filter((c) => c.active).sort((a, b) => (b.postingGapDays ?? 999) - (a.postingGapDays ?? 999)).slice(0, 3).map((c) => <p key={c.code} className="mb-1.5 flex items-center gap-2 text-[13px]"><Avatar code={c.code} portrait={portraits[c.code]} size={24} />{c.name.split(" ")[0]}: {c.postingGapDays == null ? "never posted" : `${c.postingGapDays}-day gap`} · {c.approvedReady} approved ready</p>)}{creators.every((c) => !c.active) && <p className="text-[13px] text-muted">No active creators.</p>}</Card>
        <Card><h2 className="mb-2 font-bold">What should we make next?</h2>{next.map((c) => <Link key={c.code} href={`/create?creator=${c.code}`} className="mb-1.5 flex items-center gap-2 text-[13px] hover:underline"><Avatar code={c.code} portrait={portraits[c.code]} size={24} /><span className="min-w-0"><b>{c.name.split(" ")[0]}</b> <span className="font-mono">{c.priority.score}</span> — {c.priority.reasons.slice(0, 2).join(", ") || "steady"} →</span></Link>)}</Card>
      </div>

      <Card className="mb-5 overflow-x-auto">
        <h2 className="mb-2 font-bold">Creator performance</h2>
        <table className="w-full min-w-[640px] text-[13px]"><thead className="text-[12px] font-semibold text-faint"><tr><th className="text-left">Creator</th><th className="text-right">Published</th><th className="text-right">Last post</th><th className="text-right">Gap</th><th className="text-right">Avg engagement</th><th className="text-right">Approved ready</th><th className="text-right">Priority</th></tr></thead>
          <tbody>{creators.map((c) => <tr key={c.code} className="border-t border-edge"><td className="whitespace-nowrap py-1.5"><Link href={`/talent/${c.code}`} className="inline-flex items-center gap-2.5 font-semibold hover:underline"><Avatar code={c.code} portrait={portraits[c.code]} size={34} />{c.name}</Link>{!c.active && <span className="ml-1.5 text-[11px] text-warn">setup</span>}</td><td className="text-right font-mono">{c.published}</td><td className="text-right font-mono">{c.lastContentAt ? ago(c.lastContentAt) : "—"}</td><td className="text-right font-mono">{c.postingGapDays == null ? "—" : `${c.postingGapDays}d`}</td><td className="text-right font-mono">{pct(c.engagementRate)}{c.insightsAreMock ? " ·m" : ""}</td><td className="text-right font-mono">{c.approvedReady}</td><td className="text-right font-mono font-bold">{c.priority.score}</td></tr>)}</tbody></table>
        <p className="mt-2 text-[11.5px] text-faint">Follower growth is not tracked yet (needs live Instagram insights). ·m = mock data.</p>
      </Card>

      {posts.length === 0 ? <Empty>No published posts yet. Approve an image, then publish it (mock) from Approvals.</Empty> : (
        <>
          {ranked.length >= 2 && (
            <div className="mb-5 grid gap-4 lg:grid-cols-2">
              <Card className="overflow-x-auto"><h2 className="mb-2 font-bold">Top content</h2><table className="w-full min-w-[640px] text-[12.5px]"><Head /><tbody>{ranked.slice(0, 3).map((x) => <PostRow key={x.r.id} x={x} />)}</tbody></table></Card>
              <Card className="overflow-x-auto"><h2 className="mb-2 font-bold">Bottom content</h2><table className="w-full min-w-[640px] text-[12.5px]"><Head /><tbody>{ranked.slice(-3).reverse().map((x) => <PostRow key={x.r.id} x={x} />)}</tbody></table></Card>
            </div>
          )}
          <Card className="overflow-x-auto">
            <h2 className="mb-2 font-bold">Latest posts</h2>
            <table className="w-full min-w-[720px] text-[12.5px]"><Head /><tbody>{posts.map((x) => <PostRow key={x.r.id} x={x} />)}</tbody></table>
            {!isReadOnly() && <div className="mt-3 flex flex-wrap gap-2">{posts.slice(0, 6).map((x) => <form key={x.r.id} action={refreshInsightsAction}><input type="hidden" name="publicationId" value={x.pub!.id} /><input type="hidden" name="back" value="/analytics" /><button className="rounded-lg border border-edge px-2.5 py-1 text-[12px]">Refresh {x.p?.code}</button></form>)}</div>}
          </Card>
        </>
      )}
      {legacy.length > 0 && <Card className="mt-5 overflow-x-auto"><h2 className="mb-2 font-bold">Other analytics records</h2><table className="w-full text-[12.5px]"><thead className="text-[12px] font-semibold text-faint"><tr><th className="text-left">Source</th><th>Views</th><th>Reach</th><th>Likes</th><th>Comments</th><th>Shares</th><th>Saves</th></tr></thead><tbody>{legacy.map((r) => <tr key={r.id} className="border-t border-edge"><td><Pill tone={r.source === "imported" ? "ok" : "warn"}>{r.source}</Pill></td><td>{n(r.views)}</td><td>{n(r.reach)}</td><td>{n(r.likes)}</td><td>{n(r.comments)}</td><td>{n(r.shares)}</td><td>{n(r.saves)}</td></tr>)}</tbody></table></Card>}
    </>
  );
}
