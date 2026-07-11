"""Build the budget dashboard from the budget workbook and (optionally) the
monthly Xero variance report.

Usage:
    python3 build.py <budget-workbook.xlsx> <output.html> [variance-report.xlsx]

Requires: openpyxl (pip install openpyxl)

Runs the extractors, generates the proposed-structure mapping, injects all
three payloads into dashboard_template.html, and writes a single
self-contained HTML file. The output embeds real financial data — do not
commit it to this repository.
"""
import json
import pathlib
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).parent

def run_extractor(script, src):
    with tempfile.NamedTemporaryFile(suffix=".json", mode="r", delete=False) as tmp:
        pass
    subprocess.run([sys.executable, str(HERE / script), src, tmp.name], check=True)
    data = pathlib.Path(tmp.name).read_text()
    pathlib.Path(tmp.name).unlink()
    return data

def main():
    if len(sys.argv) not in (3, 4):
        sys.exit(__doc__)
    budget_src, out = sys.argv[1], sys.argv[2]
    variance_src = sys.argv[3] if len(sys.argv) == 4 else None

    budget = run_extractor("extract_budget.py", budget_src)
    variance = run_extractor("extract_variance.py", variance_src) if variance_src else "[]"

    sys.path.insert(0, str(HERE))
    from structure import STRUCTURE, CODE_TO_LINE
    mapping = json.dumps({
        "structure": {k: {"activity": v[0], "codes": v[1]} for k, v in STRUCTURE.items()},
        "code_to_line": {str(k): v for k, v in CODE_TO_LINE.items()},
    })

    html = (HERE / "dashboard_template.html").read_text()
    html = html.replace("/*__DATA__*/[]", budget)
    html = html.replace("/*__VAR__*/[]", variance)
    html = html.replace("/*__MAP__*/{}", mapping)
    pathlib.Path(out).write_text(html)
    print(f"Dashboard written to {out}")

if __name__ == "__main__":
    main()
