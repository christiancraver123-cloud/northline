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

## QA retry, supersession and re-run (migration 0006)
- **Bounded retry**: Gemini's adapter retries 429/500/503 inline (short backoff, honours a short `Retry-After`). On top of that every vision QA call (Identity, Technical, Continuity) goes through `visionWithRetry`: up to 3 attempts, 2s/6s backoff (a longer provider `Retry-After` is honoured up to 20s). Retries use the router's `probe` mode so they are not blocked by the provider's own failure cooldown (that cooldown is what previously turned one 503 into four `SKIPPED` calls). Non-transient errors (auth, unusable output) are never retried. Once one asset exhausts its retries in a run, the rest of that run get one attempt each.
- **No silent fallback**: retries go to the SAME provider the router chose. With `IDENTITY_QA` set to `gemini` + `allowFallback:false` (and `continuity_qa.attempt` is identity-critical too) OpenAI is never called.
- **Retry state is persisted** on each QA result (`retry`: attempts, max, errors, exhausted, note) and shown on the Asset and Production pages.
- **Supersession**: every QA evaluation is kept (`qa_attempt`, never deleted). A newer evaluation of the same asset + QA type + layer (prompt / file / visual / data) sets `superseded_by` on the older one; the aggregate (`aggregateQa`) only counts active (non-superseded) results. An *unavailable* (`manual`) retry never replaces an earlier *conclusive* result — it is stored as history only.
- **Re-run without regenerating**: Production page / Asset page → "Re-run QA (no regeneration)" → `rerunQa()` enqueues the normal QA agent tasks (+ finalize) for the chosen assets/kinds. It never calls the image provider and never modifies assets.

## Continuity QA
Multi-frame productions (>= 2 frames) get a `CONTINUITY` QA result evaluated over the whole sequence: (1) deterministic `prompt_rules` check that every frame prompt inherited the shared continuity spec; (2) one vision request containing ALL frames in order (downscaled QA copies) checking same person, outfit, jewelry, hair, time of day, lighting progression, location progression, recurring props, unwanted text/signage and story coherence. Clear violations of same person / outfit / time of day / text-signage can be `HARD_FAIL` (regenerate); others are `REVIEW`. No vision inspector → `MANUAL_REVIEW_REQUIRED`, never a fabricated PASS. Runs as agent task `continuity_qa.attempt` (Identity QA agent, identity-critical routing).

## Shared continuity specification and prompt constraints
- `Generation Brief.data.continuitySpec` (outfit, hair, jewelry, bag, props, time window, lighting, location progression, camera style) is created ONCE before generation, persisted, and inherited by every frame prompt ("frame k of N", previous-frame location). Hair/jewelry come from the canonical identity; time window/bag/props/camera/location progression can be supplied via `creative.continuity` or are derived (a morning brief gets "one continuous morning ... no midday, sunset, dusk or night").
- Every prompt lists the creator's canonical HARD locks verbatim (loaded from the identity, nothing creator-specific in code) and the negatives: global (`NO generated text / readable signage / logos / watermarks / eye-color drift / jewelry changes`) + the identity's own forbidden list (e.g. Sienna's `NO heterochromia`; Vesper's differing eyes are canonical so it is NOT banned globally).
- The prompt identity gate is now negation-aware: quoting "No heterochromia" is not a violation.

## 4:5 delivery
The provider returns 1024x1536 (2:3). `createDelivery45()` CROPS (never stretches/pads/upscales) to 1024x1280, removing 25% of the excess from the top and 75% from the bottom to protect head-room; prompts also ask for a 4:5-safe composition. The RAW asset is never touched. The derivative is stored under `<CODE>/delivery/…_4x5.png` with a lineage row in `asset_derivatives` (source asset id + source sha256 + crop box + operation) and is idempotent per source bytes. Delivery copies are not new frames (they do not enter `assets`, QA or approvals). Create them from the Production/Asset page.
