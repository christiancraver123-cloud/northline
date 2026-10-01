# World POC browser checks (optional; not part of `npm test`)
Playwright scripts that drive `/world-dev` in headless Chromium. They need `playwright-core` + a Chromium binary (`CHROMIUM_PATH`), a running server (`WORLD_BASE`, default http://localhost:3200) started with e.g.
`NORTHLINE_STORE=file NORTHLINE_AUTH_DISABLED=true npx next dev -p 3200`.
- `func.mjs` — walk/run/fly/overview/focus/interact/follow/Esc layering (functional).
- `mobile.mjs` — iPhone-class emulation: auto LOW tier, joystick, buttons, panel fit.
- `perf.mjs` — draw calls / triangles per tier and view (valid on software GL; **fps from headless software GL is NOT a GPU benchmark**).
- `tour.mjs` — screenshots from several vantage points.
- `production-check.mjs` — /world-dev 404 in production (as deployed) vs. NORTHLINE_WORLD_DEV=on, auth redirect, /world safe page.
