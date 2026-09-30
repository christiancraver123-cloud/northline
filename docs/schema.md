# Schema notes
Migrations: `supabase/migrations/0001_init.sql` (tables, enums, RLS enabled with no policies — server-side service-role access only) and `0002_seed_talent.sql` (generated from the code roster).
- camelCase records ↔ snake_case columns (mapped in `supabase-store.ts`; JSON columns keep inner keys).
- `productions.talent` is `text[]` (primary creator first, GIN indexed) instead of a join table; revisit if per-creator production metadata is needed.
- `next_production_seq(code, year)` atomically issues production numbers.
- `assets` (generated) and `reference_assets` (canonical identity) are separate; `assets.is_reference` is constrained false.
- `provider_jobs.cost_usd/credits` are nullable: unknown stays unknown.
- Every operational row has `origin` (`demo`|`live`).
- **Status**: SQL is written but NOT yet applied to a live Supabase project, and `supabase-store.ts` has not been exercised against one (no credentials in the build environment).
