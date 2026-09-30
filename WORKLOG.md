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
