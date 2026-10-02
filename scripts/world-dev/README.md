# World browser checks (optional; not part of `npm test`)
Playwright scripts that drive `/world-dev` in headless Chromium. They need `playwright-core` + a Chromium binary (`CHROMIUM_PATH`), a running server (`WORLD_BASE`, default http://localhost:3200) started with e.g.
`NORTHLINE_STORE=file NORTHLINE_AUTH_DISABLED=true npx next dev -p 3200`.
- `acceptance.mjs [outDir]` — the 22-step acceptance scenario with the REAL controller and UI (spawn → HQ → Command Center → agent panel → follow → stairs → founder office → bedroom → balcony → fly → creator houses → overview → select/focus/go-to agent → interact → boardwalk → back to HQ). Optional screenshots.
- `mobile.mjs <outDir>` — iPhone-class emulation: auto LOW tier, joystick, buttons, overview sheet, walking into the HQ with the joystick, status sheet fit.
- `perf.mjs` — draw calls / triangles per tier and view (valid on software GL; **fps from headless software GL is NOT a GPU benchmark**).
- `production-check.mjs` — /world-dev 404 in production (as deployed) vs. NORTHLINE_WORLD_DEV=on, auth redirect, /world safe page. Needs production builds on :3100 / :3102 with a local Supabase stub.
