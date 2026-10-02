// Agent nameplate logic: how much to show at a given distance, and status wording that never relies on colour alone. Pure.
import type { OpState } from "./agent-ai";

export type LabelLevel = "FULL" | "NAME" | "MARKER" | "HIDDEN";
export const LABEL_DIST = { full: 10, name: 30 } as const;
/** FULL = [glyph code] NAME / ROLE / STATUS · NAME = [glyph code] NAME · MARKER = glyph + status symbol only · HIDDEN. */
export function labelLevel(distance: number, o: { selected: boolean; overview: boolean; maxDist: number; commanded?: boolean }): LabelLevel {
  if (o.overview) return o.selected ? "FULL" : distance > 95 ? "MARKER" : "NAME";
  if (o.selected && distance < 45) return "FULL";
  if (distance <= LABEL_DIST.full) return "FULL";
  if (distance <= LABEL_DIST.name || (o.commanded && distance <= LABEL_DIST.name * 1.6)) return "NAME";
  if (distance <= o.maxDist) return "MARKER";
  return "HIDDEN";
}

export type StatusCode = OpState | "SUMMONED" | "AT_FOUNDER" | "TO_MEETING" | "MEETING" | "IN_MEETING" | "TO_WORKSPACE";
export interface StatusMeta { code: StatusCode; symbol: string; word: string; /** border pattern so status reads without colour */ pattern: "solid" | "dashed" | "double" | "dotted" | "none" }
export const STATUS_META: Record<StatusCode, StatusMeta> = {
  WORKING: { code: "WORKING", symbol: "▶", word: "WORKING", pattern: "solid" },
  WAITING: { code: "WAITING", symbol: "◔", word: "WAITING", pattern: "dashed" },
  BLOCKED: { code: "BLOCKED", symbol: "⊘", word: "BLOCKED", pattern: "double" },
  FAILED: { code: "FAILED", symbol: "✕", word: "FAILED", pattern: "dotted" },
  IDLE: { code: "IDLE", symbol: "○", word: "IDLE", pattern: "none" },
  PAUSED: { code: "PAUSED", symbol: "❚❚", word: "PAUSED", pattern: "dashed" },
  SUMMONED: { code: "SUMMONED", symbol: "➜", word: "COMING TO FOUNDER", pattern: "solid" },
  AT_FOUNDER: { code: "AT_FOUNDER", symbol: "◎", word: "AT FOUNDER", pattern: "solid" },
  TO_MEETING: { code: "TO_MEETING", symbol: "⇢", word: "GOING TO MEETING", pattern: "solid" },
  MEETING: { code: "MEETING", symbol: "▣", word: "MEETING — WAITING FOR FOUNDER", pattern: "dashed" },
  IN_MEETING: { code: "IN_MEETING", symbol: "▣", word: "IN MEETING", pattern: "solid" },
  TO_WORKSPACE: { code: "TO_WORKSPACE", symbol: "⌂", word: "GOING TO WORKSPACE", pattern: "solid" },
};
export type DirKind = "SUMMON" | "MEETING" | "WORKSPACE";
/** The status shown on nameplates/panels: a founder command (SIMULATED) takes precedence over the simulated task status. */
export function displayStatus(op: OpState, d: { kind: DirKind; arrived: boolean } | null, founderInMeeting = false): StatusMeta {
  if (!d) return STATUS_META[op];
  if (d.kind === "SUMMON") return STATUS_META[d.arrived ? "AT_FOUNDER" : "SUMMONED"];
  if (d.kind === "MEETING") return STATUS_META[!d.arrived ? "TO_MEETING" : founderInMeeting ? "IN_MEETING" : "MEETING"];
  return d.arrived ? STATUS_META.WORKING : STATUS_META.TO_WORKSPACE;
}
/** Operators scan for trouble first: blocked/failed/waiting sort to the top of lists. */
export const STATUS_PRIORITY: Record<string, number> = { BLOCKED: 0, FAILED: 1, WAITING: 2, WORKING: 3, PAUSED: 4, IDLE: 5 };
