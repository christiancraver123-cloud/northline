-- 0009: publishing records + per-post insights. ADDITIVE ONLY. NOT applied to production automatically: the operator runs it
-- in the Supabase SQL editor after review (see docs/command-center.md). Until it is applied, the Command Center shows
-- publishing/insights as "NOT MIGRATED" and every publish action is refused.
-- Live Instagram publishing does not exist yet: rows written today come from the MOCK_INSTAGRAM provider and say so.
create table publications (
  id uuid primary key default gen_random_uuid(), origin record_origin not null default 'live',
  talent text not null references talent(code),
  production_id uuid not null references productions(id) on delete cascade,
  asset_id uuid not null references assets(id) on delete cascade,
  provider text not null check (provider in ('MOCK_INSTAGRAM','META_INSTAGRAM')),
  status text not null default 'QUEUED' check (status in ('QUEUED','PUBLISHING','PUBLISHED','FAILED')),
  provider_post_id text, permalink text, caption text not null default '',
  error text, retryable boolean not null default false,
  attempts int not null default 0 check (attempts >= 0), max_attempts int not null default 3 check (max_attempts between 1 and 10),
  requested_by text not null, confirmed_at timestamptz not null, published_at timestamptz, job_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
-- One successful publication per asset: a second PUBLISHED row for the same asset is refused by the database.
create unique index publications_one_published_per_asset on publications (asset_id) where status = 'PUBLISHED';
create index publications_talent on publications (talent, published_at desc);
alter table publications enable row level security;

-- Insights snapshots attach to a publication. 'mock' rows come from the mock provider and are never treated as real performance data.
alter table analytics
  add column publication_id uuid references publications(id) on delete cascade,
  add column talent text references talent(code);
alter table analytics drop constraint if exists analytics_source_check;
alter table analytics add constraint analytics_source_check check (source in ('imported','manual','demo','mock'));
create index analytics_publication on analytics (publication_id, created_at desc);

-- Rollback (manual, in this order):
--   drop index analytics_publication;
--   alter table analytics drop column publication_id, drop column talent;
--   alter table analytics drop constraint analytics_source_check;
--   alter table analytics add constraint analytics_source_check check (source in ('imported','manual','demo'));
--   drop table publications;
