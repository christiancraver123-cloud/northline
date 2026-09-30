import { getRepo } from "@/lib/db";
import { approvalBlockers } from "@/lib/orchestrator/approvals";
import { decideAction } from "../actions";
import { AssetTile, Btn, Card, DemoBadge, Empty, PageHeader, ProdLink, StatusPill, TalentChips } from "@/components/ui";
import Link from "next/link";

export default async function Approvals({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const repo = await getRepo();
  const pending = await repo.list("approvals", { state: "PENDING" });
  const items = await Promise.all(pending.map(async (a) => {
    const p = await repo.get("productions", a.productionId);
    if (!p) return null;
    return { a, p, assets: (await repo.list("assets", { productionId: p.id })).sort((x, y) => x.seq - y.seq), captions: await repo.list("captions", { productionId: p.id }), blockers: await approvalBlockers(repo, p.id) };
  }));
  const err = (await searchParams).error;
  const decided = (await repo.list("approvals")).filter((a) => a.state !== "PENDING").slice(0, 8);
  return (
    <>
      <PageHeader title="Approvals" sub="Human approval is mandatory. Approving never publishes — it only unlocks scheduling." />
      {err && <div role="alert" className="mb-4 rounded-xl border border-bad/40 bg-bad/10 p-3 text-bad">{err}</div>}
      {pending.length === 0 ? <Empty>Nothing to review. <Link className="text-blue2" href="/create">Create something →</Link></Empty> : (
        <div className="grid gap-4">{items.filter(Boolean).map((it) => {
          const { a, p, assets, captions, blockers } = it!;
          return (
            <Card key={a.id}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><span className="flex items-center gap-3"><ProdLink p={p} /><TalentChips codes={p.talent} /><span className="text-muted">{p.contentType} · {p.concept}</span><DemoBadge origin={p.origin} /></span><StatusPill status={p.status} /></div>
              <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-8">{assets.map((x) => <AssetTile key={x.id} asset={x} />)}</div>
              {captions.map((c) => <p key={c.id} className="mb-3 rounded-lg border border-edge p-2 text-[13px]">“{c.text}”</p>)}
              {p.qaNotes.length > 0 && <p className="mb-2 text-warn">QA: {p.qaNotes.join("; ")}</p>}
              {blockers.length > 0 && <p className="mb-2 text-warn">Blocked: {blockers.join("; ")}. <Link href="/launch" className="text-blue2">Launch →</Link></p>}
              <form action={decideAction} className="flex flex-wrap items-center gap-2"><input type="hidden" name="approvalId" value={a.id} />
                <input name="notes" placeholder="Notes / revision reason" aria-label="Notes" className="min-w-48 flex-1" />
                <Btn primary name="decision" value="APPROVED" disabled={blockers.length > 0}>Approve</Btn>
                <Btn name="decision" value="REVISION_REQUESTED">Request revision</Btn>
                <Btn name="decision" value="REJECTED">Reject</Btn>
              </form>
            </Card>
          );
        })}</div>
      )}
      {decided.length > 0 && <Card className="mt-5"><h2 className="mb-2 font-bold">Recent decisions</h2>{decided.map((d) => <div key={d.id} className="flex justify-between border-t border-edge py-1.5 first:border-0"><span className="text-muted">{d.decidedBy} · {d.decidedAt?.slice(0, 16).replace("T", " ")}{d.notes ? ` — ${d.notes}` : ""}</span><StatusPill status={d.state} /></div>)}</Card>}
    </>
  );
}
