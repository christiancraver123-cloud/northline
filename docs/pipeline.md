# Production pipeline & canonical identity

## Canonical identity (`lib/identity/`)
One versioned, structured record per creator: `SIE-IDENTITY-v1.0` … `SKY-IDENTITY-v1.0` (`buildCanonicalIdentity`, source data: `talent/roster.ts` + the lock definitions in `identity/canonical.ts`).
Categories: core identity · **hard locks** (violation = HARD_FAIL) · **soft locks** (violation = REVIEW) · creative variables (never a rejection reason) · negative constraints · visual language · personality/voice · content universe · QA rules · provider generation block (compact) · reference hierarchy.
Hard locks carry both a prompt rule (required/forbidden patterns) and a `visualCheck` instruction for whoever inspects the image. Creator-specific rules live here only — Vesper's eye orientation (image-left = green, image-right = icy blue-gray), Zoe's LEFT-nostril gold stud and brown eyes, Skye's LEFT-cheek beauty mark, Sienna's matching light green-gray eyes (no heterochromia), etc.
Snapshots are persisted (`canonical_identities`, immutable per version, content-hashed). **Productions, briefs, prompts and assets store only the identity id** (`production.identity_version = "SIE-IDENTITY-v1.0"`), never a copy of the facts. Changing any fact requires bumping `IDENTITY_VERSION`; unbumped changes surface as `IDENTITY_DRIFT` and the stored snapshot keeps being used.

## Reference library (`lib/references/`, Talent page)
Types: MASTER_FACE, FACE_FRONT, FACE_3Q_LEFT, FACE_3Q_RIGHT, FACE_PROFILE, UPPER_BODY, FULL_BODY, NATURAL_CANDID. Authority: MASTER (rank 100) > SUPPORTING (80) > generated (0). Exactly one ACTIVE master per creator (enforced in code and by a partial unique index). Upload validates real image bytes (PNG/JPEG/WebP, ≤10MB), stores the file, records sha256 + identity version + notes. Actions: upload, replace (archives the old), archive, set as master (old master demoted to a supporting FACE_FRONT).
**A generated asset never becomes a reference automatically.** The only path is `promoteGeneratedAsset` (asset page): operator name + written reason + an APPROVED asset that has a real file → a new reference with `source = promoted_from_generated`. Tests cover the full pipeline + approval creating zero references.

## Pipeline (stages and where state is persisted)
1. Request → plan → `production` (status GENERATING, `identity_version`).
2. Load canonical identity, active references, recent content history.
3. Strategist + Creative Director → **Generation Brief** (`generation_briefs`, versioned, immutable: production, creator, identity version, references, concept, location, time, visual direction, continuity, recent-content considerations, negatives, provider requirements, shots, revision feedback).
4. Prompt builder (compact identity block + reference instruction + scene + negatives + technical requirements; identity first). Prompt-level identity check: HARD finding blocks generation (production IDEA), soft findings become REVIEW notes.
5. `generation_attempts` row (ATTEMPT-01 …) then one **provider job** per shot: QUEUED → SUBMITTED → PROCESSING → SUCCEEDED | FAILED (RETRYING on manual retry: new job with `retry_of_job_id`, `retry_count+1`). Failures carry a category (provider_unavailable, rate_limited, auth, invalid_request, content_policy, timeout, unknown). A production existing ≠ an image existing: missing images keep the production RAW.
6. Assets with full lineage: production, attempt, brief, prompt, generation job, provider/model, identity version, references actually sent, file dims/bytes/sha256, QA status, approval, `current` flag (older attempts kept, `current=false`).
7. QA (agent tasks: Identity QA → `identity_qa.attempt`, Technical QA → `technical_qa.attempt`, Content QA → `content_qa.production`; then Production Manager `production.finalize` depends on all three).
8. Finalize → HARD_FAIL: production RAW, no approval, alert report · otherwise production REVIEW + pending approval (+ WAITING task).
9. Human approval: APPROVE (operator-selected assets only), REJECT, REQUEST REVISION (reason required). Only APPROVED assets are calendar/launch eligible. Approving never publishes.

## QA states (`QaStatus`)
`PASS`, `REVIEW`, `HARD_FAIL`, `MANUAL_REVIEW_REQUIRED`, `QA_PENDING`. Aggregation: HARD_FAIL > MANUAL_REVIEW_REQUIRED > REVIEW > PASS.
**Honesty rule:** a visual check counts as done only if a capable inspector actually received the image (`qa_results.inspected_image = true`). Otherwise the result is MANUAL_REVIEW_REQUIRED — a human must look; PASS is never fabricated. What is real today: prompt conformance (deterministic), file inspection (format/dimensions/integrity — structure, not content), content QA from production history. Visual identity/technical checks need a vision-capable provider: Identity QA only uses one the operator **explicitly** selected for the Identity QA agent (never auto, no silent fallback); Technical QA may auto-route to a configured Gemini/OpenAI model. Vision output is schema-validated; unusable output → manual review.
Content QA (real data): e.g. `REVIEW — third rooftop production among Sienna's previous 5 productions; keep the asset but schedule it later…`.

## Revision loop
`regenerateProduction` (UI: Regenerate; agent task `production.regenerate`): new attempt N+1 inside the same production, new brief version carrying QA feedback, default = only hard-failed/failed shots (else all). Positive prompt restates the violated locks' rules; raw findings/operator notes go in the negative block. Previous attempts/assets/briefs are preserved. Not allowed after approval.

## Providers
Still images: OpenAI (`gpt-image-1`; generations, or `images/edits` with canonical reference images). `IMAGE_PROVIDER=openai` without a key = **UNAVAILABLE** (jobs fail with `provider_unavailable`; never a silent mock). `mock` (no bytes) and `mock-png` (real placeholder PNG, dev) need no credentials. Keys are server-only, sent in headers, never logged; errors carry status/category only.
Model routing for analytical work is unchanged (`docs/agents.md`); identity-critical kinds never auto-route or silently fall back.

## Worker safety
Tasks are claimed with an atomic compare-and-set (`repo.claim`: `UPDATE … WHERE id=? AND status='QUEUED'`), so two workers/ticks can never both run a task. Leases (`AGENT_LEASE_SEC`, default 1200s) let crashed workers' tasks be re-queued (max 3 attempts); `production.create/regenerate` are never auto-re-run (would duplicate work) and fail for manual retry. `idempotency_key` (body `idempotency_key` or `Idempotency-Key` header on the n8n webhook; unique index) makes retried requests return the existing task.
