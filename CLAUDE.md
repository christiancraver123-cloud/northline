# CLAUDE.md — Northline Media Command Center

Northline is a **virtual talent + digital media studio**: one operator manages six fictional virtual creators.
Flow: request → orchestrator → task plan → agents → production records → provider jobs → assets → QA → **human approval** → calendar → (publishing: not built) → analytics.

## Repo facts
- Project root = this repo root (`northline`). Never run installs from `/home/user`. This is NOT `hotseat` (unrelated repo — do not touch).
- Stack: Next.js 16 (App Router, server actions), React 19, TypeScript, Tailwind v4, zod, supabase-js, vitest. Package manager: **npm**.
- Commands: `npm install` · `npm run dev` · `npm run build` · `npm run typecheck` · `npm test` · `npm run db:seed-sql`.
- Verify before claiming done: `npm run typecheck && npm test && npm run build`.

## Architecture (src/)
- `lib/talent/roster.ts` — **canonical identity source of truth** (six creators, rules, QA patterns, voice). Edit here, then `npm run db:seed-sql > supabase/migrations/0002_seed_talent.sql`.
- `lib/domain/types.ts` — enums (statuses, content types, slots); mirrored by SQL enums in `supabase/migrations/0001_init.sql`.
- `lib/db/` — `Repo` interface (`repo.ts`), `file-store.ts` (local DEMO store in `.data/`), `supabase-store.ts` (production), `records.ts` (shapes), `seed.ts` (demo data). Driver via `NORTHLINE_STORE` (`file` default | `supabase`). Every record has `origin: demo|live`.
- `lib/agents/` — agents as typed deterministic functions (strategist, creative director, prompt engineer, caption writer, content QA) + `identity.ts` (identity block + Identity QA). LLM-backed versions can drop in behind the same signatures.
- `lib/orchestrator/` — `contracts.ts` (zod CreateRequest), `intent.ts` (NL parser), `plan.ts` (task plan), `execute.ts` (pipeline, provider jobs, targeted retry, Reel video stage), `approvals.ts`, `schedule.ts`.
- `lib/providers/` — `ImageProvider`/`VideoProvider`/`StorageProvider` interfaces; adapters: mock (default), openai (stills, untested without a key), higgsfield (**stub**), local storage. Provider-specific code stays in this folder.
- `lib/publishing/gate.ts` — draft-first gate. There is **no publishing adapter**; any future one must call `assertPublishable`.
- `app/` — pages (Dashboard, Talent, Create, Productions, Approvals, Launch, Calendar, Assets, Analytics, Agents, Automations, Settings), `actions.ts` (server actions), `api/` (n8n webhook, create, health, asset file).
- `lib/agents/ops/` — **Agent Operations Center**: `registry.ts` (10 agents), `service.ts` (ensureAgents, enqueue, derived status, controls, schedules, approval waits), `worker.ts` (concurrent queue runner, per-provider lanes), `handlers.ts` (task kinds), `commands.ts` (submitCreate, delegate, createAssignment), `chat.ts` (operator chat), `reports.ts`, `cron.ts`.
- `lib/identity/` — **versioned canonical identity records** (`canonical.ts`: hard/soft locks, provider block; `service.ts`: immutable snapshots). `lib/references/` — canonical reference library + explicit promotion. `lib/pipeline/` — Generation Brief (`brief.ts`), prompts, image jobs + lineage (`generate.ts`), QA stages (`qa.ts`), content QA (`content.ts`), finalize, revision loop (`revise.ts`). `lib/orchestrator/execute.ts` wires them. `lib/media/` — image inspection + dev placeholder PNG. See `docs/pipeline.md`.
- `lib/llm/` — multi-model router: `gemini.ts`, `openai.ts`, `mock.ts`, `router.ts` (preference, fallback policy), `health.ts` (provider states), `pricing.ts`, `status.ts`.
- `lib/auth/`, `proxy.ts` — operator session auth (HMAC cookie); fail-closed in production.
- `docs/n8n.md` (webhook contract), `docs/schema.md`, `docs/agents.md` (agent ops, tick endpoint, LLM routing).

## Canonical creator rules (never violate)
SIE Sienna Veyra · ALE Alessia Varenne · MIL Mila Calloway · VES Vesper Laurent · ZOE Zoe Avell · SKY Skye Halston. Names are canonical; ignore names rendered inside old generated reference sheets.
- Priority: identity > outfit > pose > location > lighting > composition > styling.
- **Sienna**: BOTH eyes matching light green-gray (no heterochromia); gold hoops + thin gold necklace.
- **Alessia**: blunt collarbone bob (never long waves), NO freckles, dark brown eyes, pearl studs + gold signet ring, never hoops, rarely smiles.
- **Mila**: honey-brown balayage (never red), hazel eyes, freckles, petite, always clearly an adult aged 22, never schoolgirl-coded.
- **Vesper**: heterochromia — image-LEFT eye = GREEN, image-RIGHT eye = ICY BLUE-GRAY (anatomically her left eye is blue-gray, right is green). Never reverse. Silver jewelry only. Faint scar through LEFT eyebrow.
- **Zoe**: brown eyes, gold stud in LEFT nostril, layered thin gold necklaces.
- **Skye**: sun-bleached blonde with darker roots, green-hazel eyes, heavy freckles, beauty mark on LEFT cheek, tiny shell necklace, no gold hoops.
- Generated images NEVER become identity references automatically (`reference_assets` is separate from `assets`; `assets.is_reference` is constrained false).
- Creators are fictional virtual personalities; support transparent AI/virtual disclosure. Never build deception/impersonation features.
- Identity facts live ONLY in `identity/canonical.ts` (+ roster.ts data). Productions/assets store the version id (`SIE-IDENTITY-v1.0`), never copies. Bump `IDENTITY_VERSION` when facts change.
- Identity prompt checks run on the POSITIVE prompt only; negatives live in `Prompt.negative`.
- **QA honesty**: never report a visual check unless a capable inspector received the image (`qa_results.inspected_image`). No inspector → `MANUAL_REVIEW_REQUIRED`, never PASS. Identity QA never auto-routes to a model or falls back silently.
- Reference authority: MASTER_FACE > supporting > generated (0). One active master per creator. Generated assets become references ONLY via `promoteGeneratedAsset` (explicit operator action on an approved asset, with a note). Never write `referenceAssets` from the pipeline.
- Never overwrite failed attempts/assets: regeneration = new attempt, old assets `current=false`.
- Image provider: `IMAGE_PROVIDER=openai` without a key is UNAVAILABLE, never a silent mock.
- Task execution must go through `repo.claim` (atomic); don't mutate task status to RUNNING with plain `update`.

## Security rules
- Never commit secrets. `.env.example` has names only; `.env*` is gitignored. Service-role key is server-side only; never import `db/supabase-store.ts` from client components.
- Never log secrets or echo upstream provider bodies. Settings shows set/not-set only.
- Machine endpoints are Bearer-protected via `NORTHLINE_WEBHOOK_SECRET` and fail closed when unset.
- Operator UI is gated by `NORTHLINE_ADMIN_PASSWORD` + `NORTHLINE_SESSION_SECRET` (proxy.ts + `requireOperator()` in every server action). Production without them = locked. `NORTHLINE_AUTH_DISABLED=true` is a local-only escape hatch. Machine endpoints (`/api/n8n/*`, `/api/create`, `/api/agents/tick`) use Bearer `NORTHLINE_WEBHOOK_SECRET` and fail closed.
- LLM keys (`GEMINI_API_KEY`, `OPENAI_API_KEY`) are server-only; adapters send them in headers and never echo upstream bodies.

## Conventions / don't break
- Draft-first: nothing publishes, schedules externally, DMs, follows, comments, or spends money without an approval workflow. Approval only changes internal state.
- Approval is blocked while assets are failed/pending or a creator's virtual/AI disclosure isn't confirmed on Launch.
- Never fabricate analytics/publishing/n8n state; demo data is labelled `DEMO`. Never invent provider pricing (`costUsd`/`credits` null = unknown).
- Stills and video are separate stages (Reel: source still → `submitReelVideo`).
- Production IDs `CODE-YYYY-###` come from `repo.nextProductionSeq`. Filenames are organisational; metadata lives in records.
- The DB is the source of truth; no hardcoded arrays as state. Update `WORKLOG.md` and `TODO.md` at every milestone.
- Don't `pkill -f` patterns that match your own shell command line.

## Agent Ops rules (don't break)
- Agents are persistent workers: work only via queue/event/schedule; idle = no model calls. Never claim background work that no run recorded.
- Status is derived from rows (`deriveStatus`), not stored. Activity log = operational events only (no chain-of-thought).
- Reports must come from real records and list `sources`; empty data is stated plainly.
- Route model calls only through `lib/llm/router.ts`. Identity-critical kinds never fall back silently. Cost = null unless real usage + operator pricing exist.
- Every run records the ACTUAL provider/model (`rules` when no model ran).
- Tests run the migrations against embedded Postgres (PGlite) — keep migrations and `records.ts` in sync (`src/lib/db/migrations.test.ts`).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
