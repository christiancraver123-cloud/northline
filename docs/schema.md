# Schema notes
Migrations: `supabase/migrations/0001_init.sql` (tables, enums, RLS enabled with no policies — server-side service-role access only) and `0002_seed_talent.sql` (generated from the code roster).
- camelCase records ↔ snake_case columns (mapped in `supabase-store.ts`; JSON columns keep inner keys).
- `productions.talent` is `text[]` (primary creator first, GIN indexed) instead of a join table; revisit if per-creator production metadata is needed.
- `next_production_seq(code, year)` atomically issues production numbers.
- `assets` (generated) and `reference_assets` (canonical identity) are separate; `assets.is_reference` is constrained false.
- `provider_jobs.cost_usd/credits` are nullable: unknown stays unknown.
- Every operational row has `origin` (`demo`|`live`).
- Migrations 0003 (agent ops) and 0004 (LLM routing: `agent_runs.provider/model/used_fallback`, `llm_calls`).
- Migration 0005: `canonical_identities` (immutable versioned snapshots), rebuilt `reference_assets` (types, authority, one-active-master index, source/promotion), `generation_briefs`, `generation_attempts`, `qa_results` (`inspected_image` flag), lineage columns on `assets/prompts/productions`, `provider_jobs.state` → explicit job states + retry/failure columns, `approvals.selected_asset_ids`, task claim/lease/idempotency columns, private storage bucket `northline-assets` (skipped on plain Postgres).
- **Status**: all five migrations are applied and checked in CI against an embedded Postgres (PGlite) — schema, seed, sequence function, constraints, RLS. `supabase-store.ts` (supabase-js/PostgREST) has NOT been exercised against a live Supabase project (no credentials here).
- Migration 0006: `qa_results.kind` adds `CONTINUITY`; `qa_attempt`, `superseded_by`, `retry` columns (history-preserving supersession); new `asset_derivatives` table (RAW → 4:5 delivery lineage). Additive only. **Not applied to live Supabase until the operator runs it in the SQL Editor.**
