# DESIGN — Budget governor (NOT IMPLEMENTED)
Unattended generation must not be able to spend without limit. When any limit is hit: **PAUSE and surface it. Never improvise around a limit.**

## Principles
- **Usage is stored separately from price.** Record units (image tokens in/out, calls, credits) always; estimate dollars only from an operator-supplied pricing table (`LLM_PRICING_JSON` today). Without pricing, dollar limits cannot be enforced — **count/attempt caps can**, and they need no pricing, so they ship first.
- Limits are checked **before** enqueue, **before** each provider call (reserve), and **at every retry**.
- Fail closed: if the governor cannot read its state, it blocks unattended work (human-triggered work still proceeds).

## Limits (policy rows, scoped global / creator / provider)
| Limit | Needs pricing? |
|---|---|
| Max generation attempts per asset (and per production) | no |
| Max provider calls / images per day (global, per creator, per provider) | no |
| Max QA calls per day | no |
| Max concurrent in-flight generations | no |
| Max daily generation spend / QA spend / per-creator / per-provider $ | **yes** |
| Video-credit budget (Higgsfield, when connected) | credits |
| Stop-on-repeated-failure: N consecutive failures per provider/creator → pause that lane | no |
| **Emergency global pause** (flag; also an env override that wins) | no |

## Mechanism
`budget_policies` (scope, period, metric, limit, action=PAUSE), `usage_ledger` (provider, model, op, creator, production, asset, units, estimated_usd NULL when unknown, at), `spend_reservations` (reserve → settle/release so concurrent workers can't jointly overspend; atomic via the same conditional-update primitive as task claims). The ledger is append-only and feeds the economic metrics (cost per approved asset, first-pass approval rate, regeneration rate).
Exhaustion → task `BLOCKED(blocked_reason=budget:<policy>)`, creator/lane `PAUSED`, dashboard alert, report in the inbox. A human can raise a limit or resume; the system never does.

## First safe slice (no pricing, no external dependency)
Attempt caps + daily image-count caps + emergency pause, enforced in `regenerateProduction`/`executeCreate` and the worker claim; surfaced on the dashboard. Needs a small additive migration (approval required).
