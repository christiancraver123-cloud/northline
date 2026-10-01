# Operator workflow
## Two ways to run Northline
- **Review-only host** (`NORTHLINE_READONLY=true`, no provider keys): sign in from Mac or phone and inspect everything. Nothing can be created, generated, approved or edited.
- **Full mode** (keys present): everything below.

## Daily loop
1. **Dashboard** — what needs you: approvals waiting, QA needing a human, failed tasks (7 days), provider health, usage (units, never invented dollars), agent activity.
2. **Productions → production code** — attempt history (failed/aborted attempts stay visible), frames (RAW), 4:5 delivery copies, brief and continuity spec, QA results with retry/superseded history, approval state, lineage.
3. **QA** — identity (vision), technical, continuity (whole carousel), content. `MANUAL_REVIEW_REQUIRED` means *you* are the check. **Re-run QA (no regeneration)** after a provider outage.
4. **Decide** (Approvals) — Approve selected frames, **Request revision** or **Reject** with structured reasons (face drift, wrong eyes, looks too AI, unwanted text, …) plus optional notes. Approval requires the creator's AI disclosure to be on. Nothing publishes or schedules by itself.
5. **Regenerate** — new attempt, old attempts preserved; optionally with new creative direction. Always an explicit action that spends credit.
6. **Delivery** — "Create 4:5 delivery copies": cropped (never stretched) copies; RAW untouched.

## Creators and references (Talent)
Canonical MASTER_FACE is the identity authority; supporting references clarify the same face. Only an explicit human action creates or changes references. Generated images and experiment outputs have **zero** authority and are never used as identity references.

## Experiments
`/experiments/<id>` shows controlled tests (e.g. Sienna identity probe/validation) with exact configuration and usage. They are decision aids: **you** pick; Northline never auto-selects.

## Agents
`/agents` shows status, queues and an inbox of reports; chat with the Orchestrator or an agent. Schedules are seeded disabled.

## Rules of the house
- Never paste secrets in chat; they live in the host's environment. Never commit them.
- Nothing is deleted to look tidy; failed attempts are evidence.
- Spend is operator-triggered; expect to be asked before any batch of image generation.
- Identity changes, publishing, DMs, following/commenting, deleting history and enabling unattended actions all require your explicit decision.
