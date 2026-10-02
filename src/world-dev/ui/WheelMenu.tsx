"use client";
import type { Input } from "../input";
import { WHEEL_ITEMS } from "../wheel";

/** Quick command wheel (Q): eight one-tap actions in a ring (number keys 1–8 also work). Same actions as the Founder Command bar. */
export function WheelMenu({ input, mobile, onClose }: { input: Input; mobile: boolean; onClose: () => void }) {
  const Rx = mobile ? 118 : 190, Ry = mobile ? 112 : 122, bw = mobile ? 84 : 104, bh = mobile ? 56 : 62;
  return (
    <div className="pointer-events-auto absolute inset-0 z-[36] grid place-items-center bg-black/25 backdrop-blur-[1px]" data-testid="wheel" onClick={onClose} role="dialog" aria-label="Quick command wheel">
      <div className="relative" style={{ width: Rx * 2 + bw + 16, height: Ry * 2 + bh + 16 }} onClick={(e) => e.stopPropagation()}>
        <div className="absolute left-1/2 top-1/2 grid h-20 w-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-[#0b1020]/90 text-center text-[10px] font-bold leading-tight text-slate-300">FOUNDER<br />WHEEL<br /><span className="font-normal text-slate-500">Q / Esc</span></div>
        {WHEEL_ITEMS.map((it, i) => { const a = (i / WHEEL_ITEMS.length) * Math.PI * 2 - Math.PI / 2; return (
          <button key={it.n} data-wheel={it.n} onClick={() => { onClose(); input.cmdQueue.push(it.cmd); }} className="absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-2xl border border-white/20 bg-[#0b1020]/92 px-1 text-center text-[11.5px] font-bold leading-tight text-white shadow-xl hover:border-sky-300 hover:bg-sky-500/30" style={{ width: bw, height: bh, left: `calc(50% + ${Math.cos(a) * Rx}px)`, top: `calc(50% + ${Math.sin(a) * Ry}px)` }}>
            <span><span className="mr-1 font-mono text-[10px] text-sky-300">{it.n}</span>{it.label}<span className="block text-[9.5px] font-normal text-slate-400">{it.hint}</span></span></button>); })}
      </div>
    </div>
  );
}
