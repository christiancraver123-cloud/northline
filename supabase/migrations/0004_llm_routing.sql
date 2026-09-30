-- Multi-model routing: record the actual provider/model per agent run and every model-call attempt.
-- Usage and cost columns are nullable on purpose: null = not reported / no reliable pricing (never fabricated).
alter table agent_runs add column provider text, add column model text, add column used_fallback boolean not null default false;

create table llm_calls (
  id uuid primary key default gen_random_uuid(), origin record_origin not null default 'live',
  run_id text, task_id text, agent_id text not null references agents(code),
  provider text not null, model text not null,
  status text not null check (status in ('COMPLETE','FAILED','RATE_LIMITED','UNAVAILABLE','SKIPPED')),
  error text, started_at timestamptz not null, finished_at timestamptz not null, latency_ms int not null default 0,
  input_tokens int, output_tokens int, total_tokens int, cost_usd numeric, fallback_from text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index llm_calls_run on llm_calls (run_id);
create index llm_calls_provider_time on llm_calls (provider, started_at desc);
alter table llm_calls enable row level security;
