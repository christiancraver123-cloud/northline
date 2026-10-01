import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
for (const [label, port] of [["production (as deployed: no flag)", 3100], ["production + NORTHLINE_WORLD_DEV=on (local play)", 3102]]) {
  const ctx = await b.newContext(), pg = await ctx.newPage(); const base = `http://localhost:${port}`;
  const anon = await pg.goto(base + "/world-dev"); console.log(label.padEnd(50), "| unauthenticated /world-dev →", new URL(pg.url()).pathname, anon.status());
  await pg.fill("input[name=password]", "local-test-pw"); await pg.click("text=Sign in"); await pg.waitForURL(base + "/");
  const r = await pg.goto(base + "/world-dev", { waitUntil: "domcontentloaded" }); console.log(" ".repeat(50), "| signed-in /world-dev →", r.status(), (await pg.title()));
  const w = await pg.goto(base + "/world"); console.log(" ".repeat(50), "| /world →", w.status(), (await pg.locator("h1").first().textContent().catch(() => "")));
  const h = await pg.goto(base + "/api/health"); console.log(" ".repeat(50), "| /api/health →", h.status(), await pg.locator("body").innerText());
  await ctx.close();
}
await b.close();
