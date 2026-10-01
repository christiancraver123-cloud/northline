"use client";
// The game loop + 3D scene. All rules live in src/lib/world (pure, tested); this file only reads input, advances those pure functions, and copies
// the results onto three.js objects. It owns NO Northline business logic and makes no network calls.
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { CameraRig, POSES, type CameraInputs } from "@/lib/world/camera";
import { canInteract, promptFor, type Eligibility } from "@/lib/world/interaction";
import { AGENT, startAgent, stepAgent, type AgentBrain } from "@/lib/world/agent-ai";
import { clamp, dampAngle, rng, yawTo } from "@/lib/world/math";
import { initialMode, modeLabel, reduceMode, startPlayer, stepPlayer, toggleFly, type ModeAction, type ModeState, type PlayerState } from "@/lib/world/player";
import { AdaptiveQuality, type TierConfig, type Tier } from "@/lib/world/quality";
import { FrameStats } from "@/lib/world/perf";
import type { WorldSnapshot } from "@/lib/world/schema";
import { groundHeight, BUILDING } from "@/lib/world/layout";
import type { Input } from "./input";
import { Avatar, type AvatarHandle } from "./scene/Avatars";
import { Terrain } from "./scene/Terrain";
import { Ocean } from "./scene/Ocean";
import { Sky } from "./scene/Sky";
import { Building } from "./scene/Building";
import { Vegetation } from "./scene/Vegetation";
import { Props } from "./scene/Props";
import { Backdrop } from "./scene/Backdrop";
import { PALETTE, SUN_DIR } from "./scene/context";

export interface HudState {
  modeLabel: string; view: ModeState["view"]; speed: number; altitude: number; prompt: string | null; canInteract: boolean; panelOpen: boolean; selectedAgent: string | null;
  following: boolean; ambient: string | null; agentMode: string; agentDist: number; locomotion: "GROUND" | "AIR"; landing: boolean;
}
export interface PerfState { fps: number; ms: number; low1: number; calls: number; tris: number; geometries: number; textures: number; dpr: number; tier: Tier; auto: boolean }
export interface GameProps {
  input: Input; snapshotRef: MutableRefObject<WorldSnapshot>; q: TierConfig; adaptive: MutableRefObject<AdaptiveQuality>; onTier: (t: Tier) => void;
  onHud: (h: HudState) => void; onPerf: (p: PerfState) => void; agentId: string; reducedMotion: boolean;
}
const SENS_PITCH_MIN = -0.55, SENS_PITCH_MAX = 1.25;

export function Game(p: GameProps) {
  const { camera, gl, scene } = useThree(), cam = camera as THREE.PerspectiveCamera;
  const player = useRef<PlayerState>(startPlayer()), brain = useRef<AgentBrain>(startAgent("rail-mid")), mode = useRef<ModeState>(initialMode()), eligibility = useRef<Eligibility>({ ok: false, reason: "too_far", distance: 99 });
  const look = useRef({ yaw: 0, pitch: 0.26, followYaw: 0, followPitch: 0.3, ov: { yaw: 0.5, pitch: 0.92, dist: 82, cx: -4, cz: 0 } });
  const rig = useRef<CameraRig>(new CameraRig(POSES.player(player.current, 0, 0.26))), rand = useMemo(() => rng(4242), []);
  const stats = useRef(new FrameStats(90)), acc = useRef({ hud: 0, perf: 0, t: 0, warm: 0 }), fov = useRef(62);
  const playerAv = useRef<AvatarHandle>(null), agentAv = useRef<AvatarHandle>(null), sun = useRef<THREE.DirectionalLight>(null), prevShadow = useRef<{ map: number; on: boolean }>({ map: 0, on: false });
  const ids = useMemo(() => ({ agent: p.agentId }), [p.agentId]);
  const shadows = p.q.shadows !== "off";

  useEffect(() => { rig.current.reducedMotion = p.reducedMotion; }, [p.reducedMotion]);
  useEffect(() => { // shadows on/off + map size follow the tier
    const l = sun.current; gl.shadowMap.enabled = shadows; gl.shadowMap.type = THREE.PCFSoftShadowMap;
    if (l) { l.castShadow = shadows; if (prevShadow.current.map !== p.q.shadowMap) { l.shadow.mapSize.set(p.q.shadowMap, p.q.shadowMap); l.shadow.map?.dispose(); l.shadow.map = null; } const r = Math.max(8, p.q.shadowRadius); Object.assign(l.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 160 }); l.shadow.camera.updateProjectionMatrix(); l.shadow.bias = -0.0005; l.shadow.normalBias = 0.05; }
    if (prevShadow.current.on !== shadows) scene.traverse((o) => { const m = (o as THREE.Mesh).material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => (x.needsUpdate = true)); });
    prevShadow.current = { map: p.q.shadowMap, on: shadows };
    scene.fog = new THREE.Fog(PALETTE.fog, 110, p.q.farFog); cam.far = p.q.far; cam.updateProjectionMatrix();
  }, [p.q, shadows, gl, scene, cam]);

  // dev/test hook (this route only exists in development / explicit local play-testing)
  useEffect(() => {
    const w = window as unknown as { __worldDev?: unknown };
    w.__worldDev = { state: () => ({ player: { ...player.current }, agent: { ...brain.current, path: undefined }, mode: { ...mode.current }, cam: { x: cam.position.x, y: cam.position.y, z: cam.position.z }, fov: cam.fov, eligibility: eligibility.current }), teleportPlayer: (x: number, z: number) => { player.current = startPlayer(x, z); }, setPlayer: (patch: Partial<PlayerState>) => { player.current = { ...player.current, ...patch }; }, setLook: (yaw: number, pitch: number) => { look.current.yaw = yaw; look.current.pitch = pitch; }, setMode: (a: ModeAction) => { mode.current = reduceMode(mode.current, a); }, setAgent: (x: number, z: number) => { brain.current = { ...brain.current, x, z, y: groundHeight(x, z), path: [], mode: "STAND", timer: 99 }; } };
    return () => { delete w.__worldDev; };
  }, [cam]);

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05), input = p.input, snap = p.snapshotRef.current, ag = snap.agents.find((a) => a.agentId === ids.agent), opState = ag?.opState ?? "IDLE";
    acc.current.t += dt; acc.current.warm += dt; stats.current.push(rawDelta * 1000);

    // ---- one-shot actions → mode machine / player ----
    const act = (a: ModeAction) => { mode.current = reduceMode(mode.current, a); };
    for (const a of input.drain()) {
      const view = mode.current.view;
      if (a === "overview") act({ type: "TOGGLE_OVERVIEW" });
      else if (a === "escape") { act({ type: "ESCAPE" }); input.releasePointer(); }
      else if (a === "follow") { if (view === "FOLLOW") act({ type: "EXIT_FOLLOW" }); else act({ type: "FOLLOW_AGENT", id: ids.agent }); }
      else if (a === "focus") act({ type: "FOCUS_AGENT", id: ids.agent });
      else if (a === "return") act({ type: "RETURN_TO_PLAYER" });
      else if (a === "toggleFly" && (view === "PLAYER")) player.current = toggleFly(player.current);
      else if (a === "interact") {
        if (mode.current.panelOpen) act({ type: "CLOSE_PANEL" });
        else if (eligibility.current.ok) { act({ type: "OPEN_PANEL", id: ids.agent }); input.releasePointer(); }
      }
    }

    // ---- look input ----
    const { dx, dy, wheel } = input.consumeLook(), v = mode.current.view, L = look.current;
    if (v === "PLAYER") { L.yaw -= dx; L.pitch = clamp(L.pitch + dy, SENS_PITCH_MIN, SENS_PITCH_MAX); }
    else if (v === "OVERVIEW" || v === "FOCUS") { L.ov.yaw -= dx * 1.3; L.ov.pitch = clamp(L.ov.pitch + dy * 1.1, 0.35, 1.45); L.ov.dist = clamp(L.ov.dist * Math.exp(wheel * 0.0012), 16, 150); }
    else if (v === "FOLLOW") { L.followYaw -= dx; L.followPitch = clamp(L.followPitch + dy, 0.05, 1.0); }

    // ---- player ----
    const ctrl = v === "PLAYER";
    if (v === "OVERVIEW") { // WASD pans the management view
      const sp = L.ov.dist * 0.6 * dt, f = { x: Math.sin(L.ov.yaw), z: Math.cos(L.ov.yaw) }; L.ov.cx = clamp(L.ov.cx + (f.x * input.moveZ - f.z * input.moveX) * sp, -70, 70); L.ov.cz = clamp(L.ov.cz + (f.z * input.moveZ + f.x * input.moveX) * sp, -50, 50);
    }
    let pl = stepPlayer(player.current, { moveX: ctrl ? input.moveX : 0, moveZ: ctrl ? input.moveZ : 0, cameraYaw: L.yaw, run: ctrl && input.run, up: ctrl ? input.up : 0, down: ctrl ? input.downAxis : 0, boost: ctrl && input.run }, dt);
    if (pl.locomotion === "AIR" && ctrl && input.downAxis > 0 && pl.takeoff <= 0) pl = { ...pl, landing: pl.landing }; // down alone just descends; landing completes on touchdown
    // agent is solid for the player (never walk through them), but only when roughly at their height
    const b0 = brain.current; if (pl.y - b0.y < 2.2) { const dxp = pl.x - b0.x, dzp = pl.z - b0.z, d = Math.hypot(dxp, dzp), min = 0.38 + AGENT.radius; if (d < min && d > 1e-4) pl = { ...pl, x: b0.x + (dxp / d) * min, z: b0.z + (dzp / d) * min }; }
    player.current = pl;

    // ---- agent ----
    const holdAgent = mode.current.panelOpen && mode.current.selectedAgent === ids.agent;
    let b = stepAgent(brain.current, dt, { opState, player: { x: pl.x, z: pl.z, y: pl.y }, hold: holdAgent, rand });
    if (b.mode === "HOLD" || (holdAgent && b.speed < 0.2)) b = { ...b, yaw: dampAngle(b.yaw, yawTo(b, pl), 3, dt) }; // politely turns to face the operator
    brain.current = b;

    // ---- interaction eligibility ----
    eligibility.current = canInteract(pl, { id: ids.agent, x: b.x, y: b.y, z: b.z }, mode.current.view, mode.current.panelOpen);

    // ---- camera ----
    const inp: CameraInputs = { lookYaw: L.yaw, lookPitch: L.pitch, overview: L.ov, followYaw: L.followYaw, followPitch: L.followPitch };
    rig.current.onViewChange(mode.current.seq, mode.current.view);
    const pose = rig.current.update(dt, mode.current.view, { player: pl, agent: { x: b.x, y: b.y, z: b.z, heading: b.yaw } }, inp);
    cam.position.set(pose.pos.x, pose.pos.y, pose.pos.z); cam.lookAt(pose.look.x, pose.look.y, pose.look.z);
    const tf = v === "OVERVIEW" || v === "FOCUS" ? 48 : 60 + clamp(pl.speed * (pl.locomotion === "AIR" ? 0.55 : 0.9), 0, 14); fov.current += (tf - fov.current) * (1 - Math.exp(-4 * dt)); if (Math.abs(cam.fov - fov.current) > 0.05) { cam.fov = fov.current; cam.updateProjectionMatrix(); }

    // ---- visuals ----
    const pa = playerAv.current, aa = agentAv.current;
    if (pa) {
      pa.group.position.set(pl.x, pl.y, pl.z); pa.group.rotation.y = pl.heading;
      const air = pl.locomotion === "AIR", sp = pl.speed;
      pa.setPose({ walk: air ? 0 : clamp(sp / 2.4, 0, 1), run: !air && pl.running ? 1 : 0, fly: air ? 1 : 0, bank: pl.bank, moving: sp }, dt);
      pa.setBlob(air ? pl.y - groundHeight(pl.x, pl.z) : 0); pa.group.visible = v !== "FOLLOW" || true;
      const ov = v === "OVERVIEW" || v === "FOCUS"; (pa.marker.material as THREE.SpriteMaterial).opacity = ov ? 1 : 0; const dc = cam.position.distanceTo(pa.group.position); pa.marker.scale.setScalar(clamp(dc * 0.06, 1.2, 9)); pa.marker.position.y = 2.6 + dc * 0.015;
    }
    if (aa) {
      aa.group.position.set(b.x, b.y, b.z); aa.group.rotation.y = b.yaw;
      aa.setPose({ walk: clamp(b.speed / 1.15, 0, 1), moving: b.speed, work: b.anim === "work" ? 1 : 0, look: b.anim === "look" ? 1 : 0 }, dt); aa.setBlob(0);
      const dc = cam.position.distanceTo(aa.group.position), ov = v === "OVERVIEW" || v === "FOCUS";
      if (aa.badge) { const s = clamp(dc * 0.045, 1.0, 7); aa.badge.scale.set(2.6 * s, 0.81 * s, 1); aa.badge.position.y = 2.45 + (s - 1) * 0.28; (aa.badge.material as THREE.SpriteMaterial).opacity = ov ? 0 : clamp((dc - 1.5) / 3, 0, 1); }
      (aa.marker.material as THREE.SpriteMaterial).opacity = ov ? 1 : 0; aa.marker.scale.setScalar(clamp(dc * 0.07, 1.4, 11)); aa.marker.position.y = 4.4 + dc * 0.02;
      const pulse = 0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 4); (aa.ring.material as THREE.MeshBasicMaterial).opacity = eligibility.current.ok ? 0.55 + pulse * 0.4 : v === "FOLLOW" ? 0.5 : 0;
    }
    // sun follows the action; snapped to a grid so shadows don't shimmer
    const sl = sun.current; if (sl) { const t = pose.look, sx = Math.round(t.x / 2) * 2, sz = Math.round(t.z / 2) * 2; sl.target.position.set(sx, groundHeight(sx, sz), sz); sl.position.set(sx + SUN_DIR[0] * 80, groundHeight(sx, sz) + SUN_DIR[1] * 80, sz + SUN_DIR[2] * 80); sl.target.updateMatrixWorld(); }

    // ---- adaptive quality + HUD/perf publishing (throttled; never per-frame React state) ----
    if (acc.current.warm > 5) { const t = p.adaptive.current.update(dt, stats.current.avgMs); if (t !== p.q.tier) p.onTier(t); }
    if (acc.current.hud > 0.1 || mode.current.seq !== (acc.current as unknown as { seq?: number }).seq) {
      acc.current.hud = 0; (acc.current as unknown as { seq?: number }).seq = mode.current.seq;
      const e = eligibility.current, prompt = promptFor(e, ag?.name ?? "agent");
      p.onHud({ modeLabel: modeLabel(pl.locomotion, pl.running, mode.current.view), view: mode.current.view, speed: pl.speed, altitude: pl.y - groundHeight(pl.x, pl.z), prompt, canInteract: e.ok, panelOpen: mode.current.panelOpen, selectedAgent: mode.current.selectedAgent, following: mode.current.view === "FOLLOW", ambient: opState === "IDLE" ? b.ambient : null, agentMode: b.mode, agentDist: e.distance, locomotion: pl.locomotion, landing: pl.landing });
    } else acc.current.hud += dt;
    acc.current.perf += dt;
    if (acc.current.perf > 0.5) { acc.current.perf = 0; const i = gl.info; p.onPerf({ fps: stats.current.fps, ms: stats.current.avgMs, low1: stats.current.onePercentLowFps, calls: i.render.calls, tris: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, dpr: gl.getPixelRatio(), tier: p.q.tier, auto: !p.adaptive.current.manual }); }
  });

  return (
    <>
      <hemisphereLight args={[PALETTE.hemiSky, PALETTE.hemiGround, 0.85]} />
      <ambientLight intensity={0.18} color="#ffe9d0" />
      <directionalLight ref={sun} color={PALETTE.sun} intensity={2.6} position={[40, 40, 80]} castShadow={shadows}><object3D attach="target" /></directionalLight>
      <Sky />
      <Terrain receiveShadow={shadows} />
      <Ocean />
      <Backdrop />
      <Building shadows={shadows} />
      <Vegetation shadows={shadows} />
      <Props shadows={shadows} />
      <Avatar ref={playerAv} kind="operator" />
      <Avatar ref={agentAv} kind="agent" agentId={ids.agent} name={p.snapshotRef.current.agents.find((a) => a.agentId === ids.agent)?.name ?? "Agent"} simulated />
    </>
  );
}
export { BUILDING };
