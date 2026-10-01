# DESIGN — Learning memory (NOT IMPLEMENTED; only human-decision capture exists)
"Self-improving" ≠ "self-rewriting". Northline learns through structured, evidence-backed memory that a human can inspect. It never rewrites source code and never touches immutable fields.

## Today
Structured rejection reasons (14 codes) are captured on approvals (parseable prefix in `approvals.notes`). Generation metadata (prompt, references, fidelity, provider/model, usage, QA) is persisted per attempt. Experiment artifacts (identity probe/validation) are stored with manifests.

## Immutable (enforced in code + tests, not by convention)
Canonical face/physical traits, age, permanent markers, identity versions, core character history, disclosure requirements, safety rules, spending limits, human-approval requirements, application source code. A learning record can only reference an **allowlisted learnable field**; any write that targets an immutable field is rejected, and a test asserts it.
Learnable: camera treatment, composition, format, cadence, hooks, caption traits, context-appropriate wardrobe, environment, expression, pillars, carousel length, Reel duration, thumbnails, Story strategy, prompt techniques, reference *strategies* (e.g. "master-only + high fidelity"), creative treatments.

## Memory types
- **Creator memory** — scoped to one creator; never auto-applied to another.
- **Global creative memory** — cross-creator patterns (e.g. generated storefront text → rejection).
- **Experiment memory** — hypothesis · creator · variable · control · treatment · sample · result · confidence · status · action.
States: `PROPOSED → TESTING → SUPPORTED → ACTIVE → RETIRED`; confidence `LOW/MEDIUM/HIGH`. **One post never creates a permanent rule**: promotion needs a minimum sample and a human-visible review; contradicted learnings are RETIRED.

## Evidence sources
Human decisions + reasons · generation performance (creator, prompt version, creative-standard version, reference configuration, provider/model/settings, attempt, QA, human result, cost) · content performance (24h/7d/30d: reach, views, watch time, completion, likes, comments, shares, saves, profile visits, followers, story interactions, revenue) once publishing exists. Separate attention / retention / intent / conversion / relationship / economics — never "likes" alone.

## How learnings are applied
Only `ACTIVE` learnings, creator-scoped, are injected into prompt building as a **versioned "creative standard"** (so every production records which standard version it used). A change to strategy is proposed in the Weekly Learning Review and applied only after human approval (high-confidence, low-risk items may be pre-approved by policy; identity-adjacent ones never).

## Experiment engine
Pre-register hypothesis + control + treatment; hold other variables as constant as practical; record sample and result; show confidence honestly; allow human review before a supported result becomes ACTIVE. Weekly review: approval rate, first-pass approval, regeneration rate, top rejection reasons, best/worst formats, provider reliability, cost efficiency, experiments finished, supported/contradicted learnings, proposed experiments/changes, human decisions needed.

## Anti-fake-growth rule
No purchased followers/likes, bot comments, spam DMs, follow/unfollow automation, fake proof or engagement manipulation — it corrupts the dataset.

## Proposed schema (additive; needs approval)
`human_feedback` (approval/asset, reason codes, text, reviewer), `learnings` (scope, creator, field, statement, state, confidence, evidence refs), `experiments` (+ `experiment_results`), `creative_standards` (versioned snapshots). All append-only/auditable.
