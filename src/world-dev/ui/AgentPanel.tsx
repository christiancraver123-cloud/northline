"use client";
import type { AgentPanelModel } from "@/lib/world/schema";
import { roleStyle } from "@/lib/world/schema";

const TONE: Record<string, string> = { WORKING: "#34d399", IDLE: "#94a3b8", WAITING: "#fbbf24", BLOCKED: "#fb923c", FAILED: "#f87171", PAUSED: "#a78bfa" };

/** Operational status card. Built only from the (simulated) snapshot; ambient wandering is shown only when idle and labelled cosmetic. */
export function AgentPanel({ m, agentId, following, onFollow, onClose, mobile }: { m: AgentPanelModel; agentId: string; following: boolean; onFollow: () => void; onClose: () => void; mobile: boolean }) {
  const st = roleStyle(agentId);
  return (
    <aside role="dialog" aria-label={`${m.title} status`} className={`pointer-events-auto absolute z-30 flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#0b1020]/92 p-4 text-slate-100 shadow-2xl backdrop-blur-md ${mobile ? "inset-x-2 bottom-2 max-h-[62vh] overflow-y-auto" : "right-4 top-16 w-[360px]"}`}>
      <div className="rounded-lg border border-amber-400/50 bg-amber-400/10 px-2.5 py-1.5 text-[11.5px] font-semibold leading-snug text-amber-300">⚠ {m.banner}</div>
      <header className="flex items-center gap-3">
        <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-xl font-bold text-white" style={{ background: st.color }}>{st.glyph}</span>
        <div className="min-w-0"><div className="truncate text-[17px] font-bold">{m.title}</div><div className="text-[12.5px] text-slate-400">{m.roleLine} · <span className="font-mono">{st.glyphName}</span></div></div>
        <span className="ml-auto rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-bold" style={{ color: TONE[m.statusLabel], borderColor: TONE[m.statusLabel] }}>{m.statusLabel}</span>
      </header>
      {m.ambientNote && <div className="rounded-lg border border-slate-600/60 bg-slate-800/50 px-2.5 py-1.5 text-[12px] italic text-slate-300">{m.ambientNote}</div>}
      <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13px]">
        {m.rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-slate-400">{k}</dt><dd className="min-w-0 break-words">{v}</dd></div>)}
      </dl>
      {m.recent.length > 0 && <div><div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Recent activity (simulated)</div>{m.recent.map((r, i) => <div key={i} className="border-t border-white/5 py-1 text-[12px] text-slate-300">{new Date(r.at).toLocaleTimeString()} — {r.text}</div>)}</div>}
      <div className="flex gap-2 pt-1">
        <button onClick={onFollow} className="flex-1 rounded-xl bg-violet-500 px-3 py-2.5 text-[13.5px] font-bold text-white hover:bg-violet-400">{following ? "Stop following" : "Follow agent  [T]"}</button>
        <button onClick={onClose} className="rounded-xl border border-white/15 px-4 py-2.5 text-[13.5px] font-semibold hover:bg-white/10">Close [Esc]</button>
      </div>
      <div className="text-[11px] text-slate-500">No model or provider call is made by this panel. Controls such as assign / pause arrive in a later phase.</div>
    </aside>
  );
}
