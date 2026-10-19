# DRB Usage practice files (SYNTHETIC TEST DATA)

Made-up files in the same layouts the DRB Usage page reads. No real bank data.

They live in the practice portal folder:

```
samples/SBA Portal Files (practice)/DRB Usage/
  2026-Q3/
    Ms. Hong/                 SYNTHETIC DRB Usage Q3 2026.xlsx       (RAW sheet, 4,000 rows)
    Sir Jun/                  SYNTHETIC DRB REPORTS Sep 2026 Summary.xlsx
                              SYNTHETIC Sep 2026 ITCom DCB REPORTS.xlsx
                              SYNTHETIC DRB DCB Stats Q3 2026.xlsx
    Automailer/               SYNTHETIC RIB Idle Accounts Report 10012026.xlsx
    RIB Inbox shared drive/   SYNTHETIC RIB Usage Q3 2026.xlsx
  Outputs/                    DRB Usage Q2 2026 - Worked Figures (TEST DATA).xlsx   (last quarter, read for the comparison)
```

## CIF Profile to type (Q3 2026, practice)

| Figure | Value |
|---|---|
| Total CIFs | 5000 |
| Total enrolled CIFs | 2600 |
| CIFs with usage | 880 |
| Inactive CIFs (override) | leave blank |

| Generation | Active | Idle |
|---|---|---|
| Gen Alpha | 200 | 423 |
| Gen Z | 159 | 381 |
| Millennials | 66 | 98 |
| Gen X | 237 | 522 |
| Baby Boomers | 7 | 341 |
| Silent Gen | 44 | 220 |
| Greatest Gen | 107 | 318 |

| Staff tag | Active | Idle |
|---|---|---|
| Non-staff (N) | 757 | 2261 |
| Staff (Y) | 60 | 40 |
| Blank | 3 | 2 |

Expected result: 24 checks PASS, 0 FAIL, 5 REVIEW. The workbook follows the layout of the `drb-usage-report` skill's Q3 2026 workbook (two ways of counting active clients, QR by month).
