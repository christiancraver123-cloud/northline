// Founder Command + movement acceptance (21 steps) with the REAL keyboard and UI. Headless software GL is slow-motion, so waits are generous and agent simulation
// is fast-forwarded with the dev hook setSimScale (agents only; the player always runs in real frames). Proves behaviour, not GPU speed.
// Usage: WORLD_BASE=http://localhost:3200 node scripts/world-dev/founder-acceptance.mjs [outDir]
import { chromium } from "playwright-core";
const out = process.argv[2] || "", BASE = process.env.WORLD_BASE || "http://localhost:3200";
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const pg = await (await b.newContext({ viewport: { width: 800, height: 450 } })).newPage();
const errs = []; pg.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message.slice(0, 300))); pg.on("console", (m) => { if (m.type() === "error" && !/ERR_CERT|404|Router action/.test(m.text())) errs.push(m.text().slice(0, 300)); });
let pass = 0, fail = 0; const ok = (n, c, d = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  — " + d : ""}`); };
await pg.goto(`${BASE}/world-dev?tier=LOW`, { waitUntil: "domcontentloaded", timeout: 180000 });
await pg.waitForSelector("[data-testid=world-root] canvas", { timeout: 180000 }); await pg.waitForTimeout(3000);
await pg.click("[aria-label=Start]"); await pg.keyboard.press("KeyH");
const st = () => pg.evaluate(() => window.__worldDev.state()), call = (f, ...a) => pg.evaluate(([f, a]) => window.__worldDev[f](...a), [f, a]), cmdState = () => call("command");
const shot = (n) => out ? pg.screenshot({ path: `${out}/fc_${n}.png` }) : null, key = async (k, ms = 600) => { await pg.keyboard.press(k); await pg.waitForTimeout(ms); };
const until = async (fn, ms = 60000, step = 500) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await pg.waitForTimeout(step); } return false; };
const setCmd = async (open) => { if ((await st()).mode.commandOpen !== open) { await key("KeyC", 900); } };
await call("setSimScale", 10);

// 1 walk · 2 run · 3 jump
await call("teleportPlayer", 0, 13); await call("setLook", Math.PI / 2, 0.2); await pg.waitForTimeout(800); let s0 = await st();
await pg.keyboard.down("KeyW"); await pg.waitForTimeout(3500); let s1 = await st(); const walkV = s1.player.speed; await pg.keyboard.up("KeyW");
ok("1 walk (W)", s1.player.x - s0.player.x > 1 && walkV > 2.5 && walkV < 4.2 && (await pg.textContent("[data-testid=mode]")) !== "FLY", `v=${walkV.toFixed(1)} m/s`);
await pg.waitForTimeout(1500); await call("teleportPlayer", 0, 13); await call("setLook", Math.PI / 2, 0.2); await pg.waitForTimeout(500);
await pg.keyboard.down("ShiftLeft"); await pg.keyboard.down("KeyW"); await pg.waitForTimeout(4500); const sr = await st(); await pg.keyboard.up("KeyW"); await pg.keyboard.up("ShiftLeft");
ok("2 run / sprint (Shift+W) is much faster than walking", sr.player.speed > walkV * 1.9 && sr.player.running, `v=${sr.player.speed.toFixed(1)} m/s vs walk ${walkV.toFixed(1)}`);
await pg.waitForTimeout(2000); await call("teleportPlayer", 0, 13); await pg.waitForTimeout(600); const y0 = (await st()).player.y; let peak = y0; await pg.keyboard.down("Space"); for (let i = 0; i < 14; i++) { await pg.waitForTimeout(120); peak = Math.max(peak, (await st()).player.y); } await pg.keyboard.up("Space");
ok("3 jump (Space) leaves the ground and lands again", peak - y0 > 0.5 && await until(async () => (await st()).player.grounded, 8000), `rose ${(peak - y0).toFixed(2)} m`);
// 4 flight · 5 fast · 6 turbo · 7 brake · 8 land
await call("setLook", Math.PI / 2, 0.15); await key("KeyF", 4500); let fs = await st(); ok("4 enter flight (F)", fs.player.locomotion === "AIR" && fs.player.y > 3, `y=${fs.player.y.toFixed(1)}`);
await pg.keyboard.down("KeyW"); await pg.waitForTimeout(3500); const nSpeed = (await st()).player.speed;
await pg.keyboard.down("ShiftLeft"); await pg.waitForTimeout(4500); const fast = await st(); const fastTier = await pg.textContent("[data-testid=flight-tier]").catch(() => "");
ok("5 fast flight (hold Shift)", fast.player.speed > nSpeed * 1.5 && fast.player.speed > 28 && /FAST/.test(fastTier), `${nSpeed.toFixed(0)} → ${fast.player.speed.toFixed(0)} m/s, HUD ${fastTier}`);
await pg.keyboard.up("ShiftLeft"); await pg.waitForTimeout(150); await pg.keyboard.down("ShiftLeft"); await pg.keyboard.up("ShiftLeft"); await pg.waitForTimeout(60); await pg.keyboard.down("ShiftLeft"); await pg.waitForTimeout(7000); const turbo = await st(), tTier = await pg.textContent("[data-testid=flight-tier]").catch(() => ""); const lines = await pg.$("[data-testid=speed-lines]");
ok("6 turbo flight (double-tap Shift and hold)", turbo.player.speed > 65 && /TURBO/.test(tTier) && turbo.fov > 66, `${turbo.player.speed.toFixed(0)} m/s, FOV ${turbo.fov.toFixed(0)}, HUD ${tTier}, streaks ${!!lines}`); await shot("turbo");
ok("6b flight HUD shows speed + altitude", /m\/s/.test(await pg.textContent("[data-testid=flight-speed]")) && /m/.test(await pg.textContent("[data-testid=flight-alt]")));
await pg.keyboard.up("ShiftLeft"); await pg.keyboard.up("KeyW"); const before = (await st()).player.speed; await pg.keyboard.down("KeyB"); await pg.waitForTimeout(2500); const after = (await st()).player.speed; await pg.keyboard.up("KeyB");
ok("7 brake (B) sheds speed", after < before * 0.4, `${before.toFixed(0)} → ${after.toFixed(0)} m/s`);
await call("teleportPlayer", 0, 13); await call("setPlayer", { locomotion: "AIR", y: 30, grounded: false }); await pg.waitForTimeout(500); await key("KeyF", 500); const landed = await until(async () => (await st()).player.locomotion === "GROUND", 40000);
ok("8 land (F) safely", landed && (await st()).player.speed < 8, `speed ${(await st()).player.speed.toFixed(1)}`);

// 9 Founder Command · 10 all 10 agents
await call("teleportPlayer", -14, -7.2); await call("setLook", Math.PI, 0.25); await pg.waitForTimeout(800); await key("KeyC", 900);
ok("9 open Founder Command (C) anywhere", !!(await pg.$("[data-testid=founder-command]")) && (await st()).mode.commandOpen); await shot("command");
const rows = await pg.$$("[data-testid=founder-command] li [data-agent]"); ok("10 all 10 registered agents are listed, with SIMULATED DATA and NOT CONFIGURED", rows.length === 10 && (await pg.textContent("[data-testid=founder-command]")).includes("SIMULATED DATA") && (await pg.textContent("[data-testid=founder-command]")).includes("NOT CONFIGURED"), `${rows.length} rows`);
// 11 summon one
await pg.click("[data-testid=founder-command] [data-agent=CAPTION_WRITER] button[aria-pressed]"); await pg.waitForTimeout(500); await pg.click("[data-testid=founder-command] [data-testid=fc-agent-actions] >> text=SUMMON"); await pg.waitForTimeout(800);
let c = await cmdState(); ok("11a summon one agent: directive issued, label COMING TO FOUNDER", c.directives.CAPTION_WRITER?.kind === "SUMMON" && Object.keys(c.directives).length === 1);
ok("11b it walks to the founder and arrives (no teleport)", await until(async () => (await cmdState()).agentStates.CAPTION_WRITER.arrived, 90000, 1000)); await shot("summon_one");
// 12 summon all · 13 formation
await pg.click("[data-testid=fc-summon-all]"); await pg.waitForTimeout(800); c = await cmdState(); ok("12 summon all: 10 directives", Object.keys(c.directives).length === 10);
const formed = await until(async () => Object.values((await cmdState()).agentStates).filter((a) => a.arrived).length === 10, 120000, 1500); c = await cmdState(); const pp = (await st()).player; const ds = Object.values(c.agentStates).map((a) => Math.hypot(a.x - pp.x, a.z - pp.z));
ok("13 all 10 reach a spaced formation around the founder", formed && Math.min(...ds) > 1.3 && Math.max(...ds) < 10, `distances ${Math.min(...ds).toFixed(1)}–${Math.max(...ds).toFixed(1)} m`); await setCmd(false); await shot("formation"); await setCmd(true);
// 14 multi-select · 15 send back
await pg.click("[data-testid=fc-select-none]"); for (const id of ["ORCHESTRATOR", "IDENTITY_QA", "GROWTH_STRATEGIST"]) await pg.click(`[data-testid=founder-command] [data-agent=${id}] input[type=checkbox]`); await pg.waitForTimeout(500);
ok("14 multi-select several agents", (await cmdState()).selection.length === 3, (await cmdState()).selection.join(","));
await pg.click("[data-testid=fc-return]"); await pg.waitForTimeout(800); c = await cmdState(); ok("15a send the selected agents back to work (released)", Object.keys(c.directives).length === 7 && !c.directives.ORCHESTRATOR);
await pg.click("[data-testid=fc-dismiss-all]"); await pg.waitForTimeout(800); ok("15b dismiss all", Object.keys((await cmdState()).directives).length === 0);
const departed = await until(async () => { const ag = Object.values((await cmdState()).agentStates); return ag.filter((a) => Math.hypot(a.x - pp.x, a.z - pp.z) > 12).length >= 3; }, 60000, 1500); ok("15c they walk away naturally", departed);
// 16 meeting · 17 HQ
await pg.click("[data-testid=fc-call-all]"); await pg.waitForTimeout(800); c = await cmdState(); ok("16 call meeting (all): 10 meeting directives, meeting flag set", c.meeting && Object.values(c.directives).every((d) => d.kind === "MEETING"));
const met = await until(async () => Object.values((await cmdState()).agentStates).filter((a) => a.arrived).length === 10, 240000, 2000); c = await cmdState(); const inRoom = Object.values(c.agentStates).filter((a) => a.x > -26.5 && a.x < -19 && a.z < -32 && a.z > -40.5).length;
ok("17 agents travel to the HQ meeting room and take their designated places", met && inRoom === 10, `${inRoom}/10 in the meeting room`);
await setCmd(false); await call("teleportPlayer", -22.5, -33.2, 0.74); await call("setLook", Math.PI, 0.3); await pg.waitForTimeout(2500); await shot("meeting"); await setCmd(true); await pg.click("[data-testid=fc-dismiss-all]"); await pg.waitForTimeout(500); await setCmd(false);
// 18 focus remote · 19 follow remote
await call("teleportPlayer", 60, 14); await setCmd(true); await pg.click("[data-testid=founder-command] [data-agent=PERFORMANCE_AGENT] button[aria-pressed]"); await pg.waitForTimeout(500); await pg.click("[data-testid=fc-agent-actions] >> text=FOCUS"); await pg.waitForTimeout(3500);
s0 = await st(); ok("18 focus an agent remotely (no proximity)", s0.mode.view === "FOCUS" && s0.mode.selectedAgent === "PERFORMANCE_AGENT"); await shot("focus");
await key("KeyR", 1500); await pg.click("[data-testid=fc-agent-actions] >> text=FOLLOW"); await pg.waitForTimeout(3000); ok("19 follow an agent remotely", (await st()).mode.view === "FOLLOW"); await shot("follow"); await key("Escape", 800); await key("Escape", 800);
// 20 command-center table · 21 return
await call("teleportPlayer", -6.4, -24.2, 0.74); await call("setLook", 0.3, 0.3); await pg.waitForTimeout(1500); const prompt = (await pg.textContent("[data-testid=prompt]").catch(() => "")) ?? ""; await pg.keyboard.press("KeyE"); await pg.waitForTimeout(900);
ok("20 use the Command Center table → Founder Command opens", /command table/i.test(prompt) && (await st()).mode.commandOpen && !!(await pg.$("[data-testid=founder-command]")), prompt); await shot("table");
await key("Escape", 600); await key("KeyR", 800); ok("21 return to the player view", (await st()).mode.view === "PLAYER" && !(await st()).mode.commandOpen);
// extras: quick command wheel + founder-suite control panel
await call("teleportPlayer", -14, -7.2); await call("setLook", Math.PI, 0.25); await pg.waitForTimeout(500); await key("KeyQ", 700); ok("22 quick command wheel (Q) opens with 8 actions", !!(await pg.$("[data-testid=wheel]")) && (await pg.$$("[data-wheel]")).length === 8); await shot("wheel");
await key("Digit3", 2500); ok("22b wheel option 3 = OVERVIEW (number key)", (await st()).mode.view === "OVERVIEW" && !(await st()).mode.wheelOpen); await key("Escape", 1500);
await call("setSimScale", 10); await call("teleportPlayer", -8.6, -23.0, 5.12); await call("setLook", Math.PI, 0.3); await pg.waitForTimeout(1500); const sp = (await pg.textContent("[data-testid=prompt]").catch(() => "")) ?? ""; await pg.keyboard.press("KeyE"); await pg.waitForTimeout(900);
ok("23 founder suite: the control panel pedestal opens the Founder Control Panel", /founder control panel/i.test(sp) && (await st()).mode.suiteOpen && !!(await pg.$("[data-testid=suite-panel]")), sp); await shot("suite");
await pg.click("[data-testid=suite-call-all]"); await pg.waitForTimeout(800); ok("23b CALL ALL AGENTS from the suite summons everyone (simulated)", Object.keys((await cmdState()).directives).length === 10 && !(await st()).mode.suiteOpen);
await pg.keyboard.press("KeyG"); await pg.waitForTimeout(300); await pg.click("[data-testid=command-btn]"); await pg.click("[data-testid=fc-dismiss-all]");
ok("no console/page errors", errs.length === 0, errs.slice(0, 3).join(" | "));
console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
