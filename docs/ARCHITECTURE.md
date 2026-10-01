# Northline architecture (what exists today)
_Describes the implementation. Anything planned lives in `docs/design/` and `docs/EXECUTION_PLAN.md` and is labelled as design._

## Shape
One **Next.js 16** app (App Router, server actions, `proxy.ts` auth gate) on Node, talking to **one Supabase project** (Postgres + private Storage bucket `northline-assets`). Providers are called server-side only. No second database. Secrets are server env only (no `NEXT_PUBLIC_*`).

```
Operator (browser) ──login cookie──► Next.js (pages + server actions) ──► Repo (SupabaseRepo | FileRepo for dev)
Webhook / n8n ──Bearer secret──► /api/create · /api/n8n/* · /api/agents/tick            └─► Storage (Supabase | local disk for dev)
                               │
                               ▼
        Orchestrator → agent tasks (atomic claim, leases, idempotency) → pipeline → providers (OpenAI image, Gemini/OpenAI vision+text)
```

## Data model (27 tables + `asset_derivatives`; RLS on every table, no policies — service role only)
- **Identity**: `canonical_identities` (immutable versioned snapshots, e.g. `SIE-IDENTITY-v1.0`), `reference_assets` (MASTER > supporting; one ACTIVE master per creator, enforced by a unique index; generated assets have zero authority).
- **Production**: `productions`, `generation_briefs` (versioned, includes the shared continuity spec), `generation_attempts`, `prompts`, `provider_jobs` (explicit states + failure categories + retry lineage), `assets` (RAW originals with full lineage), `asset_derivatives` (4:5 delivery copies → source asset + sha256), `qa_results` (multiple evaluations, `superseded_by`, `retry` info), `approvals`, `captions`, `calendar_entries`.
- **Operations**: `agents`, `agent_tasks`, `agent_runs`, `agent_events`, `agent_messages`, `agent_reports`, `agent_schedules`, `llm_calls`, `workflow_runs`.
- Records carry `origin` (`demo|live`). Unrelated pre-existing tables are never touched.

## Pipeline (all real, all human-gated at the end)
brief (operator-supplied or rule-based creative direction + shared continuity spec) → prompts (canonical hard locks from the identity, global negatives, 4:5-safe composition; identity gate) → generation (OpenAI image **edits** with canonical references; optional `input_fidelity`) → assets + jobs + lineage → **QA**: Identity (vision, Gemini by default, no silent fallback), Technical, Continuity (whole carousel as a sequence), Content (history rules) → finalize → **human approval** (structured reasons) → calendar. Nothing publishes: there is no publishing adapter.
QA honesty rule: a visual check counts only if a model actually received the image; otherwise `MANUAL_REVIEW_REQUIRED`. QA is retried within bounds (same provider), superseded with full history, and re-runnable without regenerating.

## Agents / workers
Ten logical agents backed by `agent_tasks`. Claims are compare-and-set (`repo.claim`), with leases, reclaim, dependencies, idempotency keys and per-provider lanes. **Today work runs inline in the request/script that enqueued it** (or via `/api/agents/tick`); the durable background model is a plan (`docs/design/durable-jobs.md`).

## LLM routing
Router per agent/task kind with provider preferences; identity-critical kinds never auto-route or silently fall back; errors are classified (`rate_limited`, `quota_exhausted` (never retried), `unavailable`, `auth`, `failed`); provider health is derived from persisted records for the UI.

## Modes and safety
- **Production fails closed** unless `NORTHLINE_STORE=supabase` and Supabase + auth variables are set (`/api/health` → 503 listing variable *names*).
- `NORTHLINE_AUTH_DISABLED` is ignored in production.
- **`NORTHLINE_READONLY=true`**: actions redirect before work, machine endpoints 403, repo and storage refuse writes, pages never persist while rendering. Verified live (0 rows changed).
- Deployment: `render.yaml` (names only), `docs/deploy.md`.

## UI
Dashboard (attention, usage, provider health, agents), Talent (+ creator detail with references/locks), Create, Productions (+ detail with attempts, QA history, retry state, derivatives), Approvals, Launch, Calendar, Assets (+ lineage), Analytics (empty by design until data exists), Agents (+ workspaces, reports inbox), Automations, Settings, Experiments (read-only). Verified at 390 px width.

## Not implemented (do not assume)
Publishing, analytics ingestion, Higgsfield, durable background worker, budget governor, learning memory, Supabase Auth (single shared password today).
