# Learning memory — implementation plan (DESIGN; only the immutability guard exists, in isolation)
"Self-improving" ≠ "self-rewriting". Northline learns through structured, evidence-backed memory a human can inspect. It never rewrites source code and never touches immutable fields.

## What exists now
- **Human decisions with structured reasons** (14 codes) captured on approvals (parseable prefix in `approvals.notes`).
- **Generation metadata** per attempt: prompt, references used, input fidelity, provider/model, usage, QA, human result.
- **Experiment artifacts** (identity probe/validation) with manifests; Sienna strategy status recorded (`docs/identity-strategy-sienna.md`).
- **`src/lib/learning/guard.ts` (isolated, 10 tests)**: deny-by-default allowlist of learnable fields; explicit immutable list (identity, canonical references, age, permanent markers, disclosure, safety, spending/budget/limits, approval, source code); evidence/approval gates for state changes; `applicableLearnings` = the ONLY path to a prompt. Nothing imports it yet.

## Immutable vs learnable
Immutable (never writable by learning): canonical face/physical traits, age, permanent markers, identity versions, canonical references, core character history, disclosure requirements, safety rules, spending limits, human-approval requirements, application source code.
Learnable (allowlist): camera treatment, composition, format, cadence, hooks, caption style, context-appropriate wardrobe, environment, expression style, content pillars, carousel length, Reel duration, thumbnail approach, Story strategy, prompt technique, **reference strategy** (e.g. "MASTER_FACE only + high fidelity"), creative treatment.

## Memory types and lifecycle
Creator memory (one creator, never auto-applied to another) · Global creative memory · Experiment memory (hypothesis, creator, variable, control, treatment, sample, result, confidence, status, action).
`PROPOSED → TESTING → SUPPORTED → ACTIVE → RETIRED`. SUPPORTED needs ≥5 independent pieces of evidence, non-LOW confidence and not-contradicted; ACTIVE needs a named human approval; RETIRED is terminal (contradicted learnings are retired, never silently edited).

## Proposed schema (additive; needs approval before any migration)
| Table | Purpose |
|---|---|
| `human_feedback` | one row per decision: approval/asset id, reason codes[], free text, reviewer — back-filled from the existing `approvals.notes` prefix |
| `learnings` | scope, creator, field (allowlisted), statement, state, confidence, evidence counts, approved_by, timestamps |
| `learning_evidence` | learning ↔ production/attempt/asset/feedback rows (so every claim is traceable) |
| `experiments`, `experiment_results` | pre-registered hypothesis/control/treatment and outcomes |
| `creative_standards` | versioned snapshot of the ACTIVE learnings injected into prompts (each production records the version it used) |
All append-only/auditable; a CHECK on `learnings.field` mirrors the allowlist and the app guard remains authoritative.

## Mapping to code
| Step | Where |
|---|---|
| Capture | `decideAction` already stores reasons → also write `human_feedback`; `collectFeedback`/regeneration read reasons to build corrective prompt feedback (e.g. `face_drift` → "match MASTER_FACE geometry more closely") |
| Evidence | after each production: a pure `summarizeOutcome(production, attempts, QA, decisions)` → evidence rows |
| Propose | rule-based first (counts per reason / per treatment); an LLM may *draft statements* but cannot change state |
| Review | Weekly Learning Review page + inbox report: what improved/regressed, approval and first-pass rates, regeneration rate, top rejection reasons, strongest/weakest formats, provider reliability, cost per approved asset (usage-based; price only if configured), experiments done, supported/contradicted learnings, proposed changes, decisions needed |
| Apply | `buildPrompts` receives `creativeStandard = applicableLearnings(...)` → rendered as extra *scene/camera guidance only*; never touches `identityBlock`, hard locks, references or negatives |
| Guard | every write path calls `validateNewLearning`/`canTransition`; tests assert immutable fields can't be written and a creator's learning can't reach another creator |

## Experiment engine (later)
Pre-register one variable; hold the rest as constant as practical; record sample/result/confidence honestly; one result never promotes itself. Sienna's reference-strategy tests are the first real instance (control = current best known; treatment = candidate), judged by a human.

## Performance data
Separate attention (reach/views), retention (watch time/completion), intent (profile visits/saves/shares), conversion (follows), relationship (returning viewers/story interactions), economics (revenue/cost). Requires a publishing/analytics source that does not exist yet — Phase 5, after publishing is approved.

## Anti-fake-growth rule
No purchased followers/likes, bot comments, spam DMs, follow/unfollow automation, fake proof or engagement manipulation — it corrupts the dataset.

## Rollout
1. (done) guard + tests in isolation. 2. Approve schema → apply additive migration → verify read-only. 3. Back-fill `human_feedback`; feed reasons into regeneration feedback. 4. Learnings table + manual proposals + review page (no auto-apply). 5. `creative_standards` injected for ACTIVE, human-approved, creator-scoped learnings. 6. Experiments + weekly review. 7. Performance ingestion once publishing exists. Each phase ships with tests and a live read-only check; nothing in this system can alter canonical identity, safety, budgets, approvals or code.
