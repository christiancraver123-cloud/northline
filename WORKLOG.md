# WORKLOG

## 2026-09-30 — Session 1: foundation build (empty repo → working app)
**Discovery**: `northline` repo was empty (no commits). `hotseat` is an unrelated repo and was not modified. Claude Artifact "Roster HQ" (H8Vjhbk3QQ1oFpexoVuTNT) was read and used as the visual/UX reference (dark navy + blue glow, Plus Jakarta Sans/JetBrains Mono, roster cards, approval queue with caption editing, AI-label gate, 90-minute spacing rule, hero-post cap, posting week).
**Built**
- Next.js 16 / React 19 / TS / Tailwind v4 app; 12 nav areas as pages; `/api/n8n/production-orchestrator`, `/api/create`, `/api/health`, asset file route.
- Canonical six-creator roster with identity-critical rules + per-creator QA patterns (`lib/talent/roster.ts`).
- Persistence boundary `Repo` with local file store (demo) and Supabase adapter; migrations `0001_init.sql`, `0002_seed_talent.sql` (generated).
- Orchestrator: NL intent parser, task plan, agents (rule-based v0), production creation with `CODE-YYYY-###` IDs, prompts with canonical identity, identity QA gate, provider jobs, assets, captions, approval queue, targeted asset retry, separate Reel video stage.
- Approval workflow (approve / reject / revision with required reason), launch gating (AI disclosure), calendar slot suggestion, draft-first publishing gate (no publishing adapter).
- Providers: mock (default), OpenAI image adapter (untested — no key), Higgsfield stub, local storage.
**Tests**: `npm test` — 17 unit/integration tests (roster, Vesper eye orientation, identity QA, intent, plan, pipeline, retry, approvals, scheduling) pass. `npm run typecheck` clean. `npm run build` succeeds. Manual e2e with headless Chromium: Create (campaign) → approval blocked → Launch disclosure toggled → Approve → Calendar slot; all 13 routes return 200; webhook returns 401 without secret, 422 on bad payload, 200 with valid payload.
**Decisions**: file store for demo vs Supabase for production, selected by `NORTHLINE_STORE`; `productions.talent` as `text[]`; agents deterministic v0 behind typed signatures; approval blocked until AI disclosure confirmed (carried over from prototype).
**Bug caught by tests**: Vesper's "reversed eyes" QA regex matched the correct phrase "image-left eye emerald green"; fixed with lookbehind.
**Known issues**: Supabase SQL/adapter unverified against a live project; OpenAI adapter unverified; Higgsfield is a stub; no operator login; no reference-image upload; captions are template v0; analytics empty (by design).
**Next**: see TODO.md (auth, apply/verify Supabase, reference uploads, OpenAI live test).

## 2026-09-30 — Session 2: auth, Agent Operations Center, multi-model routing
**Git**: milestone branch `claude/gracious-knuth-kwtmz5` (commit c0c3afe) is the base; no `main` exists on the remote. An attempt to push `main` was blocked by the permission policy (not worked around) — create `main` from that commit yourself or approve it.
**Built**
- Operator auth: HMAC-signed session cookie, `proxy.ts` gate (fail-closed in production), `requireOperator()` in every server action, login/logout, throttling; machine endpoints stay Bearer-only.
- Agent Operations Center (migration 0003): persistent agents/tasks/runs/events/messages/reports/schedules; derived status (WORKING/QUEUED/WAITING/SCHEDULED/IDLE/FAILED/PAUSED); queue worker; `/api/agents/tick` for n8n/cron; event-driven WAITING approval tasks; existing production pipeline now emits agent activity; operator chat (Orchestrator + per-agent) doing real actions (status, reports, QA explanations, prioritise/pause creators, delegation, multi-agent assignments with consolidation, content audit, create); UI: /agents overview + chat, agent workspace (Chat|Activity|Queue|Reports|Settings), /agents/reports inbox, dashboard agent card, sidebar badge.
- Multi-model routing (migration 0004): Gemini + OpenAI text + mock adapters, router with per-agent preference and fallback policy (identity-critical never silent), provider health states, per-run provider/model, `llm_calls` table, concurrency by provider lane, cost only from operator pricing + real usage, provider status in UI.
- Migrations verified against embedded Postgres (PGlite) in tests.
**Tests**: 59 pass (`npm test`), typecheck clean, build OK. Browser e2e (headless Chromium): login gate (redirect/401), bad/good password, orchestrator chat instructions, multi-agent assignment, reports inbox, per-agent activity showing provider/model after routing a report through the (mock) provider.
**Decisions**: status derived not stored; agents deterministic by default with optional LLM narrative layered on top of authoritative facts; provider lanes for concurrency; seeded schedules disabled; single-operator password auth now, Supabase Auth later.
**Bugs caught by tests/e2e**: specialist "report" chat fell through to the Orchestrator; fixed.
**Known issues / not verified**: Gemini & OpenAI adapters only contract-tested with mocked fetch (no keys); `SupabaseRepo` untested against live Supabase; Higgsfield stub; concurrency is in-process (single Node instance; no distributed locking yet — run one tick caller); no reference uploads.
**Next**: see TODO.md.

## 2026-09-30 — Session 3: real production pipeline + canonical reference system
**Base**: continued on `claude/gracious-knuth-kwtmz5` from 2df1af4 (note: the Agent Ops/LLM work is in f5c2b7c + 2df1af4; c0c3afe is the original foundation). Agent Ops + LLM routing preserved; all earlier tests still pass. `hotseat` untouched.
**Built**
- Canonical identity records (`SIE-IDENTITY-v1.0` …), structured hard/soft locks incl. creator-specific rules, immutable persisted snapshots; productions/assets reference the version. QA patterns moved out of roster.ts into identity data.
- Reference library: upload/preview/replace/archive/set-master UI on Talent pages; MASTER > supporting > generated(0); one active master (code + DB index); explicit `promoteGeneratedAsset` only; test proves pipeline+approval create none.
- Pipeline refactor: Generation Brief (persisted, versioned), prompt builder, attempts, provider jobs with explicit states/failure categories/retry lineage, asset lineage (attempt, brief, job, identity version, references used, file facts), QA results table, honest QA states, content QA from history, finalize, revision loop (new attempt, preserved history, feedback → prompt), selected-asset human approval.
- QA as agent tasks (identity/technical/content → finalize). Vision QA via router (schema-validated; Identity QA only with an explicitly chosen provider, no silent fallback). OpenAI image adapter extended (edits with references, failure categories, timeouts); provider UNAVAILABLE instead of silent mock.
- Worker: atomic `repo.claim`, leases + reclaim, idempotency keys (n8n `Idempotency-Key`), concurrency tests. Supabase: migration 0005, `claim` in SupabaseRepo, Supabase Storage adapter (unverified live).
- UI: Talent references + locks, Assets filters (creator, production, status, type, QA, approval, provider, date) + asset lineage page, production attempts/QA/regenerate, approvals with per-asset selection and manual-review warnings.
**Tests**: 98 pass (`npm test`), incl. embedded-Postgres checks of migration 0005 (one-master index, authority check, exclusive claim, unique idempotency, job states). typecheck clean, build OK. Headless-Chromium e2e: upload master+supporting refs (duplicate master rejected), "Create a Sienna Pilates to coffee carousel with 5 images" (5 frames parsed) → production with identity version + attempt, approval blocked → disclosure → approve 4 of 5 → Assets filter + lineage page → calendar; Zoe regenerate → attempts 2 and 3 with history.
**Real vs mocked**: REAL — identity/lock logic, reference storage + validation, brief/prompt/job/attempt/asset persistence, file inspection, content QA, claim/lease/idempotency, SQL (embedded Postgres), UI. MOCKED — all image generation (`mock`/`mock-png`), vision QA inspectors (tests only), Gemini/OpenAI (fetch-mocked contract tests). NOT verified live: OpenAI images, Gemini/OpenAI vision, Supabase (supabase-js/PostgREST/Storage).
**Known gaps**: no live provider verification; no vision QA unless the operator assigns a provider; video not inspected; Reel still path unchanged; single-process claim tested with in-memory repo only (Supabase claim path is the same conditional UPDATE, verified at SQL level only); caption edit UI; reference bulk import.
**Next**: see TODO.md.
