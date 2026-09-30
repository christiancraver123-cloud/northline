import Link from "next/link";
import { getRepo } from "@/lib/db";
import { ROSTER } from "@/lib/talent/roster";
import { APPROVAL_STATES, ASSET_STATUSES, QA_STATUSES } from "@/lib/domain/types";
import { AssetTile, Card, Empty, PageHeader, Pill, ProdLink, QaPill } from "@/components/ui";

type SP = { talent?: string; production?: string; status?: string; kind?: string; qa?: string; approval?: string; provider?: string; from?: string; to?: string; all?: string };
export default async function Assets({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const repo = await getRepo();
  const [all, prods] = await Promise.all([repo.list("assets"), repo.list("productions")]);
  const byId = Object.fromEntries(prods.map((p) => [p.id, p]));
  const providers = [...new Set(all.map((a) => a.provider))];
  const list = all.filter((a) =>
    (sp.all === "1" || a.current) && (!sp.talent || a.talent.includes(sp.talent as never)) && (!sp.production || a.productionId === sp.production) && (!sp.status || a.status === sp.status) &&
    (!sp.kind || a.kind === sp.kind) && (!sp.qa || a.qaStatus === sp.qa) && (!sp.approval || a.approval === sp.approval) && (!sp.provider || a.provider === sp.provider) &&
    (!sp.from || a.createdAt.slice(0, 10) >= sp.from) && (!sp.to || a.createdAt.slice(0, 10) <= sp.to));
  list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const approved = all.filter((a) => a.approval === "APPROVED").length;
  return (
    <>
      <PageHeader title="Assets" sub={`${list.length} shown · ${approved} approved (only approved assets are eligible for Calendar/Launch). Canonical references live on each Talent page, never here.`} />
      <form className="mb-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <select name="talent" defaultValue={sp.talent ?? ""} aria-label="Creator"><option value="">All creators</option>{ROSTER.map((t) => <option key={t.code} value={t.code}>{t.first}</option>)}</select>
        <select name="production" defaultValue={sp.production ?? ""} aria-label="Production"><option value="">All productions</option>{prods.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}</select>
        <select name="kind" defaultValue={sp.kind ?? ""} aria-label="Asset type"><option value="">All types</option><option>IMG</option><option>REEL</option><option>STORY</option></select>
        <select name="status" defaultValue={sp.status ?? ""} aria-label="Status"><option value="">All statuses</option>{ASSET_STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
        <select name="qa" defaultValue={sp.qa ?? ""} aria-label="QA status"><option value="">All QA states</option>{QA_STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
        <select name="approval" defaultValue={sp.approval ?? ""} aria-label="Approval"><option value="">All approval states</option>{APPROVAL_STATES.map((s) => <option key={s}>{s}</option>)}</select>
        <select name="provider" defaultValue={sp.provider ?? ""} aria-label="Provider"><option value="">All providers</option>{providers.map((s) => <option key={s}>{s}</option>)}</select>
        <label className="text-[12px] text-muted">From<input type="date" name="from" defaultValue={sp.from} /></label>
        <label className="text-[12px] text-muted">To<input type="date" name="to" defaultValue={sp.to} /></label>
        <label className="flex items-center gap-2 text-[12px] text-muted"><input type="checkbox" name="all" value="1" defaultChecked={sp.all === "1"} className="!w-auto" />Include superseded attempts</label>
        <button className="rounded-xl border border-edge bg-panel2 px-3 py-2 font-bold">Filter</button>
      </form>
      {list.length === 0 ? <Empty>No assets match. <Link className="text-blue2" href="/create">Create a production →</Link></Empty> : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">{list.map((a) => (
          <Link key={a.id} href={`/assets/${a.id}`} className="block">
            <AssetTile asset={a} />
            <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px]"><span className="font-mono text-faint">{byId[a.productionId]?.code} {a.kind}-{String(a.seq).padStart(2, "0")}{a.attemptNo > 1 ? ` · A${a.attemptNo}` : ""}</span><QaPill status={a.qaStatus} />{!a.current && <Pill>superseded</Pill>}</div>
          </Link>
        ))}</div>
      )}
    </>
  );
}
