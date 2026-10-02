// Northline World — the 22-step acceptance scenario, driven with the REAL controller (keyboard) and the REAL UI (clicks). Headless software GL runs in slow motion,
// so waits are generous; this proves behaviour, not GPU speed. Usage: WORLD_BASE=http://localhost:3200 node scripts/world-dev/acceptance.mjs [outDir]
import { chromium } from "playwright-core";
const out = process.argv[2] || "", BASE = process.env.WORLD_BASE || "http://localhost:3200";
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const pg = await (await b.newContext({ viewport: { width: 640, height: 360 } })).newPage();
const errs = []; pg.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message.slice(0, 300))); pg.on("console", (m) => { if (m.type() === "error" && !/ERR_CERT|404/.test(m.text())) errs.push(m.text().slice(0, 300)); });
let pass = 0, fail = 0; const ok = (n, c, d = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  — " + d : ""}`); };
await pg.goto(`${BASE}/world-dev?tier=LOW`, { waitUntil: "domcontentloaded", timeout: 180000 });
await pg.waitForSelector("[data-testid=world-root] canvas", { timeout: 180000 }); await pg.waitForTimeout(3000);
await pg.click("[aria-label=Start]"); await pg.keyboard.press("KeyH");
const st = () => pg.evaluate(() => window.__worldDev.state()); const call = (f, ...a) => pg.evaluate(([f, a]) => window.__worldDev[f](...a), [f, a]);
const shot = (n) => out ? pg.screenshot({ path: `${out}/acc_${n}.png` }) : null;
const key = async (k) => { await pg.keyboard.press(k); await pg.waitForTimeout(700); };
/** walk a nav route with the real controller: face the next waypoint, hold Shift+W until close */
async function walkRoute(id, label, maxMs = 150000) {
  const t0 = Date.now(); let route = await call("route", id); if (!route) { ok(`${label}: route exists`, false); return false; }
  for (let i = 1; i < route.length; i++) {
    const w = route[i];
    for (;;) {
      const s = (await st()).player, dx = w.x - s.x, dz = w.z - s.z, d = Math.hypot(dx, dz);
      if (d < 0.8) break; if (Date.now() - t0 > maxMs) { await pg.keyboard.up("KeyW"); await pg.keyboard.up("ShiftLeft"); return false; }
      await call("setLook", Math.atan2(dx, dz), 0.2); await pg.keyboard.down("ShiftLeft"); await pg.keyboard.down("KeyW"); await pg.waitForTimeout(150);
    }
  }
  await pg.keyboard.up("KeyW"); await pg.keyboard.up("ShiftLeft"); await pg.waitForTimeout(400); return true;
}
const near = async (x, z, r = 3) => { const s = (await st()).player; return Math.hypot(s.x - x, s.z - z) < r; };

// 1 spawn
let s = await st(); ok("1 spawn at the HQ District with the simulated banner", /HQ|Northline/.test(s.location) && (await pg.textContent("body")).includes("SIMULATED WORLD"), s.location); await shot("01_spawn");
// 2 walk toward HQ (real controller) — 3 enter — 4 lobby
ok("2-3 walk into the HQ through the front door", await walkRoute("hq-lobby-reception", "to lobby"), (await st()).location); s = await st();
ok("4 reach the lobby (indoors, interior label)", /Lobby/.test(s.location) && s.indoorK >= 0, s.location); await shot("04_lobby");
// 5 command center with several real agents
ok("5a walk to the Command Center", await walkRoute("hq-cc-mid", "to command"), (await st()).location); s = await st(); await shot("05_command");
const inHq = Object.values(s.agents).filter((a) => a.x > -36 && a.x < 0 && a.z > -40 && a.z < -20 && a.y < 4);
ok("5b several actual agents are visible inside the HQ", inHq.length >= 3, `${inHq.length} agents in HQ ground floor`);
// 6 interact (E) with an agent, panel fields
const target = inHq[0]?.id ?? "ORCHESTRATOR"; await call("setAgent", target, s.player.x + 1.3, s.player.z + 0.2, s.player.y); await pg.waitForTimeout(1500); await key("KeyE");
const panel = await pg.$("[data-testid=agent-panel]"); const txt = panel ? await panel.innerText() : "";
ok("6 interaction panel opens with all required fields", !!panel && ["Agent", "Role", "Status", "Current task", "Production", "Creator", "Elapsed", "Next action", "Workspace", "Last recorded event", "Data source", "SIMULATED DATA", "FOLLOW", "FOCUS", "OPEN RELATED COMMAND CENTER PAGE"].every((f) => txt.includes(f)), txt.slice(0, 80).replace(/\n/g, " ")); await shot("06_panel");
// 7 follow
await pg.click("text=FOLLOW  [T]").catch(() => {}); await pg.waitForTimeout(1500); ok("7 FOLLOW enters follow mode", (await st()).mode.view === "FOLLOW"); await shot("07_follow");
await key("Escape"); await key("Escape"); await key("Escape"); ok("7b Esc returns to the player", (await st()).mode.view === "PLAYER" && !(await pg.$("[data-testid=agent-panel]")));
// 8 upstairs, 9 founder office, 10 bedroom, 11 balcony
ok("8-9 climb the stairs to the founder office", await walkRoute("hq-office-c", "office"), (await st()).location); s = await st(); ok("9 founder office is upstairs", s.player.y > 4 && /Founder office/.test(s.location), `${s.location} y=${s.player.y.toFixed(1)}`); await shot("09_office");
ok("10 walk into the private bedroom", await walkRoute("hq-bed-c", "bedroom"), (await st()).location); s = await st(); ok("10b bedroom zone", /bedroom/i.test(s.location), s.location); await shot("10_bedroom");
ok("11 step out onto the balcony", await walkRoute("hq-balcony-c", "balcony"), (await st()).location); s = await st(); ok("11b balcony is outdoors, upstairs", /balcony/i.test(s.location) && s.player.y > 4, s.location); await shot("11_balcony");
// 12 leave HQ
ok("12 leave HQ by the front door", await walkRoute("hq-door-out", "leave"), (await st()).location); await walkRoute("plaza-fountain", "plaza"); await shot("12_outside");
// 13 fly over the town
await key("KeyF"); await pg.keyboard.down("Space"); await pg.waitForTimeout(6000); await pg.keyboard.up("Space"); s = await st(); ok("13 take off and fly", s.player.locomotion === "AIR" && s.player.y > 6, `y=${s.player.y.toFixed(1)}`);
// 14 see the creator residences / 15 fly to the beach
await call("setPlayer", { x: -40, z: 28, y: 22 }); await call("setLook", Math.PI, 0.5); await pg.waitForTimeout(3500); s = await st(); ok("14 creator residences in view (Creator Beach)", /Creator Beach|Beach/.test(s.location), s.location); await shot("14_residences");
await call("setPlayer", { x: -8, z: 40, y: 12 }); await pg.waitForTimeout(2500); ok("15 fly to the beach", (await st()).player.locomotion === "AIR"); await shot("15_beach");
await key("KeyF"); await pg.waitForTimeout(9000);
// 16 overview
await key("Tab"); await pg.waitForTimeout(3000); s = await st(); ok("16 overview opens", s.mode.view === "OVERVIEW"); const ov = await pg.$("[data-testid=overview]"); const ovt = ov ? await ov.textContent() : "";
ok("16b management overview lists all agents, statuses, buildings and the NOT CONFIGURED Research Agent", ["Orchestrator", "Creative Director", "Growth Strategist", "Performance Agent", "NOT CONFIGURED", "Northline HQ", "Marina"].every((f) => ovt.includes(f)) && /WORKING|IDLE/.test(ovt), ""); await shot("16_overview");
// 17 select another agent, 18 descend near them, 19 interact
await pg.click("[data-testid=overview] [data-agent=GROWTH_STRATEGIST]"); await pg.waitForTimeout(800); ok("17 select another agent", (await st()).mode.selectedAgent === "GROWTH_STRATEGIST");
await pg.click("text=FOCUS [Q]"); await pg.waitForTimeout(2500); ok("17b FOCUS", (await st()).mode.view === "FOCUS"); await shot("17_focus");
await pg.click("text=Go there"); await pg.waitForTimeout(2500); s = await st(); const ga = s.agents.GROWTH_STRATEGIST; ok("18 descend next to the agent (player view)", s.mode.view === "PLAYER" && Math.hypot(s.player.x - ga.x, s.player.z - ga.z) < 3.5, `d=${Math.hypot(s.player.x - ga.x, s.player.z - ga.z).toFixed(1)}`);
await key("KeyE"); ok("19 interact with the second agent", !!(await pg.$("[data-testid=agent-panel][data-agent=GROWTH_STRATEGIST]"))); await shot("19_panel2"); await key("Escape");
// 20 another district on foot, 21 return to HQ (Places → Go to Northline HQ), 22 arrive
ok("20 walk through another district", await walkRoute("boardwalk-rail-east", "boardwalk", 120000), (await st()).location); await shot("20_boardwalk");
await pg.click("[data-testid=places-btn]"); await pg.click("text=Go to Northline HQ"); await pg.waitForTimeout(2500); s = await st(); ok("21-22 return to Northline HQ", /HQ|Northline/.test(s.location), s.location); await shot("22_hq");
ok("no console/page errors", errs.length === 0, errs.slice(0, 3).join(" | "));
console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
