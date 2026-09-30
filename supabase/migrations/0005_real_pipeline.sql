-- Real production pipeline: canonical identity versions, reference library, generation briefs/attempts/jobs lineage,
-- QA results, approval selections, and safe task claiming. Nothing here fabricates data: nullable = unknown/not-run.

-- ---- canonical identity (immutable versioned snapshots) ---------------------------------------
create table canonical_identities (
  id uuid primary key default gen_random_uuid(), origin record_origin not null default 'live',
  code text not null references talent(code), version text not null, identity_id text not null unique,
  content_hash text not null, status text not null default 'ACTIVE' check (status in ('ACTIVE','SUPERSEDED')), data jsonb not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (code, version)
);
create unique index canonical_identity_one_active on canonical_identities (code) where status = 'ACTIVE';

-- ---- reference library (replaces the initial placeholder table; it held no data) --------------
drop table reference_assets;
drop type reference_slot;
create type reference_type as enum ('MASTER_FACE','FACE_FRONT','FACE_3Q_LEFT','FACE_3Q_RIGHT','FACE_PROFILE','UPPER_BODY','FULL_BODY','NATURAL_CANDID');
create table reference_assets (
  id uuid primary key default gen_random_uuid(), origin record_origin not null default 'live',
  talent text not null references talent(code), reference_type reference_type not null,
  authority text not null check (authority in ('MASTER','SUPPORTING')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','ARCHIVED')),
  storage_path text not null, filename text not null, mime text not null, bytes int not null, sha256 text not null, notes text not null default '',
  identity_version text not null, created_by text not null default 'operator',
  source text not null default 'upload' check (source in ('upload','promoted_from_generated')),
  source_asset_id text, replaced_by_id text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (authority = case when reference_type = 'MASTER_FACE' then 'MASTER' else 'SUPPORTING' end)
);
-- Exactly one ACTIVE master per creator.
create unique index reference_one_active_master on reference_assets (talent) where reference_type = 'MASTER_FACE' and status = 'ACTIVE';
create index reference_assets_talent on reference_assets (talent, status);
alter table reference_assets enable row level security;
alter table canonical_identities enable row level security;

-- ---- generation briefs / attempts / QA ---------------------------------------------------------
create table generation_briefs (
  id uuid primary key default gen_random_uuid(), origin record_origin not null default 'live',
  production_id uuid not null references productions(id) on delete cascade, version int not null default 1,
  identity_version text not null, reference_ids text[] not null default '{}', data jsonb not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (production_id, version)
);
create table generation_attempts (
  id uuid primary key default gen_random_uuid(), origin record_origin not null default 'live',
  production_id uuid not null references productions(id) on delete cascade, attempt_no int not null,
  brief_id uuid not null references generation_briefs(id), trigger text not null check (trigger in ('initial','regenerate','retry')),
  status text not null default 'GENERATING' check (status in ('GENERATING','QA_PENDING','PASS','REVIEW','HARD_FAIL','MANUAL_REVIEW_REQUIRED','ERROR')),
  shots int[] not null default '{}', parent_attempt_id text, reason text not null default '', feedback text[] not null default '{}', finished_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (production_id, attempt_no)
);
create table qa_results (
  id uuid primary key default gen_random_uuid(), origin record_origin not null default 'live',
  production_id uuid not null references productions(id) on delete cascade, attempt_id text, asset_id text,
  kind text not null check (kind in ('IDENTITY','TECHNICAL','CONTENT')),
  method text not null check (method in ('prompt_rules','file_inspection','vision_model','data_rules','manual')),
  status text not null check (status in ('QA_PENDING','PASS','REVIEW','HARD_FAIL','MANUAL_REVIEW_REQUIRED')),
  inspected_image boolean not null default false, provider text, model text,
  findings jsonb not null default '[]', summary text not null default '', recommendation text, decided_by text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index qa_results_production on qa_results (production_id);
alter table generation_briefs enable row level security;
alter table generation_attempts enable row level security;
alter table qa_results enable row level security;

-- ---- lineage columns on existing tables ---------------------------------------------------------
alter table productions add column identity_version text, add column current_attempt_id text;
alter table prompts add column brief_id text, add column attempt_id text;
alter table assets
  add column attempt_id text, add column attempt_no int not null default 1, add column brief_id text, add column generation_job_id text,
  add column identity_version text, add column reference_ids text[] not null default '{}', add column model text,
  add column qa_status text not null default 'QA_PENDING' check (qa_status in ('QA_PENDING','PASS','REVIEW','HARD_FAIL','MANUAL_REVIEW_REQUIRED')),
  add column current boolean not null default true, add column width int, add column height int, add column bytes int, add column sha256 text;
alter table approvals add column selected_asset_ids text[] not null default '{}';

-- provider_jobs: explicit generation job states (was workflow_state enum)
alter table provider_jobs alter column state drop default;
alter table provider_jobs alter column state type text using (case state::text when 'RUNNING' then 'PROCESSING' when 'COMPLETE' then 'SUCCEEDED' when 'WAITING' then 'QUEUED' else state::text end);
alter table provider_jobs alter column state set default 'QUEUED';
alter table provider_jobs add constraint provider_jobs_state_check check (state in ('QUEUED','SUBMITTED','PROCESSING','SUCCEEDED','FAILED','RETRYING'));
alter table provider_jobs
  add column brief_id text, add column attempt_id text, add column prompt_id text, add column retry_count int not null default 0,
  add column retry_of_job_id text, add column started_at timestamptz, add column finished_at timestamptz,
  add column failure_category text, add column metadata jsonb not null default '{}';

-- ---- safe task claiming / idempotency -----------------------------------------------------------
alter table agent_tasks
  add column claimed_by text, add column lease_expires_at timestamptz, add column attempts int not null default 0, add column idempotency_key text;
create unique index agent_tasks_idempotency on agent_tasks (idempotency_key) where idempotency_key is not null;
-- Claim = conditional update; the row lock makes it exclusive:
--   update agent_tasks set status='RUNNING', claimed_by=$w, lease_expires_at=$t where id=$id and status='QUEUED' returning *;

-- ---- private storage bucket (Supabase only; skipped on plain Postgres) ---------------------------
do $$ begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public) values ('northline-assets', 'northline-assets', false) on conflict (id) do nothing;
  end if;
end $$;
