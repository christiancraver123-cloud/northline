# DESIGN — Durable job system (NOT IMPLEMENTED beyond what is listed under "Today")
Goal: Northline keeps working with the browser closed, the laptop asleep, a provider timing out, or a worker restarting — and never corrupts history.

## Today (implemented, verified)
- `agent_tasks` is a persistent queue: atomic claim (`repo.claim` = conditional UPDATE), lease + reclaim, idempotency keys (unique index), dependency ordering, per-run records, event log. Statuses: QUEUED / RUNNING / WAITING / COMPLETE / FAILED (+ PAUSED agents).
- Workers are **in-request**: `submitCreate` / `submitRegenerate` / `rerunQa` run the task family inside the HTTP request or script that enqueued it. `/api/agents/tick` can drain the queue from n8n/cron.
- Provider retries are bounded and classified (transient vs quota/auth); QA results are retry-safe and supersedable.
- **Known weakness (observed live):** a request that dies mid-generation leaves a half-built attempt (an aborted attempt had a prompt + a pending asset and no job). Nothing resumes it automatically.

## Target
1. **Separate concerns.** *Task states*: `QUEUED → RUNNING → (SUCCEEDED | FAILED | RETRY_SCHEDULED | WAITING_EXTERNAL | BLOCKED | PAUSED | CANCELLED)`. *Production lifecycle states* (existing + new): `QUEUED, PLANNING, GENERATING, QA, REGENERATING, CREATIVE_REVIEW, READY_FOR_APPROVAL, APPROVED, SCHEDULED, PUBLISHED, FAILED, PAUSED`. A production's state is derived from its tasks, never from process memory.
2. **Enqueue-and-return.** UI actions and webhooks only enqueue (fast, idempotent) and return; a **persistent worker** (Render background worker, or the web service's tick loop at first) executes. No generation inside an HTTP request.
3. **Heartbeats + resume.** A running task renews its lease; an expired lease is reclaimed. Every pipeline step is *resumable*: a task re-run inspects persisted state (attempt, prompts, assets, jobs) and continues instead of restarting; a provider job in flight is reconciled before a new one is created (no duplicate spend).
4. **Retry policy** (one table, one place): TRANSIENT (timeout, temporary 429, 5xx, network) → bounded retries with backoff, `RETRY_SCHEDULED` with `next_attempt_at`. NON-TRANSIENT (daily quota, billing, auth, malformed request, safety rejection, schema violation, missing canonical data) → no retry; task `BLOCKED` with a machine-readable `blocked_reason` and an operator-visible message; provider health updated.
5. **Poison-job quarantine.** After N failed attempts of the same task, stop and surface it (never hammer).
6. **Observability.** Per task: started_at, completed_at, worker, attempts, error + class, retry eligibility, provider, usage/cost, production, creator. Dashboard answers "what is running / finished / failed / why / what's next".
7. **Pause.** Global and per-creator pause flags checked at claim time (ties into the budget governor's emergency pause).

## Proposed schema (additive; needs operator approval, inspected read-only before applying)
`agent_tasks`: `next_attempt_at timestamptz`, `max_attempts int`, `failure_class text`, `blocked_reason text`, `heartbeat_at timestamptz`, `worker_id text`. Possibly `task_attempts` (one row per execution) for audit. No data is rewritten.

## Test plan
Kill-the-worker mid-task → reclaimed once, no duplicate provider job · quota error → BLOCKED, zero retries · transient error → bounded retries then FAILED · double tick → exactly-once · resume of an aborted attempt · pause stops claims.
