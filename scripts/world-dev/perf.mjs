import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"] });
const views = [["spawn", { p: [-14, -7.2] }], ["lobby", { p: [-18, -22.5, 0.62], yaw: 3.14 }], ["bedroom", { p: [-6, -22, 5], yaw: 3.14 }], ["street-east", { p: [30, -8], yaw: 1.57 }], ["fly-high", { p: [0, 20, 60], fly: true, yaw: 3.14, pitch: 0.9 }], ["fly-beach", { p: [-10, 40, 18], fly: true, yaw: 3.14, pitch: 0.45 }], ["cc-table", { p: [-6.4, -24.2, 0.74], yaw: 0.3, pitch: 0.4 }], ["summon-all", { p: [-14, -7.2], yaw: 3.14, summon: 1 }], ["overview", { ov: 1 }]];
for (const tier of ["LOW", "MEDIUM", "HIGH"]) {
  const pg = await (await b.newContext({ viewport: { width: tier === "LOW" ? 844 : 1280, height: tier === "LOW" ? 390 : 720 } })).newPage();
  await pg.goto(`${process.env.WORLD_BASE || "http://localhost:3200"}/world-dev?tier=${tier}&perf=1`, { waitUntil: "domcontentloaded", timeout: 180000 }); await pg.waitForSelector("[data-testid=world-root] canvas", { timeout: 180000 }); await pg.waitForTimeout(3000); await pg.click("[aria-label=Start]").catch(() => {});
  for (const [n, v] of views) {
    await pg.evaluate((v) => { const d = window.__worldDev; if (v.p) { d.setMode({ type: "RETURN_TO_PLAYER" }); d.teleportPlayer(v.p[0], v.p[1], v.p[2]); } if (v.fly) d.setPlayer({ locomotion: "AIR", y: v.p[2] }); if (v.yaw !== undefined) d.setLook(v.yaw, v.pitch ?? 0.2); if (v.ov) d.setMode({ type: "TOGGLE_OVERVIEW" }); if (v.summon) { d.setSimScale(12); } }, v); if (v.summon) { await pg.keyboard.press("KeyG"); await pg.waitForTimeout(25000); }
    await pg.waitForTimeout(7000) // software GL renders ~2-8 fps; the perf overlay refreshes every 0.5 s of game time;
    const t = await pg.evaluate(() => document.querySelector("[data-testid=perf]")?.innerText);
    const m = (k) => (t.match(new RegExp(k + "\\s*\\n?\\s*([\\d,\\.]+)")) || [])[1];
    console.log(tier.padEnd(6), n.padEnd(12), "calls", m("draw calls"), "tris", m("triangles"), "geo", m("geometries"));
    if (v.ov) await pg.evaluate(() => window.__worldDev.setMode({ type: "RETURN_TO_PLAYER" }));
  }
  await pg.close();
}
await b.close();
