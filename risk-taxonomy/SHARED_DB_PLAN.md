# Plan: move the TCF Risk Register to a shared database

**Status:** proposed for approval · **Date:** 13 June 2026
**Author:** drafted by Claude (AI) for SLT/COO review

## 1. Goal

Replace the current per-browser storage with a single shared data store, so that
all SLT members and the Board see one live register, and an owner's proposed
change reaches Jim/Julia's Approvals tab instantly — removing the export/import
step that today is the only way data moves between people.

No change to what users see or how they sign in. Same Cloudflare link, same
staff login, same tabs, same look.

## 2. Why this is now sensible (and wasn't at the start)

The single-file design met the original brief (simple, shareable, no IT, works on
iPad with zero setup) when there was no hosting or account. We now have a
Cloudflare Worker serving the site behind Access, so a database can sit directly
behind it with no new vendor, no new login, and no extra cost at this scale.

## 3. Architecture

```
Staff browser  →  Cloudflare Access (staff-only login)  →  Worker (API + static UI)  →  D1 database
```

- **Cloudflare D1** — Cloudflare's built-in SQLite database. Holds risks,
  change history, proposals, deletions (tombstones) and settings.
- **Worker** — already deployed. Gains a small JSON API (`/api/...`) alongside
  serving the existing HTML. Reads the signed-in identity from Access and
  enforces permissions **server-side**.
- **Front-end** — the existing UI, unchanged in appearance. The data layer swaps
  from `localStorage` to `fetch('/api/...')`. The current `localStorage` becomes
  an offline read cache only.

### Why D1 specifically
Same account/vendor, free tier covers us many times over (5 GB, ~5M reads &
100k writes/day vs. our realistic dozens/day), SQLite is a natural fit for ~40
rows + history, and it lives only behind the Worker (never publicly exposed).

## 4. Data model (D1 / SQLite)

- `risks` — one row per live risk: `id, l2, committee, likelihood, impact,
  title, description, controls(JSON), actions(JSON), status, review, draft,
  flag(JSON|null), pending(JSON|null), pending_new, created, updated`.
- `history` — append-only audit: `id, risk_id, at, by, changes(JSON), note,
  approved_by`. (Powers the change report and committee-pack change logs.)
- `deleted` — tombstones for removed risks (so the change report still shows
  removals), same shape as `risks` plus `deleted_at, deleted_by`.
- `settings` — single row of JSON: SLT emails and committee meeting schedules.

The risk's JSON shape stays identical to today, so the existing render code,
change-report rewind logic and export format all keep working.

## 5. API surface (all behind Access; role derived server-side)

| Route | Who | Effect |
|---|---|---|
| `GET /api/state` | any staff | Returns risks, deleted, settings, and `{email, role}` for the caller |
| `POST /api/risk` | admin → live; owner → proposal | Create/update a risk in the caller's area |
| `POST /api/risk/:id/flag` · `/clearflag` | owner/admin | Review flagging |
| `DELETE /api/risk/:id` | admin → live; owner → deletion proposal | Remove a risk |
| `POST /api/proposal/:id/approve` · `/reject` | **admin only** | QA decision |
| `PUT /api/settings` | **admin only** | Meeting dates & emails |
| `GET /api/export` | any staff | Snapshot JSON (today's backup/board file) |
| `POST /api/import` | **admin only** | One-time/occasional load from an export |

## 6. Permissions — enforced on the server

Today's role logic is client-side (convenient, but a determined user could
bypass it). With the API, the Worker reads the Cloudflare Access identity and
**verifies the Access JWT** (`Cf-Access-Jwt-Assertion`) against Cloudflare's
public keys, then maps the email to a role:

- Jim, Julia → admin (all areas, approve/reject, settings)
- Nikesh, Jacqui, Chris → own Level 1 areas only; their writes always become
  proposals
- any other staff email → read-only

Every write re-checks this server-side, so permissions are genuinely enforced,
not just hidden in the UI.

## 7. Concurrency (two people editing at once)

Optimistic locking: each write sends the risk's last-seen `updated` timestamp.
If it no longer matches the database (someone else saved first), the server
rejects with a clear "this risk changed since you opened it — reload" message.
Simple, safe, and adequate at 5–10 users. The proposal/approval flow already
serialises changes to live data through a single admin step.

## 8. Keeping data live without manual refresh

The front-end refreshes `/api/state` on tab focus and on a light poll (e.g.
every 30–60s), so a new proposal shows up in the Approvals tab and badge without
anyone reloading. (A real-time socket is overkill here.)

## 9. The export/merge feature afterwards

Demoted from "the plumbing" to what it should be: a **snapshot/backup** tool.
`Export` still produces the JSON (for board files, offline reading, archiving);
`Import` becomes an admin-only restore/bulk-load. The offline single file remains
deployable as an emergency fallback if Cloudflare were ever unavailable.

## 10. Migration

1. Seed the database once from the current canonical 40-risk baseline + the
   meeting schedules and emails already baked in.
2. If anyone has made real edits in their browser before cutover, they export
   and an admin imports that file once via `/api/import`.
3. Verify counts and a spot-check, then switch the front-end to API mode.

## 11. Delivery phases

- **Phase 0 — Provision (½ day):** create D1, define schema, seed baseline,
  add a staging branch. No user-visible change.
- **Phase 1 — Worker API + server-side roles (1–2 days):** routes above, JWT
  verification, permission checks, automated tests.
- **Phase 2 — Front-end swap (1–2 days):** data layer reads/writes the API;
  `localStorage` becomes an offline cache; everything else unchanged.
- **Phase 3 — Live refresh + concurrency (½–1 day):** focus/poll refresh,
  optimistic-lock conflict handling.
- **Phase 4 — Cutover & docs (½ day):** migrate data, demote export to backup,
  update the README and the in-app help, monitor.

Rough total: ~4–6 focused days, shippable phase by phase behind a staging URL so
nothing changes for the team until you approve the cutover.

## 12. Trade-offs & risks

- **Online-only** for the live register (offline file stays as backup).
- **More moving parts**: backend code + schema to maintain (small, but real).
- **One-time migration** must be done carefully — mitigated by seeding from the
  canonical baseline and keeping the current file as rollback.
- **Cost**: comfortably within Cloudflare's free tier; no new spend expected.
- **Rollback**: the static single-file site can be redeployed at any time;
  database is backed up via `Export` snapshots.

## 13. Open decisions for sign-off

1. **Server-enforced permissions via verified Access JWT** — recommended (yes).
2. **Optimistic locking** for concurrent edits — recommended (yes); the
   alternative (last-write-wins) risks silently overwriting a colleague.
3. **Keep the offline file** as a backup/snapshot — recommended (yes).
4. **Staging first**: build behind a separate URL and cut over only on your
   approval — recommended (yes).

If these four are agreed, Phase 0–1 can start immediately and the team keeps
using today's live site untouched until cutover.
