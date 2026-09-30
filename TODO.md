# TODO (prioritized)

## P0 — before any public deploy
- [ ] Operator authentication (Supabase Auth or basic auth) for UI pages and server actions.
- [ ] Apply migrations to a real Supabase project and verify `SupabaseRepo` end-to-end (needs `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). Add an integration test/script.

## P1 — core gaps
- [ ] Reference-asset upload + management UI (MASTER_FACE … CHARACTER_SHEET); feed reference paths into image requests; immutable approved refs.
- [ ] Supabase Storage adapter (StorageProvider) replacing local disk.
- [ ] Verify OpenAI image adapter with a real key (`IMAGE_PROVIDER=openai`); pass reference images; record real cost where available.
- [ ] Higgsfield adapter (`lib/providers/higgsfield.ts`): submit/poll, source still upload; needs credentials + API docs.
- [ ] Caption edit UI in Approvals; per-asset approve/reject.
- [ ] Storylines: create/attach UI; feed into strategist (table + type exist, unused).

## P2
- [ ] LLM-backed agents (strategist, creative director, caption writer) behind existing signatures; LLM orchestrator for ambiguous requests.
- [ ] n8n: exportable workflow JSON for NL-01, outbound calls from Northline to n8n, async/WAITING runs, retries with backoff.
- [ ] Calendar: week grid, filters, drag/drop rescheduling; hero-post cap (1 in 5) check.
- [ ] Analytics: manual entry + importer; Performance/Growth agents (never fabricate).
- [ ] Cost tracking UI + budgets (daily/weekly/per-creator/campaign).
- [ ] Campaign detail page; production list filters by campaign from campaign view.
- [ ] Publishing adapter (only behind `assertPublishable` + explicit approval).

## P3
- [ ] UI polish/responsive pass; toast feedback; pagination for large lists.
- [ ] Hero-image reference tiles from uploaded refs on Talent page.
