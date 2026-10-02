// The data the HQ displays (command table map, Command Center wall, founder-suite panel) and Founder Command summarise. Pure view-model built from the SIMULATED
// snapshot + the cosmetic agent positions. It never reads real Northline state.
import type { WorldSnapshot } from "./schema";
import { WORLD_ROSTER } from "./roster";
import { displayStatus, STATUS_PRIORITY, type DirKind } from "./labels";
import type { OpState } from "./agent-ai";

export interface BoardAgent { id: string; code3: string; glyph: string; color: string; name: string; role: string; group: string; statusCode: string; symbol: string; word: string; pattern: string; x: number; z: number; where: string; task: string; creator: string; elapsed: string; next: string; commanded: boolean }
export interface BoardData {
  simulated: true; seq: number; counts: { working: number; waiting: number; blocked: number; failed: number; idle: number; paused: number };
  approvals: number | string; budget: { imagesToday: number | string; limitsRemaining: number | string }; system: string; agents: BoardAgent[];
  player: { x: number; z: number; yaw: number }; meeting: boolean; summoned: number;
}
export const emptyBoard = (): BoardData => ({ simulated: true, seq: -1, counts: { working: 0, waiting: 0, blocked: 0, failed: 0, idle: 0, paused: 0 }, approvals: "—", budget: { imagesToday: "—", limitsRemaining: "—" }, system: "SIMULATED", agents: [], player: { x: 0, z: 0, yaw: 0 }, meeting: false, summoned: 0 });

const elapsed = (from: string | null, now: string) => { if (!from) return "—"; const s = Math.max(0, Math.round((Date.parse(now) - Date.parse(from)) / 1000)); return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`; };
export interface BoardInput {
  snap: WorldSnapshot; player: { x: number; z: number; yaw: number }; meeting: boolean;
  pos: (id: string) => { x: number; z: number; where: string };
  directive: (id: string) => { kind: DirKind; arrived: boolean } | null; founderInMeeting: boolean;
}
export function buildBoard(i: BoardInput): BoardData {
  const by = new Map(i.snap.agents.map((a) => [a.agentId, a])), counts = { working: 0, waiting: 0, blocked: 0, failed: 0, idle: 0, paused: 0 };
  const agents: BoardAgent[] = WORLD_ROSTER.map((r) => {
    const a = by.get(r.code), op = (a?.opState ?? "IDLE") as OpState, d = i.directive(r.code), st = displayStatus(op, d, i.founderInMeeting), p = i.pos(r.code);
    counts[op.toLowerCase() as keyof typeof counts]++;
    return { id: r.code, code3: r.code3, glyph: r.glyph, color: r.color, name: r.persona, role: r.registryName, group: r.group, statusCode: st.code, symbol: st.symbol, word: st.word, pattern: st.pattern, x: p.x, z: p.z, where: p.where, task: a?.taskTitle ?? "—", creator: a?.creator ?? "—", elapsed: op === "WORKING" ? elapsed(a?.startedAt ?? null, i.snap.serverTime) : "—", next: a?.nextAction ?? "—", commanded: !!d };
  });
  return { simulated: true, seq: i.snap.seq, counts, approvals: i.snap.approvals.waiting, budget: i.snap.budget, system: i.snap.system.status, agents, player: i.player, meeting: i.meeting, summoned: agents.filter((a) => a.commanded).length };
}
export const sortedByAttention = (a: BoardAgent[]) => [...a].sort((x, y) => (STATUS_PRIORITY[x.statusCode] ?? 6) - (STATUS_PRIORITY[y.statusCode] ?? 6) || x.code3.localeCompare(y.code3));
