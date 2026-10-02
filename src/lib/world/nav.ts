// Navigation over the whole town: a visibility graph built automatically from the REAL colliders and walkable surfaces (so agents can never be routed
// through walls, water or furniture), A* with a binary heap, and string-pulling path smoothing. Multi-level (stairs are chains of nodes along the ramp).
import { clamp, dist2, type V2 } from "./math";
import { COLLIDERS, SPOTS, TOWN, resolveCollisions, supportHeight, WATER_BLOCK_DEPTH } from "./layout";

export interface NavNode { id: string; x: number; z: number; y: number; manual: boolean; /** a seat (chair/sofa/lounger): the furniture itself is allowed within SEAT_REACH of it */ seat?: boolean }
export interface NavPoint { x: number; z: number; y: number; seat?: boolean }
export const SEAT_REACH = 1.5;
export interface NavGraph { nodes: Map<string, NavNode>; adj: Map<string, { to: string; cost: number }[]> }
export const NAV_RADIUS = 0.42;

/** Is walking a body of NAV_RADIUS from a to b possible? Continuous floor height, no water, no solid in the way, and it ends where b says it should. */
export function whyNot(a: NavPoint, b: NavPoint, r = NAV_RADIUS, maxStepH = 0.55): string | null {
  const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(d / 0.4)); let prevY = a.y;
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, yExpect = a.y + (b.y - a.y) * t;
    const h = supportHeight(x, z, prevY);
    if (h < WATER_BLOCK_DEPTH + 0.3) return `water@${x.toFixed(1)},${z.toFixed(1)}`; if (Math.abs(h - prevY) > maxStepH || Math.abs(h - yExpect) > 0.7) return `height ${h.toFixed(2)} vs ${prevY.toFixed(2)}/${yExpect.toFixed(2)}@${x.toFixed(1)},${z.toFixed(1)}`;
    const nearSeat = (a.seat && Math.hypot(x - a.x, z - a.z) < SEAT_REACH) || (b.seat && Math.hypot(x - b.x, z - b.z) < SEAT_REACH);
    if (!nearSeat) { const q = resolveCollisions({ x, z }, r, h, 1.7); if (Math.hypot(q.x - x, q.z - z) > 0.03) return `solid@${x.toFixed(1)},${z.toFixed(1)},y${h.toFixed(2)}`; }
    prevY = h;
  }
  return Math.abs(prevY - b.y) < 0.35 ? null : `end height ${prevY.toFixed(2)} != ${b.y.toFixed(2)}`;
}
export const clearEdge = (a: NavPoint, b: NavPoint, r = NAV_RADIUS, maxStepH = 0.55) => whyNot(a, b, r, maxStepH) === null;

class Heap { private a: [number, string][] = []; get size() { return this.a.length; } push(p: number, v: string) { const a = this.a; a.push([p, v]); let i = a.length - 1; while (i > 0) { const j = (i - 1) >> 1; if (a[j][0] <= a[i][0]) break; [a[i], a[j]] = [a[j], a[i]]; i = j; } } pop(): string { const a = this.a, top = a[0][1], last = a.pop()!; if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[i], a[m]] = [a[m], a[i]]; i = m; } } return top; } }

let cached: NavGraph | null = null;
export function buildGraph(): NavGraph {
  const nodes = new Map<string, NavNode>(), adj = new Map<string, { to: string; cost: number }[]>();
  const add = (n: NavNode) => { nodes.set(n.id, n); adj.set(n.id, []); };
  const link = (a: NavNode, b: NavNode) => { const c = dist2(a, b) + Math.abs(a.y - b.y) * 1.5; adj.get(a.id)!.push({ to: b.id, cost: c }); adj.get(b.id)!.push({ to: a.id, cost: c }); };
  // 1) outdoor grid at ground level (terrain, boardwalk, decks)
  const STEP = 4, gx0 = -104, gx1 = 104, gz0 = -56, gz1 = 72;
  for (let x = gx0; x <= gx1; x += STEP) for (let z = gz0; z <= gz1; z += STEP) {
    const y = supportHeight(x, z, 1.2); if (y < 0.0 || y > 12) continue;
    const q = resolveCollisions({ x, z }, 0.7, y, 1.7); if (Math.hypot(q.x - x, q.z - z) > 0.02) continue;
    add({ id: `g${x}_${z}`, x, z, y, manual: false });
  }
  const g = (x: number, z: number) => nodes.get(`g${x}_${z}`);
  for (let x = gx0; x <= gx1; x += STEP) for (let z = gz0; z <= gz1; z += STEP) { const a = g(x, z); if (!a) continue; for (const [dx, dz] of [[STEP, 0], [0, STEP], [STEP, STEP], [STEP, -STEP]]) { const b = g(x + dx, z + dz); if (b && clearEdge(a, b)) link(a, b); } }
  // 2) manual nodes: every spot + doorway/stair/room waypoints
  const manual: NavNode[] = [];
  for (const s of SPOTS) manual.push({ id: s.id, x: s.x, z: s.z, y: Number.isNaN(s.y) ? supportHeight(s.x, s.z, 1.2) : s.y, manual: true, seat: s.kind === "sit" || s.kind === "work-sit" });
  for (const n of TOWN.kit.extraNodes) manual.push({ id: n.id, x: n.x, z: n.z, y: Number.isNaN(n.y) ? supportHeight(n.x, n.z, 1.2) : n.y, manual: true });
  for (const m of manual) { if (nodes.has(m.id)) throw new Error(`duplicate nav node ${m.id}`); add(m); }
  const all = [...nodes.values()];
  const failed: string[] = [];
  for (const m of manual) {
    for (const o of all) { if (o.id === m.id || Math.abs(o.y - m.y) > 1.4) continue; const d = dist2(m, o); if (d > (o.manual ? 12 : 9) || (adj.get(m.id)!.some((e) => e.to === o.id))) continue; if (clearEdge(m, o) && clearEdge(o, m)) { link(m, o); } }
  }
  for (const m of manual) if (!adj.get(m.id)!.length) failed.push(`${m.id}(${m.x},${m.z},${m.y.toFixed(2)})`);
  if (failed.length) throw new Error(`manual nav nodes not connected to anything: ${failed.join(" ")}`);
  // keep only the component reachable from the HQ front door: isolated grid fragments (e.g. a pocket fenced by props) are dropped; manual nodes must all survive
  const seen = new Set<string>(), stack = ["hq-door-out"]; while (stack.length) { const c = stack.pop()!; if (seen.has(c)) continue; seen.add(c); for (const e of adj.get(c) ?? []) stack.push(e.to); }
  const lost = manual.filter((m) => !seen.has(m.id)).map((m) => m.id); if (lost.length) throw new Error(`manual nav nodes not reachable from the HQ door: ${lost.join(" ")}`);
  for (const id of [...nodes.keys()]) if (!seen.has(id)) { nodes.delete(id); adj.delete(id); } for (const [id, es] of adj) adj.set(id, es.filter((e) => seen.has(e.to)));
  return { nodes, adj };
}
export const getGraph = () => (cached ??= buildGraph());

export function nearestNode(p: NavPoint, g: NavGraph = getGraph(), needClear = true): NavNode {
  let best: NavNode | null = null, bd = Infinity;
  for (const n of g.nodes.values()) { if (Math.abs(n.y - p.y) > 1.6) continue; const d = dist2(p, n); if (d < bd && (!needClear || d < 1 || clearEdge(p, n))) { bd = d; best = n; } }
  if (!best && needClear) return nearestNode(p, g, false);
  return best ?? [...g.nodes.values()][0];
}

/** A* over the graph. Returns node ids or null. */
export function findPath(g: NavGraph, from: string, to: string): string[] | null {
  if (!g.nodes.has(from) || !g.nodes.has(to)) return null; if (from === to) return [from];
  const goal = g.nodes.get(to)!, came = new Map<string, string>(), gs = new Map<string, number>([[from, 0]]), open = new Heap(), done = new Set<string>();
  open.push(dist2(g.nodes.get(from)!, goal), from);
  while (open.size) {
    const cur = open.pop(); if (done.has(cur)) continue; done.add(cur);
    if (cur === to) { const path = [cur]; let c = cur; while (came.has(c)) { c = came.get(c)!; path.unshift(c); } return path; }
    for (const { to: nb, cost } of g.adj.get(cur)!) { const t = gs.get(cur)! + cost; if (t < (gs.get(nb) ?? Infinity)) { came.set(nb, cur); gs.set(nb, t); open.push(t + dist2(g.nodes.get(nb)!, goal), nb); } }
  }
  return null;
}
/** Remove intermediate waypoints that are directly walkable (string pulling), so routes look natural instead of grid-like. */
export function smoothPath(pts: NavPoint[]): NavPoint[] {
  if (pts.length <= 2) return pts; const out = [pts[0]]; let i = 0;
  while (i < pts.length - 1) { let j = pts.length - 1; while (j > i + 1 && !clearEdge(pts[i], pts[j], NAV_RADIUS + 0.12)) j--; out.push(pts[j]); i = j; }
  return out;
}
/** Route for an agent standing at `from` to a named nav node/spot. Returns points (first = start). */
export function routeTo(from: NavPoint, toId: string, g: NavGraph = getGraph()): NavPoint[] | null {
  const start = nearestNode(from, g), ids = findPath(g, start.id, toId); if (!ids) return null;
  const pts: NavPoint[] = [{ ...from }, ...ids.map((id) => { const n = g.nodes.get(id)!; return { x: n.x, z: n.z, y: n.y, seat: n.seat }; })];
  return smoothPath(pts);
}
export const pathLength = (pts: V2[]) => pts.reduce((s, p, i) => (i ? s + dist2(pts[i - 1], p) : 0), 0);
export const nodeOf = (id: string) => { const n = getGraph().nodes.get(id); if (!n) throw new Error(`unknown nav node ${id}`); return n; };
export { clamp, COLLIDERS };
