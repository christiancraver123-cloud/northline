"use client";
import type { PerfState } from "../Game";
import type { Tier } from "@/lib/world/quality";

export function PerfOverlay({ p, manual, onManual, onSimulate, auto, shift = false }: { shift?: boolean; p: PerfState | null; manual: Tier | null; onManual: (t: Tier | null) => void; onSimulate: () => void; auto: Tier }) {
  if (!p) return null;
  const row = (k: string, v: string, bad = false) => <div className="flex justify-between gap-4"><span className="text-slate-400">{k}</span><span className={bad ? "text-rose-300" : ""}>{v}</span></div>;
  return (
    <div className={`pointer-events-auto absolute top-12 z-[32] ${shift ? "left-[348px]" : "left-3"} w-[236px] rounded-xl border border-white/10 bg-black/70 p-3 font-mono text-[11.5px] leading-5 text-slate-100 backdrop-blur`} data-testid="perf">
      <div className="mb-1 font-bold text-emerald-300">PERFORMANCE (dev)</div>
      {row("FPS", p.fps.toFixed(0), p.fps < 28)}{row("frame", `${p.ms.toFixed(1)} ms`)}{row("1% low", `${p.low1.toFixed(0)} fps`, p.low1 < 20)}
      {row("draw calls", String(p.calls))}{row("triangles", p.tris.toLocaleString())}{row("geometries", String(p.geometries))}{row("textures", String(p.textures))}{row("DPR", p.dpr.toFixed(2))}{row("tier", `${p.tier}${p.auto ? " (auto)" : " (manual)"}`)}
      <div className="mt-2 flex gap-1" role="group" aria-label="Quality tier">
        {([null, "LOW", "MEDIUM", "HIGH"] as const).map((t) => <button key={String(t)} onClick={() => onManual(t)} className={`flex-1 rounded border px-1 py-0.5 text-[10.5px] ${manual === t ? "border-emerald-400 bg-emerald-400/20" : "border-white/20 hover:bg-white/10"}`}>{t ?? `AUTO·${auto[0]}`}</button>)}
      </div>
      <button onClick={onSimulate} className="mt-2 w-full rounded border border-amber-400/60 px-2 py-1 text-[11px] font-bold text-amber-300 hover:bg-amber-400/10">Simulate a task for selected / nearest agent</button>
      <div className="mt-1 text-[10px] text-slate-500">Software/headless GL numbers are not GPU benchmarks.</div>
    </div>
  );
}
