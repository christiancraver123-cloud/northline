"use client";
// FOUNDER COMMAND MODE — the management overlay, available anywhere in the World (key C, or the Command Center table, or the COMMAND button).
// UI → (input.cmdQueue) → world command controller → simulated agent directives. Everything here is SIMULATED: nothing is written to Northline.
import { useMemo, useState } from "react";
import type { HudState } from "../Game";
import type { Input } from "../input";
import type { CommandAction } from "@/lib/world/command";
import { GROUPS, NOT_CONFIGURED_ROLES, type GroupId } from "@/lib/world/roster";
import { STATUS_PRIORITY } from "@/lib/world/labels";
import { travelPoints } from "@/lib/world/travel";
import type { BoardAgent } from "@/lib/world/board";

const TONE: Record<string, string> = { WORKING: "#34d399", IDLE: "#94a3b8", WAITING: "#fbbf24", BLOCKED: "#fb923c", FAILED: "#f87171", PAUSED: "#a78bfa", SUMMONED: "#38bdf8", AT_FOUNDER: "#38bdf8", TO_MEETING: "#c4b5fd", MEETING: "#c4b5fd", IN_MEETING: "#c4b5fd", TO_WORKSPACE: "#6ee7b7" };
const PATTERN: Record<string, string> = { solid: "solid", dashed: "dashed", double: "double", dotted: "dotted", none: "solid" };
const btn = "rounded-lg border px-2 py-1.5 text-[11.5px] font-semibold leading-tight transition-colors disabled:cursor-not-allowed disabled:opacity-35";

export function FounderCommand({ hud, input, mobile, inOverview }: { hud: HudState; input: Input; mobile: boolean; inOverview: boolean }) {
  const [filter, setFilter] = useState<GroupId | "ALL">("ALL"), [showTravel, setShowTravel] = useState(false);
  const b = hud.board, sel = hud.command.selection, primary = hud.selectedAgent, dirs = hud.command.directives, n = sel.length;
  const C = (action: CommandAction) => input.cmdQueue.push({ type: "COMMAND", action });
  const rows = useMemo(() => [...b.agents].sort((x, y) => (filter === "ALL" ? GROUPS.findIndex((g) => g.id === x.group) - GROUPS.findIndex((g) => g.id === y.group) : 0) || (STATUS_PRIORITY[x.statusCode] ?? 6) - (STATUS_PRIORITY[y.statusCode] ?? 6) || x.code3.localeCompare(y.code3)).filter((a) => filter === "ALL" || a.group === filter), [b.agents, filter]);
  const targetIds = n ? sel : primary ? [primary] : [];
  const pa = primary ? b.agents.find((a) => a.id === primary) : undefined;
  const chip = (label: string, count: number | string, tone: string, sym: string) => <div className="flex flex-1 flex-col items-center rounded-lg border border-white/10 bg-white/5 px-1.5 py-1" key={label}><span className="font-mono text-[15px] font-bold" style={{ color: tone }}>{sym} {count}</span><span className="text-[9.5px] tracking-wide text-slate-400">{label}</span></div>;
  let lastGroup = "";
  return (
    <aside data-testid="founder-command" aria-label="Founder Command" className={`pointer-events-auto absolute z-30 flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0b1020]/94 text-slate-100 shadow-2xl backdrop-blur-md ${mobile ? "inset-x-2 bottom-2 max-h-[64vh]" : "bottom-3 left-3 top-[88px] w-[410px]"}`}>
      <header className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <b className="whitespace-nowrap text-[14px] tracking-wide">FOUNDER COMMAND</b><span className="whitespace-nowrap rounded-full border border-amber-400/60 px-2 py-0.5 text-[10px] font-bold text-amber-300">SIMULATED DATA</span>
        <span className="ml-auto" />{inOverview ? <button className={`${btn} border-sky-300/60 bg-sky-500 text-white hover:bg-sky-400`} onClick={() => input.cmdQueue.push({ type: "RETURN" })}>RETURN TO PLAYER [R]</button> : <button aria-label="Close Founder Command" className={`${btn} border-white/20 hover:bg-white/10`} onClick={() => input.cmdQueue.push({ type: "CLOSE_COMMAND" })}>✕ [C]</button>}
      </header>
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <section aria-label="Northline status" className="mb-2">
          <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-slate-300"><span><b>NORTHLINE STATUS</b> · {b.system}</span><span>Approvals <b data-testid="fc-approvals">{String(b.approvals)}</b></span><span>Images today <b>{String(b.budget.imagesToday)}</b></span><span>Budget left <b>{String(b.budget.limitsRemaining)}</b></span></div>
          <div className="flex gap-1.5" data-testid="fc-counts">{chip("WORKING", b.counts.working, TONE.WORKING, "▶")}{chip("WAITING", b.counts.waiting, TONE.WAITING, "◔")}{chip("BLOCKED", b.counts.blocked, TONE.BLOCKED, "⊘")}{chip("FAILED", b.counts.failed, TONE.FAILED, "✕")}{chip("IDLE", b.counts.idle, TONE.IDLE, "○")}</div>
          <div className="mt-1 text-[11px] text-slate-500">{hud.command.meeting ? "▣ Meeting called — agents are heading to the HQ meeting room." : b.summoned ? `➜ ${b.summoned} agent(s) following a founder command.` : "No active founder command."}</div>
        </section>
        <section aria-label="Commands" className="mb-1.5 grid grid-cols-3 gap-1">
          <button data-testid="fc-summon-all" className={`${btn} col-span-3 border-sky-300/70 bg-sky-500/90 py-1.5 text-[13px] font-bold text-white hover:bg-sky-400`} onClick={() => C({ type: "SUMMON_ALL" })}>SUMMON ALL [G]</button>
          <button data-testid="fc-summon" className={`${btn} border-sky-300/50 hover:bg-sky-400/20`} disabled={!targetIds.length} onClick={() => C({ type: "SUMMON", ids: targetIds })}>SUMMON{targetIds.length > 1 ? ` (${targetIds.length})` : ""}</button>
          <button data-testid="fc-dismiss-all" className={`${btn} border-white/25 hover:bg-white/10`} onClick={() => C({ type: "DISMISS_ALL" })}>DISMISS ALL</button>
          <button data-testid="fc-return" className={`${btn} border-emerald-300/50 hover:bg-emerald-400/20`} disabled={!targetIds.length} onClick={() => C({ type: "RETURN_TO_WORK", ids: targetIds })}>RETURN TO WORK</button>
          <button data-testid="fc-call-all" className={`${btn} border-violet-300/60 hover:bg-violet-400/20`} onClick={() => C({ type: "CALL_ALL" })}>CALL MEETING (ALL)</button>
          <button data-testid="fc-call-selected" className={`${btn} border-violet-300/40 hover:bg-violet-400/20`} disabled={!targetIds.length} onClick={() => C({ type: "CALL_MEETING", ids: targetIds })}>CALL SELECTED</button>
          <button data-testid="fc-focus-group" className={`${btn} border-sky-300/40 hover:bg-sky-400/20`} disabled={!targetIds.length} onClick={() => input.cmdQueue.push({ type: "FOCUS_GROUP", ids: targetIds })}>FOCUS GROUP</button>
        </section>
        <section aria-label="Selection" className="mb-1.5 flex flex-wrap items-center gap-1">
          <button data-testid="fc-select-all" className={`${btn} border-white/20 px-2 py-1 hover:bg-white/10`} onClick={() => C({ type: "SELECT_ALL" })}>SELECT ALL</button><button data-testid="fc-select-none" className={`${btn} border-white/20 px-2 py-1 hover:bg-white/10`} onClick={() => C({ type: "SELECT_NONE" })}>SELECT NONE</button>
          <span className="ml-1 text-[11px] text-slate-400">{n} selected</span>
          <span className="ml-auto flex flex-wrap gap-1" role="group" aria-label="Group filter">{(["ALL", ...GROUPS.map((g) => g.id)] as const).map((g) => <button key={g} onClick={() => setFilter(g)} aria-pressed={filter === g} className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${filter === g ? "border-sky-300 bg-sky-400/20" : "border-white/15 hover:bg-white/10"}`}>{g === "ALL" ? "ALL" : ({ OPERATIONS: "OPS", STRATEGY: "STRATEGY", CREATIVE: "CREATIVE", PRODUCTION: "PROD", QUALITY: "QUALITY", GROWTH: "GROWTH" } as Record<string, string>)[g]}</button>)}</span>
          {filter !== "ALL" && <button className={`${btn} border-white/20 px-2 py-0.5 text-[10.5px] hover:bg-white/10`} onClick={() => C({ type: "SELECT_GROUP", group: filter })}>select group</button>}
        </section>
        <ul aria-label="Agents" className="grid gap-1">
          {rows.map((a) => { const g = a.group, head = filter === "ALL" && g !== lastGroup ? ((lastGroup = g), GROUPS.find((x) => x.id === g)!.label) : null, isSel = sel.includes(a.id), isP = primary === a.id, d = dirs[a.id];
            return <li key={a.id}>{head && <div className="mb-0.5 mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">{head}</div>}
              <div data-agent={a.id} data-selected={isP ? "1" : "0"} className={`rounded-xl border px-2 py-1.5 ${isP ? "border-sky-300/70 bg-sky-400/10" : "border-white/10 bg-white/[0.03]"}`}>
                <div className="flex items-center gap-2">
                  <input type="checkbox" aria-label={`Select ${a.name}`} checked={isSel} onChange={() => C({ type: "SELECT_TOGGLE", id: a.id })} className="accent-sky-400" style={{ width: 16, height: 16, flex: "none", padding: 0, margin: 0 }} />
                  <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={(e) => { if (e.shiftKey || e.metaKey || e.ctrlKey) C({ type: "SELECT_TOGGLE", id: a.id }); else input.selectQueue.push(a.id); }} aria-pressed={isP}>
                    <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[14px] font-bold text-white" style={{ background: a.color }}>{a.glyph}</span>
                    <span className="min-w-0 flex-1"><span className="flex items-baseline gap-1.5"><span className="font-mono text-[11px] font-bold text-slate-300">{a.code3}</span><span className="truncate text-[13px] font-semibold">{a.name}</span></span><span className="block truncate text-[11px] text-slate-400">{a.role} · {a.where}</span></span>
                  </button>
                  <span className="shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold" style={{ color: TONE[a.statusCode], border: `2px ${PATTERN[a.pattern]} ${TONE[a.statusCode]}` }} title={a.word}>{a.symbol} {a.word.length > 16 ? a.word.slice(0, 15) + "…" : a.word}</span>
                </div>
                {(isP || d) && <div className="mt-1 grid grid-cols-[84px_minmax(0,1fr)] gap-x-2 gap-y-0.5 pl-6 text-[11.5px]">
                  <span className="text-slate-500">Task</span><span className="break-words">{a.task}</span><span className="text-slate-500">Creator</span><span>{a.creator}</span><span className="text-slate-500">Elapsed</span><span>{a.elapsed}</span><span className="text-slate-500">Next action</span><span className="break-words">{a.next}</span>
                </div>}
                {isP && <div className="mt-1.5 flex flex-wrap gap-1 pl-6" data-testid="fc-agent-actions">
                  <button className={`${btn} border-sky-300/60 px-2 py-1 hover:bg-sky-400/20`} onClick={() => input.cmdQueue.push({ type: "FOCUS", id: a.id })}>FOCUS</button>
                  <button className={`${btn} border-violet-300/60 px-2 py-1 hover:bg-violet-400/20`} onClick={() => input.cmdQueue.push({ type: "FOLLOW", id: a.id })}>FOLLOW</button>
                  <button className={`${btn} border-sky-300/60 px-2 py-1 hover:bg-sky-400/20`} onClick={() => C({ type: "SUMMON", ids: [a.id] })}>SUMMON</button>
                  <button className={`${btn} border-emerald-300/60 px-2 py-1 hover:bg-emerald-400/20`} onClick={() => C({ type: "GO_WORKSPACE", ids: [a.id] })}>GO TO WORKSPACE</button>
                  <button className={`${btn} border-white/25 px-2 py-1 hover:bg-white/10`} onClick={() => input.cmdQueue.push({ type: "DETAILS", id: a.id })}>OPEN DETAILS</button>
                  <a className={`${btn} border-white/25 px-2 py-1 hover:bg-white/10`} href={`/agents/${a.id}`} target="_blank" rel="noreferrer">OPEN COMMAND CENTER PAGE ↗</a>
                  {d && <button className={`${btn} border-white/25 px-2 py-1 hover:bg-white/10`} onClick={() => C({ type: "RETURN_TO_WORK", ids: [a.id] })}>RETURN TO WORK</button>}
                  <button className={`${btn} border-white/25 px-2 py-1 hover:bg-white/10`} onClick={() => input.cmdQueue.push({ type: "GO_TO_AGENT", id: a.id })}>GO THERE</button>
                </div>}
              </div></li>; })}
          {NOT_CONFIGURED_ROLES.map((r) => <li key={r.role} className="flex items-center gap-2 rounded-xl border border-dashed border-slate-700 px-2 py-1.5 text-[12px] text-slate-500"><span aria-hidden className="grid h-8 w-8 place-items-center rounded-full border border-dashed border-slate-600">?</span><span className="flex-1">{r.role} <span className="text-[10.5px]">· {r.location}</span></span><span className="rounded-md border border-slate-600 px-1.5 py-0.5 font-mono text-[10px]">NOT CONFIGURED</span></li>)}
        </ul>
        <section className="mt-2 border-t border-white/10 pt-1.5">
          <button className="text-[10.5px] font-bold uppercase tracking-wide text-slate-400 hover:text-white" aria-expanded={showTravel} onClick={() => setShowTravel((v) => !v)} data-testid="fc-travel-toggle">Founder travel {showTravel ? "▾" : "▸"}</button>
          {showTravel && <div className="mt-1 grid gap-1" data-testid="fc-travel">{(["Northline", "Districts", "Creator residences"] as const).map((sec) => <div key={sec} className="flex flex-wrap items-center gap-1"><span className="w-full text-[10px] text-slate-500">{sec}</span>{travelPoints().filter((t) => t.section === sec).map((t) => <button key={t.id} className="rounded-full border border-white/15 px-2 py-0.5 text-[11px] hover:bg-white/10" onClick={() => input.cmdQueue.push({ type: "TRAVEL", id: t.id })}>{t.label}</button>)}</div>)}<p className="text-[10px] text-slate-500">Optional fast travel. Walking and flying are the primary way to move.</p></div>}
        </section>
      </div>
      <footer className="border-t border-white/10 px-3 py-1 text-[10.5px] text-slate-500">Simulation only — these commands move cosmetic agents; nothing is written to Northline. {pa ? `Selected: ${pa.name}.` : ""}</footer>
    </aside>
  );
}
export type { BoardAgent };
