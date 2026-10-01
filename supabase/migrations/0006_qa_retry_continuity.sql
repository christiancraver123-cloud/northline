-- 0006: QA retry/supersession, CONTINUITY QA kind, 4:5 delivery derivatives.
-- ADDITIVE ONLY: no existing row is modified (new columns default), nothing is dropped except the old qa_results.kind CHECK, which is re-created wider.
-- Apply once via the Supabase SQL Editor (same as 0001-0005). RLS stays enabled with no policies (service-role server access only).

alter table qa_results drop constraint if exists qa_results_kind_check;
alter table qa_results add constraint qa_results_kind_check check (kind in ('IDENTITY','TECHNICAL','CONTENT','CONTINUITY'));
alter table qa_results
  add column qa_attempt int not null default 1,   -- nth QA evaluation for the same asset + QA type + layer
  add column superseded_by text,                  -- id of the newer result that replaces this one in the aggregate (history is never deleted)
  add column retry jsonb;                         -- {attempts,maxAttempts,transient,errors[],exhausted,note}: what the retry logic did
create index qa_results_asset on qa_results (asset_id);

-- Derived delivery assets (e.g. 4:5 crops). The RAW provider output stays untouched in `assets`; the derivative links back to it.
create table asset_derivatives (
  id uuid primary key default gen_random_uuid(), origin record_origin not null default 'live',
  production_id uuid not null references productions(id) on delete cascade,
  source_asset_id text not null, kind text not null check (kind in ('DELIVERY_4X5')),
  storage_path text not null, filename text not null, mime text not null default 'image/png',
  width int, height int, bytes int, sha256 text, source_sha256 text,
  derivation jsonb not null default '{}', created_by text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (source_asset_id, kind, source_sha256)
);
create index asset_derivatives_production on asset_derivatives (production_id);
alter table asset_derivatives enable row level security;
