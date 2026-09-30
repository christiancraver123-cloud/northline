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
- `docs/n8n.md` (webhook contract), `docs/schema.md`.

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
- Identity QA checks the POSITIVE prompt only; negatives live in `Prompt.negative`.

## Security rules
- Never commit secrets. `.env.example` has names only; `.env*` is gitignored. Service-role key is server-side only; never import `db/supabase-store.ts` from client components.
- Never log secrets or echo upstream provider bodies. Settings shows set/not-set only.
- Machine endpoints are Bearer-protected via `NORTHLINE_WEBHOOK_SECRET` and fail closed when unset.
- **The operator UI itself has no login yet** (TODO P0 before any public deploy). Server actions are unauthenticated.

## Conventions / don't break
- Draft-first: nothing publishes, schedules externally, DMs, follows, comments, or spends money without an approval workflow. Approval only changes internal state.
- Approval is blocked while assets are failed/pending or a creator's virtual/AI disclosure isn't confirmed on Launch.
- Never fabricate analytics/publishing/n8n state; demo data is labelled `DEMO`. Never invent provider pricing (`costUsd`/`credits` null = unknown).
- Stills and video are separate stages (Reel: source still → `submitReelVideo`).
- Production IDs `CODE-YYYY-###` come from `repo.nextProductionSeq`. Filenames are organisational; metadata lives in records.
- The DB is the source of truth; no hardcoded arrays as state. Update `WORKLOG.md` and `TODO.md` at every milestone.
- Don't `pkill -f` patterns that match your own shell command line.
