// Terrain + coastline constants (pure). Coordinates: metres; +x east, +z toward the OCEAN (south), +y up; sea level y = 0; yaw 0 faces +z.
import { clamp, lerp, noise2, smoothstep } from "./math";

export const BOUNDS = { minX: -110, maxX: 110, minZ: -64, maxZ: 70 } as const;           // soft walkable region; flying may exceed it
export const WATER_BLOCK_DEPTH = -0.45;                                                   // wading limit
export const ROAD = { z0: -9, z1: -3, h: 0.5 } as const;
export const BOARDWALK = { z0: 15.8, z1: 19.2, h: 0.78 } as const;
export const GROUND = 0.6;                                                                // town floor level north of the promenade
/** Shoreline z at a given x (where the beach meets water, h = 0). */
export const shoreZ = (x: number) => 46 + 2.4 * Math.sin(x * 0.045 + 0.7) + 1.2 * Math.sin(x * 0.13) + 1.6 * Math.sin(x * 0.021 - 1.1);

/** Natural (un-built) terrain height. */
export function naturalHeight(x: number, z: number): number {
  const dune = (noise2(x * 0.09, z * 0.09) - 0.5) * 0.5 + (noise2(x * 0.3, z * 0.3) - 0.5) * 0.12;
  const sz = shoreZ(x), edge = smoothstep(96, 128, Math.abs(x)) * (9 + 4 * noise2(x * 0.05, z * 0.05));  // headlands close the sides of the bay
  if (z > 12) {
    const beach = smoothstep(12, sz + 2, z), sea = Math.max(0, z - (sz + 2));
    return lerp(0.62, 0.0, beach) + dune * (1 - beach * 0.4) * smoothstep(12, 26, z) * 0.7 - sea * 0.16 - Math.pow(sea / 28, 2) * 2.5 + edge * smoothstep(8, 40, z) * 0.0 + edge * (1 - smoothstep(30, 62, z)) * 0.8;
  }
  if (z < -46) { const k = clamp((-46 - z) / 40, 0, 1); return GROUND + 18 * Math.pow(k, 1.5) + (noise2(x * 0.03, z * 0.05) - 0.4) * 6 * k + edge * (0.4 + k); }
  return GROUND + dune * 0.3 * smoothstep(-46, -26, z) * 0.4 + edge * smoothstep(-20, 10, z) * 0.0 + edge * 0.9;
}
