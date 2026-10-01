# Budget governor — implementation plan (DESIGN; the library is built and tested in isolation, nothing is wired or migrated)
Unattended generation must not be able to spend without limit. When any limit is hit: **PAUSE and surface it. Never improvise around a limit.**

## What exists now
- `src/lib/governor/` — pure rules + atomic reservation protocol + in-memory store, **not imported by the pipeline**. 17 tests, including the protocol on **real (embedded) Postgres**: 40 concurrent workers against caps 10 global / 7 creator grant exactly 7 with no residue.
- `docs/design/proposed-migrations/0007_budget_governor.sql` — the exact proposed schema (kept OUT of `supabase/migrations/`; a test asserts that). **Not applied to live Supabase.**

## Principles
- Usage is stored separately from price. Every limit below is a **count**, so it is enforceable today without a pricing table. Dollar limits are a later add-on that needs `LLM_PRICING_JSON`.
- Checked **before** the provider call (reserve), not after; at every retry; for human-triggered work too (a human raises a limit explicitly, the system never does).
- **Fail closed**: if the governor's state cannot be read, generation is refused.
- The env override `NORTHLINE_PAUSE=true` always wins and cannot be lifted from the database.

## Limits (proposed defaults — operator to confirm the numbers)
| Metric | Scope | Window | Default | Source of the count |
|---|---|---|---|---|
| `images_per_day` | global | UTC day | 25 | `budget_counters` (atomic CAS) |
| `images_per_day` | provider `openai` | UTC day | 25 | `budget_counters` |
| `images_per_day` | each creator | UTC day | 15 | `budget_counters` |
| `attempts_per_asset` | global | lifetime | 4 | `assets` rows per production + shot |
| `attempts_per_production` | global | lifetime | 5 | `generation_attempts` rows (unique `(production_id, attempt_no)` already prevents a concurrent duplicate) |
| Emergency pause | global | until cleared | OFF | `system_flags('emergency_pause')` + env override |
Deferred (need more design): QA-call caps, video-credit caps (Higgsfield not connected), dollar caps, stop-on-N-consecutive-failures lane pause.

## Exact schema (see the SQL file)
`system_flags(key pk, enabled, reason, set_by, set_at)` · `budget_limits(scope, scope_key, metric, limit_value, enabled, note; unique(scope,scope_key,metric); global ⇔ empty key)` · `budget_counters(metric, scope, scope_key, window_key, used ≥ 0; unique per window)` · `agent_tasks.blocked_reason text` (nullable). RLS on, no policies. Seeds: the 10 default limit rows; pause row OFF. Additive: no existing row or column changes.

## Reset / window semantics
`window_key` = UTC date. A new day is a **new row** (old rows kept for audit); nothing is deleted or reset in place. Status shows `resetsAt` = next UTC midnight. Attempt caps are lifetime (no window); raising a cap is an explicit operator action recorded in `budget_limits.updated_at`/note.

## Mapping to code (the wiring, to be done only after approval + migration)
| Where | Change |
|---|---|
| `src/lib/pipeline/generate.ts` `runImageJob` | after inserting the QUEUED job and **before** `deps.image.generate`: `reserveImage(store, {creator, provider})`. If refused → job `FAILED` with `failureCategory='budget_blocked'`, `error=decision.reason`, no provider call. After a failure → `if (shouldRelease(category)) releaseImage(...)`. |
| `src/lib/pipeline/revise.ts` `regenerateProduction`, `execute.ts` `produce` | before creating an attempt: `checkAttempts(limits, {attemptsForAsset, attemptsForProduction})`; refusal → no attempt row is created, task `BLOCKED` with `blocked_reason`. |
| `src/lib/agents/ops/worker.ts` `processQueue` | `checkPause` once per loop: when paused, claim nothing (tasks stay QUEUED); `/api/agents/tick` reports `paused:true`. |
| `src/lib/providers/types.ts` | extend `FailureCategory` with `budget_blocked` (no DB check on that column). |
| `src/lib/db/records.ts` | add `systemFlags/budgetLimits/budgetCounters` to `Tables` + `TABLE_NAMES` **only in the same change that applies the migration** (the migration test requires every table to exist). Add a record↔column drift test, as for 0006. |
| `src/lib/governor/supabase-store.ts` (new) | `GovernorStore` over `Repo`: counters via `repo.claim(table,id,{used},{used+1})` (same CAS as task claims). |
| UI | Dashboard card "Spend & safety" (pause state, each limit with used/remaining/reset, last block reason); Settings: pause toggle + limit editor as operator server actions (blocked in `NORTHLINE_READONLY`, like every mutation); production page shows a budget-blocked attempt like any other failed attempt (never hidden). |
| Observability | blocked attempts/jobs appear in the activity log, the inbox ("Budget limit reached: …"), and the dashboard "Needs attention". |

## Behaviour when a limit is reached
Refuse (no provider call, no charge) → record the reason (`budget_blocked`, policy, used/limit, reset time) → surface it → **stop**. Nothing retries around it; no other provider is substituted; no limit is raised automatically. A human can raise the limit, clear the pause, or wait for the reset.

## Test plan (beyond the 17 existing)
Wiring tests with the file store: a refused reservation makes **zero** provider calls and a visible `budget_blocked` job · release on quota/auth/5xx but not on timeout · pause stops `processQueue` claims and leaves tasks QUEUED · attempt cap blocks `regenerateProduction` without creating an attempt · env pause beats DB flag · governor read failure fails closed · read-only mode cannot change pause/limits.

## Rollout
1. Operator approves the SQL + defaults. 2. Inspect the live schema read-only (no `system_flags` yet). 3. Operator applies 0007 in the SQL Editor; I verify columns/constraints/defaults/RLS read-only. 4. Wire behind `NORTHLINE_GOVERNOR=on` (default off) with the full test plan; verify live read-only. 5. Turn on for the full-mode host only after the first verification; review-only hosts never need it.
