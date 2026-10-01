// World logic tests — everything here runs without WebGL. (They do NOT prove GPU performance; see the POC report for real-device numbers.)
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { COLLIDERS, BOUNDS, BUILDING, IDLE_SPOTS, NAV_EDGES, NAV_NODES, SCENERY, WORK_SPOT, distToNav, groundHeight, insideSolid, isWater, nodeOf, resolveCollisions } from "./layout";
import { GRAPH, findPath, nearestNode, pathLength, pathPoints } from "./nav";
import { initialMode, modeLabel, reduceMode, startPlayer, stepPlayer, toggleFly, TUNING, type PlayerInput, type PlayerState } from "./player";
import { CameraRig, POSES, springArm, lookDir } from "./camera";
import { canInteract, nearestEligible, promptFor, INTERACT_RANGE } from "./interaction";
import { AdaptiveQuality, TIERS, selectInitialTier, type DeviceInfo } from "./quality";
import { FrameStats } from "./perf";
import { AGENT, startAgent, stepAgent, type AgentCtx } from "./agent-ai";
import { buildAgentPanel, parseSimulatedSnapshot, roleStyle, SnapshotRejected, humanElapsed, type WorldSnapshot } from "./schema";
import { worldDevAllowed } from "./isolation";
import { unregisteredBinaries, validateRegistry, WORLD_ASSET_DIRS } from "./assets";
import { rng } from "./math";

const IN: PlayerInput = { moveX: 0, moveZ: 0, cameraYaw: 0, run: false, up: 0, down: 0, boost: false };
const run = (s: PlayerState, i: Partial<PlayerInput>, secs: number, hz = 60) => { let st = s; const dt = 1 / hz; for (let t = 0; t < secs; t += dt) st = stepPlayer(st, { ...IN, ...i }, dt); return st; };

describe("layout, collision and navigation (real layout data)", () => {
  it("every nav node is on dry land and clear of solids", () => {
    for (const n of NAV_NODES) { expect(isWater(n.x, n.z), n.id).toBe(false); expect(insideSolid(n, 0.2), n.id).toBe(false); }
  });
  it("every nav edge is walkable by an agent-sized body: no water, no solid, no obstruction", () => {
    for (const e of NAV_EDGES) {
      const a = nodeOf(e.a), b = nodeOf(e.b), n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.4);
      for (let i = 0; i <= n; i++) {
        const p = { x: a.x + ((b.x - a.x) * i) / n, z: a.z + ((b.z - a.z) * i) / n };
        expect(groundHeight(p.x, p.z), `${e.a}-${e.b}@${i}`).toBeGreaterThan(-0.3);
        const r = resolveCollisions(p, 0.4, 0.2);
        expect(Math.hypot(r.x - p.x, r.z - p.z), `${e.a}-${e.b}@${i} clips a collider`).toBeLessThan(0.05);
      }
    }
  });
  it("the whole graph is connected; idle spots and the work spot are reachable from the building entrance", () => {
    for (const n of NAV_NODES) expect(findPath(GRAPH, "ENTRANCE", n.id), n.id).not.toBeNull();
    for (const s of IDLE_SPOTS) expect(findPath(GRAPH, "WORK", s.node), s.id).not.toBeNull();
    expect(nearestNode(WORK_SPOT).id).toBe("WORK");
  });
  it("A* returns a shortest-ish path, null for unknown nodes, and costs prefer the boardwalk", () => {
    const p = findPath(GRAPH, "D-22", "D26")!; expect(p[0]).toBe("D-22"); expect(p.at(-1)).toBe("D26");
    expect(pathLength(pathPoints(p))).toBeCloseTo(48, 0); // straight along the boardwalk row
    expect(findPath(GRAPH, "D-22", "nope")).toBeNull();
  });
  it("scenery keeps clear of walking lines and stands on dry ground", () => {
    for (const p of SCENERY.palms) { expect(isWater(p.x, p.z)).toBe(false); expect(distToNav(p)).toBeGreaterThan(1.5); }
    expect(SCENERY.palms.length).toBeGreaterThan(15);
  });
  it("the shoreline exists: land at the boardwalk, water beyond the beach", () => {
    expect(groundHeight(0, 17)).toBeGreaterThan(0.5); expect(isWater(0, 40)).toBe(true); expect(groundHeight(0, -40)).toBeGreaterThan(0.4);
  });
});

describe("player controller", () => {
  it("accelerates smoothly to walking speed and decelerates smoothly", () => {
    let s = startPlayer(-30, 17.5); const v: number[] = [];
    for (let i = 0; i < 90; i++) { s = stepPlayer(s, { ...IN, moveZ: 1, cameraYaw: Math.PI / 2 }, 1 / 60); v.push(s.speed); }
    expect(v[0]).toBeLessThan(0.5); expect(v.at(-1)!).toBeGreaterThan(TUNING.walk * 0.9); expect(v.at(-1)!).toBeLessThanOrEqual(TUNING.walk + 0.01);
    for (let i = 1; i < v.length; i++) { expect(v[i] - v[i - 1]).toBeLessThan(0.5); expect(v[i] - v[i - 1]).toBeLessThanOrEqual(v[i - 1] - (v[i - 2] ?? 0) + 1e-9); } // eased: increments only shrink
    for (let i = 0; i < 90; i++) { s = stepPlayer(s, IN, 1 / 60); }
    expect(s.speed).toBeLessThan(0.05);
  });
  it("running is faster than walking; Shift without moving does nothing", () => {
    const w = run(startPlayer(-30, 17.5), { moveZ: 1, cameraYaw: Math.PI / 2 }, 3), r = run(startPlayer(-30, 17.5), { moveZ: 1, run: true, cameraYaw: Math.PI / 2 }, 3);
    expect(r.x - -30).toBeGreaterThan((w.x - -30) * 1.6);
    expect(run(startPlayer(), { run: true }, 1).running).toBe(false);
  });
  it("frame-rate independent: same distance at 30 / 60 / 144 Hz", () => {
    const d = (hz: number) => { const s = run(startPlayer(-30, 17.5), { moveZ: 1, cameraYaw: Math.PI / 2 }, 2, hz); return s.x - -30; };
    expect(Math.abs(d(30) - d(60))).toBeLessThan(0.15); expect(Math.abs(d(144) - d(60))).toBeLessThan(0.15);
  });
  it("a stalled frame (huge dt) never teleports", () => {
    const s0 = startPlayer(), s1 = stepPlayer(s0, { ...IN, moveZ: 1, run: true }, 5);
    expect(Math.hypot(s1.x - s0.x, s1.z - s0.z)).toBeLessThan(0.14);
  });
  it("cannot walk through the building or into deep water; stays in bounds", () => {
    const into = run(startPlayer(-6, -12), { moveZ: 1, cameraYaw: Math.PI, run: true }, 6); // walk north into the building face
    expect(insideSolid({ x: into.x, z: into.z }, into.y)).toBe(false); expect(into.z).toBeGreaterThan(BUILDING.maxZ);
    const sea = run(startPlayer(0, 20), { moveZ: 1, cameraYaw: 0, run: true }, 14);
    expect(isWater(sea.x, sea.z)).toBe(false); expect(sea.z).toBeLessThanOrEqual(BOUNDS.maxZ);
  });
  it("walk → takeoff → fly → assisted landing → walk", () => {
    let s = toggleFly(startPlayer()); expect(s.locomotion).toBe("AIR");
    s = run(s, { moveZ: 1 }, 2.5); expect(s.y - groundHeight(s.x, s.z)).toBeGreaterThan(4); expect(s.grounded).toBe(false);
    s = toggleFly(s); expect(s.landing).toBe(true);
    s = run(s, {}, 12); expect(s.locomotion).toBe("GROUND"); expect(Math.abs(s.y - groundHeight(s.x, s.z))).toBeLessThan(0.1);
  });
  it("flight: vertical control, boost is faster, you hover over water (never sink) and can clear the roof", () => {
    let s = run(toggleFly(startPlayer(0, 10)), { up: 1 }, 6); expect(s.y).toBeGreaterThan(20);
    const slow = run(s, { moveZ: 1 }, 2), fast = run(s, { moveZ: 1, boost: true }, 2); expect(Math.hypot(fast.x - s.x, fast.z - s.z)).toBeGreaterThan(Math.hypot(slow.x - s.x, slow.z - s.z) * 1.5);
    const out = run(toggleFly(startPlayer(0, 20)), { moveZ: 1, up: 0.3 }, 9, 60), sea = run(out, { down: 1 }, 8); expect(isWater(out.x, out.z)).toBe(true); expect(sea.locomotion).toBe("AIR"); expect(sea.y).toBeGreaterThanOrEqual(0.45); // hovers above the sea, never sinks
    const over = run({ ...startPlayer(-6, -40), locomotion: "AIR", y: 30, grounded: false }, { moveZ: 1, cameraYaw: 0 }, 6); expect(over.z).toBeGreaterThan(-31 + 6); // crossed the footprint at 30 m
  });
  it("low in the air you collide with the building instead of passing through", () => {
    const s = run({ ...startPlayer(-6, -40), locomotion: "AIR", y: 4, grounded: false, takeoff: 0 }, { moveZ: 1, cameraYaw: 0, up: 0.02 }, 5);
    expect(s.z).toBeLessThan(BUILDING.minZ);
  });
  it("heading follows the direction of travel", () => {
    const s = run(startPlayer(-30, 17.5), { moveZ: 1, cameraYaw: Math.PI / 2 }, 1.5); expect(Math.abs(s.heading - Math.PI / 2)).toBeLessThan(0.2);
  });
});

describe("mode state machine (walk/fly/overview/follow/focus)", () => {
  it("overview toggles in and out; return-to-player works from every view", () => {
    let m = reduceMode(initialMode(), { type: "TOGGLE_OVERVIEW" }); expect(m.view).toBe("OVERVIEW");
    m = reduceMode(m, { type: "FOCUS_AGENT", id: "a" }); expect(m.view).toBe("FOCUS");
    expect(reduceMode(m, { type: "RETURN_TO_PLAYER" }).view).toBe("PLAYER"); expect(reduceMode(m, { type: "TOGGLE_OVERVIEW" }).view).toBe("PLAYER");
  });
  it("focus is overview-only; follow remembers where to return", () => {
    expect(reduceMode(initialMode(), { type: "FOCUS_AGENT", id: "a" }).view).toBe("PLAYER");
    let m = reduceMode(initialMode(), { type: "FOLLOW_AGENT", id: "a" }); expect(m.view).toBe("FOLLOW");
    expect(reduceMode(m, { type: "EXIT_FOLLOW" }).view).toBe("PLAYER");
    m = reduceMode(reduceMode(initialMode(), { type: "TOGGLE_OVERVIEW" }), { type: "FOLLOW_AGENT", id: "a" }); expect(reduceMode(m, { type: "EXIT_FOLLOW" }).view).toBe("OVERVIEW");
  });
  it("Escape peels back exactly one layer: panel → follow → overview", () => {
    let m = reduceMode(initialMode(), { type: "FOLLOW_AGENT", id: "a" }); m = reduceMode(m, { type: "OPEN_PANEL", id: "a" });
    m = reduceMode(m, { type: "ESCAPE" }); expect(m.panelOpen).toBe(false); expect(m.view).toBe("FOLLOW");
    m = reduceMode(m, { type: "ESCAPE" }); expect(m.view).toBe("PLAYER");
    expect(reduceMode(initialMode(), { type: "ESCAPE" }).view).toBe("PLAYER");
  });
  it("labels", () => { expect(modeLabel("GROUND", false, "PLAYER")).toBe("WALK"); expect(modeLabel("GROUND", true, "PLAYER")).toBe("RUN"); expect(modeLabel("AIR", false, "PLAYER")).toBe("FLY"); expect(modeLabel("AIR", false, "FOLLOW")).toBe("FOLLOW"); });
});

describe("camera rig", () => {
  const player = startPlayer(), inp = { lookYaw: 0, lookPitch: 0.25, overview: { yaw: 0.6, pitch: 0.95, dist: 55, cx: 0, cz: 5 }, followYaw: 0, followPitch: 0.3 };
  it("a view change blends from the CURRENT pose without a jump, and ends exactly on the target", () => {
    const rig = new CameraRig(POSES.player(player, 0, 0.25)); for (let i = 0; i < 30; i++) rig.update(1 / 60, "PLAYER", { player, agent: null }, inp);
    const before = rig.pose; rig.onViewChange(1, "OVERVIEW");
    let prev = before, maxJump = 0;
    for (let i = 0; i < 160; i++) { const p = rig.update(1 / 60, "OVERVIEW", { player, agent: null }, inp); maxJump = Math.max(maxJump, Math.hypot(p.pos.x - prev.pos.x, p.pos.y - prev.pos.y, p.pos.z - prev.pos.z)); prev = p; }
    expect(maxJump).toBeLessThan(2.2); expect(rig.blending).toBe(false);
    const goal = POSES.overview(inp.overview).pos; expect(Math.hypot(prev.pos.x - goal.x, prev.pos.y - goal.y, prev.pos.z - goal.z)).toBeLessThan(0.5);
  });
  it("reduced motion shortens transitions", () => {
    const rig = new CameraRig(POSES.player(player, 0, 0.25)); rig.reducedMotion = true; rig.onViewChange(1, "OVERVIEW");
    for (let i = 0; i < 20; i++) rig.update(1 / 60, "OVERVIEW", { player, agent: null }, inp); expect(rig.blending).toBe(false);
  });
  it("the spring arm never leaves the camera under the ground or inside the building", () => {
    for (let yaw = 0; yaw < 6.3; yaw += 0.4) { const t = { x: -6, y: 1.5, z: -16 }, c = springArm(t, lookDir(yaw, 0.1), 6); expect(c.y).toBeGreaterThanOrEqual(groundHeight(c.x, c.z) + 0.3); expect(insideSolid({ x: c.x, z: c.z }, c.y)).toBe(false); }
  });
});

describe("interaction eligibility", () => {
  const agent = { id: "a", x: 0, y: 0.6, z: 0 }, at = (x: number, y = 0.6, z = 0): PlayerState => ({ ...startPlayer(x, z), x, y, z });
  it("walk-up range, altitude and view rules", () => {
    expect(canInteract(at(2), agent, "PLAYER").ok).toBe(true); expect(canInteract(at(INTERACT_RANGE + 0.5), agent, "PLAYER")).toMatchObject({ ok: false, reason: "too_far" });
    expect(canInteract(at(1, 20), agent, "PLAYER")).toMatchObject({ ok: false, reason: "too_high" }); expect(canInteract(at(1, 1.8), agent, "PLAYER").ok).toBe(true); // hovering low is fine
    expect(canInteract(at(1), agent, "OVERVIEW")).toMatchObject({ ok: false, reason: "overview" }); expect(canInteract(at(1), agent, "FOLLOW")).toMatchObject({ ok: false, reason: "follow" });
    expect(canInteract(at(1), agent, "PLAYER", true)).toMatchObject({ ok: false, reason: "panel_open" });
  });
  it("prompts guide the player; nearest eligible target wins", () => {
    expect(promptFor(canInteract(at(1), agent, "PLAYER"), "Ada")).toBe("Interact with Ada"); expect(promptFor(canInteract(at(6), agent, "PLAYER"), "Ada")).toBe("Move closer to Ada"); expect(promptFor(canInteract(at(1, 20), agent, "PLAYER"), "Ada")).toBe("Descend to talk to Ada"); expect(promptFor(canInteract(at(30), agent, "PLAYER"), "Ada")).toBeNull();
    expect(nearestEligible(at(1), [{ id: "far", x: 3, y: 0.6, z: 0 }, { id: "near", x: 0.5, y: 0.6, z: 0 }], "PLAYER")?.id).toBe("near");
  });
});

describe("quality tiers", () => {
  const dev = (o: Partial<DeviceInfo>): DeviceInfo => ({ isTouch: false, width: 1440, cores: 10, memoryGB: 16, dpr: 2, gpu: "Apple M2", maxTexture: 16384, ...o });
  it("selects an initial tier from capability", () => {
    expect(selectInitialTier(dev({}))).toBe("HIGH"); expect(selectInitialTier(dev({ isTouch: true, width: 390, cores: 6, memoryGB: 4, gpu: "Apple GPU" }))).toBe("LOW"); // iPhone-13-class → LOW
    expect(selectInitialTier(dev({ isTouch: true, width: 430, cores: 8, memoryGB: 8, gpu: "Apple GPU" }))).toBe("MEDIUM");
    expect(selectInitialTier(dev({ gpu: "Google SwiftShader" }))).toBe("LOW"); expect(selectInitialTier(dev({ gpu: "Intel(R) UHD Graphics", cores: 8 }))).toBe("LOW"); expect(selectInitialTier(dev({ gpu: "Mystery GPU", cores: 8 }))).toBe("MEDIUM");
  });
  it("LOW is strictly cheaper than MEDIUM, than HIGH, and never removes core features", () => {
    const [l, m, h] = [TIERS.LOW, TIERS.MEDIUM, TIERS.HIGH];
    for (const k of ["dprMax", "shadowMap", "palmDensity", "tuftDensity", "propDensity", "waterSegments", "farFog", "clouds", "particles"] as const) { expect(l[k]).toBeLessThan(m[k] as number); expect(m[k]).toBeLessThan(h[k] as number); }
    expect(l.shadows).toBe("off"); expect(l.palmDensity).toBeGreaterThan(0); expect(l.waterDetail).toBe(0);
  });
  it("adaptive controller steps down on sustained slowness, steps up slowly, honours manual override, never flaps", () => {
    const q = new AdaptiveQuality("HIGH", 60); let t = 0; const tiers: string[] = [];
    for (let i = 0; i < 600; i++) { t += 0.05; tiers.push(q.update(0.05, 45)); } // 45 ms frames ≈ 22 fps
    expect(q.tier).toBe("LOW"); expect(new Set(tiers).size).toBeLessThanOrEqual(3);
    for (let i = 0; i < 400; i++) q.update(0.05, 8); expect(q.tier).toBe("LOW"); // the ceiling dropped with the step-down: no flapping back up
    const m = new AdaptiveQuality("HIGH", 60, "MEDIUM"); for (let i = 0; i < 400; i++) m.update(0.05, 80); expect(m.tier).toBe("MEDIUM");
    const fast = new AdaptiveQuality("MEDIUM", 60); for (let i = 0; i < 1000; i++) fast.update(0.05, 6); expect(fast.tier).toBe("MEDIUM"); // cannot exceed its initial ceiling
  });
  it("frame stats: fps and 1% low", () => {
    const f = new FrameStats(); for (let i = 0; i < 99; i++) f.push(16.7); f.push(60);
    expect(f.fps).toBeGreaterThan(55); expect(f.onePercentLowFps).toBeLessThan(25); expect(new FrameStats().fps).toBe(0);
  });
});

describe("agent behaviour (cosmetic idle vs simulated work)", () => {
  const sim = (opAt: (t: number) => AgentCtx["opState"], secs: number, player = { x: -60, y: 0, z: -40 }, hold = (_t: number) => false) => {
    let b = startAgent("plaza"); const rand = rng(7), log: { t: number; b: typeof b }[] = []; let maxStep = 0, t = 0;
    while (t < secs) { const prev = b; b = stepAgent(b, 1 / 30, { opState: opAt(t), player, hold: hold(t), rand }); maxStep = Math.max(maxStep, Math.hypot(b.x - prev.x, b.z - prev.z)); log.push({ t, b }); t += 1 / 30; }
    return { b, log, maxStep };
  };
  it("idles: wanders between valid places for ten minutes without entering solids/water or teleporting", () => {
    const { log, maxStep } = sim(() => "IDLE", 600);
    for (const { b } of log) { expect(insideSolid({ x: b.x, z: b.z }, b.y)).toBe(false); expect(isWater(b.x, b.z)).toBe(false); }
    expect(maxStep).toBeLessThan(AGENT.walk * (1 / 30) * 1.2); // never faster than walking speed → no visible teleport
    expect(new Set(log.filter((l) => l.b.mode === "WALK").map((l) => l.b.destId)).size).toBeGreaterThan(3); // visits several places
    expect(log.some((l) => l.b.anim === "walk")).toBe(true); expect(log.some((l) => l.b.anim === "idle")).toBe(true);
  });
  it("turns believably before walking (no instant snaps)", () => {
    const { log } = sim(() => "IDLE", 120); let maxTurn = 0; for (let i = 1; i < log.length; i++) maxTurn = Math.max(maxTurn, Math.abs(Math.atan2(Math.sin(log[i].b.yaw - log[i - 1].b.yaw), Math.cos(log[i].b.yaw - log[i - 1].b.yaw))));
    expect(maxTurn).toBeLessThan(0.2); // radians per 1/30 s
  });
  it("WORKING sends the agent to the workstation, works there, then returns to idle behaviour when work ends", () => {
    const { log } = sim((t) => (t > 20 && t < 140 ? "WORKING" : "IDLE"), 220);
    const w = log.find((l) => l.b.mode === "WORK")!; expect(w).toBeTruthy(); expect(Math.hypot(w.b.x - WORK_SPOT.x, w.b.z - WORK_SPOT.z)).toBeLessThan(0.6); expect(w.b.anim).toBe("work"); expect(w.b.ambient).toBeNull();
    expect(log.filter((l) => l.t > 20 && l.t < 140 && l.b.ambient !== null && l.b.mode === "WORK").length).toBe(0);
    const after = log.filter((l) => l.t > 160); expect(after.some((l) => l.b.mode === "WALK")).toBe(true); expect(after.at(-1)!.b.ambient).not.toBeNull();
  });
  it("holds still while its panel is open and resumes afterwards", () => {
    const { log } = sim(() => "IDLE", 120, undefined, (t) => t > 30 && t < 60);
    const during = log.filter((l) => l.t > 40 && l.t < 59); const spread = Math.max(...during.map((l) => l.b.x)) - Math.min(...during.map((l) => l.b.x)); expect(spread).toBeLessThan(0.6);
    expect(log.filter((l) => l.t > 70).some((l) => l.b.mode === "WALK")).toBe(true);
  });
  it("yields to a player standing in its way instead of walking through", () => {
    let b: ReturnType<typeof startAgent> = { ...startAgent("rail-west"), x: -22, z: 17.5, mode: "WALK", yaw: Math.PI / 2, path: [{ x: -22, z: 17.5 }, { x: 2, z: 17.5 }], pathIdx: 1, destId: "rail-mid" };
    const rand = rng(1); for (let i = 0; i < 90; i++) b = stepAgent(b, 1 / 30, { opState: "IDLE", player: { x: -20.6, y: 0.78, z: 17.5 }, hold: false, rand });
    expect(b.x).toBeLessThan(-20.6 - 0.2); expect(b.yield).toBeGreaterThan(0);
  });
});

describe("world state schema / adapter", () => {
  const snap = (o: Partial<WorldSnapshot> = {}, a: Partial<WorldSnapshot["agents"][0]> = {}): WorldSnapshot => ({
    seq: 1, serverTime: "2026-10-01T12:00:00Z", simulated: true, source: "FIXTURE", system: { status: "SIMULATED", paused: false, mode: "dev" },
    agents: [{ agentId: "CREATIVE_DIRECTOR", name: "Mara Quill", role: "Creative Director", opState: "WORKING", taskId: "SIM-T1", taskKind: "director.concepts", taskTitle: "Draft concept board", productionId: "SIM-PROD-001", creator: "SIM creator", attempt: 1, maxAttempts: 3, startedAt: "2026-10-01T11:58:30Z", blockedReason: null, provider: null, location: "CREATIVE_STUDIO", nextAction: "Hand to Prompt Engineer", lastActivityAt: null, recentActivity: [], ...a }],
    budget: { imagesToday: "UNKNOWN", limitsRemaining: "NOT CONFIGURED" }, approvals: { waiting: "UNKNOWN" }, alerts: [], ...o });
  it("accepts a valid simulated snapshot and rejects malformed ones", () => {
    expect(parseSimulatedSnapshot(snap()).agents).toHaveLength(1);
    expect(() => parseSimulatedSnapshot({ ...snap(), agents: [{ agentId: "x" }] })).toThrow(SnapshotRejected); expect(() => parseSimulatedSnapshot(null)).toThrow(SnapshotRejected);
    expect(() => parseSimulatedSnapshot({ ...snap(), agents: [{ ...snap().agents[0], opState: "DANCING" }] })).toThrow(SnapshotRejected);
  });
  it("PRODUCTION ISOLATION: the dev world refuses anything that is not a SIMULATED fixture", () => {
    expect(() => parseSimulatedSnapshot(snap({ simulated: false }))).toThrow(/SIMULATED/); expect(() => parseSimulatedSnapshot(snap({ source: "REAL" }))).toThrow(/SIMULATED/);
  });
  it("panel: ambient behaviour is shown only when IDLE and always labelled cosmetic; working shows the task", () => {
    const idle = buildAgentPanel(snap({}, { opState: "IDLE", taskTitle: null, taskId: null, productionId: null, startedAt: null, nextAction: null }), "CREATIVE_DIRECTOR", "looking out at the ocean")!;
    expect(idle.statusLabel).toBe("IDLE"); expect(idle.ambientNote).toMatch(/cosmetic — no work in progress/); expect(idle.rows.find((r) => r[0] === "Status")![1]).toMatch(/IDLE — no task/);
    const work = buildAgentPanel(snap(), "CREATIVE_DIRECTOR", "looking out at the ocean")!;
    expect(work.statusLabel).toBe("WORKING"); expect(work.ambientNote).toBeNull(); expect(work.rows.find((r) => r[0] === "Elapsed")![1]).toBe("1m 30s"); expect(work.rows.find((r) => r[0] === "Provider")![1]).toMatch(/none/);
    expect(work.banner).toMatch(/SIMULATED DATA/); expect(buildAgentPanel(snap(), "NOBODY", null)).toBeNull();
  });
  it("roles are distinguishable by more than colour (glyph + prop + hat)", () => {
    const s = ["CREATIVE_DIRECTOR", "PROMPT_ENGINEER", "IDENTITY_QA", "PRODUCTION_MANAGER", "ORCHESTRATOR"].map(roleStyle);
    expect(new Set(s.map((r) => r.glyph)).size).toBe(5); expect(new Set(s.map((r) => r.color)).size).toBe(5); expect(roleStyle("CREATIVE_DIRECTOR").prop).toBe("tablet");
    expect(humanElapsed("2026-10-01T10:00:00Z", "2026-10-01T12:05:00Z")).toBe("2h 5m");
  });
});

describe("production isolation of the world POC", () => {
  const root = process.cwd();
  it("/world-dev is allowed in development and 404 in production unless explicitly enabled locally", () => {
    expect(worldDevAllowed({ NODE_ENV: "development" })).toBe(true); expect(worldDevAllowed({ NODE_ENV: "test" })).toBe(true);
    expect(worldDevAllowed({ NODE_ENV: "production" })).toBe(false); expect(worldDevAllowed({ NODE_ENV: "production", NORTHLINE_WORLD_DEV: "off" })).toBe(false); expect(worldDevAllowed({ NODE_ENV: "production", NORTHLINE_WORLD_DEV: "on" })).toBe(true);
  });
  it("the Render blueprint never enables the world POC, adds no provider vars, and keeps the locked flags", () => {
    const y = fs.readFileSync(path.join(root, "render.yaml"), "utf8");
    expect(y).not.toMatch(/WORLD/); expect(y).not.toMatch(/OPENAI|GEMINI|HIGGS/);
    expect(y).toMatch(/NORTHLINE_READONLY\n\s+value: "true"/); expect(y).toMatch(/NORTHLINE_GOVERNOR\n\s+value: "on"/); expect(y).toMatch(/NORTHLINE_DURABLE_JOBS\n\s+value: "off"/); expect(y).toMatch(/NORTHLINE_AUTONOMOUS_GENERATION\n\s+value: "off"/);
  });
  const walk = (d: string): string[] => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])) : []);
  const worldFiles = [...walk(path.join(root, "src/lib/world")), ...walk(path.join(root, "src/world-dev"))].filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f));
  it("world code imports no real-state, provider, LLM or database module and makes no network calls", () => {
    expect(worldFiles.length).toBeGreaterThan(8);
    for (const f of worldFiles) {
      const src = fs.readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/from "@\/lib\/(db|providers|llm|agents|orchestrator|pipeline|governor|ops|auth|references|identity\/(service|canonical))/);
      expect(src, f).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket|EventSource|supabase/i);
    }
  });
  it("only the world-dev route imports the fixture; nothing else in the app can reach it", () => {
    const offenders = walk(path.join(root, "src")).filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes("world-dev") && !/\.test\./.test(f) && /world-dev\/fixtures/.test(fs.readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
  it("the normal app does not import the 3D stack (no three/r3f outside the world chunk)", () => {
    const offenders = walk(path.join(root, "src")).filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes("world-dev") && !f.includes("/app/world-dev/") && !/\.test\./.test(f) && /from "(three|@react-three\/(fiber|drei))/.test(fs.readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});

describe("asset registry", () => {
  const reg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "docs/world-assets/registry.json"), "utf8"));
  const third = { asset_id: "TP-1", name: "x", kind: "third-party", source: "https://example.test", vendor_creator: "V", license: "CC0", commercial_use: "yes", modification_rights: "yes", redistribution_restrictions: "none", repo_redistribution_permitted: true, attribution_required: false, attribution_text: "", original_format: "glb", optimized_format: "glb+meshopt", triangles: 1200, texture_resolution: "1024", lod_available: false, northline_usage: "palm", date_acquired: "2026-10-01", license_evidence: "docs/world-assets/licenses/none.txt", files: ["public/world/palm.glb"] };
  it("the committed registry is valid and no art file is unregistered", () => { expect(validateRegistry(reg)).toEqual([]); expect(unregisteredBinaries(reg, WORLD_ASSET_DIRS)).toEqual([]); });
  it("rejects third-party assets with unknown/no commercial use, missing evidence, missing attribution or no redistribution right", () => {
    const bad = (o: object) => validateRegistry({ version: 1, assets: [{ ...third, ...o }] });
    expect(bad({ commercial_use: "unknown" }).join()).toMatch(/commercial use/); expect(bad({ commercial_use: "no" }).join()).toMatch(/commercial use/);
    expect(bad({ license_evidence: null }).join()).toMatch(/no saved licence evidence/); expect(bad({}).join()).toMatch(/evidence file is missing/);
    expect(bad({ attribution_required: true, license_evidence: null }).join()).toMatch(/attribution/); expect(bad({ repo_redistribution_permitted: false }).join()).toMatch(/does not permit/);
    expect(bad({ license: "" }).join()).toMatch(/license/); expect(validateRegistry({ version: 1, assets: [{ ...third }, { ...third }] }).join()).toMatch(/duplicate/);
  });
  it("flags art files that are not in the registry", () => {
    const tmp = fs.mkdtempSync(path.join(process.cwd(), ".tmp-assets-")); try {
      fs.mkdirSync(path.join(tmp, "public/world"), { recursive: true }); fs.writeFileSync(path.join(tmp, "public/world/mystery.glb"), "x"); fs.writeFileSync(path.join(tmp, "public/world/notes.txt"), "x");
      expect(unregisteredBinaries({ assets: [] }, ["public/world"], tmp)).toEqual([path.join("public/world", "mystery.glb")]);
      expect(unregisteredBinaries({ assets: [{ files: ["public/world/mystery.glb"] }] }, ["public/world"], tmp)).toEqual([]);
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  });
});

describe("camera-relative controls", () => {
  it("D moves to the player's right and A to the left, for any camera yaw", () => {
    // facing +z (yaw 0): right-hand side is −x. Facing +x (yaw π/2): right-hand side is +z.
    const d0 = run(startPlayer(0, 17.5), { moveX: 1, cameraYaw: 0 }, 1); expect(d0.x).toBeLessThan(-1); expect(Math.abs(d0.z - 17.5)).toBeLessThan(0.3);
    const d1 = run(startPlayer(-20, 12), { moveX: 1, cameraYaw: Math.PI / 2 }, 1); expect(d1.z).toBeGreaterThan(13); expect(Math.abs(d1.x + 20)).toBeLessThan(0.3);
    const a0 = run(startPlayer(0, 17.5), { moveX: -1, cameraYaw: 0 }, 1); expect(a0.x).toBeGreaterThan(1);
  });
});
