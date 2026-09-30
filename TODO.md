# TODO (prioritized)

## Needs YOUR input (credentials / decisions)
- [ ] `NORTHLINE_ADMIN_PASSWORD` + `NORTHLINE_SESSION_SECRET` (long random) — required to use the app in production.
- [ ] Supabase: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; apply `supabase/migrations/0001-0004`; set `NORTHLINE_STORE=supabase`; then run a live smoke test of `SupabaseRepo`.
- [ ] `GEMINI_API_KEY` (+ optional `GEMINI_MODEL`) and `OPENAI_API_KEY` — enable real LLM analysis; optionally `LLM_PRICING_JSON` for cost tracking.
- [ ] `NORTHLINE_WEBHOOK_SECRET` + an n8n Schedule Trigger calling `POST /api/agents/tick`.
- [ ] Create a `main` branch on GitHub (push was blocked by permissions) and choose the default branch.

## P0/P1 — persistence & ops
- [ ] Live-verify `SupabaseRepo` (supabase-js) end to end; add a script `scripts/verify-supabase.ts`.
- [ ] Distributed-safe worker: task claim via `update ... where status='QUEUED'` (optimistic lock) so multiple tick callers can't double-run.
- [ ] Supabase Auth (multi-user, roles) replacing the single shared password.
- [ ] Supabase Storage adapter (StorageProvider) replacing local disk.
- [ ] Reference-asset upload/management UI; feed references into image requests; immutable approved refs.
- [ ] Verify OpenAI image adapter + OpenAI/Gemini text adapters with real keys.
- [ ] Higgsfield adapter (submit/poll); needs credentials + API docs.

## P2 — agents & product
- [ ] LLM-backed Orchestrator intent parsing and agents (strategist, creative director, caption writer) behind existing handler signatures; structured JSON outputs validated with zod.
- [ ] Batch jobs (all six creators in one task) + research-style tasks when a provider supports it.
- [ ] Chat: schedule creation by message ("every Monday…"); agent-to-agent handoff tasks for the production pipeline (currently logged inside one workflow run).
- [ ] Per-agent concurrency/budget limits; daily/weekly model budget enforcement.
- [ ] Caption edit UI in Approvals; per-asset approve/reject.
- [ ] Storylines UI and strategist integration.
- [ ] n8n: exportable workflow JSON for NL-01 + tick; outbound calls from Northline to n8n; retries/backoff.
- [ ] Calendar week grid + drag/drop; hero-post cap check.
- [ ] Analytics: manual entry + importer; Performance/Growth agents on real data.
- [ ] Publishing adapter (only behind `assertPublishable` + explicit approval).

## P3
- [ ] UI polish/responsive pass, pagination, toasts; live-updating chat/activity (SSE) instead of reload.
