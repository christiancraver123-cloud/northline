import { chromium } from "playwright-core";
const out = process.argv[2], W = +(process.argv[3] || 1280), H = +(process.argv[4] || 720), only = (process.argv[5] || "").split(",").filter(Boolean);
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const pg = await (await b.newContext({ viewport: { width: W, height: H } })).newPage();
const errs = []; pg.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message.slice(0, 300))); pg.on("console", (m) => { if (m.type() === "error" && !/ERR_CERT|404/.test(m.text())) errs.push(m.text().slice(0, 300)); });
await pg.goto(""+(process.env.WORLD_BASE||"http://localhost:3200")+"/world-dev?tier=HIGH", { waitUntil: "domcontentloaded", timeout: 120000 });
await pg.waitForSelector("[data-testid=world-root] canvas", { timeout: 120000 }); await pg.waitForTimeout(3000);
await pg.click("[aria-label=Start]").catch(() => {});
await pg.keyboard.press("KeyH");
const W_ = (f, ...a) => pg.evaluate(([f, a]) => window.__worldDev[f](...a), [f, a]);
const shots = {
  plaza: async () => { await W_("teleportPlayer", -3.5, -10); await W_("setLook", Math.PI, 0.22); },
  building: async () => { await W_("teleportPlayer", 6, -8); await W_("setLook", Math.PI + 0.55, 0.12); },
  boardwalk: async () => { await W_("teleportPlayer", -10, 17.5); await W_("setLook", -Math.PI / 2, 0.15); },
  beach: async () => { await W_("teleportPlayer", 4, 24.5); await W_("setLook", 0.25, 0.05); },
  agent: async () => { await W_("setAgent", 2, 17.5); await W_("teleportPlayer", 2, 13.8); await W_("setLook", 0, 0.12); },
  fly: async () => { await W_("teleportPlayer", -20, 10); await W_("setPlayer", { locomotion: "AIR", y: 22, grounded: false, takeoff: 0 }); await W_("setLook", 0.9, 0.55); },
  agentclose: async () => { await W_("setAgent", 2, 17.5); await W_("teleportPlayer", 2, 12.4); await W_("setLook", 0.5, 0.1); await W_("setPlayer", { heading: 0.5 }); },
  agentwork: async () => { await pg.keyboard.press("KeyP"); await pg.getByText("Simulate a task now").click(); await pg.keyboard.press("KeyP"); await W_("setAgent", -14, -13.3); await W_("teleportPlayer", -9.5, -10.5); await W_("setLook", Math.PI + 0.9, 0.12); },
  overview: async () => { await W_("setMode", { type: "TOGGLE_OVERVIEW" }); },
  follow: async () => { await W_("setMode", { type: "RETURN_TO_PLAYER" }); await W_("setMode", { type: "FOLLOW_AGENT", id: "CREATIVE_DIRECTOR" }); },
};
for (const [name, f] of Object.entries(shots)) { await f(); if (only.length && !only.includes(name)) continue; await pg.waitForTimeout(name === "overview" || name === "follow" ? 9000 : 6000); await pg.screenshot({ path: `${out}/t_${name}.png` }); }
console.log("errors:", errs.length); errs.slice(0, 8).forEach((e) => console.log("  ", e));
await b.close();
