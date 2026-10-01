# Deploying Northline (review-only first)

Northline is a Next.js app that talks to the EXISTING Supabase project (database + private `northline-assets` bucket). Hosting it does not create a second database and never needs the browser to see a secret: every variable below is server-side only (there is no `NEXT_PUBLIC_*`).

## Modes
| | Review-only (first deployment) | Full (later, when you choose) |
|---|---|---|
| `NORTHLINE_STORE` | `supabase` | `supabase` |
| `NORTHLINE_READONLY` | `true` | unset |
| OpenAI / Gemini / image provider keys | **not set** | set |
| Can create / generate / run QA / approve / edit / upload | **No** (UI disabled, server refuses, repo and storage refuse writes) | Yes |

## Safety guards (in code)
- **Production fails closed**: with `NODE_ENV=production` the app refuses to start serving data unless `NORTHLINE_STORE=supabase` and `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NORTHLINE_ADMIN_PASSWORD`, `NORTHLINE_SESSION_SECRET` are set. `/api/health` returns 503 and lists the missing variable NAMES (never values).
- **Auth cannot be disabled in production**: `NORTHLINE_AUTH_DISABLED` is ignored when `NODE_ENV=production`.
- **Read-only mode** (`NORTHLINE_READONLY=true`): server actions redirect before doing any work; `/api/create`, `/api/n8n/*` and `/api/agents/tick` return 403; the repository and storage wrappers throw on any write (second, independent layer); pages never persist anything while rendering; the UI shows a banner and disables action buttons.

## Environment variables (NAMES ONLY)
Required: `NORTHLINE_STORE`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NORTHLINE_ADMIN_PASSWORD`, `NORTHLINE_SESSION_SECRET`.
Review-only switch: `NORTHLINE_READONLY`.
Full mode only: `IMAGE_PROVIDER`, `OPENAI_API_KEY`, `OPENAI_IMAGE_MODEL`, `OPENAI_TEXT_MODEL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `LLM_PRICING_JSON`, `NORTHLINE_WEBHOOK_SECRET`.
Never set in production: `NORTHLINE_AUTH_DISABLED`, `LLM_ENABLE_MOCK`.

## Render (Blueprint in `render.yaml`)
Build `npm ci --include=dev && npm run build`, start `npm start`, health check `/api/health`. See the operator steps in the final report / WORKLOG. Rollback = suspend or delete the Render service; Supabase data is unaffected.
