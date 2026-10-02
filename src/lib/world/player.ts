// Operator/player locomotion — a pure, frame-rate-independent step function plus the mode state machine (WALK/RUN/FLY, OVERVIEW/FOLLOW/FOCUS views).
// No WebGL, no DOM: the renderer only reads the resulting state.
import { BOUNDS, WATER_BLOCK_DEPTH, supportHeight, resolveCollisions, COLLIDERS, type Collider } from "./layout";
import { clamp, damp, dampAngle, forward, wrapAngle, type V2 } from "./math";

export const TUNING = {
  walk: 3.1, run: 6.4, accelGround: 9, decelGround: 11, turnLambda: 12,
  fly: 11, flyBoost: 26, flyAccel: 2.6, flyDamp: 2.2, flyVert: 8, takeoffLift: 6.5, takeoffTime: 0.7, landSpeed: 3.2,
  radius: 0.38, eye: 1.7, minHover: 0.9, ceiling: 90, airRadius: 190, stepUp: 0.5,
} as const;

export type Locomotion = "GROUND" | "AIR";
export interface PlayerState {
  x: number; y: number; z: number; vx: number; vz: number; vy: number; heading: number; // heading = facing yaw
  locomotion: Locomotion; running: boolean; takeoff: number; landing: boolean; grounded: boolean; speed: number; bank: number;
}
export interface PlayerInput { moveX: number; moveZ: number; /** −1..1; forward = +moveZ in camera space */ cameraYaw: number; run: boolean; up: number; down: number; boost: boolean }

export const PLAYER_START = { x: -14, z: -7.2, yaw: Math.PI } as const;
export const startPlayer = (x: number = PLAYER_START.x, z: number = PLAYER_START.z): PlayerState => ({ x, y: supportHeight(x, z, 1.2), z, vx: 0, vz: 0, vy: 0, heading: PLAYER_START.yaw, locomotion: "GROUND", running: false, takeoff: 0, landing: false, grounded: true, speed: 0, bank: 0 });

/** Camera-relative desired direction (unit-length at most). */
export function desiredDirection(i: PlayerInput): V2 {
  const l = Math.hypot(i.moveX, i.moveZ), k = l > 1 ? 1 / l : 1, f = forward(i.cameraYaw), r = { x: -Math.cos(i.cameraYaw), z: Math.sin(i.cameraYaw) }; // right-hand side when looking along `forward`
  return { x: (f.x * i.moveZ + r.x * i.moveX) * k, z: (f.z * i.moveZ + r.z * i.moveX) * k };
}

export function toggleFly(s: PlayerState): PlayerState {
  if (s.locomotion === "GROUND") return { ...s, locomotion: "AIR", takeoff: TUNING.takeoffTime, landing: false, grounded: false, vy: TUNING.takeoffLift };
  return { ...s, landing: !s.landing }; // in the air: toggle an assisted landing (descend until the ground, then walk)
}

/** One simulation step. Same trajectory (within tolerance) at 30/60/144 Hz because everything uses exponential damping and clamps dt. */
export function stepPlayer(s: PlayerState, input: PlayerInput, rawDt: number, colliders: Collider[] = COLLIDERS): PlayerState {
  const dt = clamp(rawDt, 0, 0.05); // a stalled tab must never teleport the player
  if (dt === 0) return s;
  const dir = desiredDirection(input), mag = Math.hypot(dir.x, dir.z), n = { ...s };
  if (s.locomotion === "GROUND") {
    const running = input.run && mag > 0.1, top = (running ? TUNING.run : TUNING.walk) * Math.min(1, mag);
    const tvx = mag > 0.01 ? (dir.x / mag) * top : 0, tvz = mag > 0.01 ? (dir.z / mag) * top : 0, lam = mag > 0.01 ? TUNING.accelGround : TUNING.decelGround;
    n.vx = damp(s.vx, tvx, lam, dt); n.vz = damp(s.vz, tvz, lam, dt); n.running = running;
    const sp = Math.hypot(n.vx, n.vz); if (sp > 0.25) n.heading = dampAngle(s.heading, Math.atan2(n.vx, n.vz), TUNING.turnLambda, dt);
    let nx = s.x + n.vx * dt, nz = s.z + n.vz * dt;
    nx = clamp(nx, BOUNDS.minX, BOUNDS.maxX); nz = clamp(nz, BOUNDS.minZ, BOUNDS.maxZ);
    const sup = (x: number, z: number) => supportHeight(x, z, s.y), ok = (h: number) => h >= WATER_BLOCK_DEPTH && h - s.y <= TUNING.stepUp;
    if (!ok(sup(nx, nz))) { nx = s.x; nz = s.z; n.vx = 0; n.vz = 0; } // water / too-steep: stop (slide handled by the per-axis retry below)
    if (nx === s.x && nz === s.z) { // try sliding along one axis
      const ax = clamp(s.x + s.vx * dt, BOUNDS.minX, BOUNDS.maxX), az = clamp(s.z + s.vz * dt, BOUNDS.minZ, BOUNDS.maxZ);
      if (ok(sup(ax, s.z))) { nx = ax; n.vx = s.vx; } else if (ok(sup(s.x, az))) { nz = az; n.vz = s.vz; }
    }
    const r = resolveCollisions({ x: nx, z: nz }, TUNING.radius, s.y, 1.7, colliders);
    n.x = r.x; n.z = r.z; n.y = damp(s.y, supportHeight(r.x, r.z, s.y), 18, dt); n.vy = 0; n.grounded = true; n.speed = Math.hypot(n.vx, n.vz); n.bank = damp(s.bank, 0, 8, dt);
    n.takeoff = 0; n.landing = false;
    return n;
  }
  // ---- AIR ----
  const top = (input.boost ? TUNING.flyBoost : TUNING.fly) * Math.min(1, mag);
  n.vx = damp(s.vx, mag > 0.01 ? (dir.x / mag) * top : 0, mag > 0.01 ? TUNING.flyAccel : TUNING.flyDamp, dt);
  n.vz = damp(s.vz, mag > 0.01 ? (dir.z / mag) * top : 0, mag > 0.01 ? TUNING.flyAccel : TUNING.flyDamp, dt);
  const gh = supportHeight(s.x, s.z, s.y, 0.3), alt = s.y - gh;
  let tvy = (input.up - input.down) * TUNING.flyVert;
  if (s.takeoff > 0) { tvy = Math.max(tvy, TUNING.takeoffLift * (s.takeoff / TUNING.takeoffTime) + 1.2); n.takeoff = Math.max(0, s.takeoff - dt); }
  if (s.landing && s.takeoff <= 0) tvy = -Math.min(TUNING.landSpeed, 1 + alt * 0.6);
  n.vy = damp(s.vy, tvy, 4, dt);
  let nx = s.x + n.vx * dt, nz = s.z + n.vz * dt, ny = s.y + n.vy * dt;
  const rr = Math.hypot(nx, nz); if (rr > TUNING.airRadius) { nx *= TUNING.airRadius / rr; nz *= TUNING.airRadius / rr; }
  const r = resolveCollisions({ x: nx, z: nz }, TUNING.radius + 0.4, ny - 0.5, 1.0, colliders, 0.0); // collide with anything that overlaps our body
  nx = r.x; nz = r.z;
  const gh2 = supportHeight(nx, nz, ny, 0.3), descending = (s.landing || input.down > 0) && s.takeoff <= 0;
  const deep = gh2 < -0.15, floor = deep ? 0.5 : gh2 + (descending ? 0 : TUNING.minHover * 0.5); // over water you hover above the sea; on land a low hover unless landing
  const wantLand = descending && !deep && ny <= gh2 + 0.35;
  if (wantLand && gh2 >= WATER_BLOCK_DEPTH) { n.locomotion = "GROUND"; n.landing = false; n.y = gh2; n.vy = 0; n.vx *= 0.4; n.vz *= 0.4; n.grounded = true; n.x = nx; n.z = nz; n.speed = Math.hypot(n.vx, n.vz); return n; }
  ny = clamp(ny, floor, TUNING.ceiling); // over water the "floor" is the sea surface; you hover, you never sink
  n.x = nx; n.y = ny; n.z = nz; n.grounded = false; n.speed = Math.hypot(n.vx, n.vz);
  if (n.speed > 0.4) n.heading = dampAngle(s.heading, Math.atan2(n.vx, n.vz), 5, dt);
  n.bank = damp(s.bank, clamp(-wrapAngle(Math.atan2(n.vx, n.vz) - s.heading) * 0.6 * Math.min(1, n.speed / 8), -0.5, 0.5), 5, dt);
  return n;
}

// ---- mode state machine -------------------------------------------------------------------------------------------------------
export type View = "PLAYER" | "OVERVIEW" | "FOLLOW" | "FOCUS";
export interface ModeState { view: View; returnTo: Exclude<View, "FOLLOW" | "FOCUS"> | "PLAYER"; panelOpen: boolean; selectedAgent: string | null; changedAt: number; seq: number }
export type ModeAction =
  | { type: "TOGGLE_OVERVIEW" } | { type: "FOLLOW_AGENT"; id: string } | { type: "EXIT_FOLLOW" } | { type: "FOCUS_AGENT"; id: string } | { type: "RETURN_TO_PLAYER" }
  | { type: "OPEN_PANEL"; id: string } | { type: "CLOSE_PANEL" } | { type: "ESCAPE" } | { type: "SELECT"; id: string | null };
export const initialMode = (): ModeState => ({ view: "PLAYER", returnTo: "PLAYER", panelOpen: false, selectedAgent: null, changedAt: 0, seq: 0 });
const to = (s: ModeState, p: Partial<ModeState>): ModeState => ({ ...s, ...p, seq: s.seq + 1 });

export function reduceMode(s: ModeState, a: ModeAction): ModeState {
  switch (a.type) {
    case "TOGGLE_OVERVIEW": return s.view === "OVERVIEW" || s.view === "FOCUS" ? to(s, { view: "PLAYER" }) : s.view === "PLAYER" ? to(s, { view: "OVERVIEW" }) : s;
    case "FOLLOW_AGENT": return to(s, { view: "FOLLOW", selectedAgent: a.id, returnTo: s.view === "FOLLOW" ? s.returnTo : s.view === "OVERVIEW" || s.view === "FOCUS" ? "OVERVIEW" : "PLAYER" });
    case "EXIT_FOLLOW": return s.view === "FOLLOW" ? to(s, { view: s.returnTo === "OVERVIEW" ? "OVERVIEW" : "PLAYER" }) : s;
    case "FOCUS_AGENT": return s.view === "OVERVIEW" || s.view === "FOCUS" ? to(s, { view: "FOCUS", selectedAgent: a.id }) : s; // overview-only
    case "RETURN_TO_PLAYER": return s.view === "PLAYER" ? s : to(s, { view: "PLAYER" });
    case "OPEN_PANEL": return to(s, { panelOpen: true, selectedAgent: a.id });
    case "CLOSE_PANEL": return s.panelOpen ? to(s, { panelOpen: false }) : s;
    case "SELECT": return to(s, { selectedAgent: a.id });
    case "ESCAPE": // one Escape peels back exactly one layer: panel → follow → overview/focus → nothing
      if (s.panelOpen) return to(s, { panelOpen: false });
      if (s.view === "FOLLOW") return to(s, { view: s.returnTo === "OVERVIEW" ? "OVERVIEW" : "PLAYER" });
      if (s.view === "OVERVIEW" || s.view === "FOCUS") return to(s, { view: "PLAYER" });
      return s;
  }
}
/** The user-facing mode label (HUD pill). */
export const modeLabel = (loc: Locomotion, running: boolean, view: View) => (view === "FOLLOW" ? "FOLLOW" : view === "OVERVIEW" ? "OVERVIEW" : view === "FOCUS" ? "OVERVIEW · FOCUS" : loc === "AIR" ? "FLY" : running ? "RUN" : "WALK");
