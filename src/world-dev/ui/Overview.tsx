"use client";
import type { HudState } from "../Game";
import type { WorldSnapshot } from "@/lib/world/schema";
import { roleStyle } from "@/lib/world/schema";
import { NOT_CONFIGURED_ROLES, WORLD_ROSTER } from "@/lib/world/roster";
import { LANDMARKS } from "@/lib/world/layout";
import { TONE } from "./AgentPanel";

/** Management overview: every registered agent, its (simulated) status, where it is, blocked/waiting flags, plus the buildings and the player. Select → FOCUS / FOLLOW / GO THERE / RETURN. */
export function Overview({ hud, snap, onSelect, onFocus, onFollow, onDetails, onGo, onReturn, onTravel, mobile }: {
  hud: HudState; snap: WorldSnapshot; onSelect: (id: string) => void; onFocus: () => void; onFollow: () => void; onDetails: () => void; onGo: (id: string) => void; onReturn: () => void; onTravel: (id: string) => void; mobile: boolean;
}) {
  const by = new Map(snap.agents.map((a) => [a.agentId, a])), cnt = { WORKING: 0, WAITING: 0, BLOCKED: 0, IDLE: 0 } as Record<string, number>;
  snap.agents.forEach((a) => { cnt[a.opState] = (cnt[a.opState] ?? 0) + 1; });
  const sel = hud.selectedAgent, selA = sel ? by.get(sel) : null;
  return (
    <aside data-testid="overview" className={`pointer-events-auto absolute z-30 flex flex-col gap-2 overflow-y-auto rounded-2xl border border-white/10 bg-[#0b1020]/92 text-slate-100 shadow-2xl backdrop-blur-md ${mobile ? "inset-x-2 bottom-2 max-h-[46vh]" : "left-3 top-14 max-h-[calc(100vh-5rem)] w-[330px]"}`}>
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2 text-[12px]">
        <b className="text-[13px]">Management overview</b>
        <span className="font-mono text-[11px] text-slate-400"><span style={{ color: TONE.WORKING }}>{cnt.WORKING} working</span> · <span style={{ color: TONE.WAITING }}>{cnt.WAITING} waiting</span> · <span style={{ color: TONE.BLOCKED }}>{cnt.BLOCKED} blocked</span></span>
      </div>
      <div className="px-3 text-[11.5px] text-slate-400">You are at <b className="text-slate-200">{hud.location}</b>{hud.indoor ? " (indoors)" : ""} · SIMULATED statuses</div>
      <ul className="max-h-[42vh] min-h-[7rem] shrink-0 overflow-y-auto px-1.5" aria-label="Agents">
        {WORLD_ROSTER.map((r) => { const a = by.get(r.code), st = roleStyle(r.code), h = hud.agents.find((x) => x.id === r.code), flag = a?.opState === "BLOCKED" ? "⛔ BLOCKED" : a?.opState === "WAITING" ? "⏳ WAITING" : null;
          return <li key={r.code}><button onClick={() => onSelect(r.code)} data-agent={r.code} aria-pressed={sel === r.code} className={`flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left text-[12.5px] hover:bg-white/10 ${sel === r.code ? "bg-sky-400/20 ring-1 ring-sky-300/60" : ""}`}>
            <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-bold text-white" style={{ background: st.color }}>{st.glyph}</span>
            <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{r.persona} <span className="font-normal text-slate-400">· {r.registryName}</span></span><span className="block truncate text-[11px] text-slate-400">{h?.where ?? "—"}{h?.indoor ? " · indoors" : ""}{flag ? "" : a?.taskTitle ? ` · ${a.taskTitle.replace(/SIMULATED /, "")}` : ""}</span></span>
            <span className="shrink-0 rounded-full border px-1.5 py-0.5 font-mono text-[10px] font-bold" style={{ color: TONE[a?.opState ?? "IDLE"], borderColor: TONE[a?.opState ?? "IDLE"] }}>{flag ?? a?.opState ?? "IDLE"}</span>
          </button></li>; })}
        {NOT_CONFIGURED_ROLES.map((n) => <li key={n.role} className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 text-[12px] text-slate-500"><span aria-hidden className="grid h-7 w-7 place-items-center rounded-full border border-dashed border-slate-600">?</span><span className="flex-1">{n.role} <span className="text-[10.5px]">· {n.location}</span></span><span className="rounded-full border border-slate-600 px-1.5 py-0.5 font-mono text-[10px]">NOT CONFIGURED</span></li>)}
      </ul>
      {sel && selA && <div className="flex flex-wrap gap-1.5 border-t border-white/10 px-3 py-2" data-testid="overview-actions">
        <button onClick={onFocus} className="rounded-full border border-sky-300/60 px-2.5 py-1 text-[12px] font-semibold hover:bg-sky-400/20">FOCUS [Q]</button>
        <button onClick={onFollow} className="rounded-full border border-violet-300/60 px-2.5 py-1 text-[12px] font-semibold hover:bg-violet-400/20">FOLLOW [T]</button>
        <button onClick={onDetails} className="rounded-full border border-white/25 px-2.5 py-1 text-[12px] font-semibold hover:bg-white/10">Details [E]</button>
        <button onClick={() => onGo(sel)} className="rounded-full border border-emerald-300/60 px-2.5 py-1 text-[12px] font-semibold hover:bg-emerald-400/20">Go there</button>
      </div>}
      <details className="border-t border-white/10 px-3 py-2"><summary className="cursor-pointer text-[10.5px] font-bold uppercase tracking-wide text-slate-400">Buildings & places ({LANDMARKS.length})</summary><div className="mt-1 flex flex-wrap gap-1">
        {LANDMARKS.map((l) => <button key={l.id} onClick={() => onTravel(l.id)} className="rounded-full border border-white/15 px-2 py-0.5 text-[11px] hover:bg-white/10">{l.name}</button>)}</div></details>
      <div className="border-t border-white/10 px-3 py-2"><button onClick={onReturn} className="w-full rounded-lg bg-sky-500 px-3 py-1.5 text-[12.5px] font-bold hover:bg-sky-400">RETURN to player [R]</button></div>
    </aside>
  );
}
