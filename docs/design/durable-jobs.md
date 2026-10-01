# Durable background jobs — implementation plan (DESIGN; nothing here is implemented or migrated)
Goal: Northline keeps working through browser closure, laptop sleep, web-process restart, worker restart, provider outages and rate limits — **without redesigning the application**: reuse `agent_tasks`, `provider_jobs`, atomic claims and idempotency keys.

## CURRENT STATE (verified in the code)
- **Queue**: `agent_tasks` — statuses `QUEUED / RUNNING / WAITING / COMPLETE / FAILED / CANCELLED`; `depends_on`, `priority`, `run_after`, `claimed_by`, `lease_expires_at`, `attempts`, `idempotency_key` (unique partial index), `error`; every run in `agent_runs`, every step in `agent_events`, every model call in `llm_calls`.
- **Claiming**: `repo.claim` = conditional `UPDATE … WHERE status='QUEUED'` (exactly one winner, verified live). Lease `AGENT_LEASE_SEC` (default 1200 s); `reclaimExpired` re-queues a lost task up to `MAX_TASK_ATTEMPTS=3`, **except** `production.create` / `production.regenerate`, which are marked FAILED because a blind re-run would duplicate work.
- **Where work runs**: *inline, in the request that enqueued it* (`submitCreate`, `submitRegenerate`, `rerunQa` call `processFamily`/`processQueue`), or via `/api/agents/tick` (n8n/cron). A 5-image generation takes ≈5 min inside one request.
- **Observed failure modes**: a request dying mid-generation left a half-built attempt (prompt + pending asset, no job) that nothing resumed; one provider failure triggered a 60 s in-process cooldown that skipped later calls; a daily quota 429 was retried (now classified non-retryable).
- Provider retries and QA retries are bounded and classified; QA is re-runnable without regeneration. Human approval is a separate, never-automatic step.

## TARGET STATE
Web requests and webhooks **only enqueue** (fast, idempotent) and return. A **persistent worker** claims and executes. Every pipeline step is **resumable** from persisted state. Failures are classified; non-retryable ones **block** with a visible reason instead of being retried. A production's lifecycle (QUEUED → PLANNING → GENERATING → QA → REGENERATING → CREATIVE_REVIEW → READY_FOR_APPROVAL → APPROVED → SCHEDULED → PUBLISHED / FAILED / PAUSED) is **derived from its tasks and attempts**, never from process memory. The system stops at READY_FOR_APPROVAL; approval, scheduling and publishing stay human.

| Today (task status) | Target |
|---|---|
| QUEUED, RUNNING, COMPLETE, CANCELLED | unchanged |
| FAILED | split: `FAILED` (gave up) vs `BLOCKED` (non-retryable, needs a human/quota/budget; carries `blocked_reason`) |
| WAITING | unchanged (waiting for approval/dependency) |
| — | `RETRY_SCHEDULED` = QUEUED with `run_after` in the future (no new enum value needed) |

## SCHEMA CHANGES (additive; to be approved and inspected read-only before applying)
```sql
alter table agent_tasks
  add column max_attempts int not null default 3,
  add column failure_class text,        -- transient | quota | auth | budget | invalid | unknown (set when FAILED/BLOCKED)
  add column blocked_reason text,       -- shared with the budget governor migration (0007); add once
  add column heartbeat_at timestamptz;
-- run_after already exists and is reused as next_attempt_at; claimed_by already exists and is the worker id.
-- optional audit table later: task_attempts(task_id, attempt_no, worker, started_at, finished_at, outcome, error, failure_class)
```
No data is rewritten. Task status gets `BLOCKED` via an enum/check extension (inspect the live type first; never assume).

## WORKER MODEL
Phase 1 reuses the existing web service: a guarded `/api/agents/tick` loop (already works with the browser closed). Phase 2 adds a **dedicated Render background worker** running `scripts/worker.ts` (`while(true){ processQueue(...); sleep }`) built from the same repo. Both are safe together because claims are atomic. The review-only host never runs a worker (`NORTHLINE_READONLY` blocks `processQueue` writes by construction).

## CLAIMING
Unchanged: compare-and-set `QUEUED→RUNNING` with `claimed_by`, lease, `attempts+1`. Add: a global/creator **pause check** at claim time (budget governor) and `heartbeat_at` renewal every ≈60 s while running.

## IDEMPOTENCY
- Enqueue: `idempotency_key` (exists) — UI/webhooks derive it from the request so a retried click/webhook never creates a second production.
- Execution: each step first inspects persisted state (attempt, prompts, assets, provider jobs) and **continues** instead of repeating (a prompt that exists is not rebuilt; an asset with a SUCCEEDED job is not regenerated).
- Provider calls: a job in `SUBMITTED/PROCESSING` whose process died has an **unknown outcome** (the provider may have billed). It is never auto-retried: it is reconciled (marked FAILED/`unknown`, budget stays counted) and surfaced for a human decision.

## RETRIES
One classification table: **transient** (timeout, temporary 429, 5xx, network) → bounded retries with backoff by setting `run_after = now + backoff(attempt)` and re-queueing; **non-transient** (daily quota, billing, auth, malformed request, safety rejection, schema violation, missing canonical data, budget) → `BLOCKED` immediately, **zero retries**, provider health updated, inbox report. `max_attempts` per task; after that → FAILED and quarantined (no hammering). Retries re-check the budget governor.

## CRASH RECOVERY
Worker dies → lease expires → `reclaimExpired` re-queues idempotent kinds. For `production.create` / `production.regenerate` (today never auto-requeued) the change is to make them **resumable** (step-checkpointed as above) and then allow requeue; until then they stay FAILED with an explicit "resume" operator action that runs the resumable path. Web-process restart loses nothing: no critical state lives in memory (provider cooldown is an optimisation only; health is derived from records).

## STUCK-JOB RECOVERY
A watchdog in the worker loop finds tasks `RUNNING` with `heartbeat_at`/lease older than a threshold, tasks `QUEUED` past `run_after` for too long, and attempts left `GENERATING` with no live task. It re-queues idempotent work, or marks the rest `BLOCKED(stuck)` and raises an alert. Operators get explicit **Resume** / **Cancel** actions (full-mode host only). Nothing is deleted; every transition is an `agent_events` row.

## PROVIDER QUOTAS
Quota/billing/auth errors → `BLOCKED` with `failure_class`; the provider's derived health (HEALTHY/…/QUOTA_EXHAUSTED/AUTH_ERROR) shows it on the dashboard; the worker skips tasks for a blocked provider lane instead of retrying; they resume when a human fixes it or the quota window resets (health decays to UNKNOWN → one re-probe). No silent fallback to another provider for identity-critical work.

## BUDGET CHECKS
Per `docs/design/budget-governor.md`: pause + caps checked at claim time, before each provider call and at every retry; refusal → `BLOCKED(blocked_reason=budget:…)`, never "improvise around the limit".

## HUMAN APPROVAL BOUNDARIES
Jobs may take a production only up to `READY_FOR_APPROVAL`. Approve/reject/request-revision, calendar scheduling, publishing, canonical-reference promotion and any identity change remain human server actions (`requireOperator`, blocked in read-only). Unattended mode can prepare, never decide.

## OBSERVABILITY
Per task: started/finished, worker, attempts, failure class, blocked reason, retry eligibility/next attempt, provider, usage/cost-unknown, production, creator. Dashboard: running now, finished overnight, failed/blocked and why, provider health, budget status, what happens next (next `run_after`). Everything is derived from records, so it is identical after a restart.

## ROLLOUT PLAN
0. (done) bounded provider/QA retries, supersession, quota classification, derived provider health, read-only host.
1. Approve schema → apply additive columns → verify read-only.
2. Make `production.create`/`regenerate` resumable (tests: kill mid-step, resume without duplicates) — still inline.
3. Enqueue-only actions behind `NORTHLINE_EXECUTION=queue` + tick/worker; inline path stays as fallback.
4. `BLOCKED` + retry scheduling + watchdog + Resume/Cancel actions.
5. Dedicated worker service; schedules/goals (e.g. "maintain a 7-day approved buffer") only after the governor is live.
Each phase ships with tests (crash, double-tick, quota, pause) and a live read-only verification; no phase enables autonomous publishing.
