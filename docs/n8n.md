# n8n integration contract

## NL-01 Production Orchestrator (n8n → Northline webhook)
`POST {NORTHLINE_URL}/api/n8n/production-orchestrator` (alias: `/api/create`)
Header: `Authorization: Bearer $NORTHLINE_WEBHOOK_SECRET` (401 if the secret is unset or mismatched).

Request (format/platform case-insensitive; `talent` may be a string or array):
```json
{ "talent": "SIE", "platform": "instagram", "format": "carousel", "concept": "Pilates to coffee run", "asset_count": 6 }
```
Optional: `quantity` (1-10), `campaign_name`. Multiple creators with `COLLAB`/`CAMPAIGN` fan out to per-creator productions plus a shared Reel.

Response `200`:
```json
{ "ok": true, "runId": "uuid", "campaignId": null, "productions": [{ "id": "uuid", "code": "SIE-2026-014", "status": "REVIEW", "qaOk": true }], "failures": [], "approvalRequired": true }
```
`ok:false` + `failures[]` means some steps failed (e.g. a provider error): the production and successful assets persist; failed assets are retried individually in the UI. Other codes: `401` unauthorized · `400` bad JSON · `422` validation (`issues[]`).

## Planned n8n-side sequence
Webhook → Validate → Northline creates Production ID, loads talent/identity/recent content, runs Strategist + Creative Director, saves brief → Return. Later: Prompt Builder → Image Generation → Save Asset → Identity QA → Content QA → Caption → Approval queue.
Today the chain runs inside Northline (`lib/orchestrator/execute.ts`); n8n triggers it. Runs are recorded in `workflow_runs` (QUEUED/RUNNING/WAITING/FAILED/RETRYING/COMPLETE).
No live n8n instance is connected; nothing on the Automations page reflects a real n8n server.

## Worker tick (scheduled/event-driven agent work)
`POST {NORTHLINE_URL}/api/agents/tick` — same Bearer auth. Materialises due agent schedules and runs eligible queued tasks. Use an n8n Schedule Trigger (e.g. every 5 min). See `docs/agents.md`.
Production webhook responses now also include `taskId` (the Production Manager task that ran the workflow).

## Idempotency
Send `Idempotency-Key: <stable id, e.g. n8n execution id>` (or body `idempotency_key`). Re-delivering the same key returns the existing run instead of creating another production (unique index on `agent_tasks.idempotency_key`).
