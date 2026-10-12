# Command Center milestone (2026-10-12)

Founder operating view for Northline. World is frozen; this milestone is the web Command Center.

## What exists
- **Dashboard** (`/`): status bar (environment, read-only, governor, autonomous generation, Instagram, image provider, running, failed, approvals, images today, spend today, budget left), Needs attention, creator cards sorted by priority, production pipeline, approvals with QA pills, system health, agents, operations detail (existing Command Center panel).
- **Create** (`/create`): one-image studio — creator (canonical master, rules, storyline, recent productions) → brief → settings (4:5 / 1:1 / 9:16, quality, strict identity) → sectioned prompt preview with an editable final prompt → confirmation → `GENERATE 1 IMAGE`. The old multi-production planner is at `/create?mode=planner`. "Edit prompt" from Approvals opens `/create?from=<productionId>`.
- **Approvals** (`/approvals`): one large image at a time with references, Identity / Anatomy / Realism QA, provider, cost, attempt; Approve, Reject (tags), Request revision, Regenerate, Edit prompt, Archive, Open/Download. "Ready to publish" + failed-publish retry.
- **Publishing (mock)**: APPROVED asset → founder clicks Publish → confirmation tick → `publish.instagram` provider job → `MOCK_INSTAGRAM` → `publications` row. Mock outcomes: success / failure / retryable (fails first attempt only). Retries bounded by `max_attempts` (3).
- **Insights (mock)**: a snapshot per refresh in `analytics` with `source='mock'` and `publication_id`. Mock rows never count as real performance (agents exclude them).
- **Analytics** (`/analytics`): what is working, who needs content, what to make next, creator performance, top/bottom/latest posts.
- **Priority** (`lib/priority.ts`): explainable 0–100 score; weights in `DEFAULT_WEIGHTS`, override with `NORTHLINE_PRIORITY_WEIGHTS` (JSON). Ranks only; never spends or publishes.
- **Inbox** (`/inbox`): placeholder showing INSTAGRAM — BLOCKED / DISCONNECTED. No DM infrastructure, no Meta calls.
- **Model tiers** (`lib/llm/tiers.ts`): cheap / normal / premium mapped onto Gemini/OpenAI via `GEMINI_MODEL_CHEAP|NORMAL|PREMIUM` and `OPENAI_TEXT_MODEL_*`; unset = provider default.

## Import and bulk review
- Studio → Import asset (default): pick creator, drop PNG/JPEG/WebP (≤10 MB). Server validates content, stores under a server-chosen path, lineage `MANUAL_UPLOAD`, runs QA, sends to Approvals. No prompt, no AI provider. Imports never become canonical references.
- Approvals → Grid: Select all / APPROVE ALL / DENY ALL act only on the visible (filtered) queue, with one confirmation. DENY ALL marks items REJECTED (who + when recorded); nothing is deleted. Drag a card to Approved (same gate as the button) or Rejected. There is no drag-to-publish.
- Replace an image by dropping on the Approvals focus view or the production page: new attempt; the old image stays in history.

## Flags
| Variable | Default | Effect |
|---|---|---|
| `NORTHLINE_IMAGE_GENERATION` | off | Must be `on` before `IMAGE_PROVIDER=openai` can make a paid call. Mock never needs it. |
| `NORTHLINE_PUBLISHING` | `mock` in dev, `off` in production | `off` / `mock` / `live`. `live` refuses: no Meta adapter exists. |
| `NORTHLINE_INSTAGRAM_LIVE` | off | Reserved for a future adapter. |
| `NORTHLINE_MOCK_PUBLISH_OUTCOME` | success | Default mock outcome when the form does not choose one. |
| `NORTHLINE_IMAGE_PRICE_USD` | unset | Founder-supplied price per image for the Create estimate; unset = UNKNOWN. |
| `NORTHLINE_PRIORITY_WEIGHTS` | unset | JSON override of priority weights. |
Existing flags are unchanged: `NORTHLINE_READONLY`, `NORTHLINE_GOVERNOR`, `NORTHLINE_DURABLE_JOBS`, `NORTHLINE_AUTONOMOUS_GENERATION`.

## Migration 0009 (NOT applied)
`supabase/migrations/0009_publishing_insights.sql` — additive: `publications` table (one PUBLISHED row per asset enforced by a partial unique index), `analytics.publication_id`, `analytics.talent`, `'mock'` analytics source. Rollback steps are at the bottom of the file. Until it is applied on Supabase the UI shows NOT MIGRATED and publishing is refused; nothing else depends on it.

## Local test
```
NORTHLINE_AUTH_DISABLED=true IMAGE_PROVIDER=mock-png npm run dev
```
1. Launch → tick AI disclosure for Sienna (approval requires it).
2. Create → Sienna → fill Scene, Location, Outfit, Lighting → tick confirm → GENERATE 1 IMAGE.
3. Approvals → Approve → Ready to publish → Publish… → tick confirm → Publish now (try mock outcome `retryable`, then Retry).
4. Analytics → mock numbers labelled MOCK; Refresh adds a snapshot.
5. `NORTHLINE_READONLY=true` → every button disabled with a reason; publish refused.

## Still requires live Meta access
Account recovery (phone verification), a Professional account linked to a Meta app, `instagram_business_content_publish` + insights permissions, a `META_INSTAGRAM` adapter implementing `PublishProvider`, and real insights import.
