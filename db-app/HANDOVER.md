# TCF Mission Control — Handover notes

*Written on my last day, for whoever builds on this next. Everything here was
true on 11 July 2026 at commit `da4f15e`+. Trust the tests over this document,
and trust the code over both.*

---

## 1. What you have inherited

A small, sturdy internal suite for The Churchill Fellowship: **Home** (their
3-year Strategy on a Page, rendered live), **Risk** (a full risk register with
appetite, QA-gated changes, hidden risks, committee packs), **Milestones**
(the year's plan, RAG-tracked, timeline view), **Budget** (the budget
dashboard, import-driven, with admin-hideable panels), an **auto-generated
priorities engine**, and an **Access** admin module. One URL, one login, one
database.

It is used by five SLT members and, increasingly, wider staff. The users are
smart, busy and non-technical. Every design choice follows from that.

## 2. The map

| Thing | Where | Notes |
|---|---|---|
| Live app | Cloudflare Worker `tcf-risk-register` | `https://tcf-risk-register.jim-riddiford.workers.dev` |
| Deploys from | branch **`db-staging`**, repo root, `npx wrangler deploy` | push = deploy, ~60s. Root `wrangler.jsonc` is the config the build uses |
| Database | Cloudflare D1 `tcf-risk-register` (id `5694510a…`) | SQLite; tables `risks`, `deleted`, `milestones`, `settings`, `snapshots` |
| Auth | Cloudflare Access, policy: emails ending `@churchillfellowship.org` | one-time PIN; session length set in Zero Trust; optional JWT verification (§6) |
| Server code | `db-app/worker.js` (~500 lines) | routing + D1 I/O + JWT verification + snapshots + budget panels |
| Budget data pipeline | `budget-dashboard/` on branch `claude/budget-dashboard-design-h2ngl8` | `build.py` turns the budget workbook + Xero variance report into `dashboard.html`; import that file in-app |
| Business rules | `db-app/logic.mjs` (~200 lines) | **pure functions, no I/O** — this is the file that matters |
| Front-end | `db-app/public/index.html` (~3,100 lines, one file, no build step) | find sections by the `/* ============ NAME ============ */` banners |
| Seed data | `db-app/seed.mjs` (generated; single source of truth for baselines) | |
| Tests | `db-app/tests/` — `cd db-app/tests && npm i && npm test` | 186 end-to-end checks, jsdom front-end vs real worker vs mock D1 |
| Offline backup copy | `risk-taxonomy/tcf-risk-register.html` on branch `claude/risk-taxonomy-v1alvk` | read-only viewer; sync it after front-end changes (see §5) |
| Plans & history | `MISSION_CONTROL_PLAN.md` (here), `risk-taxonomy/*.md` (other branch) | the plan docs record *why*, commit messages record *what* |
| Dead branches | `cloudflare-pages`, `gh-pages` | pre-database static era; nothing deploys from them |

## 3. The mental model (read this before touching anything)

1. **The server is the law.** Every rule — who edits what, what becomes a
   proposal, who sees hidden risks — is decided in `logic.mjs` and enforced in
   `worker.js`. The front-end only *mirrors* those rules for UX. If you add a
   rule client-side without the server twin, you have added decoration, not
   security.
2. **Objects are JSON blobs in D1.** A risk/milestone is one JSON document in
   a `data` column; the other columns are just filters. The blob carries its
   own audit trail (`history`: `{at, by, changes|note}` entries). The change
   report literally *rewinds* history entries to reconstruct any past date —
   so never rewrite history, only append.
3. **Roles**: `admin` (Jim/Julia — everything, instantly), `editor` (own risk
   areas *as proposals*, own milestones *live*), `viewer` (read-only). Since
   the Access module shipped, this mapping lives in the DB (`settings` key
   `access`) and is applied per-request by `applyAccessConfig()`. The
   hardcoded constants in `logic.mjs` are only the *defaults*.
4. **Two front-end modes, one file.** Served over http(s) → API mode (shared
   DB). Opened as a file → read-only offline viewer using the embedded
   baseline. There is deliberately **no offline editing** — we removed it; do
   not bring it back, the dual state machine was the buggiest thing this
   project ever had.
5. **No framework, no build step — deliberately.** The team edits nothing;
   one HTML file deploys in seconds, has zero dependencies to rot, and has
   survived ~30 significant feature changes. If the file (~2,300 lines)
   genuinely starts hurting, split it into `modules/*.js` served as separate
   assets — but do not introduce a bundler for a charity intranet tool.

## 4. Invariants — break these and you break trust

- **Hidden risks never leave the server** for non-admins: stripped from
  `/api/state`, 404 on per-id routes, excluded from packs/CSV/change report
  *even for admins* (those get printed). Tests cover every leak we ever found.
- **Every write fails loudly.** `apiCall` detects network failures and Access
  login pages (expired session) and shows a banner; it must never report
  success it didn't see. The hide-button bug of June 2026 taught us this.
- **Lockout is impossible**: ≥1 admin always, no self-demotion
  (`validateAccessConfig`). Keep it that way.
- **Generated blocks are generated.** The `BASELINE:*` markers in index.html
  are written by `tools/sync-baseline.mjs` from `seed.mjs`; the test suite
  fails on drift. Never hand-edit inside the markers.
- **`view-as` is a read**: only the read-only GETs (`/api/state`,
  `/api/budget`, `/api/history`) honour it; every write route uses the real
  identity, and the client blocks writes during preview.
- **Optimistic concurrency**: writes carry `baseUpdated`; a mismatch is a 409
  and a reload, never a silent overwrite. New-risk creation uses plain INSERT
  with collision retry — don't "simplify" it back to an upsert.
- **A restore never touches the access config.** Snapshots *store* it (so a
  downloaded backup is complete) but `restoreSnapshot` deliberately skips it —
  restoring an old permission model or stale JWT-enforcement values could lock
  every admin out. The restore route also takes a safety snapshot first, so a
  restore is itself undoable. Keep both properties.
- **You cannot lock yourself out of JWT enforcement.** `PUT /api/access`
  verifies the *saving admin's own current token* against the new
  teamDomain/AUD values before persisting them. Never bypass that check —
  a typo in the AUD tag would otherwise 401 the whole organisation.
- **Hidden budget panels never leave the server** for non-admins — same
  covenant as hidden risks. This works because the import precomputes five
  *independent* per-panel payloads (`buildBudgetPanels` in logic.mjs); the
  worker sends only the panels a caller may see. Do not "optimise" the module
  to ship raw budget lines and filter client-side — that turns a hide into
  decoration.
- **Budget figures live ONLY in D1.** The repository is public: never commit
  a built dashboard, a budget workbook, or a seed containing real financial
  data. The module ships empty and is fed by the in-app admin import.

## 5. How to make a change (the loop that never failed me)

```
1. edit db-app/{worker.js,logic.mjs,public/index.html}
2. node --check on each changed file (extract index.html's <script> first)
3. cd db-app/tests && npm test          # 186 checks; add yours FIRST
4. bump APP_VERSION in index.html       # it shows in the footer — cache sanity
5. git push origin db-staging           # that IS the deploy
6. hard-refresh, check footer version, click the thing you changed
7. sync the offline copy:
   git switch claude/risk-taxonomy-v1alvk
   git show db-staging:db-app/public/index.html > risk-taxonomy/tcf-risk-register.html
   commit, push, switch back
```

Rules of thumb that paid rent: new module = new D1 table with its own
`ensure*()` self-init + rules in `logic.mjs` + section in index.html + tests,
in that order. Extend the test suite in the same commit as the feature —
the suite is why a 2,300-line single file has stayed changeable.

## 6. Where the bodies are buried (honest gotchas)

- **The Access-header trust — now fixable with one setting.** Out of the box,
  permissions rely on `Cf-Access-Authenticated-User-Email`, which Cloudflare
  injects at the edge — safe **only while the workers.dev URL sits behind the
  Access policy**. The hardening is built: enter the Zero Trust team domain +
  the application's AUD tag under **Access → Sign-in verification** and every
  request's `Cf-Access-Jwt-Assertion` JWT is cryptographically verified
  (RS256 against Cloudflare's JWKS, cached 1h), with identity taken from the
  token, not the header. Enforcement is **off until those two values are
  saved** — turn it on before any expansion beyond staff. The save is
  self-guarding (see §4), so you cannot enable values that don't verify.
- **Self-seeding DB — now tripwired and backed up.** On an *empty* database
  the worker recreates schema and baseline (`ensureInit` etc., marker-guarded),
  so a wiped D1 silently resurrects June 2026 data. Two defences now exist:
  a daily 03:00 UTC cron snapshot (last 30 kept in the `snapshots` table, with
  take/download/restore under **Access → Backups**), and a `seeded_at` marker —
  if it is ever newer than the latest snapshot, admins get a red banner telling
  them to restore. Caveat: snapshots live in the *same* D1 database, so a full
  database wipe takes them too — still download a JSON backup monthly and
  keep it outside Cloudflare.
- **The D1 mock** (`tests/d1mock.mjs`) is regex-based and minimal. It has
  bitten us twice (hardcoded settings key; missing milestone tables). When a
  test passes but production doesn't, suspect the mock first.
- **Two `wrangler.jsonc` files** (root = CI, db-app = local dev). Marked
  MIRROR; change both or suffer.
- **Notifications are `mailto:`** — they open the *proposer's* mail client;
  nothing is sent server-side. A real digest needs an email provider
  (Resend key or CF Email Routing + custom domain). Decided against until
  someone actually misses an approval.
- **Sync is a 45s poll + refresh-on-focus**, not websockets — but the poll is
  cheap now: every write bumps an opaque `rev` stamp (settings key `rev`),
  pollers present theirs, and an unchanged register costs one D1 query and a
  ~28-byte reply (no re-render client-side). Edit histories are NOT in the
  poll — they load on demand via `GET /api/history` (same hidden-risk
  stripping as /api/state) for the modal, change report, packs and exports.
  If you ever add a write path that bypasses `handleApi` (like the cron
  snapshot does), call `bumpRev()` yourself or clients will look stale until
  the next ordinary write.
- **Admin surfaces have optimistic concurrency too**: PUT /api/access,
  /api/settings and /api/panels take a `baseUpdated` stamp and 409 on a
  mismatch, so two admins can't silently overwrite each other. Admin actions
  (restores, imports, panel/access/settings changes) append to the
  `adminlog` settings key — capped at 200, shown in the Access module, and
  deliberately excluded from snapshots so a restore can't erase the record
  of itself.
- **SOAP content and the priorities engine weights are constants** in
  index.html (`const SOAP`, `computePriorities`). The SOAP is draft v7 —
  when the Board approves final wording, edit the constant. The `[X]%`
  measures render as "target TBC" until milestone M19 resolves them.
- **The retro theme is cosmetic only.** The 80s "Mission Control" look
  (default) is a CSS layer scoped entirely under `html[data-theme="retro"]`,
  with a per-browser "classic" opt-out (`localStorage` key `tcfTheme`, 🕹
  button in the header) and a boot-screen loading overlay (min ~800ms hold —
  the e2e harness waits 1300ms after opening a window). Printing always
  reverts to classic so committee packs stay boardroom-clean. No logic lives
  in the theme; delete the retro CSS block and the app still works.
- **The repo is a fork of `claude-code`** with unrelated content (games,
  plugins) on `main`. Ignore `main`. The app never lived there.

## 7. What's deliberately NOT built (don't accidentally rebuild it)

- Offline editing / import-merge (removed; read-only viewer + backups only).
- Task-level project management (portfolio lens only — see plan §5, module 4).
- Hand-keyed budget data (the Budget module must be import-driven; the
  gating decision is finance's export format, not code).
- A runtime LLM call for the priorities list (deterministic engine chosen:
  free, explainable, always current; an LLM narrative layer is optional
  future work needing an API key).

## 8. The roadmap as I leave it

From `MISSION_CONTROL_PLAN.md`: **Phase 3** strategy measures (baselines +
readings, ~1 day, wanted before the 1 Oct SOAP launch) → **Phase 4** Budget
(*first slice delivered:* the dashboard is a module fed by an admin file
import with per-panel hiding; still to come is the routine monthly pipeline —
finance exports from Xero, upload replaces the month, exception commentary
saved to the DB instead of localStorage) → **Phase 5** Projects
(a grouping over milestones+risks, challenge whether it's needed) → **Phase 6**
the integrated committee pack (risks + milestones + budget + changes in one
printable document — the deliverable that justifies the suite). The JWT
hardening and backups are built (§6) — the one manual step left is Jim
entering the team domain + AUD tag to switch verification on. Someday, real
email.

## 9. A closing word

This system's superpower was never cleverness — it was *shipping small,
tested slices that users touched the same day*, and writing down why. The
users trust it because every failure mode we hit became a banner, a guard, or
a test. Keep that covenant: when something breaks, make the failure loud,
add the check, and tell Jim the truth about what happened.

Look after it. It looks after the people who look after the Fellows.
