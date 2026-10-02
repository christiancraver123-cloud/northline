# Northline World — Master Expansion Build (report)

Status: **built, verified in headless Chromium + unit tests; NOT yet played by a human on real GPU hardware.** Everything runs on a SIMULATED fixture — no real Northline state, no network, no model/provider call.
Correction to the POC report: the POC commit hash is **`0fc14e4`** (an earlier message wrongly said `38350fc`).

## Launch
```
cd northline && NORTHLINE_STORE=file NORTHLINE_AUTH_DISABLED=true npm run dev      # then open http://localhost:3000/world-dev
```
(`?perf=1` perf overlay · `?tier=LOW|MEDIUM|HIGH` · `?touch=1` mobile controls · `?mode=list` text fallback. Production: `/world-dev` is a 404 unless `NORTHLINE_WORLD_DEV=on`.)
Controls: WASD move · Shift run · mouse look (click to capture) · F / double-tap Space fly⇄walk · E interact · T follow · Tab overview · Q focus · R return · Esc peels one layer · P perf · H hints. "Places" menu = instant travel (dev convenience).

## What was built
1. **Town** (all procedural, `src/lib/world/town.ts`): Northline HQ District, Creative Row (Prompt Studio, Creative Studio, Copy Café), Production District (Strategy House, Production Office, Identity Lab, QA Studio), Wellness & Growth (pool, Pilates pavilion, Growth Lab), Analytics Pier, Boardwalk + Creator Beach, Marina (docks, boats), Residential Hills, Observatory Point (Research Observatory exterior — empty, labelled "NOT CONFIGURED").
2. **Northline HQ** (`hq.ts`): glass-and-timber two-storey exterior with signage, canopy, balconies, roof deck. Interior: lobby/reception, Command Center (operations desks + simulated display wall), strategy workspace, creative studio, meeting room, production room, analytics area, real staircase, upstairs hall, **founder office**, **founder suite** (bed, side tables, wardrobe/dressing room, desk, seating, bathroom, ocean-view balcony), lounge + terrace.
3. **Interior-aware**: zones (indoor/outdoor, room labels), multi-level collision (`supportHeight`, `ceilingAt`, y-ranged colliders, ramp-surface stairs), interior spring-arm camera that never ends inside walls/floors/ceilings, HQ roof cut-away in the management view, interiors only rendered near the HQ.
4. **All 10 real registry agents** (`roster.ts`, drift-tested against `AGENT_DEFS`): Orchestrator, Content Strategist, Creative Director, Prompt Engineer, Caption Writer, Identity QA, Content QA, Production Manager, Performance Agent, Growth Strategist — each with name, registry role, glyph + colour + prop + hat (not colour-only), workspace, idle spots, simulated status/task. **Research Agent is not registered → shown as NOT CONFIGURED; none spawned.**
5. **Agent life** (`agent-ai.ts`): idle wandering between role-appropriate spots (inside and outside buildings), sitting, working at the real workspace when WORKING, breaks, visual-only conversations (two agents face each other; no text), yielding to the player, holding still while the panel is open, standing up from chairs without popping.
6. **Interaction panel** (any agent): Agent, Role, Status, Current task, Production, Creator, Elapsed, Attempt, Provider, Next action, Workspace, Last recorded event, Data source, SIMULATED DATA banner; buttons FOLLOW, FOCUS, OPEN RELATED COMMAND CENTER PAGE (`/agents/<code>`, new tab, existing page/permissions). No LLM, no chain-of-thought, read-only.
7. **Management overview** (Tab): every agent with status, location, task, ⛔ BLOCKED / ⏳ WAITING flags, counts, NOT CONFIGURED role, buildings & places, player location; select → FOCUS / FOLLOW / Details / **Go there** (descends next to the agent) / RETURN.
8. **Six fictional creator residences** (architecture only — no creator avatars, nothing derived from canonical references): Sienna (Miami-style pastel beach house, pool, awning), Alessia (minimal architectural villa on the hill), Mila (relaxed timber house near town centre), Vesper (dark modern house in the quiet hills), Zoe (bright wellness bungalow), Skye (surf bungalow closest to the water, surfboard rack).
9. **Daylight + polish**: clean coastal daylight, soft sun, hemisphere fill, brighter interior lighting, animated ocean, hills backdrop, palms, planters, lamps, signs, ambient birds / boats / carts / walkers (instanced).
10. **Movement/camera**: damped walk/run/fly, takeoff/landing, stairs and doorways, spring arm, eased view transitions, Esc layering, FOV by speed.
11. **Mobile**: joystick + look-drag + MAP / FOLLOW / FLY / TALK, bottom-sheet overview and status panel, location chip, Places menu; walking into the HQ and using the panel works with touch only.
12. **Performance architecture**: merged vertex-coloured chunks per group × material, one sign atlas, instanced props/palms/boats/walkers/birds, shared-material avatar rigs with distance LOD → instanced proxies, DOM-projected labels, tiered shadows/terrain/density, adaptive quality controller, lazy 3D chunk.

## Measurements (software GL — NOT a GPU benchmark)
Draw calls / triangles across 7 vantage points (spawn, lobby, bedroom, street, high flight, beach flight, overview):
| tier | draw calls | triangles |
|---|---|---|
| LOW (844×390) | 59 – 106 | 118k – 151k |
| MEDIUM | 87 – 193 | 265k – 305k |
| HIGH | 91 – 229 | 352k – 395k |
Headless software GL runs at ~2–9 fps here, so **60 FPS (Mac) / stable 30 FPS (iPhone 13, LOW) are design targets, not proven**; please play it and use `?perf=1`. 3D chunk: 1.07 MB raw / **294 KB gzip**, referenced by no other route (normal Command Center pages never load it).

## Tests / validation
- `npx vitest run`: **326 passed** (23 files; world: 68 incl. roster↔registry drift, nav connectivity (1,000+ nodes), every roster spot reachable from every spot, HQ stairs/founder suite/balcony reachable via real navigation, walls vs. door with the real controller, 8-minute 10-agent simulation (never inside solids, no teleports, all reach their workspace), fixture, mobile input, production isolation, asset registry).
- `npx tsc --noEmit` clean · `npm run build` OK · `npm run world:assets` OK (13 entries; all procedural, no third-party assets, no paid assets).
- Browser: `scripts/world-dev/acceptance.mjs` **27/27** (the full 22-step scenario with the real controller), `mobile.mjs` **14/14** (iPhone-class emulation), 0 console/page errors.
- Production isolation: as deployed `/world-dev` → 404, unauthenticated → /login, `/world` safe page, `/api/health` read-only; `NORTHLINE_WORLD_DEV=on` → 200. `render.yaml` unchanged (READONLY=true, GOVERNOR=on, DURABLE_JOBS=off, AUTONOMOUS_GENERATION=off, no provider vars). Zero provider calls, zero migrations, secret scan clean.
- A real bug found by the new tests and fixed: agents standing up from benches could be pinned by the bench collider and never reach their workspace.

## Known limitations
- Not play-tested on real GPUs/phones yet; fps numbers above are software GL only.
- Interiors are furnished but modest; the bedroom wardrobe/headboard proportions could use art polish; characters are stylised procedural humanoids.
- "Places" / "Go there" are instant development travel (with a fade), not a walking route.
- Statuses are a looping fixture; the world-state adapter is ready for real `/api/world/state` but is deliberately not connected.
- Agent conversations are visual only; there is no text or LLM.
- No creator avatars, no live agent chat, no provider-backed research, no real World actions — by design, out of scope for this build.

## Screenshots
`docs/design/world-expansion/` (HQ front, lobby, Command Center, founder bedroom, balcony, overview, creator houses, observatory, mobile).
