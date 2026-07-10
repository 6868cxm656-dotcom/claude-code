# Plan: TCF Mission Control — from risk register to organisational suite

**Status:** proposed for approval · **Date:** 19 June 2026
**Author:** drafted by Claude (AI) for COO/SLT review
**Builds on:** the live risk register (`db-app/`, Cloudflare Worker + D1 behind staff Access)

## 1. The idea

One place — one link, one login — where SLT and the Board see and manage how the
organisation is actually doing: **Risk**, **Milestones** (progress against the
annual plan), **Budget** (vs actuals), and **Projects** (the portfolio view that
ties the other three together). The prize at the end is a single, printable
**committee pack**: for any committee, its risks, its milestones, its budget
lines, and what changed since it last met.

## 2. Principles

1. **One platform, thin modules.** Login, roles, database, audit history,
   committee calendar, packs, dialogs and styling are shared plumbing; each
   module is only its own data shape and screens.
2. **Server-authoritative.** All rules enforced in the Worker (as the register
   now is); the browser is presentation.
3. **Don't fork the truth.** Budget data is imported from the finance system,
   never hand-keyed twice. Milestones come from the business plan once, then
   live here.
4. **Portfolio, not task tracker.** Projects is a lens over risks + milestones
   + budget, not a competitor to task-level PM tools.
5. **Same delivery method that worked for the register:** phased, tested
   (extend the e2e suite per module), each phase shippable, nothing breaks the
   module before it.

## 3. What already exists (the platform in embryo)

| Capability | Where it lives today | Reused by every module |
|---|---|---|
| Staff-only login | Cloudflare Access | ✓ |
| Identity → role (Jim/Julia admin; owners; viewers) | Worker (`logic.mjs`) | ✓ |
| Shared database | D1 (`tcf-risk-register`) | ✓ (namespaced tables) |
| Field-level audit history + change report | risk JSON `history` + rewind | ✓ pattern |
| QA approval workflow (propose → approve) | Worker + Approvals tab | ✓ where wanted |
| Committee calendar & meeting-aware packs | settings + pack renderer | ✓ |
| Failure/session handling, dialogs, toasts | front-end shell | ✓ |
| Test harness (27 e2e checks) | `db-app/tests/` | ✓ extended per module |

## 4. Target architecture

```
mission-control.<domain>  (same Worker, same D1, same Access policy)
├─ Home        — org-level dashboard: headline tiles from every module
├─ Risk        — the existing register, unchanged for users
├─ Milestones  — progress against the annual plan
├─ Budget      — budget vs actuals (monthly import)
├─ Projects    — portfolio view stitching the other three per project
└─ Packs       — committee pack builder across all modules
```

- **One Worker, one D1.** Tables namespaced per module (`risks`, `milestones`,
  `budget_lines`, `budget_actuals`, `projects`, shared `settings`). One deploy
  pipeline (the existing `db-staging` branch), one URL. No new accounts.
- **Shell first.** The current single-page app becomes a shell (header, module
  nav, identity, shared components) + a Risk module. Front-end stays a
  no-build static app (proven to work well here) with one JS file per module.
- **Roles per module** reuse the same email→person map. Defaults: everyone
  views everything; edit rights per module below; Jim & Julia admin everywhere.

## 5. The modules

### Module 1 — Risk (migration only)
What users see today, unchanged. Work is purely structural: extract shared
shell components so the next modules reuse them. **No new features.**

### Module 3 — Milestones *(built second — fastest, highest board value)*
Progress against the year's plan.
- **Data:** milestone = title, description, owner (SLT), strategic objective /
  workstream, due date, RAG status (On track / At risk / Off track / Done),
  % or stage, narrative update (dated, audited like risk history), committee,
  optional links to risks and (later) projects.
- **Screens:** board-style dashboard (RAG summary per objective), milestone
  list with filters, detail/edit with update log, "quarter ahead" view.
- **Rules:** owners update their own milestones live (updates are low-risk
  narrative — no QA gate by default; decision 8.3), Jim/Julia edit all.
- **Reporting:** milestones appear in committee packs (status + movement since
  last meeting) using the existing change-log machinery.
- **You provide:** the 2026-27 milestone list (from the business plan), owner
  and target date per item.

### Module 2 — Budget *(third — gated by a data decision, not by build effort)*
Budget vs actuals, presented for SLT/committees — **not** a finance system.
- **Data:** `budget_lines` (code, name, category, committee, annual budget,
  phasing) + `budget_actuals` (line, month, actual £) imported monthly.
- **Import:** admin uploads the monthly CSV exported from the finance system;
  the Worker validates and versions each import (who, when, what changed).
  Nothing hand-keyed except commentary.
- **Screens:** variance dashboard (YTD vs budget, RAG by line/category),
  trend per line, commentary field per line per month (audited).
- **Gating decision (finance conversation, start now):** source system and
  export format; granularity (budget lines vs cost centres; restricted split);
  who owns the monthly feed; whether forecast/reforecast columns are in scope.

### Module 4 — Projects *(last — a portfolio lens, possibly not a module at all)*
- **Data:** project = name, SRO, status RAG, stage, links to its milestones,
  risks and budget lines, short update.
- **Screens:** portfolio grid (one row per project: RAG, next milestone, top
  risk, budget position), project page assembling linked items.
- **Deliberate non-goal:** tasks, Gantt charts, assignments — that's what
  dedicated PM tools do. If a task-level need emerges, integrate, don't build.
- **Open challenge (decision 8.4):** if projects turn out to be "groups of
  milestones with links", fold this into Milestones as a grouping instead of
  a fourth module.

### The integrated committee pack (end state)
One button per committee: cover summary → its risks (current + movement) →
its milestones (RAG + movement) → its budget lines (variance + commentary) →
approvals/decisions log since last meeting. This replaces three separate
papers and is the single strongest argument for the suite.

## 6. Delivery phases

| Phase | What ships | Effort | Needs from you |
|---|---|---|---|
| 1. Shell | "TCF Mission Control" home + nav; Risk migrated in unchanged; shared components extracted; suite renamed | 1–2 days | Approval of this plan; a name check ("Mission Control"?) |
| 2. Milestones | Full module incl. packs integration | 2–3 days | Milestone list, owners, dates |
| 3. Budget | Import pipeline + variance screens | 2–4 days | Finance-feed decisions (§5, module 2) |
| 4. Projects | Portfolio view over modules 1–3 | 1–2 days | List of projects + links; or decision to fold into Milestones |
| 5. Integrated pack | Cross-module committee pack + home dashboard polish | 1–2 days | — |

Each phase ends deployed, tested (suite extended), and reversible; the live
risk register is never broken in the process (Phase 1 is verified by the
existing 27 checks passing unchanged inside the shell).

## 7. Risks & trade-offs of this approach

- **Scope creep** is the killer for internal suites. Mitigation: the non-goals
  are written down (no task PM, no finance-system replacement, no hand-keyed
  actuals), and each module ships its minimum useful version first.
- **Single Worker/D1** means one blast radius. Acceptable at this scale (free
  tier, tiny data); mitigated by the test suite, versioned deploys with
  one-click rollback in Cloudflare, and JSON export as backup — now extended
  to all modules.
- **Adoption**: three new modules only help if updating them is lighter than
  the status quo. Milestone updates are designed as 30-second actions
  (RAG + one line); budget is import-driven, not data entry.
- **The Access session caveat** from the register applies suite-wide
  (permissions trust the Access-protected URL). Same hardening path (verify
  the Access JWT) noted for later.

## 8. Decisions needed before/while building

1. **Approve the shape** (shell + build order Risk → Milestones → Budget → Projects).
2. **Name**: "TCF Mission Control"? (Cheap to change now, annoying later.)
3. **QA gate for milestones?** Risk changes go through you/Julia; recommend
   milestone narrative updates do **not** (they're time-sensitive and
   low-risk) — confirm.
4. **Projects**: separate module or Milestones grouping? (Can be decided at
   Phase 4 with evidence from usage.)
5. **Budget feed**: source, format, granularity, owner (with Chris/finance).
6. **Access list**: same staff-wide viewing for all modules, or is Budget
   more restricted? (e.g. budget commentary SLT-only.)

## 9. What happens next on approval

Phase 1 starts: repo restructured (`db-app/` → shell + `modules/risk/`),
"Mission Control" home screen, Risk migrated unchanged, all 27 checks passing,
deployed to the same URL. You meanwhile: milestone list + the finance-feed
conversation. Nothing changes for the team until Phase 2 gives them something
new to look at.
