// Operator/player locomotion — a pure, frame-rate-independent step function plus the mode state machine (WALK/RUN/FLY, OVERVIEW/FOLLOW/FOCUS views).
// No WebGL, no DOM: the renderer only reads the resulting state.
import { BOUNDS, WATER_BLOCK_DEPTH, supportHeight, ceilingAt, resolveCollisions, COLLIDERS, type Collider } from "./layout";
import { clamp, damp, dampAngle, forward, wrapAngle, type V2 } from "./math";

export type FlightTier = "NORMAL" | "FAST" | "TURBO";
export const FLIGHT_TIERS: FlightTier[] = ["NORMAL", "FAST", "TURBO"];
export const TUNING = {
  // ground: walking stays comfortable; sprinting is clearly faster and builds/stops with weight
  walk: 3.6, run: 8.6, accelGround: 10, accelRun: 8, decelGround: 12, decelRun: 9, airControl: 3.2, airDrag: 0.5, turnLambda: 12,
  // jumping: apex ≈ 1.2 m, ~0.75 s in the air; gravity is a little stronger than real for a snappy arc
  jumpV: 6.8, gravity: 19.5, terminal: 24, headroom: 1.8,
  // flight tiers: top speed (m/s), acceleration lambda, vertical speed. Turbo crosses the whole town in a few seconds but still ramps up/down.
  flyTiers: { NORMAL: { top: 20, accel: 2.6, vert: 9 }, FAST: { top: 46, accel: 1.9, vert: 14 }, TURBO: { top: 98, accel: 1.15, vert: 22 } },
  flyDamp: 2.2, flyDampFast: 1.9, flyDecel: 2.0, brakeLam: 7.5, flyBrakeVert: 6, takeoffLift: 6.5, takeoffTime: 0.7, landSpeedMax: 12, landHSpeedBase: 4,
  radius: 0.38, eye: 1.7, minHover: 0.9, ceiling: 130, airRadius: 190, stepUp: 0.5,
} as const;

export type Locomotion = "GROUND" | "AIR";
export interface PlayerState {
  x: number; y: number; z: number; vx: number; vz: number; vy: number; heading: number; // heading = facing yaw
  locomotion: Locomotion; running: boolean; takeoff: number; landing: boolean; grounded: boolean; speed: number; bank: number;
  /** true while the Space key that started a jump is still held (no auto-repeat), and the flight tier / brake last requested (HUD) */
  jumpLock: boolean; tier: FlightTier; braking: boolean; jumped: boolean;
}
export interface PlayerInput { moveX: number; moveZ: number; /** −1..1; forward = +moveZ in camera space */ cameraYaw: number; run: boolean; up: number; down: number; boost: boolean; jump?: boolean; tier?: FlightTier; brake?: boolean }

export const PLAYER_START = { x: -14, z: -7.2, yaw: Math.PI } as const;
export const startPlayer = (x: number = PLAYER_START.x, z: number = PLAYER_START.z): PlayerState => ({ x, y: supportHeight(x, z, 1.2), z, vx: 0, vz: 0, vy: 0, heading: PLAYER_START.yaw, locomotion: "GROUND", running: false, takeoff: 0, landing: false, grounded: true, speed: 0, bank: 0, jumpLock: false, tier: "NORMAL", braking: false, jumped: false });

/** Camera-relative desired direction (unit-length at most). */
export function desiredDirection(i: PlayerInput): V2 {
  const l = Math.hypot(i.moveX, i.moveZ), k = l > 1 ? 1 / l : 1, f = forward(i.cameraYaw), r = { x: -Math.cos(i.cameraYaw), z: Math.sin(i.cameraYaw) }; // right-hand side when looking along `forward`
  return { x: (f.x * i.moveZ + r.x * i.moveX) * k, z: (f.z * i.moveZ + r.z * i.moveX) * k };
}

export function toggleFly(s: PlayerState): PlayerState {
  if (s.locomotion === "GROUND") return { ...s, locomotion: "AIR", takeoff: TUNING.takeoffTime, landing: false, grounded: false, vy: TUNING.takeoffLift, jumpLock: true };
  return { ...s, landing: !s.landing }; // in the air: toggle an assisted landing (descend until the ground, then walk)
}

/** The tier actually flown: the cruise tier the player set ([ ] keys / BOOST button), raised by holding Shift (FAST) or a double-tap-held Shift (TURBO). */
export function effectiveTier(cruise: FlightTier, shiftHeld: boolean, turboLatch: boolean): FlightTier {
  const rank = (t: FlightTier) => FLIGHT_TIERS.indexOf(t); let r = rank(cruise);
  if (shiftHeld) r = Math.max(r, 1); if (shiftHeld && turboLatch) r = 2;
  return FLIGHT_TIERS[r];
}
export const stepTier = (t: FlightTier, d: 1 | -1): FlightTier => FLIGHT_TIERS[clamp(FLIGHT_TIERS.indexOf(t) + d, 0, 2)];

/** A rising body stops under a ceiling (head room {@link TUNING.headroom}) and starts to fall. */
export function headroomClamp(ny: number, vy: number, ceil: number, floorY: number): { y: number; vy: number } { return vy > 0 && ny + TUNING.headroom > ceil ? { y: Math.max(floorY, ceil - TUNING.headroom), vy: 0 } : { y: ny, vy }; }

/** One simulation step. Same trajectory (within tolerance) at 30/60/144 Hz because everything uses exponential damping and clamps dt. */
export function stepPlayer(s: PlayerState, input: PlayerInput, rawDt: number, colliders: Collider[] = COLLIDERS): PlayerState {
  const dt = clamp(rawDt, 0, 0.05); // a stalled tab must never teleport the player
  if (dt === 0) return s;
  const dir = desiredDirection(input), mag = Math.hypot(dir.x, dir.z), n: PlayerState = { ...s, jumped: false };
  if (s.locomotion === "GROUND") {
    const grounded = s.grounded, wantRun = input.run && mag > 0.1, running = grounded ? wantRun : s.running;
    const top = (running ? TUNING.run : TUNING.walk) * Math.min(1, mag);
    const tvx = mag > 0.01 ? (dir.x / mag) * top : 0, tvz = mag > 0.01 ? (dir.z / mag) * top : 0;
    // on the ground: quick acceleration, weighty sprint build-up, firm stopping; in the air: momentum is kept with gentle steering
    const lam = !grounded ? (mag > 0.01 ? TUNING.airControl : TUNING.airDrag) : mag > 0.01 ? (running ? TUNING.accelRun : TUNING.accelGround) : (s.running ? TUNING.decelRun : TUNING.decelGround);
    n.vx = damp(s.vx, tvx, lam, dt); n.vz = damp(s.vz, tvz, lam, dt); n.running = running;
    const sp = Math.hypot(n.vx, n.vz); if (sp > 0.25) n.heading = dampAngle(s.heading, Math.atan2(n.vx, n.vz), TUNING.turnLambda, dt);
    // jump: only from the ground, once per key press
    let vy = grounded ? 0 : s.vy, nowGrounded = grounded, jumpLock = s.jumpLock && !!input.jump;
    if (input.jump && grounded && !s.jumpLock) { vy = TUNING.jumpV; nowGrounded = false; jumpLock = true; n.jumped = true; }
    let nx = s.x + n.vx * dt, nz = s.z + n.vz * dt;
    nx = clamp(nx, BOUNDS.minX, BOUNDS.maxX); nz = clamp(nz, BOUNDS.minZ, BOUNDS.maxZ);
    const sup = (x: number, z: number) => supportHeight(x, z, s.y), ok = (h: number) => h >= WATER_BLOCK_DEPTH && (!grounded || h - s.y <= TUNING.stepUp);
    if (!ok(sup(nx, nz))) { nx = s.x; nz = s.z; n.vx = 0; n.vz = 0; } // water / too-steep: stop (slide handled by the per-axis retry below)
    if (nx === s.x && nz === s.z) { // try sliding along one axis
      const ax = clamp(s.x + s.vx * dt, BOUNDS.minX, BOUNDS.maxX), az = clamp(s.z + s.vz * dt, BOUNDS.minZ, BOUNDS.maxZ);
      if (ok(sup(ax, s.z))) { nx = ax; n.vx = s.vx; } else if (ok(sup(s.x, az))) { nz = az; n.vz = s.vz; }
    }
    if (nowGrounded) {
      const r = resolveCollisions({ x: nx, z: nz }, TUNING.radius, s.y, 1.7, colliders);
      n.x = r.x; n.z = r.z; n.y = damp(s.y, supportHeight(r.x, r.z, s.y), 18, dt); n.vy = 0; n.grounded = true; n.jumpLock = jumpLock;
    } else { // airborne on foot: gravity arc, ceiling stop, landing on whatever surface is underneath
      vy = Math.max(-TUNING.terminal, vy - TUNING.gravity * dt); let ny = s.y + vy * dt;
      const r = resolveCollisions({ x: nx, z: nz }, TUNING.radius, ny, 1.7, colliders); nx = r.x; nz = r.z;
      const hc = headroomClamp(ny, vy, ceilingAt(nx, nz, s.y + 0.9), s.y); ny = hc.y; vy = hc.vy;
      const sh = supportHeight(nx, nz, Math.max(ny, s.y), TUNING.stepUp * 0.4);
      if (vy <= 0 && ny <= sh + 0.001) { ny = sh; vy = 0; nowGrounded = true; }
      n.x = nx; n.z = nz; n.y = ny; n.vy = vy; n.grounded = nowGrounded; n.jumpLock = jumpLock;
    }
    n.speed = Math.hypot(n.vx, n.vz); n.bank = damp(s.bank, 0, 8, dt); n.takeoff = 0; n.landing = false; n.braking = false;
    return n;
  }
  // ---- AIR (flight) ----
  const tier = input.tier ?? "NORMAL", T = TUNING.flyTiers[tier], cur = Math.hypot(s.vx, s.vz), gh = supportHeight(s.x, s.z, s.y, 0.3), alt = s.y - gh, brake = !!input.brake;
  const descending0 = (s.landing || input.down > 0) && s.takeoff <= 0;
  let topSpeed = T.top * Math.min(1, mag);
  if (s.landing && s.takeoff <= 0) topSpeed = Math.min(topSpeed, TUNING.landHSpeedBase + alt * 1.2); // landing always sheds speed before touchdown, even from turbo
  const tvx = mag > 0.01 ? (dir.x / mag) * topSpeed : 0, tvz = mag > 0.01 ? (dir.z / mag) * topSpeed : 0;
  const lam = brake ? TUNING.brakeLam : s.landing ? 3.2 : mag > 0.01 ? (topSpeed < cur * 0.85 ? TUNING.flyDecel : T.accel) : cur > 40 ? TUNING.flyDampFast : TUNING.flyDamp;
  n.vx = damp(s.vx, brake ? 0 : tvx, lam, dt); n.vz = damp(s.vz, brake ? 0 : tvz, lam, dt);
  let tvy = (input.up - input.down) * T.vert;
  if (brake) tvy *= 0.5;
  if (s.takeoff > 0) { tvy = Math.max(tvy, TUNING.takeoffLift * (s.takeoff / TUNING.takeoffTime) + 1.2); n.takeoff = Math.max(0, s.takeoff - dt); }
  if (s.landing && s.takeoff <= 0) tvy = -Math.min(TUNING.landSpeedMax, 1 + alt * 0.6);
  // terrain look-ahead: start climbing before a hillside arrives, so fast flight never scrapes or snaps up
  let ahead = gh; for (const t of [0.3, 0.6, 0.9]) ahead = Math.max(ahead, supportHeight(s.x + s.vx * t, s.z + s.vz * t, s.y, 0.3));
  if (!descending0 && ahead + TUNING.minHover > s.y) tvy = Math.max(tvy, Math.min(18, (ahead + TUNING.minHover - s.y) * 2.5));
  n.vy = damp(s.vy, tvy, 4, dt);
  // substeps: at turbo speed a single frame covers several metres, so move in ≤0.5 m slices and resolve collisions each slice (no tunnelling through walls)
  const travel = (Math.hypot(n.vx, n.vz) + Math.abs(n.vy)) * dt, k = clamp(Math.ceil(travel / 0.5), 1, 14), h = dt / k;
  let nx = s.x, nz = s.z, ny = s.y;
  for (let i = 0; i < k; i++) {
    nx += n.vx * h; nz += n.vz * h; ny += n.vy * h;
    const rr = Math.hypot(nx, nz); if (rr > TUNING.airRadius) { nx *= TUNING.airRadius / rr; nz *= TUNING.airRadius / rr; }
    const r = resolveCollisions({ x: nx, z: nz }, TUNING.radius + 0.4, ny - 0.5, 1.0, colliders, 0.0); // collide with anything that overlaps our body
    const cx = r.x - nx, cz = r.z - nz, cm = Math.hypot(cx, cz);
    if (cm > 1e-4) { const ux = cx / cm, uz = cz / cm, vn = n.vx * ux + n.vz * uz; if (vn < 0) { n.vx -= vn * ux; n.vz -= vn * uz; } } // slide along the wall: kill only the velocity INTO it
    nx = r.x; nz = r.z;
    const g0 = supportHeight(nx, nz, ny, 0.3); if (ny < g0 + 0.2 && !descending0) ny = g0 + 0.2; // terrain safety per slice
  }
  const gh2 = supportHeight(nx, nz, ny, 0.3), descending = (s.landing || input.down > 0) && s.takeoff <= 0;
  const deep = gh2 < -0.15, floor = deep ? 0.5 : gh2 + (descending ? 0 : TUNING.minHover * 0.5); // over water you hover above the sea; on land a low hover unless landing
  const wantLand = descending && !deep && ny <= gh2 + 0.35;
  if (wantLand && gh2 >= WATER_BLOCK_DEPTH) { n.locomotion = "GROUND"; n.landing = false; n.y = gh2; n.vy = 0; n.vx *= 0.4; n.vz *= 0.4; n.grounded = true; n.x = nx; n.z = nz; n.speed = Math.hypot(n.vx, n.vz); n.tier = tier; n.braking = brake; n.jumpLock = !!input.jump; return n; }
  ny = clamp(ny, floor, TUNING.ceiling); // over water the "floor" is the sea surface; you hover, you never sink
  n.x = nx; n.y = ny; n.z = nz; n.grounded = false; n.speed = Math.hypot(n.vx, n.vz); n.tier = tier; n.braking = brake; n.jumpLock = !!input.jump;
  if (n.speed > 0.4) n.heading = dampAngle(s.heading, Math.atan2(n.vx, n.vz), 5, dt);
  n.bank = damp(s.bank, clamp(-wrapAngle(Math.atan2(n.vx, n.vz) - s.heading) * 0.6 * Math.min(1, n.speed / 10), -0.5, 0.5), 5, dt);
  return n;
}

// ---- mode state machine -------------------------------------------------------------------------------------------------------
export type View = "PLAYER" | "OVERVIEW" | "FOLLOW" | "FOCUS";
export interface ModeState { view: View; returnTo: Exclude<View, "FOLLOW" | "FOCUS"> | "PLAYER"; panelOpen: boolean; selectedAgent: string | null; changedAt: number; seq: number; commandOpen: boolean; wheelOpen: boolean; suiteOpen: boolean }
export type ModeAction =
  | { type: "TOGGLE_OVERVIEW" } | { type: "FOLLOW_AGENT"; id: string } | { type: "EXIT_FOLLOW" } | { type: "FOCUS_AGENT"; id: string } | { type: "RETURN_TO_PLAYER" }
  | { type: "OPEN_PANEL"; id: string } | { type: "CLOSE_PANEL" } | { type: "ESCAPE" } | { type: "SELECT"; id: string | null }
  | { type: "TOGGLE_COMMAND" } | { type: "OPEN_COMMAND" } | { type: "CLOSE_COMMAND" } | { type: "TOGGLE_WHEEL" } | { type: "CLOSE_WHEEL" } | { type: "OPEN_SUITE" } | { type: "CLOSE_SUITE" };
export const initialMode = (): ModeState => ({ view: "PLAYER", returnTo: "PLAYER", panelOpen: false, selectedAgent: null, changedAt: 0, seq: 0, commandOpen: false, wheelOpen: false, suiteOpen: false });
const to = (s: ModeState, p: Partial<ModeState>): ModeState => ({ ...s, ...p, seq: s.seq + 1 });

export function reduceMode(s: ModeState, a: ModeAction): ModeState {
  switch (a.type) {
    case "TOGGLE_OVERVIEW": return s.view === "OVERVIEW" || s.view === "FOCUS" ? to(s, { view: "PLAYER" }) : s.view === "PLAYER" ? to(s, { view: "OVERVIEW", wheelOpen: false }) : s;
    case "FOLLOW_AGENT": return to(s, { view: "FOLLOW", selectedAgent: a.id, returnTo: s.view === "FOLLOW" ? s.returnTo : s.view === "OVERVIEW" || s.view === "FOCUS" ? "OVERVIEW" : "PLAYER", wheelOpen: false });
    case "EXIT_FOLLOW": return s.view === "FOLLOW" ? to(s, { view: s.returnTo === "OVERVIEW" ? "OVERVIEW" : "PLAYER" }) : s;
    case "FOCUS_AGENT": return to(s, { view: "FOCUS", selectedAgent: a.id, wheelOpen: false }); // works from anywhere (Founder Command focuses remotely)
    case "RETURN_TO_PLAYER": return s.view === "PLAYER" ? s : to(s, { view: "PLAYER" });
    case "OPEN_PANEL": return to(s, { panelOpen: true, selectedAgent: a.id });
    case "CLOSE_PANEL": return s.panelOpen ? to(s, { panelOpen: false }) : s;
    case "SELECT": return to(s, { selectedAgent: a.id });
    case "TOGGLE_COMMAND": return to(s, { commandOpen: !s.commandOpen, wheelOpen: false, suiteOpen: false });
    case "OPEN_COMMAND": return s.commandOpen ? s : to(s, { commandOpen: true, wheelOpen: false, suiteOpen: false });
    case "CLOSE_COMMAND": return s.commandOpen ? to(s, { commandOpen: false }) : s;
    case "TOGGLE_WHEEL": return to(s, { wheelOpen: !s.wheelOpen });
    case "CLOSE_WHEEL": return s.wheelOpen ? to(s, { wheelOpen: false }) : s;
    case "OPEN_SUITE": return to(s, { suiteOpen: true, commandOpen: false, wheelOpen: false });
    case "CLOSE_SUITE": return s.suiteOpen ? to(s, { suiteOpen: false }) : s;
    case "ESCAPE": // one Escape peels back exactly one layer: wheel → suite panel → agent panel → Founder Command → follow → overview/focus → nothing
      if (s.wheelOpen) return to(s, { wheelOpen: false });
      if (s.suiteOpen) return to(s, { suiteOpen: false });
      if (s.panelOpen) return to(s, { panelOpen: false });
      if (s.commandOpen) return to(s, { commandOpen: false });
      if (s.view === "FOLLOW") return to(s, { view: s.returnTo === "OVERVIEW" ? "OVERVIEW" : "PLAYER" });
      if (s.view === "OVERVIEW" || s.view === "FOCUS") return to(s, { view: "PLAYER" });
      return s;
  }
}
/** The user-facing mode label (HUD pill). */
export const modeLabel = (loc: Locomotion, running: boolean, view: View, tier: FlightTier = "NORMAL", airborne = false) => (view === "FOLLOW" ? "FOLLOW" : view === "OVERVIEW" ? "OVERVIEW" : view === "FOCUS" ? "OVERVIEW · FOCUS" : loc === "AIR" ? (tier === "NORMAL" ? "FLY" : tier) : airborne ? "JUMP" : running ? "RUN" : "WALK");
