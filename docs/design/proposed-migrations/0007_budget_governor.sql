-- PROPOSED (NOT APPLIED, NOT in supabase/migrations/): budget governor, smallest useful slice.
-- Additive only. No existing row is changed. RLS on, no policies (service-role server access only), like every other Northline table.
-- Verified in isolation against embedded Postgres by src/lib/governor/governor.test.ts. Apply once, via the Supabase SQL Editor, only after operator approval.

-- 1) Operator flags. Row 'emergency_pause' = global kill switch for ALL image generation (the env var NORTHLINE_PAUSE=true also forces it and wins).
create table system_flags (
  key text primary key,
  enabled boolean not null default false,
  reason text, set_by text, set_at timestamptz,
  updated_at timestamptz not null default now()
);
insert into system_flags (key, enabled) values ('emergency_pause', false);

-- 2) Limits. scope_key = '' for global, creator code for creator scope, provider name for provider scope.
create table budget_limits (
  id uuid primary key default gen_random_uuid(),
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

-- 3) Counters for the windowed metric (images_per_day). window_key = UTC date 'YYYY-MM-DD'. Old windows are kept (audit); a new day simply starts a new row.
--    Reservation is a compare-and-set on `used` (UPDATE ... WHERE used = <expected>), the same primitive the task queue uses for claims.
create table budget_counters (
  id uuid primary key default gen_random_uuid(),
  metric text not null,
  scope text not null,
  scope_key text not null default '',
  window_key text not null,
  used int not null default 0 check (used >= 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (metric, scope, scope_key, window_key)
);

-- 4) Why a task is not running (budget pause, quota, auth ...). Reused later by the durable-job work.
alter table agent_tasks add column blocked_reason text;

alter table system_flags enable row level security;
alter table budget_limits enable row level security;
alter table budget_counters enable row level security;

-- 5) PROPOSED DEFAULTS (operator to confirm the numbers; attempts_* are lifetime caps derived from existing rows, images_per_day is windowed).
insert into budget_limits (scope, scope_key, metric, limit_value, note) values
  ('global',   '',       'images_per_day',          25, 'all creators, all providers, UTC day'),
  ('provider', 'openai', 'images_per_day',          25, 'OpenAI image generation, UTC day'),
  ('creator',  'SIE',    'images_per_day',          15, 'per creator, UTC day'),
  ('creator',  'ALE',    'images_per_day',          15, 'per creator, UTC day'),
  ('creator',  'MIL',    'images_per_day',          15, 'per creator, UTC day'),
  ('creator',  'VES',    'images_per_day',          15, 'per creator, UTC day'),
  ('creator',  'ZOE',    'images_per_day',          15, 'per creator, UTC day'),
  ('creator',  'SKY',    'images_per_day',          15, 'per creator, UTC day'),
  ('global',   '',       'attempts_per_asset',       4, 'generation attempts for one frame of one production (lifetime)'),
  ('global',   '',       'attempts_per_production',  5, 'generation attempts for one production (lifetime)');
