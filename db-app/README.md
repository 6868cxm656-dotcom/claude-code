# TCF Risk Register — shared-database app (STAGING)

This folder is the database-backed version of the register, built per
`risk-taxonomy/SHARED_DB_PLAN.md`. It is deployed as a **separate staging Worker**
(`tcf-risk-register-staging`) so the live register is untouched until cutover.

## What's here
- `worker.js` — Cloudflare Worker: serves the UI and the `/api/*` JSON API,
  reads the Cloudflare Access identity, enforces roles and the proposal/approval
  rules server-side.
- `logic.mjs` — pure business logic (roles, permissions, proposal/approval state
  machine). Unit-tested in node.
- `migrations/0001_init.sql` — D1 schema.
- `migrations/0002_seed.sql` — the current 40-risk baseline + settings.
- `public/index.html` — the front-end. **Phase 2** swaps its data layer from
  browser storage to the API; until then it still runs standalone.
- `wrangler.jsonc` — staging Worker config (D1 binding; paste the database_id).

## Status
- [x] Phase 0 — schema, seed, config
- [x] Phase 1 — Worker API + server-side roles (logic unit-tested)
- [ ] Phase 1 deploy — needs the D1 database created + bound (see below)
- [ ] Phase 2 — front-end reads/writes the API
- [ ] Phase 3 — live refresh + concurrency UX
- [ ] Phase 4 — cutover

## One-time provisioning (repo owner)
1. Create the database: `wrangler d1 create tcf-risk-register` (CLI) or the
   Cloudflare dashboard → Storage & Databases → D1 → Create. Copy the **database_id**.
2. Paste that id into `wrangler.jsonc` (`database_id`).
3. Create a **new** Worker connected to this repo's `db-staging` branch with root
   directory `db-app`, OR deploy from CLI: `cd db-app && wrangler deploy`.
4. Apply migrations (the build command does this automatically; or run
   `wrangler d1 migrations apply tcf-risk-register --remote`).
5. Put the staging Worker behind Cloudflare Access (same as production:
   Settings → Domains & Routes → Enable Cloudflare Access; policy = emails ending
   `@churchillfellowship.org`).

## API (all behind Access; role derived from the signed-in email)
- `GET /api/state` — risks, deleted, settings, and the caller's `{email, role}`
- `POST /api/risk` — admin saves live; owner creates a proposal (server-enforced)
- `POST /api/risk/:id/flag` · `/clearflag`
- `DELETE /api/risk/:id` — admin live; owner → deletion proposal
- `POST /api/proposal/:id/approve` · `/reject` — admins only
- `PUT /api/settings` — admins only
