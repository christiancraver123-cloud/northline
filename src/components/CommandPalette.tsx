"use client";
// ⌘K / Ctrl+K jump-to: every page, every creator, and the common actions. Keyboard first; Esc closes.
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon";

export interface PaletteItem { href: string; label: string; icon: string; group: string; hint?: string; img?: string | null; color?: string }

export function openPalette() { window.dispatchEvent(new Event("nl:palette")); }

export function CommandPalette({ items }: { items: PaletteItem[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
      else if (e.key === "/" && !open && !(e.target as HTMLElement)?.closest("input,textarea,select,[contenteditable]")) { e.preventDefault(); setOpen(true); }
    };
    const ev = () => setOpen(true);
    window.addEventListener("keydown", key); window.addEventListener("nl:palette", ev);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("nl:palette", ev); };
  }, [open]);
  useEffect(() => { if (open) { setQ(""); setI(0); setTimeout(() => input.current?.focus(), 0); } }, [open]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return items;
    const score = (it: PaletteItem) => { const l = it.label.toLowerCase(); if (l.startsWith(t)) return 0; if (l.includes(t)) return 1; if ((it.hint ?? "").toLowerCase().includes(t) || it.group.toLowerCase().includes(t)) return 2; let k = 0; for (const ch of l) if (ch === t[k]) k++; return k === t.length ? 3 : 9; };
    return items.map((it) => [it, score(it)] as const).filter(([, s]) => s < 9).sort((a, b) => a[1] - b[1]).map(([it]) => it);
  }, [q, items]);
  useEffect(() => { setI(0); }, [q]);
  useEffect(() => { list.current?.querySelector<HTMLElement>(`[data-i="${i}"]`)?.scrollIntoView({ block: "nearest" }); }, [i]);

  if (!open) return null;
  const go = (it?: PaletteItem) => { if (!it) return; setOpen(false); router.push(it.href); };
  let lastGroup = "";
  return (
    <div className="anim-fade fixed inset-0 z-[60] grid items-start justify-items-center bg-black/55 px-4 pt-[12vh] backdrop-blur-[2px]" onMouseDown={() => setOpen(false)}>
      <div role="dialog" aria-modal="true" aria-label="Jump to" className="anim-pop w-full max-w-[560px] overflow-hidden rounded-2xl border border-edge bg-panel shadow-[0_40px_80px_-20px_rgba(0,0,0,.8)]" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 border-b border-edge px-4">
          <Icon name="search" className="text-faint" />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Jump to a page, a creator or an action"
            className="!border-0 !bg-transparent !px-0 py-3.5 text-[15px] !shadow-none"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setI((x) => Math.min(x + 1, shown.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setI((x) => Math.max(x - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); go(shown[i]); }
              else if (e.key === "Escape") setOpen(false);
            }} />
          <span className="kbd">esc</span>
        </div>
        <div ref={list} className="max-h-[52vh] overflow-auto p-1.5">
          {shown.length === 0 && <div className="px-3 py-6 text-center text-muted">Nothing matches “{q}”.</div>}
          {shown.map((it, n) => {
            const head = it.group !== lastGroup ? (lastGroup = it.group) : null;
            return (
              <div key={it.href + it.label}>
                {head && <div className="px-3 pb-1 pt-2.5 text-[11.5px] font-semibold text-faint">{head}</div>}
                <button type="button" data-i={n} onMouseMove={() => setI(n)} onClick={() => go(it)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[14px] ${n === i ? "bg-white/[0.06] text-ink" : "text-muted"}`}>
                  {it.img !== undefined
                    ? <span className="h-6 w-6 flex-none overflow-hidden rounded-full" style={{ background: it.color, boxShadow: `0 0 0 1.5px ${it.color}` }}>{it.img && /* eslint-disable-next-line @next/next/no-img-element */ <img src={it.img} alt="" className="h-full w-full object-cover object-[50%_30%]" />}</span>
                    : <span className={`grid h-6 w-6 flex-none place-items-center rounded-lg ${n === i ? "text-blue2" : "text-faint"}`}><Icon name={it.icon} /></span>}
                  <span className="flex-1 truncate">{it.label}</span>
                  {it.hint && <span className="truncate text-[12px] text-faint">{it.hint}</span>}
                  {n === i && <Icon name="arrow" size={14} className="text-faint" />}
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-4 border-t border-edge px-4 py-2 text-[11.5px] text-faint"><span><span className="kbd">↑</span> <span className="kbd">↓</span> move</span><span><span className="kbd">↵</span> open</span><span className="ml-auto"><span className="kbd">⌘</span> <span className="kbd">K</span> anywhere</span></div>
      </div>
    </div>
  );
}
