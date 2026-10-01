# Northline World — 3D vertical-slice POC (status report)
**Status: playable SIMULATED slice delivered; awaiting the owner's judgement of the one question — *is moving around Northline, finding an agent and interacting with them smooth, premium and genuinely fun?*** The full town is NOT started.

## What it is
`/world-dev` — one coastal neighbourhood (ocean, beach, boardwalk, one road, the Northline Studio building, palms, props, hills/islands on the horizon), the operator avatar and ONE simulated agent (Mara Quill, Creative Director). State is a clearly labelled **SIMULATED** fixture. No provider, LLM, database, network or real-state access (enforced by tests).

## How to play (local)
```
cd northline
npm install
NORTHLINE_STORE=file NORTHLINE_AUTH_DISABLED=true npm run dev      # development only; auth bypass is ignored in production
open http://localhost:3000/world-dev
```
(or, to play a production-mode build locally: `npm run build && NORTHLINE_STORE=file NORTHLINE_WORLD_DEV=on NORTHLINE_ADMIN_PASSWORD=… NORTHLINE_SESSION_SECRET=… npm start`, then sign in). Use `?perf=1` for the performance overlay, `?tier=LOW|MEDIUM|HIGH` to force a tier, `?touch=1` to preview mobile controls, `?mode=list` for the text fallback.

## Controls
| | Desktop | Mobile |
|---|---|---|
| Move / run | WASD or arrows · Shift | left joystick (push far = run) |
| Look | mouse (click the world to capture; Esc releases) | drag the right side |
| Fly ⇄ walk | F, or double-tap Space · Space/Ctrl = up/down | FLY/WALK button · ▲▼ while flying |
| Interact | E (prompt appears within ~3 m, on foot or hovering low) | TALK |
| Follow agent | T (Exit: T / Esc / chip button) | FOLLOW |
| Overview | Tab (Q focus agent · R return to player · WASD pan · wheel zoom · drag orbit) | MAP / BACK |
| Esc | peels back one layer: panel → follow → overview | — |
| Performance / hints | P / H | — |

## Environment (stylised realism, all procedural — no third-party assets)
Shader ocean (3 summed waves, ripple normals, fresnel sky reflection, sun glints, animated foam/wash, shallow-water tint); warm late-afternoon sun with a single shadowed light that follows the player; sky dome + clouds; sculpted terrain with vertex-colour sand/lawn/hills; road with kerbs, raised boardwalk with rail, paved forecourt; modern two-storey studio (cantilevered upper floor, teak battens, glazing, sign, roof terrace) + pergola workstation; instanced palms with wind sway, grass clumps, shrubs, rocks, umbrellas, loungers, benches, lamps, planters, bollards, a lifeguard tower; distant islands under fog haze. Registry: `docs/world-assets/registry.json` (6 internal-procedural entries, no third-party files; `npm run world:assets` validates).

## Agent behaviour
Pathfinding (A* on a waypoint graph; sand costs more, boardwalk preferred) so it never walks through the building, water or props (tests verify every edge against the real colliders); idles with cosmetic wandering between 8 places, believable turn-then-walk with a capped turn rate, arrival slow-down, occasional glances; yields to the operator in its way; stops and turns to face you while its panel is open; is solid (you can't walk through it). The fixture alternates ~50 s idle / ~70 s of a SIMULATED task: the agent walks to the studio pergola, works at the desk (tablet/mood-board pose), then returns to idling. Panel/HUD: ambient activity appears **only when IDLE and is labelled cosmetic**; WORKING shows the (simulated) task. Role identity beyond colour: glyph ◆, beret, mood-board tablet, name/role badge.

## Performance instrumentation and measurements
`?perf=1` / P shows FPS, frame ms, 1% low, draw calls, triangles, geometries, textures, DPR, tier and a manual tier selector. Tiers LOW/MEDIUM/HIGH are chosen from device capability and adapt at runtime (down after 2.5 s of sustained slowness, up only slowly and never above the starting ceiling). Measured on software GL (draw calls/triangles are device-independent):
| Tier | Draw calls | Triangles | Budget (design) |
|---|---|---|---|
| LOW | 62–104 | ~101–110 k | ≤120 calls / ≤150 k tris (mobile) ✓ |
| MEDIUM | 132–176 | ~181–191 k | — |
| HIGH | 141–179 | ~223–231 k | ≤300 calls / ≤500 k tris (desktop) ✓ |
World chunk: ≈988 KB raw / **≈266 KB gzipped**, lazy-loaded, referenced by no other route (the Command Center never downloads it; budget ≤900 KB gz ✓).
**Not measured:** real-GPU frame rate. Headless software GL gives ~3 fps at 1280×720 and ~19 fps at 480×270 — meaningless as a GPU benchmark. The 60 FPS (Mac) and stable-30 FPS-on-LOW (iPhone 13-class) targets must be confirmed by you on real hardware with `?perf=1`.

## Tests / verification (all pass)
- 304 unit tests (45 new world-logic tests + 3 render/asset/isolation suites): movement accel/decel, frame-rate independence (30/60/144 Hz), stall safety, walk↔fly↔landing, collisions, water/bounds, camera blending/spring-arm, mode machine (walk/fly/overview/follow/focus/escape layering), interaction eligibility, quality-tier selection + adaptive hysteresis, agent AI over 10 simulated minutes (no solid/water/teleport), navigation connectivity, simulated-snapshot validation + production-isolation rules, asset-registry rules, "world code imports no db/provider/LLM and makes no network call", "fixtures reachable only from /world-dev", "no 3D import outside the world chunk".
- Browser (headless Chromium, `scripts/world-dev/`): 17/17 functional (keys, fly, overview/focus/return, interaction panel, follow, Esc, solidity, simulated task), 9/9 phone-emulation (auto LOW tier, joystick, buttons, sheet fits 390 px), 0 console errors; production check: `/world-dev` → 404 as deployed, login redirect when unauthenticated, 200 only with `NORTHLINE_WORLD_DEV=on`.
- Typecheck, production build, secret scan, asset registry: clean. Production deployment config unchanged (READONLY=true, GOVERNOR=on, DURABLE_JOBS=off, AUTONOMOUS_GENERATION=off; no provider keys; no migrations).

## Known limitations
No real-GPU numbers yet (see above). Avatars are stylised primitives (not final art); one agent; no creator avatars, interiors, audio, vehicles/boats, day/night or weather. Water reflects the sky colour only (no scene reflections). `antialias` is fixed at start (tier changes can't toggle it). Pointer capture on Safari desktop and touch-multitouch behaviour were tested only in emulation. `prefers-reduced-motion` shortens camera transitions and disables ambient sway paths but wasn't exercised in a real browser. Keyboard-only play is possible but the text fallback is minimal.
