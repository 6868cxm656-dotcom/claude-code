# TCF Mission Control (PRIVATE)

The Churchill Fellowship's internal suite — risk register, milestones, budget
dashboard and Strategy-on-a-Page — served by the Cloudflare Worker
`tcf-risk-register` behind staff-only Cloudflare Access.

**This repository is private and must stay private.** It contains the seeded
risk baseline (including risks hidden from wider staff) and the SLT contact
details. History note: until July 2026 the app lived in the public fork
`6868cxm656-dotcom/claude-code` — that history is public forever; nothing
sensitive added after the migration has ever been public.

- Pushing to `main` deploys (Cloudflare Git build, root `/`, `npx wrangler deploy`).
- Start with **`db-app/HANDOVER.md`** — the map, invariants, gotchas, runbook.
- `db-app/` — worker, business rules, front-end, seed, tests.
- `budget-dashboard/` — Python pipeline that turns the budget workbook into the
  importable dashboard. Never commit its outputs or any workbook.
- `offline/tcf-risk-register.html` — read-only offline copy for email/Teams.
