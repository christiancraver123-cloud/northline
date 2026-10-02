// Quick command wheel (Q): eight one-tap founder actions. Radial on desktop, same buttons on mobile; number keys 1–8 select while it is open.
import type { UiCommand } from "./input";
export interface WheelItem { n: number; label: string; hint: string; cmd: UiCommand }
export const WHEEL_ITEMS: WheelItem[] = [
  { n: 1, label: "SUMMON ALL", hint: "G", cmd: { type: "COMMAND", action: { type: "SUMMON_ALL" } } },
  { n: 2, label: "COMMAND CENTER", hint: "travel", cmd: { type: "TRAVEL", id: "command-center" } },
  { n: 3, label: "OVERVIEW", hint: "Tab", cmd: { type: "OVERVIEW" } },
  { n: 4, label: "AGENTS", hint: "C", cmd: { type: "OPEN_COMMAND" } },
  { n: 5, label: "HQ", hint: "travel", cmd: { type: "TRAVEL", id: "hq" } },
  { n: 6, label: "FLY", hint: "F", cmd: { type: "FLY" } },
  { n: 7, label: "TURBO", hint: "⇧⇧", cmd: { type: "TURBO" } },
  { n: 8, label: "RETURN HOME", hint: "travel", cmd: { type: "TRAVEL", id: "home" } },
];
