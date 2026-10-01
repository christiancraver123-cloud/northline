# Failure recovery — what happens and what to do
History is never deleted. Every failure leaves a record; recovery adds new records.

| Situation | What Northline does | What you do |
|---|---|---|
| Provider **503 / network** (transient) | Bounded retries (3 tries, 2 s/6 s backoff) against the *same* provider; result keeps `retry` info | Usually nothing. If it stays down the QA result is `MANUAL_REVIEW_REQUIRED` with "re-run QA" advice → **Re-run QA (no regeneration)** later |
| **Rate limit 429** (per minute) | Same bounded retry; honours a short `Retry-After` | Wait and re-run QA |
| **Daily quota / credit exhausted** (Gemini free tier, OpenAI credit) | Classified `quota_exhausted`: **never retried**, long cooldown, dashboard shows QUOTA EXHAUSTED | Enable billing / add credit, or wait for the reset; then re-run QA |
| **Auth error** (key rejected) | Not retried; AUTH ERROR on the dashboard | Fix the key in the host's environment (never in chat/code) |
| **Identity QA unavailable** | Never falls back to another provider when Gemini is configured with no fallback; honest `MANUAL_REVIEW_REQUIRED` | Review by eye, or re-run QA when the provider is back |
| Image **generation fails** | Job `FAILED` with a category; asset `FAILED`; Retry button on that asset creates a linked job | Retry the asset, or regenerate |
| **Request died mid-generation** | Attempt left `GENERATING` with no job (seen live) — kept as evidence | Mark/keep it (it is history) and start a new attempt; the durable-job plan makes this resumable |
| **Attempt unsatisfactory** | Regenerate creates attempt N+1, preserves older attempts/assets, carries feedback | Use Regenerate with notes or new creative direction |
| **Task lease expired** (worker died) | `reclaimExpired` re-queues idempotent tasks (max 3 attempts); `production.create/regenerate` are *not* auto-requeued (would duplicate work) → `FAILED` | Inspect, then re-run deliberately |
| **Schema/code mismatch** (a column or table missing on live) | Inserts fail loudly; nothing is half-saved silently | Check the migration was applied (read-only probe); never re-run an applied migration. Tests now compare record fields with real migrated columns |
| **Foreign-key surprises** (not caught by the in-memory store) | Fails the write | Live read-only verification after any DB-touching change; regression tests for every live-only bug |
| **Read-only host** | All mutations refused (UI, actions, endpoints, repo, storage) | Use the full-mode environment for changes |
| **Misconfigured production** | `/api/health` 503 naming missing variables; app refuses to run on a demo store | Set the named variables in the host |
| **Bad/wrong image delivered to storage** | RAW is never overwritten; derivatives are separate files with lineage | Create a new derivative; never edit RAW |

## Checklists
**Before relying on a migration:** read-only probe for the columns/tables/constraints → apply once by hand → read-only verify → only then ship code that writes them.
**After any live-touching change:** run the app in read-only mode against live data, load the key pages, compare table row counts before/after.
**Spend safety:** nothing generates unless an operator-triggered action runs it; unattended generation is not enabled (governor + durable jobs are designed, not built).

## Governor, pause and durable jobs (added 2026-10-01)
| Situation | What happens | What you do |
|---|---|---|
| Daily cap reached | Provider job FAILED with category `budget_blocked`; **no provider call**; `budget_decisions` row BLOCKED | Wait for the UTC reset, or raise the limit (`update budget_limits set limit_value = N where scope='global' and metric='images_per_day'`) |
| Attempt cap reached (3/frame, 3/production) | Regeneration refused *before* any attempt/brief is created | Raise `attempts_per_*` limit deliberately, or create a new production |
| Emergency pause | Generation tasks stay QUEUED; any in-flight job finishes; new provider calls refused | Dashboard "Resume generation", or unset `NORTHLINE_PAUSE` (the env override wins over the DB flag) |
| Governor state unreadable (flag ON) | Fails **closed**: no generation | Check migration 0007 / Supabase status; set `NORTHLINE_GOVERNOR` off only if you accept uncapped spend |
| Provider returns quota/auth error | Reservation released (non-billable); durable task → BLOCKED with reason | Fix billing/key, then Unblock |
| Timeout / unknown billing | Reservation **kept** (may have billed); audit row SETTLED_UNKNOWN | Reconcile with the provider dashboard if it matters |
| Worker crashed mid-job | Lease expires → task re-queued with backoff (`failure_class=stuck`), bounded by `max_attempts`; generation tasks are **failed, not re-run** | Retry manually after checking nothing was produced |
| Job keeps failing transiently | Exponential backoff via `run_after`, max 3 attempts, then FAILED with history in `agent_runs` | Operator Retry grants a fresh allowance |
