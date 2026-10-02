// Agent behaviour for the world: destination choice, path following, believable turning, sitting, working at a workspace, short breaks,
// visual-only conversations, yielding. Pure + seeded. Cosmetic ambient behaviour runs ONLY while the backend/fixture opState is IDLE;
// a WORKING agent goes to its workspace and works there. Real status always overrides the cosmetic layer.
import { angleDelta, clamp, damp, dist2, forward, rng, wrapAngle, yawTo, type Rng, type V2 } from "./math";
import { routeTo, type NavPoint } from "./nav";
import { SPOTS, resolveCollisions, supportHeight } from "./layout";

export type AgentAnim = "idle" | "walk" | "work" | "look" | "sit" | "sit-work" | "talk";
export type AgentMode = "STAND" | "TURN" | "WALK" | "WORK" | "SIT" | "HOLD";
export interface AgentBrain {
  id: string; x: number; y: number; z: number; yaw: number; speed: number; turnRate: number; mode: AgentMode; anim: AgentAnim; timer: number;
  path: NavPoint[]; pathIdx: number; destId: string | null; destLabel: string | null; faceAtDest: number | null;
  /** cosmetic: what the idle behaviour is doing (null when WORKING) */ ambient: string | null; lastSpot: string | null; yield: number; lookPhase: number; seated: boolean; talkWith: string | null; stuck: number;
}
export interface AgentProfile { id: string; workspace: string; idleSpots: string[]; startSpot: string }
export type OpState = "IDLE" | "WORKING" | "WAITING" | "BLOCKED" | "FAILED" | "PAUSED";
export interface AgentCtx { opState: OpState; player: V2 & { y: number }; hold: boolean; rand: Rng; others: { id: string; x: number; z: number; y: number }[] }

export const AGENT = { walk: 1.3, accel: 3.2, turnLambda: 5.5, radius: 0.4, arriveDist: 1.6, waypointReach: 0.4, maxStep: 2.2, maxTurn: 3.2 } as const;
const spotById = new Map(SPOTS.map((s) => [s.id, s]));
export const spotOf = (id: string) => { const s = spotById.get(id); if (!s) throw new Error(`unknown spot ${id}`); return s; };
const turnToward = (yaw: number, want: number, lambda: number, dt: number, maxRate: number = AGENT.maxTurn) => { const d = angleDelta(yaw, want), step = clamp(d * (1 - Math.exp(-lambda * dt)), -maxRate * dt, maxRate * dt); return wrapAngle(yaw + step); };
const isSeat = (k: string) => k === "sit" || k === "work-sit";
const SEATS = SPOTS.filter((q) => isSeat(q.kind)).map((q) => ({ x: q.x, z: q.z, y: Number.isNaN(q.y) ? supportHeight(q.x, q.z, 1.2) : q.y }));

export function startAgent(p: AgentProfile, opState: OpState = "IDLE"): AgentBrain {
  const s = spotOf(p.startSpot), y = Number.isNaN(s.y) ? supportHeight(s.x, s.z, 1.2) : s.y, seated = isSeat(s.kind), working = opState === "WORKING" && p.startSpot === p.workspace;
  return { id: p.id, x: s.x, y, z: s.z, yaw: s.yaw, speed: 0, turnRate: 0, mode: seated ? (working ? "WORK" : "SIT") : "STAND", anim: seated ? (working ? "sit-work" : "sit") : "idle", timer: 6 + (p.id.length % 7), path: [], pathIdx: 0, destId: null, destLabel: null, faceAtDest: null, ambient: s.label, lastSpot: p.startSpot, yield: 0, lookPhase: p.id.length * 1.7, seated, talkWith: null, stuck: 0 };
}

function pickSpot(b: AgentBrain, profile: AgentProfile, r: Rng) {
  const pool = profile.idleSpots.map(spotOf).filter((s) => s.id !== b.lastSpot), total = pool.reduce((a, s) => a + s.weight, 0);
  let x = r.next() * total; for (const s of pool) { x -= s.weight; if (x <= 0) return s; } return pool[0];
}
const startWalk = (b: AgentBrain, spotId: string, label: string): AgentBrain | null => {
  const s = spotOf(spotId), route = routeTo({ x: b.x, z: b.z, y: b.y }, spotId); if (!route) return null;
  return { ...b, mode: "TURN", path: route, pathIdx: 1, destId: spotId, destLabel: s.label, faceAtDest: s.yaw, anim: "idle", timer: 0, ambient: label, stuck: 0, seated: false };
};

export function stepAgent(b0: AgentBrain, dt0: number, ctx: AgentCtx, profile: AgentProfile): AgentBrain {
  const dt = Math.min(dt0, 0.05); if (dt <= 0) return b0;
  let b: AgentBrain = { ...b0, lookPhase: b0.lookPhase + dt };
  const working = ctx.opState === "WORKING", ws = spotOf(profile.workspace), atWork = dist2(b, ws) < 0.5 && Math.abs(b.y - (Number.isNaN(ws.y) ? b.y : ws.y)) < 1.2;

  // 1) interruptions: the operator opened this agent's panel → stop and wait; real work status overrides idling
  if (b.mode === "HOLD") { if (!ctx.hold) b = { ...b, mode: b.path.length ? "WALK" : "STAND", timer: 1 + ctx.rand.next() * 2 }; }
  else if (ctx.hold && (b.mode === "WALK" || b.mode === "TURN")) b = { ...b, mode: "HOLD" };
  if (working && b.mode !== "WORK" && b.destId !== profile.workspace && b.mode !== "HOLD") {
    const w = startWalk({ ...b, seated: false }, profile.workspace, "heading to " + ws.label); if (w) b = { ...w, ambient: null };
  } else if (!working && b.mode === "WORK") b = { ...b, mode: "STAND", anim: "idle", timer: 2.5, ambient: "finished — stretching", destId: null, destLabel: null, seated: false };
  if (!working && b.destId === profile.workspace && b.mode !== "WORK") b = { ...b, mode: "STAND", path: [], destId: null, timer: 1 };

  // 2) behaviour
  switch (b.mode) {
    case "STAND": {
      const timer = b.timer - dt, near = ctx.others.find((o) => o.id !== b.id && Math.abs(o.y - b.y) < 1.5 && Math.hypot(o.x - b.x, o.z - b.z) < 3.0 && Math.hypot(o.x - b.x, o.z - b.z) > 0.7);
      const look = Math.sin(b.lookPhase * 0.7) > 0.93;
      b = { ...b, timer, speed: damp(b.speed, 0, 8, dt), turnRate: 0, anim: near && !working ? "talk" : look ? "look" : "idle", talkWith: near && !working ? near.id : null, seated: false };
      if (near && !working) b = { ...b, yaw: turnToward(b.yaw, yawTo(b, near), 3, dt) }; // face the other agent (visual-only conversation)
      if (working && atWork) { const kind = ws.kind; b = { ...b, mode: "WORK", anim: kind === "work-sit" ? "sit-work" : "work", ambient: null, seated: kind === "work-sit" }; break; }
      if (!working && timer <= 0 && !ctx.hold) {
        const spot = pickSpot(b, profile, ctx.rand), w = startWalk(b, spot.id, `walking to ${spot.label}`);
        b = w ? { ...w, lastSpot: spot.id } : { ...b, timer: 4 };
      }
      break;
    }
    case "TURN": {
      const next = b.path[b.pathIdx] ?? b.path[b.path.length - 1], want = Math.atan2(next.x - b.x, next.z - b.z), yaw = turnToward(b.yaw, want, AGENT.turnLambda, dt);
      b = { ...b, yaw, speed: damp(b.speed, 0, 8, dt), turnRate: wrapAngle(yaw - b.yaw) / dt, anim: "walk" };
      if (Math.abs(angleDelta(yaw, want)) < 0.35) b = { ...b, mode: "WALK" };
      break;
    }
    case "WALK": b = walk(b, dt, ctx, profile); break;
    case "WORK": { const k = ws.kind; b = { ...b, anim: k === "work-sit" ? "sit-work" : "work", seated: k === "work-sit", speed: damp(b.speed, 0, 8, dt), turnRate: 0, yaw: turnToward(b.yaw, ws.yaw, 4, dt) }; break; }
    case "SIT": {
      const timer = b.timer - dt; b = { ...b, timer, anim: "sit", seated: true, speed: damp(b.speed, 0, 8, dt), turnRate: 0, yaw: turnToward(b.yaw, b.faceAtDest ?? b.yaw, 3, dt) };
      if (working || (timer <= 0 && !ctx.hold)) b = { ...b, mode: "STAND", anim: "idle", timer: 1.2, seated: false }; // stands up before doing anything else
      break;
    }
    case "HOLD": b = { ...b, speed: damp(b.speed, 0, 7, dt), turnRate: 0, anim: b.seated ? "sit" : "idle" }; break;
  }

  // 3) integrate (position changes only through speed along the heading → no teleporting) + collisions + floor height
  const f = forward(b.yaw), step = Math.min(b.speed * dt, AGENT.maxStep * dt);
  let x = b.x + f.x * step, z = b.z + f.z * step;
  const dest = b.destId ? spotOf(b.destId) : null, seating = !!dest && isSeat(dest.kind) && Math.hypot(dest.x - b.x, dest.z - b.z) < 1.7; // the last stretch into a seat may overlap the furniture
  const leavingSeat = SEATS.some((q) => Math.abs(q.y - b.y) < 1 && Math.hypot(q.x - b.x, q.z - b.z) < 1.3); // standing up from / sitting down at furniture overlaps it for a moment
  if ((b.mode === "WALK" || b.mode === "TURN") && !seating && !leavingSeat) { const r = resolveCollisions({ x, z }, AGENT.radius, b.y, 1.7), cx = r.x - x, cz = r.z - z, cm = Math.hypot(cx, cz), lim = AGENT.maxStep * dt; // standing up out of a chair slides clear of it rather than popping
    if (cm > lim) { x += (cx / cm) * lim; z += (cz / cm) * lim; } else { x = r.x; z = r.z; } }
  const sy = supportHeight(x, z, b.y);
  return { ...b, x, z, y: damp(b.y, sy, 14, dt) };
}

function walk(b: AgentBrain, dt: number, ctx: AgentCtx, profile: AgentProfile): AgentBrain {
  let idx = b.pathIdx;
  while (idx < b.path.length && dist2(b, b.path[idx]) < AGENT.waypointReach) idx++;
  if (idx >= b.path.length) { // arrived
    const spot = b.destId ? spotOf(b.destId) : null, isWork = b.destId === profile.workspace, seat = !!spot && isSeat(spot.kind);
    if (isWork) return { ...b, pathIdx: idx, path: [], mode: "STAND", speed: damp(b.speed, 0, 8, dt), timer: 0.4, anim: "idle", yaw: spot ? turnToward(b.yaw, spot.yaw, 3, dt) : b.yaw };
    return { ...b, pathIdx: idx, path: [], speed: damp(b.speed, 0, 8, dt), mode: seat ? "SIT" : "STAND", timer: seat ? 18 + ctx.rand.next() * 30 : 6 + ctx.rand.next() * 10, anim: seat ? "sit" : "idle", seated: seat, yaw: spot ? turnToward(b.yaw, spot.yaw, 3, dt) : b.yaw, ambient: b.destLabel, faceAtDest: spot?.yaw ?? null };
  }
  const target = b.path[idx], remain = b.path.slice(idx).reduce((s, p, i, a) => (i ? s + dist2(a[i - 1], p) : dist2(b, p)), 0);
  const want = Math.atan2(target.x - b.x, target.z - b.z), err = angleDelta(b.yaw, want);
  // yield to the operator or another agent walking right in front of us (no shoving, no constant collisions)
  const ahead = (p: V2, y: number) => Math.abs(y - b.y) < 1.5 && dist2(b, p) < 1.7 && Math.abs(angleDelta(b.yaw, Math.atan2(p.x - b.x, p.z - b.z))) < 0.9;
  const blocker = ahead(ctx.player, ctx.player.y) || ctx.others.some((o) => o.id !== b.id && ahead(o, o.y) && (o.id < b.id)); // the lower id yields: no deadlock between two agents
  const arrive = Math.min(1, remain / AGENT.arriveDist), turnSlow = Math.max(0.15, 1 - Math.abs(err) / 1.1);
  const tv = blocker ? 0 : AGENT.walk * Math.max(0.25, arrive) * turnSlow, yaw = turnToward(b.yaw, want, AGENT.turnLambda, dt);
  // if we have been unable to move for a long time (blocked by something dynamic), re-plan from here
  const stuck = b.speed < 0.08 && !blocker ? b.stuck + dt : 0;
  if (stuck > 4 && b.destId) { const w = startWalk(b, b.destId, b.ambient ?? ""); if (w) return { ...w, stuck: 0 }; return { ...b, mode: "STAND", path: [], destId: null, timer: 3, stuck: 0 }; }
  return { ...b, pathIdx: idx, yaw, turnRate: wrapAngle(yaw - b.yaw) / dt, speed: damp(b.speed, tv, AGENT.accel, dt), anim: b.speed > 0.15 ? "walk" : "idle", yield: blocker ? b.yield + dt : 0, stuck };
}
export { rng };
