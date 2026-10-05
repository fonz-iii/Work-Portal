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
  var STATUS_LABEL = { planned: 'Planned', 'on-hold': 'On hold', demo: 'Demo', ready: 'Ready' };

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

  P.ui = { esc: esc };

  /* ---------- shell header ---------- */
  function renderShell(active) {
    var h = $('#shell');
    h.innerHTML =
      '<a class="brand" href="index.html"><span class="brand-mark">SBA</span><span class="brand-text"><b>Sterling Bank of Asia</b><small>Marketing Portal</small></span></a>' +
      '<nav class="nav">' +
      '<a href="index.html"' + (active === 'board' ? ' class="active"' : '') + '>Menu board</a>' +
      '<a href="knowledge.html"' + (active === 'knowledge' ? ' class="active"' : '') + '>Knowledge</a>' +
      '</nav><div class="folder" id="folder"></div>';
    renderFolder();
  }

  function renderFolder() {
    var f = P.files, box = $('#folder');
    if (!box) return;
    var st = f.status(), name = esc(f.folderName()), html;
    if (st === 'connected') {
      html = '<span class="dot ok"></span><span>Saving to <b>' + name + '</b></span>' +
        '<button class="btn small ghost" data-act="connect">Change</button><button class="btn small ghost" data-act="disconnect">Disconnect</button>';
    } else if (st === 'needs-permission') {
      html = '<span class="dot warn"></span><span>Folder <b>' + name + '</b> needs your OK</span>' +
        '<button class="btn small" data-act="reconnect">Allow access</button>';
    } else if (st === 'none') {
      html = '<span class="dot"></span><span>No folder connected. Outputs download.</span>' +
        '<button class="btn small" data-act="connect">Connect folder</button>';
    } else {
      html = '<span class="dot"></span><span>Folder access unavailable here. Outputs download.</span>';
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

  /* ---------- menu board ---------- */
  function renderBoard(main) {
    var groups = {};
    skills.forEach(function (s) { (groups[s.group || 'Other'] = groups[s.group || 'Other'] || []).push(s); });
    groups.Knowledge = (groups.Knowledge || []).concat([{ id: '__knowledge', title: 'Knowledge tab', description: 'Directory, org chart, branches, products and fees, P2B billers, templates.', href: 'knowledge.html', status: 'ready' }]);
    var names = GROUP_ORDER.filter(function (g) { return groups[g]; })
      .concat(Object.keys(groups).filter(function (g) { return GROUP_ORDER.indexOf(g) < 0; }));

    var today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    var html = '<section class="hero"><div><p class="eyebrow">Marketing</p><h1>Reports and reference</h1>' +
      '<p>Select a module. Each one turns a source file into a draft output for your review.</p></div>' +
      '<p class="hero-date">' + esc(today) + '</p></section>';
    names.forEach(function (g) {
      html += '<section class="group"><h2>' + esc(g) + '</h2><div class="tiles">';
      groups[g].forEach(function (s) {
        var st = s.status || 'ready', href = s.href || ('#skill/' + encodeURIComponent(s.id));
        html += '<a class="tile tile-' + esc(st) + '" href="' + esc(href) + '">' +
          '<span class="badge badge-' + esc(st) + '">' + esc(STATUS_LABEL[st] || st) + '</span>' +
          '<span class="tile-title">' + esc(s.title) + '</span>' +
          '<span class="tile-desc">' + esc(s.description || '') + '</span>' +
          '<span class="tile-foot">' + (isLive(s) ? 'Open' : 'View details') + ' <span aria-hidden="true">›</span></span></a>';
      });
      html += '</div></section>';
    });
    main.innerHTML = html;
  }

  /* ---------- skill runner ---------- */
  function renderRunner(main, skill) {
    var state = { inputs: {}, params: {}, metrics: null };
    var st = skill.status || 'ready';
    var html = '<a class="back" href="index.html">← Menu board</a>' +
      '<header class="runner-head"><div><p class="eyebrow">' + esc(skill.group || '') + '</p><h1>' + esc(skill.title) + '</h1>' +
      '<p class="lede">' + esc(skill.description || '') + '</p></div>' +
      '<span class="badge badge-' + esc(st) + '">' + esc(STATUS_LABEL[st] || st) + '</span></header>';

    if (!isLive(skill)) {
      main.innerHTML = html + '<div class="card notice"><h2>Not built yet</h2><p>' + esc(skill.note || 'This module is a placeholder.') + '</p>' +
        listBlock('Planned inputs', skill.plannedInputs) + listBlock('Planned outputs', skill.plannedOutputs) + '</div>';
      return;
    }

    html += '<div class="runner-grid"><section class="card"><h2>1. Files</h2><div id="inputs"></div></section>' +
      '<section class="card"><h2>2. Settings</h2><div id="params"></div>' +
      '<div class="actions"><button class="btn primary" id="run">Run</button></div>' + rulesNote(skill) + '</section></div>' +
      '<div id="errors"></div><section id="results"></section>';
    main.innerHTML = html;

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

    var html = '<div class="results-bar no-print"><h2>3. Outputs</h2><div class="out-buttons">';
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
    else { renderBoard(main); document.title = 'SBA Marketing Portal'; }
    root.scrollTo(0, 0);
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
