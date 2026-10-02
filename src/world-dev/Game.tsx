"use client";
// The game loop + 3D scene. All rules live in src/lib/world (pure, tested); this file reads input, advances those pure functions for the player and EVERY roster
// agent, and copies the results onto three.js objects + DOM labels. It owns NO Northline business logic and makes no network calls.
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { CameraRig, POSES, type CameraInputs } from "@/lib/world/camera";
import { canInteract, nearestEligible, promptFor, type Eligibility } from "@/lib/world/interaction";
import { releaseAgent, startAgent, stepAgent, type AgentBrain, type AgentDirective, type AgentProfile, type OpState } from "@/lib/world/agent-ai";
import { ALL_IDS, initialCommand, reduceCommand, releasedIds, type CommandAction, type CommandEnv, type CommandState } from "@/lib/world/command";
import { standable } from "@/lib/world/formation";
import { buildBoard, emptyBoard, type BoardData } from "@/lib/world/board";
import { displayStatus, labelLevel, type LabelLevel, type StatusMeta } from "@/lib/world/labels";
import { travelPoint } from "@/lib/world/travel";
import { WHEEL_ITEMS } from "./wheel";
import { CommandDisplays } from "./scene/CommandDisplays";
import { routeTo } from "@/lib/world/nav";
import { clamp, dampAngle, lerp, rng, yawTo } from "@/lib/world/math";
import { PLAYER_START, TUNING, stepTier, initialMode, modeLabel, reduceMode, startPlayer, stepPlayer, toggleFly, type FlightTier, type ModeAction, type ModeState, type PlayerState } from "@/lib/world/player";
import { AdaptiveQuality, type TierConfig, type Tier } from "@/lib/world/quality";
import { FrameStats } from "@/lib/world/perf";
import type { WorldSnapshot } from "@/lib/world/schema";
import { CONSOLES, LANDMARKS, TOWN, isIndoors, locationLabel, supportHeight, zoneAt } from "@/lib/world/layout";
import { WORLD_ROSTER, roleStyle } from "@/lib/world/roster";
import type { Input } from "./input";
import { Avatar, type AvatarHandle } from "./scene/Avatars";
import { Terrain } from "./scene/Terrain";
import { Ocean } from "./scene/Ocean";
import { Sky } from "./scene/Sky";
import { TownMesh, type GroupMeshes } from "./scene/TownMesh";
import { Vegetation } from "./scene/Vegetation";
import { Props } from "./scene/Props";
import { Backdrop } from "./scene/Backdrop";
import { Ambient } from "./scene/Ambient";
import { PALETTE, SUN_DIR } from "./scene/context";

export interface HudState {
  modeLabel: string; view: ModeState["view"]; speed: number; altitude: number; prompt: string | null; canInteract: boolean; panelOpen: boolean; selectedAgent: string | null; targetAgent: string | null;
  following: boolean; ambient: string | null; locomotion: "GROUND" | "AIR"; landing: boolean; location: string; indoor: boolean;
  commandOpen: boolean; wheelOpen: boolean; suiteOpen: boolean; consoleTarget: string | null; jumping: boolean;
  flight: { active: boolean; tier: FlightTier; speed: number; altitude: number; braking: boolean };
  command: { selection: string[]; directives: Record<string, { kind: string; label: string; arrived: boolean }>; meeting: boolean };
  board: BoardData;
  agents: { id: string; where: string; anim: string; indoor: boolean; dist: number }[];
}
export interface PerfState { fps: number; ms: number; low1: number; calls: number; tris: number; geometries: number; textures: number; dpr: number; tier: Tier; auto: boolean }
export interface Overlay { labels: Map<string, HTMLElement>; landmarks: Map<string, HTMLElement> }
export interface GameProps {
  input: Input; snapshotRef: MutableRefObject<WorldSnapshot>; q: TierConfig; adaptive: MutableRefObject<AdaptiveQuality>; onTier: (t: Tier) => void;
  onHud: (h: HudState) => void; onPerf: (p: PerfState) => void; onTravel: () => void; reducedMotion: boolean; overlay: MutableRefObject<Overlay>;
}
const PROFILES: AgentProfile[] = WORLD_ROSTER.map((r) => ({ id: r.code, workspace: r.workspace, idleSpots: r.idleSpots, startSpot: r.startSpot }));
const PITCH_MIN = -0.55, PITCH_MAX = 1.25, up = new THREE.Vector3(), v3 = new THREE.Vector3(), o3 = new THREE.Object3D(), col = new THREE.Color();
const atWorkplaceStates = new Set<OpState>(["WORKING", "WAITING", "BLOCKED"]), MEET_CENTER = { x: -22.5, z: -36 };

export function Game(p: GameProps) {
  const { camera, gl, scene } = useThree(), cam = camera as THREE.PerspectiveCamera;
  const simScale = useRef(1), cmd = useRef<CommandState>(initialCommand()), board = useRef<BoardData>(emptyBoard()), ovRef = useRef(false), labelCache = useRef<Map<string, Record<string, HTMLElement | null>>>(new Map()), player = useRef<PlayerState>(startPlayer()), mode = useRef<ModeState>(initialMode()), eligibility = useRef<Eligibility>({ ok: false, reason: "too_far", distance: 99 });
  const agents = useRef<Map<string, AgentBrain>>(new Map(PROFILES.map((pr) => [pr.id, startAgent(pr, p.snapshotRef.current.agents.find((a) => a.agentId === pr.id)?.opState as OpState | undefined)])));
  const look = useRef({ yaw: PLAYER_START.yaw, pitch: 0.26, followYaw: 0, followPitch: 0.3, ov: { yaw: 0.5, pitch: 0.95, dist: 120, cx: -10, cz: 0 } });
  const rig = useRef<CameraRig>(new CameraRig(POSES.player(player.current, PLAYER_START.yaw, 0.26))), rand = useMemo(() => rng(4242), []);
  const stats = useRef(new FrameStats(90)), acc = useRef({ hud: 0, perf: 0, warm: 0, seq: -1, reform: 0, board: 0 }), fov = useRef(62), indoorK = useRef(0), groups = useRef<GroupMeshes>(new Map());
  const avRefs = useRef<Record<string, AvatarHandle | null>>({}), playerAv = useRef<AvatarHandle>(null), sun = useRef<THREE.DirectionalLight>(null), hemi = useRef<THREE.HemisphereLight>(null), proxyBody = useRef<THREE.InstancedMesh>(null), proxyHead = useRef<THREE.InstancedMesh>(null), blobs = useRef<THREE.InstancedMesh>(null), ring = useRef<THREE.Mesh>(null);
  const prevShadow = useRef<{ map: number; on: boolean }>({ map: 0, on: false }), lastView = useRef<string>("PLAYER");
  const shadows = p.q.shadows !== "off";
  const blobTex = useMemo(() => { const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d")!, g = x.createRadialGradient(32, 32, 2, 32, 32, 30); g.addColorStop(0, "rgba(0,0,0,.5)"); g.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); }, []);

  useEffect(() => { rig.current.reducedMotion = p.reducedMotion; }, [p.reducedMotion]);
  useEffect(() => {
    const l = sun.current; gl.shadowMap.enabled = shadows; gl.shadowMap.type = THREE.PCFSoftShadowMap;
    if (l) { l.castShadow = shadows; if (prevShadow.current.map !== p.q.shadowMap) { l.shadow.mapSize.set(p.q.shadowMap, p.q.shadowMap); l.shadow.map?.dispose(); l.shadow.map = null; } const r = Math.max(8, p.q.shadowRadius); Object.assign(l.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 200 }); l.shadow.camera.updateProjectionMatrix(); l.shadow.bias = -0.0005; l.shadow.normalBias = 0.05; }
    if (prevShadow.current.on !== shadows) scene.traverse((o) => { const m = (o as THREE.Mesh).material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => (x.needsUpdate = true)); });
    prevShadow.current = { map: p.q.shadowMap, on: shadows };
    scene.fog = new THREE.Fog(PALETTE.fog, 140, p.q.farFog); cam.far = p.q.far; cam.updateProjectionMatrix();
  }, [p.q, shadows, gl, scene, cam]);

  useEffect(() => { // dev/test hook (this route only exists in development / explicit local play-testing)
    const w = window as unknown as { __worldDev?: unknown }, snapA = (id: string) => { const b = agents.current.get(id)!; return { ...b, path: undefined }; };
    w.__worldDev = {
      state: () => ({ player: { ...player.current }, agents: Object.fromEntries([...agents.current].map(([id]) => [id, snapA(id)])), mode: { ...mode.current }, cam: { x: cam.position.x, y: cam.position.y, z: cam.position.z }, fov: cam.fov, eligibility: eligibility.current, location: locationLabel(player.current.x, player.current.z, player.current.y), indoorK: indoorK.current, roofVisible: groups.current.get("hq-roof")?.[0]?.visible ?? null }),
      teleportPlayer: (x: number, z: number, y?: number) => { player.current = startPlayer(x, z); if (y !== undefined) player.current = { ...player.current, y }; },
      setPlayer: (patch: Partial<PlayerState>) => { player.current = { ...player.current, ...patch }; },
      setLook: (yaw: number, pitch: number) => { look.current.yaw = yaw; look.current.pitch = pitch; },
      setMode: (a: ModeAction) => { mode.current = reduceMode(mode.current, a); },
      setAgent: (id: string, x: number, z: number, y?: number) => { const b = agents.current.get(id)!; agents.current.set(id, { ...b, x, z, y: y ?? supportHeight(x, z, 1.2), path: [], mode: "STAND", timer: 99, destId: null, seated: false }); },
      agentIds: () => PROFILES.map((x) => x.id), setSimScale: (n: number) => { simScale.current = Math.max(1, Math.min(40, Math.round(n))); },
      command: () => ({ ...cmd.current, agentStates: Object.fromEntries([...agents.current].map(([id, b]) => [id, { x: b.x, z: b.z, y: b.y, mode: b.mode, arrived: b.dirArrived, speed: b.speed, seated: b.seated }])) }),
      route: (id: string) => routeTo({ x: player.current.x, z: player.current.z, y: player.current.y }, id),
    };
    return () => { delete w.__worldDev; };
  }, [cam]);

  const opOf = (id: string, snap: WorldSnapshot): OpState => (snap.agents.find((a) => a.agentId === id)?.opState ?? "IDLE") as OpState;
  const agentTargets = () => [...agents.current.values()].map((b) => ({ id: b.id, x: b.x, y: b.y, z: b.z }));

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05), input = p.input, snap = p.snapshotRef.current;
    acc.current.warm += dt; stats.current.push(rawDelta * 1000);

    // ---- one-shot actions → mode machine / player ----
    const act = (a: ModeAction) => { mode.current = reduceMode(mode.current, a); };
    const nearestAgentId = (maxD = 1e9) => { let best: string | null = null, bd = maxD; for (const b of agents.current.values()) { const d = Math.hypot(b.x - player.current.x, b.z - player.current.z); if (d < bd) { bd = d; best = b.id; } } return best; };
    // ---- Founder command plumbing: UI → world command controller → simulated agent directives (no network, no real mutation) ----
    const pl0 = player.current, floorRef = pl0.locomotion === "AIR" ? supportHeight(pl0.x, pl0.z, 1.2) : supportHeight(pl0.x, pl0.z, pl0.y, 0.3);
    const cmdEnv = (): CommandEnv => ({ player: { x: player.current.x, y: floorRef, z: player.current.z, yaw: look.current.yaw }, agents: [...agents.current.values()].map((b) => ({ id: b.id, x: b.x, z: b.z })), valid: (x, z) => standable(x, z, floorRef) });
    const runCommand = (a: CommandAction) => { const prev = cmd.current; cmd.current = reduceCommand(prev, a, cmdEnv()); for (const id of releasedIds(prev, cmd.current)) { const b = agents.current.get(id); if (b) agents.current.set(id, releaseAgent(b)); } };
    const nearestConsole = () => { let best: { c: (typeof CONSOLES)[number]; d: number } | null = null; if (mode.current.view !== "PLAYER") return null; for (const c of CONSOLES) { const d = Math.hypot(player.current.x - c.x, player.current.z - c.z); if (d < c.range && Math.abs(player.current.y - c.y) < 2.4 && (!best || d < best.d)) best = { c, d }; } return best; };
    for (const id of input.selectQueue.splice(0)) { act({ type: "SELECT", id }); runCommand({ type: "SELECT_ONLY", id }); }
    for (const c of input.cmdQueue.splice(0)) {
      const view = mode.current.view;
      switch (c.type) {
        case "COMMAND": runCommand(c.action); break;
        case "FOCUS": act({ type: "SELECT", id: c.id }); act({ type: "FOCUS_AGENT", id: c.id }); input.releasePointer(); break;
        case "FOCUS_GROUP": { if (!c.ids.length) break; const bs = c.ids.map((i) => agents.current.get(i)!).filter(Boolean), cx = bs.reduce((s2, b) => s2 + b.x, 0) / bs.length, cz = bs.reduce((s2, b) => s2 + b.z, 0) / bs.length, near = bs.reduce((m, b) => (Math.hypot(b.x - cx, b.z - cz) < Math.hypot(m.x - cx, m.z - cz) ? b : m), bs[0]); act({ type: "SELECT", id: near.id }); act({ type: "FOCUS_AGENT", id: near.id }); look.current.ov.dist = Math.max(40, Math.min(90, 28 + bs.length * 6)); break; }
        case "FOLLOW": act({ type: "SELECT", id: c.id }); act({ type: "FOLLOW_AGENT", id: c.id }); break;
        case "DETAILS": act({ type: "OPEN_PANEL", id: c.id }); break;
        case "GO_TO_AGENT": input.travelQueue.push(`agent:${c.id}`); break;
        case "TRAVEL": input.travelQueue.push(c.id); break;
        case "OVERVIEW": act({ type: "TOGGLE_OVERVIEW" }); input.releasePointer(); break;
        case "OPEN_COMMAND": act({ type: "OPEN_COMMAND" }); input.releasePointer(); break;
        case "CLOSE_COMMAND": act({ type: "CLOSE_COMMAND" }); break;
        case "CLOSE_SUITE": act({ type: "CLOSE_SUITE" }); break;
        case "FLY": if (view === "PLAYER") player.current = toggleFly(player.current); break;
        case "TURBO": input.setCruise("TURBO"); if (view === "PLAYER" && player.current.locomotion === "GROUND") player.current = toggleFly(player.current); break;
        case "RETURN": act({ type: "RETURN_TO_PLAYER" }); break;
        case "OPEN_PAGE": break; // handled by the page (a real navigation to an existing Command Center route)
      }
    }
    for (const id of input.travelQueue.splice(0)) {
      if (id.startsWith("agent:")) { // descend next to an agent
        const b = agents.current.get(id.slice(6)); if (!b) continue;
        const ox = 1.4 * Math.sin(b.yaw + 0.6), oz = 1.4 * Math.cos(b.yaw + 0.6); player.current = { ...startPlayer(b.x + ox, b.z + oz), y: b.y }; look.current.yaw = Math.atan2(-ox, -oz); look.current.pitch = 0.2;
        act({ type: "SELECT", id: b.id }); act({ type: "RETURN_TO_PLAYER" }); p.onTravel(); continue;
      }
      const tp = travelPoint(id);
      if (tp) { player.current = { ...startPlayer(tp.x, tp.z), y: tp.y }; look.current.yaw = tp.yaw; }
      else { const lm = LANDMARKS.find((l) => l.id === id) ?? LANDMARKS[0]; player.current = startPlayer(lm.x, lm.z); look.current.yaw = lm.z < 0 ? 0 : Math.PI; }
      look.current.pitch = 0.2; act({ type: "RETURN_TO_PLAYER" }); p.onTravel();
    }
    for (const n of input.digitQueue.splice(0)) if (mode.current.wheelOpen) { const it = WHEEL_ITEMS[n - 1]; if (it) { act({ type: "CLOSE_WHEEL" }); input.cmdQueue.push(it.cmd); } }
    for (const a of input.drain()) {
      const view = mode.current.view, sel = mode.current.selectedAgent;
      if (a === "overview") { act({ type: "TOGGLE_OVERVIEW" }); input.releasePointer(); }
      else if (a === "escape") { act({ type: "ESCAPE" }); input.releasePointer(); }
      else if (a === "command") { act({ type: "TOGGLE_COMMAND" }); input.releasePointer(); }
      else if (a === "wheel") { act({ type: "TOGGLE_WHEEL" }); input.releasePointer(); }
      else if (a === "summonAll") runCommand({ type: "SUMMON_ALL" });
      else if (a === "tierUp") input.setCruise(stepTier(input.cruise, 1));
      else if (a === "tierDown") input.setCruise(stepTier(input.cruise, -1));
      else if (a === "follow") { if (view === "FOLLOW") act({ type: "EXIT_FOLLOW" }); else { const id = view === "OVERVIEW" || view === "FOCUS" || mode.current.panelOpen ? sel : nearestEligible(player.current, agentTargets(), view, false)?.id ?? nearestAgentId(16) ?? sel ?? WORLD_ROSTER[0].code; if (id) act({ type: "FOLLOW_AGENT", id }); } }
      else if (a === "focus") { const id = sel ?? nearestAgentId(); if (id) act({ type: "FOCUS_AGENT", id }); }
      else if (a === "return") act({ type: "RETURN_TO_PLAYER" });
      else if (a === "toggleFly" && view === "PLAYER") player.current = toggleFly(player.current);
      else if (a === "interact" || a === "details") {
        if (mode.current.suiteOpen) act({ type: "CLOSE_SUITE" });
        else if (mode.current.panelOpen) act({ type: "CLOSE_PANEL" });
        else if (view === "PLAYER") {
          const t = nearestEligible(player.current, agentTargets(), view, false), con = nearestConsole(), tb = t ? agents.current.get(t.id) : null, td = tb ? Math.hypot(tb.x - player.current.x, tb.z - player.current.z) : Infinity;
          if (con && con.d <= td) { act({ type: con.c.action === "founder-command" ? "OPEN_COMMAND" : "OPEN_SUITE" }); input.releasePointer(); }
          else if (t) { act({ type: "OPEN_PANEL", id: t.id }); input.releasePointer(); }
        }
        else if (sel) act({ type: "OPEN_PANEL", id: sel }); // overview / focus / follow: details of the selected agent
      }
    }

    // ---- look input ----
    const { dx, dy, wheel } = input.consumeLook(), v = mode.current.view, L = look.current;
    if (v === "PLAYER") { L.yaw -= dx; L.pitch = clamp(L.pitch + dy, PITCH_MIN, PITCH_MAX); }
    else if (v === "OVERVIEW" || v === "FOCUS") { L.ov.yaw -= dx * 1.3; L.ov.pitch = clamp(L.ov.pitch + dy * 1.1, 0.35, 1.45); L.ov.dist = clamp(L.ov.dist * Math.exp(wheel * 0.0012), 20, 220); }
    else if (v === "FOLLOW") { L.followYaw -= dx; L.followPitch = clamp(L.followPitch + dy, 0.05, 1.0); }

    // ---- player ----
    const ctrl = v === "PLAYER";
    if (v === "OVERVIEW") { const sp = L.ov.dist * 0.6 * dt, f = { x: Math.sin(L.ov.yaw), z: Math.cos(L.ov.yaw) }; L.ov.cx = clamp(L.ov.cx + (f.x * input.moveZ - f.z * input.moveX) * sp, -110, 110); L.ov.cz = clamp(L.ov.cz + (f.z * input.moveZ + f.x * input.moveX) * sp, -60, 60); }
    const prevLoco = player.current.locomotion;
    let pl = stepPlayer(player.current, { moveX: ctrl ? input.moveX : 0, moveZ: ctrl ? input.moveZ : 0, cameraYaw: L.yaw, run: ctrl && input.run, up: ctrl ? input.up : 0, down: ctrl ? input.downAxis : 0, boost: false, jump: ctrl && prevLoco === "GROUND" && input.jumpPending(), tier: input.flightTier(), brake: ctrl && input.brake }, dt);
    if (pl.jumped || pl.locomotion === "AIR") input.clearJump();
    for (const b0 of agents.current.values()) if (Math.abs(pl.y - b0.y) < 2.2) { const dxp = pl.x - b0.x, dzp = pl.z - b0.z, d = Math.hypot(dxp, dzp), min = 0.38 + 0.4; if (d < min && d > 1e-4 && !b0.seated) pl = { ...pl, x: b0.x + (dxp / d) * min, z: b0.z + (dzp / d) * min }; }
    player.current = pl;

    // ---- agents (every real registry agent) ----
    const selected = mode.current.selectedAgent, holdId = mode.current.panelOpen ? selected : null;
    const others = [...agents.current.values()].map((b) => ({ id: b.id, x: b.x, z: b.z, y: b.y, speed: b.speed }));
    acc.current.reform += dt; if (acc.current.reform > 0.5) { acc.current.reform = 0; if (Object.values(cmd.current.directives).some((d) => d.kind === "SUMMON")) runCommand({ type: "REFORM" }); }
    const directiveOf = (id: string): AgentDirective | null => { const d = cmd.current.directives[id]; return d ? { kind: d.kind, version: d.version, target: d.target, spotId: d.spotId, label: d.label, face: d.kind === "SUMMON" ? { x: pl.x, z: pl.z } : d.kind === "MEETING" ? MEET_CENTER : null } : null; };
    for (const pr of PROFILES) {
      const b0 = agents.current.get(pr.id)!, op = opOf(pr.id, snap), working = atWorkplaceStates.has(op);
      let b = b0; const dirv = directiveOf(pr.id); for (let k = 0; k < simScale.current; k++) b = stepAgent(b, dt, { opState: (working ? "WORKING" : "IDLE") as OpState, player: { x: pl.x, z: pl.z, y: pl.y }, hold: holdId === pr.id, rand, others, directive: dirv }, pr); // simScale > 1 only from the dev test hook (slow software GL)
      if ((b.mode === "HOLD" || (holdId === pr.id && b.speed < 0.2)) && !b.seated) b = { ...b, yaw: dampAngle(b.yaw, yawTo(b, pl), 3, dt) }; // politely turns to face the operator
      agents.current.set(pr.id, b);
    }

    // ---- interaction eligibility ----
    const near = nearestEligible(pl, agentTargets(), mode.current.view, mode.current.panelOpen), nearestAny = nearestAgentId(9);
    const tgtId = near?.id ?? nearestAny ?? null, tgtB = tgtId ? agents.current.get(tgtId)! : null;
    eligibility.current = tgtB ? canInteract(pl, { id: tgtB.id, x: tgtB.x, y: tgtB.y, z: tgtB.z }, mode.current.view, mode.current.panelOpen) : { ok: false, reason: "too_far", distance: 99 };

    // ---- camera ----
    const focusAgent = mode.current.selectedAgent ? agents.current.get(mode.current.selectedAgent) ?? null : null;
    const focusPos = v === "FOLLOW" && focusAgent ? { x: focusAgent.x, y: focusAgent.y, z: focusAgent.z } : { x: pl.x, y: pl.y, z: pl.z };
    const indoorNow = v === "OVERVIEW" || v === "FOCUS" ? 0 : isIndoors(focusPos.x, focusPos.z, focusPos.y + 0.5) ? 1 : 0; indoorK.current += (indoorNow - indoorK.current) * (1 - Math.exp(-5 * dt));
    const inp: CameraInputs = { indoor: indoorK.current, lookYaw: L.yaw, lookPitch: L.pitch, overview: L.ov, followYaw: L.followYaw, followPitch: L.followPitch, speed: v === "PLAYER" ? pl.speed : 0 };
    rig.current.onViewChange(mode.current.seq, mode.current.view);
    const pose = rig.current.update(dt, mode.current.view, { player: pl, agent: focusAgent ? { x: focusAgent.x, y: focusAgent.y, z: focusAgent.z, heading: focusAgent.yaw } : null }, inp);
    cam.position.set(pose.pos.x, pose.pos.y, pose.pos.z); cam.lookAt(pose.look.x, pose.look.y, pose.look.z);
    const air = pl.locomotion === "AIR", tf = v === "OVERVIEW" || v === "FOCUS" ? 48 : 60 + (air ? Math.min(1, pl.speed / TUNING.flyTiers.TURBO.top) ** 0.85 * 19 : Math.min(1, Math.max(0, pl.speed - TUNING.walk) / (TUNING.run - TUNING.walk)) * 7) * (1 - indoorK.current * 0.5); fov.current += (tf - fov.current) * (1 - Math.exp(-(tf > fov.current ? 2.6 : 3.4) * dt)); if (Math.abs(cam.fov - fov.current) > 0.05) { cam.fov = fov.current; cam.updateProjectionMatrix(); }
    if (v !== lastView.current) { lastView.current = v; if (v === "OVERVIEW" || v === "FOCUS") input.releasePointer(); }

    // ---- visuals: player ----
    const pa = playerAv.current; if (pa) { pa.group.position.set(pl.x, pl.y, pl.z); pa.group.rotation.y = pl.heading; const air = pl.locomotion === "AIR"; pa.setPose({ walk: air || !pl.grounded ? 0 : clamp(pl.speed / 2.6, 0, 1), run: !air && pl.running && pl.grounded ? clamp((pl.speed - 3) / 3, 0, 1) : 0, fly: air ? 1 : 0, jump: !air && !pl.grounded ? 1 : 0, bank: pl.bank, moving: pl.speed }, dt); }
    // ---- visuals: agents (full rig when near, shared proxy when far) + blobs ----
    const bodyI = proxyBody.current, headI = proxyHead.current, blobI = blobs.current; let blobN = 0;
    if (blobI) { o3.position.set(pl.x, pl.y + 0.04, pl.z); o3.rotation.set(-Math.PI / 2, 0, 0); o3.scale.setScalar(pl.locomotion === "AIR" ? 1 + (pl.y - supportHeight(pl.x, pl.z, pl.y, 0.3)) * 0.05 : 1); o3.updateMatrix(); blobI.setMatrixAt(blobN++, o3.matrix); }
    let proxyN = 0; const byDist = [...PROFILES].sort((a2, b2) => { const A = agents.current.get(a2.id)!, B = agents.current.get(b2.id)!; return Math.hypot(A.x - pl.x, A.z - pl.z) - Math.hypot(B.x - pl.x, B.z - pl.z); }), shadowSet = new Set(byDist.slice(0, p.q.shadows === "high" ? 8 : 5).map((x) => x.id)); // only the nearest agents cast real shadows (the rest keep a cheap blob)
    for (const pr of PROFILES) {
      const b = agents.current.get(pr.id)!, av = avRefs.current[pr.id]; if (!av) continue;
      const dc = Math.hypot(cam.position.x - b.x, cam.position.y - b.y, cam.position.z - b.z), special = pr.id === mode.current.selectedAgent && (v === "FOLLOW" || mode.current.panelOpen), nearRig = dc < p.q.agentRigDist || special;
      if (av.rigVisible !== nearRig) av.setRigVisible(nearRig); av.setCastShadow(shadows && shadowSet.has(pr.id) && dc < 24);
      av.group.position.set(b.x, b.y, b.z); av.group.rotation.y = b.yaw;
      const sit = b.anim === "sit" || b.anim === "sit-work", work = b.anim === "work" || b.anim === "sit-work";
      av.setPose({ walk: clamp(b.speed / 1.15, 0, 1), run: clamp((b.speed - 2.2) / 2.2, 0, 1), moving: b.speed, work: work ? 1 : 0, sit: sit ? 1 : 0, look: b.anim === "look" ? 1 : 0, talk: b.anim === "talk" ? 1 : 0 }, dt);
      if (!nearRig && bodyI && headI && proxyN < 16) { const st = roleStyle(pr.id), sh = sit ? 0.55 : 0.95; o3.position.set(b.x, b.y + sh * 0.62, b.z); o3.rotation.set(0, b.yaw, 0); o3.scale.set(1, sh / 0.95, 1); o3.updateMatrix(); bodyI.setMatrixAt(proxyN, o3.matrix); bodyI.setColorAt(proxyN, col.set(st.color)); o3.position.set(b.x, b.y + sh * 1.28, b.z); o3.scale.setScalar(1); o3.updateMatrix(); headI.setMatrixAt(proxyN, o3.matrix); headI.setColorAt(proxyN, col.set(st.skin)); proxyN++; }
      if (blobI && blobN < 16 && !b.seated) { o3.position.set(b.x, b.y + 0.04, b.z); o3.rotation.set(-Math.PI / 2, 0, 0); o3.scale.setScalar(1); o3.updateMatrix(); blobI.setMatrixAt(blobN++, o3.matrix); }
    }
    if (bodyI && headI) { bodyI.count = headI.count = proxyN; bodyI.instanceMatrix.needsUpdate = headI.instanceMatrix.needsUpdate = true; if (bodyI.instanceColor) bodyI.instanceColor.needsUpdate = true; if (headI.instanceColor) headI.instanceColor.needsUpdate = true; }
    if (blobI) { blobI.count = blobN; blobI.instanceMatrix.needsUpdate = true; }
    // interaction ring under the agent you can talk to / are following
    const rg = ring.current, rt = eligibility.current.ok ? tgtB : v === "FOLLOW" ? focusAgent : null;
    if (rg) { rg.visible = !!rt; if (rt) { rg.position.set(rt.x, rt.y + 0.06, rt.z); const pulse = 0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 4); (rg.material as THREE.MeshBasicMaterial).opacity = 0.5 + pulse * 0.4; (rg.material as THREE.MeshBasicMaterial).color.set(roleStyle(rt.id).color); } }

    // ---- town groups: HQ roof cut away in the management view; distant interiors hidden ----
    const ovView = v === "OVERVIEW" || v === "FOCUS"; ovRef.current = ovView; const hqd = Math.hypot(cam.position.x + 18, cam.position.z + 30);
    groups.current.get("hq-roof")?.forEach((m) => (m.visible = !ovView)); groups.current.get("hq-int")?.forEach((m) => (m.visible = ovView || hqd < p.q.interiorDist));

    // ---- lighting: clean daylight outside, brighter ambient + softer sun inside ----
    if (hemi.current) hemi.current.intensity = lerp(0.95, 1.5, indoorK.current); const sl = sun.current;
    if (sl) { sl.intensity = lerp(3.0, 0.45, indoorK.current); const t = pose.look, sx = Math.round(t.x / 2) * 2, sz = Math.round(t.z / 2) * 2, sy = supportHeight(sx, sz, t.y); sl.target.position.set(sx, sy, sz); sl.position.set(sx + SUN_DIR[0] * 90, sy + SUN_DIR[1] * 90, sz + SUN_DIR[2] * 90); sl.target.updateMatrixWorld(); }

    // ---- DOM labels (agent name tags / overview markers) + landmark labels, projected each frame ----
    const W = gl.domElement.clientWidth, H = gl.domElement.clientHeight, ov = p.overlay.current;
    const project = (x: number, y: number, z: number) => { v3.set(x, y, z).project(cam); return { sx: (v3.x * 0.5 + 0.5) * W, sy: (-v3.y * 0.5 + 0.5) * H, front: v3.z < 1 && v3.z > -1 }; };
    const playerBld = zoneAt(pl.x, pl.z, pl.y + 0.5)?.building;
    // nameplates: FULL ([glyph code] NAME / ROLE / STATUS) → NAME → MARKER by distance; farther plates yield to nearer ones that would overlap them
    const founderInMeeting = zoneAt(pl.x, pl.z, pl.y + 0.5)?.id === "hq-meeting";
    const cands: { id: string; sx: number; sy: number; dc: number; level: LabelLevel; meta: StatusMeta }[] = [];
    for (const pr of PROFILES) {
      const el = ov.labels.get(pr.id), b = agents.current.get(pr.id)!; if (!el) continue;
      const dc = Math.hypot(cam.position.x - b.x, cam.position.y - b.y, cam.position.z - b.z), z = zoneAt(b.x, b.z, b.y + 0.5), hidIndoors = !ovView && v !== "FOLLOW" && ((!!z?.indoor && z.building !== playerBld) || Math.abs(b.y - pl.y) > 2.6);
      const pt = project(b.x, b.y + (b.seated ? 1.55 : 2.15), b.z), dRec = cmd.current.directives[pr.id], meta = displayStatus(opOf(pr.id, snap), dRec ? { kind: dRec.kind, arrived: b.dirArrived && b.dirVersion === dRec.version } : null, founderInMeeting);
      const lvl = labelLevel(ovView ? L.ov.dist : dc, { selected: selected === pr.id, overview: ovView, maxDist: p.q.labelDist, commanded: !!dRec }), onScreen = pt.front && !hidIndoors && pt.sx > -80 && pt.sx < W + 80 && pt.sy > -40 && pt.sy < H + 40;
      if (!onScreen || lvl === "HIDDEN") { if (el.style.display !== "none") el.style.display = "none"; continue; }
      cands.push({ id: pr.id, sx: pt.sx, sy: pt.sy, dc, level: lvl, meta });
    }
    cands.sort((a2, b2) => (a2.id === selected ? -1 : b2.id === selected ? 1 : a2.dc - b2.dc));
    const placed: { x0: number; x1: number; y0: number; y1: number }[] = [], SZ: Record<LabelLevel, [number, number]> = { FULL: [150, 58], NAME: [112, 24], MARKER: [42, 24], HIDDEN: [0, 0] }, hit = (r: { x0: number; x1: number; y0: number; y1: number }) => placed.some((q) => r.x0 < q.x1 && r.x1 > q.x0 && r.y0 < q.y1 && r.y1 > q.y0);
    for (const c of cands) {
      const el = ov.labels.get(c.id)!; let lvl = c.level;
      const rect = (l: LabelLevel) => ({ x0: c.sx - SZ[l][0] / 2, x1: c.sx + SZ[l][0] / 2, y0: c.sy - SZ[l][1], y1: c.sy });
      if (c.id !== selected) { while (lvl !== "MARKER" && hit(rect(lvl))) lvl = lvl === "FULL" ? "NAME" : "MARKER"; }
      placed.push(rect(lvl));
      el.style.display = "flex"; el.style.transform = `translate(${c.sx.toFixed(1)}px, ${c.sy.toFixed(1)}px) translate(-50%, -100%)`; el.style.opacity = ovView ? "1" : String(clamp(1.7 - c.dc / Math.max(40, p.q.labelDist), 0.5, 1)); el.style.pointerEvents = ovView ? "auto" : "none"; el.style.zIndex = c.id === selected ? "30" : lvl === "FULL" ? "12" : "10";
      el.dataset.level = lvl; el.dataset.selected = selected === c.id ? "1" : "0"; el.dataset.sel = cmd.current.selection.includes(c.id) ? "1" : "0"; el.dataset.pattern = c.meta.pattern; el.dataset.status = c.meta.code; el.dataset.view = ovView ? "overview" : "world";
      let lc = labelCache.current.get(c.id); if (!lc || lc.root !== el) { lc = { root: el, status: el.querySelector("[data-f=status]"), mark: el.querySelector("[data-f=mark]") }; labelCache.current.set(c.id, lc); }
      const txt = `${c.meta.symbol} ${c.meta.word}`; if (el.dataset.st !== txt) { el.dataset.st = txt; if (lc.status) lc.status.textContent = txt; if (lc.mark) lc.mark.textContent = c.meta.symbol; }
    }
    for (const lm of LANDMARKS) { const el = ov.landmarks.get(lm.id); if (!el) continue; const pt = project(lm.x, lm.y + 6, lm.z), show = ovView && pt.front && pt.sx > 0 && pt.sx < W && pt.sy > 0 && pt.sy < H; el.style.display = show ? "block" : "none"; if (show) el.style.transform = `translate(${pt.sx.toFixed(1)}px, ${pt.sy.toFixed(1)}px) translate(-50%, -50%)`; }

    // ---- the shared board (HQ displays + Founder Command + labels' source of truth), rebuilt 4×/s ----
    acc.current.board += dt;
    if (acc.current.board > 0.25 || board.current.seq === -1) {
      acc.current.board = 0;
      board.current = buildBoard({ snap, player: { x: pl.x, z: pl.z, yaw: L.yaw }, meeting: cmd.current.meeting, founderInMeeting, pos: (id) => { const b = agents.current.get(id)!; return { x: b.x, z: b.z, where: locationLabel(b.x, b.z, b.y) }; }, directive: (id) => { const d = cmd.current.directives[id], b = agents.current.get(id)!; return d ? { kind: d.kind, arrived: b.dirArrived && b.dirVersion === d.version } : null; } });
    }
    // ---- adaptive quality + HUD/perf publishing (throttled; never per-frame React state) ----
    if (acc.current.warm > 5) { const t = p.adaptive.current.update(dt, stats.current.avgMs); if (t !== p.q.tier) p.onTier(t); }
    acc.current.hud += dt;
    if (acc.current.hud > 0.12 || mode.current.seq !== acc.current.seq) {
      acc.current.hud = 0; acc.current.seq = mode.current.seq;
      const e = eligibility.current, targetName = tgtId ? snap.agents.find((a) => a.agentId === tgtId)?.name ?? "agent" : "agent", con = nearestConsole(), prompt = con && !e.ok ? con.c.prompt : tgtId ? promptFor(e, targetName) : null, sb = mode.current.selectedAgent ? agents.current.get(mode.current.selectedAgent) : null;
      p.onHud({
        modeLabel: modeLabel(pl.locomotion, pl.running, mode.current.view, pl.tier, pl.locomotion === "GROUND" && !pl.grounded), view: mode.current.view, speed: pl.speed, altitude: pl.y - supportHeight(pl.x, pl.z, pl.y, 0.3), prompt, canInteract: e.ok || !!con, panelOpen: mode.current.panelOpen, selectedAgent: mode.current.selectedAgent, targetAgent: e.ok ? tgtId : null,
        following: mode.current.view === "FOLLOW", ambient: sb && opOf(sb.id, snap) === "IDLE" ? sb.ambient : null, locomotion: pl.locomotion, landing: pl.landing, location: locationLabel(pl.x, pl.z, pl.y), indoor: isIndoors(pl.x, pl.z, pl.y + 0.5),
        commandOpen: mode.current.commandOpen, wheelOpen: mode.current.wheelOpen, suiteOpen: mode.current.suiteOpen, consoleTarget: nearestConsole()?.c.id ?? null, jumping: pl.locomotion === "GROUND" && !pl.grounded,
        flight: { active: pl.locomotion === "AIR", tier: pl.tier, speed: pl.speed, altitude: pl.y - supportHeight(pl.x, pl.z, pl.y, 0.3), braking: pl.braking },
        command: { selection: cmd.current.selection, directives: Object.fromEntries(Object.entries(cmd.current.directives).map(([id, d]) => [id, { kind: d.kind, label: d.label, arrived: (agents.current.get(id)?.dirArrived ?? false) && agents.current.get(id)?.dirVersion === d.version }])), meeting: cmd.current.meeting }, board: board.current,
        agents: PROFILES.map((pr) => { const b = agents.current.get(pr.id)!; return { id: pr.id, where: locationLabel(b.x, b.z, b.y), anim: b.anim, indoor: isIndoors(b.x, b.z, b.y + 0.5), dist: Math.hypot(b.x - pl.x, b.z - pl.z) }; }),
      });
    }
    acc.current.perf += dt;
    if (acc.current.perf > 0.5) { acc.current.perf = 0; const i = gl.info; p.onPerf({ fps: stats.current.fps, ms: stats.current.avgMs, low1: stats.current.onePercentLowFps, calls: i.render.calls, tris: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, dpr: gl.getPixelRatio(), tier: p.q.tier, auto: !p.adaptive.current.manual }); }
  });

  const proxyBodyGeo = useMemo(() => { const g = new THREE.CapsuleGeometry(0.2, 0.55, 3, 8); return g; }, []), proxyHeadGeo = useMemo(() => new THREE.SphereGeometry(0.13, 8, 6), []);
  return (
    <>
      <hemisphereLight ref={hemi} args={[PALETTE.hemiSky, PALETTE.hemiGround, 0.95]} />
      <ambientLight intensity={0.12} color="#fff4e4" />
      <directionalLight ref={sun} color={PALETTE.sun} intensity={3.0} position={[40, 80, 50]} castShadow={shadows}><object3D attach="target" /></directionalLight>
      <Sky /><Terrain receiveShadow={shadows} /><Ocean /><Backdrop />
      <TownMesh shadows={shadows} groups={groups} /><Vegetation shadows={shadows} /><Props shadows={shadows} /><Ambient />
      <CommandDisplays board={board} overview={ovRef} />
      <Avatar ref={playerAv} kind="operator" />
      {WORLD_ROSTER.map((r) => <Avatar key={r.code} ref={(h) => { avRefs.current[r.code] = h; }} kind="agent" agentId={r.code} />)}
      <instancedMesh ref={proxyBody} args={[proxyBodyGeo, undefined, 16]} frustumCulled={false}><meshStandardMaterial roughness={0.7} /></instancedMesh>
      <instancedMesh ref={proxyHead} args={[proxyHeadGeo, undefined, 16]} frustumCulled={false}><meshStandardMaterial roughness={0.7} /></instancedMesh>
      <instancedMesh ref={blobs} args={[undefined, undefined, 16]} frustumCulled={false} renderOrder={2}><planeGeometry args={[1.5, 1.5]} /><meshBasicMaterial map={blobTex} transparent depthWrite={false} /></instancedMesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} visible={false} renderOrder={3}><ringGeometry args={[0.62, 0.72, 40]} /><meshBasicMaterial transparent opacity={0.6} depthWrite={false} side={THREE.DoubleSide} /></mesh>
    </>
  );
}
export { TOWN, up };
