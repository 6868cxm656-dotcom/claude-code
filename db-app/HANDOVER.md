# TCF Mission Control — Handover notes

*Written on my last day, for whoever builds on this next. Everything here was
true on 11 July 2026 at commit `da4f15e`+. Trust the tests over this document,
and trust the code over both.*

---

## 1. What you have inherited

A small, sturdy internal suite for The Churchill Fellowship: **Home** (their
3-year Strategy on a Page, rendered live), **Risk** (a full risk register with
appetite, QA-gated changes, hidden risks, committee packs), **Milestones**
(the year's plan, RAG-tracked, timeline view), an **auto-generated priorities
engine**, and an **Access** admin module. One URL, one login, one database.

It is used by five SLT members and, increasingly, wider staff. The users are
smart, busy and non-technical. Every design choice follows from that.

## 2. The map

| Thing | Where | Notes |
|---|---|---|
| Live app | Cloudflare Worker `tcf-risk-register` | `https://tcf-risk-register.jim-riddiford.workers.dev` |
| Deploys from | branch **`db-staging`**, repo root, `npx wrangler deploy` | push = deploy, ~60s. Root `wrangler.jsonc` is the config the build uses |
| Database | Cloudflare D1 `tcf-risk-register` (id `5694510a…`) | SQLite; tables `risks`, `deleted`, `milestones`, `settings` |
| Auth | Cloudflare Access, policy: emails ending `@churchillfellowship.org` | one-time PIN; session length set in Zero Trust |
| Server code | `db-app/worker.js` (~280 lines) | routing + D1 I/O only |
| Business rules | `db-app/logic.mjs` (~200 lines) | **pure functions, no I/O** — this is the file that matters |
| Front-end | `db-app/public/index.html` (~2,300 lines, one file, no build step) | find sections by the `/* ============ NAME ============ */` banners |
| Seed data | `db-app/seed.mjs` (generated; single source of truth for baselines) | |
| Tests | `db-app/tests/` — `cd db-app/tests && npm i && npm test` | 85 end-to-end checks, jsdom front-end vs real worker vs mock D1 |
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
- **`view-as` is a read: only `/api/state` honours it**; every write route
  uses the real identity, and the client blocks writes during preview.
- **Optimistic concurrency**: writes carry `baseUpdated`; a mismatch is a 409
  and a reload, never a silent overwrite. New-risk creation uses plain INSERT
  with collision retry — don't "simplify" it back to an upsert.

## 5. How to make a change (the loop that never failed me)

```
1. edit db-app/{worker.js,logic.mjs,public/index.html}
2. node --check on each changed file (extract index.html's <script> first)
3. cd db-app/tests && npm test          # 85 checks; add yours FIRST
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

- **The Access-header trust.** Permissions rely on
  `Cf-Access-Authenticated-User-Email`, which Cloudflare injects at the edge.
  This is safe **only while the workers.dev URL sits behind the Access
  policy**. If anyone removes that policy the API is open. The hardening step
  (verify the `Cf-Access-Jwt-Assertion` JWT against Cloudflare's public keys)
  is designed but unbuilt — do it before any expansion beyond staff.
- **Self-seeding DB.** On an *empty* database the worker recreates schema and
  baseline (`ensureInit`/`ensureExtras`/`ensureMilestones`, marker-guarded).
  Convenient, but it means a wiped D1 silently resurrects June 2026 data —
  if the DB ever looks "reset", that's what happened; restore from a JSON
  export (in-app **Export all** is the only backup: schedule one monthly).
- **The D1 mock** (`tests/d1mock.mjs`) is regex-based and minimal. It has
  bitten us twice (hardcoded settings key; missing milestone tables). When a
  test passes but production doesn't, suspect the mock first.
- **Two `wrangler.jsonc` files** (root = CI, db-app = local dev). Marked
  MIRROR; change both or suffer.
- **Notifications are `mailto:`** — they open the *proposer's* mail client;
  nothing is sent server-side. A real digest needs an email provider
  (Resend key or CF Email Routing + custom domain). Decided against until
  someone actually misses an approval.
- **Sync is a 45s poll + refresh-on-focus**, not websockets. Fine at 10
  users; revisit at 50.
- **SOAP content and the priorities engine weights are constants** in
  index.html (`const SOAP`, `computePriorities`). The SOAP is draft v7 —
  when the Board approves final wording, edit the constant. The `[X]%`
  measures render as "target TBC" until milestone M19 resolves them.
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
(import pipeline; blocked on the finance-feed decision) → **Phase 5** Projects
(a grouping over milestones+risks, challenge whether it's needed) → **Phase 6**
the integrated committee pack (risks + milestones + budget + changes in one
printable document — the deliverable that justifies the suite). Plus the JWT
hardening (§6) and, someday, real email.

## 9. A closing word

This system's superpower was never cleverness — it was *shipping small,
tested slices that users touched the same day*, and writing down why. The
users trust it because every failure mode we hit became a banner, a guard, or
a test. Keep that covenant: when something breaks, make the failure loud,
add the check, and tell Jim the truth about what happened.

Look after it. It looks after the people who look after the Fellows.
