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
