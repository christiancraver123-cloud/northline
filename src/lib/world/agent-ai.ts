// Agent behaviour for the world: destination choice, path following, believable turning, yielding, working. Pure + seeded.
// Cosmetic ambient behaviour (wandering) only ever runs while the BACKEND/fixture opState is IDLE; a WORKING agent goes to its work spot.
import { angleDelta, clamp, damp, dist2, forward, rng, wrapAngle, type Rng, type V2 } from "./math";
import { GRAPH, findPath, nearestNode, pathPoints, walkingCost } from "./nav";
import { IDLE_SPOTS, WORK_SPOT, groundHeight, nodeOf, resolveCollisions, type IdleSpot } from "./layout";

export type AgentAnim = "idle" | "walk" | "work" | "look";
export interface AgentBrain {
  x: number; y: number; z: number; yaw: number; speed: number; turnRate: number;
  mode: "STAND" | "TURN" | "WALK" | "WORK" | "HOLD";
  anim: AgentAnim; timer: number; path: V2[]; pathIdx: number; destId: string | null; destLabel: string | null; faceAtDest: number | null;
  /** cosmetic: what the idle behaviour is doing (null when WORKING) */
  ambient: string | null; lastSpot: string | null; yield: number; lookPhase: number;
}
export interface AgentCtx { opState: "IDLE" | "WORKING" | "WAITING" | "BLOCKED" | "FAILED" | "PAUSED"; player: V2 & { y: number }; hold: boolean; rand: Rng }

/** Ease toward a heading with a hard cap on angular speed: believable turning, never a snap. */
const turnToward = (yaw: number, want: number, lambda: number, dt: number, maxRate = 3.2) => { const d = angleDelta(yaw, want), step = clamp(d * (1 - Math.exp(-lambda * dt)), -maxRate * dt, maxRate * dt); return wrapAngle(yaw + step); };
export const AGENT = { walk: 1.28, accel: 3.2, turnLambda: 5.5, radius: 0.4, arriveDist: 1.6, waypointReach: 0.35, maxStep: 2 } as const;

export function startAgent(spot = "rail-mid"): AgentBrain {
  const s = IDLE_SPOTS.find((i) => i.id === spot) ?? IDLE_SPOTS[0], n = nodeOf(s.node);
  return { x: n.x, y: groundHeight(n.x, n.z), z: n.z, yaw: s.face, speed: 0, turnRate: 0, mode: "STAND", anim: "idle", timer: 3, path: [], pathIdx: 0, destId: null, destLabel: null, faceAtDest: null, ambient: s.label, lastSpot: s.id, yield: 0, lookPhase: 0 };
}

function routeTo(b: AgentBrain, toNode: string): V2[] | null {
  const from = nearestNode(b).id, ids = findPath(GRAPH, from, toNode, walkingCost);
  if (!ids) return null;
  return [{ x: b.x, z: b.z }, ...pathPoints(ids)];
}
function pickSpot(b: AgentBrain, r: Rng): IdleSpot {
  const pool = IDLE_SPOTS.filter((s) => s.id !== b.lastSpot), total = pool.reduce((a, s) => a + s.weight, 0);
  let x = r.next() * total; for (const s of pool) { x -= s.weight; if (x <= 0) return s; } return pool[0];
}
const setWalk = (b: AgentBrain, path: V2[], id: string, label: string, face: number | null): AgentBrain => ({ ...b, mode: "TURN", path, pathIdx: 1, destId: id, destLabel: label, faceAtDest: face, anim: "idle", timer: 0 });

export function stepAgent(b0: AgentBrain, dt0: number, ctx: AgentCtx): AgentBrain {
  const dt = Math.min(dt0, 0.05); if (dt <= 0) return b0;
  let b: AgentBrain = { ...b0, lookPhase: b0.lookPhase + dt };
  const working = ctx.opState === "WORKING";
  const atWork = dist2(b, WORK_SPOT) < 0.45;

  // 1) decide what to do next
  if (b.mode === "HOLD") { if (!ctx.hold) b = { ...b, mode: b.path.length ? "WALK" : "STAND", timer: 1 + ctx.rand.next() * 2 }; }
  else if (ctx.hold && b.mode === "WALK") b = { ...b, mode: "HOLD" }; // the operator opened the agent's panel: stop and wait politely
  if (working && b.mode !== "WORK" && b.destId !== "WORK" && b.mode !== "HOLD") {
    const route = routeTo(b, "WORK"); if (route) b = { ...setWalk(b, route, "WORK", "heading to the studio workstation", Math.PI), ambient: null };
  } else if (!working && (b.mode === "WORK")) {
    b = { ...b, mode: "STAND", anim: "idle", timer: 2.5, ambient: "finished — stretching" , destId: null, destLabel: null };
  }
  if (!working && b.destId === "WORK" && b.mode !== "WORK") b = { ...b, mode: "STAND", path: [], destId: null, timer: 1 };

  // 2) behaviour
  switch (b.mode) {
    case "STAND": {
      const timer = b.timer - dt;
      const look = Math.sin(b.lookPhase * 0.7) > 0.93; // occasional glance around (cosmetic)
      b = { ...b, timer, speed: damp(b.speed, 0, 8, dt), turnRate: 0, anim: look ? "look" : "idle" };
      if (working && atWork) { b = { ...b, mode: "WORK", anim: "work", ambient: null }; break; }
      if (!working && timer <= 0 && !ctx.hold) {
        const spot = pickSpot(b, ctx.rand), route = routeTo(b, spot.node);
        if (route) b = { ...setWalk(b, route, spot.id, spot.label, spot.face), lastSpot: spot.id, ambient: `walking to ${spot.label.replace(/^(looking out at|standing by|pausing (on|in)|waiting by) /, "")}` };
        else b = { ...b, timer: 4 };
      }
      break;
    }
    case "TURN": {
      const next = b.path[b.pathIdx] ?? b.path[b.path.length - 1];
      const want = Math.atan2(next.x - b.x, next.z - b.z), err = angleDelta(b.yaw, want);
      const yaw = turnToward(b.yaw, want, AGENT.turnLambda, dt);
      b = { ...b, yaw, speed: damp(b.speed, 0, 8, dt), turnRate: wrapAngle(yaw - b.yaw) / dt, anim: "walk" };
      if (Math.abs(angleDelta(yaw, want)) < 0.35) b = { ...b, mode: "WALK" };
      break;
    }
    case "WALK": b = walk(b, dt, ctx); break;
    case "WORK": b = { ...b, anim: "work", speed: damp(b.speed, 0, 8, dt), turnRate: 0, yaw: turnToward(b.yaw, Math.PI, 4, dt) }; break;
    case "HOLD": b = { ...b, speed: damp(b.speed, 0, 7, dt), turnRate: 0, anim: "idle" }; break;
  }

  // 3) integrate (position changes only through speed along the heading → no teleporting) + collisions + ground
  const f = forward(b.yaw), step = Math.min(b.speed * dt, AGENT.maxStep * dt);
  let x = b.x + f.x * step, z = b.z + f.z * step;
  if (b.mode === "WALK" || b.mode === "TURN") { const r = resolveCollisions({ x, z }, AGENT.radius, b.y); x = r.x; z = r.z; }
  return { ...b, x, z, y: damp(b.y, groundHeight(x, z), 14, dt) };
}

function walk(b: AgentBrain, dt: number, ctx: AgentCtx): AgentBrain {
  // advance past reached waypoints
  let idx = b.pathIdx;
  while (idx < b.path.length && dist2(b, b.path[idx]) < AGENT.waypointReach) idx++;
  if (idx >= b.path.length) { // arrived
    const working = b.destId === "WORK";
    return { ...b, pathIdx: idx, mode: working ? "STAND" : "STAND", speed: damp(b.speed, 0, 8, dt), timer: working ? 0.6 : 6 + ctx.rand.next() * 9, anim: "idle", path: [], yaw: b.faceAtDest != null ? turnToward(b.yaw, b.faceAtDest, 3, dt) : b.yaw, destId: working ? "WORK" : null, ambient: working ? null : b.destLabel };
  }
  const target = b.path[idx], remain = b.path.slice(idx).reduce((s, p, i, a) => (i ? s + dist2(a[i - 1], p) : dist2(b, p)), 0);
  const want = Math.atan2(target.x - b.x, target.z - b.z), err = angleDelta(b.yaw, want);
  // yield to the operator walking in front of us (no shoving, no constant collisions)
  const toP = dist2(b, ctx.player), ahead = Math.abs(angleDelta(b.yaw, Math.atan2(ctx.player.x - b.x, ctx.player.z - b.z))) < 0.9;
  const yielding = toP < 1.7 && ahead;
  const arrive = Math.min(1, remain / AGENT.arriveDist), turnSlow = Math.max(0.15, 1 - Math.abs(err) / 1.1);
  const tv = yielding ? 0 : AGENT.walk * Math.max(0.25, arrive) * turnSlow;
  const yaw = turnToward(b.yaw, want, AGENT.turnLambda, dt);
  return { ...b, pathIdx: idx, yaw, turnRate: wrapAngle(yaw - b.yaw) / dt, speed: damp(b.speed, tv, AGENT.accel, dt), anim: b.speed > 0.15 ? "walk" : "idle", yield: yielding ? b.yield + dt : 0 };
}
