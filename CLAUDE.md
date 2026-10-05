# SBA Marketing Portal

Offline, browser-only portal for Sterling Bank of Asia (SBA) Marketing. It turns recurring raw files into management-ready outputs and acts as a reference hub. Phase 1 serves one user (Fons, Product Manager Officer); Phase 2 extends to the team via a shared drive.

Target: fully working demo by mid-December 2026.

## Hard constraints (never break these)

1. **No network calls at runtime.** No CDNs, web fonts, analytics, APIs, or AI/LLM calls. Every library is vendored into `vendor/`.
2. **No install, no server, no build step required to run.** The portal opens by double-clicking `index.html` (`file://`) in Edge or Chrome on a locked-down Windows desktop with no admin rights. No Node, Python, or localhost at runtime.
3. **Because of `file://`:** no ES module imports, no `fetch()` of local files, no service workers. Load everything with classic `<script src>` tags. Data files are `.js` files that assign to a global, not `.json`.
4. **No real bank data in this repo.** Ever. Use only synthetic data in `samples/`. Real files are read locally by the finished portal on the office desktop and never leave it.
5. **Deterministic and auditable.** All numbers come from explicit calculations. No generated or guessed figures. Commentary is rule-based text built from computed values.
6. **Thresholds are configuration, not code.** Growth/decline bands and similar rules live in each skill's `rules` block, marked `DRAFT` until SBA approves them. Never invent a threshold silently.
7. **Human in the loop.** The portal drafts; the user reviews, approves and transmits. It never sends, posts, or modifies anything outside the folder the user connected.
8. **Do not bypass browser or SBA security controls.** Folder access happens only through the user-granted File System Access API prompt.

## Folder structure

```
SBA-Portal/
  index.html            Home page (welcome, task shortcuts, picture slots; text in data/home.js)
  modules.html          Modules page: section tabs + skill runner (modules.html#skill/<id>)
  knowledge.html        Knowledge tab (directory, org chart, branches, products, billers, templates)
  assets/               css, images, icons (all local)
  core/                 shared engine (see below)
  skills/               one .js file per skill module
  skills/registry.js    ordered list of skill files to load
  data/                 reference data as .js globals (directory.js, orgchart.js, ...)
  vendor/               SheetJS, PDF.js (+ worker), chart library
  samples/              synthetic input files for testing
  outputs/              default save location (user's connected folder in practice)
```

## Core engine (`core/`)

- `files.js` — file input and folder connection. Uses `showDirectoryPicker({mode:'readwrite'})`, stores the handle in IndexedDB, re-requests permission on reopen. **Must fall back to plain `<input type="file">` and Blob downloads when the API is missing or blocked.**
- `parse.js` — Excel/CSV via SheetJS; PDF text via PDF.js (worker loaded from a Blob URL, since `file://` blocks worker scripts).
- `validate.js` — required columns, types, period checks; returns a clear error list shown to the user before any calculation.
- `calc.js` — shared metrics: totals, period-on-period change, share, rank, rank movement.
- `rules.js` — evaluates a skill's rule set against computed metrics and returns commentary sentences.
- `charts.js` — chart rendering (local library or inline SVG).
- `export.js` — Excel (SheetJS), Word (HTML-as-.doc first, real .docx later), print-to-PDF stylesheet, HTML slide deck.
- `ui.js` — shell, navigation, skill runner screen.

## Skill module contract

A "skill" is one file in `skills/` that registers itself. Adding a skill means adding one file plus one line in `skills/registry.js`; core code must not change.

```js
Portal.registerSkill({
  id: 'industry-ranking',
  title: 'Industry Ranking',
  group: 'Quarterly Reports',          // menu board section
  description: 'BSP thrift-bank ranking deck and President\'s report',
  inputs: [                            // what the user must supply
    { key: 'assets', label: 'Ranking as to Total Assets', type: 'pdf', required: true }
  ],
  params: [ { key: 'period', label: 'Quarter', type: 'quarter' } ],
  validate(inputs, params) { return [] },      // array of error strings
  analyze(inputs, params) { return {} },       // pure function: metrics object
  rules: { status: 'DRAFT', bands: [] },       // thresholds + commentary templates
  outputs: [                                   // each renders from the metrics object
    { key: 'deck',   label: 'Slide deck',        format: 'html-slides', render(m) {} },
    { key: 'report', label: 'President report',  format: 'word',        render(m) {} }
  ]
});
```

`analyze` must be a pure function with no DOM access, so it can be unit-tested with sample data.

## Modules and build order

| # | Skill | Inputs | Outputs | Status |
|---|---|---|---|---|
| 1 | Industry Ranking | BSP ranking PDFs (public): Thrift Bank Group **and** Universal & Commercial Bank (UKB) Group | HTML slide deck, 2-page Word report | Logic exists as a Claude skill; port it |
| 2 | QR Ph P2B Biller Directory | Biller masterlist Excel | Alphabetized Word directory | Logic exists as a Claude skill; port it |
| 3 | DRB Usage | Excel | Report + charts | Needs column spec |
| 4 | DRB Enrollees | Excel | Report + charts | Needs column spec |
| 5 | DRB Idle Accounts | Excel | Report + charts | Needs column spec |
| 6 | RIB Advisory Formatter | Pasted advisory text | Clean plain text for the UAT editor, plus a status tracker (received / drafted in UAT / for approval / posted to Prod) | Needs format rules |
| 7 | Research Library | Past studies + templates | Browse, search, new-study template | — |
| 8 | Types of Complaints | TBD | Report + charts | **On hold** pending Customer Service |

Knowledge tab (separate page, not a skill): directory, org chart, branch list, product/fee summaries, P2B biller list, templates. Source data is Excel/PDF; the portal imports Excel and writes a `data/*.js` file.

## Design

- **Home** (`index.html`) is separate from the module tabs (`modules.html`). Home has picture slots: files in `assets/images/` named in `data/home.js` (missing file = labelled placeholder). Plain, layman wording throughout.
- The site is for the **Marketing Group only**; say so in the top bar, Home hero and footer.
- Corporate-website look (2026-10-05 redesign, per Fons): deep navy + corporate blue on white and cool greys; only a hint of SBA yellow (#f0b323: active nav/tab underline, Home primary button, footer rule, restricted badge). Every page: utility bar, sticky masthead nav, multi-column footer.
- Components: KPI cards with big numbers, navy-header tables with light zebra rows, rounded cards, process/flow visuals.
- System font stack only. Must be readable at 1366×768.
- Every output has a print stylesheet.

## Working rules for Claude Code

- Plain HTML, CSS and vanilla JS. No frameworks, no bundler, no TypeScript.
- Test by opening `index.html` directly via `file://`, not through a dev server.
- When a spec is missing (column names, format rules, thresholds), stop and ask; do not guess. Build against a clearly labelled synthetic sample in the meantime.
- Keep each skill self-contained and under one file.
- Commit small. Update the status column above when a module is done.

## Open items

- [x] Feasibility test passed on the office desktop, Chrome 154 via `file://` (2026-10-05): Excel read, PDF text read, folder connect + write, folder remembered after reopen, Excel/Word/PDF exports. Chrome is the reference browser; Edge not yet tested.
- [ ] Column layouts for DRB Usage, Enrollees, Idle Accounts
- [ ] RIB advisory formatting rules and a before/after example
- [ ] Complaints data format (Customer Service)
- [ ] SBA-approved interpretation thresholds
- [x] Milestone 1 portal shell (2026-10-05): menu board, Knowledge tab (empty), core engine, registry + placeholders, demo skill on synthetic data.
- [x] SheetJS upgraded to 0.20.3 in `vendor/xlsx.full.min.js` (2026-10-05); demo re-tested.
- [x] Menu-board groups accepted for now (2026-10-05); revisit as modules are built (`skills/placeholders.js`).
- [x] Office desktop test of milestone 1 passed (demo run, validation errors, Excel/Word save, folder connect + remembered, print).
- [ ] UI redesign v3 (separate Home with picture slots, Modules tabs, plain wording, yellow hint, Marketing-Group-only notices) built 2026-10-05; awaiting Fons's approval.
- [x] Build order agreed (2026-10-05): UI refresh → Industry Ranking (thrift + UKB) → DRB Usage.
- [x] Q1 2026 thrift Stockholders' Equity figures come from the predecessor's workbook `samples/industry-ranking/2026-Q1-march/Industry Ranking as of March 31, 2026 v2.xlsx` (no PDF).
