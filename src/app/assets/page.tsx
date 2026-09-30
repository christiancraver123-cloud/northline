import { getRepo } from "@/lib/db";
import { ROSTER } from "@/lib/talent/roster";
import { ASSET_STATUSES, REFERENCE_SLOTS } from "@/lib/domain/types";
import { AssetTile, Card, Empty, PageHeader, Pill, ProdLink } from "@/components/ui";

type SP = { talent?: string; status?: string; kind?: string };
export default async function Assets({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const repo = await getRepo();
  const [all, prods, refs] = await Promise.all([repo.list("assets"), repo.list("productions"), repo.list("referenceAssets")]);
  const byId = Object.fromEntries(prods.map((p) => [p.id, p]));
  const list = all.filter((a) => (!sp.talent || a.talent.includes(sp.talent as never)) && (!sp.status || a.status === sp.status) && (!sp.kind || a.kind === sp.kind));
  return (
    <>
      <PageHeader title="Assets" sub="Generated assets. Canonical references are kept separate below and never auto-promoted." />
      <form className="mb-4 grid gap-2 sm:grid-cols-4">
        <select name="talent" defaultValue={sp.talent ?? ""} aria-label="Creator"><option value="">All creators</option>{ROSTER.map((t) => <option key={t.code} value={t.code}>{t.first}</option>)}</select>
        <select name="status" defaultValue={sp.status ?? ""} aria-label="Status"><option value="">All statuses</option>{ASSET_STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
        <select name="kind" defaultValue={sp.kind ?? ""} aria-label="Type"><option value="">All types</option><option>IMG</option><option>REEL</option><option>STORY</option></select>
        <button className="rounded-xl border border-edge bg-panel2 px-3 py-2 font-bold">Filter</button>
      </form>
      {list.length === 0 ? <Empty>No assets match.</Empty> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">{list.map((a) => <div key={a.id}><AssetTile asset={a} /><div className="mt-1 truncate font-mono text-[10px] text-faint" title={a.filename}>{byId[a.productionId] && <ProdLink p={byId[a.productionId]} />} {a.kind}-{String(a.seq).padStart(2, "0")}</div></div>)}</div>}
      <Card className="mt-6">
        <h2 className="mb-2 font-bold">Canonical reference assets <Pill tone="info">identity source</Pill></h2>
        {refs.length === 0 ? <p className="text-muted">No reference images uploaded yet. Slots: {REFERENCE_SLOTS.join(", ")}. Until uploaded, prompts rely on the written canonical identity only.</p> : refs.map((r) => <div key={r.id}>{r.talent} · {r.slot}</div>)}
      </Card>
    </>
  );
}
