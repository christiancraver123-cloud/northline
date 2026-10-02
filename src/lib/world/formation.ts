// Formation planning for SUMMON: where the agents stand around the founder. Pure geometry + a world-validity callback, so it is testable without WebGL.
// The founder's camera looks along `yaw`; the formation is a "stage" in front of (and beside) the player so every nameplate is readable from the chase camera.
import { WATER_BLOCK_DEPTH, resolveCollisions, supportHeight } from "./layout";
import { clearEdge, getGraph, nearestNode } from "./nav";
import { dist2 } from "./math";

export interface P2 { x: number; z: number }
export interface Slot extends P2 { fallback: boolean }
/** (forward, right) offsets in metres, in priority order — front rows first, then the flanks; 12 entries so up to two can be rejected and replaced. */
export const SLOT_TEMPLATE: [number, number][] = [
  [3.2, -1.15], [3.2, 1.15], [3.4, -3.4], [3.4, 3.4], [5.6, 0], [5.5, -2.4], [5.5, 2.4], [0.4, -3.9], [0.4, 3.9], [5.7, -4.9], [5.7, 4.9], [7.9, 0],
];
const fwd = (yaw: number): P2 => ({ x: Math.sin(yaw), z: Math.cos(yaw) }), right = (yaw: number): P2 => ({ x: -Math.cos(yaw), z: Math.sin(yaw) });
export const slotAt = (c: P2, yaw: number, f: number, r: number): P2 => { const a = fwd(yaw), b = right(yaw); return { x: c.x + a.x * f + b.x * r, z: c.z + a.z * f + b.z * r }; };

/** Returns exactly `count` slots. Valid template slots first; then a spiral search for the nearest valid points (spacing relaxed 1.7 → 1.3 → 1.0); only if the world offers nothing do we return `fallback` slots on the centre (callers then route to the nearest nav node). */
export function allocateFormation(center: P2, yaw: number, count: number, valid: (x: number, z: number) => boolean, spacing = 1.7): Slot[] {
  const out: Slot[] = [], ok = (p: P2, sp: number) => out.every((q) => dist2(p, q) >= sp) && dist2(p, center) >= 1.6;
  for (const [f, r] of SLOT_TEMPLATE) { if (out.length >= count) break; const p = slotAt(center, yaw, f, r); if (valid(p.x, p.z) && ok(p, spacing)) out.push({ ...p, fallback: false }); }
  for (const sp of [spacing, 1.3, 1.0]) {
    for (const rad of [2.6, 3.4, 4.2, 5, 6, 7, 8.5, 10, 12, 15]) {
      for (let k = 0; k < 28 && out.length < count; k++) {
        const ang = yaw + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 14), p = { x: center.x + Math.sin(ang) * rad, z: center.z + Math.cos(ang) * rad };
        if (valid(p.x, p.z) && ok(p, sp)) out.push({ ...p, fallback: false });
      }
      if (out.length >= count) break;
    }
    if (out.length >= count) break;
  }
  while (out.length < count) out.push({ x: center.x, z: center.z, fallback: true });
  return out;
}

/** Assign agents to slots. Agents that already hold a slot keep it (no shuffling when the formation is re-planned); the rest take the nearest free slot. Returns id → slot index. */
export function assignSlots(agents: { id: string; x: number; z: number }[], slots: P2[], prev: Record<string, number> = {}): Record<string, number> {
  const out: Record<string, number> = {}, used = new Set<number>(), left: typeof agents = [];
  for (const a of agents) { const k = prev[a.id]; if (k !== undefined && k < slots.length && !used.has(k)) { out[a.id] = k; used.add(k); } else left.push(a); }
  for (let si = 0; si < slots.length && left.length; si++) {
    if (used.has(si)) continue; let bi = 0, bd = Infinity; left.forEach((a, i) => { const d = dist2(a, slots[si]); if (d < bd) { bd = d; bi = i; } });
    out[left[bi].id] = si; used.add(si); left.splice(bi, 1);
  }
  for (const a of left) { let k = 0; while (used.has(k)) k++; out[a.id] = k; used.add(k); }
  return out;
}

/** Is (x, z) a place an agent can really stand and reach, at the founder's level? Not water, not inside furniture/walls, on the same floor, and connected to the walking graph. */
export function standable(x: number, z: number, refY: number): boolean {
  const y = supportHeight(x, z, refY, 0.6); if (y < WATER_BLOCK_DEPTH + 0.1 || Math.abs(y - refY) > 1.0) return false;
  const r = resolveCollisions({ x, z }, 0.5, y, 1.7); if (Math.hypot(r.x - x, r.z - z) > 0.05) return false;
  const g = getGraph(), n = nearestNode({ x, z, y }, g, true); return Math.abs(n.y - y) < 1.4 && (dist2(n, { x, z }) < 0.8 || (dist2(n, { x, z }) < 3.2 && clearEdge({ x, z, y }, n)));
}
