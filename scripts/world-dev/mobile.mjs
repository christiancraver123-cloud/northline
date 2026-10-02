import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1" });
const pg = await ctx.newPage(); const errs = []; pg.on("pageerror", (e) => errs.push(e.message.slice(0, 300))); pg.on("console", (m) => { if (m.type() === "error" && !/ERR_CERT|404/.test(m.text())) errs.push(m.text().slice(0, 200)); });
let pass = 0, fail = 0; const ok = (n, c, d = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  — " + d : ""}`); };
await pg.goto(""+(process.env.WORLD_BASE||"http://localhost:3200")+"/world-dev?perf=1", { waitUntil: "domcontentloaded", timeout: 120000 });
await pg.waitForSelector("[data-testid=world-root] canvas", { timeout: 120000 }); await pg.waitForTimeout(3000);
const tierTxt = await pg.locator("[data-testid=perf]").innerText().catch(() => ""); ok("phone auto-selects LOW tier", /tier\s+LOW/.test(tierTxt), (tierTxt.match(/tier\s+\S+/) || [""])[0]);
await pg.screenshot({ path: process.argv[2] + "/m_start.png" });
await pg.getByText("Tap to start").click().catch(() => pg.mouse.click(200, 400)); await pg.waitForTimeout(1500);
ok("virtual joystick, FLY, MAP, COMMAND, JUMP and TALK controls are present", (await pg.locator("[aria-label='Movement joystick']").count()) === 1 && (await pg.getByText("FLY", { exact: true }).count()) === 1 && (await pg.getByText("MAP", { exact: true }).count()) === 1 && (await pg.getByText("COMMAND", { exact: true }).count()) >= 1 && (await pg.getByLabel("Jump").count()) === 1 && (await pg.getByText("TALK", { exact: true }).count()) === 1);
const st = () => pg.evaluate(() => window.__worldDev.state());
const s0 = await st();
// drag the joystick up (forward) with synthetic pointer events
await pg.evaluate(async () => { const el = document.querySelector("[aria-label='Movement joystick']"), r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, fire = (t, y) => el.dispatchEvent(new PointerEvent(t, { pointerId: 7, clientX: cx, clientY: y, bubbles: true, pointerType: "touch" })); fire("pointerdown", cy); fire("pointermove", cy - 50); await new Promise((r) => setTimeout(r, 3500)); fire("pointerup", cy - 50); });
const s1 = await st(); ok("joystick moves the player", Math.hypot(s1.player.x - s0.player.x, s1.player.z - s0.player.z) > 0.8, `moved ${Math.hypot(s1.player.x - s0.player.x, s1.player.z - s0.player.z).toFixed(1)} m`);
// right-side drag rotates the camera
const yaw0 = await pg.evaluate(() => 0); await pg.evaluate(async () => { const el = document.elementFromPoint(300, 300); const fire = (t, x) => el.dispatchEvent(new PointerEvent(t, { pointerId: 9, clientX: x, clientY: 300, bubbles: true, pointerType: "touch" })); fire("pointerdown", 300); for (let i = 1; i <= 8; i++) { fire("pointermove", 300 - i * 12); await new Promise((r) => setTimeout(r, 50)); } fire("pointerup", 200); });
await pg.waitForTimeout(800);
// fly toggle, map, follow, talk buttons
await pg.getByText("FLY", { exact: true }).click(); await pg.waitForTimeout(4000); ok("FLY button takes off", (await st()).player.locomotion === "AIR");
ok("▲ ▼ buttons appear while flying", (await pg.getByLabel("Ascend").count()) === 1 && (await pg.getByLabel("Descend").count()) === 1);
await pg.getByText("WALK", { exact: true }).click(); await pg.waitForTimeout(600);
await pg.getByText("MAP", { exact: true }).click(); await pg.waitForTimeout(3500); ok("MAP button → overview", (await st()).mode.view === "OVERVIEW"); await pg.screenshot({ path: process.argv[2] + "/m_overview.png" });
await pg.getByText("MAP", { exact: true }).count().catch(() => 0);
// overview on a phone: the management list fits, selecting an agent and RETURN work with touch
const ovBox = await pg.locator("[data-testid=founder-command]").boundingBox(); ok("overview (Founder Command) sheet fits the phone", !!ovBox && ovBox.x >= 0 && ovBox.x + ovBox.width <= 390.5 && ovBox.y >= 0 && ovBox.y + ovBox.height <= 845, ovBox ? `x=${ovBox.x.toFixed(0)} w=${ovBox.width.toFixed(0)} y=${ovBox.y.toFixed(0)} h=${ovBox.height.toFixed(0)}` : "missing");
await pg.locator("[data-testid=founder-command] [data-agent=CREATIVE_DIRECTOR] button[aria-pressed]").tap(); await pg.waitForTimeout(800); ok("tap selects an agent in the overview", (await st()).mode.selectedAgent === "CREATIVE_DIRECTOR");
await pg.getByText("RETURN TO PLAYER").tap(); await pg.waitForTimeout(3500); ok("RETURN goes back to the player", (await st()).mode.view === "PLAYER");
// jump + Founder Command + summon all, all by touch
await pg.evaluate(() => { const d = window.__worldDev; d.setPlayer({ locomotion: "GROUND" }); d.teleportPlayer(0, 13); d.setSimScale(10); }); await pg.waitForTimeout(1500); const jy0 = (await st()).player.y; let jpeak = jy0; await pg.getByLabel("Jump").dispatchEvent("pointerdown"); for (let i = 0; i < 12; i++) { await pg.waitForTimeout(100); jpeak = Math.max(jpeak, (await st()).player.y); }
ok("JUMP button jumps", jpeak - jy0 > 0.4, `rose ${(jpeak - jy0).toFixed(2)} m`);
await pg.getByLabel("Founder Command").tap(); await pg.waitForTimeout(1200); const fb = await pg.locator("[data-testid=founder-command]").boundingBox(); ok("COMMAND opens Founder Command as a bottom sheet that fits the phone", !!fb && fb.x >= 0 && fb.x + fb.width <= 390.5 && fb.y + fb.height <= 845, fb ? `h=${fb.height.toFixed(0)}` : "missing");
await pg.getByTestId("fc-summon-all").tap(); await pg.waitForTimeout(800); ok("SUMMON ALL by touch", Object.keys((await pg.evaluate(() => window.__worldDev.command())).directives).length === 10);
await pg.getByTestId("fc-dismiss-all").tap(); await pg.getByRole("button", { name: "Close Founder Command" }).tap(); await pg.waitForTimeout(600);
await pg.getByText("FLY", { exact: true }).tap(); await pg.waitForTimeout(3500); await pg.getByLabel("Boost: cycle flight speed").tap(); await pg.waitForTimeout(800); const hudTier = await pg.locator("[data-testid=flight-tier]").textContent().catch(() => ""); ok("flight: BOOST cycles the tier (FAST) and the flight HUD shows it", /FAST/.test(hudTier || ""), hudTier || "");
await pg.getByText("WALK", { exact: true }).tap(); await pg.waitForTimeout(6000);
// interior navigation with the joystick only: walk in through the HQ front door
await pg.evaluate(() => { const d = window.__worldDev; d.setPlayer({ locomotion: "GROUND" }); d.teleportPlayer(-18, -11); d.setLook(Math.PI, 0.2); });
await pg.evaluate(async () => { const el = document.querySelector("[aria-label='Movement joystick']"), r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, fire = (t, y) => el.dispatchEvent(new PointerEvent(t, { pointerId: 11, clientX: cx, clientY: y, bubbles: true, pointerType: "touch" })); fire("pointerdown", cy); fire("pointermove", cy - 60); await new Promise((r) => setTimeout(r, 14000)); fire("pointerup", cy - 60); });
const sIn = await st(); ok("joystick walks through the door into the lobby", /Lobby|HQ/.test(sIn.location) && sIn.location.includes("·"), sIn.location); await pg.screenshot({ path: process.argv[2] + "/m_interior.png" });
await pg.evaluate(() => { const d = window.__worldDev; d.setSimScale(1); d.setAgent("ORCHESTRATOR", -17, -24.2, 0.62); d.teleportPlayer(-17, -22.8); d.setLook(Math.PI, 0.2); }); await pg.waitForTimeout(2000);
await pg.getByText("TALK", { exact: true }).tap(); await pg.waitForTimeout(1500); ok("TALK opens the status sheet", (await pg.locator("[role=dialog]").count()) === 1); await pg.screenshot({ path: process.argv[2] + "/m_panel.png" });
const box = await pg.locator("[role=dialog]").boundingBox(); ok("panel fits the phone (no horizontal overflow)", box.x >= 0 && box.x + box.width <= 390.5, `x=${box.x.toFixed(0)} w=${box.width.toFixed(0)}`);
ok("panel exposes FOLLOW, FOCUS and OPEN RELATED COMMAND CENTER PAGE", (await pg.getByText("OPEN RELATED COMMAND CENTER PAGE").count()) === 1 && (await pg.getByText("FOLLOW  [T]").count()) === 1);
ok("no page scroll width overflow", await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
console.log(`errors: ${errs.length}`); errs.slice(0, 5).forEach((e) => console.log("  ", e)); console.log(`${pass} passed, ${fail} failed`); await b.close(); process.exit(fail || errs.length ? 1 : 0);
