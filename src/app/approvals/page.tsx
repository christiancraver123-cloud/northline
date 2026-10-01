import { getRepo } from "@/lib/db";
import { approvalBlockers } from "@/lib/orchestrator/approvals";
import { decideAction } from "../actions";
import { REJECTION_REASONS } from "@/lib/feedback/reasons";
import { AssetTile, Btn, Card, DemoBadge, Empty, PageHeader, ProdLink, QaPill, StatusPill, TalentChips } from "@/components/ui";
import Link from "next/link";

export default async function Approvals({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const repo = await getRepo();
  const pending = await repo.list("approvals", { state: "PENDING" });
  const items = await Promise.all(pending.map(async (a) => {
    const p = await repo.get("productions", a.productionId);
    if (!p) return null;
    return { a, p, assets: (await repo.list("assets", { productionId: p.id })).filter((x) => x.current).sort((x, y) => x.seq - y.seq), qa: await repo.list("qaResults", { productionId: p.id }), captions: await repo.list("captions", { productionId: p.id }), blockers: await approvalBlockers(repo, p.id) };
  }));
  const err = (await searchParams).error;
  const decided = (await repo.list("approvals")).filter((a) => a.state !== "PENDING").sort((a, b) => (b.decidedAt ?? "").localeCompare(a.decidedAt ?? "")).slice(0, 8);
  return (
    <>
      <PageHeader title="Approvals" sub="Human approval is mandatory. Approving never publishes — it only unlocks scheduling." />
      {err && <div role="alert" className="mb-4 rounded-xl border border-bad/40 bg-bad/10 p-3 text-bad">{err}</div>}
      {pending.length === 0 ? <Empty>Nothing to review. <Link className="text-blue2" href="/create">Create something →</Link></Empty> : (
        <div className="grid gap-4">{items.filter(Boolean).map((it) => {
          const { a, p, assets, captions, blockers, qa } = it!;
          const manual = assets.filter((x) => x.qaStatus === "MANUAL_REVIEW_REQUIRED").length;
          return (
            <Card key={a.id}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><span className="flex items-center gap-3"><ProdLink p={p} /><TalentChips codes={p.talent} /><span className="text-muted">{p.contentType} · {p.concept}</span><DemoBadge origin={p.origin} /></span><StatusPill status={p.status} /></div>
              <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">{assets.map((x) => (
                <label key={x.id} className="block cursor-pointer"><AssetTile asset={x} /><span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]"><input form={`f-${a.id}`} type="checkbox" name="asset" value={x.id} defaultChecked={x.status === "RAW" && x.qaStatus !== "HARD_FAIL"} className="!w-auto" />approve <QaPill status={x.qaStatus} /></span></label>
              ))}</div>
              {manual > 0 && <p className="mb-2 rounded-lg border border-warn/30 bg-warn/10 p-2 text-[12.5px] text-warn">{manual} asset(s) were NOT visually verified by any automated inspector — you are the identity/technical check. Compare against the canonical references before approving.</p>}
              <details className="mb-3 text-[12px] text-muted"><summary className="cursor-pointer">QA details ({qa.length})</summary>{qa.map((q) => <p key={q.id} className="border-t border-edge py-1"><b>{q.kind}</b> · {q.method} · <QaPill status={q.status} /> {q.inspectedImage ? "(image inspected)" : "(image not inspected)"} — {q.summary}</p>)}</details>
              {captions.map((c) => <p key={c.id} className="mb-3 rounded-lg border border-edge p-2 text-[13px]">“{c.text}”</p>)}
              {p.qaNotes.length > 0 && <p className="mb-2 text-warn">QA: {p.qaNotes.join("; ")}</p>}
              {blockers.length > 0 && <p className="mb-2 text-warn">Blocked: {blockers.join("; ")}. <Link href="/launch" className="text-blue2">Launch →</Link></p>}
              <form id={`f-${a.id}`} action={decideAction} className="flex flex-wrap items-center gap-2"><input type="hidden" name="approvalId" value={a.id} />
                <details className="w-full rounded-lg border border-edge p-2 text-[12.5px]"><summary className="cursor-pointer font-semibold text-muted">Why? (reasons for revision / rejection — Northline learns from these)</summary>
                  <div className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">{REJECTION_REASONS.map(([code, label]) => <label key={code} className="flex items-center gap-2"><input type="checkbox" name="reason" value={code} className="size-4" />{label}</label>)}</div>
                </details>
                <input name="notes" placeholder="Notes (optional; a revision needs a reason or a note)" aria-label="Notes" className="min-w-48 flex-1" />
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
