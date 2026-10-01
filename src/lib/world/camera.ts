// Camera rig — pure (no three.js): computes the pose for each view, damps toward it, and blends between views with eased transitions
// (never a hard cut). The renderer copies `pose` onto the three.js camera.
import { COLLIDERS, groundHeight, insideSolid, type Collider } from "./layout";
import { clamp, damp, dampAngle, easeInOutCubic, lerp, wrapAngle } from "./math";
import type { PlayerState, View } from "./player";

export interface V3 { x: number; y: number; z: number }
export interface Pose { pos: V3; look: V3 }
const lerp3 = (a: V3, b: V3, t: number): V3 => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) });
const lerpPose = (a: Pose, b: Pose, t: number): Pose => ({ pos: lerp3(a.pos, b.pos, t), look: lerp3(a.look, b.look, t) });
export const lookDir = (yaw: number, pitch: number): V3 => ({ x: Math.sin(yaw) * Math.cos(pitch), y: -Math.sin(pitch), z: Math.cos(yaw) * Math.cos(pitch) }); // pitch > 0 looks DOWN

/** Spring arm: pull the camera in so it never ends up inside geometry or under the ground. */
export function springArm(target: V3, dir: V3, dist: number, colliders: Collider[] = COLLIDERS): V3 {
  let d = dist;
  for (let i = 0; i <= 12; i++) {
    const t = (i / 12) * dist, p = { x: target.x - dir.x * t, y: target.y - dir.y * t, z: target.z - dir.z * t };
    if (p.y < groundHeight(p.x, p.z) + 0.35 || insideSolid({ x: p.x, z: p.z }, p.y, colliders)) { d = Math.max(0.6, t - 0.5); break; }
  }
  const x = target.x - dir.x * d, z = target.z - dir.z * d;
  return { x, y: Math.max(target.y - dir.y * d, groundHeight(x, z) + 0.35), z };
}

export interface CameraInputs { lookYaw: number; lookPitch: number; overview: { yaw: number; pitch: number; dist: number; cx: number; cz: number }; followYaw: number; followPitch: number }
export interface Targets { player: PlayerState; agent: { x: number; y: number; z: number; heading: number } | null }

export const POSES = {
  player(p: PlayerState, yaw: number, pitch: number): Pose {
    const air = p.locomotion === "AIR", look = { x: p.x, y: p.y + (air ? 0.4 : 1.45), z: p.z }, dist = air ? 6.2 + Math.min(2, p.speed * 0.12) : 4.1;
    return { pos: springArm(look, lookDir(yaw, pitch), dist), look: { x: look.x, y: look.y + 0.15, z: look.z } };
  },
  overview(c: { yaw: number; pitch: number; dist: number; cx: number; cz: number }): Pose {
    const look = { x: c.cx, y: groundHeight(c.cx, c.cz) + 1, z: c.cz }, d = lookDir(c.yaw, c.pitch);
    return { pos: { x: look.x - d.x * c.dist, y: look.y - d.y * c.dist, z: look.z - d.z * c.dist }, look };
  },
  follow(a: { x: number; y: number; z: number; heading: number }, yawOffset: number, pitch: number): Pose {
    const yaw = a.heading + yawOffset, look = { x: a.x, y: a.y + 1.35, z: a.z };
    return { pos: springArm(look, lookDir(yaw, pitch), 5.2), look };
  },
};

export class CameraRig {
  pose: Pose; private from: Pose | null = null; private t = 1; private dur = 1.2; private lastSeq = -1; reducedMotion = false;
  constructor(initial: Pose) { this.pose = initial; }
  /** Call when the mode state changes (its `seq`): starts an eased blend from wherever the camera is NOW. */
  onViewChange(seq: number, view: View) {
    if (seq === this.lastSeq) return;
    this.lastSeq = seq; this.from = this.pose; this.t = 0;
    this.dur = (view === "OVERVIEW" || view === "FOCUS" ? 1.35 : view === "FOLLOW" ? 1.1 : 1.0) * (this.reducedMotion ? 0.2 : 1);
  }
  get blending() { return this.t < 1; }
  update(dt: number, view: View, tg: Targets, inp: CameraInputs): Pose {
    const d = clamp(dt, 0, 0.05);
    let desired: Pose;
    if (view === "OVERVIEW") desired = POSES.overview(inp.overview);
    else if (view === "FOCUS" && tg.agent) desired = POSES.overview({ ...inp.overview, cx: tg.agent.x, cz: tg.agent.z, dist: Math.min(inp.overview.dist, 34) });
    else if (view === "FOLLOW" && tg.agent) desired = POSES.follow(tg.agent, inp.followYaw, inp.followPitch);
    else desired = POSES.player(tg.player, inp.lookYaw, inp.lookPitch);
    if (this.t < 1 && this.from) {
      this.t = Math.min(1, this.t + d / this.dur);
      this.pose = lerpPose(this.from, desired, easeInOutCubic(this.t));
      return this.pose;
    }
    const lam = view === "PLAYER" ? 9 : view === "FOLLOW" ? 5 : 6;
    this.pose = { pos: { x: damp(this.pose.pos.x, desired.pos.x, lam, d), y: damp(this.pose.pos.y, desired.pos.y, lam, d), z: damp(this.pose.pos.z, desired.pos.z, lam, d) }, look: { x: damp(this.pose.look.x, desired.look.x, lam * 1.4, d), y: damp(this.pose.look.y, desired.look.y, lam * 1.4, d), z: damp(this.pose.look.z, desired.look.z, lam * 1.4, d) } };
    return this.pose;
  }
}
export { dampAngle, wrapAngle };
