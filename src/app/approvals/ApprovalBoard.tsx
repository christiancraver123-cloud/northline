"use client";
// Grid view: select / bulk approve / bulk deny the visible queue, and drag review cards into Approved or Rejected.
// Every action goes through the server's approval gate. There is no publish column: publishing is a separate confirmed action.
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { bulkDecideAction, moveCardAction } from "../actions";

export interface BoardCard { approvalId: string; productionId: string; code: string; creator: string; color: string; thumb: string | null; qa: "PASS" | "REVIEW" | "FAIL" | "NOT RUN"; blockers: string[] }
export interface DoneCard { id: string; code: string; thumb: string | null; color: string }
const QA_TONE = { PASS: "text-ok border-ok/40", REVIEW: "text-warn border-warn/40", FAIL: "text-bad border-bad/40", "NOT RUN": "text-muted border-edge" } as const;

export function ApprovalBoard({ cards, approved, rejected, creator, back, readOnly, tags }: {
  cards: BoardCard[]; approved: DoneCard[]; rejected: DoneCard[]; creator: string; back: string; readOnly: boolean; tags: (readonly [string, string])[];
}) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<null | { decision: "APPROVED" | "REJECTED"; ids: string[]; label: string }>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<"APPROVED" | "REJECTED" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const all = useMemo(() => cards.map((c) => c.approvalId), [cards]);
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const drop = (target: "APPROVED" | "REJECTED") => {
    const id = drag; setDrag(null); setOver(null);
    if (!id || readOnly) return;
    start(async () => {
      const r = await moveCardAction(id, target);
      setMsg(r.ok ? { ok: true, text: target === "APPROVED" ? "Approved." : "Moved to Rejected." } : { ok: false, text: r.error ?? "Could not move" });
      router.refresh();
    });
  };
  const col = (target: "APPROVED" | "REJECTED", label: string, items: DoneCard[]) => (
    <section aria-label={label} onDragOver={(e) => { if (drag) { e.preventDefault(); setOver(target); } }} onDragLeave={() => setOver(null)} onDrop={(e) => { e.preventDefault(); drop(target); }}
      className={`rounded-2xl border-2 border-dashed p-3 transition ${over === target ? (target === "APPROVED" ? "border-ok bg-ok/10" : "border-bad bg-bad/10") : "border-edge"}`}>
      <h3 className={`mb-2 text-[12px] font-bold uppercase tracking-wider ${target === "APPROVED" ? "text-ok" : "text-bad"}`}>{label}</h3>
      {drag && <p className="mb-2 text-[12px] text-muted">Drop to {target === "APPROVED" ? "approve (same checks as the button)" : "reject (recorded as your decision)"}</p>}
      <div className="grid grid-cols-4 gap-1.5">{items.slice(0, 8).map((x) => <div key={x.id} title={x.code} className="aspect-[4/5] overflow-hidden rounded-md border border-edge" style={{ background: `linear-gradient(160deg, ${x.color}55, #0b1128)` }}>{x.thumb && /* eslint-disable-next-line @next/next/no-img-element */ <img src={x.thumb} alt={x.code} className="h-full w-full object-cover" />}</div>)}</div>
      {!items.length && <p className="text-[12px] text-faint">None yet.</p>}
    </section>
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={!cards.length} onClick={() => setSel(new Set(all))} className="rounded-lg border border-edge px-3 py-1.5 text-[13px] disabled:opacity-40">Select all</button>
        <button type="button" disabled={!sel.size} onClick={() => setSel(new Set())} className="rounded-lg border border-edge px-3 py-1.5 text-[13px] disabled:opacity-40">Deselect all</button>
        <span className="mx-1 h-5 w-px bg-edge" />
        <button type="button" disabled={readOnly || !sel.size} onClick={() => setConfirm({ decision: "APPROVED", ids: [...sel], label: "selected" })} className="rounded-lg border border-ok/50 px-3 py-1.5 text-[13px] font-bold text-ok disabled:opacity-40">Approve selected ({sel.size})</button>
        <button type="button" disabled={readOnly || !sel.size} onClick={() => setConfirm({ decision: "REJECTED", ids: [...sel], label: "selected" })} className="rounded-lg border border-bad/50 px-3 py-1.5 text-[13px] font-bold text-bad disabled:opacity-40">Deny selected ({sel.size})</button>
        <span className="flex-1" />
        <button type="button" disabled={readOnly || !cards.length} onClick={() => setConfirm({ decision: "APPROVED", ids: all, label: "all" })} className="rounded-lg bg-ok/20 px-3 py-1.5 text-[13px] font-bold text-ok disabled:opacity-40">APPROVE ALL ({cards.length})</button>
        <button type="button" disabled={readOnly || !cards.length} onClick={() => setConfirm({ decision: "REJECTED", ids: all, label: "all" })} className="rounded-lg bg-bad/20 px-3 py-1.5 text-[13px] font-bold text-bad disabled:opacity-40">DENY ALL ({cards.length})</button>
      </div>

      {confirm && (
        <form action={bulkDecideAction} className={`grid gap-2 rounded-2xl border p-4 ${confirm.decision === "REJECTED" ? "border-bad/50 bg-bad/10" : "border-ok/50 bg-ok/10"}`} role="alertdialog" aria-label="Confirm bulk action">
          <p className="text-[15px] font-bold">{confirm.decision === "REJECTED" ? "Deny" : "Approve"} {confirm.ids.length} asset{confirm.ids.length === 1 ? "" : "s"}?</p>
          <p className="text-[12.5px] text-muted">{confirm.decision === "REJECTED" ? "Only the items in this queue are affected. Nothing is deleted: every image and production stays in history, marked rejected." : "Each item still goes through the approval checks; any that fail them stay in the queue. Approving never publishes."}</p>
          {confirm.ids.map((id) => <input key={id} type="hidden" name="approvalId" value={id} />)}
          <input type="hidden" name="decision" value={confirm.decision} /><input type="hidden" name="creator" value={creator} /><input type="hidden" name="back" value={back} />
          {confirm.decision === "REJECTED" && <>
            <div className="flex flex-wrap gap-1.5">{tags.map(([tag, code]) => <label key={tag} className="flex cursor-pointer items-center gap-1 rounded-full border border-edge px-2.5 py-1 text-[12px] has-[:checked]:border-bad/60 has-[:checked]:bg-bad/15"><input type="checkbox" name="reason" value={code} className="sr-only" />{tag}</label>)}</div>
            <input name="notes" placeholder="Shared reason (optional)" aria-label="Shared reason" />
          </>}
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="confirm" value="yes" required className="size-4 !w-auto" />Yes, {confirm.decision === "REJECTED" ? "deny" : "approve"} these {confirm.ids.length}.</label>
          <div className="flex gap-2"><button className={`rounded-lg px-4 py-2 font-bold ${confirm.decision === "REJECTED" ? "bg-bad/80" : "bg-ok/80 text-[#0a0f24]"}`}>{confirm.decision === "REJECTED" ? `Deny ${confirm.ids.length}` : `Approve ${confirm.ids.length}`}</button><button type="button" onClick={() => setConfirm(null)} className="rounded-lg border border-edge px-4 py-2">Cancel</button></div>
        </form>
      )}
      {msg && <div role="status" className={`rounded-xl border p-2.5 text-[13px] ${msg.ok ? "border-ok/40 text-ok" : "border-bad/40 text-bad"}`}>{msg.text}</div>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        <section aria-label="Review">
          {cards.length === 0 ? <div className="rounded-2xl border border-dashed border-edge p-10 text-center text-muted">Nothing waiting for review.</div> : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">{cards.map((c) => {
              const on = sel.has(c.approvalId);
              return (
                <li key={c.approvalId} draggable={!readOnly} onDragStart={(e) => { e.dataTransfer.setData("text/plain", c.approvalId); e.dataTransfer.effectAllowed = "move"; setDrag(c.approvalId); }} onDragEnd={() => { setDrag(null); setOver(null); }}
                  className={`group relative overflow-hidden rounded-xl border bg-panel/80 transition ${on ? "border-blue2 ring-2 ring-blue2/50" : "border-edge"} ${drag === c.approvalId ? "opacity-50" : ""} ${!readOnly ? "cursor-grab" : ""}`}>
                  <label className="absolute left-2 top-2 z-10 grid h-6 w-6 cursor-pointer place-items-center rounded-md bg-black/60"><input type="checkbox" checked={on} onChange={() => toggle(c.approvalId)} aria-label={`Select ${c.code}`} className="size-4 !w-auto" /></label>
                  <Link href={`/approvals?id=${c.approvalId}${creator ? `&creator=${creator}` : ""}`} className="block aspect-[4/5]" style={{ background: `linear-gradient(160deg, ${c.color}55, #0b1128 80%)` }} draggable={false}>
                    {c.thumb ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={c.thumb} alt={c.code} draggable={false} className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center text-[11px] text-muted">no image file</span>}
                  </Link>
                  <div className="flex items-center justify-between gap-1 p-2 text-[12px]"><span className="flex min-w-0 items-center gap-1.5"><span className="h-2 w-2 flex-none rounded-full" style={{ background: c.color }} /><span className="truncate">{c.creator}</span></span><span className={`rounded-full border px-1.5 font-mono text-[10.5px] ${QA_TONE[c.qa]}`}>QA {c.qa}</span></div>
                  {c.blockers.length > 0 && <p className="px-2 pb-2 text-[11px] text-warn" title={c.blockers.join("; ")}>Blocked: {c.blockers[0]}</p>}
                </li>
              );
            })}</ul>
          )}
        </section>
        <aside className="grid content-start gap-3">
          <p className="text-[12px] text-faint">{readOnly ? "Read-only: decisions are disabled." : "Drag a card into a column, or use the buttons. Publishing is never done by drag."}</p>
          {col("APPROVED", "Approved", approved)}
          {col("REJECTED", "Rejected / archived", rejected)}
          {pending && <p className="text-[12px] text-muted">Saving…</p>}
        </aside>
      </div>
    </div>
  );
}
