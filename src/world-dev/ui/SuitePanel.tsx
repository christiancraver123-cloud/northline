"use client";
import type { HudState } from "../Game";
import type { Input } from "../input";

/** Founder Control Panel (bedroom pedestal): a compact status card + three actions. The bedroom stays a bedroom. SIMULATED. */
export function SuitePanel({ hud, input, mobile }: { hud: HudState; input: Input; mobile: boolean }) {
  const b = hud.board, top = b.agents.filter((a) => a.statusCode === "WORKING").slice(0, 3);
  const done = (c: Parameters<Input["cmdQueue"]["push"]>[0]) => { input.cmdQueue.push({ type: "CLOSE_SUITE" }); input.cmdQueue.push(c); };
  return (
    <aside role="dialog" aria-label="Founder control panel" data-testid="suite-panel" className={`pointer-events-auto absolute z-30 flex flex-col gap-2 rounded-2xl border border-white/10 bg-[#0b1020]/94 p-4 text-slate-100 shadow-2xl backdrop-blur-md ${mobile ? "inset-x-2 bottom-2" : "left-1/2 top-16 max-h-[calc(100vh-5rem)] w-[380px] -translate-x-1/2 overflow-y-auto"}`}>
      <div className="flex items-center gap-2"><b className="text-[15px]">Founder control panel</b><span className="rounded-full border border-amber-400/60 px-2 py-0.5 text-[10px] font-bold text-amber-300">SIMULATED</span><button className="ml-auto rounded-lg border border-white/20 px-2 py-1 text-[12px] hover:bg-white/10" onClick={() => input.cmdQueue.push({ type: "CLOSE_SUITE" })}>Close [Esc]</button></div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[13px]"><span className="text-slate-400">Northline status</span><span>{b.system}</span><span className="text-slate-400">Agents working</span><span>{b.counts.working} / {b.agents.length}</span><span className="text-slate-400">Blocked / waiting</span><span>{b.counts.blocked} / {b.counts.waiting}</span><span className="text-slate-400">Approvals</span><span>{String(b.approvals)}</span></div>
      <div className="rounded-lg bg-white/5 p-2 text-[12px]"><div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Current simulated tasks</div>{top.length ? top.map((a) => <div key={a.id} className="truncate">{a.glyph} <b className="font-mono">{a.code3}</b> {a.task}</div>) : <div className="text-slate-500">No agent is working right now.</div>}</div>
      <div className="grid grid-cols-1 gap-1.5">
        <button data-testid="suite-call-all" className="rounded-xl bg-sky-500 px-3 py-2 text-[13px] font-bold hover:bg-sky-400" onClick={() => done({ type: "COMMAND", action: { type: "SUMMON_ALL" } })}>CALL ALL AGENTS</button>
        <button className="rounded-xl border border-white/20 px-3 py-2 text-[13px] font-semibold hover:bg-white/10" onClick={() => done({ type: "TRAVEL", id: "command-center" })}>GO TO COMMAND CENTER</button>
        <button className="rounded-xl border border-white/20 px-3 py-2 text-[13px] font-semibold hover:bg-white/10" onClick={() => done({ type: "OVERVIEW" })}>OPEN MAP</button>
      </div>
      <p className="text-[11px] text-slate-500">Simulation only — nothing here writes to Northline.</p>
    </aside>
  );
}
