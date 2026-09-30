# TODO (prioritized)

## Needs YOUR input (credentials / decisions)
- [ ] `NORTHLINE_ADMIN_PASSWORD` + `NORTHLINE_SESSION_SECRET` (long random) — required to use the app in production.
- [ ] Supabase: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; apply `supabase/migrations/0001-0004`; set `NORTHLINE_STORE=supabase`; then run a live smoke test of `SupabaseRepo`.
- [ ] `GEMINI_API_KEY` (+ optional `GEMINI_MODEL`) and `OPENAI_API_KEY` — enable real LLM analysis; optionally `LLM_PRICING_JSON` for cost tracking.
- [ ] `NORTHLINE_WEBHOOK_SECRET` + an n8n Schedule Trigger calling `POST /api/agents/tick`.
- [ ] Create a `main` branch on GitHub (push was blocked by permissions) and choose the default branch.

## BLOCKING the first real Sienna production
- [ ] **OpenAI billing**: image generation returns `insufficient_quota / credit_balance_exhausted` — add credit to the OpenAI account (key itself is valid).
- [ ] **Sienna's real reference files** (MASTER_FACE required; FACE_FRONT, FACE_3Q_LEFT, FACE_3Q_RIGHT, FACE_PROFILE, UPPER_BODY, FULL_BODY, NATURAL_CANDID recommended) — upload on Talent → Sienna.
- [ ] Operator: decide how to open the app (run locally with the same env, or deploy) — the sandbox instance is not reachable from outside.

## Next milestone candidates
- [ ] Run the first REAL Sienna production: upload real master/reference images, set `IMAGE_PROVIDER=openai` + `OPENAI_API_KEY`, assign a vision provider (Gemini/OpenAI) to Identity QA, verify results; tune prompts/locks from real outputs.
- [x] Live Supabase verification done (schema, RLS, repo, claim race, storage) — see WORKLOG Session 4. Still worth: keep a `scripts/verify-supabase.ts` for repeatability.

## P0/P1 — persistence & ops
- [ ] Live-verify `SupabaseRepo` (supabase-js) end to end; add a script `scripts/verify-supabase.ts`.
- [x] Distributed-safe worker claim (done: `repo.claim`, leases, idempotency) — still needs live Supabase verification.
- [ ] Supabase Auth (multi-user, roles) replacing the single shared password.
- [x] Supabase Storage adapter written (unverified live).
- [x] Reference upload/management UI + references sent to image provider (done) — bulk import, per-reference QA/approval workflow TODO.
- [x] Gemini text+vision verified live. [ ] OpenAI image generation still unverified (quota).
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

## QA / pipeline follow-ups
- [ ] Per-asset/per-frame regenerate selection in the UI; attempt comparison view.
- [ ] Video (Reel) QA; Higgsfield adapter.
- [ ] Identity drift handling: version bump workflow (v1.1) + migrating references/productions; admin UI for editing locks.
- [ ] Reference-quality checks (min resolution, face detected) when a vision provider is available.
- [ ] Caption QA and caption edit UI.
