# Plan: TCF Mission Control — from risk register to organisational suite

**Status:** Phases 1–2 SHIPPED (10 July 2026): shell, live SOAP home, Milestones module with draft year-1 plan. Next: strategy measures (ph.3), budget feed decision (ph.4).
**Date:** 19 June 2026 (rev. 20 June: strategy layer; 10 July: phases 1–2 delivered)
**Author:** drafted by Claude (AI) for COO/SLT review
**Builds on:** the live risk register (`db-app/`, Cloudflare Worker + D1 behind staff Access)
**Framed by:** the Strategy on a Page 2026/27–2028/29 (draft v7), live from 1 Oct 2026

## 1. The idea

One place — one link, one login — where SLT and the Board see and manage how the
organisation is actually doing: **Risk**, **Milestones** (progress against the
annual plan), **Budget** (vs actuals), and **Projects** (the portfolio view that
ties the other three together) — all framed by the **Strategy on a Page**, which
sits above the modules and gives every item its "why". The prizes at the end:
a single, printable **committee pack** (a committee's risks, milestones, budget
lines and what changed since it last met), and a home screen that is the
**SOAP made live** — each 2029 ambition showing, at a glance, its milestone
progress, its strategy measures and its biggest risks.

## 1a. The strategy layer (SOAP 2026/27–2028/29)

The SOAP is not a fourth data-heavy module; it is the **organising spine** the
modules hang from — reference data plus a small set of measures:

- **Structure held in the tool** (admin-editable, since the deck is still
  draft v7): vision, mission, the three **2029 ambitions**, the three **Big
  Shifts** (Portal · Proactive fundraising · Evidence & data), and the eight
  **enablers**.
- **Milestones map to the SOAP.** Each milestone tags an ambition, Big Shift
  or enabler (this replaces the generic "workstream" grouping in §5). Progress
  then rolls **up**: "how is Ambition 2 doing?" is computed from its
  milestones' RAGs, per year and across the three-year arc.
- **Strategy measures = the "we'll know it's working when" list.** Held as
  multi-year KPIs (measure, target, baseline, owner, periodic readings) with
  annual readings feeding the home screen and the annual SOAP review the
  strategy itself commits to. Several targets are still "[X]%" in draft v7 —
  the tool holds them as *target TBC*, which usefully forces that conversation
  before 1 Oct.
- **Risks link at category level.** The eight Level-1 risk categories map once
  to ambitions/shifts/enablers (e.g. Fundraising → Ambition 3; Change &
  Transformation → the Portal shift), so the home screen can show each
  ambition's biggest risks without re-tagging 41 risks by hand.
- **Budget tags later** (nice-to-have): budget lines can tag an ambition/shift
  for a "spend vs strategy" view once the module exists.
- **Timing is a gift:** the SOAP goes live 1 Oct 2026, the start of the
  financial year. Target: Mission Control's strategy layer launches with it,
  so the new strategy arrives with its own live dashboard on day one.

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
├─ Home        — the SOAP made live: vision/mission, each ambition & Big Shift
│                with rolled-up milestone RAGs, strategy measures, top risks
├─ Risk        — the existing register, unchanged for users
├─ Milestones  — progress against the annual plan, tagged to the SOAP
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
- **Data:** milestone = title, description, owner (SLT), **SOAP reference**
  (ambition / Big Shift / enabler — see §1a), plan year (2026-27 etc.),
  due date, RAG status (On track / At risk / Off track / Done),
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
| 1. Shell + SOAP scaffold | "TCF Mission Control" home rendering the SOAP (static roll-ups to start); Risk migrated in unchanged; shared components extracted | 1–2 days | Approval of this plan; a name check ("Mission Control"?); SOAP text as approved (or v7 as placeholder) |
| 2. Milestones | Full module, SOAP-tagged, incl. packs integration; ambition roll-ups on Home go live | 2–3 days | Milestone list with owners, dates and SOAP mapping |
| 3. Strategy measures | The "we'll know it's working when" KPIs: targets, baselines, readings; annual SOAP-review view | ~1 day | Values for the [X]% placeholder targets (or confirm "TBC") |
| 4. Budget | Import pipeline + variance screens | 2–4 days | Finance-feed decisions (§5, module 2) |
| 5. Projects | Portfolio view over the other modules | 1–2 days | List of projects + links; or decision to fold into Milestones |
| 6. Integrated pack | Cross-module committee pack + home polish | 1–2 days | — |

**Timing anchor:** phases 1–3 target being live before **1 Oct 2026**, so the
new strategy launches with its dashboard rather than the dashboard chasing the
strategy.

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

1. **Approve the shape** (shell + build order Risk → Milestones → Strategy measures → Budget → Projects, with the SOAP as the organising layer and Home).
2. **Name**: "TCF Mission Control"? (Cheap to change now, annoying later.)
2a. **SOAP content**: use draft v7 now and update when the Board approves the final version? And the [X]% targets — who sets them, by when? (The measures screen will show "target TBC" until then.)
2b. **Category→ambition mapping**: sign off the one-off mapping of the eight risk categories to ambitions/shifts/enablers (I'll propose it; five minutes to review).
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
