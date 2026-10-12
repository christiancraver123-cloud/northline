import Link from "next/link";
import { getRepo } from "@/lib/db";
import { newestFirst } from "@/lib/db/order";
import { ROSTER } from "@/lib/talent/roster";
import { CONTENT_TYPES, PRODUCTION_STATUSES } from "@/lib/domain/types";
import { Card, DemoBadge, Empty, PageHeader, ProdLink, StatusPill, TalentChips } from "@/components/ui";

type SP = { q?: string; talent?: string; format?: string; status?: string; campaign?: string; created?: string; warn?: string; provider?: string; qa?: string; from?: string };
/** Conceptual pipeline stages from the dashboard map onto stored statuses / asset states. */
const STAGE: Record<string, (p: { status: string }, failed: boolean) => boolean> = { RUNNING: (p) => p.status === "GENERATING", QA: (p) => p.status === "RAW", FAILED: (_p, f) => f };

export default async function Productions({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const repo = await getRepo();
  const [all, campaigns, assets] = await Promise.all([repo.list("productions").then(newestFirst), repo.list("campaigns"), repo.list("assets")]);
  const cur = (pid: string) => assets.filter((x) => x.productionId === pid && x.current);
  const list = all.filter((p) => {
    const a = cur(p.id), failed = a.some((x) => x.status === "FAILED");
    return (!sp.q || `${p.code} ${p.concept}`.toLowerCase().includes(sp.q.toLowerCase())) && (!sp.talent || p.talent.includes(sp.talent as never)) &&
      (!sp.format || p.contentType === sp.format) && (!sp.status || (STAGE[sp.status] ? STAGE[sp.status](p, failed) : p.status === sp.status)) && (!sp.campaign || p.campaignId === sp.campaign) &&
      (!sp.provider || a.some((x) => x.provider === sp.provider)) && (!sp.qa || a.some((x) => x.qaStatus === sp.qa)) && (!sp.from || p.createdAt.slice(0, 10) >= sp.from);
  });
  const providers = [...new Set(assets.map((a) => a.provider))].sort();
  return (
    <>
      <PageHeader title="Productions" sub={`${list.length} of ${all.length}`} />
      {sp.created && <div className="mb-4 rounded-xl border border-ok/30 bg-ok/10 p-3 text-ok">Created {sp.created} production(s). Review them in Approvals.</div>}
      {sp.warn && <div role="alert" className="mb-4 rounded-xl border border-warn/40 bg-warn/10 p-3 text-warn">Some steps need attention: {sp.warn}</div>}
      <form className="mb-4 grid gap-2 sm:grid-cols-4 lg:grid-cols-8">
        <input name="q" defaultValue={sp.q} placeholder="Search code or concept" aria-label="Search" />
        <select name="talent" defaultValue={sp.talent ?? ""} aria-label="Creator"><option value="">All creators</option>{ROSTER.map((t) => <option key={t.code} value={t.code}>{t.first}</option>)}</select>
        <select name="format" defaultValue={sp.format ?? ""} aria-label="Format"><option value="">All formats</option>{CONTENT_TYPES.map((c) => <option key={c}>{c}</option>)}</select>
        <select name="status" defaultValue={sp.status ?? ""} aria-label="Status"><option value="">All statuses</option>{PRODUCTION_STATUSES.map((c) => <option key={c}>{c}</option>)}<option value="RUNNING">RUNNING (generating)</option><option value="QA">QA (raw)</option><option value="FAILED">FAILED (has failed image)</option></select>
        <select name="provider" defaultValue={sp.provider ?? ""} aria-label="Provider"><option value="">All providers</option>{providers.map((x) => <option key={x}>{x}</option>)}</select>
        <select name="qa" defaultValue={sp.qa ?? ""} aria-label="QA state"><option value="">Any QA state</option>{["PASS", "REVIEW", "HARD_FAIL", "MANUAL_REVIEW_REQUIRED", "QA_PENDING"].map((x) => <option key={x}>{x}</option>)}</select>
        <input type="date" name="from" defaultValue={sp.from} aria-label="Created from" />
        <select name="campaign" defaultValue={sp.campaign ?? ""} aria-label="Campaign"><option value="">All campaigns</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <button className="rounded-xl border border-edge bg-panel2 px-3 py-2 font-bold">Filter</button>
      </form>
      {list.length === 0 ? <Empty>No productions match. <Link className="text-blue2" href="/create">Create one →</Link></Empty> : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead className="text-[11px] uppercase text-faint"><tr><th className="pb-2">ID</th><th>Creator</th><th>Concept</th><th>Format</th><th>Assets</th><th>Status</th><th>Created</th></tr></thead>
            <tbody>{list.map((p) => {
              const a = assets.filter((x) => x.productionId === p.id);
              return <tr key={p.id} className="border-t border-edge"><td className="py-2"><ProdLink p={p} /> <DemoBadge origin={p.origin} /></td><td><TalentChips codes={p.talent} /></td><td className="max-w-[260px] truncate">{p.concept}</td><td className="text-muted">{p.contentType}</td>
                <td className="font-mono text-muted">{a.filter((x) => x.status !== "PENDING" && x.status !== "FAILED").length}/{a.length}{a.some((x) => x.status === "FAILED") && <span className="text-bad"> ✗</span>}</td><td><StatusPill status={p.status} /></td><td className="font-mono text-muted">{p.createdAt.slice(0, 10)}</td></tr>;
            })}</tbody>
          </table>
        </Card>
      )}
    </>
  );
}
