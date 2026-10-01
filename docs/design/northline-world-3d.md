# Northline World — true 3D explorable coastal town (DESIGN, Phase 0)
**Status: design only.** No world code, no migration, no provider call, no production data touched. Sequenced **after** the governor + durable-job live validation (migrations 0007/0008 applied and Stage 1 proven). This supersedes any earlier "lightweight SVG/isometric V1" assumption: the product direction is a real-time 3D town in the browser; the SVG map survives only as the accessibility/low-power fallback (§14).

**The rule that shapes everything:** the world is a *spatial interface over real operations*. Supabase + the Northline backend + the durable job system are the only authority. The 3D client renders a *derived* state, never decides, never gates work, and closing it stops nothing.

## LOCKED PRODUCT DECISIONS (operator, supersede anything below that conflicts)
1. **Art style: STYLIZED REALISM** — a premium modern 3D management/simulation look with beautiful coastal architecture and high-quality water, vegetation and lighting, built from *simplified* geometry and materials. Not low-poly, not photorealistic, not cartoonish. **Performance outranks graphical excess.** Practical meaning: clean architectural forms with bevels and believable material response (PBR-lite, a small shared material set, baked-looking ambient occlusion in textures/vertex colours), soft stylised lighting with a single shadowed sun, rich but cheap water (shader-based) and instanced, silhouette-driven vegetation. "Expensive" comes from composition, colour grading, lighting and polish, not from polygon count. Any asset that exceeds the §2 budgets is simplified, not the budget raised.
2. **Performance targets:** desktop / capable Mac **60 FPS**; mobile **stable 30 FPS minimum**. Three quality tiers **LOW / MEDIUM / HIGH**; the initial tier is chosen automatically from device capability, with manual override added later (not a POC requirement). **LOW** reduces: shadows, vegetation density, reflections, draw distance, LOD distances, ambient NPCs, particles and water complexity — and **never removes core gameplay or interactions** (movement, camera modes, agents, interaction panels, fast travel, HUD all work identically on every tier).
3. **Avatars:** the POC requires exactly two kinds — the **user/operator avatar** and **operational-agent avatars**. Agents must be **visually distinguishable by role** (role colour/outfit accent + a role glyph/badge + silhouette prop such as tablet, clipboard, headset, loupe; never colour alone, for accessibility). **Creator avatars are NOT in the POC.** Creator 3D appearance is **never derived automatically from canonical image references**; it needs a separate future design and approval process (identity-sensitive).
4. **Agent conversations (Phase 6) are approved as a direction, with conditions.** They may eventually call a text LLM, but: a **separate conversation budget/cap**; **governor integration** (reserve/audit/pause, same fail-closed rules); answers built only from **real Northline operational state** (no fabricated current work — "nothing recorded" is a valid answer); **no hidden chain-of-thought** exposed; **no permission bypass**; **a conversation can never directly trigger generation or publishing** — any action it proposes goes through the normal Northline authorization, approval and budget systems like any other operator action. Target questions: "What are you working on?", "Why is this production blocked?", "What needs my approval?", "What happened with Sienna?", "What did you finish today?" — all answerable from recorded state (tasks, runs, events, QA results, approvals, `blocked_reason`). **No LLM conversation calls are approved during the POC** (the POC's panel is a static status panel from fixture state).
5. **Audio is deferred.** The POC and the initial operational world must work perfectly with no audio; audio is never an architectural dependency (no code path may require an AudioContext, user-gesture unlock or audio asset). Future direction: ocean/waves, wind/palms, footsteps, doors, town and building ambience, vehicles, marina, spatial audio; voice conversations are a later phase.
6. **POC priority: prove the EXPERIENCE before building the town.** Gate: governor + durable-job reliability phases complete first. The POC builds only one coastal section and answers one question — *"Does moving around Northline and interacting with an agent feel smooth, premium and genuinely fun?"* The full town is **not** started until that is answered (§POC).
7. **Long-term experience to preserve:** fly over Northline → see an agent walking below → descend beside them → walk up → interact → ask what they're working on → inspect their *actual* task → follow them to their next destination. Operational information always comes from real Northline state; the physical world only makes it explorable. Every architectural choice (continuous camera-mode transitions, agent entities with real task bindings, FOLLOW mode, interaction panels built from the snapshot, grounded conversation packets) exists to keep this loop possible.

8. **Mobile performance floor — LOCKED:** **iPhone 13-class** hardware is the reference for **stable 30 FPS on LOW**. It is a *reference class*, not a promise for every older/weaker device. Capable Mac/desktop: 60 FPS on the appropriate tier. Newer high-end mobile: attempt MEDIUM/HIGH while staying stable (the runtime tier controller steps down on sustained misses). Weaker devices: quality reduces automatically; if a device still cannot give a good experience, use the existing **2D World Map / Command Center fallback** — the world's design is **not** degraded around very weak hardware. Wherever the 3D world runs, **core interaction stays available**.
9. **Asset pipeline — LOCKED: mixed modular** (see "Asset pipeline and registry" below): no from-scratch town, no dependence on one giant pack; licensed modular architecture, vegetation, coastal props, furniture, road/path pieces, marina props, generic vehicles, environmental objects and character bases; Northline **hero assets** (HQ, Approval Villa, major creator residences, signature production buildings, landmarks) may later be custom-built. POC priorities: **quality, cohesion, performance, license safety** over quantity.
10. **Creator avatars — DEFERRED BY DESIGN.** Nothing is blocked on them (POC, agent avatars, movement, interaction, buildings, environment). Creator 3D faces are never derived from canonical references. When needed, a **separate proposal** will cover identity authority, 3D likeness, reference usage, approval, versioning, drift, wardrobe, animation and the relationship to canon. No creator-avatar implementation is approved.
11. **Conversation caps — DEFERRED TO PHASE 6.** No numbers are chosen now. The architecture must merely support configurable per-conversation, per-agent, per-user-daily and global-daily caps, a token cap, a dollar cap (when pricing is configured) and the emergency pause (§10).

**Decision register:** Mobile floor — LOCKED · Asset strategy — LOCKED · Creator avatars — DEFERRED BY DESIGN · Conversation caps — DEFERRED TO PHASE 6. None of these blocks the POC.
**Sequencing gate (queue):** 1) 0007 live governor validation → 2) 0008 durable-job validation → 3) Stage 1 proof → 4) Stage 2 safe proof → 5) usable deployed Command Center → **then START the Northline World POC** (one exceptionally good slice that sets the quality bar for everything after).

---
## 1. Rendering-stack recommendation
| Choice | Recommendation | Why / what we rejected |
|---|---|---|
| Engine | **Three.js** via **React Three Fiber (R3F) + drei** | Browser-native (Mac, phone, no install), fits the existing Next.js 16 / React 19 app, one codebase and one auth. Unity/Unreal WebGL exports are 20–100 MB, slow to load, poor on phones and detached from our React/auth stack — **not justified** until the browser stack demonstrably fails the §15 budgets in the POC. |
| Renderer | WebGL2 now; keep code WebGPU-ready (Three's `WebGPURenderer` is optional later) | WebGL2 is universal on target devices; WebGPU is not on every Safari/phone. |
| Physics | **No physics engine in V1.** Custom kinematic character controller: capsule vs. static circles/AABBs from the nav data + ground height function | Rapier/Cannon cost 0.5–2 MB WASM and CPU for a world that needs only walls, water edges and a terrain height. Revisit only for vehicles/boats. |
| Post-processing | Minimal: tone mapping + optional bloom/vignette on high tier only | Every full-screen pass costs fill-rate on phones. |
| State (client) | `zustand` (tiny) for world UI state; **entities live in refs/typed arrays, not React state** | Per-frame data must never trigger React re-renders. |
| Pathfinding | Own A* on a small **waypoint/portal graph** (~300–600 nodes) | A navmesh library is overkill for a dense small town and adds weight; revisit `three-pathfinding` if interiors need free-form navigation. |
| Assets | glTF 2.0, **meshopt/Draco** geometry, **KTX2/Basis** textures, shared atlases; procedural low-poly generated in code for the POC | Stylised-realism target (see Locked Decisions). Licensing/provenance of any external asset is still recorded per asset; no licensed/AI-generated art is committed without review. |
| Loading | `next/dynamic(..., { ssr: false })` for `/world`; world code is its **own chunk** | The dashboard bundle must not grow by one byte. |

New dependencies (POC only, isolated to the world chunk): `three`, `@react-three/fiber`, `@react-three/drei`, `zustand`. Confirm versions and size at install; record the gzipped chunk size in the POC report.

## 2. Performance strategy (budgets are product requirements)
| Budget | Desktop (capable) | Mobile / low tier |
|---|---|---|
| Frame rate | **60 FPS** target, 1% low ≥ 45 | **stable 30 FPS minimum** (never < 24) |
| Draw calls | ≤ 300 | ≤ 120 |
| Triangles in view | ≤ 500 k | ≤ 150 k |
| Textures (GPU) | ≤ 128 MB, atlases ≤ 2048² | ≤ 48 MB, ≤ 1024² |
| Dynamic agents/NPCs on screen | ≤ 14 agents + ≤ 40 ambient (instanced) | ≤ 14 agents + ≤ 12 ambient |
| JS (world chunk, gz) | ≤ 900 KB | same; interiors lazy |
| Time to first interactive frame | ≤ 4 s warm / ≤ 8 s cold | ≤ 8 s / ≤ 14 s |

Techniques: **instancing** (palms, umbrellas, boats, NPCs, props, windows); **frustum culling** (built-in) + **distance LOD** (3 levels for buildings/agents; billboards for far palms); **static batching** of the town shell (merged per material); **one directional light + baked-looking ambient** (single shadow cascade, 1024–2048 map, shadow only near the player; shadows off on low tier); **no real-time reflections** (fake water: animated normal/fresnel shader + cube/sky probe, optional planar only on ultra); **bounded particles** (spray/dust ≤ 500); **animation**: skeletal clips shared across agents (one skinned rig, retargeted), GPU instancing/vertex animation for ambient crowd; **render-on-demand off** (continuous loop) but **adaptive**: drei `PerformanceMonitor` drives DPR (1.0–2.0), shadow, post and ambient-count tiers; **progressive loading**: shell + water + HQ first, districts next, interiors on demand; **interiors are separate lazily loaded scenes** (never in the town graph). A `?perf=1` overlay shows fps/draw calls/triangles/memory so budgets are *measured*, not assumed.

## 3. World-state adapter (strict separation)
```
Supabase ─┐
Northline backend (Repo)         ┐
Durable job system / governor    ├─▶  WorldStateAdapter (server, pure)  ─▶  GET /api/world/state  ─▶  3D client
Agent state (agents, tasks, runs)┘     (derives a WorldSnapshot)            (auth-gated, read-only)
```
- `src/lib/world/adapter.ts` — **pure function** `buildWorldSnapshot(rows, now)`, exactly like `buildCommandCenter` (it can reuse it). No provider calls, no writes, unit-testable with fixtures.
- `GET /api/world/state` — operator-auth gated (same gate as pages), works in `NORTHLINE_READONLY`, returns `{ seq, serverTime, snapshot, etag }`. **Never exposes secrets or the service-role key**; the client talks only to Northline's own API.
- **Transport:** V1 = short polling (3 s visible / 15 s hidden, ETag/304). V2 = server-sent events (`/api/world/stream`) fed by a cheap change cursor (`max(updated_at)` over tasks/jobs/approvals). Supabase Realtime from the browser is **not** used (it would need a client key and RLS policies); revisit only with an explicit security design.
- Snapshot content (all derived, nothing invented):
```ts
interface WorldSnapshot {
  seq: number; serverTime: string;
  system: { status; mode; governor; durableJobs; stage; autonomousGeneration; paused: boolean | "UNKNOWN" };
  agents: AgentEntityState[];            // §4
  productions: ProductionToken[];        // §9 (only in-flight / awaiting approval / failed-needing-attention)
  creators: CreatorEntityState[];        // §10 (static roster + current production counts)
  budget: { imagesToday; limitsRemaining: number | "NOT CONFIGURED" | "UNKNOWN" };
  providers: { id; state }[];
  approvals: { waiting: number };
  alerts: { kind: "failed"|"blocked"|"paused"|"provider"; ref; text; at }[];
}
```
`UNKNOWN` / `NOT CONFIGURED` are first-class values and the world must render them as such (e.g. greyed budget gauge), never as zero.

## 4. Agent entity model
Backend state is authoritative; the world adds only **presentation fields**, and those are never persisted by the client.
```ts
interface AgentEntityState {             // from the adapter
  agentId: AgentCode; name: string; role: string;
  opState: "WORKING" | "WAITING" | "BLOCKED" | "FAILED" | "IDLE" | "PAUSED";   // backend truth
  taskId: string | null; taskKind: string | null; taskTitle: string | null; productionId: string | null; creator: TalentCode | null;
  attempt: number | null; maxAttempts: number | null; startedAt: string | null; blockedReason: string | null; provider: string | null;
  location: BuildingId;                   // WHERE THE WORK IS (derived from taskKind → building map), not where the avatar currently stands
  lastActivityAt: string | null;
}
interface AgentAvatar {                  // client-only presentation
  position; heading; speed; route: NodeId[]; anim: "idle"|"walk"|"run"|"sit"|"work"|"talk"; ambient: AmbientActivity | null;
}
```
- **Truth vs. flavour:** `opState` comes from the backend; `ambient` is cosmetic and only ever assigned when `opState === "IDLE"`. The UI label always reads `opState`: **WORKING** (with task) vs **IDLE · ambient** (explicitly tagged "cosmetic — no work in progress"). An avatar standing at a desk with `opState = IDLE` shows "IDLE", never "working".
- **Roster honesty:** the live registry has 10 agents (Orchestrator, Content Strategist, Creative Director, Prompt Engineer, Caption Writer, Identity QA, Content QA, Production Manager, Performance Agent, Growth Strategist). "Generation Agent", "Technical/Continuity/Creative QA" and "Learning Agent" are today *task kinds or sub-roles* (`technical_qa.attempt`, `continuity_qa.attempt`, image generation inside `production.create`) or do not exist yet (Learning is a foundation library, not an agent). The world shows **one entity per real agent**; sub-roles appear as station indicators inside the owning agent's building; **no avatar is created for an agent that does not exist** (it would imply work that is not happening). Adding agents to the registry later adds avatars automatically.
- Task kind → building map (data, not code): `strategist.*`→Creative Studio, `director.*`→Creative Studio, prompt build→Prompt Studio, `production.create/regenerate`→Production Studio, `identity_qa.*`→Identity Lab, `technical_qa.*`/`continuity_qa.*`/`content_qa.*`→QA Studio, `production.finalize`/approval waits→Approval Villa, `performance.*`/`growth.*`→Analytics, `orchestrator.*`→HQ.

## 5. Navigation / pathfinding
- **Waypoint graph** authored with the town: nodes on roads, sidewalks, boardwalk, beach paths, building entrances (portals), interior nodes (per interior graph); edges carry `cost` and `kind` (road/walk/sand/stairs). Water and buildings are simply absent. A* with a binary heap; paths cached per (from,to); typical path ≤ 40 nodes → microseconds.
- **Path selection believability:** edge cost multipliers (sand ×1.3, road crossing ×1.5, preferred boardwalk ×0.8) + a small deterministic per-agent jitter so two agents rarely take identical lines; smoothing with Catmull-Rom between nodes.
- **Avoidance:** cheap local avoidance (steering separation radius ≈ 0.6 m via a uniform spatial hash); agents *yield and slow* rather than collide; capped to avoid O(n²) (n ≤ 54). Excessive collisions → agent waits ≤ 2 s then re-routes.
- **Interiors:** each interior has its own small graph, linked to the town graph through entrance portals; entering swaps the active graph (interior scenes load lazily).
- **Decoupling:** the navigation layer receives `target = building(location)` and animates there; **it never reports back to the backend and never blocks a job** (§6).

## 6. Visual catch-up (movement is never a dependency)
- Backend work proceeds on its own clock. The client keeps `desiredLocation` per agent from each snapshot and moves the avatar toward it.
- **Lag policy:** if the avatar is more than `T_catchup` (≈ 20 s of walking) behind, it **fast-forwards** (accelerated walk), and if still far, **fades/snap-teleports behind a door or building** — never a visible mid-street pop. A task that starts and finishes within seconds shows a brief visit, not a long trek.
- Several state changes while the world was closed or the tab hidden: **reconstruct the current state only** (place each agent at/near `location`, tokens at their stage); no replay of hours of animation. Historical replay is a separate future feature.

## 7. Animation architecture
- One shared humanoid rig (≈ 1.5–3 k tris, ~15 clips: idle, walk, run, sit, work-typing, talk, gesture, hand-over, look-at-ocean, drink-coffee, wave…). Distinct looks by **material/outfit/hair variants + colour** (instanced where possible), not distinct rigs.
- Animation **state machine** per avatar (idle ↔ walk ↔ run, plus action layers); `AnimationMixer` updates only for avatars within LOD range; far agents use a 2-frame/billboard LOD.
- Handoffs (§9 of the brief): a `HandoffEvent {from, to, token}` from the adapter triggers a scripted, short, skippable clip pair (hand tablet / token travels with the walker). Subtle, premium, ≤ 3 s.
- Ocean: shader-animated (no mesh animation), foam via texture scroll; boats bob via sin on instance matrices.

## 8. Player controller (walk / fly)
- **Frame-rate-independent** movement: velocity integrated with exponential damping (`v += (target − v) * (1 − e^(−k·dt))`), acceleration/deceleration, camera rotation smoothing; fixed max `dt` clamp so a tab stall cannot teleport the player.
- **WALK:** capsule (r 0.35 m, h 1.7 m), ground-snap to a terrain/floor height function, slide along static colliders (circles/AABBs from the town data), step-up ≤ 0.35 m, water edge blocks (shallow wading optional). Shift = run. Third-person default (spring-arm with collision pull-in), first-person toggle.
- **FLY:** 6-DoF-free camera with damping; vertical via Space/Ctrl (or joystick pitch on mobile); ground/building collision where appropriate (soft push, never a hard stop); speed tiers; altitude ceiling to keep the town in view.
- **OVERVIEW:** orbit camera, pitch-limited, zoom to a "command-center overview" preset; click/tap selects anything.
- **FOLLOW:** camera targets an agent's avatar with a damped offset; breaks on any manual input.
- **FOCUS / FAST TRAVEL:** eased camera transition (spline/ease-in-out, 0.8–1.6 s; shortened for `prefers-reduced-motion`) to an agent, creator, building or production. Instant travel only when the user chooses "teleport"; the default is always smooth.
- **Modes are a small state machine** (`WALK | FLY | OVERVIEW | FOLLOW | FOCUS`) with explicit, tested transitions (e.g. FOCUS → previous mode on exit).

## 9. Interaction system
- Interactables register `{id, kind, position, radius, prompt, getPanel()}`. Each frame (throttled to ~10 Hz) the nearest in-range interactable gets the **[ INTERACT ]** prompt (key `E`/`F`, tap on mobile, ray/tap pick in overview).
- Panels (DOM overlay, not 3D UI) are built **from the snapshot only**: Agent (name, role, `opState`, current task, creator, production, time active, attempt n/max, provider, budget status, next step, recent activity), Production token (production, creator, stage, attempt, frames, QA, **cost = usage-based or UNKNOWN**, elapsed, next stage), Building, Creator residence.
- **Supported actions only:** *View task*, *View production*, *View creator*, *View recent work*, *View decision record*, *Open in Command Center* (all deep links to existing pages). Disabled/hidden until real: assign task, pause agent, change priority, request report (Phase 6, routed through the existing server actions, `requireOperator`, read-only mode and the budget governor — the world adds **no new authority**).
- **"Reasoning":** only operator-intended records — recorded agent events, task output summaries, QA findings, decision notes (`agent_events`, `agent_runs.summary`, `qa_results`). Never hidden chain-of-thought; if no rationale was recorded the panel says "no recorded rationale".

## 10. Agent conversations (Phase 6+, APPROVED as direction — no LLM calls in the POC)
- Conversation goes through the **existing agent chat/LLM router**, grounded by a server-built context packet for *that agent* (current task, production, recent events, governor/pause state). The model is instructed to answer only from the packet and to say "I don't know / nothing recorded" otherwise. Answers are labelled with provider/model like the rest of the app.
- Cap architecture (values deferred to Phase 6): configurable **per-conversation, per-agent, per-user daily and global daily caps, a token cap, a dollar cap (only when pricing is configured; otherwise UNKNOWN, never guessed) and the emergency pause**, all as data rows like `budget_limits`. Cost control (locked): conversation has its **own budget/cap** (separate metric in `budget_limits`, e.g. `chat_messages_per_day`, added by a future approved migration — not now) enforced by the **governor** (reserve → audit → release/settle, emergency pause and `NORTHLINE_PAUSE` apply, fail closed). Chat calls are text-LLM calls through the router, never image generation, rate-limited and visible in usage. In read-only mode chat is disabled. A conversation message can never enqueue generation/publishing by itself: proposed actions are presented as normal operator actions requiring the usual authorization/approval, and every action is attributed to the operator, not the model. The sample answer in the brief is only valid if those facts are actually in the packet.

## 11. Jobs, creators, agent-to-agent
- **Production tokens:** one floating card/tablet per *in-flight, awaiting-approval or failed-needing-attention* production (bounded, ≤ 30; the rest are summarised at their building). Position = the building of its current stage; failure/blocked = red beacon at the owning building; awaiting approval = tokens stack in Approval Villa.
- **Handoffs** are driven by backend events (task completed → next task started with a different agent/building); the world animates the token moving, but the token's *logical* stage always equals the backend's.
- **Creators** (Sienna, Alessia, Mila, Vesper, Zoe, Skye): static residences + narrative ambient behaviour on a deterministic schedule (seeded by date). Distinct from agents, never shown as WORKING, and labelled as fictional/ambient. Identity/appearance of creator avatars is **deferred** — it needs a human art/identity decision and must never be derived from or used as canonical references.

## 12. Buildings and interiors
- Town shell buildings are low-poly exteriors with an entrance portal. Interiors are separate lazily loaded scenes (glTF) with a tiny nav graph and **data-bound props** (screens/boards fed from the snapshot).
- Priority interiors and their (real-data) displays: **HQ** (system status, queue, alerts); **Creative Studio** (concepts in planning); **Prompt Studio** (latest prompts — read-only); **Production Studio** (attempts/frames in progress); **Identity Lab** (canonical references via the existing authenticated asset route, current candidate, identity QA, hard locks, failures — *displays only, never edits canon*); **QA Studio**; **Analytics** (shows NOT CONFIGURED until performance data exists); **Memory Library** (learnings: derived proposals / stored states or NOT CONFIGURED); **Approval Villa** (assets awaiting review, deep-linking to the real approval page — approval itself stays on the existing human-gated flow).

## 13. Town layout, scale and asset pipeline
- Districts (each with a purpose): **HQ District** (Orchestrator/Production Manager), **Creative Row** (Strategist, Creative Director, Prompt Engineer, Caption Writer), **Production District** (generation/Production Studio), **Identity Lab + QA**, **Creator Beach & Residential Hills** (the six homes), **Boardwalk** (ambient/cafés), **Marina** (decor + provider-health beacons), **Analytics Pier**, **Wellness District** (ambient/cosmetic).
- **Scale:** the core is ≈ 400 × 300 m; HQ → farthest operational building ≤ ~3 min walking at 3 m/s (run ≈ 6 m/s); everything beyond is scenery. Fly + fast travel cover the rest.
- **Asset pipeline and registry (LOCKED, mixed modular):**
  1. *Sources:* properly licensed modular packs/individual assets (architecture, vegetation, coastal props, furniture, road/path pieces, marina props, generic vehicles, environmental objects, character bases) + procedural geometry + later custom **hero assets** (Northline HQ, Approval Villa, major creator residences, signature production buildings, landmarks). No single giant pack; no ripped game assets or unclear provenance; **"free download" ≠ commercially usable**.
  2. *Registry gate:* before any third-party asset enters the production World, it has a row in `docs/world-assets/registry.json` (validated by a script/CI check; a missing or incomplete row fails CI). Fields: `asset_id, name, source (URL/pack), creator_vendor, license, commercial_use (yes/no/unknown), modification_rights, redistribution_restrictions, attribution_required (+text), original_format, optimized_format, triangles, texture_resolution, lod_available, northline_usage, date_acquired` (+ `license_evidence` = path to the saved licence text/receipt). `commercial_use: unknown` or a licence that forbids repository/deployment redistribution = **not committable**. Third-party binaries live in the repo only when the licence permits it; otherwise they are fetched at build time from private storage and never committed.
  3. *Normalisation into Northline's visual language* (stylised realism stays authoritative): one shared **material library** (re-mapped roughness/metalness, capped texture density in texels/m², unified colour grade/palette), scale and pivot conventions, a single vegetation treatment (wind shader + shared atlas), consistent lighting response (baked AO, one sun), standard LOD set, and **simplified collision** (circles/AABBs — never render meshes). A "cohesion review" screenshot set (same camera, same light) must look like one town before an asset is accepted.
  4. *Optimisation:* LOD, instancing, mesh simplification, texture compression (KTX2/Basis), atlases where appropriate, shared materials, culling, reduced collision. `scripts/world-assets` validates triangles / texture size / material count / draw-call contribution against the §2 budgets.
  5. *Budget rule:* an attractive asset never overrides the budget. If it cannot meet the budget after reasonable optimisation, **replace the asset — the budget is not raised**.
  6. *POC:* greybox procedurally first, then a small, cohesive hand-picked set (≈ 15–30 registered assets) judged on quality, cohesion, performance and licence safety, not quantity.

## 14. Accessibility and fallback
- **No-WebGL / low-power / `?mode=list`**: automatic fallback to a 2D "World Map" (SVG schematic of the same snapshot) and, below that, the existing Command Center list. Both read the *same* snapshot.
- **Keyboard-only**: full navigation with keys + Tab to fast-travel menu and interact prompts; **screen reader**: an `aria-live` log of significant changes ("Creative Director started task …", "approval waiting") and a text alternative of the HUD; **`prefers-reduced-motion`**: no camera easing longer than 200 ms, no ambient crowd, no handoff animation; **colour-blind-safe** status colours + shape/icon redundancy; adjustable motion/sensitivity; audio is **not part of V1** (see Locked Decision 5): nothing depends on it, and any future audio is opt-in with a mute default.
- The world is **never the only way** to reach any operational function.

## 15. Mobile controls and quality tiers
- Left virtual joystick (move), right-side drag (look), context **Interact** button, **Walk/Fly** toggle, object tap, fast-travel sheet, 44 px minimum targets (matches the existing touch-target CSS). Pointer-lock only on desktop; `touch-action: none` on the canvas; safe-area insets honoured.
- **Quality tiers LOW / MEDIUM / HIGH** (initial tier automatic; manual override later): *HIGH* (desktop/Mac: shadows 2048, DPR ≤ 2, bloom, 40 ambient, full water + vegetation); *MEDIUM* (shadows 1024, DPR ≤ 1.5, reduced ambient/vegetation, no bloom); *LOW* (phone: DPR 1–1.25, no or minimal shadows, ~40% vegetation density, no reflections, shorter draw distance and LOD ranges, ≤ 12 ambient, minimal particles, simplified water shader). Every tier keeps all core interactions. Initial tier from `renderer.capabilities`, `navigator.hardwareConcurrency`/`deviceMemory` heuristics, then the runtime `PerformanceMonitor` steps up/down with hysteresis.

## 16. Realtime synchronization and reconnect
- Client keeps `lastSeq`; each poll/stream message carries the *full* snapshot (small, a few KB) so there is **no replay protocol to get wrong**. Missing messages are harmless.
- **Reconnect / reload / other device:** fetch snapshot → place entities by `location`/stage → continue. State is identical on every device because it is derived from the same rows. No client-persisted world state exists (only per-viewer prefs such as quality tier and camera mode in `localStorage`, wrapped in try/catch).
- **Tab hidden:** pause rendering (rAF stops), slow polling; on return, reconstruct current state instead of animating the gap.
- **Failure of the API:** HUD shows `STALE · last updated hh:mm:ss` and freezes agents' *operational* labels (never invents progress); ambient animation may continue but is labelled cosmetic.

## 17. Security / safety constraints (non-negotiable)
Auth gate on `/world` and `/api/world/*`; service-role key stays server-side; read-only mode honoured (world is a view; Phase-6 controls use existing server actions and are blocked there); fixtures never mix with real state (§19); no provider is called by the world; no new write path in Phases 1–5; any future control respects the budget governor, emergency pause, human-approval boundaries and the autonomy flag. The world cannot approve, publish, regenerate or change canonical identity on its own.

## 18. Testing strategy
| Layer | Tests |
|---|---|
| Pure logic (vitest, fast, deterministic) | adapter `buildWorldSnapshot` over fixtures (every opState, UNKNOWN/NOT CONFIGURED passthrough, no invented agents); task-kind→building map; A* on the real layout JSON (every building reachable from HQ, no path crosses a collider/water, all portals connected); steering/avoidance invariants; controller integration (dt-independence: same trajectory at 30/60/144 Hz within tolerance; damping; no tunnelling through colliders); camera-mode state machine; catch-up policy (fast-forward thresholds; no replay of stale history); LOD/quality-tier selection; idle-vs-working label rule (ambient never rendered as WORKING) |
| Contract | `/api/world/state` schema (zod), auth required, works in read-only, no secrets in payload, ETag/304 |
| Browser smoke (Playwright, existing setup) | world boots; canvas present; HUD shows real counts from a seeded **test** repo; interact prompt appears near an agent; fallback appears with WebGL disabled; mobile viewport joystick works; no console errors |
| Performance | scripted camera path in headless Chromium collects frame time, draw calls, triangles, heap; **software GL numbers are only a regression signal, not a 60 FPS proof** — real-GPU measurements on the owner's Mac and a mid-range phone are recorded manually in the POC report |
| Visual regression | fixed-camera screenshots at fixed time-of-day (tolerance-based) for the town, HQ interior, overview |
| Safety | tests that the fixture route is absent/inert in production builds; that the world makes zero provider/LLM calls; that no mutating endpoint is reachable from the world in read-only mode |

## 19. Development phases
0. **Design** — this document. 1. **Prototype** (below). 2. **Real state**: adapter + `/api/world/state`, bind HUD/agents/jobs/budget/approvals/provider health. 3. **Town**: districts, boardwalk, creator homes, nav graph. 4. **Life**: pathfinding for all agents, idle behaviour, handoffs, ambient crowd. 5. **Interiors**: priority interiors lazily loaded. 6. **Operations**: safe controls + grounded conversations via existing server actions. 7. **Polish**: day/night, weather, ocean, vehicles, boats; **audio (deferred, optional, non-architectural)**; creator avatars only after their own design/approval process.
**Dev fixture isolation (Phase 1 rule):** simulated agents/jobs live only in `src/world-dev/fixtures/*` and are reachable only at `/world-dev` (a route that 404s when `NODE_ENV === "production"`), carry a permanent **SIMULATED — NOT REAL STATE** banner, and the production `/world` can neither import them nor fall back to them.

---
# Technical proof-of-concept plan (Phase 1) — updated with locked decisions
**Gate:** starts only after the governor + durable-job reliability phases are complete (0007/0008 applied, flags verified live, Stage 1 proven). **Goal:** prove the *experience* before building the town — answer: *"Does moving around Northline and interacting with an agent feel smooth, premium and genuinely fun?"* **Cost: engineering time only; no provider credits, no LLM calls, no DB writes, no migrations.**

**Scope — one beautiful coastal section, nothing more:** ocean + beach (stylised-realism water shader, foam, sand, a short boardwalk), a handful of instanced palms/coastal plants, **one Northline building** (exterior with a real entrance; interior only a stub), **one operational agent** (role-distinguishable avatar: role colour + glyph + prop), **the operator avatar**, and:
- movement: **walk, run, fly**; **overview** mode; **smooth eased camera transitions** between modes/targets (never an abrupt cut unless "teleport" is chosen); FOLLOW the agent;
- the agent: **pathfinding** on a small waypoint graph, **idle movement** (cosmetic, labelled), a scripted SIMULATED task cycle (idle → walk to building → work → back);
- **walk-up interaction** ([ INTERACT ]) opening a static **agent status panel** built from a fixture snapshot with the real `WorldSnapshot` shape (name, role, `opState`, task, production, time active, attempt, provider, budget status, next step, recent activity);
- **mobile**: left virtual joystick, right camera drag, interact button, walk/fly toggle, object tap;
- **quality tiers LOW / MEDIUM / HIGH** with automatic initial selection and runtime adaptation (manual override not required yet), and **performance instrumentation** (`?perf=1`: fps, 1% low, frame-time graph, draw calls, triangles, texture/geometry memory, tier, DPR);
- **fixture state** only under `/world-dev` (404 in production), permanent **SIMULATED — NOT REAL STATE** banner, never mixed with real state.
**Explicitly out of the POC:** the town, interiors, creator avatars, audio, any LLM/chat call, real operational state, any write/control, vehicles/boats/weather/day-night.

**Work breakdown (≈ 5–7 focused days):**
1. Scaffold `/world-dev` (client-only, dynamic import, prod-404); install `three`/`@react-three/fiber`/`drei`/`zustand`; record chunk size.
2. Coastal-section layout JSON + procedural stylised-realism greybox → art pass (materials, lighting, colour grade, water, instanced vegetation) tuned against the §2 budgets.
3. Player controller (walk/run/fly, damping, collision) + camera modes + eased transitions/FOLLOW.
4. Nav graph + A* + agent steering + animation state machine (idle/walk/work) + role-distinguishable avatar.
5. Interaction system + status panel from the fixture snapshot.
6. Quality tiers + `PerformanceMonitor`, perf overlay, mobile controls, reduced-motion and no-WebGL fallback stub.
7. Tests, Playwright smoke, real-device measurements, POC report.

**Acceptance criteria (go/no-go):**
- *Feel (the primary criterion, judged by the owner):* movement, camera transitions and the walk-up interaction feel smooth, premium and fun; the look reads as "stylised realism", expensive but not heavy.
- Mac/desktop: sustained **≈ 60 FPS** on HIGH (≥ 55 sustained, 1% low ≥ 45) across the section; ≤ 300 draw calls; first frame ≤ 4 s warm.
- Phone: **stable 30 FPS on LOW on iPhone 13-class hardware** (newer devices attempt MEDIUM/HIGH, stepping down on sustained misses); weaker devices degrade automatically, and if still poor, fall back to the 2D World Map / Command Center; all interactions still work on LOW.
- Agent walks only valid routes; avatars are distinguishable by role without relying on colour alone; ambient vs WORKING label rule holds.
- `/world-dev` 404 in production; dashboard bundle unchanged (separate chunk); no network calls beyond static assets; works with no audio and no audio code path.
- **No-go triggers → re-evaluate the stack** (not default to Unity/Unreal): missing the FPS budgets after the §2 optimisations, or a poor feel that tuning cannot fix. The report records numbers either way.

**Deliverables:** POC under `src/world-dev` + pure logic and tests in `src/lib/world`; `docs/design/northline-world-poc-report.md` (measurements on the owner's Mac and a phone, screenshots/video, chunk sizes, go/no-go, revised estimate). **Phase 2+ (real state, the town) only starts after the owner answers the feel question.**

## Decision register (no open blockers for the POC)
| Decision | Status |
|---|---|
| Art style (stylised realism) | LOCKED |
| Quality tiers / FPS targets (desktop 60, iPhone 13-class stable 30 on LOW) | LOCKED |
| Mobile floor | LOCKED |
| Asset strategy (mixed modular + registry) | LOCKED |
| Avatars for POC (operator + role-distinguishable agents) | LOCKED |
| Creator avatars | DEFERRED BY DESIGN (separate proposal when needed) |
| Agent conversations as a direction | APPROVED for Phase 6 (no LLM calls in POC) |
| Conversation cap values | DEFERRED TO PHASE 6 |
| Audio | DEFERRED |
