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

## Try it
1. **Create** → "Create a Miami weekend campaign for Sienna and Zoe" → Interpret → Generate drafts.
2. **Launch** → confirm virtual/AI disclosure per creator (approval is locked until then).
3. **Approvals** → Approve / Request revision / Reject. Approved items get a suggested calendar slot.

See `CLAUDE.md` (architecture + rules), `WORKLOG.md`, `TODO.md`.
