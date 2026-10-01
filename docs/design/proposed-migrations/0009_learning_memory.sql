-- PROPOSED (NOT APPLIED, NOT in supabase/migrations): learning memory storage. Advisory only. Needs operator approval before it is moved to supabase/migrations.
-- ADDITIVE: new tables only. The CHECK on learnings.field mirrors the app allowlist (src/lib/learning/guard.ts); the app guard stays authoritative.
create table learnings (
  id uuid primary key default gen_random_uuid(), origin record_origin not null default 'live',
  scope text not null check (scope in ('creator','global')),
  creator text,
  field text not null check (field in ('camera.treatment','composition','content.format','posting.cadence','caption.hook','caption.style','wardrobe.context','environment','expression.style','content.pillar','carousel.length','reel.duration','thumbnail.approach','story.strategy','prompt.technique','reference.strategy','creative.treatment')),
  statement text not null check (length(trim(statement)) > 0),
  state text not null default 'PROPOSED' check (state in ('PROPOSED','TESTING','SUPPORTED','ACTIVE','RETIRED')),
  confidence text not null default 'LOW' check (confidence in ('LOW','MEDIUM','HIGH')),
  evidence_count int not null default 0 check (evidence_count >= 0),
  contradicted_by int not null default 0 check (contradicted_by >= 0),
  source_reason text,
  approved_by text, approved_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((scope = 'creator') = (creator is not null)),
  check (state <> 'ACTIVE' or approved_by is not null)          -- ACTIVE always carries a named human
);
create table learning_evidence (
  id uuid primary key default gen_random_uuid(), origin record_origin not null default 'live',
  learning_id uuid not null references learnings(id),
  production_id text not null, approval_id text, note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (learning_id, production_id)                            -- one production counts once
);
alter table learnings enable row level security;
alter table learning_evidence enable row level security;
