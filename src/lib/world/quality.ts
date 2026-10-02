// Quality tiers LOW / MEDIUM / HIGH — pure selection + a hysteresis controller. LOW never removes gameplay: it only reduces cost
// (shadows, vegetation density, reflections, draw distance, LOD, ambient props, particles, water complexity).
export type Tier = "LOW" | "MEDIUM" | "HIGH";
export interface TierConfig {
  tier: Tier; dprMax: number; shadows: "off" | "low" | "high"; shadowMap: number; shadowRadius: number; palmDensity: number; tuftDensity: number; propDensity: number;
  waterSegments: number; waterDetail: 0 | 1 | 2; farFog: number; far: number; clouds: number; particles: number; antialias: boolean; foliageSway: boolean; postFx: boolean;
  terrainStep: number; birds: number; boats: number; carts: number; walkers: number; /** agents within this distance render a full rig, others a cheap proxy */ agentRigDist: number; labelDist: number; interiorDist: number;
}
export const TIERS: Record<Tier, TierConfig> = {
  LOW:    { tier: "LOW",    dprMax: 1.25, shadows: "off", shadowMap: 512,  shadowRadius: 0,  palmDensity: 0.55, tuftDensity: 0.25, propDensity: 0.6, waterSegments: 64,  waterDetail: 0, farFog: 380, far: 520,  clouds: 4,  particles: 0,   antialias: false, foliageSway: false, postFx: false, terrainStep: 2.2, birds: 0, boats: 4, carts: 0, walkers: 0, agentRigDist: 26, labelDist: 40, interiorDist: 55 },
  MEDIUM: { tier: "MEDIUM", dprMax: 1.6,  shadows: "low", shadowMap: 1024, shadowRadius: 26, palmDensity: 0.85, tuftDensity: 0.6,  propDensity: 0.85, waterSegments: 112, waterDetail: 1, farFog: 560, far: 760,  clouds: 8,  particles: 80,  antialias: true,  foliageSway: true,  postFx: false, terrainStep: 1.6, birds: 8, boats: 8, carts: 1, walkers: 4, agentRigDist: 38, labelDist: 55, interiorDist: 80 },
  HIGH:   { tier: "HIGH",   dprMax: 2,    shadows: "high", shadowMap: 2048, shadowRadius: 38, palmDensity: 1,    tuftDensity: 1,    propDensity: 1,    waterSegments: 176, waterDetail: 2, farFog: 800, far: 1100, clouds: 12, particles: 240, antialias: true,  foliageSway: true,  postFx: true, terrainStep: 1.3, birds: 16, boats: 8, carts: 2, walkers: 8, agentRigDist: 52, labelDist: 70, interiorDist: 110 },
};
const ORDER: Tier[] = ["LOW", "MEDIUM", "HIGH"];
export interface DeviceInfo { isTouch: boolean; width: number; cores: number; memoryGB: number | null; dpr: number; gpu: string; maxTexture: number }

/** Initial tier from device capability (manual override can come later). Conservative: iPhone-13-class phones start on LOW; software GL is LOW. */
export function selectInitialTier(d: DeviceInfo): Tier {
  const gpu = d.gpu.toLowerCase();
  if (/swiftshader|llvmpipe|software|basic render/.test(gpu)) return "LOW";
  const mobile = d.isTouch && d.width < 900;
  if (mobile) return d.cores >= 8 && (d.memoryGB ?? 0) >= 8 ? "MEDIUM" : "LOW";
  if (d.isTouch) return d.cores >= 8 ? "MEDIUM" : "LOW"; // tablets
  if (/apple (m\d|gpu)|nvidia|geforce|radeon (rx|pro)|rtx|gtx/.test(gpu) && d.cores >= 8) return "HIGH";
  if (/intel|uhd|iris|mali|adreno|powervr/.test(gpu) || d.cores < 4) return "LOW";
  return "MEDIUM";
}
export const clampTier = (t: Tier, max: Tier) => (ORDER.indexOf(t) > ORDER.indexOf(max) ? max : t);

/** Steps the tier down on sustained slow frames and (carefully) back up on sustained headroom. Hysteresis + cooldown prevent flapping. */
export class AdaptiveQuality {
  tier: Tier; private slow = 0; private fast = 0; private cooldown = 0; private ceiling: Tier;
  constructor(initial: Tier, public targetFps = 60, public manual: Tier | null = null) { this.tier = manual ?? initial; this.ceiling = manual ?? initial; }
  setManual(t: Tier | null, auto: Tier) { this.manual = t; this.tier = t ?? auto; this.ceiling = t ?? auto; this.slow = this.fast = 0; this.cooldown = 3; }
  /** frameMs: smoothed frame time. Returns the (possibly new) tier. */
  update(dt: number, frameMs: number): Tier {
    if (this.manual) return this.tier;
    this.cooldown = Math.max(0, this.cooldown - dt);
    const budget = 1000 / this.targetFps;
    if (frameMs > budget * 1.35) { this.slow += dt; this.fast = 0; } else if (frameMs < budget * 0.8) { this.fast += dt; this.slow = 0; } else { this.slow = Math.max(0, this.slow - dt); this.fast = Math.max(0, this.fast - dt); }
    const i = ORDER.indexOf(this.tier);
    if (this.slow > 2.5 && i > 0 && this.cooldown === 0) { this.tier = ORDER[i - 1]; this.slow = 0; this.cooldown = 4; this.ceiling = this.tier; }          // a step down also lowers the ceiling for this session
    else if (this.fast > 12 && i < ORDER.indexOf(this.ceiling) && this.cooldown === 0) { this.tier = ORDER[i + 1]; this.fast = 0; this.cooldown = 8; }
    return this.tier;
  }
}
