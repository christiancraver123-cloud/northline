-- 0007: budget governor (operator-approved 2026-10-01 with LOWER defaults).
-- ADDITIVE ONLY: new tables + one nullable column. No existing row or column is changed. RLS on, no policies (service-role server access only).
-- Apply ONCE via the Supabase SQL Editor (like 0001-0006). Limits live in a table, so they can be changed later WITHOUT another migration.

-- 1) Operator flags. Row 'emergency_pause' = global kill switch for ALL image generation. The env var NORTHLINE_PAUSE=true also forces it and ALWAYS wins.
create table system_flags (
  id uuid primary key default gen_random_uuid(), origin record_origin not null default 'live',
  key text not null unique,
  enabled boolean not null default false,
  reason text, set_by text, set_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
insert into system_flags (key, enabled) values ('emergency_pause', false);

-- 2) Limits (editable data). scope_key = '' for global, creator code for creator scope, provider name for provider scope.
create table budget_limits (
  id uuid primary key default gen_random_uuid(), origin record_origin not null default 'live',
  scope text not null check (scope in ('global','creator','provider')),
  scope_key text not null default '',
  metric text not null check (metric in ('images_per_day','attempts_per_asset','attempts_per_production')),
  limit_value int not null check (limit_value >= 0),
  enabled boolean not null default true,
  note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (scope, scope_key, metric),
  check ((scope = 'global') = (scope_key = ''))
);

-- 3) Windowed counters (images_per_day). window_key = UTC date 'YYYY-MM-DD'; a new day is a NEW row, old rows are kept.
--    Reservation is a compare-and-set on `used` (UPDATE ... WHERE used = <value read>), the same primitive the task queue uses for claims.
create table budget_counters (
  id uuid primary key default gen_random_uuid(), origin record_origin not null default 'live',
  metric text not null, scope text not null, scope_key text not null default '', window_key text not null,
  used int not null default 0 check (used >= 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (metric, scope, scope_key, window_key)
);

-- 4) AUDIT: every budget decision, append-only (rows are never updated or deleted by the application).
create table budget_decisions (
  id uuid primary key default gen_random_uuid(), origin record_origin not null default 'live',
  decision text not null check (decision in ('ALLOWED','BLOCKED','RELEASED','SETTLED_BILLABLE','SETTLED_UNKNOWN')),
  metric text not null, scope text not null, scope_key text not null default '',
  limit_value int, used_before int, requested int not null default 1, used_after int,
  blocked_reason text,
  creator text, provider text, production_id text, job_id text, note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index budget_decisions_created on budget_decisions (created_at desc);
create index budget_decisions_production on budget_decisions (production_id);

-- 5) Why a task is not running (budget pause, quota, auth ...). Shared with the durable-job work.
alter table agent_tasks add column blocked_reason text;

alter table system_flags enable row level security;
alter table budget_limits enable row level security;
alter table budget_counters enable row level security;
alter table budget_decisions enable row level security;

-- 6) OPERATOR-APPROVED INITIAL LIMITS (conservative, early autonomous-production phase). Editable later: UPDATE budget_limits ... (no migration).
insert into budget_limits (scope, scope_key, metric, limit_value, note) values
  ('global',   '',       'images_per_day',          10, 'all creators, all providers, UTC day'),
  ('provider', 'openai', 'images_per_day',          10, 'OpenAI image generation, UTC day'),
  ('creator',  'SIE',    'images_per_day',           6, 'per creator, UTC day'),
  ('creator',  'ALE',    'images_per_day',           6, 'per creator, UTC day'),
  ('creator',  'MIL',    'images_per_day',           6, 'per creator, UTC day'),
  ('creator',  'VES',    'images_per_day',           6, 'per creator, UTC day'),
  ('creator',  'ZOE',    'images_per_day',           6, 'per creator, UTC day'),
  ('creator',  'SKY',    'images_per_day',           6, 'per creator, UTC day'),
  ('global',   '',       'attempts_per_asset',       3, 'generation attempts for one frame of one production (lifetime)'),
  ('global',   '',       'attempts_per_production',  3, 'generation attempts for one production (lifetime)');
