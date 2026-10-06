/* core/ui.js — skill registry, app shell (left rail, theme), Home, Modules and the generic skill runner.
   Skills only call Portal.registerSkill(); nothing here is specific to any one skill. */
(function (root) {
  'use strict';
  var P = root.Portal = root.Portal || {};

  /* ---------- registry ---------- */
  var skills = P.skills = [];
  /** Registering an id that already exists replaces it (a real skill replaces its placeholder). */
  P.registerSkill = function (def) {
    if (!def || !def.id || !def.title) throw new Error('registerSkill: id and title are required');
    var i = skills.findIndex(function (s) { return s.id === def.id; });
    if (i >= 0) skills[i] = def; else skills.push(def);
  };
  P.getSkill = function (id) { return skills.find(function (s) { return s.id === id; }); };

  var GROUP_ORDER = ['Quarterly Reports', 'RIB', 'Research', 'Knowledge', 'Demo'];
  var GROUP_META = {
    'Quarterly Reports': { id: 'reports', icon: 'chart', label: 'Quarterly reports', blurb: 'Management reports from BSP publications and channel data.' },
    'RIB': { id: 'rib', icon: 'screen', label: 'RIB', blurb: 'Retail Internet Banking: biller directory and customer advisories.' },
    'Research': { id: 'research', icon: 'book', label: 'Research', blurb: 'Past studies and templates for new research.' },
    'Knowledge': { id: 'knowledge', icon: 'bank', label: 'Knowledge', blurb: 'Reference information for the Marketing Group.' },
    'Demo': { id: 'demo', icon: 'flask', label: 'Demo', blurb: 'Engine check on synthetic data. Not a real report.' }
  };
  /* Pill words (Ready / Draft / On hold) and the plain label above each tile title. */
  var PILL = { ready: 'Ready', demo: 'Ready', planned: 'Draft', 'on-hold': 'On hold' };
  var PILL_CLASS = { ready: 'ok', demo: 'ok', planned: 'draft', 'on-hold': 'hold' };
  var TILE_LABEL = { ready: 'Available', demo: 'Demo · synthetic data', planned: 'Coming soon', 'on-hold': 'Waiting on source data' };

  var ICONS = {
    home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
    chart: '<path d="M3 21h18"/><path d="M6 17v-5M11 17V7M16 17v-8M21 17V4"/>',
    screen: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/>',
    book: '<path d="M4 19V5a2 2 0 0 1 2-2h14v14H6a2 2 0 0 0-2 2zm0 0a2 2 0 0 0 2 2h14"/>',
    bank: '<path d="M3 21h18M4 10h16M12 3l9 5H3z"/><path d="M6 10v8M10 10v8M14 10v8M18 10v8"/>',
    flask: '<path d="M9 3h6M10 3v6l-5.5 9.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
    file: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
    save: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
    print: '<path d="M7 9V3h10v6M7 17H4v-7h16v7h-3"/><path d="M7 14h10v7H7z"/>',
    folder: '<path d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="1.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    collapse: '<path d="M15 6l-6 6 6 6"/>'
  };
  function icon(name, cls) {
    return '<svg class="ico ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
  }

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function el(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function isLive(s) { return !s.status || s.status === 'ready' || s.status === 'demo'; }
  function currentQuarter() { var d = new Date(); return 'Q' + (Math.floor(d.getMonth() / 3) + 1) + ' ' + d.getFullYear(); }
  function meta(g) { return GROUP_META[g] || { id: String(g).toLowerCase().replace(/\W+/g, '-'), icon: 'file', label: g, blurb: '' }; }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function fileSize(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
  function pill(st) { st = st || 'ready'; return '<span class="pill pill-' + PILL_CLASS[st] + '">' + esc(PILL[st] || st) + '</span>'; }

  P.ui = { esc: esc, icon: icon };

  /* ---------- theme ---------- */
  function setTheme(t) {
    t = t === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
    store('portal-theme', t);
    document.querySelectorAll('[data-theme-set]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-theme-set') === t)); });
    root.dispatchEvent(new CustomEvent('portal:themechange', { detail: { theme: t } }));
  }
  function setRail(collapsed) {
    var d = document.documentElement;
    if (collapsed) d.setAttribute('data-rail', 'collapsed'); else d.removeAttribute('data-rail');
    store('portal-rail', collapsed ? 'collapsed' : 'expanded');
    var b = $('#rail-toggle');
    if (b) { b.setAttribute('aria-expanded', String(!collapsed)); b.setAttribute('aria-label', collapsed ? 'Expand menu' : 'Collapse menu'); }
  }

  /* ---------- shell: rail, top line, footer ---------- */
  var NAV = [['Home', 'index.html', 'home', 'home'], ['All modules', 'modules.html', 'modules:', 'grid'],
    ['Quarterly reports', 'modules.html#reports', 'modules:reports', 'chart'], ['RIB', 'modules.html#rib', 'modules:rib', 'screen'],
    ['Research', 'modules.html#research', 'modules:research', 'book'], ['Knowledge', 'knowledge.html', 'knowledge', 'bank']];
  var page = '';

  function navKey() {
    if (page !== 'modules') return page;
    var h = location.hash.slice(1), sk = /^skill\/(.+)$/.exec(h);
    if (sk) { var s = P.getSkill(decodeURIComponent(sk[1])); return 'modules:' + (s ? meta(s.group).id : ''); }
    return 'modules:' + h;
  }
  function renderNav() {
    var nav = $('#rail-nav'), key = navKey();
    if (!nav) return;
    nav.innerHTML = NAV.map(function (n) {
      var on = n[2] === key;
      return '<a href="' + n[1] + '"' + (on ? ' class="active" aria-current="page"' : '') + ' title="' + n[0] + '">' + icon(n[3]) + '<span>' + n[0] + '</span></a>';
    }).join('');
  }

  function renderShell() {
    var theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    var collapsed = document.documentElement.getAttribute('data-rail') === 'collapsed';
    $('#rail').innerHTML =
      '<div class="rail-top"><a class="wordmark" href="index.html"><span class="wm-eyebrow">Sterling Bank of Asia</span><span class="wm-title">Marketing Portal</span><span class="wm-short" aria-hidden="true">MP</span></a>' +
      '<button class="rail-toggle" id="rail-toggle" aria-expanded="' + !collapsed + '" aria-label="' + (collapsed ? 'Expand menu' : 'Collapse menu') + '">' + icon('collapse') + '</button></div>' +
      '<nav class="rail-nav" id="rail-nav" aria-label="Main"></nav>' +
      '<div class="rail-foot"><p class="rail-label">Theme</p><div class="theme-toggle" role="group" aria-label="Theme">' +
      '<button data-theme-set="light" aria-pressed="' + (theme === 'light') + '"><span class="long">Light</span><span class="short">L</span></button>' +
      '<button data-theme-set="dark" aria-pressed="' + (theme === 'dark') + '"><span class="long">Dark</span><span class="short">D</span></button></div></div>';
    $('#shell').innerHTML = '<span class="restricted">' + icon('lock') + 'For the Marketing Group only</span><div class="folder" id="folder"></div>';
    var f = $('#foot');
    if (f) f.innerHTML = '<p>Sterling Bank of Asia · Restricted to the Marketing Group. Do not share this portal or its outputs outside the group without approval.</p><p>Works offline. Every figure is calculated from the files you supply; outputs are drafts until you release them.</p>';
    renderNav();
    renderFolder();
  }

  function renderFolder() {
    var f = P.files, box = $('#folder');
    if (!box) return;
    var st = f.status(), name = esc(f.folderName()), html = icon('folder');
    if (st === 'connected') {
      html += '<span>Saving to <b>' + name + '</b></span><button class="btn tertiary sm" data-act="connect">Change</button><button class="btn tertiary sm" data-act="disconnect">Disconnect</button>';
    } else if (st === 'needs-permission') {
      html += '<span>Folder <b>' + name + '</b> needs permission</span><button class="btn secondary sm" data-act="reconnect">Allow access</button>';
    } else if (st === 'none') {
      html += '<span>Files save to Downloads</span><button class="btn secondary sm" data-act="connect">Choose a save folder</button>';
    } else {
      html += '<span>Files save to your Downloads folder</span>';
    }
    if (f.lastError) html += '<span class="folder-err" role="img" aria-label="Folder error" title="' + esc(f.lastError) + '">!</span>';
    box.innerHTML = html;
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (b) {
      var act = b.getAttribute('data-act');
      if (act === 'connect') P.files.connect();
      else if (act === 'reconnect') P.files.reconnect();
      else if (act === 'disconnect') P.files.disconnect();
      return;
    }
    var t = e.target.closest('[data-theme-set]');
    if (t) return setTheme(t.getAttribute('data-theme-set'));
    if (e.target.closest('#rail-toggle')) setRail(document.documentElement.getAttribute('data-rail') !== 'collapsed');
  });

  /* ---------- menu board (shared by Home and Modules) ---------- */
  function groupsMap() {
    var groups = {};
    skills.forEach(function (s) { (groups[s.group || 'Other'] = groups[s.group || 'Other'] || []).push(s); });
    var names = GROUP_ORDER.filter(function (g) { return groups[g]; })
      .concat(Object.keys(groups).filter(function (g) { return GROUP_ORDER.indexOf(g) < 0; }));
    return { groups: groups, names: names };
  }
  /** Mixed widths on a 12-column grid: featured tile 6, next two 3, the rest 4. */
  function span(i, n) {
    if (n === 1) return 6;
    if (n === 2) return i === 0 ? 7 : 5;
    return i === 0 ? 6 : i < 3 ? 3 : 4;
  }
  function boardSection(g, list) {
    var mm = meta(g);
    return '<section class="board-section" id="' + mm.id + '"><div class="section-head"><p class="label">' + esc(mm.label) + '</p><p class="section-blurb">' + esc(mm.blurb) + '</p></div><div class="grid">' +
      list.map(function (s, i) {
        var st = s.status || 'ready', href = s.href || ('modules.html#skill/' + encodeURIComponent(s.id));
        return '<a class="tile' + (i === 0 ? ' tile-featured' : '') + '" style="--span:' + span(i, list.length) + '" href="' + esc(href) + '">' +
          '<span class="label">' + esc(TILE_LABEL[st] || '') + '</span><span class="tile-title">' + esc(s.title) + '</span>' +
          '<span class="tile-desc">' + esc(s.description || '') + '</span><span class="tile-foot">' + pill(st) + '</span></a>';
      }).join('') + '</div></section>';
  }

  /** Picture slot: shows the image if the file exists, otherwise an empty state naming the file to add. */
  function imgSlot(src, label, extra) {
    return '<figure class="imgslot ' + (extra || '') + '"><img src="' + esc(src) + '" alt="' + esc(label) + '" onerror="this.parentNode.classList.add(\'empty\')">' +
      '<figcaption class="empty-state"><p class="empty-title">' + esc(label) + ' goes here</p><p>Add a picture named <code>' + esc(src) + '</code>.</p></figcaption></figure>';
  }

  /* ---------- home ---------- */
  function renderHome(main) {
    var H = root.SBA_HOME || {}, gm = groupsMap();
    var html = '<div class="page"><header class="page-head"><p class="label">Home</p><h1>' + esc(H.headline || 'Make a report or look something up') + '</h1>' +
      '<p class="lede">' + esc(H.intro || 'Pick a task below. Files are read on this computer and never leave it.') + '</p></header>' +
      '<div class="grid">' +
      '<section class="card" style="--span:7"><p class="label">Start here</p><h2 class="card-title">Three ways to begin</h2><ol class="start-list">' +
      '<li><b>Make a report.</b> Open a module, add the source file, review the draft.</li>' +
      '<li><b>Look something up.</b> Contacts, branches, products and billers are in Knowledge.</li>' +
      '<li><b>Choose a save folder</b> at the top right so finished files land in one place.</li></ol>' +
      '<div class="btn-row"><a class="btn primary" href="modules.html">Start a report ' + icon('arrow') + '</a><a class="btn secondary" href="knowledge.html">Find information</a></div></section>' +
      '<div class="pic-cell" style="--span:5">' + imgSlot(H.heroImage || 'assets/images/home-hero.jpg', 'Main picture', 'pic-hero') + '</div></div>';

    html += gm.names.map(function (g) { return boardSection(g, gm.groups[g]); }).join('');
    html += boardSection('Knowledge', [{ id: '__k', title: 'Knowledge', description: 'Directory, org chart, branches, products and fees, P2B billers, templates.', href: 'knowledge.html', status: 'ready' }]).replace('id="knowledge"', 'id="knowledge-board"');

    var feats = H.features || [];
    if (feats.length) {
      html += '<section class="board-section"><div class="section-head"><p class="label">' + esc(H.featuresKicker || 'Highlights') + '</p><p class="section-blurb">' + esc(H.featuresTitle || 'From the Marketing Group') + '</p></div><div class="grid">' +
        feats.map(function (f, i) { return '<article class="card feature" style="--span:' + (i === 0 ? 6 : 3) + '">' + imgSlot(f.image, 'Picture ' + (i + 1)) + '<h3 class="card-title">' + esc(f.title) + '</h3><p>' + esc(f.text) + '</p></article>'; }).join('') +
        '</div></section>';
    }

    html += '<section class="board-section"><div class="section-head"><p class="label">How it works</p><p class="section-blurb">Every module follows the same four steps.</p></div>' +
      '<div class="card"><ol class="stepper static">' + ['Inputs: add the source file', 'Check: the portal lists anything missing', 'Results: review figures and commentary', 'Export: save Excel, Word or PDF'].map(function (s, i) {
        var p = s.split(': ');
        return '<li><span class="step-n">' + (i + 1) + '</span><span class="step-name">' + p[0] + '</span><span class="step-hint">' + p[1] + '</span></li>';
      }).join('') + '</ol></div></section></div>';
    main.innerHTML = html;
  }

  /* ---------- modules page ---------- */
  function renderModules(main, tab) {
    var gm = groupsMap(), names = gm.names, groups = gm.groups;
    var shown = names.filter(function (g) { return !tab || meta(g).id === tab; });
    if (!shown.length) { shown = names; tab = ''; }
    var html = '<div class="page"><header class="page-head"><nav class="crumbs" aria-label="Breadcrumb"><a href="index.html">Home</a><span aria-hidden="true">/</span><span>Modules</span></nav>' +
      '<h1>Pick the report you need</h1><p class="lede">Each module turns one kind of file into a draft. Draft modules are still being built.</p>' +
      '<nav class="chips" aria-label="Module sections"><a href="modules.html"' + (!tab ? ' class="on" aria-current="true"' : '') + '>All</a>' +
      names.map(function (g) { var id = meta(g).id; return '<a href="modules.html#' + id + '"' + (tab === id ? ' class="on" aria-current="true"' : '') + '>' + esc(meta(g).label) + ' <span class="num">' + groups[g].length + '</span></a>'; }).join('') +
      '</nav></header>' + shown.map(function (g) { return boardSection(g, groups[g]); }).join('') + '</div>';
    main.innerHTML = html;
  }

  /* ---------- skill runner ---------- */
  var STEPS = ['Inputs', 'Check', 'Results', 'Export'];
  function setStep(n) {
    document.querySelectorAll('.stepper.live li').forEach(function (li, i) {
      li.className = i + 1 < n ? 'done' : i + 1 === n ? 'current' : '';
      if (i + 1 === n) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
  }

  function renderRunner(main, skill) {
    var state = { inputs: {}, params: {}, metrics: null };
    var st = skill.status || 'ready', g = skill.group || '', gid = meta(g).id;
    var head = '<header class="page-head"><nav class="crumbs" aria-label="Breadcrumb"><a href="index.html">Home</a><span aria-hidden="true">/</span><a href="modules.html#' + gid + '">' + esc(meta(g).label) + '</a><span aria-hidden="true">/</span><span>' + esc(skill.title) + '</span></nav>' +
      '<div class="title-row"><h1>' + esc(skill.title) + '</h1>' + pill(st) + '</div><p class="lede">' + esc(skill.description || '') + '</p></header>';

    if (!isLive(skill)) {
      main.innerHTML = '<div class="page">' + head + '<div class="grid"><section class="card" style="--span:8"><p class="label">Coming soon</p><h2 class="card-title">This module is still being built</h2><p>' + esc(skill.note || '') + '</p>' +
        '<div class="two-col">' + listBlock('You will provide', skill.plannedInputs) + listBlock('You will get', skill.plannedOutputs) + '</div>' +
        '<a class="btn secondary" href="modules.html#' + gid + '">' + icon('back') + 'Back to ' + esc(meta(g).label) + '</a></section></div></div>';
      return;
    }

    document.body.setAttribute('data-amber', 'step');
    main.innerHTML = '<div class="page">' + head +
      '<ol class="stepper live" aria-label="Progress">' + STEPS.map(function (s, i) { return '<li><span class="step-n">' + (i + 1) + '</span><span class="step-name">' + s + '</span></li>'; }).join('') + '</ol>' +
      '<div class="grid">' +
      '<section class="card" style="--span:7"><p class="label">Step 1</p><h2 class="card-title">Add the source file</h2><div id="inputs"></div></section>' +
      '<section class="card" style="--span:5"><p class="label">Step 2</p><h2 class="card-title">Check the settings</h2><div id="params"></div>' +
      '<div id="check-result" class="check-result" aria-live="polite"></div>' +
      '<div class="btn-row"><button class="btn primary" id="run">Create report ' + icon('arrow') + '</button></div></section></div>' +
      rulesNote(skill) + '<div id="errors" aria-live="polite"></div><section id="results">' + emptyResults() + '</section></div>';
    setStep(1);

    var inBox = $('#inputs');
    (skill.inputs || []).forEach(function (d) { inBox.appendChild(inputRow(d, state, skill)); });
    if (!(skill.inputs || []).length) inBox.innerHTML = '<p>No files needed.</p>';

    var pBox = $('#params');
    (skill.params || []).forEach(function (d) { pBox.appendChild(paramRow(d, state)); });
    if (!(skill.params || []).length) pBox.innerHTML = '<p>No settings.</p>';
    pBox.addEventListener('change', function () { checkNow(skill, state); });

    $('#run').addEventListener('click', function () { run(skill, state); });
    main.addEventListener('click', function (e) {
      if (e.target.closest('[data-pick-first]')) { var z = $('.dropzone'); if (z) z.click(); }
    });
  }

  function emptyResults() {
    return '<div class="card empty-state"><p class="empty-title">Your report appears here</p><p>Add the source file in step 1, check the settings, then select Create report.</p>' +
      '<button class="btn secondary" data-pick-first>' + icon('upload') + 'Choose file</button></div>';
  }

  function listBlock(title, items) {
    if (!items || !items.length) return '';
    return '<div><p class="label">' + esc(title) + '</p><ul>' + items.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul></div>';
  }

  function rulesNote(skill) {
    if (!skill.rules || !P.rules.isDraft(skill.rules)) return '';
    return '<div class="callout warning" role="note"><p class="label">Warning</p><p>Commentary thresholds are <b>' + esc(skill.rules.status || 'DRAFT') + '</b> and not yet approved by SBA. ' + esc(skill.rules.note || '') + '</p></div>';
  }

  /** Drop zone: click, keyboard or drag a file in. Shows name, size and the check result. */
  function inputRow(d, state, skill) {
    var row = el('<div class="field"><p class="field-label">' + esc(d.label) + (d.required ? ' <span class="req">(required)</span>' : '') + '</p>' +
      (d.help ? '<p class="help">' + esc(d.help) + '</p>' : '') + '<div class="file-slot"></div></div>');
    var slot = $('.file-slot', row);

    if (d.type === 'paste') {
      var ta = el('<textarea rows="6" aria-label="' + esc(d.label) + '" placeholder="Paste text here"></textarea>');
      ta.addEventListener('input', function () { state.inputs[d.key] = ta.value ? { kind: 'text', name: 'pasted', text: ta.value } : undefined; checkNow(skill, state); });
      slot.appendChild(ta);
      return row;
    }
    var zone = el('<div class="dropzone" role="button" tabindex="0" aria-label="Choose ' + esc(d.label) + '">' +
      '<p class="dz-main">' + icon('upload') + '<span>Drop the file here, or <u>choose a file</u></span></p><p class="dz-sub">' + esc(P.files.acceptFor(d.type).replace(/,/g, ', ')) + '</p><p class="dz-file" hidden></p></div>');
    var info = $('.dz-file', zone);
    function load(file) {
      if (!file) return;
      info.hidden = false;
      info.innerHTML = '<b>' + esc(file.name) + '</b> · ' + fileSize(file.size) + ' · reading…';
      state.inputs[d.key] = undefined;
      P.parse.input(d, file).then(function (data) {
        state.inputs[d.key] = data;
        zone.classList.add('has-file');
        info.innerHTML = '<b>' + esc(file.name) + '</b> · ' + fileSize(file.size) + ' · ' + esc(summary(data)) + '<span class="dz-check" data-check></span>';
        checkNow(skill, state);
      }, function (e) {
        info.innerHTML = '<b>' + esc(file.name) + '</b> · <span class="t-neg">could not be read: ' + esc(e && e.message || e) + '</span>';
      });
    }
    function pick() { P.files.pick({ accept: P.files.acceptFor(d.type) }).then(function (l) { load(l[0]); }); }
    zone.addEventListener('click', pick);
    zone.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    zone.addEventListener('dragover', function (e) { e.preventDefault(); zone.classList.add('over'); });
    zone.addEventListener('dragleave', function () { zone.classList.remove('over'); });
    zone.addEventListener('drop', function (e) { e.preventDefault(); zone.classList.remove('over'); load(e.dataTransfer.files[0]); });
    slot.appendChild(zone);
    return row;
  }

  /** Runs the same checks as Create report, as soon as every required input is present. */
  function checkNow(skill, state) {
    var box = $('#check-result');
    if (!box) return;
    var missing = (skill.inputs || []).some(function (d) { return d.required && !state.inputs[d.key]; });
    if (missing) { box.innerHTML = ''; return; }
    var errs = P.validate.required(skill, state.inputs, state.params);
    try { if (!errs.length && skill.validate) errs = skill.validate(state.inputs, state.params) || []; }
    catch (e) { errs = ['The check could not finish: ' + (e && e.message || e)]; }
    box.innerHTML = errs.length
      ? '<p class="t-neg"><b>' + errs.length + (errs.length === 1 ? ' problem' : ' problems') + ' found.</b> Details below.</p>'
      : '<p class="t-pos"><b>Checks passed.</b> Ready to create the report.</p>';
    document.querySelectorAll('[data-check]').forEach(function (c) { c.className = 'dz-check ' + (errs.length ? 't-neg' : 't-pos'); c.textContent = errs.length ? ' · ' + errs.length + ' to fix' : ' · checks passed'; });
    showErrors(errs);
    setStep(2);
  }

  function summary(data) {
    if (data.kind === 'excel') return data.rows.length + ' rows in "' + data.sheetNames[0] + '"' + (data.sheetNames.length > 1 ? ' (+' + (data.sheetNames.length - 1) + ' sheets)' : '');
    if (data.kind === 'pdf') return data.pages.length + ' page(s) of text';
    return (data.text || '').length + ' characters';
  }

  function paramRow(d, state) {
    var id = 'p-' + d.key;
    var row = el('<div class="field"><label class="field-label" for="' + id + '">' + esc(d.label) + '</label><div class="param-line"></div></div>');
    var line = $('.param-line', row), set = function (v) { state.params[d.key] = v; };

    if (d.type === 'quarter') {
      var init = /^Q[1-4] \d{4}$/.test(d.default || '') ? d.default : currentQuarter();
      var q = el('<select id="' + id + '">' + [1, 2, 3, 4].map(function (n) { return '<option>Q' + n + '</option>'; }).join('') + '</select>');
      var y = el('<input type="number" min="2000" max="2100" step="1" class="year" aria-label="Year">');
      q.value = init.split(' ')[0]; y.value = init.split(' ')[1];
      var upd = function () { set(q.value + ' ' + y.value); };
      q.addEventListener('change', upd); y.addEventListener('input', upd); upd();
      line.appendChild(q); line.appendChild(y);
    } else if (d.type === 'select') {
      var s = el('<select id="' + id + '">' + (d.options || []).map(function (o) { return '<option>' + esc(o) + '</option>'; }).join('') + '</select>');
      if (d.default) s.value = d.default;
      s.addEventListener('change', function () { set(s.value); }); set(s.value);
      line.appendChild(s);
    } else {
      var type = { month: 'month', date: 'date', number: 'number' }[d.type] || 'text';
      var inp = el('<input id="' + id + '" type="' + type + '">');
      if (d.default !== undefined) inp.value = d.default;
      inp.addEventListener('input', function () { set(type === 'number' ? (inp.value === '' ? '' : Number(inp.value)) : inp.value); });
      set(type === 'number' ? (inp.value === '' ? '' : Number(inp.value)) : inp.value);
      line.appendChild(inp);
    }
    return row;
  }

  function showErrors(errs, title) {
    var box = $('#errors');
    if (!errs.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="callout error" role="alert"><p class="label">' + esc(title || 'Errors') + '</p><p>Fix these in the file, then choose it again.</p><ul>' +
      errs.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul></div>';
  }

  function run(skill, state) {
    var results = $('#results');
    var errs = P.validate.required(skill, state.inputs, state.params);
    try {
      if (!errs.length && skill.validate) errs = skill.validate(state.inputs, state.params) || [];
    } catch (e) { errs = ['Validation failed: ' + (e && e.message || e)]; }
    showErrors(errs);
    if (errs.length) { results.innerHTML = emptyResults(); setStep(state.inputs && Object.keys(state.inputs).length ? 2 : 1); $('#errors').scrollIntoView({ block: 'start' }); return; }

    var m;
    try { m = skill.analyze(state.inputs, state.params); }
    catch (e) { showErrors([String(e && e.message || e)], 'Calculation error'); return; }
    state.metrics = m;

    var files = [], screens = [];
    (skill.outputs || []).forEach(function (o) { (o.format === 'html' ? screens : files).push(o); });

    var html = '<div class="results-bar no-print"><div><p class="label">Steps 3 and 4</p><h2 class="card-title">Review the draft, then export</h2></div><div class="btn-row">';
    files.forEach(function (o, i) { html += '<button class="btn ' + (i === 0 ? 'primary' : 'secondary') + '" data-out="' + esc(o.key) + '">' + icon('save') + 'Save ' + esc(o.label) + '</button>'; });
    if (screens.length) html += '<button class="btn tertiary" data-print>' + icon('print') + 'Print or save as PDF</button>';
    html += '</div><p id="save-msg" class="save-msg" aria-live="polite"></p></div>';
    screens.forEach(function (o) { html += '<article class="output-html output-light" data-screen="' + esc(o.key) + '"></article>'; });
    results.innerHTML = html;

    screens.forEach(function (o) {
      Promise.resolve(o.render(m, state.params)).then(function (h) { $('[data-screen="' + o.key + '"]', results).innerHTML = h; });
    });
    files.forEach(function (o) {
      $('[data-out="' + o.key + '"]', results).addEventListener('click', function () { saveOutput(skill, o, m, state.params); });
    });
    var pb = $('[data-print]', results);
    if (pb) pb.addEventListener('click', function () { setStep(4); root.print(); });
    setStep(3);
    results.scrollIntoView({ block: 'start' });
  }

  function saveOutput(skill, o, m, params) {
    var msg = $('#save-msg');
    msg.textContent = 'Preparing ' + o.label + '…';
    Promise.resolve(o.render(m, params)).then(function (spec) {
      var built = P.export.build(o.format, spec);
      var base = o.filename ? o.filename(m, params) : skill.title + ' - ' + o.label;
      return P.files.save(P.export.safeName(base) + '.' + built.ext, built.blob);
    }).then(function (r) {
      msg.textContent = r.where === 'folder' ? 'Saved "' + r.name + '" to folder ' + r.folder + '.' : 'Downloaded "' + r.name + '".' + (r.error ? ' ' + r.error : '');
      setStep(4);
      renderFolder();
    }, function (e) { msg.textContent = 'Export failed: ' + (e && e.message || e); });
  }

  /* ---------- boot ---------- */
  function route() {
    var main = $('#main'), h = location.hash.slice(1), m = /^skill\/(.+)$/.exec(h);
    var skill = m && P.getSkill(decodeURIComponent(m[1]));
    document.body.removeAttribute('data-amber');
    if (skill) renderRunner(main, skill); else renderModules(main, h);
    renderNav();
    root.scrollTo(0, 0);
  }

  /** p: 'home' (index.html), 'modules' (modules.html) or 'knowledge'. */
  P.ui.boot = function (p) {
    page = p;
    document.title = 'Marketing Portal';
    renderShell();
    P.files.onChange(renderFolder);
    P.files.init();
    var ready = P.skillsLoaded || Promise.resolve();
    if (p === 'home') ready.then(function () { renderHome($('#main')); });
    if (p === 'modules') ready.then(function () { root.addEventListener('hashchange', route); route(); });
  };
  P.ui.setTheme = setTheme;
})(typeof window !== 'undefined' ? window : globalThis);
