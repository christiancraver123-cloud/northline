"use client";
// All of a creator's images. Library images (not yet reviewed) can be ticked — one by one, shift-click for a range,
// or Select all — and sent to Approvals in one go. Everything else just shows its status.
import { useRef, useState } from "react";
import Link from "next/link";
import { sendLibraryAction } from "@/app/actions";

export interface PickerImage { id: string; url: string; label: string; library: boolean; status: string; href: string }

export function ImagePicker({ images, back, readOnly, filterLabel }: { images: PickerImage[]; back: string; readOnly: boolean; filterLabel?: string }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [onlyLib, setOnlyLib] = useState(false);
  const last = useRef<number | null>(null);
  const shown = onlyLib ? images.filter((i) => i.library) : images;
  const pickable = shown.filter((i) => i.library).map((i) => i.id);
  const toggle = (idx: number, shift: boolean) => {
    const id = shown[idx].id, prev = last.current;
    setSel((s) => {
      const n = new Set(s), on = !s.has(id);
      if (shift && prev !== null) { const [a, b] = [Math.min(prev, idx), Math.max(prev, idx)]; for (let k = a; k <= b; k++) if (shown[k].library) { if (on) n.add(shown[k].id); else n.delete(shown[k].id); } }
      else if (on) n.add(id); else n.delete(id);
      return n;
    });
    last.current = idx;
  };
  return (
    <form action={sendLibraryAction} className="grid gap-3">
      <input type="hidden" name="back" value={back} />
      {[...sel].map((id) => <input key={id} type="hidden" name="asset" value={id} />)}
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <button type="button" disabled={!pickable.length} onClick={() => setSel(new Set(pickable))} className="rounded-lg border border-edge px-3 py-1.5 disabled:opacity-40">Select all not reviewed ({pickable.length})</button>
        <button type="button" disabled={!sel.size} onClick={() => setSel(new Set())} className="rounded-lg border border-edge px-3 py-1.5 disabled:opacity-40">Deselect</button>
        <label className="flex items-center gap-1.5 text-muted"><input type="checkbox" checked={onlyLib} onChange={(e) => setOnlyLib(e.target.checked)} className="size-4 !w-auto" />Only not reviewed</label>
        <span className="text-faint">Tip: shift-click to tick a range.</span>
        <button disabled={readOnly || !sel.size} className="ml-auto rounded-xl bg-blue2 text-[#1a1410] shadow-[0_1px_0_rgba(255,255,255,.35)_inset,0_8px_20px_-10px_rgba(226,200,150,.6)] hover:bg-[#ecd6ab] px-4 py-2 font-bold disabled:opacity-40">Send {sel.size || ""} to Approvals</button>
      </div>
      {filterLabel && <p className="text-[12px] text-faint">{filterLabel}</p>}
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">{shown.map((im, idx) => {
        const on = sel.has(im.id);
        return (
          <li key={im.id} className={`relative overflow-hidden rounded-xl border bg-panel/70 ${on ? "border-blue2 ring-2 ring-blue2/60" : "border-edge"}`}>
            {im.library && !readOnly
              ? <button type="button" onClick={(e) => toggle(idx, e.shiftKey)} aria-pressed={on} aria-label={`Select ${im.label}`} className="block w-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={im.url} alt={im.label} loading="lazy" className="aspect-[4/5] w-full object-cover" />
                  <span className={`absolute left-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-md text-[11px] font-black ${on ? "bg-blue2 text-[#141016]" : "bg-black/60 text-transparent"}`}>✓</span>
                </button>
              : <Link href={im.href} className="block">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={im.url} alt={im.label} loading="lazy" className="aspect-[4/5] w-full object-cover" /></Link>}
            <span className={`absolute bottom-1 right-1 rounded px-1 font-mono text-[9.5px] ${im.library ? "bg-black/60 text-warn" : "bg-black/60 text-ok"}`}>{im.status}</span>
          </li>);
      })}</ul>
      {!shown.length && <p className="text-[13px] text-muted">No images yet.</p>}
    </form>
  );
}
