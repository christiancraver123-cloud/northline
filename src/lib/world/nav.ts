// Navigation on the hand-placed waypoint graph: A* + helpers. Pure. Agents follow these edges, so they never cross buildings or water
// (verified by tests against the real layout).
import { dist2, type V2 } from "./math";
import { NAV_EDGES, NAV_NODES, nodeOf, type NavNode } from "./layout";

export interface NavGraph { nodes: Map<string, NavNode>; adj: Map<string, { to: string; cost: number }[]> }
export function buildGraph(nodes: NavNode[] = NAV_NODES, edges = NAV_EDGES): NavGraph {
  const m = new Map(nodes.map((n) => [n.id, n])), adj = new Map<string, { to: string; cost: number }[]>(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    const a = m.get(e.a), b = m.get(e.b);
    if (!a || !b) throw new Error(`edge references an unknown node: ${e.a} - ${e.b}`);
    const d = dist2(a, b);
    adj.get(a.id)!.push({ to: b.id, cost: d }); adj.get(b.id)!.push({ to: a.id, cost: d });
  }
  return { nodes: m, adj };
}
export const GRAPH = buildGraph();

export function nearestNode(p: V2, g: NavGraph = GRAPH): NavNode {
  let best: NavNode | null = null, bd = Infinity;
  for (const n of g.nodes.values()) { const d = dist2(p, n); if (d < bd) { bd = d; best = n; } }
  return best!;
}

/** A* over the graph. Edge costs are metres; `terrainCost(a,b)` can add a multiplier (e.g. sand ×1.3). Returns node ids, or null if unreachable. */
export function findPath(g: NavGraph, from: string, to: string, terrainCost: (a: NavNode, b: NavNode) => number = () => 1): string[] | null {
  if (!g.nodes.has(from) || !g.nodes.has(to)) return null;
  if (from === to) return [from];
  const goal = g.nodes.get(to)!, open = new Set<string>([from]), came = new Map<string, string>(), gScore = new Map<string, number>([[from, 0]]);
  const h = (id: string) => dist2(g.nodes.get(id)!, goal);
  const f = new Map<string, number>([[from, h(from)]]);
  while (open.size) {
    let cur = "", best = Infinity;
    for (const id of open) { const v = f.get(id) ?? Infinity; if (v < best) { best = v; cur = id; } }
    if (cur === to) { const path = [cur]; while (came.has(cur)) { cur = came.get(cur)!; path.unshift(cur); } return path; }
    open.delete(cur);
    for (const { to: nb, cost } of g.adj.get(cur)!) {
      const t = (gScore.get(cur) ?? Infinity) + cost * terrainCost(g.nodes.get(cur)!, g.nodes.get(nb)!);
      if (t < (gScore.get(nb) ?? Infinity)) { came.set(nb, cur); gScore.set(nb, t); f.set(nb, t + h(nb)); open.add(nb); }
    }
  }
  return null;
}
/** Sand is slower and the boardwalk is preferred, so routes look intentional rather than shortest-possible. */
export const walkingCost = (a: NavNode, b: NavNode) => (a.z > 21 || b.z > 21 ? 1.3 : (a.z > 15 && a.z < 20 && b.z > 15 && b.z < 20 ? 0.85 : 1));
export const pathPoints = (ids: string[]): V2[] => ids.map((id) => { const n = nodeOf(id); return { x: n.x, z: n.z }; });
export const pathLength = (pts: V2[]) => pts.reduce((s, p, i) => (i ? s + dist2(pts[i - 1], p) : 0), 0);
