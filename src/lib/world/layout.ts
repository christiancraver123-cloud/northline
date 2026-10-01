// The POC's one coastal slice, as DATA. The same layout feeds rendering, collision, ground height and navigation, so art can change
// without touching logic. Coordinates: metres; +x east, +z toward the OCEAN (south), +y up. Sea level y = 0. Yaw 0 faces +z.
import { clamp, dist2, lerp, noise2, rng, smoothstep, type V2 } from "./math";

export const BOUNDS = { minX: -64, maxX: 64, minZ: -44, maxZ: 40 } as const;           // walkable region (soft edge); flying may exceed it
export const WATER_BLOCK_DEPTH = -0.45;                                                  // wading limit
export const ROAD = { z0: -9, z1: -3, h: 0.5 } as const;
export const BOARDWALK = { z0: 15.8, z1: 19.2, h: 0.78 } as const;
export const PLAZA = { x0: -22, x1: 14, z0: -17.8, z1: -9, h: 0.58 } as const;          // paved forecourt in front of the building

export interface Circle { kind: "circle"; x: number; z: number; r: number; top: number; tag: string }
export interface Box { kind: "box"; minX: number; maxX: number; minZ: number; maxZ: number; top: number; tag: string }
export type Collider = Circle | Box;

/** Building footprint (Northline Studio). Entrance faces the road/plaza (−z side is the back). */
export const BUILDING = { minX: -18, maxX: 6, minZ: -31, maxZ: -18.5, top: 9.2, entrance: { x: -6, z: -17.2 } } as const;
export const DESK = { x: -14, z: -14.9 } as const;            // pergola workstation (the simulated task location)
export const WORK_SPOT: V2 = { x: -14, z: -13.3 };             // where the agent stands to work (faces the desk, yaw π... toward −z)

/** Shoreline z at a given x (where the beach meets water, h = 0). */
export const shoreZ = (x: number) => 30.5 + 2.2 * Math.sin(x * 0.06 + 0.7) + 1.1 * Math.sin(x * 0.17);

/** Natural (un-built) terrain height. */
export function naturalHeight(x: number, z: number): number {
  const dune = (noise2(x * 0.09, z * 0.09) - 0.5) * 0.5 + (noise2(x * 0.3, z * 0.3) - 0.5) * 0.12;
  const sz = shoreZ(x);
  if (z > 12) { // promenade → beach slope → seabed
    const beach = smoothstep(12, sz + 2, z);
    const sea = Math.max(0, z - (sz + 2));
    return lerp(0.62, 0.0, beach) + dune * (1 - beach * 0.4) * smoothstep(12, 22, z) * 0.7 - sea * 0.16 - Math.pow(sea / 28, 2) * 2.5;
  }
  if (z < -40) { // backdrop hills rising behind the studio
    const k = (-40 - z) / 55;
    return 0.6 + 16 * Math.pow(clamp(k, 0, 1), 1.6) + (noise2(x * 0.03, z * 0.05) - 0.4) * 5 * k + (Math.abs(x) > 40 ? (Math.abs(x) - 40) * 0.1 * k : 0);
  }
  return 0.6 + dune * 0.35 * smoothstep(-40, -20, z) * 0.4;
}

const inRect = (x: number, z: number, x0: number, x1: number, z0: number, z1: number, soft: number) =>
  smoothstep(x0 - soft, x0, x) * smoothstep(x1 + soft, x1, x) * smoothstep(z0 - soft, z0, z) * smoothstep(z1 + soft, z1, z);

/** The height a walking operator/agent stands at: terrain blended into built surfaces (road, boardwalk, plaza) with soft ramps (no steps). */
export function groundHeight(x: number, z: number): number {
  let h = naturalHeight(x, z);
  h = lerp(h, ROAD.h, inRect(x, z, -200, 200, ROAD.z0, ROAD.z1, 0.8));
  h = lerp(h, BOARDWALK.h, inRect(x, z, -58, 58, BOARDWALK.z0, BOARDWALK.z1, 0.9));
  h = lerp(h, PLAZA.h, inRect(x, z, PLAZA.x0, PLAZA.x1, PLAZA.z0, PLAZA.z1, 1.2));
  return h;
}
export const isWater = (x: number, z: number) => groundHeight(x, z) < WATER_BLOCK_DEPTH;
export const inBounds = (p: V2) => p.x >= BOUNDS.minX && p.x <= BOUNDS.maxX && p.z >= BOUNDS.minZ && p.z <= BOUNDS.maxZ;

// ---- navigation nodes (hand-placed on roads / promenade / boardwalk / plaza) ----------------------------------------------------
export interface NavNode { id: string; x: number; z: number }
export interface NavEdge { a: string; b: string }
const X = [-46, -38, -30, -22, -14, -6, 2, 10, 18, 26, 34, 42];
const ROWS = { A: -11.2, R: -6, B: -0.8, C: 8, D: 17.5, E: 23.5 } as const;
const rowNodes = (row: keyof typeof ROWS, xs: number[]): NavNode[] => xs.map((x) => ({ id: `${row}${x}`, x, z: ROWS[row] }));
const NODES: NavNode[] = [
  ...rowNodes("A", [-14, -6, 2, 10]), ...rowNodes("R", X), ...rowNodes("B", X), ...rowNodes("C", X), ...rowNodes("D", X), ...rowNodes("E", [-30, -22, -14, -6, 2, 10, 18, 26]),
  { id: "ENTRANCE", x: BUILDING.entrance.x, z: BUILDING.entrance.z - 0.6 }, { id: "WORK", ...WORK_SPOT },
];
const link = (a: string, b: string): NavEdge => ({ a, b });
function buildEdges(): NavEdge[] {
  const e: NavEdge[] = [];
  const row = (r: string, xs: number[]) => { for (let i = 0; i + 1 < xs.length; i++) e.push(link(`${r}${xs[i]}`, `${r}${xs[i + 1]}`)); };
  row("A", [-14, -6, 2, 10]); row("R", X); row("B", X); row("C", X); row("D", X); row("E", [-30, -22, -14, -6, 2, 10, 18, 26]);
  for (const x of [-14, -6, 2, 10]) e.push(link(`A${x}`, `R${x}`));
  for (const x of X) { e.push(link(`R${x}`, `B${x}`), link(`B${x}`, `C${x}`), link(`C${x}`, `D${x}`)); }
  for (const x of [-30, -22, -14, -6, 2, 10, 18, 26]) e.push(link(`D${x}`, `E${x}`));
  e.push(link("ENTRANCE", "A-6"), link("WORK", "A-14"));
  return e;
}
export const NAV_NODES = NODES;
export const NAV_EDGES = buildEdges();

/** Places the agent may idle at (cosmetic). `face` = the yaw to stand facing. */
export interface IdleSpot { id: string; node: string; face: number; label: string; weight: number }
export const IDLE_SPOTS: IdleSpot[] = [
  { id: "rail-west", node: "D-22", face: 0, label: "looking out at the ocean", weight: 3 },
  { id: "rail-mid", node: "D2", face: 0, label: "looking out at the ocean", weight: 3 },
  { id: "rail-east", node: "D26", face: 0, label: "looking out at the ocean", weight: 2 },
  { id: "beach-edge", node: "E-6", face: 0, label: "standing by the water", weight: 2 },
  { id: "beach-east", node: "E18", face: 0.4, label: "standing by the water", weight: 1.2 },
  { id: "promenade", node: "C-14", face: Math.PI, label: "pausing on the promenade", weight: 1.5 },
  { id: "plaza", node: "A10", face: Math.PI * 0.5, label: "pausing in the plaza", weight: 1.5 },
  { id: "studio", node: "ENTRANCE", face: 0, label: "waiting by the studio entrance", weight: 1.5 },
];

// ---- scenery (deterministic; kept clear of navigation lines) --------------------------------------------------------------
function distToSegment(p: V2, a: V2, b: V2) {
  const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
  const t = l2 ? clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / l2, 0, 1) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
}
const nodeById = new Map(NAV_NODES.map((n) => [n.id, n]));
export const nodeOf = (id: string) => { const n = nodeById.get(id); if (!n) throw new Error(`unknown nav node ${id}`); return n; };
export const distToNav = (p: V2) => Math.min(...NAV_EDGES.map((e) => distToSegment(p, nodeOf(e.a), nodeOf(e.b))));
const onBuilt = (x: number, z: number) => (z > ROAD.z0 - 1 && z < ROAD.z1 + 1) || (z > BOARDWALK.z0 - 0.5 && z < BOARDWALK.z1 + 0.5) || (x > BUILDING.minX - 1 && x < BUILDING.maxX + 1 && z < BUILDING.maxZ + 0.5);

export interface Scenery { palms: { x: number; z: number; lean: number; h: number; yaw: number; s: number }[]; umbrellas: { x: number; z: number; hue: number; yaw: number }[]; loungers: { x: number; z: number; yaw: number }[]; lamps: V2[]; benches: { x: number; z: number; yaw: number }[]; planters: { x: number; z: number; w: number }[]; bollards: V2[]; rocks: { x: number; z: number; s: number }[]; tufts: { x: number; z: number; s: number }[] }
function buildScenery(): Scenery {
  const r = rng(20261001);
  const clear = (x: number, z: number, m: number) => distToNav({ x, z }) > m && !isWater(x, z);
  const palms: Scenery["palms"] = [];
  const tryPalm = (x: number, z: number, h0: number) => { if (clear(x, z, 1.5) && palms.every((p) => Math.hypot(p.x - x, p.z - z) > 4.2)) palms.push({ x, z, lean: r.range(-0.16, 0.16), h: h0 + r.range(-0.8, 1.6), yaw: r.range(0, Math.PI * 2), s: r.range(0.9, 1.15) }); };
  for (let x = -56; x <= 56; x += 7.3) { tryPalm(x + r.range(-1.5, 1.5), 14.2 + r.range(-0.6, 0.4), 7.5); tryPalm(x + 3 + r.range(-1.5, 1.5), 21.4 + r.range(-0.4, 1.2), 6.5); }
  for (let x = -54; x <= 54; x += 9) tryPalm(x + r.range(-2, 2), -2 + r.range(-0.5, 0.5), 8);
  for (const [x, z] of [[-24, -12], [8, -12.5], [-22, -26], [10, -24], [-4, -33], [-28, -36], [18, -34]]) tryPalm(x, z, 7.5);
  const umbrellas: Scenery["umbrellas"] = [], loungers: Scenery["loungers"] = [];
  for (const [x, z] of [[-34, 23.6], [-26, 25], [-18, 24], [-2, 24.6], [6, 26], [14, 24.4], [22, 25.6], [30, 24]]) if (clear(x, z, 1.7)) { umbrellas.push({ x, z, hue: r.next(), yaw: r.range(0, 6.28) }); loungers.push({ x: x - 1.2, z: z + 1.5, yaw: r.range(-0.3, 0.3) }, { x: x + 1.2, z: z + 1.6, yaw: r.range(-0.3, 0.3) }); }
  const lamps: V2[] = []; for (let x = -48; x <= 48; x += 12) lamps.push({ x, z: 16.2 });
  for (const x of [-18, -10, 6, 14]) lamps.push({ x, z: -9.8 });
  const benches: Scenery["benches"] = []; for (const x of [-40, -20, 6, 30]) if (clear(x, 19.9, 1.0)) benches.push({ x, z: 19.9, yaw: 0 });
  const planters: Scenery["planters"] = []; for (const x of [-18, -10, -2, 6, 14]) planters.push({ x, z: -9.7, w: 2.2 });
  const bollards: V2[] = []; for (let x = -26; x <= 30; x += 8) bollards.push({ x, z: -2.7 });
  const rocks: Scenery["rocks"] = []; for (let i = 0; i < 26; i++) { const x = r.range(-60, 60), z = shoreZ(x) + r.range(-3, 3); if (clear(x, z, 1.2) && groundHeight(x, z) > -0.4) rocks.push({ x, z, s: r.range(0.25, 0.7) }); }
  const tufts: Scenery["tufts"] = []; for (let i = 0; i < 420; i++) { const x = r.range(-62, 62), z = r.range(-3, 15.6); if (distToNav({ x, z }) > 0.9 && !onBuilt(x, z)) tufts.push({ x, z, s: r.range(0.5, 1.2) }); }
  return { palms, umbrellas, loungers, lamps, benches, planters, bollards, rocks, tufts };
}
export const SCENERY: Scenery = buildScenery();

/** Everything solid for collision (horizontal footprint; `top` = height above which the player/air camera clears it). */
export const COLLIDERS: Collider[] = [
  { kind: "box", ...{ minX: BUILDING.minX, maxX: BUILDING.maxX, minZ: BUILDING.minZ, maxZ: BUILDING.maxZ }, top: BUILDING.top + 2.2, tag: "building" },
  { kind: "box", minX: DESK.x - 0.9, maxX: DESK.x + 0.9, minZ: DESK.z - 0.45, maxZ: DESK.z + 0.45, top: 1.0, tag: "desk" },
  ...[[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]].map(([dx, dz]): Collider => ({ kind: "circle", x: DESK.x + dx, z: DESK.z + dz, r: 0.12, top: 3.2, tag: "pergola" })),
  ...SCENERY.palms.map((p): Collider => ({ kind: "circle", x: p.x, z: p.z, r: 0.38, top: p.h, tag: "palm" })),
  ...SCENERY.lamps.map((p): Collider => ({ kind: "circle", x: p.x, z: p.z, r: 0.14, top: 4.2, tag: "lamp" })),
  ...SCENERY.benches.map((b): Collider => ({ kind: "box", minX: b.x - 0.95, maxX: b.x + 0.95, minZ: b.z - 0.3, maxZ: b.z + 0.3, top: 0.9, tag: "bench" })),
  ...SCENERY.planters.map((p): Collider => ({ kind: "box", minX: p.x - p.w / 2, maxX: p.x + p.w / 2, minZ: p.z - 0.5, maxZ: p.z + 0.5, top: 1.1, tag: "planter" })),
  ...SCENERY.umbrellas.map((u): Collider => ({ kind: "circle", x: u.x, z: u.z, r: 0.1, top: 2.6, tag: "umbrella" })),
  ...SCENERY.bollards.map((p): Collider => ({ kind: "circle", x: p.x, z: p.z, r: 0.12, top: 0.9, tag: "bollard" })),
  { kind: "box", minX: 28.5, maxX: 31.5, minZ: 26, maxZ: 28.6, top: 4.4, tag: "lifeguard" },
];

/** Push a circle (radius r) out of every solid it overlaps; returns the corrected position. Pure. Only colliders taller than `y` block. */
export function resolveCollisions(p: V2, r: number, y = 0, colliders: Collider[] = COLLIDERS): V2 {
  let { x, z } = p;
  for (let pass = 0; pass < 3; pass++) {
    for (const c of colliders) {
      if (y >= c.top) continue;
      if (c.kind === "circle") {
        const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz), min = r + c.r;
        if (d < min) { const k = d > 1e-6 ? min / d : 1; x = d > 1e-6 ? c.x + dx * k : c.x + min; z = d > 1e-6 ? c.z + dz * k : c.z; }
      } else {
        const cx = clamp(x, c.minX, c.maxX), cz = clamp(z, c.minZ, c.maxZ), dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz);
        if (d < r && d > 1e-6) { x = cx + (dx / d) * r; z = cz + (dz / d) * r; }
        else if (d <= 1e-6) { // centre inside the box: exit through the nearest face
          const left = x - c.minX, right = c.maxX - x, up = z - c.minZ, down = c.maxZ - z, m = Math.min(left, right, up, down);
          if (m === left) x = c.minX - r; else if (m === right) x = c.maxX + r; else if (m === up) z = c.minZ - r; else z = c.maxZ + r;
        }
      }
    }
  }
  return { x, z };
}
export const insideSolid = (p: V2, y = 0, colliders: Collider[] = COLLIDERS) => colliders.some((c) => y < c.top && (c.kind === "circle" ? Math.hypot(p.x - c.x, p.z - c.z) < c.r : p.x > c.minX && p.x < c.maxX && p.z > c.minZ && p.z < c.maxZ));
export { dist2 };
