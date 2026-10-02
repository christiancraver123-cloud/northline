// World layout API (pure): terrain + pads + multi-level surfaces, collision with vertical ranges, zones, scenery, and the shared TOWN plan.
// Coordinates: metres; +x east, +z toward the ocean, +y up; yaw 0 faces +z. Everything here is deterministic and runs without WebGL.
import { buildTown, type TownPlan } from "./town";
import type { Collider3, Surface, Zone } from "./kit";
import { clamp, dist2, lerp, noise2, rng, smoothstep, type V2 } from "./math";
import { BOARDWALK, BOUNDS, GROUND, ROAD, WATER_BLOCK_DEPTH, naturalHeight, shoreZ } from "./terrain";
export { BOARDWALK, BOUNDS, GROUND, ROAD, WATER_BLOCK_DEPTH, shoreZ };
export { HQ } from "./hq";

export const TOWN: TownPlan = buildTown();
const K = TOWN.kit;
export const SURFACES: Surface[] = K.surfaces, ZONES: Zone[] = K.zones, PADS = K.pads, SPOTS = K.spots, LANDMARKS = K.landmarks, SIGNS = K.signs;
export type Collider = Collider3;
export const STEP = 0.45;

const inRect = (x: number, z: number, x0: number, x1: number, z0: number, z1: number, soft: number) => smoothstep(x0 - soft, x0, x) * smoothstep(x1 + soft, x1, x) * smoothstep(z0 - soft, z0, z) * smoothstep(z1 + soft, z1, z);
/** Terrain height a person stands on: natural terrain blended into the road, boardwalk and every building pad (soft ramps, no steps). */
export function groundHeight(x: number, z: number): number {
  let h = naturalHeight(x, z);
  h = lerp(h, ROAD.h, inRect(x, z, -300, 300, ROAD.z0, ROAD.z1, 0.8));
  h = lerp(h, BOARDWALK.h, inRect(x, z, -102, 102, BOARDWALK.z0, BOARDWALK.z1, 0.9));
  for (const p of PADS) h = lerp(h, p.h, inRect(x, z, p.minX, p.maxX, p.minZ, p.maxZ, p.soft));
  return h;
}
const surfaceH = (s: Surface, x: number, z: number) => { if (s.h0 === s.h1) return s.h0; const t = s.axis === "x" ? (x - s.minX) / (s.maxX - s.minX) : (z - s.minZ) / (s.maxZ - s.minZ); return lerp(s.h0, s.h1, clamp(t, 0, 1)); };
const onSurface = (s: Surface, x: number, z: number) => x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ;
/** The highest thing a body whose feet are at `y` can stand on at (x,z): terrain, or any floor/ramp/deck within `step` above the feet. */
export function supportHeight(x: number, z: number, y: number, step = STEP): number {
  let best = groundHeight(x, z);
  for (const s of SURFACES) if (onSurface(s, x, z)) { const h = surfaceH(s, x, z); if (h <= y + step && h > best) best = h; }
  return best;
}
/** Underside of the lowest slab above `y` (a ceiling), or Infinity. Used by the indoor camera. */
export function ceilingAt(x: number, z: number, y: number): number {
  let c = Infinity; for (const s of SURFACES) if (s.bottom !== null && onSurface(s, x, z) && s.bottom >= y - 0.02 && s.bottom < c) c = s.bottom; return c;
}
export const isWater = (x: number, z: number, y = 99) => supportHeight(x, z, y) < WATER_BLOCK_DEPTH;
export const inBounds = (p: V2) => p.x >= BOUNDS.minX && p.x <= BOUNDS.maxX && p.z >= BOUNDS.minZ && p.z <= BOUNDS.maxZ;

// ---- zones / districts ------------------------------------------------------------------------------------------------------
export function zoneAt(x: number, z: number, y: number): Zone | null {
  let best: Zone | null = null, bv = Infinity;
  for (const zn of ZONES) if (x >= zn.minX && x <= zn.maxX && z >= zn.minZ && z <= zn.maxZ && y >= zn.y0 && y <= zn.y1) { const v = (zn.maxX - zn.minX) * (zn.maxZ - zn.minZ) * (zn.y1 - zn.y0); if (v < bv) { bv = v; best = zn; } }
  return best;
}
export const isIndoors = (x: number, z: number, y: number) => !!zoneAt(x, z, y)?.indoor;
/** Human-readable place name for the HUD: zone (+ district) or the nearest district label. */
export function locationLabel(x: number, z: number, y: number): string {
  const zn = zoneAt(x, z, y); if (zn) return zn.district === zn.name ? zn.name : `${zn.district} · ${zn.name}`;
  let best = TOWN.districts[0], bd = Infinity; for (const d of TOWN.districts) { const dd = dist2({ x, z }, d); if (dd < bd) { bd = dd; best = d; } }
  if (z > shoreZ(x) + 1 && y < 3) return "Open water"; return bd < 60 ? best.name : "Northline coast";
}

// ---- colliders ------------------------------------------------------------------------------------------------------------
const distRectPt = (b: { minX: number; maxX: number; minZ: number; maxZ: number }, x: number, z: number) => Math.hypot(Math.max(b.minX - x, 0, x - b.maxX), Math.max(b.minZ - z, 0, z - b.maxZ));
const solidBoxes = K.colliders.filter((c) => c.kind === "box") as Extract<Collider3, { kind: "box" }>[];
const blockedBy = (x: number, z: number, m: number) => solidBoxes.some((b) => b.maxY - b.minY > 0.5 && distRectPt(b, x, z) < m);
const nearPad = (x: number, z: number, m: number) => PADS.some((p) => x > p.minX - m && x < p.maxX + m && z > p.minZ - m && z < p.maxZ + m);
const onBuilt = (x: number, z: number, m = 0) => (z > ROAD.z0 - 1.2 - m && z < ROAD.z1 + 1.2 + m) || (z > BOARDWALK.z0 - 1 - m && z < BOARDWALK.z1 + 1 + m) || TOWN.paved.some((p) => x > p.minX - m && x < p.maxX + m && z > p.minZ - m && z < p.maxZ + m);

export interface Scenery { palms: { x: number; z: number; h: number; yaw: number; s: number }[]; lamps: V2[]; bollards: V2[]; rocks: { x: number; z: number; s: number }[]; tufts: { x: number; z: number; s: number }[]; bushes: { x: number; z: number; s: number }[]; beachSets: { x: number; z: number; hue: number; yaw: number }[] }
function buildScenery(): Scenery {
  const r = rng(20261001), palms: Scenery["palms"] = [];
  const onAnySurface = (x: number, z: number) => SURFACES.some((s) => x > s.minX - 1.2 && x < s.maxX + 1.2 && z > s.minZ - 1.2 && z < s.maxZ + 1.2);
  const free = (x: number, z: number, m: number) => !blockedBy(x, z, m) && !onAnySurface(x, z) && !nearPad(x, z, 1) && !onBuilt(x, z, 0.6) && supportHeight(x, z, 99) > 0.05 && Math.abs(x) < 104 && z > -56;
  const tryPalm = (x: number, z: number, h0: number, gap = 4.5) => { if (free(x, z, 1.4) && palms.every((p) => Math.hypot(p.x - x, p.z - z) > gap)) palms.push({ x, z, h: h0 + r.range(-0.8, 1.6), yaw: r.range(0, Math.PI * 2), s: r.range(0.9, 1.15) }); };
  for (let x = -100; x <= 100; x += 6.4) { tryPalm(x + r.range(-1.5, 1.5), 14.0 + r.range(-0.6, 0.3), 7.5); tryPalm(x + 3 + r.range(-1.5, 1.5), 21.6 + r.range(-0.4, 1.4), 6.5); }
  for (let x = -100; x <= 100; x += 8) { tryPalm(x + r.range(-2, 2), -2.0 + r.range(-0.5, 0.5), 8); tryPalm(x + 4 + r.range(-2, 2), -11 + r.range(-0.4, 0.4), 7); }
  for (let i = 0; i < 90; i++) tryPalm(r.range(-100, 100), r.range(22, 40), 6.8, 6);
  for (let i = 0; i < 60; i++) tryPalm(r.range(-100, 100), r.range(-50, -12), 7.6, 6);
  const lamps: V2[] = []; for (let x = -96; x <= 96; x += 12) if (free(x, 14.9, 0.5)) lamps.push({ x, z: 14.9 }); for (let x = -92; x <= 92; x += 14) if (!blockedBy(x, -9.9, 0.4) && !onBuiltPlaza(x)) lamps.push({ x, z: -9.9 });
  const bollards: V2[] = []; for (let x = -92; x <= 92; x += 8) bollards.push({ x, z: -2.7 });
  const rocks: Scenery["rocks"] = []; for (let i = 0; i < 40; i++) { const x = r.range(-100, 100), z = shoreZ(x) + r.range(-4, 3); if (free(x, z, 1.0) && supportHeight(x, z, 99) > -0.3) rocks.push({ x, z, s: r.range(0.25, 0.75) }); }
  const tufts: Scenery["tufts"] = []; for (let i = 0; i < 700; i++) { const x = r.range(-100, 100), z = r.range(-3, 14.4); if (free(x, z, 0.6)) tufts.push({ x, z, s: r.range(0.5, 1.2) }); }
  for (let i = 0; i < 300; i++) { const x = r.range(-100, 100), z = r.range(-50, -12); if (free(x, z, 0.6) && noise2(x * 0.1, z * 0.1) > 0.35) tufts.push({ x, z, s: r.range(0.6, 1.3) }); }
  const bushes: Scenery["bushes"] = []; for (let i = 0; i < 150; i++) { const x = r.range(-100, 100), z = r.range(-50, 14); if (free(x, z, 0.9) && z > -46) bushes.push({ x, z, s: r.range(0.45, 0.95) }); }
  const beachSets: Scenery["beachSets"] = []; for (let i = 0; i < 18; i++) { const x = -92 + i * 11 + r.range(-3, 3), z = r.range(23, 31); if (free(x, z, 2.4) && z < shoreZ(x) - 6) beachSets.push({ x, z, hue: r.next(), yaw: r.range(0, 6.28) }); }
  return { palms, lamps, bollards, rocks, tufts, bushes, beachSets };
}
const onBuiltPlaza = (x: number) => x > -44 && x < 8 && false;
export const SCENERY: Scenery = buildScenery();

/** Everything solid: architecture + furniture from the plan, plus palm trunks, lamps, bollards and beach umbrella poles. */
export const COLLIDERS: Collider3[] = [
  ...K.colliders,
  ...SCENERY.palms.map((p): Collider3 => ({ kind: "circle", x: p.x, z: p.z, r: 0.38, minY: -1, maxY: p.h, tag: "palm" })),
  ...SCENERY.lamps.map((p): Collider3 => ({ kind: "circle", x: p.x, z: p.z, r: 0.14, minY: -1, maxY: 4.2, tag: "lamp" })),
  ...SCENERY.bollards.map((p): Collider3 => ({ kind: "circle", x: p.x, z: p.z, r: 0.12, minY: -1, maxY: 1.0, tag: "bollard" })),
  ...SCENERY.beachSets.map((u): Collider3 => ({ kind: "circle", x: u.x, z: u.z, r: 0.1, minY: -1, maxY: 2.6, tag: "umbrella" })),
];
export const blocks = (c: Collider3, yFeet: number, head: number, step = STEP) => c.maxY > yFeet + step && c.minY < yFeet + head;
// ---- spatial hash (8 m cells) so collision stays cheap with ~1500 colliders ----
const CELL = 8, grid = new Map<string, Collider3[]>(), cellKey = (i: number, j: number) => `${i},${j}`;
for (const c of COLLIDERS) {
  const [x0, x1, z0, z1] = c.kind === "circle" ? [c.x - c.r, c.x + c.r, c.z - c.r, c.z + c.r] : [c.minX, c.maxX, c.minZ, c.maxZ];
  for (let i = Math.floor((x0 - 1.5) / CELL); i <= Math.floor((x1 + 1.5) / CELL); i++) for (let j = Math.floor((z0 - 1.5) / CELL); j <= Math.floor((z1 + 1.5) / CELL); j++) { const k = cellKey(i, j); (grid.get(k) ?? grid.set(k, []).get(k)!).push(c); }
}
/** Colliders that can touch a point (within the 1.5 m margin built into the cells). */
export const collidersNear = (x: number, z: number): Collider3[] => grid.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL))) ?? [];

/** Push a circle (radius r) out of every solid whose vertical range overlaps the body [yFeet+step … yFeet+head]. Pure. */
export function resolveCollisions(p: V2, r: number, yFeet = 0, head = 1.7, colliders: Collider3[] = COLLIDERS, step = STEP): V2 {
  let { x, z } = p;
  const list = () => (colliders === COLLIDERS ? collidersNear(x, z) : colliders);
  for (let pass = 0; pass < 3; pass++) for (const c of list()) {
    if (!blocks(c, yFeet, head, step)) continue;
    if (c.kind === "circle") { const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz), min = r + c.r; if (d < min) { if (d > 1e-6) { x = c.x + (dx / d) * min; z = c.z + (dz / d) * min; } else x = c.x + min; } }
    else {
      const cx = clamp(x, c.minX, c.maxX), cz = clamp(z, c.minZ, c.maxZ), dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz);
      if (d < r && d > 1e-6) { x = cx + (dx / d) * r; z = cz + (dz / d) * r; }
      else if (d <= 1e-6) { const l = x - c.minX, rr = c.maxX - x, u = z - c.minZ, dn = c.maxZ - z, m = Math.min(l, rr, u, dn); if (m === l) x = c.minX - r; else if (m === rr) x = c.maxX + r; else if (m === u) z = c.minZ - r; else z = c.maxZ + r; }
    }
  }
  return { x, z };
}
export const insideSolid = (p: V2, y = 0, head = 1.7, colliders: Collider3[] = COLLIDERS) => (colliders === COLLIDERS ? collidersNear(p.x, p.z) : colliders).some((c) => blocks(c, y, head) && (c.kind === "circle" ? Math.hypot(p.x - c.x, p.z - c.z) < c.r : p.x > c.minX && p.x < c.maxX && p.z > c.minZ && p.z < c.maxZ));
export { dist2 };
