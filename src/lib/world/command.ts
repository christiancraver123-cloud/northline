// WORLD COMMAND CONTROLLER — the middle layer of  Founder Command UI → World command controller → simulated agent commands.
// Pure state + reducer. Every command here is SIMULATION-ONLY: it changes where the cosmetic agents walk and what the nameplates say, and nothing else.
// A future version will map the same actions onto authorised orchestration API calls (persisted tasks/actions); that mutation layer is deliberately NOT implemented now.
import { GROUPS, WORLD_ROSTER, type GroupId } from "./roster";
import { allocateFormation, assignSlots, type P2 } from "./formation";
import { dist2 } from "./math";
import type { DirKind } from "./labels";

/** Designated meeting positions (HQ meeting room): six seats then four standing places. Spots with these ids exist in hq.ts (a test enforces it). */
export const MEETING_SLOTS = ["hq-meeting-table", "hq-meet-2", "hq-meet-3", "hq-meet-4", "hq-meet-5", "hq-meet-6", "hq-meet-7", "hq-meet-8", "hq-meet-9", "hq-meet-10"] as const;
export const ALL_IDS: string[] = WORLD_ROSTER.map((r) => r.code);
/** Re-plan the summon formation when the founder has moved this far from where it was planned. */
export const REFORM_DISTANCE = 5.5;

export interface DirectiveRec { kind: DirKind; version: number; target: { x: number; y: number; z: number } | null; spotId: string | null; label: string }
export interface CommandState {
  selection: string[]; directives: Record<string, DirectiveRec>; version: number; meeting: boolean;
  formation: { center: P2; yaw: number; slots: P2[]; assign: Record<string, number> } | null;
}
export const initialCommand = (): CommandState => ({ selection: [], directives: {}, version: 0, meeting: false, formation: null });

export interface CommandEnv {
  player: { x: number; y: number; z: number; yaw: number };
  agents: { id: string; x: number; z: number }[];
  /** can an agent stand and reach this point on the founder's level? */
  valid: (x: number, z: number) => boolean;
}
export type CommandAction =
  | { type: "SELECT_TOGGLE"; id: string } | { type: "SELECT_ONLY"; id: string } | { type: "SELECT_ALL" } | { type: "SELECT_NONE" } | { type: "SELECT_GROUP"; group: GroupId } | { type: "SELECT_SET"; ids: string[] }
  | { type: "SUMMON"; ids: string[] } | { type: "SUMMON_ALL" } | { type: "SUMMON_SELECTED" }
  | { type: "DISMISS_ALL" } | { type: "RETURN_TO_WORK"; ids: string[] } | { type: "RETURN_SELECTED" }
  | { type: "GO_WORKSPACE"; ids: string[] }
  | { type: "CALL_MEETING"; ids: string[] } | { type: "CALL_ALL" } | { type: "CALL_SELECTED" }
  | { type: "REFORM" };

const known = new Set(ALL_IDS), valid = (ids: string[]) => [...new Set(ids)].filter((i) => known.has(i));
const order = (ids: string[]) => ALL_IDS.filter((i) => ids.includes(i));

export function groupMembers(g: GroupId): string[] { return WORLD_ROSTER.filter((r) => r.group === g).map((r) => r.code); }
export const groupLabel = (g: GroupId) => GROUPS.find((x) => x.id === g)?.label ?? g;

/** Re-plan the whole summon formation (slots are sticky: nobody swaps places unless they must). */
function plan(s: CommandState, env: CommandEnv, ids: string[]): CommandState {
  const summoned = order(ids); if (!summoned.length) return { ...s, formation: null };
  const center = { x: env.player.x, z: env.player.z }, slots = allocateFormation(center, env.player.yaw, summoned.length, env.valid);
  const pos = (id: string) => env.agents.find((a) => a.id === id) ?? { id, x: center.x, z: center.z };
  const assign = assignSlots(summoned.map(pos), slots, s.formation?.assign ?? {});
  const version = s.version + 1, directives = { ...s.directives };
  for (const id of summoned) { const sl = slots[assign[id]]; directives[id] = { kind: "SUMMON", version, target: { x: sl.x, y: env.player.y, z: sl.z }, spotId: null, label: "COMING TO FOUNDER" }; }
  return { ...s, directives, version, formation: { center, yaw: env.player.yaw, slots, assign } };
}
const summoning = (s: CommandState) => Object.keys(s.directives).filter((i) => s.directives[i].kind === "SUMMON");

export function reduceCommand(s: CommandState, a: CommandAction, env: CommandEnv): CommandState {
  switch (a.type) {
    case "SELECT_TOGGLE": return known.has(a.id) ? { ...s, selection: s.selection.includes(a.id) ? s.selection.filter((i) => i !== a.id) : order([...s.selection, a.id]) } : s;
    case "SELECT_ONLY": return known.has(a.id) ? { ...s, selection: [a.id] } : s;
    case "SELECT_ALL": return { ...s, selection: [...ALL_IDS] };
    case "SELECT_NONE": return { ...s, selection: [] };
    case "SELECT_GROUP": return { ...s, selection: groupMembers(a.group) };
    case "SELECT_SET": return { ...s, selection: order(valid(a.ids)) };
    case "SUMMON": case "SUMMON_ALL": case "SUMMON_SELECTED": {
      const ids = a.type === "SUMMON_ALL" ? ALL_IDS : a.type === "SUMMON_SELECTED" ? s.selection : valid(a.ids); if (!ids.length) return s;
      const directives = { ...s.directives }; let meeting = s.meeting; for (const id of ids) if (directives[id]?.kind === "MEETING") delete directives[id];
      if (!Object.values(directives).some((d) => d.kind === "MEETING")) meeting = false;
      return plan({ ...s, directives, meeting }, env, [...summoning(s), ...ids]);
    }
    case "REFORM": {
      const f = s.formation, ids = summoning(s); if (!f || !ids.length) return s;
      return dist2(f.center, env.player) > REFORM_DISTANCE ? plan(s, env, ids) : s;
    }
    case "DISMISS_ALL": return { ...s, directives: {}, formation: null, meeting: false, version: s.version + 1 };
    case "RETURN_TO_WORK": case "RETURN_SELECTED": {
      const ids = a.type === "RETURN_SELECTED" ? s.selection : valid(a.ids); if (!ids.length) return s;
      const directives = { ...s.directives }; for (const id of ids) delete directives[id];
      const left = Object.values(directives); const formation = left.some((d) => d.kind === "SUMMON") ? s.formation : null;
      return { ...s, directives, formation, meeting: left.some((d) => d.kind === "MEETING"), version: s.version + 1 };
    }
    case "GO_WORKSPACE": {
      const ids = valid(a.ids); if (!ids.length) return s; const version = s.version + 1, directives = { ...s.directives };
      for (const id of ids) { const r = WORLD_ROSTER.find((x) => x.code === id)!; directives[id] = { kind: "WORKSPACE", version, target: null, spotId: r.workspace, label: "GOING TO WORKSPACE" }; }
      const left = Object.values(directives); return { ...s, directives, version, formation: left.some((d) => d.kind === "SUMMON") ? s.formation : null, meeting: left.some((d) => d.kind === "MEETING") };
    }
    case "CALL_MEETING": case "CALL_ALL": case "CALL_SELECTED": {
      const ids = order(a.type === "CALL_ALL" ? ALL_IDS : a.type === "CALL_SELECTED" ? s.selection : valid(a.ids)); if (!ids.length) return s;
      const version = s.version + 1, directives = { ...s.directives }; const taken = new Set(Object.values(directives).filter((d) => d.kind === "MEETING" && !ids.includes(Object.keys(directives).find((k) => directives[k] === d)!)).map((d) => d.spotId));
      const free = MEETING_SLOTS.filter((m) => !taken.has(m)); ids.forEach((id, i) => { directives[id] = { kind: "MEETING", version, target: null, spotId: free[i % free.length], label: "GOING TO MEETING" }; });
      const left = Object.values(directives); return { ...s, directives, version, meeting: true, formation: left.some((d) => d.kind === "SUMMON") ? s.formation : null };
    }
  }
}
/** Agents whose directive disappeared between two states (they must resume normal behaviour, by walking). */
export const releasedIds = (prev: CommandState, next: CommandState) => Object.keys(prev.directives).filter((i) => !next.directives[i]);
