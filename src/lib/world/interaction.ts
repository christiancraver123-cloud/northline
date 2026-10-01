// Interaction eligibility — pure. "Walk up and interact": close enough, on foot (or hovering low), in the player view, agent not hidden.
import type { PlayerState, View } from "./player";

export const INTERACT_RANGE = 3.2, INTERACT_MAX_ALTITUDE = 2.6;
export interface InteractTarget { id: string; x: number; y: number; z: number }
export type Eligibility = { ok: true; distance: number } | { ok: false; reason: "overview" | "follow" | "too_far" | "too_high" | "panel_open"; distance: number };

export function canInteract(p: PlayerState, target: InteractTarget, view: View, panelOpen = false): Eligibility {
  const distance = Math.hypot(p.x - target.x, p.z - target.z);
  if (panelOpen) return { ok: false, reason: "panel_open", distance };
  if (view === "OVERVIEW" || view === "FOCUS") return { ok: false, reason: "overview", distance };
  if (view === "FOLLOW") return { ok: false, reason: "follow", distance };
  if (p.y - target.y > INTERACT_MAX_ALTITUDE) return { ok: false, reason: "too_high", distance };
  if (distance > INTERACT_RANGE) return { ok: false, reason: "too_far", distance };
  return { ok: true, distance };
}
/** The prompt text shown near the agent. */
export const promptFor = (e: Eligibility, name: string) =>
  e.ok ? `Interact with ${name}` : e.reason === "too_high" ? `Descend to talk to ${name}` : e.reason === "too_far" && e.distance < 9 ? `Move closer to ${name}` : null;
/** Which interactable is nearest and eligible (generalises to several agents later). */
export function nearestEligible(p: PlayerState, targets: InteractTarget[], view: View, panelOpen = false) {
  let best: { id: string; distance: number } | null = null;
  for (const t of targets) { const e = canInteract(p, t, view, panelOpen); if (e.ok && (!best || e.distance < best.distance)) best = { id: t.id, distance: e.distance }; }
  return best;
}
