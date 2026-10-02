// Town "kit": a pure recorder. Every piece of architecture/furniture is declared ONCE here and yields (a) render pieces (merged later by the 3D layer),
// (b) collision boxes with a vertical range, (c) walkable surfaces (floors, ramps, decks) and (d) zones/spots/nav nodes. No three.js, no DOM.
export type Mat = "solid" | "glass" | "glow" | "water";
export type Shape = "box" | "cyl" | "sphere" | "gable" | "cone";
export interface Piece { shape: Shape; mat: Mat; color: string; x: number; y: number; z: number; sx: number; sy: number; sz: number; rotY: number; group: string; roof?: boolean; tag?: string }
export interface Box3 { kind: "box"; minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number; tag: string }
export interface Circle3 { kind: "circle"; x: number; z: number; r: number; minY: number; maxY: number; tag: string }
export type Collider3 = Box3 | Circle3;
/** A walkable (and ceiling-forming) surface. Ramps rise linearly along `axis` from h0 (at the min side) to h1 (at the max side). */
export interface Surface { id: string; minX: number; maxX: number; minZ: number; maxZ: number; h0: number; h1: number; axis: "x" | "z"; kind: "floor" | "ramp" | "deck" | "roof"; /** underside height (slabs form ceilings) */ bottom: number | null }
export interface Zone { id: string; name: string; building: string; district: string; minX: number; maxX: number; minZ: number; maxZ: number; y0: number; y1: number; indoor: boolean }
export interface Pad { minX: number; maxX: number; minZ: number; maxZ: number; h: number; soft: number }
export interface Spot { id: string; x: number; z: number; y: number; yaw: number; kind: "stand" | "sit" | "work-stand" | "work-sit"; label: string; weight: number }
export interface SignPiece { text: string; sub?: string; x: number; y: number; z: number; w: number; h: number; rotY: number; style: "dark" | "light" | "teal" | "wood" }
/** An interactable fixture (not an agent): pressing E near it opens a Founder UI. */
export interface Console { id: string; name: string; x: number; y: number; z: number; action: "founder-command" | "founder-panel"; range: number; prompt: string }
/** A live display surface the renderer paints with a canvas (HQ command table map, Command Center wall, founder-suite panel). `rotY` yaws a wall display; table/suite are laid flat / tilted by the renderer. */
export interface Display { id: string; kind: "table" | "wall" | "suite"; x: number; y: number; z: number; w: number; h: number; rotY: number }
export interface Landmark { id: string; name: string; district: string; x: number; z: number; y: number; radius: number }

export const chunkKey = (x: number, z: number) => `${Math.floor(x / 60)}:${Math.floor(z / 60)}`;
const rectsMinus = (r: { minX: number; maxX: number; minZ: number; maxZ: number }, h: { minX: number; maxX: number; minZ: number; maxZ: number }) => {
  if (h.maxX <= r.minX || h.minX >= r.maxX || h.maxZ <= r.minZ || h.minZ >= r.maxZ) return [r];
  const out: (typeof r)[] = [], hx0 = Math.max(h.minX, r.minX), hx1 = Math.min(h.maxX, r.maxX), hz0 = Math.max(h.minZ, r.minZ), hz1 = Math.min(h.maxZ, r.maxZ);
  if (hz0 > r.minZ) out.push({ minX: r.minX, maxX: r.maxX, minZ: r.minZ, maxZ: hz0 });
  if (hz1 < r.maxZ) out.push({ minX: r.minX, maxX: r.maxX, minZ: hz1, maxZ: r.maxZ });
  if (hx0 > r.minX) out.push({ minX: r.minX, maxX: hx0, minZ: hz0, maxZ: hz1 });
  if (hx1 < r.maxX) out.push({ minX: hx1, maxX: r.maxX, minZ: hz0, maxZ: hz1 });
  return out;
};

export interface Opening { a0: number; a1: number; /** door: no sill; window: sill + glass */ kind?: "door" | "window" | "arch"; sill?: number; top?: number }
export interface BoxOpts { mat?: Mat; solid?: boolean; roof?: boolean; tag?: string; group?: string; rotY?: number }

export class Kit {
  pieces: Piece[] = []; colliders: Collider3[] = []; surfaces: Surface[] = []; zones: Zone[] = []; pads: Pad[] = []; spots: Spot[] = []; signs: SignPiece[] = []; landmarks: Landmark[] = []; consoles: Console[] = []; displays: Display[] = [];
  extraNodes: { id: string; x: number; z: number; y: number }[] = [];
  private grp: string | null = null;
  /** All pieces declared inside `fn` go to render group `g` (e.g. "hq-int" so interiors can be culled/hidden as one unit). */
  group(g: string, fn: () => void) { const p = this.grp; this.grp = g; fn(); this.grp = p; }
  private g(o: BoxOpts | undefined, x: number, z: number) { return o?.group ?? this.grp ?? chunkKey(x, z); }

  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: string, o: BoxOpts = {}) {
    const mat = o.mat ?? "solid", cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    this.pieces.push({ shape: "box", mat, color, x: cx, y: (y0 + y1) / 2, z: cz, sx: x1 - x0, sy: y1 - y0, sz: z1 - z0, rotY: 0, group: this.g(o, cx, cz), roof: o.roof, tag: o.tag });
    if (o.solid ?? (mat === "solid")) this.colliders.push({ kind: "box", minX: x0, maxX: x1, minZ: z0, maxZ: z1, minY: y0, maxY: y1, tag: o.tag ?? "solid" });
  }
  /** Box by centre + size, optionally rotated about Y (collider uses the rotated bounding box). */
  cbox(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: string, o: BoxOpts = {}) {
    const rot = o.rotY ?? 0, mat = o.mat ?? "solid";
    this.pieces.push({ shape: "box", mat, color, x: cx, y: cy, z: cz, sx, sy, sz, rotY: rot, group: this.g(o, cx, cz), roof: o.roof, tag: o.tag });
    if (o.solid ?? false) { const c = Math.abs(Math.cos(rot)), s = Math.abs(Math.sin(rot)), hx = (sx * c + sz * s) / 2, hz = (sx * s + sz * c) / 2; this.colliders.push({ kind: "box", minX: cx - hx, maxX: cx + hx, minZ: cz - hz, maxZ: cz + hz, minY: cy - sy / 2, maxY: cy + Math.max(sy / 2, 0.6 - 0), tag: o.tag ?? "furniture" }); }
  }
  cyl(cx: number, cz: number, y0: number, y1: number, r: number, color: string, o: BoxOpts & { solid?: boolean } = {}) {
    const mat = o.mat ?? "solid"; this.pieces.push({ shape: "cyl", mat, color, x: cx, y: (y0 + y1) / 2, z: cz, sx: r * 2, sy: y1 - y0, sz: r * 2, rotY: 0, group: this.g(o, cx, cz), roof: o.roof, tag: o.tag });
    if (o.solid) this.colliders.push({ kind: "circle", x: cx, z: cz, r, minY: y0, maxY: y1, tag: o.tag ?? "pillar" });
  }
  cone(cx: number, cz: number, y0: number, y1: number, r: number, color: string, o: BoxOpts = {}) { this.pieces.push({ shape: "cone", mat: o.mat ?? "solid", color, x: cx, y: (y0 + y1) / 2, z: cz, sx: r * 2, sy: y1 - y0, sz: r * 2, rotY: 0, group: this.g(o, cx, cz), roof: o.roof, tag: o.tag }); }
  sphere(cx: number, cy: number, cz: number, r: number, color: string, o: BoxOpts = {}) { this.pieces.push({ shape: "sphere", mat: o.mat ?? "solid", color, x: cx, y: cy, z: cz, sx: r * 2, sy: r * 2, sz: r * 2, rotY: 0, group: this.g(o, cx, cz), roof: o.roof, tag: o.tag }); }
  /** Gabled roof prism over a rectangle; ridge runs along `ridge`. */
  gable(x0: number, x1: number, z0: number, z1: number, y0: number, h: number, color: string, ridge: "x" | "z" = "x", o: BoxOpts = {}) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2; this.pieces.push({ shape: "gable", mat: "solid", color, x: cx, y: y0 + h / 2, z: cz, sx: x1 - x0, sy: h, sz: z1 - z0, rotY: ridge === "x" ? 0 : Math.PI / 2, group: this.g(o, cx, cz), roof: o.roof ?? true, tag: o.tag });
  }
  /** A wall along an axis with openings (doors / windows / arches). Doorways have no collider; windows are glazed and solid. */
  wall(axis: "x" | "z", c: number, a0: number, a1: number, y0: number, y1: number, t: number, color: string, openings: Opening[] = [], o: BoxOpts & { glassColor?: string } = {}) {
    const seg = (s0: number, s1: number, lo: number, hi: number, col = color, mat: Mat = "solid", solid = true) => {
      if (s1 - s0 < 1e-4 || hi - lo < 1e-4) return;
      const b = (axis === "x") ? [s0, s1, lo, hi, c - t / 2, c + t / 2] : [c - t / 2, c + t / 2, lo, hi, s0, s1];
      this.box(b[0], b[1], b[2], b[3], b[4], b[5], col, { ...o, mat, solid });
    };
    const ops = [...openings].sort((p, q) => p.a0 - q.a0); let cur = a0;
    for (const op of ops) {
      seg(cur, op.a0, y0, y1); cur = op.a1;
      const top = op.top ?? (op.kind === "window" ? 2.7 : 2.55), sill = op.kind === "window" ? (op.sill ?? 0.9) : 0;
      if (top + y0 < y1) seg(op.a0, op.a1, y0 + top, y1);                       // lintel
      if (sill > 0) seg(op.a0, op.a1, y0, y0 + sill);                           // sill wall
      if (op.kind === "window") seg(op.a0, op.a1, y0 + sill, y0 + top, o.glassColor ?? "#8fc7dc", "glass", true); // glazing blocks movement
    }
    seg(cur, a1, y0, y1);
  }
  /** Floor slab (render + walkable surface + ceiling for what is below). `holes` cut openings (e.g. stairwells). */
  floor(minX: number, maxX: number, minZ: number, maxZ: number, y: number, thick: number, color: string, o: { holes?: { minX: number; maxX: number; minZ: number; maxZ: number }[]; id: string; kind?: Surface["kind"]; roof?: boolean; group?: string }) {
    let rs = [{ minX, maxX, minZ, maxZ }]; for (const h of o.holes ?? []) rs = rs.flatMap((r) => rectsMinus(r, h));
    rs.forEach((r, i) => { this.box(r.minX, r.maxX, y - thick, y, r.minZ, r.maxZ, color, { solid: false, roof: o.roof, group: o.group }); this.surfaces.push({ id: `${o.id}#${i}`, ...r, h0: y, h1: y, axis: "x", kind: o.kind ?? "floor", bottom: y - thick }); });
  }
  ramp(id: string, minX: number, maxX: number, minZ: number, maxZ: number, axis: "x" | "z", h0: number, h1: number, kind: Surface["kind"] = "ramp") { this.surfaces.push({ id, minX, maxX, minZ, maxZ, h0, h1, axis, kind, bottom: null }); }
  /** Visible stair treads along `axis` rising from h0 to h1 + the matching ramp surface + side stringers (solid). */
  stairs(id: string, minX: number, maxX: number, minZ: number, maxZ: number, axis: "x" | "z", h0: number, h1: number, color: string, stringer = "#cfc8ba") {
    this.ramp(id, minX, maxX, minZ, maxZ, axis, h0, h1);
    const n = Math.max(6, Math.round(Math.abs(h1 - h0) / 0.19)), len = axis === "x" ? maxX - minX : maxZ - minZ;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * len, b = ((i + 1) / n) * len, top = h0 + ((i + 1) / n) * (h1 - h0), bot = Math.min(h0, h1) - 0.15;
      if (axis === "x") this.box(minX + a, minX + b, bot, top, minZ, maxZ, color, { solid: false }); else this.box(minX, maxX, bot, top, minZ + a, minZ + b, color, { solid: false });
    }
    const hi = Math.max(h0, h1) + 1.0;
    if (axis === "x") { this.box(minX, maxX, Math.min(h0, h1), hi, minZ - 0.06, minZ, stringer, { solid: true }); this.box(minX, maxX, Math.min(h0, h1), hi, maxZ, maxZ + 0.06, stringer, { solid: true }); }
    else { this.box(minX - 0.06, minX, Math.min(h0, h1), hi, minZ, maxZ, stringer, { solid: true }); this.box(maxX, maxX + 0.06, Math.min(h0, h1), hi, minZ, maxZ, stringer, { solid: true }); }
  }
  pad(minX: number, maxX: number, minZ: number, maxZ: number, h: number, soft = 3) { this.pads.push({ minX, maxX, minZ, maxZ, h, soft }); }
  zone(z: Omit<Zone, "indoor"> & { indoor?: boolean }) { this.zones.push({ indoor: true, ...z }); }
  spot(id: string, x: number, z: number, yaw: number, kind: Spot["kind"], label: string, o: { y?: number; weight?: number } = {}) { this.spots.push({ id, x, z, y: o.y ?? NaN, yaw, kind, label, weight: o.weight ?? 1 }); }
  node(id: string, x: number, z: number, y = NaN) { this.extraNodes.push({ id, x, z, y }); }
  sign(s: SignPiece) { this.signs.push(s); }
  landmark(l: Landmark) { this.landmarks.push(l); }
  console(c: Console) { this.consoles.push(c); }
  display(d: Display) { this.displays.push(d); }
}
