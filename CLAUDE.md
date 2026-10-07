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
  modules.html          Product Management page (section tabs) + skill runner (#skill/<id>) + coming-soon team pages (#cat/<id>)
  help.html             How to use the site (plain-language guide, error table, FAQ)
  knowledge.html        Employee Info page (phone directory + Code of Conduct; more sections later). Logic in core/knowledge.js
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
- `knowledge.js` — Employee Info page: pure parsers `parseDirectory(book)` / `parseCode(pages)`, IndexedDB cache (`sba-portal-reference`), search UI.

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
| 1 | Industry Ranking | BSP thrift-bank ranking PDFs (public), this + previous quarter; old workbook fills prior gaps | HTML slide deck (14 slides), 2-page Word report, Excel figures | **Done 2026-10-06** (`skills/industry-ranking.js`; thrift only) |
| 2 | QR Ph P2B Biller Directory | Biller masterlist Excel | Alphabetized Word directory | Logic exists as a Claude skill; port it |
| 3 | DRB Usage | Excel | Report + charts | **On hold** (2026-10-07): Fons is writing the skill |
| 4 | DRB Enrollees | Excel | Report + charts | Needs column spec |
| 5 | DRB Idle Accounts | Excel | Report + charts | Needs column spec |
| 6 | RIB Advisory Formatter | Pasted advisory text | Clean plain text for the UAT editor, plus a status tracker (received / drafted in UAT / for approval / posted to Prod) | Needs format rules |
| 7 | Research Library | Past studies + templates | Browse, search, new-study template | — |
| 8 | Types of Complaints | TBD | Report + charts | **On hold** pending Customer Service |

**Employee Info** page (`knowledge.html`, renamed from Knowledge 2026-10-07; not a skill): searchable **Employee Directory** tab (renamed from Phone Directory 2026-10-07; own search box plus the page-wide one; SBA phone directory .xls: Name/Local/Direct block sheets, Branches sheet, Globe mobile list) and Code of Conduct reader (PDF split into Article/Chapter/Section with page numbers). **These are real internal files: they are loaded on the office PC and cached only in that browser's IndexedDB; never commit them or anything derived from them.** Practice files: `samples/employee-info/` (synthetic). Later sections: org chart, products/fees, P2B billers, templates.

## Design

- **Site structure (2026-10-06, per Fons):** four teams. **Product Management** (live) holds every module, in sections Benchmarking, DRB Reports, RIB, Research, Customer Insights and Demo. **Creatives**, **Customer Service** and **Fraud Management System** are "Coming soon" pages. A skill may set optional `category` (default `'pm'`); `group` is its section. Teams and section order live in `core/ui.js` (`TEAMS`, `SECTION_ORDER`).
- **Pages:** Home (`index.html`: search box, team picker, section shortcuts, picture slots from `data/home.js` + `assets/images/`, how-it-works), Product Management (`modules.html`), Employee Info (`knowledge.html`), How to use (`help.html`). Every page has breadcrumbs ("You are here"), back links on report pages and a floating "How to use" button. Plain, layman wording throughout.
- The site is for the **Marketing Group only**; say so in the top bar, Home hero and footer.
- **Look:** modern corporate, a little playful. Deep navy + corporate blue on soft cool greys, a hint of SBA yellow (#f0b323: active menu underline, Home primary button, footer rule, restricted badge, icon accents). Rounded cards (16px), pill buttons, soft shadows, hover lift. System font stack only. Readable at 1366×768.
- **Scroll-reactive background:** fixed layer of soft blurred shapes + dot grid behind the content. Each section has `data-scene` (hero, sky, gold, mint, navy, calm); the scene of the section most on screen colors the shapes, and they drift with scroll. Cards fade up as they come into view. All motion is off under `prefers-reduced-motion` and in print.
- **Light / Dark toggle** in the top utility bar (default Light, never follows the OS). Choice stored in localStorage (try/catch) and applied as `data-theme` on `<html>` by an inline head script, so there is no flash. Dark values redefine the same CSS custom properties under `:root[data-theme="dark"]` in `assets/css/portal.css`. Generated reports, Word/Excel exports and print always stay light.
- Components: KPI cards with big numbers, navy-header tables with light zebra rows, rounded cards, process/flow visuals. Every output has a print stylesheet.

## Working rules for Claude Code

- Plain HTML, CSS and vanilla JS. No frameworks, no bundler, no TypeScript.
- Test by opening `index.html` directly via `file://`, not through a dev server.
- When a spec is missing (column names, format rules, thresholds), stop and ask; do not guess. Build against a clearly labelled synthetic sample in the meantime.
- Keep each skill self-contained and under one file.
- Commit small. Update the status column above when a module is done.

## Open items

- [x] Feasibility test passed on the office desktop, Chrome 154 via `file://` (2026-10-05): Excel read, PDF text read, folder connect + write, folder remembered after reopen, Excel/Word/PDF exports. Chrome is the reference browser; Edge not yet tested.
- [ ] Column layouts for DRB Usage, Enrollees, Idle Accounts (DRB Usage on hold 2026-10-07 while Fons writes its skill)
- [ ] RIB advisory formatting rules and a before/after example
- [ ] Complaints data format (Customer Service)
- [ ] SBA-approved interpretation thresholds
- [x] Milestone 1 portal shell (2026-10-05): menu board, Knowledge tab (empty), core engine, registry + placeholders, demo skill on synthetic data.
- [x] SheetJS upgraded to 0.20.3 in `vendor/xlsx.full.min.js` (2026-10-05); demo re-tested.
- [x] Menu-board groups accepted for now (2026-10-05); revisit as modules are built (`skills/placeholders.js`).
- [x] Office desktop test of milestone 1 passed (demo run, validation errors, Excel/Word save, folder connect + remembered, print).
- [x] UI v4 "Regulatory clarity" design system tried 2026-10-06 and reverted at Fons's request; kept only the Light/Dark toggle on top of v3.
- [ ] UI v5 (teams, help page, search, scroll-reactive background; v3 colors + Light/Dark) built 2026-10-06; awaiting Fons's approval.
- [x] Build order agreed (2026-10-05): UI refresh → Industry Ranking (thrift + UKB) → DRB Usage.
- [x] Q1 2026 thrift Stockholders' Equity figures come from the predecessor's workbook `samples/industry-ranking/2026-Q1-march/Industry Ranking as of March 31, 2026 v2.xlsx` (no PDF).
- [ ] **Later (Fons, 2026-10-06):** revisit how modules/documents are categorized under Product Management.
- [x] **Done 2026-10-06:** floating "Suggest a change" button (sends to ablozano@sterlingbankasia.com; address in `data/feedback.js`). Original note: next to "How to use". Proposed design (needs Fons's OK + work email): a short in-portal form (page, what to change, why, name) that opens a pre-filled email to Fons via a `mailto:` link, so the user's own mail app sends it (portal makes no network call; human clicks Send). Fallbacks: "Copy text" button; in Phase 2, save the suggestion as a file in a shared-drive folder.
- [x] Industry Ranking built 2026-10-06 (Fons's decisions): thrift banks only (no UKB); no "What we're watching"; no Recommendations slide; thin-cushion rule removed; editable wording on screen; Word via HTML-as-.doc; logos in `data/brand-logos.js`; bank groupings in `data/industry-ranking-config.js`. Verified against the original Python skill on Q2 2026 vs Q1 2026: every rank, amount, growth, median, gap and drafted sentence identical (only difference: "Northpoint Dev't Bank" capitalisation, deliberate).
- [ ] Reminder for Fons each quarter: save all four BSP thrift PDFs (BSP replaces the pages), and keep them with the outputs.
- [x] Office test of Industry Ranking passed 2026-10-06 (Chrome via file://): run Q2 2026, open the deck in Chrome, print to PDF (landscape, no margins, background graphics on), open the .doc in Word.
- [x] Industry Ranking hardened 2026-10-06 after Fons's office test (files were in swapped boxes): both boxes accept PDFs or the workbook, and files are sorted by their "As of" date with a note. Synthetic Q1 Capital test PDF added in samples; any file containing "SYNTHETIC TEST DATA" triggers a red warning and TEST DATA stamps on all outputs.
- [x] Employee Info page built 2026-10-07: Phone Directory + Code of Conduct, searchable; files loaded locally and cached in the browser only. Parser checked locally against Fons's real files (July 2026 directory: 619 people, 47 branches, 0 unplaced rows; Code of Conduct rev. 2016: 62 sections) without committing them.
- [ ] Office test of Employee Info: load both real files in Chrome, search, reopen (remembered), Replace, Remove.
