// Small, dependency-free math helpers for the world logic. Everything here is pure and deterministic (testable without WebGL).
export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
/** Frame-rate-independent exponential approach: after 1/lambda seconds ≈63% of the gap is closed, at ANY dt. */
export const damp = (cur: number, target: number, lambda: number, dt: number) => lerp(cur, target, 1 - Math.exp(-lambda * dt));
export const wrapAngle = (a: number) => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };
export const angleDelta = (from: number, to: number) => wrapAngle(to - from);
export const dampAngle = (cur: number, target: number, lambda: number, dt: number) => cur + angleDelta(cur, target) * (1 - Math.exp(-lambda * dt));
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export interface V2 { x: number; z: number }
export const dist2 = (a: V2, b: V2) => Math.hypot(a.x - b.x, a.z - b.z);
export const forward = (yaw: number): V2 => ({ x: Math.sin(yaw), z: Math.cos(yaw) }); // yaw 0 faces +z (the ocean)
export const yawTo = (from: V2, to: V2) => Math.atan2(to.x - from.x, to.z - from.z);

/** mulberry32: tiny seeded PRNG so scenery and agent choices are reproducible. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { next, range: (lo: number, hi: number) => lo + (hi - lo) * next(), pick: <T,>(xs: readonly T[]) => xs[Math.floor(next() * xs.length) % xs.length] };
}
export type Rng = ReturnType<typeof rng>;

/** Cheap smooth value noise (deterministic) for dunes / colour variation. */
const hash = (x: number, z: number) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
export function noise2(x: number, z: number) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  return lerp(lerp(hash(xi, zi), hash(xi + 1, zi), u), lerp(hash(xi, zi + 1), hash(xi + 1, zi + 1), u), v);
}
