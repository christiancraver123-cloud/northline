# Northline Media — Command Center

Operations platform for a network of six fictional virtual creators: create → plan → generate → QA → **approve** → calendar. Draft-first; nothing is published automatically.

## Quick start
```bash
npm install
npm run dev          # http://localhost:3000 — local demo store (.data/) and mock providers
npm run typecheck && npm test && npm run build
```
No credentials are needed for demo mode. Demo records are badged **DEMO**; the local file store is not production persistence.

## Going live (per integration)
Copy `.env.example` to `.env.local` and set only what you have:
- **Supabase**: apply `supabase/migrations/*.sql`, set `NORTHLINE_STORE=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server-side only).
- **Stills**: `IMAGE_PROVIDER=openai`, `OPENAI_API_KEY`.
- **Video**: the Higgsfield adapter is a stub (see TODO.md).
- **n8n**: set `NORTHLINE_WEBHOOK_SECRET`; see `docs/n8n.md`.

## Real production pipeline (Sienna first)
1. **Talent → Sienna → Canonical references**: upload a MASTER_FACE (+ supporting references). Identity is `SIE-IDENTITY-v1.0`.
2. **Launch**: confirm virtual/AI disclosure (approval is locked until then).
3. **Create**: "Create a Sienna Pilates to coffee carousel with 5 images" → brief → prompts → image jobs → QA tasks → approval queue.
   `IMAGE_PROVIDER=mock-png` gives real placeholder files without credentials; `IMAGE_PROVIDER=openai` + `OPENAI_API_KEY` uses the real provider (not yet verified live). Visual identity QA needs a vision model explicitly assigned to the Identity QA agent; otherwise assets are marked *manual review required* — a human is the check.
4. **Approvals**: choose which assets to approve; **Assets** shows lineage for each. **Regenerate** on a production creates a new attempt and keeps the old ones.
See `docs/pipeline.md`.

## Try it
1. **Create** → "Create a Miami weekend campaign for Sienna and Zoe" → Interpret → Generate drafts.
2. **Launch** → confirm virtual/AI disclosure per creator (approval is locked until then).
3. **Approvals** → Approve / Request revision / Reject. Approved items get a suggested calendar slot.

See `CLAUDE.md` (architecture + rules), `WORKLOG.md`, `TODO.md`.
