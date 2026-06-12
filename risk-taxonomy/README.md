# TCF Risk Taxonomy & Register

Working files for the TCF risk management overhaul (autumn 2026), built on the DRAFT v3 taxonomy.

| File | What it is |
|---|---|
| `tcf-risk-register.html` | **Interactive risk register** — a single self-contained file, no install or internet needed. Open it in any browser. |
| `TCF_Risk_Taxonomy_v3.md` | The taxonomy as a readable reference: purpose, L1/L2 structure, owners, draft appetite. |
| `tcf_risk_taxonomy_v3.csv` | The taxonomy as flat data (one row per Level 2 area). |
| `TCF_Risk_Taxonomy_DRAFT_v3.pptx` | The original SLT slide deck. |

## Using the register

- **Share it** by sending the HTML file (email/SharePoint/Teams) or hosting it on a web page. Everyone gets the same baseline of 41 draft starter risks.
- **Edit your areas**: pick your name under "I am" in the header. Each SLT member can add, edit and delete risks only in the Level 1 categories they own; "Risk lead" can edit everything; "Viewer" is read-only.
- **Scoring**: 5×5 likelihood × impact, one residual score per risk (after current controls). Bands: Low 1–4, Moderate 5–9, High 10–15, Severe 16–25.
- **Appetite check**: every risk is compared against its Level 2 area's draft appetite (Averse tolerates ≤4, Balanced: averse ≤9, Balanced: seeking ≤15, Seeking ≤25). Risks above tolerance are flagged "outside appetite" on the dashboard and register. These thresholds are draft calibrations for SLT to challenge.
- **Saving and sharing edits**: changes save automatically in your browser. To pass them around, use **Export my areas** (JSON) and send the file; the recipient clicks **Import / merge** — for each risk the newer edit wins. **Export all** and **CSV** give full snapshots; CSV opens in Excel for Board papers.
- **Consolidated baseline (June 2026)**: the legacy register (52 risks, `legacy_risk_register_2025.xlsx`) was merged with the taxonomy starter set into 40 risks in consistent cause-and-consequence language. Each carries a `Legacy:` reference back to the old register where applicable. Risks tagged **DRAFT** are either new generic risks the legacy register didn't cover (portal, office move, AI, liquidity, data protection…) or legacy risks whose score needs confirming (some were unscored).
- **Committee allocation**: every risk is assigned to Board, PFC, ARGC, IC or RNC ("Reviewed by"), filterable on the register — this drives the owner pre-reviews and subcommittee scrutiny in the process cycle.
- **Last amended** is shown per risk on the register and recorded automatically on every save.
- **Access control**: on the Cloudflare-protected site the app reads the signed-in email and assigns permissions automatically — Jim and Julia edit all areas; Nikesh, Jacqui and Chris edit their own areas and view the rest; anyone else is read-only. Local file copies fall back to the manual "I am" picker.
- **Review flagging**: anyone (except viewers) can flag any risk with a note; the flag is recorded in the risk's history, badged across the app and in packs, and a pre-addressed email to the owner opens for sending. Owners/admins (or the flagger) clear flags. Owner email addresses and committee meeting dates are maintained under **⚙ Meetings & contacts** (admins only) and travel with exports.
- **Committee pack**: a printable PDF snapshot per committee (Board sees everything) — overview KPIs, the committee's register, detail boxes for flagged/outside-appetite risks, and a change log since that committee's last recorded meeting date.
- **Change control**: every save records who changed what (field-level, from → to) in a history that travels with each risk through exports and merges. Deletions are kept as tombstones. The **Change report** tab reconstructs the register as it stood on any two dates and shows the Board: profile movement (totals, outside-appetite, severe/high counts, average score), each changed risk with score movement and appetite-status changes, plus risks added and removed — printable to PDF for Board papers.
