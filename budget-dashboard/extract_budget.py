"""Parse the 26/27 budget workbook (Xero-coded lines) into clean JSON for the dashboard.

Columns (header row 3):
  A Department | B Classification | C Activity | D Type | E Code | F Acc Name
  H 2025-26 Budget | J 2025-26 Re-Reforecast | M 2025-26 Actuals to Mar26
  N 2026-27 Budget | O Contingency | P 2026-27 description
  U..AF monthly phasing Oct..Sep (26/27)
"""
import json, sys
import openpyxl

SRC = sys.argv[1]
OUT = sys.argv[2]

wb = openpyxl.load_workbook(SRC, data_only=True)
ws = wb["Sheet1"]

def num(v):
    return round(float(v), 2) if isinstance(v, (int, float)) else None

rows = []
for row in ws.iter_rows(min_row=4):
    if row[0].value is None:
        continue
    phase = [num(row[20 + i].value) or 0 for i in range(12)]  # U..AF
    rows.append({
        "dept": str(row[0].value).strip(),
        "cls": str(row[1].value).strip() if row[1].value else "",
        "act": str(row[2].value).strip() if row[2].value else "Unclassified",
        "typ": str(row[3].value).strip() if row[3].value else "Other",
        "code": row[4].value,
        "name": str(row[5].value).strip() if row[5].value else "",
        "b2526": num(row[7].value),      # H  2025-26 original budget
        "rf2526": num(row[9].value),     # J  2025-26 re-reforecast
        "a2526": num(row[12].value),     # M  actuals Oct25-Mar26 (6 months)
        "b2627": num(row[13].value),     # N  2026-27 budget
        "cont": num(row[14].value),      # O  contingency
        "desc": str(row[15].value).strip() if row[15].value else "",
        "phase": phase,
    })

with open(OUT, "w") as f:
    json.dump(rows, f)
print(f"{len(rows)} lines -> {OUT}")
