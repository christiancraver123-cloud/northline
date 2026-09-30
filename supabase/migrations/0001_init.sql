-- Northline core schema. Application tables are camelCase->snake_case mapped by src/lib/db/supabase-store.ts.
-- Server-side access only (service role). RLS is enabled with NO policies => anon/authenticated clients get nothing.

create type content_type as enum ('POST','CAROUSEL','REEL','STORY','CAMPAIGN','COLLAB');
create type production_status as enum ('IDEA','GENERATING','RAW','REVIEW','APPROVED','SCHEDULED','PUBLISHED','REJECTED','ARCHIVED');
create type collab_scope as enum ('SOLO','DUO','GROUP','ALL_SIX');
create type asset_kind as enum ('IMG','REEL','STORY');
create type asset_status as enum ('PENDING','RAW','APPROVED','REJECTED','FAILED');
create type approval_state as enum ('PENDING','APPROVED','REJECTED','REVISION_REQUESTED');
create type workflow_state as enum ('QUEUED','RUNNING','WAITING','FAILED','RETRYING','COMPLETE');
create type reference_slot as enum ('MASTER_FACE','FRONT','THREE_QUARTER','PROFILE','UPPER_BODY','FULL_BODY','NATURAL','CHARACTER_SHEET');
create type record_origin as enum ('demo','live');

-- Canonical talent. Seeded from src/lib/talent/roster.ts (npm run db:seed-sql) — code is the source of truth.
create table talent (
  code text primary key check (code in ('SIE','ALE','MIL','VES','ZOE','SKY')),
  name text not null, first_name text not null, age int not null, role text not null,
  launch_status text not null default 'setup', color text not null,
  markets jsonb not null default '[]', canonical_identity jsonb not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table production_sequences (talent_code text not null references talent(code), year int not null, last_seq int not null default 0, primary key (talent_code, year));
create function next_production_seq(p_code text, p_year int) returns int language sql as $$
  insert into production_sequences (talent_code, year, last_seq) values (p_code, p_year, 1)
  on conflict (talent_code, year) do update set last_seq = production_sequences.last_seq + 1
  returning last_seq;
$$;

-- Common columns on every operational table: id, origin, created_at, updated_at.
create table campaigns (
  id uuid primary key default gen_random_uuid(), origin record_origin not null default 'live',
  name text not null, concept text not null default '', scope collab_scope not null, talent text[] not null,
  status production_status not null default 'IDEA', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table storylines (
  id uuid primary key default gen_random_uuid(), origin record_origin not null default 'live',
  talent text[] not null, title text not null, summary text not null default '', status text not null default 'ACTIVE',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
-- Decision: creators on a production are a text[] (primary first) rather than a join table; GIN-indexed for filtering.
create table productions (
  id uuid primary key default gen_random_uuid(), origin record_origin not null default 'live',
  code text not null unique, talent text[] not null, scope collab_scope not null default 'SOLO',
  content_type content_type not null, platform text not null default 'instagram', concept text not null default '',
  status production_status not null default 'IDEA',
  campaign_id uuid references campaigns(id), storyline_id uuid references storylines(id),
  brief jsonb, qa_notes text[] not null default '{}', cost_usd numeric not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index productions_talent_gin on productions using gin (talent);
create index productions_status on productions (status);

create table prompts (
  id uuid primary key default gen_random_uuid(), origin record_origin not null default 'live',
  production_id uuid not null references productions(id) on delete cascade, provider text not null, version int not null default 1, shot_n int not null,
  positive text not null, negative text not null default '', identity_refs text[] not null default '{}', qa jsonb not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table assets (
  id uuid primary key default gen_random_uuid(), origin record_origin not null default 'live',
  production_id uuid not null references productions(id) on delete cascade, talent text[] not null,
  kind asset_kind not null, seq int not null, status asset_status not null default 'PENDING', approval approval_state not null default 'PENDING',
  provider text not null, prompt_id uuid references prompts(id), storage_path text, filename text not null,
  is_reference boolean not null default false check (is_reference = false), publication text not null default 'UNPUBLISHED',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index assets_production on assets (production_id);
-- Canonical identity references: separate from generated assets, never auto-promoted from generations.
create table reference_assets (
  id uuid primary key default gen_random_uuid(), origin record_origin not null default 'live',
  talent text not null references talent(code), slot reference_slot not null, storage_path text, approved_by text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (talent, slot)
);
create table captions (
  id uuid primary key default gen_random_uuid(), origin record_origin not null default 'live',
  production_id uuid not null references productions(id) on delete cascade, talent text not null, text text not null,
  kind text not null default 'FEED', approval approval_state not null default 'PENDING',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table approvals (
  id uuid primary key default gen_random_uuid(), origin record_origin not null default 'live',
  production_id uuid not null references productions(id) on delete cascade, subject text not null, subject_id text not null,
  state approval_state not null default 'PENDING', decided_by text, decided_at timestamptz, notes text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table workflow_runs (
  id uuid primary key default gen_random_uuid(), origin record_origin not null default 'live',
  workflow text not null, state workflow_state not null default 'QUEUED', production_id uuid references productions(id),
  provider text, started_at timestamptz, finished_at timestamptz, error text, retry_count int not null default 0,
  cost_usd numeric not null default 0, output_asset_ids text[] not null default '{}', input jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table provider_jobs (
  id uuid primary key default gen_random_uuid(), origin record_origin not null default 'live',
  run_id uuid references workflow_runs(id), production_id uuid not null references productions(id) on delete cascade,
  provider text not null, model text, operation text not null, state workflow_state not null default 'QUEUED',
  external_id text, error text, asset_id uuid references assets(id), shot_n int not null default 1,
  cost_usd numeric, credits numeric,  -- null = unknown; never invent pricing
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table calendar_entries (
  id uuid primary key default gen_random_uuid(), origin record_origin not null default 'live',
  production_id uuid not null references productions(id) on delete cascade, talent text not null, platform text not null,
  date date not null, time text not null, state text not null default 'PLANNED',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table launch_states (
  id uuid primary key default gen_random_uuid(), origin record_origin not null default 'live',
  talent text not null unique references talent(code), account_created boolean not null default false, handle text,
  bio_done boolean not null default false, ai_disclosure boolean not null default false, profile_picture boolean not null default false,
  master_face boolean not null default false, references_done boolean not null default false, initial_content boolean not null default false,
  approved boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table analytics (
  id uuid primary key default gen_random_uuid(), origin record_origin not null default 'live',
  production_id uuid not null references productions(id) on delete cascade, source text not null check (source in ('imported','manual','demo')),
  views int, reach int, likes int, comments int, shares int, saves int, profile_visits int, follows int, watch_time_sec numeric, completion_rate numeric,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

do $$ declare t text; begin
  for t in select unnest(array['talent','production_sequences','campaigns','storylines','productions','prompts','assets','reference_assets','captions','approvals','workflow_runs','provider_jobs','calendar_entries','launch_states','analytics'])
  loop execute format('alter table %I enable row level security', t); end loop;
end $$;
