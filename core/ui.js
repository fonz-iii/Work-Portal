/* core/ui.js — skill registry, shell header, menu board, and the generic skill runner screen.
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
    'Quarterly Reports': { id: 'reports', icon: 'chart', blurb: 'Quarterly management reports built from BSP publications and channel data.' },
    'RIB': { id: 'rib', icon: 'screen', blurb: 'Retail Internet Banking content: biller directories and customer advisories.' },
    'Research': { id: 'research', icon: 'book', blurb: 'Past studies and templates for new research work.' },
    'Knowledge': { id: 'knowledge', icon: 'bank', blurb: 'Reference information for the Marketing team.' },
    'Demo': { id: 'demo', icon: 'flask', blurb: 'Engine check on synthetic data. Not a real report.' }
  };
  var STATUS_LABEL = { planned: 'In development', 'on-hold': 'On hold', demo: 'Demo', ready: 'Available' };

  var ICONS = {
    chart: '<path d="M3 21h18"/><path d="M6 17v-5M11 17V7M16 17v-8M21 17V4"/>',
    screen: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/>',
    book: '<path d="M4 19V5a2 2 0 0 1 2-2h14v14H6a2 2 0 0 0-2 2zm0 0a2 2 0 0 0 2 2h14"/>',
    bank: '<path d="M3 21h18M4 10h16M12 3l9 5H3z"/><path d="M6 10v8M10 10v8M14 10v8M18 10v8"/>',
    flask: '<path d="M9 3h6M10 3v6l-5.5 9.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    file: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    save: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
    folder: '<path d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="1.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'
  };
  function icon(name, cls) {
    return '<svg class="ico ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
  }
  var LOGO = '<svg class="logo" viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="6" fill="#0d2240"/><path d="M11 28V20M17.5 28V14M24 28v-10M30.5 28V10" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/><path d="M9 31h23" stroke="#5b8fd6" stroke-width="2" stroke-linecap="round"/></svg>';

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
  function meta(g) { return GROUP_META[g] || { id: String(g).toLowerCase().replace(/\W+/g, '-'), icon: 'file', blurb: '' }; }

  P.ui = { esc: esc, icon: icon };

  /* ---------- shell: utility bar, masthead, footer ---------- */
  function renderShell(active) {
    var nav = [['Home', 'index.html', 'board'], ['Reports', 'index.html#reports'], ['RIB', 'index.html#rib'], ['Research', 'index.html#research'], ['Knowledge', 'knowledge.html', 'knowledge']];
    $('#shell').innerHTML =
      '<div class="topbar"><div class="wrap topbar-in"><span>Sterling Bank of Asia&nbsp;&nbsp;|&nbsp;&nbsp;Marketing</span>' +
      '<span class="topbar-note">' + icon('lock') + 'Internal use only · Works offline</span><div class="folder" id="folder"></div></div></div>' +
      '<div class="masthead"><div class="wrap masthead-in"><a class="brand" href="index.html">' + LOGO +
      '<span class="brand-text"><b>Marketing Portal</b><small>Sterling Bank of Asia</small></span></a><nav class="nav">' +
      nav.map(function (n) { return '<a href="' + n[1] + '"' + (n[2] && n[2] === active ? ' class="active"' : '') + '>' + n[0] + '</a>'; }).join('') +
      '</nav></div></div>';
    renderFolder();
    renderFooter();
  }

  function renderFooter() {
    var f = $('#foot');
    if (!f) return;
    var ks = [['Directory', 'directory'], ['Org chart', 'orgchart'], ['Branches', 'branches'], ['Products & fees', 'products'], ['P2B billers', 'billers'], ['Templates', 'templates']];
    f.innerHTML = '<div class="wrap foot-grid"><div class="foot-brand"><div class="brand light">' + LOGO +
      '<span class="brand-text"><b>Marketing Portal</b><small>Sterling Bank of Asia</small></span></div>' +
      '<p>An offline workspace that turns recurring source files into draft reports for review. Files are read on this computer and never leave it.</p></div>' +
      '<div><h4>Modules</h4><ul>' + GROUP_ORDER.filter(function (g) { return g !== 'Knowledge'; }).map(function (g) { return '<li><a href="index.html#' + meta(g).id + '">' + esc(g) + '</a></li>'; }).join('') + '</ul></div>' +
      '<div><h4>Knowledge</h4><ul>' + ks.map(function (k) { return '<li><a href="knowledge.html#' + k[1] + '">' + esc(k[0]) + '</a></li>'; }).join('') + '</ul></div>' +
      '<div><h4>About the figures</h4><p>Every number is calculated from the files you supply. Commentary marked DRAFT uses thresholds not yet approved by SBA. Outputs are drafts until you review and release them.</p></div></div>' +
      '<div class="foot-base"><div class="wrap foot-base-in"><span>Sterling Bank of Asia · Marketing · For internal use only</span><span>Phase 1</span></div></div>';
  }

  function renderFolder() {
    var f = P.files, box = $('#folder');
    if (!box) return;
    var st = f.status(), name = esc(f.folderName()), html = icon('folder');
    if (st === 'connected') {
      html += '<span>Saving to <b>' + name + '</b></span><button class="linkbtn" data-act="connect">Change</button><button class="linkbtn" data-act="disconnect">Disconnect</button>';
    } else if (st === 'needs-permission') {
      html += '<span>Folder <b>' + name + '</b> needs permission</span><button class="linkbtn strong" data-act="reconnect">Allow access</button>';
    } else if (st === 'none') {
      html += '<span>No output folder</span><button class="linkbtn strong" data-act="connect">Connect folder</button>';
    } else {
      html += '<span>Outputs save to Downloads</span>';
    }
    if (f.lastError) html += '<span class="folder-err" title="' + esc(f.lastError) + '">!</span>';
    box.innerHTML = html;
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('#folder [data-act]');
    if (!b) return;
    var act = b.getAttribute('data-act');
    if (act === 'connect') P.files.connect();
    else if (act === 'reconnect') P.files.reconnect();
    else if (act === 'disconnect') P.files.disconnect();
  });

  /* ---------- landing page ---------- */
  function renderBoard(main) {
    var groups = {};
    skills.forEach(function (s) { (groups[s.group || 'Other'] = groups[s.group || 'Other'] || []).push(s); });
    groups.Knowledge = (groups.Knowledge || []).concat([{ id: '__knowledge', title: 'Knowledge', description: 'Directory, org chart, branch list, product and fee summaries, P2B billers and templates.', href: 'knowledge.html', status: 'ready' }]);
    var names = GROUP_ORDER.filter(function (g) { return groups[g]; })
      .concat(Object.keys(groups).filter(function (g) { return GROUP_ORDER.indexOf(g) < 0; }));
    var count = function (fn) { return skills.filter(fn).length; };
    var today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    var html = '<section class="hero"><div class="wrap hero-in"><div class="hero-copy">' +
      '<p class="kicker">Marketing Portal</p><h1>Management-ready reports, prepared at your desk.</h1>' +
      '<p class="hero-lede">Turn BSP rankings, biller masterlists and channel data into decks, reports and directories for review. Every figure is calculated from the source file, and nothing leaves this computer.</p>' +
      '<div class="hero-cta"><a class="btn primary lg" href="#reports">Browse modules ' + icon('arrow') + '</a><a class="btn ghost-light lg" href="knowledge.html">Open Knowledge</a></div></div>' +
      '<aside class="hero-panel"><p class="panel-title">Portal status</p><dl>' +
      '<div><dt>Available</dt><dd>' + count(isLive) + '</dd></div>' +
      '<div><dt>In development</dt><dd>' + count(function (s) { return s.status === 'planned'; }) + '</dd></div>' +
      '<div><dt>On hold</dt><dd>' + count(function (s) { return s.status === 'on-hold'; }) + '</dd></div>' +
      '</dl><p class="panel-date">' + esc(today) + '</p></aside></div></section>';

    html += '<section class="quick"><div class="wrap quick-in">' + names.filter(function (g) { return g !== 'Demo'; }).map(function (g) {
      var mm = meta(g), href = g === 'Knowledge' ? 'knowledge.html' : '#' + mm.id;
      return '<a class="quick-item" href="' + href + '">' + icon(mm.icon) + '<span><b>' + esc(g) + '</b><small>' + groups[g].length + (groups[g].length === 1 ? ' module' : ' modules') + '</small></span>' + icon('arrow', 'quick-arrow') + '</a>';
    }).join('') + '</div></section>';

    names.forEach(function (g, gi) {
      var mm = meta(g);
      html += '<section class="band' + (gi % 2 ? ' alt' : '') + '" id="' + mm.id + '"><div class="wrap band-in"><header class="band-head">' +
        '<p class="kicker">' + String(gi + 1).padStart(2, '0') + '</p><h2>' + esc(g) + '</h2><p>' + esc(mm.blurb) + '</p></header><div class="cards">';
      groups[g].forEach(function (s) {
        var st = s.status || 'ready', href = s.href || ('#skill/' + encodeURIComponent(s.id));
        html += '<a class="mcard st-' + esc(st) + '" href="' + esc(href) + '"><div class="mcard-top"><span class="mcard-ico">' + icon(mm.icon) + '</span>' +
          '<span class="pill pill-' + esc(st) + '">' + esc(STATUS_LABEL[st] || st) + '</span></div>' +
          '<h3>' + esc(s.title) + '</h3><p>' + esc(s.description || '') + '</p>' +
          '<span class="more">' + (isLive(s) ? 'Open' : 'View details') + icon('arrow') + '</span></a>';
      });
      html += '</div></div></section>';
    });

    var steps = [['file', 'Choose the source file', 'Excel or PDF from your folder. It is read in the browser only.'],
      ['check', 'Automatic checks', 'Missing columns, wrong types and period gaps are listed before anything is calculated.'],
      ['eye', 'Review the draft', 'Figures, charts and rule-based commentary appear on screen for your review.'],
      ['save', 'Save and release', 'Save Excel, Word or PDF to your connected folder. You decide what gets sent.']];
    html += '<section class="band how"><div class="wrap"><header class="band-head center"><p class="kicker">How it works</p><h2>From source file to reviewed draft</h2></header><ol class="steps">' +
      steps.map(function (s, i) { return '<li><span class="step-ico">' + icon(s[0]) + '</span><span class="step-n">Step ' + (i + 1) + '</span><h3>' + s[1] + '</h3><p>' + s[2] + '</p></li>'; }).join('') +
      '</ol></div></section>';
    main.innerHTML = html;
  }

  /* ---------- skill runner ---------- */
  function renderRunner(main, skill) {
    var state = { inputs: {}, params: {}, metrics: null };
    var st = skill.status || 'ready', g = skill.group || '';
    var head = '<div class="page-head"><div class="wrap"><nav class="crumbs"><a href="index.html">Home</a><span>/</span><a href="index.html#' + meta(g).id + '">' + esc(g) + '</a><span>/</span><b>' + esc(skill.title) + '</b></nav>' +
      '<div class="page-title"><div><h1>' + esc(skill.title) + '</h1><p class="lede">' + esc(skill.description || '') + '</p></div>' +
      '<span class="pill pill-' + esc(st) + '">' + esc(STATUS_LABEL[st] || st) + '</span></div></div></div>';

    if (!isLive(skill)) {
      main.innerHTML = head + '<div class="wrap page-body"><div class="card notice"><h2>' + icon('file') + 'Module in development</h2><p>' + esc(skill.note || 'This module is a placeholder.') + '</p>' +
        '<div class="notice-cols">' + listBlock('Planned inputs', skill.plannedInputs) + listBlock('Planned outputs', skill.plannedOutputs) + '</div>' +
        '<a class="btn" href="index.html#' + meta(g).id + '">Back to ' + esc(g) + '</a></div></div>';
      return;
    }

    main.innerHTML = head + '<div class="wrap page-body"><div class="runner-grid">' +
      '<section class="card"><h2><span class="step">1</span>Source files</h2><div id="inputs"></div></section>' +
      '<section class="card"><h2><span class="step">2</span>Settings</h2><div id="params"></div>' +
      '<div class="actions"><button class="btn primary" id="run">Run analysis</button></div>' + rulesNote(skill) + '</section></div>' +
      '<div id="errors"></div><section id="results"></section></div>';

    var inBox = $('#inputs');
    (skill.inputs || []).forEach(function (d) { inBox.appendChild(inputRow(d, state)); });
    if (!(skill.inputs || []).length) inBox.innerHTML = '<p class="muted">No files needed.</p>';

    var pBox = $('#params');
    (skill.params || []).forEach(function (d) { pBox.appendChild(paramRow(d, state)); });
    if (!(skill.params || []).length) pBox.innerHTML = '<p class="muted">No settings.</p>';

    $('#run').addEventListener('click', function () { run(skill, state); });
  }

  function listBlock(title, items) {
    if (!items || !items.length) return '';
    return '<h3>' + esc(title) + '</h3><ul>' + items.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul>';
  }

  function rulesNote(skill) {
    if (!skill.rules) return '';
    return P.rules.isDraft(skill.rules)
      ? '<p class="rules-note draft">Commentary thresholds: <b>' + esc(skill.rules.status || 'DRAFT') + '</b>, not yet approved by SBA. ' + esc(skill.rules.note || '') + '</p>'
      : '<p class="rules-note">Commentary thresholds: approved.</p>';
  }

  function inputRow(d, state) {
    var row = el('<div class="field"><label>' + esc(d.label) + (d.required ? ' <span class="req">*</span>' : '') + '</label>' +
      (d.help ? '<p class="help">' + esc(d.help) + '</p>' : '') + '<div class="file-line"></div></div>');
    var line = $('.file-line', row);

    if (d.type === 'paste') {
      var ta = el('<textarea rows="6" placeholder="Paste text here"></textarea>');
      ta.addEventListener('input', function () { state.inputs[d.key] = ta.value ? { kind: 'text', name: 'pasted', text: ta.value } : undefined; });
      line.appendChild(ta);
      return row;
    }
    var btn = el('<button class="btn">Choose file…</button>'), info = el('<span class="file-info muted">No file chosen</span>');
    btn.addEventListener('click', function () {
      P.files.pick({ accept: P.files.acceptFor(d.type) }).then(function (list) {
        if (!list.length) return;
        var file = list[0];
        info.textContent = 'Reading ' + file.name + '…';
        state.inputs[d.key] = undefined;
        P.parse.input(d, file).then(function (data) {
          state.inputs[d.key] = data;
          info.innerHTML = '<b>' + esc(file.name) + '</b> · ' + esc(summary(data));
          info.className = 'file-info ok';
        }, function (e) {
          info.textContent = 'Could not read ' + file.name + ': ' + (e && e.message || e);
          info.className = 'file-info bad';
        });
      });
    });
    line.appendChild(btn); line.appendChild(info);
    return row;
  }

  function summary(data) {
    if (data.kind === 'excel') return data.rows.length + ' rows in "' + data.sheetNames[0] + '"' + (data.sheetNames.length > 1 ? ' (+' + (data.sheetNames.length - 1) + ' sheets)' : '');
    if (data.kind === 'pdf') return data.pages.length + ' page(s) of text';
    return (data.text || '').length + ' characters';
  }

  function paramRow(d, state) {
    var row = el('<div class="field"><label>' + esc(d.label) + '</label><div class="param-line"></div></div>');
    var line = $('.param-line', row), set = function (v) { state.params[d.key] = v; };

    if (d.type === 'quarter') {
      var init = /^Q[1-4] \d{4}$/.test(d.default || '') ? d.default : currentQuarter();
      var q = el('<select>' + [1, 2, 3, 4].map(function (n) { return '<option>Q' + n + '</option>'; }).join('') + '</select>');
      var y = el('<input type="number" min="2000" max="2100" step="1" class="year">');
      q.value = init.split(' ')[0]; y.value = init.split(' ')[1];
      var upd = function () { set(q.value + ' ' + y.value); };
      q.addEventListener('change', upd); y.addEventListener('input', upd); upd();
      line.appendChild(q); line.appendChild(y);
    } else if (d.type === 'select') {
      var s = el('<select>' + (d.options || []).map(function (o) { return '<option>' + esc(o) + '</option>'; }).join('') + '</select>');
      if (d.default) s.value = d.default;
      s.addEventListener('change', function () { set(s.value); }); set(s.value);
      line.appendChild(s);
    } else {
      var type = { month: 'month', date: 'date', number: 'number' }[d.type] || 'text';
      var inp = el('<input type="' + type + '">');
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
    box.innerHTML = '<div class="card errors"><h2>' + esc(title || 'Please fix before running') + '</h2><ul>' +
      errs.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul></div>';
  }

  function run(skill, state) {
    var results = $('#results');
    results.innerHTML = '';
    var errs = P.validate.required(skill, state.inputs, state.params);
    try {
      if (!errs.length && skill.validate) errs = skill.validate(state.inputs, state.params) || [];
    } catch (e) { errs = ['Validation failed: ' + (e && e.message || e)]; }
    showErrors(errs);
    if (errs.length) return;

    var m;
    try { m = skill.analyze(state.inputs, state.params); }
    catch (e) { showErrors([String(e && e.message || e)], 'Calculation error'); return; }
    state.metrics = m;

    var files = [], screens = [];
    (skill.outputs || []).forEach(function (o) { (o.format === 'html' ? screens : files).push(o); });

    var html = '<div class="results-bar no-print"><h2><span class="step">3</span>Outputs</h2><div class="out-buttons">';
    files.forEach(function (o) { html += '<button class="btn primary" data-out="' + esc(o.key) + '">Save ' + esc(o.label) + '</button>'; });
    if (screens.length) html += '<button class="btn" data-print>Print / PDF</button>';
    html += '</div><p id="save-msg" class="muted"></p></div>';
    screens.forEach(function (o) { html += '<article class="output-html" data-screen="' + esc(o.key) + '"></article>'; });
    results.innerHTML = html;

    screens.forEach(function (o) {
      Promise.resolve(o.render(m, state.params)).then(function (h) { $('[data-screen="' + o.key + '"]', results).innerHTML = h; });
    });
    files.forEach(function (o) {
      $('[data-out="' + o.key + '"]', results).addEventListener('click', function () { saveOutput(skill, o, m, state.params); });
    });
    var pb = $('[data-print]', results);
    if (pb) pb.addEventListener('click', function () { root.print(); });
    results.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
      renderFolder();
    }, function (e) { msg.textContent = 'Export failed: ' + (e && e.message || e); });
  }

  /* ---------- boot ---------- */
  function route() {
    var main = $('#main'), m = /^#skill\/(.+)$/.exec(location.hash);
    var skill = m && P.getSkill(decodeURIComponent(m[1]));
    if (skill) { renderRunner(main, skill); document.title = skill.title + ' · SBA Marketing Portal'; }
    else { renderBoard(main); document.title = 'Marketing Portal · Sterling Bank of Asia'; }
    var target = !skill && location.hash.length > 1 && document.getElementById(location.hash.slice(1));
    if (target) target.scrollIntoView(); else root.scrollTo(0, 0);
  }

  /** page: 'board' (index.html) or 'knowledge'. */
  P.ui.boot = function (page) {
    renderShell(page);
    P.files.onChange(renderFolder);
    P.files.init();
    if (page === 'board') {
      var go = function () { root.addEventListener('hashchange', route); route(); };
      if (P.skillsLoaded) P.skillsLoaded.then(go); else go();
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
