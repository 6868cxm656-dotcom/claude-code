"""Build the budget dashboard from a budget workbook.

Usage:
    python3 build.py <budget-workbook.xlsx> <output.html>

Requires: openpyxl (pip install openpyxl)

Parses the workbook with extract_budget.py's logic, injects the rows into
dashboard_template.html, and writes a single self-contained HTML file.
The output embeds real financial data — do not commit it to this repository.
"""
import json
import pathlib
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).parent

def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    src, out = sys.argv[1], sys.argv[2]
    with tempfile.NamedTemporaryFile(suffix=".json", mode="r+") as tmp:
        subprocess.run(
            [sys.executable, str(HERE / "extract_budget.py"), src, tmp.name],
            check=True,
        )
        tmp.seek(0)
        data = tmp.read()
    template = (HERE / "dashboard_template.html").read_text()
    pathlib.Path(out).write_text(template.replace("/*__DATA__*/[]", data))
    print(f"Dashboard written to {out}")

if __name__ == "__main__":
    main()
