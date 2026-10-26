# samples/industry-ranking/

Public BSP ranking pages (bsp.gov.ph, Financial Statements) used to build and test the Industry Ranking skill.
Not synthetic, but public data, so allowed in the repo. Do not add internal SBA notes here.

| Folder | Period | Thrift Bank Group | Universal & Commercial (UKB) |
|---|---|---|---|
| `2026-Q2-june/` | As of 30 June 2026 | Assets, Deposits, Loans & Receivables, Stockholders' Equity | Same 4 |
| `2026-Q1-march/` | As of 31 March 2026 | Assets, Deposits, Loans & Receivables + predecessor's raw-data workbook (`.xlsx`, includes Equity) | Assets, Deposits |
| `reference/` | March 2026 | SBA's past Industry Ranking deck (.pptx), for matching layout | — |

**Synthetic test file:** `2026-Q1-march/SYNTHETIC TEST - Thrift Bank Total Stockholders Equity - ao March 2026.pdf` fills the missing Q1 Capital page for testing only. Ranks 1-10 are the real March 2026 figures from the predecessor's workbook; ranks 11-42 are **invented**. The portal detects it, shows a red warning, and stamps the deck, report and Excel "TEST DATA - NOT FOR CIRCULATION". For a real report, use the workbook instead.

**Which box?** It doesn't matter: the portal sorts the PDFs by their "As of" date (latest = this quarter). Practice run: `2026-Q2-june` = this quarter, `2026-Q1-march` (+ workbook) = previous quarter.
