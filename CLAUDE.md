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
  index.html            menu board (landing page)
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
| 1 | Industry Ranking | BSP ranking PDFs (public) | HTML slide deck, 2-page Word report | Logic exists as a Claude skill; port it |
| 2 | QR Ph P2B Biller Directory | Biller masterlist Excel | Alphabetized Word directory | Logic exists as a Claude skill; port it |
| 3 | DRB Usage | Excel | Report + charts | Needs column spec |
| 4 | DRB Enrollees | Excel | Report + charts | Needs column spec |
| 5 | DRB Idle Accounts | Excel | Report + charts | Needs column spec |
| 6 | RIB Advisory Generator | .eml / .msg email, pasted email text, or manual form | Subject + body (Trebuchet MS, size 3; formatted or plain copy), status tracker, filterable Prod compilation (Word / PDF) | **Built 2026-10-09** as standalone page `rib.html` + `skills/rib-advisory.js`; link from the menu board when the shell is in the repo |
| 7 | Research Library | Past studies + templates | Browse, search, new-study template | — |
| 8 | Types of Complaints | TBD | Report + charts | **On hold** pending Customer Service |

## Module 6: RIB Advisory Generator (built 2026-10-09)

Files: `rib.html` (page and UI), `skills/rib-advisory.js` (templates, builders, checks, email parsing; pure functions on `window.RIB`), `vendor/cfb.min.js` (SheetJS CFB, Apache-2.0, reads Outlook .msg), `samples/rib/` (synthetic emails). It is an interactive tool, so it is a page rather than an `analyze/render` skill; it registers a launcher with `page: 'rib.html'` if `Portal.registerSkill` exists.

- **Users:** Fons now, Ms. Nicole later. "Prepared by" is stored on each advisory.
- **Workflow:** email → draft → post on UAT → Ms. Rocky's approval → post on Prod. Statuses: Drafted → Posted on UAT → For Ms. Rocky's approval → Posted on Prod (with dates and who did it). The portal never posts.
- **Input options:** upload `.eml` (Outlook on the web) or `.msg` (Outlook desktop); paste email text; or fill the form. Email reading is rule-based (dates, times, overnight windows, services, standard lines); the user confirms every field.
- **Categories** (only those with examples in the RIB Inbox / BSP CPR compilation decks): System Maintenance, BSP CPR, Security Advisory, Sterling Bank Online / Product Advisory, Regulatory Advisory, InstaPay/PESONet Unavailability, InstaPay/PESONet Resumption. Wording follows the 2026 posts (older deck examples for the InstaPay/PESONet ones). All wording lives in the `C` config block of the skill file.
- **Footer (official, version A):** "For inquiries or concerns, you may contact our 24/7 Customer Service Helplines at +632 8721 6000 or +632 8672 6300 or email customer.service@sterlingbankasia.com."
- **BSP CPR:** BSP sends it weekly; keep or rewrite. Subject "Tips to fight financial fraud", optional opening line, body, standard "Makipag-ugnayan agad…" line, closing hashtag line. "Week of" and release date are tracked metadata.
- **Output:** subject and body copied separately; body as formatted (`<font face="Trebuchet MS" size="3">`, bold title and date/time phrase) or plain text. The date line is the Prod posting date.
- **Checks:** weekday vs date, year vs posting year, CPR release date inside its week, repeated words, double spaces, space before punctuation, known typos, footer off, missing fields.
- **Compilation:** one list of all Prod posts (date, category, text, Prod screenshots; no UAT). Filter by category, date range and keyword. Export the filtered view to Word (MHTML .doc with images) or print to PDF.
- **Storage:** connected folder → `RIB Advisories/entries/<id>.json`, `screenshots/`, `emails/` (one file per advisory so two users do not overwrite each other). Without folder access it falls back to browser storage, with backup export/import (JSON with embedded images). The compilation starts from posts on or after 2026-09-07 (starter backup kept outside the repo).

Knowledge tab (separate page, not a skill): directory, org chart, branch list, product/fee summaries, P2B biller list, templates. Source data is Excel/PDF; the portal imports Excel and writes a `data/*.js` file.

## Design

- Landing page is a **menu board**: large tiles grouped by section (Quarterly Reports, RIB, Research, Knowledge).
- SBA navy + amber base with cream surfaces, but with its own Marketing identity (distinct from the standard deck look).
- Components: KPI tiles with big numbers, navy-header tables with cream rows, rounded cards, process/flow visuals.
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
- [x] RIB advisory format rules (module 6 above)
- [ ] Edge test of `rib.html` (clipboard formatting, folder access, .msg reading) on the office desktop
- [ ] Complaints data format (Customer Service)
- [ ] SBA-approved interpretation thresholds
