import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
for (const tier of ["LOW", "MEDIUM", "HIGH"]) {
  const pg = await (await b.newContext({ viewport: { width: 640, height: 360 } })).newPage();
  await pg.goto(`${process.env.WORLD_BASE || "http://localhost:3200"}/world-dev?tier=${tier}&perf=1`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await pg.waitForSelector("[data-testid=perf]", { timeout: 120000 }); await pg.click("[aria-label=Start]"); await pg.keyboard.press("KeyH");
  const views = { start: async () => {}, "look-at-town": async () => { await pg.evaluate(() => { window.__worldDev.teleportPlayer(-3.5, -9); window.__worldDev.setLook(Math.PI, 0.2); }); }, "fly-high": async () => { await pg.evaluate(() => { window.__worldDev.teleportPlayer(0, 5); window.__worldDev.setPlayer({ locomotion: "AIR", y: 40, grounded: false, takeoff: 0 }); window.__worldDev.setLook(0.3, 0.7); }); }, overview: async () => { await pg.evaluate(() => window.__worldDev.setMode({ type: "TOGGLE_OVERVIEW" })); } };
  for (const [name, f] of Object.entries(views)) { await f(); await pg.waitForTimeout(5500); const t = await pg.locator("[data-testid=perf]").innerText(); const g = (k) => (t.match(new RegExp(k + "\\s+([\\d,\\.]+)")) || [])[1]; console.log(tier.padEnd(7), name.padEnd(13), `draw calls ${g("draw calls")}`.padEnd(16), `triangles ${g("triangles")}`.padEnd(20), `geometries ${g("geometries")} textures ${g("textures")}`); }
  await pg.close();
}
await b.close();
