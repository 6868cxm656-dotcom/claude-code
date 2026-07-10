"""Proposed simplified reporting-line structure for The Churchill Fellowship.

Principles applied (approved 10 Jul 2026):
 1. One line = one management decision (>= ~£10k or trustee-required).
 2. Codes say WHAT; department & fund live in Xero tracking (UR/RE pairs merge).
 3. One structure everywhere: every code maps to exactly one reporting line.
 5. Small spend pools into 'Other …' lines with a £10k promotion rule.

Xero codes are NOT deleted — statutory/payroll grain stays. The reporting line
is the management view every report rolls up to.
"""
import json
from collections import defaultdict

# reporting line -> (activity, [codes])
STRUCTURE = {
    # ---------------- INCOME (15 codes -> 8 lines) ----------------
    "Individual giving (incl. Gift Aid & Supporters' Circle)":
        ("Philanthropy & Partnerships", [4110, 4115, 4111, 4140]),
    "Major donors": ("Philanthropy & Partnerships", [4120, 4125]),
    "Fundraising events income": ("Philanthropy & Partnerships", [4130, 4135]),
    "Programme funding partnerships": ("Philanthropy & Partnerships", [4210, 4215]),
    "Trusts & foundations": ("Philanthropy & Partnerships", [4310, 4315]),
    "Legacies": ("Philanthropy & Partnerships", [4510]),
    "Investment income": ("Investment Income", [4810]),
    "Other income": ("Other Income", [4910]),

    # ---------------- GRANTS (10 codes -> 5 lines) ----------------
    "Fellowship grants": ("Fellowship Grant Awards", [5010, 5020, 5030]),
    "Grant supplements (adjustments, bursaries & support pilots)":
        ("Fellowship Grant Awards", [5015, 5035, 5050]),
    "Inclusion pilots (Freelancers & Unpaid Carers)":
        ("Fellowship Grant Awards", [5040]),
    "Activate grants": ("Activate Grant Awards", [5025, 5026]),
    "Other grant-related costs": ("Fellowship Grant Awards", [5090]),

    # ---------------- PROGRAMME STAFFING (2 lines) ----------------
    "Programme staffing (salaries, NI, pension & statutory)":
        ("Direct Programme Staffing", [6010, 6015, 6020, 6040]),
    "Programme consultants & freelance support":
        ("Direct Programme Staffing", [6030]),

    # ---------------- PROGRAMME OPERATIONS (6 lines) ----------------
    "Programme events & convening": ("Direct Programme Operational", [6150, 6151]),
    "Programme travel & accommodation": ("Direct Programme Operational", [6155, 6156]),
    "Campaigns & promotion": ("Direct Programme Operational", [6115, 6120]),
    "Monitoring, evaluation & research": ("Direct Programme Operational", [6125, 6130]),
    "Fellow engagement & support": ("Direct Programme Operational", [6135]),
    "Other programme costs (pool)":
        ("Direct Programme Operational", [6110, 6140, 6145, 6190]),

    # ---------------- SUPPORT STAFFING (4 lines) ----------------
    "Support staffing (salaries, NI, pension & statutory)":
        ("Support Staffing", [8010, 8015, 8020, 8040, 8090]),
    "Support consultants": ("Support Staffing", [8030]),
    "Staff training & development (org-wide)":
        ("Support Staffing", [8035, 6035, 7030]),
    "Recruitment": ("Support Staffing", [8045]),

    # ---------------- SUPPORT OPERATIONS (6 lines) ----------------
    "Office & facilities": ("Support Operational", [8110, 8115, 8120, 8125, 8130]),
    "IT & systems (incl. Salesforce)":
        ("Support Operational", [8310, 8315, 8320, 8325, 8330, 8335]),
    "Communications & website": ("Support Operational", [8210, 8215, 8220, 8225, 8230]),
    "Insurance, legal & professional": ("Support Operational", [8510, 8515, 8525]),
    "Staff travel & hospitality (support)":
        ("Support Operational", [8410, 8415, 8420, 8425]),
    "Other support costs (pool)":
        ("Support Operational", [8520, 8530, 8535, 8540, 8545, 8590]),

    # ---------------- FUNDRAISING (4 lines) ----------------
    "Fundraising staffing (salaries, NI & pension)":
        ("Cost to Fundraise", [7010, 7015, 7020]),
    "Fundraising operations & engagement (pool)":
        ("Cost to Fundraise", [7025, 7110, 7115, 7120, 7125, 7135, 7140,
                               7145, 7146, 7150, 7151, 7155, 7160, 7190]),
    "Events & special events (costs)":
        ("Cost to Fundraise", [7210, 7215, 7220, 7225, 7230, 7290, 7310, 7315]),
    "Investment management fees": ("Investment Management", [7410]),

    # ---------------- GOVERNANCE & DEPRECIATION (3 lines) ----------------
    "Investment gains/(losses), realised & unrealised":
        ("Investment Gains/(Losses)", [8800]),
    "Audit, legal & professional (governance)": ("Governance", [8710, 8720]),
    "Trustee costs": ("Governance", [8715, 8725, 8730, 8735, 8740, 8790]),
    "Depreciation": ("Depreciation", [8610, 8615, 8620, 8625]),
}

# invert: code -> line
CODE_TO_LINE = {}
for line, (act, codes) in STRUCTURE.items():
    for c in codes:
        assert c not in CODE_TO_LINE, f"code {c} mapped twice"
        CODE_TO_LINE[c] = line

if __name__ == "__main__":
    var = json.load(open("variance_data.json"))
    bud = json.load(open("budget_data.json"))

    all_codes = {r["code"] for r in var if r["code"] != 8999} | \
                {r["code"] for r in bud if r["code"]}
    unmapped = sorted(all_codes - set(CODE_TO_LINE))
    assert not unmapped, f"codes with no destination: {unmapped}"

    json.dump({"structure": {k: {"activity": v[0], "codes": v[1]}
                             for k, v in STRUCTURE.items()},
               "code_to_line": {str(k): v for k, v in CODE_TO_LINE.items()}},
              open("structure_mapping.json", "w"))

    # before/after stats
    inc_lines = [l for l, (a, _) in STRUCTURE.items()
                 if a in ("Philanthropy & Partnerships", "Investment Income", "Other Income")]
    print(f"Codes mapped: {len(CODE_TO_LINE)}")
    print(f"Reporting lines: {len(STRUCTURE)} ({len(inc_lines)} income, {len(STRUCTURE)-len(inc_lines)} expenditure)")

    # budget workbook rows before/after (dept x reporting line, nonzero 26/27)
    before = sum(1 for r in bud)
    combos = {(r["dept"], CODE_TO_LINE[r["code"]]) for r in bud
              if r["code"] and (r["b2627"] or 0) != 0}
    print(f"Budget workbook rows: {before} -> {len(combos)} (dept x line, nonzero 26/27)")

    # variance report rows before/after
    vrows = [r for r in var if r["code"] != 8999]
    after = {CODE_TO_LINE[r["code"]] for r in vrows}
    print(f"Variance report rows: {len(vrows)} -> {len(after)}")

    # totals reconcile
    tot_before = sum(r["ytd_act"] for r in vrows)
    agg = defaultdict(float)
    for r in vrows:
        agg[CODE_TO_LINE[r["code"]]] += r["ytd_act"]
    assert abs(sum(agg.values()) - tot_before) < 0.01
    print("Totals reconcile: OK")
