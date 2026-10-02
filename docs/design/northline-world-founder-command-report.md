# Northline World — Founder Command System + Movement Upgrade

Status: built and verified in headless Chromium + unit tests. **Everything is SIMULATED and read-only**: commands move cosmetic agents and change nameplate wording; nothing is written to Northline, no provider/LLM/network call exists in this layer, no migration, production config unchanged (`render.yaml` untouched).
Architecture: `FOUNDER COMMAND UI` (`src/world-dev/ui/*`) → `WORLD COMMAND CONTROLLER` (`src/lib/world/command.ts`, pure reducer) → `SIMULATED AGENT COMMANDS` (directives consumed by `agent-ai.ts`). A future version can swap the middle layer for an authorised orchestration API; that mutation layer is deliberately not implemented.

## Launch
```
cd northline && NORTHLINE_STORE=file NORTHLINE_AUTH_DISABLED=true npm run dev      # open http://localhost:3000/world-dev
```

## Final controls (desktop)
| Key | Action |
|---|---|
| **WASD** | move |
| **Shift** | run / sprint (on foot) · **FAST** flight (held) |
| **Space** | **jump** (on foot, grounded only, once per press) · ascend (in flight) |
| **F** | toggle flight (takeoff / assisted landing) |
| **Ctrl** / **Z** | descend (in flight) |
| **double-tap Shift and hold** | **TURBO** flight |
| **[** / **]** | lower / raise the cruise flight tier (FLIGHT → FAST → TURBO) |
| **B** (or **Alt**) | **brake** (flight) |
| **C** | **Founder Command Mode** (anywhere) |
| **G** | **Summon all** agents |
| **Q** | quick command wheel (8 actions; **1–8** select) |
| **Tab** | management overview (Founder Command docks beside it) |
| **E** | interact (agent, **command table**, **founder control panel**) |
| **T** | follow nearest/selected agent · **V** focus · **R** return to player |
| **Esc** | back one layer (wheel → suite panel → agent panel → Founder Command → follow → overview) |
| **P** / **H** | perf overlay / controls hint |
Changes from the previous build: double-tap Space no longer toggles flight (Space is jump now; **F** is the only flight toggle); **Q** moved from "focus" to the command wheel (**V** = focus); descend is Ctrl/Z (**C** now opens Founder Command).
Mobile: left stick (small = walk, near the edge = run), **JUMP**, **COMMAND**, **MAP**, **FLY/WALK**, **TALK**; in flight **▲ ▼ BRAKE BOOST** (BOOST cycles FLIGHT → FAST → TURBO). Summon all / meeting / focus / follow are in the COMMAND sheet.

## What changed
1. **Founder Command Mode** — a docked panel (bottom sheet on phones) over the live world: NORTHLINE STATUS (system, approvals, images today, budget left — all labelled SIMULATED), WORKING / WAITING / BLOCKED / FAILED / IDLE counts, group filters, command bar, every agent with glyph, 3-letter code, status (symbol + word), location, task, creator, elapsed, next action; per-agent FOCUS / FOLLOW / SUMMON / GO TO WORKSPACE / OPEN DETAILS / OPEN COMMAND CENTER PAGE / GO THERE; Founder travel (HQ, Command Center, Founder suite, Creative Row, Production, Analytics Pier, Boardwalk, Creator Beach, Marina, Residential Hills, Observatory, Wellness, six creator residences, Home).
2. **Distinguishability** — each of the 10 real agents has a unique glyph, 3-letter code (ORC STR CRD PME CPW IQA CQA PMG PFA GRS), prop, **silhouette** (9 hair styles, 9 outfits, 5 accessories, body build) and a distinct nameplate; a test enforces uniqueness.
3. **Nameplates** — FULL `[glyph code] NAME / ROLE / STATUS` near; NAME mid; glyph + status symbol far; farther plates yield to nearer ones that would overlap. Status is never colour-only: ▶ working, ◔ waiting (dashed border), ⊘ blocked (double border), ✕ failed (dotted), ○ idle, ❚❚ paused; commands show ➜ COMING TO FOUNDER / ◎ AT FOUNDER / ⇢ GOING TO MEETING / ▣ MEETING — WAITING FOR FOUNDER / ▣ IN MEETING / ⌂ GOING TO WORKSPACE.
4. **SUMMON ALL / individual** — agents pathfind (rush speed, no teleport) to a "stage" formation in front of the founder (valid, reachable, same-floor points; ≥1.7 m apart; spiral-search fallback; fallback flags if nothing is valid), face the founder, step around them instead of freezing, and re-form (keeping slots) when the founder moves > 5.5 m.
5. **DISMISS ALL / RETURN TO WORK / GO TO WORKSPACE** — agents walk back to their workspace (if their simulated task is working) or an idle place.
6. **CALL MEETING (ALL / SELECTED)** — designated seats and standing places in the HQ meeting room; ▣ MEETING — WAITING FOR FOUNDER until the founder enters, then ▣ IN MEETING.
7. **Jump** — grounded-only, once per press, apex ≈ 1.2 m, gravity arc, ceiling head-room clamp, works on stairs and indoors, hops low obstacles but not walls; 120 ms / 3-frame buffer so slow frame rates never swallow a press.
8. **Run / sprint** — walk 3.6 m/s, run 8.6 m/s; quick acceleration, weighty sprint build-up, firm stop; animated run, FOV response.
9. **Flight tiers** — FLIGHT 20 m/s · FAST 46 m/s (Shift) · TURBO 98 m/s (double-tap Shift or `]`), gradual acceleration/deceleration, vertical speed per tier.
10. **Turbo** — crosses the town in ≈ 4 s; FOV widens, camera chase tightens with speed, restrained speed streaks (off with reduced-motion), 0.5 m collision sub-steps (no tunnelling at 98 m/s), wall-slide instead of stopping dead, terrain look-ahead (climbs before hills arrive).
11. **Braking / landing** — releasing controls damps speed (no endless drift); **B** brakes hard; landing sheds speed first, even from turbo; HUD shows FLIGHT/FAST/TURBO, speed and altitude only while flying.
12. **HQ Command Center** — a standing-height **command table** with a live town map (every agent as a code-ringed marker, the founder, status legend) and a wall dashboard (status tiles, approvals, budget, system, agent roster, attention first), all marked SIMULATED. Press **E** at the table to open Founder Command. Premium-studio look, not sci-fi.
13. **Founder suite** — a small **Founder Control Panel** pedestal by the desk (status, agents working, approvals, current tasks; CALL ALL AGENTS, GO TO COMMAND CENTER, OPEN MAP). The bedroom stays a bedroom.
14. **Overview** — now shows the same Founder Command panel beside the map; select agents/groups, summon, follow, focus, inspect, call meeting, return; markers move in real time.
15. **Command wheel (Q)** — SUMMON ALL, COMMAND CENTER, OVERVIEW, AGENTS, HQ, FLY, TURBO, RETURN HOME (radial on desktop/phone).

## Performance (software GL, NOT a GPU benchmark)
Draw calls / triangles, 9 vantage points incl. the Command Center table and SUMMON ALL (10 full-detail agents around the founder):
| tier | typical | summon-all (10 rigs near) |
|---|---|---|
| LOW | 59–108 calls · 118k–150k tris | 188 calls · 164k tris |
| MEDIUM | 114–201 calls · 279k–309k tris | ~283 calls · 326k tris (was 342 before limiting shadow casters to the 5 nearest agents) |
| HIGH | 118–232 calls · 372k–398k tris | ~340 calls · 423k tris |
Costs are bounded: nameplates are DOM elements positioned once per frame for ≤10 agents with O(n²) overlap resolution on 10 items, text updated only on change; displays repaint ≤ 2/4/6 Hz (LOW/MEDIUM/HIGH) and only when the camera is near; the board is rebuilt 4×/s; formation planning runs only on command / every 0.5 s while someone is summoned. Real GPU/phone frame rates are unmeasured — please play it with `?perf=1`.

## Validation
See the final message for the exact counts; scripts: `scripts/world-dev/founder-acceptance.mjs` (21 requested steps + wheel + founder suite), `mobile.mjs`, `perf.mjs`, `acceptance.mjs`, `production-check.mjs`.

## Known limitations
- Software-GL only so far; 60 FPS (Mac) / 30 FPS (iPhone 13 LOW) remain targets.
- Summon-all costs ≈ 100 extra draw calls on LOW (10 articulated rigs); a future pass can merge limb meshes.
- Formation planning is geometric (front "stage"); in very tight spaces (small rooms) points fall back to nearest valid ones and may sit closer than 1.7 m.
- Fast-travel is optional development navigation (instant, with a fade).
- Statuses are a looping SIMULATED fixture; approvals/budget figures are fixture numbers.
- Commands are simulation-only by design; no live orchestration, conversations or provider-backed actions.
