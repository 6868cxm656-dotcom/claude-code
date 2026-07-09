# Budget Dashboard (prototype)

A prototype budget dashboard for The Churchill Fellowship. It turns the annual
budget workbook (Xero-coded lines) into a single self-contained HTML page with:

- **Organisation overview** — total budget, spend vs year-to-date budget by
  department, budget by activity (the rollup used in the trustee management
  accounts), and a department scorecard with RAG status.
- **Budget holder view** — one view per department: their budget lines grouped
  by activity, budget vs actual with status chips, monthly phasing chart, and
  the budget breakdown/justification behind each line.
- **Data health** — the checks a monthly upload would run automatically: dead
  lines, micro-budgets, missing phasing, and phasing that doesn't reconcile to
  the annual figure.

## Usage

```
pip install openpyxl
python3 build.py "2026-27 Budget.xlsx" dashboard.html
```

The workbook is expected in the current 26/27 budget layout: header row 3 with
Department / Classification / Activity / Type / Code / Acc Name in columns A–F,
2025-26 budget/re-reforecast/actuals in H/J/M, the 2026-27 budget in N,
contingency in O, description in P, and monthly phasing (Oct–Sep) in U–AF.
Column positions are set in `extract_budget.py`.

## Important

The generated HTML **embeds the real budget data**. This repository is public —
never commit a generated dashboard or a real budget workbook here. Build
locally and share the output privately.

## Status

Prototype. Known simplifications:

- 25/26 year-to-date budget is straight-lined (6/12 of the re-reforecast)
  because the workbook holds no 25/26 monthly phasing. A live version should
  use phased budgets (and monthly actuals) exported from Xero.
- "Budget holder" is currently synonymous with "department". A production
  version needs a cost-centre → budget-holder mapping and per-holder access
  control (e.g. Microsoft 365 sign-in) instead of the department selector.
- Actuals come from the workbook snapshot, not from a monthly Xero export yet.
