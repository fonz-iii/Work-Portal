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
  assets/               tokens.css, app.css, fonts/, images/, icons/ (all local)
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

Direction: **"Regulatory clarity"** — a BSP statistical bulletin set by a careful designer, made into a working tool with some web-SaaS polish. Flat fills, strong left edge (the rail), big serif numbers, one accent. No gradients, glows or shadows. Styles live in `assets/tokens.css` (all colors, type, spacing as CSS custom properties) and `assets/app.css` (components). **No component hard-codes a color.**

- **Tokens:** Navy #0A2A66 · Amber #F5A623 · Deep Slate #16324F · Ink #16181D · Surface #FFFFFF · Cream #FFF6E6 · Canvas #EFF1F5 · Peer #E4E8EE · Slate #5A626E · Muted #8A919C (18px+ only) · Rule #D8DCE2 · on navy: white, Mist #C8D2E4, Steel #8FA2C2 · Positive #1F7A4D · Negative #B3261E · Warning #8F5300 · Info #2563A8. Charts: #F5A623 #0A2A66 #2E8B8B #7A5CA8 #C0603A #8A919C, gridlines #DDE2E9, peers #C7CCD4. About 60% neutral / 30% navy / 10% other.
- **Color rules:** amber once per view (current nav item, focus KPI, current runner step or the SBA chart series); never amber text on light surfaces, never decoration. Semantic colors are text/border only; status is a word in a pill (Ready / Draft / On hold). All text meets WCAG AA. Chart series colors are for charts only — no second UI accent.
- **Type:** Source Serif 4 (600 titles, 700 numbers) + Source Sans 3 (400/600/700), bundled as woff2 in `assets/fonts/` (OFL), fallback Georgia/Arial. Sizes: page 32 · section 24 · card 18 · KPI 40 · hero 56 · body 15/1.5 · label 12 uppercase .14em · chart text and source notes 12. Sentence case, no italics, tabular lining figures.
- **Shell:** fixed left rail (amber top 27%, navy below; 232px expanded, 56px collapsed, state remembered). Wordmark in the amber band: "STERLING BANK OF ASIA" eyebrow + "Marketing Portal" (serif); collapsed shows "MP". Light/Dark toggle at the rail bottom. Content on Canvas, max 1280px, 12-column grid, 16px gutter, 32px outer margin, spacing 4/8/12/16/24/32. Tab title "Marketing Portal".
- **Pages:** Home (`index.html`) = start card + picture slot (files in `assets/images/`, names in `data/home.js`) + menu board + highlights + how-it-works; Modules (`modules.html`) = section chips + menu board + skill runner; Knowledge = empty-state cards. The site is for the **Marketing Group only**; say so in the top line and footer.
- **Components:** cards radius 14, no border or shadow (white on Canvas); tiles/tables radius 10, chips 6, pills 999, bar ends 3. Menu board tiles in mixed widths; the first tile per section is navy. KPI tile: navy, Steel label, white serif number, Mist comparator with ▲/▼, max 4 per row. Insight card: Cream, one per view, holds commentary. Table: navy header, Cream rows with Rule hairlines, numbers right, units in header, SBA row bold with amber marker (`tr.is-sba td.name`), sticky header, Peer hover. Buttons 40px radius 8: primary navy, secondary white + Rule border, tertiary text. Focus 2px navy (white/Mist on dark). Drop zone: dashed Rule, navy + Cream on drag-over, shows name, size and check result. Runner stepper 1 Inputs · 2 Check · 3 Results · 4 Export, current step amber, joined by a 1px Ink line. Error/warning callouts: white, 1px Negative/Warning border, uppercase label. Empty states: serif line + sans line + one button.
- **Charts** (`core/charts.js`): direct labels, no legend, no pies, vertical gridlines only, SBA amber, peers grey, scope-and-date source note. UI charts read colors from CSS variables via `Portal.charts.mount()` and redraw on theme change.
- **Dark mode:** user toggle only (default Light, not OS-driven), stored in localStorage, applied as `data-theme` on `<html>` by an inline head script. Same properties redefined under `:root[data-theme="dark"]` (Steel adjusted to #A3B4D1 for AA). Rail keeps amber/navy in both themes.
- **Outputs stay light:** on-screen reports (`.output-light`), Word/Excel exports, slide decks and print always use the light tokens.
- **Writing:** titles state the takeaway or task, max 10 words. Formats ₱24,902.6M · 10th · March 31, 2026 · +4.8% / −1.2% (`Portal.fmt.peso`, `ordinal`; negatives use U+2212). American English.
- **Motion:** 120ms hover/focus, 200ms panels, nothing animates on load, respects prefers-reduced-motion.
- **Print:** hides rail and controls, square corners, white background. Design for 1366×768 first; scales to 1920×1080.

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
- [ ] UI v4 "Regulatory clarity" design system (tokens.css + app.css, left rail, dark mode) built 2026-10-06; awaiting Fons's approval.
- [x] Build order agreed (2026-10-05): UI refresh → Industry Ranking (thrift + UKB) → DRB Usage.
- [x] Q1 2026 thrift Stockholders' Equity figures come from the predecessor's workbook `samples/industry-ranking/2026-Q1-march/Industry Ranking as of March 31, 2026 v2.xlsx` (no PDF).
