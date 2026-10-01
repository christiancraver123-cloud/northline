# Northline — living execution plan
_Last verified: started from HEAD `b0dc940` (= remote), clean tree. This session's changes: see WORKLOG Session 6. Tests 165, typecheck clean, build OK._
Statuses: DONE · IN PROGRESS · READY · BLOCKED — HUMAN · BLOCKED — EXTERNAL · FUTURE. Describes what EXISTS; anything not marked DONE is not implemented.

## DONE (verified)
- **Provider health** (HEALTHY/DEGRADED/RATE_LIMITED/QUOTA_EXHAUSTED/AUTH_ERROR/UNAVAILABLE/UNKNOWN) derived from persisted calls, with stale-blocker decay, on the dashboard together with a "Needs attention" card.
- **Tap targets**: links/summaries/checkboxes get ≥32px hit areas on phones; 10 key pages fit 390px.
- **P1 Sienna identity probe**: exactly 3 images (A control / B master high-fidelity / C cropped identity set high-fidelity), manifest + comparison sheets in storage `experiments/sie-identity-probe-v1/`, read-only page `/experiments/sie-identity-probe-v1`, inbox report. **AWAITING HUMAN IDENTITY SELECTION** (no winner chosen).
- **P7 slice**: daily-quota 429s (Gemini, OpenAI credit) are `quota_exhausted`: never retried, long provider cooldown, shown in provider status.
- **P9 slice**: structured rejection reasons (14 codes) on the approvals page, stored as a parseable prefix on `approvals.notes` (no schema change); parser + tests.
- **P3/P37 slice**: mobile audit at 390px — fixed a layout bug that made every page ~1150px wide on phones; 10 key pages now fit; read-only banner/pages verified.
- Supabase-backed data + private storage; canonical identities (versioned, immutable snapshots); 8 canonical references imported (6 masters + Sienna FACE_3Q_RIGHT/UPPER_BODY).
- Production pipeline: brief → prompts (hard locks, global negatives, shared continuity spec) → OpenAI stills (edits with references) → assets with lineage → Identity/Technical/Continuity/Content QA → human approval. Honest QA states; no fabricated PASS.
- QA retry (bounded, same provider, no silent fallback), supersession with full history, operator "re-run QA without regenerating".
- RAW → 4:5 delivery derivatives with lineage (`asset_derivatives`).
- SIE-2026-001: attempt 1 (baseline), attempt 2 (aborted, kept as ERROR), attempt 3 (improved continuity). Nothing approved/scheduled/published.
- Deployment hardening: production fails closed; AUTH_DISABLED ignored in production; `NORTHLINE_READONLY` enforced at action/endpoint/repo/storage layers; `render.yaml` (names only); live read-only verification (19/19 pages, 0 rows changed).
- Live-only bugs found and given regression tests (agent-run-id FK, `superseded_by` column mapping).

## IN PROGRESS
- **Identity validation** (1 image, MASTER_FACE only + high fidelity, 3/4 pose): generated; **AWAITING HUMAN VISUAL APPROVAL**. The 3/4 pose was NOT achieved (frontal again), so the pose-change question is still open.

## READY (safe, no external dependency)
- P3: Production detail — surface usage/cost-unknown honestly, reference set used, probe/experiment records.
- P9: feed reason codes into regeneration feedback / learning memory (needs the P10 design; a proper table needs an approved migration).
- P8: dashboard = real system state (QA failures, blocked/failed tasks, provider health, awaiting approval).
- Design docs written (DESIGN ONLY, no migrations): `docs/design/durable-jobs.md`, `budget-governor.md`, `learning-memory.md`.
- Remaining docs: architecture / failure recovery / operator workflow.

## BLOCKED — HUMAN
- Sienna identity: strategy **B (MASTER_FACE only, high input fidelity, explicit authority label) SELECTED by the operator** for the next controlled test; it is a reference *strategy*, not an asset — Probe B is not promoted and is not used as a reference. Next: human visual approval of the validation image; production prompt system stays unchanged until then.
- Approve migrations before any DB-dependent feature goes live (planned: 0007 human feedback / structured reasons, later job-system, budget, learning-memory tables). Each will be inspected read-only first; never re-run blindly.
- Gemini: free-tier daily quota (20 requests/day/model) is exhausted → enable billing or wait for the daily reset to get real Identity/Continuity QA.
- Next Sienna carousel (attempt 4) — only after the identity selection; spend approval.

## BLOCKED — EXTERNAL
- Hosting: create the Render service and enter secrets yourself (steps in the last report / `docs/deploy.md`). I cannot authorize your hosting/GitHub account.
- `main` branch (earlier push denied by policy).

## FUTURE (ordered by the master prompt)
P6 durable job states/worker · P7 provider health + budget governor (limits, emergency pause) · P10 learning memory · P11 performance + economic instrumentation (usage stored separately from estimated price) · P12 experiments + weekly learning review · P13 bounded unattended production · P14 scale beyond Sienna through readiness gates. Immutable: canonical identity, safety rules, spending limits, human approval, source code — learning may never modify them.
