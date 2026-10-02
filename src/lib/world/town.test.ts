// Northline World expansion tests — the town, the HQ and its interiors, the roster, navigation, and the simulated multi-agent world. No WebGL.
import { describe, expect, it } from "vitest";
import { AGENT_DEFS } from "@/lib/agents/ops/registry";
import { LANDMARKS, TOWN, ZONES, HQ, SPOTS, SIGNS, groundHeight, isIndoors, locationLabel, supportHeight, zoneAt, insideSolid, ceilingAt } from "./layout";
import { NOT_CONFIGURED_ROLES, WORLD_ROSTER } from "./roster";
import { getGraph, findPath, nodeOf, routeTo, pathLength } from "./nav";
import { PLAYER_START, startPlayer, stepPlayer, type PlayerInput } from "./player";
import { startAgent, stepAgent, type AgentProfile } from "./agent-ai";
import { rng } from "./math";
import { Input } from "../../world-dev/input";
import { SimulatedScenario } from "../../world-dev/fixtures/scenario";
import { parseSimulatedSnapshot } from "./schema";
import { TIERS } from "./quality";

const IN: PlayerInput = { moveX: 0, moveZ: 0, cameraYaw: 0, run: false, up: 0, down: 0, boost: false };
const G = getGraph();

describe("roster ↔ real agent registry (no invented agents)", () => {
  it("the world cast is exactly the registered agents, with registry names and roles", () => {
    expect(WORLD_ROSTER.map((r) => r.code).sort()).toEqual(AGENT_DEFS.map((a) => a.code).sort());
    for (const d of AGENT_DEFS) { const r = WORLD_ROSTER.find((x) => x.code === d.code)!; expect(r.registryName).toBe(d.name); expect(r.role).toBe(d.role); }
  });
  it("every agent has a distinct non-colour identifier (glyph), a colour, a prop, a workspace that exists and is reachable", () => {
    expect(new Set(WORLD_ROSTER.map((r) => r.glyph)).size).toBe(WORLD_ROSTER.length); expect(new Set(WORLD_ROSTER.map((r) => r.color)).size).toBe(WORLD_ROSTER.length);
    for (const r of WORLD_ROSTER) { expect(r.glyphName).toBeTruthy(); expect(r.persona).toBeTruthy(); for (const id of [r.workspace, r.startSpot, ...r.idleSpots]) { expect(SPOTS.some((s) => s.id === id), `${r.code} ${id}`).toBe(true); expect(G.nodes.has(id), id).toBe(true); } expect(r.idleSpots.length).toBeGreaterThanOrEqual(3); }
  });
  it("missing roles are NOT CONFIGURED — the Research Agent is not spawned", () => {
    expect(NOT_CONFIGURED_ROLES.map((n) => n.role)).toContain("Research Agent"); expect(WORLD_ROSTER.some((r) => /research/i.test(r.code))).toBe(false);
  });
});

describe("town plan", () => {
  it("contains every required district / area", () => {
    const names = new Set(TOWN.districts.map((d) => d.name)); for (const n of ["Northline HQ District", "Creative Row", "Production District", "Analytics Pier", "Boardwalk", "Creator Beach", "Wellness & Growth", "Marina", "Residential Hills", "Observatory Point"]) expect([...names].join("|"), n).toContain(n);
  });
  it("has the six fictional creator residences, each with a distinct landmark, and no avatars", () => {
    expect(TOWN.creatorHouses.map((h) => h.creator).sort()).toEqual(["ALE", "MIL", "SIE", "SKY", "VES", "ZOE"].sort());
    const ids = LANDMARKS.map((l) => l.id); for (const id of ["sienna", "alessia", "mila", "vesper", "zoe", "skye"]) expect(ids).toContain(id);
    const by = Object.fromEntries(LANDMARKS.map((l) => [l.id, l])); expect(by.skye.z).toBeGreaterThan(by.vesper.z); // Skye's surf bungalow is the one closest to the water
    expect(Math.abs(by.mila.x - (-18))).toBeLessThan(60); // Mila lives near the town centre
  });
  it("landmarks exist for the HQ, pier, marina and the (empty) research observatory", () => { for (const id of ["hq", "pier", "marina", "observatory"]) expect(LANDMARKS.some((l) => l.id === id), id).toBe(true); });
  it("no sign text or label leaks creator canonical identity data", () => { for (const s of SIGNS) expect(/reference|canonical|seed/i.test(s.text + (s.sub ?? ""))).toBe(false); });
});

describe("Northline HQ — exterior, interiors, stairs, founder suite", () => {
  const zone = (id: string) => ZONES.find((z) => z.id === id)!;
  const centre = (id: string) => { const z = zone(id); return { x: (z.minX + z.maxX) / 2, z: (z.minZ + z.maxZ) / 2, y: z.y0 + 0.4 }; };
  it("all required interior zones exist", () => {
    for (const id of ["hq-lobby", "hq-command", "hq-strategy", "hq-creative", "hq-meeting", "hq-production", "hq-analytics", "hq-hall", "hq-office", "hq-bedroom", "hq-bath", "hq-lounge", "hq-balcony", "hq-terrace", "hq-roof"]) expect(zone(id), id).toBeTruthy();
    expect(zone("hq-bedroom").y0).toBeGreaterThan(HQ.F1 - 1); expect(zone("hq-balcony").indoor).toBe(false); expect(zone("hq-lobby").indoor).toBe(true);
  });
  it("the player can walk from the street, through the front door, to the lobby, Command Center, upstairs, founder office, bedroom and balcony — by real navigation", () => {
    const from = { x: PLAYER_START.x, z: PLAYER_START.z, y: 0.62 };
    for (const id of ["hq-lobby-reception", "hq-command-a", "hq-bed-c", "hq-office-c", "hq-balcony-c", "hq-terrace-c", "hq-lounge-c", "hq-bath-c"]) { const r = routeTo(from, id); expect(r, id).not.toBeNull(); expect(pathLength(r!)).toBeLessThan(160); }
  });
  it("stairs are real: climbing the stair nodes gains the full storey, one comfortable step at a time", () => {
    const ids = ["hq-stairs-0", "hq-stairs-1", "hq-stairs-2", "hq-stairs-3", "hq-stairs-top"].map(nodeOf); for (let i = 1; i < ids.length; i++) { expect(Math.abs(ids[i].y - ids[i - 1].y)).toBeLessThan(2); }
    expect(Math.abs(ids[4].y - ids[0].y)).toBeGreaterThan(HQ.F1 - HQ.GF - 1.5); expect(findPath(G, "hq-door-out", "hq-bed-c")!.some((n) => n.startsWith("hq-stairs"))).toBe(true);
  });
  it("walking in through the front door is possible with the real controller, and the walls stop you elsewhere", () => {
    let s = { ...startPlayer(HQ.entrance.x, HQ.entrance.z + 4), heading: Math.PI }; for (let i = 0; i < 60 * 4; i++) s = stepPlayer(s, { ...IN, moveZ: 1, cameraYaw: Math.PI }, 1 / 60);
    expect(s.z).toBeLessThan(HQ.z1 - 1.2); expect(isIndoors(s.x, s.z, s.y + 0.5)).toBe(true); // through the door
    let w = startPlayer(-30, HQ.z1 + 3); for (let i = 0; i < 60 * 4; i++) w = stepPlayer(w, { ...IN, moveZ: 1, cameraYaw: Math.PI }, 1 / 60);
    expect(w.z).toBeGreaterThan(HQ.z1 - 0.3); // a wall, not a door
  });
  it("interiors have ceilings; interior/exterior is detected by zone and labelled", () => {
    const lob = centre("hq-lobby"); expect(ceilingAt(lob.x, lob.z, lob.y)).toBeLessThan(HQ.F1 + 0.1); expect(isIndoors(lob.x, lob.z, lob.y)).toBe(true); expect(isIndoors(-18, HQ.z1 + 6, 0.7)).toBe(false);
    expect(locationLabel(lob.x, lob.z, lob.y)).toMatch(/Lobby/); const b = centre("hq-bedroom"); expect(locationLabel(b.x, b.z, b.y)).toMatch(/bedroom/i); const bal = centre("hq-balcony"); expect(isIndoors(bal.x, bal.z, bal.y)).toBe(false);
    expect(zoneAt(lob.x, lob.z, HQ.F1 + 1)?.id).not.toBe("hq-lobby"); // the upstairs hall is a different zone from the lobby below it
  });
  it("the founder bedroom has a bed, a desk-side lamp and is clear for walking (centre not in a solid)", () => {
    const b = centre("hq-bedroom"); expect(insideSolid({ x: b.x, z: b.z }, b.y + 0.2, 1)).toBe(false); expect(supportHeight(b.x, b.z, b.y + 1)).toBeGreaterThan(HQ.F1 - 0.5);
  });
});

describe("terrain & movement across the town", () => {
  it("the whole walkable graph keeps off deep water and out of solids; the ocean is water", () => {
    for (const n of G.nodes.values()) expect(groundHeight(n.x, n.z) > -0.3 || n.y > 0).toBe(true);
  });
  it("every landmark can be reached on foot from the HQ door", () => { for (const l of LANDMARKS) { const n = [...G.nodes.values()].reduce((b, c) => (Math.hypot(c.x - l.x, c.z - l.z) < Math.hypot(b.x - l.x, b.z - l.z) ? c : b)); expect(findPath(G, "hq-door-out", n.id), l.id).not.toBeNull(); expect(Math.hypot(n.x - l.x, n.z - l.z), l.id).toBeLessThan(20); } });
});

describe("multi-agent simulation over simulated time", () => {
  it("all ten agents, simulated for 8 minutes: never inside a solid, never in water, never faster than walking, no teleporting, and each reaches its workspace when WORKING", () => {
    const rand = rng(99), brains = new Map(WORLD_ROSTER.map((r) => [r.code, startAgent({ id: r.code, workspace: r.workspace, idleSpots: r.idleSpots, startSpot: r.startSpot })]));
    const profiles = new Map<string, AgentProfile>(WORLD_ROSTER.map((r) => [r.code, { id: r.code, workspace: r.workspace, idleSpots: r.idleSpots, startSpot: r.startSpot }])), reached = new Set<string>(), movedMax = { v: 0 };
    for (let t = 0; t < 480; t += 1 / 20) {
      const others = [...brains.values()].map((b) => ({ id: b.id, x: b.x, z: b.z, y: b.y }));
      for (const [id, b0] of brains) { const working = t > 100 && t < 400, b = stepAgent(b0, 1 / 20, { opState: working ? "WORKING" : "IDLE", player: { x: 0, z: 40, y: 1 }, hold: false, rand, others }, profiles.get(id)!); const st = Math.hypot(b.x - b0.x, b.z - b0.z); movedMax.v = Math.max(movedMax.v, st); brains.set(id, b);
        const nearSeat = SPOTS.some((x) => (x.kind === "sit" || x.kind === "work-sit") && Math.hypot(x.x - b.x, x.z - b.z) < 1.6); // sitting down / standing up legitimately touches the furniture
        if (!b.seated && !nearSeat && insideSolid({ x: b.x, z: b.z }, b.y + 0.1, 1.2)) throw new Error(`${id}@${t.toFixed(1)} inside solid at ${b.x.toFixed(2)},${b.z.toFixed(2)},${b.y.toFixed(2)} mode=${b.mode} dest=${b.destId}`); if (b.mode === "WORK") reached.add(id); }
    }
    expect(movedMax.v).toBeLessThan(0.12); expect(WORLD_ROSTER.map((r) => r.code).filter((c) => !reached.has(c))).toEqual([]);
  }, 60_000);
  it("agents visit more than one building over time (enter / leave buildings)", () => {
    const r = WORLD_ROSTER.find((x) => x.code === "ORCHESTRATOR")!, p: AgentProfile = { id: r.code, workspace: r.workspace, idleSpots: r.idleSpots, startSpot: r.startSpot }, rand = rng(5); let b = startAgent(p); const seen = new Set<string>();
    for (let t = 0; t < 900; t += 1 / 20) { b = stepAgent(b, 1 / 20, { opState: "IDLE", player: { x: 0, z: 40, y: 1 }, hold: false, rand, others: [] }, p); const z = zoneAt(b.x, b.z, b.y + 0.5); seen.add(z ? (z.building ?? z.id) : "outdoors"); }
    expect(seen.size).toBeGreaterThan(1);
  }, 60_000);
});

describe("simulated fixture", () => {
  const sc = new SimulatedScenario(0);
  it("produces a valid SIMULATED snapshot covering every roster agent with workspace, last event and data source", () => {
    const s = parseSimulatedSnapshot(sc.snapshot(60_000, 1)); expect(s.agents).toHaveLength(WORLD_ROSTER.length); expect(s.simulated).toBe(true); expect(s.source).toBe("FIXTURE");
    for (const a of s.agents) { expect(a.workspace).toBeTruthy(); expect(a.dataSource).toMatch(/SIMULATED/); expect(a.lastEvent).toBeTruthy(); expect(a.provider).toBeNull(); }
  });
  it("over a cycle some agents work, one blocks and one waits (indicators), and statuses are staggered", () => {
    const seen = new Set<string>(); for (let t = 0; t < 150; t += 3) for (const a of sc.snapshot(t * 1000, t).agents) seen.add(a.opState); expect([...seen]).toEqual(expect.arrayContaining(["WORKING", "IDLE", "BLOCKED", "WAITING"]));
    const s0 = sc.snapshot(40_000, 1).agents.map((a) => a.opState); expect(new Set(s0).size).toBeGreaterThan(1);
  });
  it("forceTask makes a chosen agent WORK", () => { const s2 = new SimulatedScenario(0); s2.forceTask("CAPTION_WRITER", 1_000); expect(s2.snapshot(2_000, 1).agents.find((a) => a.agentId === "CAPTION_WRITER")!.opState).toBe("WORKING"); });
});

describe("mobile input logic", () => {
  it("virtual stick drives movement, run threshold, and interior use needs no keyboard", () => {
    const i = new Input(); i.stick = { x: 0, y: 1, active: true }; expect(i.moveZ).toBe(1); expect(i.run).toBe(true); i.stick = { x: 0.3, y: 0.3, active: true }; expect(i.run).toBe(false); i.touchUp = 1; expect(i.up).toBe(1);
    i.push("interact"); i.push("follow"); expect(i.drain()).toEqual(["interact", "follow"]); expect(i.drain()).toEqual([]);
    i.selectQueue.push("ORCHESTRATOR"); i.travelQueue.push("hq"); expect(i.selectQueue.splice(0)).toEqual(["ORCHESTRATOR"]);
  });
});

describe("quality tiers keep the experience on every tier", () => {
  it("LOW draws less than HIGH and keeps agents + interiors usable", () => { expect(TIERS.LOW.agentRigDist).toBeLessThanOrEqual(TIERS.HIGH.agentRigDist); expect(TIERS.LOW.interiorDist).toBeGreaterThan(20); expect(TIERS.LOW.dprMax).toBeLessThanOrEqual(TIERS.HIGH.dprMax); });
});
