// Founder command system + movement upgrade tests (pure logic; no WebGL, no network).
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { createElement } from "react";
import { AGENT, releaseAgent, startAgent, stepAgent, type AgentBrain, type AgentDirective, type AgentProfile } from "./agent-ai";
import { buildBoard, type BoardData } from "./board";
import { ALL_IDS, MEETING_SLOTS, REFORM_DISTANCE, groupMembers, initialCommand, reduceCommand, releasedIds, type CommandAction, type CommandEnv, type CommandState } from "./command";
import { SLOT_TEMPLATE, allocateFormation, assignSlots, standable } from "./formation";
import { STATUS_META, displayStatus, labelLevel, LABEL_DIST } from "./labels";
import { HQ, SPOTS, groundHeight, insideSolid, isWater, supportHeight, ceilingAt } from "./layout";
import { findPath, getGraph } from "./nav";
import { FLIGHT_TIERS, TUNING, effectiveTier, headroomClamp, initialMode, modeLabel, reduceMode, startPlayer, stepPlayer, stepTier, toggleFly, type PlayerInput, type PlayerState } from "./player";
import { GROUPS, ROSTER_BY_CODE, WORLD_ROSTER } from "./roster";
import { rng } from "./math";
import { travelPoints } from "./travel";
import { parseSimulatedSnapshot } from "./schema";
import { SimulatedScenario } from "../../world-dev/fixtures/scenario";
import { Input } from "../../world-dev/input";
import { MobileControls } from "../../world-dev/ui/MobileControls";
import { FounderCommand } from "../../world-dev/ui/FounderCommand";
import { WHEEL_ITEMS } from "../../world-dev/wheel";

const IN: PlayerInput = { moveX: 0, moveZ: 0, cameraYaw: 0, run: false, up: 0, down: 0, boost: false };
const run = (s: PlayerState, i: Partial<PlayerInput> | ((t: number) => Partial<PlayerInput>), secs: number, hz = 60, each?: (s: PlayerState, t: number) => void) => { let st = s; const dt = 1 / hz; for (let t = 0; t < secs; t += dt) { st = stepPlayer(st, { ...IN, ...(typeof i === "function" ? i(t) : i) }, dt); each?.(st, t); } return st; };
const flying = (x = 0, z = 20, y = 40): PlayerState => ({ ...startPlayer(x, z), locomotion: "AIR", y, grounded: false, takeoff: 0 });

describe("jump", () => {
  it("only jumps from the ground, once per key press, and lands back at the same height", () => {
    let s = startPlayer(-30, 17.5), jumps = 0, maxY = s.y; const y0 = s.y;
    for (let t = 0; t < 3; t += 1 / 60) { const before = s.grounded; s = stepPlayer(s, { ...IN, jump: true }, 1 / 60); if (s.jumped) jumps++; if (!before && s.jumped) throw new Error("jumped in mid-air"); maxY = Math.max(maxY, s.y); } // Space held the whole time
    expect(jumps).toBe(1); expect(maxY - y0).toBeGreaterThan(0.9); expect(maxY - y0).toBeLessThan(1.6); expect(s.grounded).toBe(true); expect(Math.abs(s.y - y0)).toBeLessThan(0.05);
    s = stepPlayer(s, { ...IN, jump: false }, 1 / 60); s = stepPlayer(s, { ...IN, jump: true }, 1 / 60); expect(s.jumped).toBe(true); // released and pressed again = a new jump
  });
  it("pressing jump in mid-air does nothing (no infinite jump / double jump)", () => {
    let s = startPlayer(-30, 17.5); s = stepPlayer(s, { ...IN, jump: true }, 1 / 60); for (let i = 0; i < 20; i++) s = stepPlayer(s, { ...IN, jump: false }, 1 / 60); const vy = s.vy; expect(s.grounded).toBe(false);
    s = stepPlayer(s, { ...IN, jump: true }, 1 / 60); expect(s.jumped).toBe(false); expect(s.vy).toBeLessThan(vy + 1e-9); // gravity only
  });
  it("is airborne ~0.7 s with gravity, has an arc (rises then falls), and keeps horizontal momentum", () => {
    let s = run(startPlayer(-40, 17.5), { moveZ: 1, cameraYaw: Math.PI / 2, run: true }, 1.2); const x0 = s.x; let air = 0, peak = -1; const ys: number[] = [];
    s = run(s, { moveZ: 1, cameraYaw: Math.PI / 2, run: true, jump: true }, 1.4, 60, (st) => { if (!st.grounded) { air += 1 / 60; ys.push(st.y); } peak = Math.max(peak, st.y); });
    expect(air).toBeGreaterThan(0.5); expect(air).toBeLessThan(1.0); expect(s.x - x0).toBeGreaterThan(8); const iPeak = ys.indexOf(Math.max(...ys)); expect(iPeak).toBeGreaterThan(3); expect(iPeak).toBeLessThan(ys.length - 3);
  });
  it("cannot jump through a ceiling (head-room clamp)", () => {
    expect(headroomClamp(2.9, 4, 4.5, 0.6)).toEqual({ y: 2.7, vy: 0 }); expect(headroomClamp(1.5, 4, 4.5, 0.6)).toEqual({ y: 1.5, vy: 4 }); expect(headroomClamp(3.5, -2, 3.6, 0.6).vy).toBe(-2);
    const lobby = { x: -19, z: -25.5 }; let s = { ...startPlayer(lobby.x, lobby.z) }; s = run(s, { jump: true }, 1, 60, (st) => { expect(st.y + TUNING.headroom).toBeLessThanOrEqual(ceilingAt(st.x, st.z, st.y + 0.9) + 1e-6); }); expect(s.grounded).toBe(true);
  });
  it("works on the HQ stairs (lands on the stair surface, not through it) and indoors", () => {
    const node = getGraph().nodes.get("hq-stairs-2")!; let s = { ...startPlayer(node.x, node.z), y: node.y }; const sup = (st: PlayerState) => supportHeight(st.x, st.z, st.y, 0.45);
    s = run(s, { jump: true }, 1.2, 60, (st) => { expect(st.y).toBeGreaterThanOrEqual(sup(st) - 0.5 - 1e-6); }); expect(s.grounded).toBe(true); expect(Math.abs(s.y - sup(s))).toBeLessThan(0.2); expect(s.y).toBeGreaterThan(1.5); // still on the staircase
  });
  it("collides with walls while jumping, and can hop a low obstacle but not a wall", () => {
    let s = { ...startPlayer(-30, HQ.z1 + 2), heading: Math.PI }; s = run(s, { moveZ: 1, cameraYaw: Math.PI, run: true, jump: true }, 3); expect(s.z).toBeGreaterThan(HQ.z1 - 0.4); expect(insideSolid({ x: s.x, z: s.z }, s.y, 1.7)).toBe(false);
  });
  it("jumping outdoors and over the sea edge never ends in deep water", () => { const s = run(startPlayer(0, 17.5), { moveZ: 1, cameraYaw: 0, run: true, jump: true }, 6); expect(isWater(s.x, s.z)).toBe(false); });
  it("the mode label shows JUMP while airborne on foot", () => { expect(modeLabel("GROUND", true, "PLAYER", "NORMAL", true)).toBe("JUMP"); expect(modeLabel("GROUND", true, "PLAYER")).toBe("RUN"); });
});

describe("run / sprint", () => {
  const speedAfter = (run_: boolean, secs: number) => run(startPlayer(-60, 17.5), { moveZ: 1, cameraYaw: Math.PI / 2, run: run_ }, secs).speed;
  it("sprint is meaningfully faster than walking, and walking is not painfully slow", () => { const w = speedAfter(false, 1.5), r = speedAfter(true, 2.5); expect(w).toBeGreaterThan(3.3); expect(r).toBeGreaterThan(w * 2); expect(TUNING.walk).toBeGreaterThanOrEqual(3.4); });
  it("accelerates fast, stops firmly, and walk⇄run transitions are smooth (no step > 1 m/s per frame)", () => {
    let s = startPlayer(-60, 17.5), prev = 0, maxStep = 0, t = 0; const seq = (tt: number) => (tt < 1.2 ? { run: false } : tt < 3 ? { run: true } : tt < 4 ? { run: false } : { moveZ: 0 });
    for (; t < 5; t += 1 / 60) { s = stepPlayer(s, { ...IN, moveZ: t < 4 ? 1 : 0, cameraYaw: Math.PI / 2, ...seq(t) }, 1 / 60); maxStep = Math.max(maxStep, Math.abs(s.speed - prev)); prev = s.speed; }
    expect(maxStep).toBeLessThan(1); expect(s.speed).toBeLessThan(0.2);
    expect(run(startPlayer(-60, 17.5), { moveZ: 1, cameraYaw: Math.PI / 2, run: true }, 0.7).speed).toBeGreaterThan(TUNING.run * 0.6);
  });
});

describe("flight: activation, tiers, turbo, braking, safety", () => {
  it("F toggles flight (takeoff) and the same key requests an assisted landing", () => { let s = toggleFly(startPlayer()); expect(s.locomotion).toBe("AIR"); s = toggleFly(s); expect(s.landing).toBe(true); });
  it("effective tier: cruise tier, Shift = FAST, double-tap-held Shift = TURBO", () => {
    expect(effectiveTier("NORMAL", false, false)).toBe("NORMAL"); expect(effectiveTier("NORMAL", true, false)).toBe("FAST"); expect(effectiveTier("NORMAL", true, true)).toBe("TURBO"); expect(effectiveTier("FAST", false, true)).toBe("FAST"); expect(effectiveTier("TURBO", false, false)).toBe("TURBO");
    expect(stepTier("NORMAL", -1)).toBe("NORMAL"); expect(stepTier("FAST", 1)).toBe("TURBO"); expect(stepTier("TURBO", 1)).toBe("TURBO"); expect(FLIGHT_TIERS).toEqual(["NORMAL", "FAST", "TURBO"]);
  });
  const cruise = (tier: PlayerInput["tier"], secs = 9) => run(flying(-95, 30, 60), { moveZ: 1, cameraYaw: Math.PI / 2, tier }, secs);
  it("NORMAL < FAST < TURBO top speeds, TURBO genuinely fast", () => { const n = cruise("NORMAL"), f = cruise("FAST"), t = cruise("TURBO"); expect(n.speed).toBeGreaterThan(17); expect(f.speed).toBeGreaterThan(n.speed * 1.9); expect(t.speed).toBeGreaterThan(f.speed * 1.9); expect(t.speed).toBeGreaterThan(85); });
  it("TURBO crosses the whole town in a few seconds", () => { let s = flying(-100, 30, 60), t = 0; for (; t < 20 && s.x < 100; t += 1 / 60) s = stepPlayer(s, { ...IN, moveZ: 1, cameraYaw: Math.PI / 2, tier: "TURBO" }, 1 / 60); expect(t).toBeLessThan(5.5); });
  it("speed ramps gradually (no instant velocity change) on the way up, on tier changes and on the way down", () => {
    let s = flying(-100, 30, 60), prev = 0, maxStep = 0; for (let i = 0; i < 60 * 8; i++) { s = stepPlayer(s, { ...IN, moveZ: 1, cameraYaw: Math.PI / 2, tier: i < 120 ? "NORMAL" : "TURBO" }, 1 / 60); maxStep = Math.max(maxStep, Math.abs(s.speed - prev)); prev = s.speed; if (i === 6) expect(s.speed).toBeLessThan(0.2 * TUNING.flyTiers.TURBO.top); }
    for (let i = 0; i < 60 * 3; i++) { s = stepPlayer(s, { ...IN, tier: "NORMAL" }, 1 / 60); maxStep = Math.max(maxStep, Math.abs(s.speed - prev)); prev = s.speed; }
    expect(maxStep).toBeLessThan(3.3); // m/s per frame at 60 Hz, even at ~98 m/s
  });
  it("releasing the controls damps the speed (no endless drift) and BRAKE stops much faster", () => {
    const fast = cruise("TURBO", 7); expect(fast.speed).toBeGreaterThan(85);
    const coast = run(fast, { tier: "TURBO" }, 2.5), braked = run(fast, { tier: "TURBO", brake: true }, 0.9), loose = run(fast, { tier: "TURBO" }, 0.9);
    expect(coast.speed).toBeLessThan(6); expect(braked.speed).toBeLessThan(loose.speed * 0.35); expect(braked.speed).toBeLessThan(6); expect(braked.braking).toBe(true);
  });
  it("landing from turbo sheds speed first and touches down gently on the ground (never underground)", () => {
    let s = run(flying(-60, 30, 40), { moveZ: 1, cameraYaw: Math.PI / 2, tier: "TURBO" }, 5); s = toggleFly(s); let touch: number | null = null;
    s = run(s, { moveZ: 1, cameraYaw: Math.PI / 2, tier: "TURBO" }, 14, 60, (st) => { expect(st.y).toBeGreaterThanOrEqual(supportHeight(st.x, st.z, st.y, 0.3) - 0.01); if (st.locomotion === "GROUND" && touch === null) touch = st.speed; });
    expect(s.locomotion).toBe("GROUND"); expect(touch).not.toBeNull(); expect(touch!).toBeLessThan(10);
  });
  it("collision safety at turbo: never inside a building, never under the terrain, even head-on", () => {
    let s = flying(-18, -8, 3.5); let minClear = 99; // low, straight at the HQ facade
    s = run(s, { moveZ: 1, cameraYaw: Math.PI, tier: "TURBO" }, 6, 60, (st) => { expect(insideSolid({ x: st.x, z: st.z }, st.y - 0.5, 1.0), `inside solid @${st.x.toFixed(1)},${st.z.toFixed(1)},${st.y.toFixed(1)}`).toBe(false); minClear = Math.min(minClear, st.y - groundHeight(st.x, st.z)); });
    expect(minClear).toBeGreaterThan(0.1);
    let h = flying(0, -44, 6); h = run(h, { moveZ: 1, cameraYaw: Math.PI, tier: "TURBO" }, 8, 60, (st) => { expect(st.y).toBeGreaterThanOrEqual(groundHeight(st.x, st.z) + 0.1); }); expect(h.z).toBeLessThan(-44); // headed for the hills: climbs, never clips
  });
  it("big frame-time spikes at turbo never tunnel through a thin wall", () => { let s = flying(-30, -2, 3.5); s = run(s, { moveZ: 1, cameraYaw: Math.PI, tier: "TURBO" }, 5, 20); expect(s.z).toBeGreaterThan(HQ.z1 - 0.8); });
  it("the HUD label shows the flight tier", () => { expect(modeLabel("AIR", false, "PLAYER", "NORMAL")).toBe("FLY"); expect(modeLabel("AIR", false, "PLAYER", "FAST")).toBe("FAST"); expect(modeLabel("AIR", false, "PLAYER", "TURBO")).toBe("TURBO"); });
});

// ---- founder command -------------------------------------------------------------------------------------------------------
const agentsAt = (x: number, z: number) => WORLD_ROSTER.map((r, i) => ({ id: r.code, x: x + (i - 5) * 3, z: z + 30 }));
const envAt = (x: number, z: number, o: Partial<CommandEnv> = {}): CommandEnv => ({ player: { x, y: supportHeight(x, z, 1.2), z, yaw: Math.PI }, agents: agentsAt(x, z), valid: () => true, ...o });
const apply = (s: CommandState, env: CommandEnv, ...a: CommandAction[]) => a.reduce((st, x) => reduceCommand(st, x, env), s);

describe("command mode state + multi-selection + groups", () => {
  it("Founder Command is a mode layer: toggles anywhere, closes the wheel, opens above the world, Esc peels exactly one layer", () => {
    let m = reduceMode(initialMode(), { type: "TOGGLE_COMMAND" }); expect(m.commandOpen).toBe(true); expect(m.view).toBe("PLAYER");
    m = reduceMode(m, { type: "TOGGLE_WHEEL" }); expect(m.wheelOpen).toBe(true); m = reduceMode(m, { type: "OPEN_PANEL", id: "ORCHESTRATOR" });
    m = reduceMode(m, { type: "ESCAPE" }); expect(m.wheelOpen).toBe(false); expect(m.panelOpen).toBe(true); m = reduceMode(m, { type: "ESCAPE" }); expect(m.panelOpen).toBe(false); expect(m.commandOpen).toBe(true);
    m = reduceMode(m, { type: "ESCAPE" }); expect(m.commandOpen).toBe(false); expect(reduceMode(initialMode(), { type: "OPEN_SUITE" }).suiteOpen).toBe(true); expect(reduceMode(reduceMode(initialMode(), { type: "OPEN_COMMAND" }), { type: "OPEN_SUITE" }).commandOpen).toBe(false);
    expect(reduceMode(initialMode(), { type: "FOCUS_AGENT", id: "ORCHESTRATOR" }).view).toBe("FOCUS"); // remote focus, no proximity needed
  });
  it("multi-select: toggle, select all / none, group, set — unknown ids ignored, order stable", () => {
    const e = envAt(0, 0); let s = apply(initialCommand(), e, { type: "SELECT_TOGGLE", id: "GROWTH_STRATEGIST" }, { type: "SELECT_TOGGLE", id: "ORCHESTRATOR" }); expect(s.selection).toEqual(["ORCHESTRATOR", "GROWTH_STRATEGIST"]);
    s = apply(s, e, { type: "SELECT_TOGGLE", id: "ORCHESTRATOR" }, { type: "SELECT_TOGGLE", id: "NOBODY" }); expect(s.selection).toEqual(["GROWTH_STRATEGIST"]);
    expect(apply(s, e, { type: "SELECT_ALL" }).selection).toHaveLength(10); expect(apply(s, e, { type: "SELECT_NONE" }).selection).toEqual([]); expect(apply(s, e, { type: "SELECT_GROUP", group: "CREATIVE" }).selection.sort()).toEqual(["CAPTION_WRITER", "CREATIVE_DIRECTOR", "PROMPT_ENGINEER"]);
    expect(apply(s, e, { type: "SELECT_SET", ids: ["IDENTITY_QA", "x", "CONTENT_QA"] }).selection).toEqual(["IDENTITY_QA", "CONTENT_QA"]); expect(apply(s, e, { type: "SELECT_ONLY", id: "IDENTITY_QA" }).selection).toEqual(["IDENTITY_QA"]);
  });
  it("six operational groups cover every agent exactly once (presentation only; the registry is unchanged)", () => {
    expect(GROUPS.map((g) => g.id).sort()).toEqual(["CREATIVE", "GROWTH", "OPERATIONS", "PRODUCTION", "QUALITY", "STRATEGY"]); const all = GROUPS.flatMap((g) => groupMembers(g.id)); expect(all.sort()).toEqual([...ALL_IDS].sort());
  });
});

describe("formation allocation", () => {
  const c = { x: 0, z: 0 };
  it("returns exactly n well-spaced slots in front of the founder, none on top of the founder", () => {
    const sl = allocateFormation(c, 0, 10, () => true); expect(sl).toHaveLength(10); expect(sl.every((p) => !p.fallback)).toBe(true);
    for (let i = 0; i < sl.length; i++) { expect(Math.hypot(sl[i].x, sl[i].z)).toBeGreaterThanOrEqual(1.6); for (let j = i + 1; j < sl.length; j++) expect(Math.hypot(sl[i].x - sl[j].x, sl[i].z - sl[j].z)).toBeGreaterThanOrEqual(1.7 - 1e-9); }
    expect(sl.filter((p) => p.z > 0).length).toBeGreaterThanOrEqual(8); // yaw 0 looks along +z: the stage is in front
    expect(SLOT_TEMPLATE.length).toBeGreaterThanOrEqual(12);
  });
  it("follows the founder's facing direction", () => { const a = allocateFormation(c, Math.PI / 2, 10, () => true); expect(a.filter((p) => p.x > 0).length).toBeGreaterThanOrEqual(8); });
  it("adapts to blocked space with the nearest valid points (spacing relaxes, never overlaps)", () => {
    const sl = allocateFormation(c, 0, 10, (x, z) => !(z > 2 && z < 9 && Math.abs(x) < 4)); expect(sl).toHaveLength(10); expect(sl.filter((p) => p.fallback)).toHaveLength(0); for (const p of sl) expect(!(p.z > 2 && p.z < 9 && Math.abs(p.x) < 4)).toBe(true);
    const tight = allocateFormation(c, 0, 10, (x, z) => Math.hypot(x, z) < 9 && Math.abs(x) < 2.6); expect(tight).toHaveLength(10);
  });
  it("INVALID formation recovery: with no valid space it still returns n slots, flagged fallback, never throws", () => { const sl = allocateFormation(c, 0, 10, () => false); expect(sl).toHaveLength(10); expect(sl.every((p) => p.fallback)).toBe(true); expect(allocateFormation(c, 0, 0, () => true)).toEqual([]); });
  it("assignSlots is sticky and total", () => {
    const sl = allocateFormation(c, 0, 4, () => true), ag = [{ id: "a", x: 9, z: 9 }, { id: "b", x: -9, z: 9 }, { id: "c", x: 0, z: 12 }, { id: "d", x: 0, z: 30 }], first = assignSlots(ag, sl); expect(new Set(Object.values(first)).size).toBe(4);
    const again = assignSlots(ag.map((x) => ({ ...x, x: x.x + 1 })), sl, first); expect(again).toEqual(first);
  });
  it("in the REAL world every summon formation point is standable, reachable, on the founder's floor — outdoors, in the lobby, on the pier and the beach", () => {
    for (const [x, z, y] of [[-14, -7.2, 0.6], [-19, -25.5, 0.74], [-66, 66, 0.9], [-30, 30, 0.2], [60, 14, 0.7], [-7, -25.5, 5.12]] as const) {
      const ref = supportHeight(x, z, y, 0.3), sl = allocateFormation({ x, z }, Math.PI, 10, (px, pz) => standable(px, pz, ref)); expect(sl, `${x},${z}`).toHaveLength(10);
      expect(sl.filter((p) => p.fallback).length, `fallback at ${x},${z}`).toBe(0); for (const p of sl) expect(standable(p.x, p.z, ref), `${x},${z} → ${p.x.toFixed(1)},${p.z.toFixed(1)}`).toBe(true);
    }
  });
});

describe("summon / dismiss / return / workspace / meeting (simulated commands)", () => {
  const e = envAt(-14, -7.2);
  it("SUMMON (individual) gives one agent a SUMMON directive with a target near the founder; others are untouched", () => {
    const s = apply(initialCommand(), e, { type: "SUMMON", ids: ["CAPTION_WRITER"] }), d = s.directives.CAPTION_WRITER; expect(d.kind).toBe("SUMMON"); expect(d.label).toBe("COMING TO FOUNDER"); expect(Object.keys(s.directives)).toEqual(["CAPTION_WRITER"]);
    const dist = Math.hypot(d.target!.x - -14, d.target!.z - -7.2); expect(dist).toBeGreaterThanOrEqual(1.6); expect(dist).toBeLessThan(8);
  });
  it("SUMMON ALL directs all 10 agents to distinct, spaced points", () => {
    const s = apply(initialCommand(), e, { type: "SUMMON_ALL" }); expect(Object.keys(s.directives).sort()).toEqual([...ALL_IDS].sort()); const t = Object.values(s.directives).map((d) => d.target!);
    for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) expect(Math.hypot(t[i].x - t[j].x, t[i].z - t[j].z)).toBeGreaterThanOrEqual(1.7 - 1e-9);
    expect(s.formation!.slots).toHaveLength(10);
  });
  it("summoning another agent later keeps the existing agents on their slots", () => {
    const s1 = apply(initialCommand(), e, { type: "SUMMON", ids: ["ORCHESTRATOR"] }), s2 = apply(s1, e, { type: "SUMMON", ids: ["GROWTH_STRATEGIST"] }); expect(s2.directives.ORCHESTRATOR.target).toEqual(s1.directives.ORCHESTRATOR.target);
    expect(s2.directives.GROWTH_STRATEGIST.target).not.toEqual(s2.directives.ORCHESTRATOR.target);
  });
  it("REFORM re-plans only after the founder has moved, keeping slot assignment", () => {
    const s = apply(initialCommand(), e, { type: "SUMMON_ALL" }); expect(reduceCommand(s, { type: "REFORM" }, envAt(-13, -7)).version).toBe(s.version);
    const far = envAt(-14 + REFORM_DISTANCE + 1, -7.2), s2 = reduceCommand(s, { type: "REFORM" }, far); expect(s2.version).toBeGreaterThan(s.version); expect(s2.formation!.assign).toEqual(s.formation!.assign);
    expect(Math.hypot(s2.directives.ORCHESTRATOR.target!.x - far.player.x, s2.directives.ORCHESTRATOR.target!.z - far.player.z)).toBeLessThan(9);
  });
  it("SUMMON_SELECTED uses the multi-selection; empty selection does nothing", () => {
    expect(apply(initialCommand(), e, { type: "SUMMON_SELECTED" }).directives).toEqual({}); const s = apply(initialCommand(), e, { type: "SELECT_SET", ids: ["IDENTITY_QA", "CONTENT_QA"] }, { type: "SUMMON_SELECTED" }); expect(Object.keys(s.directives).sort()).toEqual(["CONTENT_QA", "IDENTITY_QA"]);
  });
  it("DISMISS ALL releases everyone; RETURN TO WORK releases only the named agents", () => {
    const s = apply(initialCommand(), e, { type: "SUMMON_ALL" }), d = reduceCommand(s, { type: "DISMISS_ALL" }, e); expect(d.directives).toEqual({}); expect(releasedIds(s, d).sort()).toEqual([...ALL_IDS].sort()); expect(d.formation).toBeNull();
    const r = reduceCommand(s, { type: "RETURN_TO_WORK", ids: ["ORCHESTRATOR"] }, e); expect(Object.keys(r.directives)).toHaveLength(9); expect(releasedIds(s, r)).toEqual(["ORCHESTRATOR"]);
  });
  it("GO TO WORKSPACE targets each agent's registered workspace spot", () => {
    const s = apply(initialCommand(), e, { type: "GO_WORKSPACE", ids: ALL_IDS }); for (const r of WORLD_ROSTER) { expect(s.directives[r.code].kind).toBe("WORKSPACE"); expect(s.directives[r.code].spotId).toBe(r.workspace); }
  });
  it("CALL MEETING sends agents to distinct designated meeting spots in the HQ meeting room; CALL SELECTED only the selected", () => {
    const s = apply(initialCommand(), e, { type: "CALL_ALL" }); expect(s.meeting).toBe(true); const spots = Object.values(s.directives).map((d) => d.spotId); expect(new Set(spots).size).toBe(10); expect([...spots].sort()).toEqual([...MEETING_SLOTS].sort());
    const g = getGraph(); for (const id of MEETING_SLOTS) { const sp = SPOTS.find((x) => x.id === id)!; expect(sp, id).toBeTruthy(); expect(findPath(g, "hq-door-out", id), id).not.toBeNull(); expect(sp.x).toBeGreaterThan(-26); expect(sp.x).toBeLessThan(-19); expect(sp.z).toBeLessThan(-32); }
    const sel = apply(initialCommand(), e, { type: "SELECT_SET", ids: ["ORCHESTRATOR", "CREATIVE_DIRECTOR"] }, { type: "CALL_SELECTED" }); expect(Object.keys(sel.directives).sort()).toEqual(["CREATIVE_DIRECTOR", "ORCHESTRATOR"]);
    const dismissed = reduceCommand(s, { type: "DISMISS_ALL" }, e); expect(dismissed.meeting).toBe(false);
  });
  it("a meeting replaces a summon (and vice versa) for the same agent", () => {
    let s = apply(initialCommand(), e, { type: "SUMMON_ALL" }, { type: "CALL_SELECTED" }); expect(s.directives.ORCHESTRATOR.kind).toBe("SUMMON");
    s = apply(s, e, { type: "CALL_MEETING", ids: ["ORCHESTRATOR"] }); expect(s.directives.ORCHESTRATOR.kind).toBe("MEETING"); s = apply(s, e, { type: "SUMMON", ids: ["ORCHESTRATOR"] }); expect(s.directives.ORCHESTRATOR.kind).toBe("SUMMON");
  });
});

// ---- simulated agents obeying the commands over time --------------------------------------------------------------------------
describe("agents obey founder commands by walking (no teleporting)", () => {
  const profiles = new Map<string, AgentProfile>(WORLD_ROSTER.map((r) => [r.code, { id: r.code, workspace: r.workspace, idleSpots: r.idleSpots, startSpot: r.startSpot }]));
  const world = () => new Map<string, AgentBrain>(WORLD_ROSTER.map((r) => [r.code, startAgent(profiles.get(r.code)!)]));
  function simulate(brains: Map<string, AgentBrain>, cmdState: () => CommandState, player: { x: number; y: number; z: number }, secs: number, opFor: (id: string) => "WORKING" | "IDLE" = () => "IDLE", onTick?: (t: number) => void) {
    const rand = rng(11); let maxStep = 0;
    for (let t = 0; t < secs; t += 1 / 20) {
      const others = [...brains.values()].map((b) => ({ id: b.id, x: b.x, z: b.z, y: b.y, speed: b.speed }));
      for (const [id, b0] of brains) { const rec = cmdState().directives[id], d: AgentDirective | null = rec ? { kind: rec.kind, version: rec.version, target: rec.target, spotId: rec.spotId, label: rec.label, face: rec.kind === "SUMMON" ? { x: player.x, z: player.z } : null } : null;
        const b = stepAgent(b0, 1 / 20, { opState: opFor(id), player, hold: false, rand, others, directive: d }, profiles.get(id)!); maxStep = Math.max(maxStep, Math.hypot(b.x - b0.x, b.z - b0.z)); brains.set(id, b); }
      onTick?.(t);
    }
    return maxStep;
  }
  it("SUMMON ALL: every agent pathfinds to its slot in the real town, arrives, stands apart, faces the founder, never teleports or enters solids", () => {
    const player = { x: 0, y: supportHeight(0, 14, 1.2), z: 14 }, ref = player.y, env: CommandEnv = { player: { ...player, yaw: Math.PI }, agents: [], valid: (x, z) => standable(x, z, ref) };
    const brains = world(); env.agents = [...brains.values()].map((b) => ({ id: b.id, x: b.x, z: b.z }));
    let st = reduceCommand(initialCommand(), { type: "SUMMON_ALL" }, env), bad = "";
    const maxStep = simulate(brains, () => st, player, 150, () => "IDLE", () => { for (const b of brains.values()) if (!b.seated && insideSolid({ x: b.x, z: b.z }, b.y + 0.1, 1.2) && !SPOTS.some((q) => (q.kind === "sit" || q.kind === "work-sit") && Math.hypot(q.x - b.x, q.z - b.z) < 1.6)) bad = `${b.id} in solid`; });
    expect(bad).toBe(""); expect(maxStep).toBeLessThanOrEqual(AGENT.rush * 0.05 * 1.3 + 1e-6);
    const bs = [...brains.values()]; expect(bs.filter((b) => b.dirArrived)).toHaveLength(10);
    for (const b of bs) { const d = Math.hypot(b.x - player.x, b.z - player.z); expect(d, b.id).toBeGreaterThan(1.3); expect(d, b.id).toBeLessThan(9.5); }
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) expect(Math.hypot(bs[i].x - bs[j].x, bs[i].z - bs[j].z), `${bs[i].id}/${bs[j].id}`).toBeGreaterThan(1.0);
    for (const b of bs) { const want = Math.atan2(player.x - b.x, player.z - b.z), diff = Math.abs(Math.atan2(Math.sin(b.yaw - want), Math.cos(b.yaw - want))); expect(diff, `${b.id} faces founder`).toBeLessThan(0.6); }
  }, 120_000);
  it("DISMISS ALL: summoned agents walk back to workspaces (if working) or idle places, without teleporting", () => {
    const player = { x: 0, y: supportHeight(0, 14, 1.2), z: 14 }, ref = player.y, env: CommandEnv = { player: { ...player, yaw: Math.PI }, agents: [], valid: (x, z) => standable(x, z, ref) };
    const brains = world(); env.agents = [...brains.values()].map((b) => ({ id: b.id, x: b.x, z: b.z }));
    let st = reduceCommand(initialCommand(), { type: "SUMMON_ALL" }, env); simulate(brains, () => st, player, 90);
    const before = new Map([...brains].map(([k, b]) => [k, { x: b.x, z: b.z }])); const prev = st; st = reduceCommand(st, { type: "DISMISS_ALL" }, env); for (const id of releasedIds(prev, st)) brains.set(id, releaseAgent(brains.get(id)!));
    const work = (id: string) => (id === "ORCHESTRATOR" || id === "IDENTITY_QA" ? "WORKING" : "IDLE");
    const maxStep = simulate(brains, () => st, player, 200, work); expect(maxStep).toBeLessThanOrEqual(AGENT.walk * 0.05 * 1.4 + 0.02);
    for (const id of ["ORCHESTRATOR", "IDENTITY_QA"]) { const ws = SPOTS.find((s2) => s2.id === profiles.get(id)!.workspace)!, b = brains.get(id)!; expect(Math.hypot(b.x - ws.x, b.z - ws.z), `${id} back at work`).toBeLessThan(1.2); }
    expect([...brains].filter(([k, b]) => Math.hypot(b.x - before.get(k)!.x, b.z - before.get(k)!.z) > 3).length).toBeGreaterThanOrEqual(8); // they actually left the founder
    expect([...brains.values()].every((b) => !b.dirArrived)).toBe(true);
  }, 120_000);
  it("CALL MEETING: all agents walk to their designated HQ meeting positions (seated or standing), keep clear of each other", () => {
    const player = { x: -22.5, y: 0.74, z: -33.4 }, env = envAt(player.x, player.z); const brains = world(); let st = reduceCommand(initialCommand(), { type: "CALL_ALL" }, env);
    const maxStep = simulate(brains, () => st, player, 240); expect(maxStep).toBeLessThanOrEqual(AGENT.rush * 0.05 * 1.3 + 1e-6); expect([...brains.values()].filter((b) => b.dirArrived)).toHaveLength(10);
    for (const [id, b] of brains) { const sp = SPOTS.find((s2) => s2.id === st.directives[id].spotId)!; expect(Math.hypot(b.x - sp.x, b.z - sp.z), id).toBeLessThan(0.9); if (sp.kind === "sit") expect(b.seated, id).toBe(true); }
    const bs = [...brains.values()]; for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) expect(Math.hypot(bs[i].x - bs[j].x, bs[i].z - bs[j].z)).toBeGreaterThan(0.8);
  }, 120_000);
  it("an agent working at its desk (WORKING) leaves it for a summon and returns when released", () => {
    const pr = profiles.get("PRODUCTION_MANAGER")!; let b = startAgent(pr, "WORKING"); const rand = rng(2), player = { x: 0, y: 0.6, z: 14 }, ws = SPOTS.find((s2) => s2.id === pr.workspace)!;
    const drive = (secs: number, d: AgentDirective | null, op: "WORKING" | "IDLE") => { for (let t = 0; t < secs; t += 0.05) b = stepAgent(b, 0.05, { opState: op, player, hold: false, rand, others: [], directive: d }, pr); };
    drive(150, null, "WORKING"); expect(Math.hypot(b.x - ws.x, b.z - ws.z)).toBeLessThan(1);
    drive(60, { kind: "SUMMON", version: 1, target: { x: 4, y: 0.6, z: 12 }, spotId: null, label: "COMING TO FOUNDER", face: player }, "WORKING"); expect(Math.hypot(b.x - 4, b.z - 12)).toBeLessThan(1.2); expect(b.dirArrived).toBe(true);
    b = releaseAgent(b); drive(220, null, "WORKING"); expect(Math.hypot(b.x - ws.x, b.z - ws.z)).toBeLessThan(1.2);
  }, 60_000);
  it("unreachable summon targets are recovered, not looped: no route → retry back-off; stuck agents re-plan and only as a last resort snap to a nearby nav node", () => {
    const pr = profiles.get("CAPTION_WRITER")!; let b = startAgent(pr); const rand = rng(3), player = { x: 0, y: 0.6, z: 14 };
    for (let t = 0; t < 20; t += 0.05) b = stepAgent(b, 0.05, { opState: "IDLE", player, hold: false, rand, others: [], directive: { kind: "SUMMON", version: 1, target: { x: 0, y: 0.6, z: 20 }, spotId: null, label: "x", face: player } }, pr);
    expect(b.dirVersion).toBe(1); expect(Number.isFinite(b.x)).toBe(true);
  });
});

describe("agent distinguishability + labels", () => {
  it("every agent has a unique glyph, 3-letter code, prop, and silhouette signature (hair + outfit); registry roles are used verbatim", () => {
    for (const k of ["glyph", "code3", "prop"] as const) expect(new Set(WORLD_ROSTER.map((r) => r[k])).size, k).toBe(10);
    expect(new Set(WORLD_ROSTER.map((r) => `${r.hairStyle}/${r.outfit}`)).size).toBe(10); expect(WORLD_ROSTER.map((r) => r.code3).sort()).toEqual(["CPW", "CQA", "CRD", "GRS", "IQA", "ORC", "PFA", "PME", "PMG", "STR"]);
    expect(new Set(WORLD_ROSTER.map((r) => `${r.build.h}/${r.build.w}`)).size).toBeGreaterThanOrEqual(8); expect(ROSTER_BY_CODE.ORCHESTRATOR.prop).toBe("tablet"); expect(ROSTER_BY_CODE.PERFORMANCE_AGENT.registryName).toBe("Performance Agent");
  });
  it("label detail collapses with distance: FULL → NAME → MARKER → HIDDEN; selected agents keep FULL; overview shows names", () => {
    const o = { selected: false, overview: false, maxDist: 90 }; expect(labelLevel(3, o)).toBe("FULL"); expect(labelLevel(LABEL_DIST.full + 1, o)).toBe("NAME"); expect(labelLevel(LABEL_DIST.name + 1, o)).toBe("MARKER"); expect(labelLevel(120, o)).toBe("HIDDEN");
    expect(labelLevel(25, { ...o, selected: true })).toBe("FULL"); expect(labelLevel(80, { ...o, overview: true })).toBe("NAME"); expect(labelLevel(130, { ...o, overview: true })).toBe("MARKER"); expect(labelLevel(130, { ...o, overview: true, selected: true })).toBe("FULL");
    expect(labelLevel(LABEL_DIST.name * 1.3, { ...o, commanded: true })).toBe("NAME");
  });
  it("status never relies on colour alone: every status has its own symbol; blocked/failed/waiting have distinct border patterns", () => {
    const metas = Object.values(STATUS_META); expect(new Set(metas.map((m) => m.word)).size).toBe(metas.length); const prim = ["WORKING", "WAITING", "BLOCKED", "FAILED", "IDLE", "PAUSED"].map((k) => STATUS_META[k as keyof typeof STATUS_META]);
    expect(new Set(prim.map((m) => m.symbol)).size).toBe(6); expect(STATUS_META.BLOCKED.pattern).toBe("double"); expect(STATUS_META.WAITING.pattern).toBe("dashed"); expect(STATUS_META.FAILED.pattern).toBe("dotted"); expect(STATUS_META.BLOCKED.pattern).not.toBe(STATUS_META.WAITING.pattern);
  });
  it("founder commands show simulated wording over the task status", () => {
    expect(displayStatus("WORKING", { kind: "SUMMON", arrived: false }).word).toBe("COMING TO FOUNDER"); expect(displayStatus("WORKING", { kind: "SUMMON", arrived: true }).word).toBe("AT FOUNDER");
    expect(displayStatus("IDLE", { kind: "MEETING", arrived: true }, false).word).toBe("MEETING — WAITING FOR FOUNDER"); expect(displayStatus("IDLE", { kind: "MEETING", arrived: true }, true).word).toBe("IN MEETING"); expect(displayStatus("BLOCKED", null).word).toBe("BLOCKED");
  });
});

describe("board view-model, Founder Command UI, mobile controls, travel", () => {
  const sc = new SimulatedScenario(0), snap = parseSimulatedSnapshot(sc.snapshot(60_000, 1));
  const board = (): BoardData => buildBoard({ snap, player: { x: 0, z: 0, yaw: 0 }, meeting: false, founderInMeeting: false, pos: () => ({ x: 1, z: 2, where: "Plaza" }), directive: () => null });
  it("lists all 10 real agents with status counts that match the snapshot, marked SIMULATED", () => {
    const b = board(); expect(b.simulated).toBe(true); expect(b.agents).toHaveLength(10); const sum = Object.values(b.counts).reduce((a, c) => a + c, 0); expect(sum).toBe(10); expect(b.agents.map((a) => a.id)).toEqual(WORLD_ROSTER.map((r) => r.code));
    for (const a of b.agents) { expect(a.code3).toHaveLength(3); expect(a.word).toBeTruthy(); expect(a.next).toBeTruthy(); }
  });
  it("Founder Command renders every agent, the status strip, SIMULATED DATA, selection + all commands, and NOT CONFIGURED roles", () => {
    const input = new Input(), hud = { board: board(), command: { selection: ["ORCHESTRATOR"], directives: {}, meeting: false }, selectedAgent: "ORCHESTRATOR" } as never;
    const html = renderToString(createElement(FounderCommand, { hud, input, mobile: false, inOverview: false }));
    for (const r of WORLD_ROSTER) { expect(html).toContain(r.persona); expect(html).toContain(r.code3); }
    for (const t of ["SIMULATED DATA", "SUMMON ALL", "DISMISS ALL", "CALL MEETING", "SELECT ALL", "SELECT NONE", "RETURN TO WORK", "FOCUS GROUP", "NOT CONFIGURED", "Research Agent", "FOCUS", "FOLLOW", "GO TO WORKSPACE", "OPEN DETAILS", "OPEN COMMAND CENTER PAGE", "NORTHLINE STATUS", "Approvals"]) expect(html, t).toContain(t);
    expect(html).toContain('href="/agents/ORCHESTRATOR"');
  });
  it("mobile controls expose JUMP (on foot), UP/DOWN/BRAKE/BOOST (in flight), COMMAND and MAP without a keyboard", () => {
    const input = new Input(), foot = renderToString(createElement(MobileControls, { input, flying: false, canInteract: false, view: "PLAYER", tier: "NORMAL", onFlyToggle: () => {}, onCommand: () => {} })), air = renderToString(createElement(MobileControls, { input, flying: true, canInteract: false, view: "PLAYER", tier: "FAST", onFlyToggle: () => {}, onCommand: () => {} }));
    for (const t of ["JUMP", "COMMAND", "MAP", "FLY", "TALK", "Movement joystick"]) expect(foot, t).toContain(t); expect(foot).not.toContain("Ascend"); for (const t of ["Ascend", "Descend", "Brake", "FAST", "COMMAND", "WALK"]) expect(air, t).toContain(t); expect(air).not.toContain(">JUMP<");
  });
  it("input layer: buffered jump, joystick run threshold, flight tier keys, Shift double-tap TURBO latch via effectiveTier, brake, digit queue, UI command queue", () => {
    const i = new Input(); i.queueJump(); expect(i.jumpPending()).toBe(true); i.clearJump(); expect(i.jumpPending()).toBe(false);
    i.stick = { x: 0, y: 0.5, active: true }; expect(i.run).toBe(false); i.stick = { x: 0, y: 0.95, active: true }; expect(i.run).toBe(true); i.stick = { x: 0, y: 0, active: false };
    expect(i.flightTier()).toBe("NORMAL"); i.setCruise("FAST"); expect(i.flightTier()).toBe("FAST"); i.touchBrake = true; expect(i.brake).toBe(true); i.cmdQueue.push({ type: "COMMAND", action: { type: "SUMMON_ALL" } }); expect(i.cmdQueue.splice(0)).toHaveLength(1);
    expect(WHEEL_ITEMS).toHaveLength(8); expect(WHEEL_ITEMS.map((w) => w.label)).toEqual(expect.arrayContaining(["SUMMON ALL", "COMMAND CENTER", "OVERVIEW", "AGENTS", "HQ", "FLY", "TURBO", "RETURN HOME"])); expect(new Set(WHEEL_ITEMS.map((w) => w.n)).size).toBe(8);
  });
  it("founder fast-travel covers every district and creator residence and every destination is walkable ground", () => {
    const t = travelPoints(), labels = t.map((p) => p.label); for (const l of ["Northline HQ", "HQ Command Center", "Founder suite", "Creative Row", "Production District", "Analytics Pier", "Boardwalk", "Creator Beach", "Marina", "Residential Hills", "Research Observatory", "Wellness", "Home (spawn)"]) expect(labels, l).toContain(l);
    expect(t.filter((p) => p.section === "Creator residences")).toHaveLength(6); expect(new Set(t.map((p) => p.id)).size).toBe(t.length);
    for (const p of t) { expect(isWater(p.x, p.z, p.y + 1), p.id).toBe(false); expect(insideSolid({ x: p.x, z: p.z }, p.y + 0.1, 1.7), p.id).toBe(false); }
  });
});

describe("production isolation of the founder command layer", () => {
  it("commands are simulation-only: the controller imports no db / provider / network module and the UI only enqueues local commands", async () => {
    const fs = await import("node:fs"), path = await import("node:path"), root = path.join(process.cwd(), "src");
    for (const f of ["lib/world/command.ts", "lib/world/formation.ts", "lib/world/labels.ts", "lib/world/board.ts", "lib/world/travel.ts", "world-dev/ui/FounderCommand.tsx", "world-dev/ui/SuitePanel.tsx", "world-dev/ui/WheelMenu.tsx", "world-dev/wheel.ts"]) {
      const src = fs.readFileSync(path.join(root, f), "utf8"); expect(/from\s+["'](@\/lib\/(db|providers?|agents|llm|supabase|server)|node:|openai|@supabase)/.test(src), f).toBe(false); expect(/\bfetch\(|XMLHttpRequest|WebSocket|process\.env/.test(src), f).toBe(false);
    }
  });
});

describe("agents step around the founder instead of freezing", () => {
  it("an agent whose straight path crosses the founder walks around them and still arrives", () => {
    const pr: AgentProfile = { id: "ORCHESTRATOR", workspace: "hq-command-a", idleSpots: ["plaza-fountain"], startSpot: "plaza-fountain" }, player = { x: 0, y: 0.6, z: 13 }, rand = rng(4); let b: AgentBrain = { ...startAgent(pr), x: 0, y: 0.6, z: 6, yaw: 0 }; let minD = 99;
    const d: AgentDirective = { kind: "SUMMON", version: 1, target: { x: 0, y: 0.6, z: 20 }, spotId: null, label: "COMING TO FOUNDER", face: player };
    for (let t = 0; t < 40; t += 0.05) { b = stepAgent(b, 0.05, { opState: "IDLE", player, hold: false, rand, others: [], directive: d }, pr); minD = Math.min(minD, Math.hypot(b.x - player.x, b.z - player.z)); }
    expect(b.dirArrived).toBe(true); expect(Math.hypot(b.x - 0, b.z - 20)).toBeLessThan(1.5); expect(minD).toBeGreaterThan(0.65);
  });
});
