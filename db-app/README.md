# TCF Mission Control — shared-database app

> **New here? Read `HANDOVER.md` first** — the map, the invariants, the gotchas
> and the runbook, written for whoever builds on this next.

Now a module suite: **Home** (the Strategy on a Page, live), **Risk** (the
register), **Milestones** (year-1 plan, SOAP-tagged, owner updates live with
no QA gate), **Budget** (dashboard imported in-app from the budget-dashboard
tools; admins can hide individual panels, and hidden panels are stripped
server-side for everyone else), plus committee packs and approvals. One
Worker, one D1, one login.

This folder is the database-backed version of the register, built per
`risk-taxonomy/SHARED_DB_PLAN.md`. It is **live**: the Cloudflare Worker
`tcf-risk-register` serves it from the `db-staging` branch, backed by a
Cloudflare D1 database, behind staff-only Cloudflare Access.

## What's here
- `worker.js` — Cloudflare Worker: serves the UI and the `/api/*` JSON API,
  reads the Cloudflare Access identity, enforces roles and the proposal/approval
  rules server-side, and self-initialises the database on first request.
- `logic.mjs` — pure business logic (roles, permissions, proposal/approval state
  machine). Unit-tested in node.
- `seed.mjs` — embedded 40-risk baseline + settings used to seed an empty DB.
- `public/index.html` — the front-end (mirrors `risk-taxonomy/tcf-risk-register.html`).
  Served over http(s) it is API-only; opened as a file it is a read-only offline
  viewer (baseline snapshot + "View a backup" JSON loader). Its BASELINE literal
  is generated from seed.mjs — regenerate with `node db-app/tools/sync-baseline.mjs`.
- `wrangler.jsonc` — Worker config with the D1 binding.

## Status — ✅ DELIVERED (16 June 2026)
- [x] Phase 0 — schema, seed, config
- [x] Phase 1 — Worker API + server-side roles (logic unit-tested)
- [x] Phase 1 deploy — D1 created + bound; worker live
- [x] Phase 2 — front-end reads/writes the API (two-browser e2e tested)
- [x] Phase 3 — live refresh (focus + 45s poll) + optimistic concurrency (409)
- [x] Phase 4 — cutover: the live URL serves the database-backed register

### As-built notes (for the autumn handover)
- **Identity/permissions** are enforced server-side from the
  `Cf-Access-Authenticated-User-Email` header, which Cloudflare sets at the edge
  and a client cannot spoof **while the worker URL stays behind the Access
  policy**. If Access is ever removed or the URL exposed, that protection is lost;
  verifying the Access JWT (`Cf-Access-Jwt-Assertion`) is the hardening step.
- **Build:** Cloudflare app `tcf-risk-register`, production branch `db-staging`,
  path `/`, deploy command `npx wrangler deploy`; config at repo-root
  `wrangler.jsonc`. The D1 database self-initialises and seeds on first request.
- **Backup:** the in-app **Export** produces a full JSON snapshot at any time.
- **Offline fallback:** opened as a local file (no API), the register reverts to
  per-browser localStorage with the manual role picker.

## API (all behind Access; role derived from the signed-in email)
- `GET /api/state` — risks, deleted, settings, and the caller's `{email, role}`
- `POST /api/risk` — admin saves live; owner creates a proposal (server-enforced)
- `POST /api/risk/:id/flag` · `/clearflag`
- `DELETE /api/risk/:id` — admin live; owner → deletion proposal
- `POST /api/proposal/:id/approve` · `/reject` — admins only
- `PUT /api/settings` — admins only
- `GET /api/state?rev=…` — matching rev returns a tiny `{unchanged:true}`; histories excluded
- `GET /api/history` — per-risk edit histories on demand (hidden risks stripped)
- `GET /api/adminlog` — admins only (restores, imports, panel/access changes)
- `GET /api/budget` — per-panel payloads; hidden panels stripped for non-admins
- `POST /api/budget` · `DELETE /api/budget` — admins only (import / remove data)
- `PUT /api/panels` — admins only (hide/unhide budget panels for everyone else)
- `GET /api/snapshots` · `POST /api/snapshot` · `/api/snapshot/:ts` (+`/restore`) — admins only (backups)

## Tests
`db-app/tests/e2e.mjs` runs the real front-end (jsdom) against the real Worker
with an in-memory D1 mock — 27 checks covering identity, proposal/approval
(edit, create, reject), hidden-risk enforcement and leak checks, API failure
handling, baseline/seed drift, and the offline read-only viewer.
Run: `cd db-app/tests && npm install && npm test` (or set JSDOM_PATH to an existing jsdom).
