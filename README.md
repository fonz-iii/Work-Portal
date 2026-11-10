# SBA Marketing Portal

Offline, browser-only portal for the SBA Marketing Group. See `CLAUDE.md` for the full spec.

**Run:** double-click `Marketing Portal/Marketing Portal.html` (Chrome or Edge). No install, no server, no internet.

```
Marketing Portal/                   the only folder that goes to the office PC (or the shared drive)
  Marketing Portal.html             the app: every page, one file (#home, #pm, #drb, #rib, #research, #employee-info, #help …)
  System files (do not touch)/      assets (css, images, icons), core, skills, pages, data, vendor
  Employee Info/                    phone directory + Code of Conduct
  Product Management/               Industry Ranking, QR Ph Billers, DRB Usage, RIB Advisories, Research Library, KRI Report
                                    (each task keeps its own Outputs folder)
  Creatives/  Customer Service/Types of Complaints/  Fraud Management/
samples/                            synthetic and public practice files (never real data)
```

**Folder access:** click *Choose folder* in the top bar and pick the `Marketing Portal` folder itself. The pages read each task's newest file from its folder and save outputs into its `Outputs` folder; without folder access, files are chosen by hand and saved to Downloads. Real files in the team folders are ignored by git (`.gitignore`); only the empty folder markers are committed.

**Practice:** choose `samples/Marketing Portal (practice)` instead. **Demo:** Product Management › *Demo: Branch Deposits* with `samples/demo-branch-deposits.xlsx`.

Vendored libraries (`System files (do not touch)/vendor/`): SheetJS 0.20.3, PDF.js 3.11.174, JSZip 3.10.1, SheetJS CFB, Tesseract 5 OCR core + English data.
