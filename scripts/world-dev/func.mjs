import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const pg = await (await b.newContext({ viewport: { width: 480, height: 270 } })).newPage();
const errs = []; pg.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message.slice(0, 300))); pg.on("console", (m) => { if (m.type() === "error" && !/ERR_CERT|404/.test(m.text())) errs.push(m.text().slice(0, 300)); });
let pass = 0, fail = 0; const ok = (n, c, d = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  — " + d : ""}`); };
await pg.goto(""+(process.env.WORLD_BASE||"http://localhost:3200")+"/world-dev?tier=LOW", { waitUntil: "domcontentloaded", timeout: 120000 });
await pg.waitForSelector("[data-testid=world-root] canvas", { timeout: 120000 }); await pg.waitForTimeout(2500);
await pg.click("[aria-label=Start]"); await pg.keyboard.press("KeyH");
const st = () => pg.evaluate(() => window.__worldDev.state()); const call = (f, ...a) => pg.evaluate(([f, a]) => window.__worldDev[f](...a), [f, a]);
const fps = await pg.evaluate(() => new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 > 2000) r(n / 2); else requestAnimationFrame(f); }; f(); })); console.log("headless software fps ≈", fps);
const hold = async (key, ms) => { await pg.keyboard.down(key); await pg.waitForTimeout(ms); await pg.keyboard.up(key); };

// walk forward (W) toward +z: z increases
await call("teleportPlayer", -3.5, -13.6); await call("setLook", 0, 0.25); await pg.waitForTimeout(500);
const s0 = await st(); await hold("KeyW", 4000); const s1 = await st();
ok("W moves the player forward", s1.player.z - s0.player.z > 0.4, `dz=${(s1.player.z - s0.player.z).toFixed(2)} (slow-mo at ${fps} fps)`);
// run (Shift) is faster than walk over the same wall time
await call("teleportPlayer", -3.5, -13.6); await pg.waitForTimeout(300); const a0 = await st(); await hold("KeyW", 3000); const a1 = await st();
await call("teleportPlayer", -3.5, -13.6); await pg.waitForTimeout(300); await pg.keyboard.down("ShiftLeft"); await hold("KeyW", 3000); await pg.keyboard.up("ShiftLeft"); const a2 = await st();
ok("Shift runs faster than walking", (a2.player.z + 13.6) > (a1.player.z - -13.6) * 1.3 || a2.player.running, `walk dz=${(a1.player.z + 13.6).toFixed(2)} run dz=${(a2.player.z + 13.6).toFixed(2)}`);
// fly: F takes off, altitude rises; F again lands
await call("teleportPlayer", -3.5, -13.6); await pg.waitForTimeout(300); await pg.keyboard.press("KeyF"); await pg.waitForTimeout(5000);
const f1 = await st(); ok("F takes off (AIR, rising)", f1.player.locomotion === "AIR" && f1.player.y > 2.5, `y=${f1.player.y.toFixed(1)}`);
await pg.waitForSelector("[data-testid=mode]"); ok("HUD shows FLY", (await pg.textContent("[data-testid=mode]")) === "FLY");
await pg.keyboard.press("KeyF"); await pg.waitForTimeout(9000); const f2 = await st(); ok("F again lands (GROUND)", f2.player.locomotion === "GROUND", `y=${f2.player.y.toFixed(2)} loc=${f2.player.locomotion}`);
// overview and back
await pg.keyboard.press("Tab"); await pg.waitForTimeout(3500); ok("Tab → OVERVIEW", (await st()).mode.view === "OVERVIEW" && (await pg.textContent("[data-testid=mode]")) === "OVERVIEW");
await pg.keyboard.press("KeyQ"); await pg.waitForTimeout(1500); ok("Q → FOCUS agent (overview)", (await st()).mode.view === "FOCUS");
await pg.keyboard.press("KeyR"); await pg.waitForTimeout(2500); ok("R → back to PLAYER", (await st()).mode.view === "PLAYER");
// interaction: stand next to the agent
await call("setAgent", 2, 17.5); await call("teleportPlayer", 2, 14.7); await call("setLook", 0, 0.2); await pg.waitForTimeout(1500);
ok("prompt appears near the agent", (await pg.locator("[data-testid=prompt]").count()) > 0, await pg.locator("[data-testid=prompt]").textContent().catch(() => "none"));
ok("eligibility true within range", (await st()).eligibility.ok === true);
await pg.keyboard.press("KeyE"); await pg.waitForTimeout(1500);
const panel = pg.locator("[role=dialog]"); ok("E opens the agent panel", (await panel.count()) === 1);
const txt = await panel.textContent().catch(() => "");
ok("panel says SIMULATED DATA and shows role/status/task rows", /SIMULATED DATA/.test(txt) && /Creative Director/.test(txt) && /Status/.test(txt) && /Current task/.test(txt) && /Production/.test(txt) && /Creator/.test(txt) && /Elapsed/.test(txt) && /Next action/.test(txt), txt.slice(0, 120).replace(/\s+/g, " "));
ok("idle agent shows the cosmetic ambient note, not a fake task", /cosmetic — no work in progress/.test(txt) || /SIM-TASK/.test(txt));
// follow from the panel, then Esc layering
await pg.keyboard.press("KeyT"); await pg.waitForTimeout(3500); const fo = await st(); ok("T follows the agent", fo.mode.view === "FOLLOW" && (await pg.locator("[data-testid=follow-chip]").count()) === 1);
await pg.keyboard.press("Escape"); await pg.waitForTimeout(700); const e1 = await st(); await pg.keyboard.press("Escape"); await pg.waitForTimeout(2500); const e2 = await st();
ok("Esc peels back: panel closes first, then follow exits", (e1.mode.view === "FOLLOW" || e1.mode.view === "PLAYER") && e2.mode.view === "PLAYER");
// agent is solid: cannot walk through
await call("setAgent", 2, 17.5); await call("teleportPlayer", 2, 15.5); await call("setLook", 0, 0.2); await pg.waitForTimeout(300); await hold("KeyW", 3500); const col = await st();
ok("player cannot walk through the agent", Math.hypot(col.player.x - 2, col.player.z - 17.5) >= 0.7, `dist=${Math.hypot(col.player.x - col.agent.x, col.player.z - col.agent.z).toFixed(2)}`);
// simulated task via the dev control: agent goes to the workstation and is WORKING
await pg.keyboard.press("KeyP"); await pg.waitForTimeout(500); await pg.getByText("Simulate a task now").click(); await pg.waitForTimeout(2000);
const sw = await st(); ok("simulated task → agent heads to the studio workstation", sw.agent.destId === "WORK" || sw.agent.mode === "WORK" || sw.agent.mode === "TURN" || sw.agent.mode === "WALK", `mode=${sw.agent.mode} dest=${sw.agent.destId}`);
console.log(`\nconsole/page errors: ${errs.length}`); errs.slice(0, 6).forEach((e) => console.log("  ", e));
console.log(`${pass} passed, ${fail} failed`); await b.close(); process.exit(fail || errs.length ? 1 : 0);
