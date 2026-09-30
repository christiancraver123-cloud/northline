# Agent Operations Center

Agents are **persistent workers**, not continuous API calls. They do nothing (and cost nothing) until work arrives via:
1. **Queue** — operator chat/instructions, UI actions, assignments (`agent_tasks`).
2. **Events** — e.g. a production entering REVIEW creates a WAITING `approval.wait` task for the Production Manager; an approval decision resolves it.
3. **Schedules** — `agent_schedules` (cron, UTC). Seeded **disabled**; the operator enables them per agent (Settings tab).

With nothing queued, every agent is IDLE and no model/API call is made (tested).

## Status (derived, never stored)
`PAUSED > WORKING (RUNNING task) > FAILED (latest finished task failed) > QUEUED (eligible queued tasks) > WAITING (WAITING task or blocked/held tasks) > SCHEDULED (enabled schedule) > IDLE`. See `deriveStatus` in `lib/agents/ops/service.ts`.

## Data (migrations 0003, 0004)
`agents` (identity, paused, notes, config incl. model preference + orchestrator priority/held creators) · `agent_tasks` (queue/history) · `agent_runs` (per execution: trigger, **provider, model, used_fallback**, tokens, cost) · `llm_calls` (every model attempt) · `agent_events` (operational activity log — events and tool/task results, never model reasoning) · `agent_messages` (persistent chat threads) · `agent_reports` (inbox; lists the tables read) · `agent_schedules`.

## Running work without the browser (n8n / cron)
`POST /api/agents/tick` with `Authorization: Bearer $NORTHLINE_WEBHOOK_SECRET`: materialises due schedules into tasks and runs eligible queued tasks (concurrently, see below). Idempotent and cheap when idle. n8n: Schedule Trigger (e.g. every 5 min) → HTTP Request to the tick URL. Response: `{ok, scheduledTasksCreated, tasksRun, results[{taskId, agent, status, provider, model}], remainingQueued}`. The UI "Run worker tick" button does the same for the operator.
Nothing runs in the background inside Next.js; if nothing calls the tick, scheduled jobs do not run (and the UI never claims they did).

## Chat
`/agents` hosts the Orchestrator ("Northline") chat; every agent has its own thread (`/agents/<CODE>?tab=chat`). Replies are built from real records; instructions become tasks/config changes: status & failure & approval questions, reports, QA explanations, prioritise/pause/resume creators or agents, delegate ("Have the Creative Director create three concepts for Sienna"), multi-agent assignments (strategist → director → growth/performance, consolidated by the Orchestrator into one report), content audits, and "Create …" which runs the existing production workflow. Specialists stay in role. Deterministic intent routing (v0); an LLM orchestrator can replace it behind the same handlers.

## Multi-model routing (`lib/llm/`)
- Adapters: **Gemini** (`GEMINI_API_KEY`, `GEMINI_MODEL`), **OpenAI text** (`OPENAI_API_KEY`, `OPENAI_TEXT_MODEL`), **mock** (`LLM_ENABLE_MOCK=true`, dev). Keys are server-only, sent in headers, never logged/echoed.
- Per-agent preference (`agents.config.model`: provider `auto|gemini|openai|mock|rules`, optional model, `allowFallback`). `auto` = first configured of gemini → openai for **analysis-type** jobs (strategy, concepts, growth, performance, reports, digests, content audit/QA); `rules` or no configured provider = deterministic, no model call (run shows provider `rules`).
- Models add a clearly-labelled “AI analysis (provider · model)” block to reports; the deterministic facts stay authoritative. If a provider is unavailable/rate-limited, the task still completes with facts only and logs `LLM_UNAVAILABLE`.
- **Fallback policy**: automatic fallback only for analysis jobs. **Identity-critical jobs** (`identity_qa.review`, `prompt.build`, `image.generate`, `production.create`) never auto-route to an LLM and never switch provider unless the agent preference sets `allowFallback: true`. Still-image generation stays on the image provider (OpenAI) — no silent switch.
- Provider states: `configured | unavailable (no creds / 503) | rate_limited (429, cooldown from Retry-After) | failed (cooldown 60s)`. Skipped providers are recorded as SKIPPED attempts.
- Concurrency: the worker runs independent tasks in parallel (`AGENT_CONCURRENCY` default 4; `AGENT_LANE_CONCURRENCY` default 2 per provider; one task per agent at a time). Lanes are provider-based so a rate-limited vendor doesn't stall others.
- Tracking: every run records provider/model/fallback/tokens/cost; every attempt is an `llm_calls` row. **Cost is computed only** from operator-supplied `LLM_PRICING_JSON` plus real reported usage; otherwise `null` ("unknown"). Mock = $0. Never estimated.
- Status: Gemini/OpenAI adapters are contract-tested with mocked `fetch`; they have **not** been run against live APIs (no keys in the build environment).

## Claiming, leases, idempotency (worker safety)
See `docs/pipeline.md` → Worker safety. Summary: atomic `repo.claim` QUEUED→RUNNING (exactly one worker wins, also across processes on Supabase), lease + reclaim of crashed workers (`TASK_LEASE_EXPIRED` events), `idempotency_key` dedupe. Concurrency tests: `src/lib/agents/ops/claim.test.ts`.

## Production QA tasks
`production.create` → (event) `identity_qa.attempt` (Identity QA), `technical_qa.attempt` + `content_qa.production` (Content QA), then `production.finalize` (Production Manager, depends on all three). `production.regenerate` spawns the same family for the new attempt. These appear in each agent's queue/activity like any other task.
