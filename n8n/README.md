# Northline client brief workflow

1. Import n8n/client-brief.json from the n8n workflow menu.
2. In Brief intake, select an n8n Header Auth credential with header name X-Northline-Key and a strong random value.
3. In Draft with Claude, select a separate n8n Header Auth credential with header name x-api-key and an API key from a dedicated Anthropic workspace. Set a monthly workspace spend limit in Claude Console before exposing the production webhook. The workflow has one provider call per valid brief and no automatic retries.
4. Click Listen for test event on the webhook. Copy the Test URL, then run the example below. Confirm HTTP 200 and a JSON draft. Send a short brief and confirm HTTP 400. Once tested, publish the workflow and switch callers to the Production URL.
5. Review the draft before quoting a price or sending anything to a client.

```bash
read -r -s -p 'n8n webhook key: ' NORTHLINE_INTAKE_KEY
printf '\n'
curl --fail-with-body -X POST 'PASTE_N8N_TEST_URL' \
  -H "X-Northline-Key: ${NORTHLINE_INTAKE_KEY}" \
  -H 'Content-Type: application/json' \
  --data-binary @n8n/sample-brief.json
unset NORTHLINE_INTAKE_KEY
```

The workflow sends one request to Claude Sonnet 5.5 per valid webhook call with a 5,000-token output ceiling. It returns the draft and usage. A usable partial draft returns HTTP 200 with `truncated: true`. Review or finish it before using it. HTTP 429 indicates provider throttling. HTTP 502 indicates a provider failure or unusable response. The provider timeout is 80 seconds to leave room under n8n Cloud’s 100-second webhook limit. Set callers to wait at least 90 seconds. Check the run before replaying a timed-out request, since the provider may have processed it. Credentials belong in n8n. Keep briefs and responses out of the repository.

## GitHub and Claude Code

Copy the n8n folder from this pack into a branch of christiancraver123-cloud/northline. Open that checkout in Claude Code. The repository already has a root CLAUDE.md. Ask Claude to review n8n/client-brief.json and n8n/README.md against the repo instructions and propose improvements in a pull request.

This workflow handles commercial briefs. The existing /api/n8n/production-orchestrator described in docs/n8n.md handles virtual talent production. Keep the proposal workflow callable on its own. Customer briefs may contain private information. Use synthetic examples in the public repository.

Run `node --test n8n/client-brief.test.cjs` from the repo root. Tests exercise the code directly from the workflow export. Verify node credentials and a live end-to-end request in n8n before using client briefs.
