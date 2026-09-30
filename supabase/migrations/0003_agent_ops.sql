-- Agent Operations Center. Agents are persistent workers: identity + queue + history, driven by events/schedules/queues.
-- Agent STATUS is derived at read time from tasks/schedules/config (not stored) so it can never drift.
create type task_status as enum ('QUEUED','RUNNING','WAITING','COMPLETE','FAILED','CANCELLED');

create table agents (
  id uuid primary key default gen_random_uuid(), origin record_origin not null default 'live',
  code text not null unique, name text not null, role text not null,
  paused boolean not null default false, notes text not null default '', config jsonb not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table agent_tasks (
  id uuid primary key default gen_random_uuid(), origin record_origin not null default 'live',
  agent_id text not null references agents(code), kind text not null, title text not null,
  input jsonb not null default '{}', output jsonb, status task_status not null default 'QUEUED',
  priority int not null default 3 check (priority between 1 and 5),
  depends_on text[] not null default '{}', parent_task_id text, assignment_id text, production_id text, talent text,
  created_by text not null default 'operator', waiting_on text, run_after timestamptz,
  started_at timestamptz, finished_at timestamptz, error text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index agent_tasks_queue on agent_tasks (agent_id, status, priority, created_at);
create table agent_runs (
  id uuid primary key default gen_random_uuid(), origin record_origin not null default 'live',
  agent_id text not null references agents(code), task_id text, trigger text not null,
  state workflow_state not null default 'RUNNING', started_at timestamptz not null default now(), finished_at timestamptz,
  error text, summary text not null default '', cost_usd numeric, tokens int,  -- null = no model call / unknown
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
-- Operational activity log (events and tool/task results). Never stores model chain-of-thought.
create table agent_events (
  id uuid primary key default gen_random_uuid(), origin record_origin not null default 'live',
  agent_id text not null references agents(code), task_id text, run_id text,
  level text not null default 'info' check (level in ('info','warn','error')), kind text not null, message text not null, data jsonb not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index agent_events_agent on agent_events (agent_id, created_at desc);
create table agent_messages (
  id uuid primary key default gen_random_uuid(), origin record_origin not null default 'live',
  agent_id text not null references agents(code), role text not null check (role in ('operator','agent','system')), content text not null,
  task_ids text[] not null default '{}', report_ids text[] not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index agent_messages_thread on agent_messages (agent_id, created_at);
create table agent_reports (
  id uuid primary key default gen_random_uuid(), origin record_origin not null default 'live',
  agent_id text not null references agents(code), kind text not null, title text not null, body text not null,
  data jsonb not null default '{}', sources text[] not null default '{}', run_id text, read boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table agent_schedules (
  id uuid primary key default gen_random_uuid(), origin record_origin not null default 'live',
  agent_id text not null references agents(code), name text not null, cron text not null, task_kind text not null,
  task_input jsonb not null default '{}', enabled boolean not null default false, last_run_at timestamptz, next_run_at timestamptz,
  source text not null default 'northline' check (source in ('northline','n8n')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
do $$ declare t text; begin
  for t in select unnest(array['agents','agent_tasks','agent_runs','agent_events','agent_messages','agent_reports','agent_schedules'])
  loop execute format('alter table %I enable row level security', t); end loop;
end $$;
