-- 0008: durable jobs, additive (operator-approved rollout, Stage 1 first). Run AFTER 0007 (which adds agent_tasks.blocked_reason).
-- run_after (already exists) is reused as the next-attempt time; claimed_by (already exists) is the worker id; lease_expires_at already exists.
-- No existing row is modified. The new enum value is not used by this script.
alter type task_status add value if not exists 'BLOCKED';
alter table agent_tasks
  add column max_attempts int not null default 3,
  add column failure_class text,        -- transient | quota | auth | budget | invalid | stuck | unknown
  add column heartbeat_at timestamptz;
create index agent_tasks_run_after on agent_tasks (status, run_after);
