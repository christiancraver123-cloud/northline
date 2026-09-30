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
