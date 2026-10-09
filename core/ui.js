/* core/ui.js — skill registry, site shell (top bar, menu, footer, theme, scroll backgrounds),
   Home, the Product Management page, team pages, and the generic skill runner.
   Skills only call Portal.registerSkill(); nothing here is specific to any one skill. */
(function (root) {
  'use strict';
  var P = root.Portal = root.Portal || {};

  /* ---------- registry ---------- */
  var skills = P.skills = [];
  /** Registering an id that already exists replaces it (a real skill replaces its placeholder).
      Optional def.category picks the team (default 'pm' = Product Management). */
  P.registerSkill = function (def) {
    if (!def || !def.id || !def.title) throw new Error('registerSkill: id and title are required');
    var i = skills.findIndex(function (s) { return s.id === def.id; });
    if (i >= 0) skills[i] = def; else skills.push(def);
  };
  P.getSkill = function (id) { return skills.find(function (s) { return s.id === id; }); };

  /* ---------- site structure ---------- */
  var TEAMS = [
    { id: 'pm', name: 'Product Management', short: 'Product Management', icon: 'chart', live: true,
      blurb: 'DRB usage reports, benchmarking, RIB content and research.' },
    { id: 'creatives', name: 'Creatives', short: 'Creatives', icon: 'brush', blurb: 'Tools for the Creatives team are being planned.' },
    { id: 'customer-service', name: 'Customer Service', short: 'Customer Service', icon: 'chat', blurb: 'Tools for Customer Service are being planned.' },
    { id: 'fraud', name: 'Fraud Management System', short: 'Fraud Management', icon: 'shield', blurb: 'Tools for fraud management are being planned.' }
  ];
  var SECTION_ORDER = ['Benchmarking', 'DRB Reports', 'RIB', 'Research', 'Customer Insights', 'Demo'];
  var SECTION_META = {
    'Benchmarking': { id: 'benchmarking', icon: 'trophy', blurb: 'Where SBA ranks against other banks, from BSP data.' },
    'DRB Reports': { id: 'drb', icon: 'chart', blurb: 'Usage, enrollee and idle-account reports for digital retail banking.' },
    'RIB': { id: 'rib', icon: 'screen', blurb: 'Internet banking content: biller directory and customer advisories.' },
    'Research': { id: 'research', icon: 'book', blurb: 'Past studies and templates for new research.' },
    'Customer Insights': { id: 'insights', icon: 'chat', blurb: 'What customers tell us, by type of concern.' },
    'Demo': { id: 'demo', icon: 'flask', blurb: 'A practice module on made-up data. Safe to try anything.' }
  };
  var STATUS_LABEL = { planned: 'Coming soon', 'on-hold': 'On hold', demo: 'Practice', ready: 'Ready to use' };

  var ICONS = {
    home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/>',
    chart: '<path d="M3 21h18"/><path d="M6 17v-5M11 17V7M16 17v-8M21 17V4"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H4v2a3 3 0 0 0 4 3M16 6h4v2a3 3 0 0 1-4 3M12 13v4M8 21h8M9 17h6"/>',
    screen: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/>',
    book: '<path d="M4 19V5a2 2 0 0 1 2-2h14v14H6a2 2 0 0 0-2 2zm0 0a2 2 0 0 0 2 2h14"/>',
    bank: '<path d="M3 21h18M4 10h16M12 3l9 5H3z"/><path d="M6 10v8M10 10v8M14 10v8M18 10v8"/>',
    flask: '<path d="M9 3h6M10 3v6l-5.5 9.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3"/>',
    brush: '<path d="M14 4l6 6-8.5 8.5a3 3 0 0 1-4.2 0L7 18.2a3 3 0 0 1 0-4.2z"/><path d="M4 21c1.5 0 3-.8 3-2.5"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 10h8M8 13h5"/>',
    shield: '<path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
    file: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    save: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
    folder: '<path d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 8"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="1.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'
  };
  function icon(name, cls) {
    return '<svg class="ico ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
  }
  var LOGO = '<svg class="logo" viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="10" fill="#0d2240"/><path d="M11 28V20M17.5 28V14M24 28v-10M30.5 28V10" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/><path d="M9 31h23" stroke="#f0b323" stroke-width="2" stroke-linecap="round"/></svg>';

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
  function meta(g) { return SECTION_META[g] || { id: String(g).toLowerCase().replace(/\W+/g, '-'), icon: 'file', blurb: '' }; }
  function team(id) { return TEAMS.find(function (t) { return t.id === id; }); }
  function pmSkills() { return skills.filter(function (s) { return (s.category || 'pm') === 'pm'; }); }
  function skillHref(s) { return s.href || ('modules.html#skill/' + encodeURIComponent(s.id)); }
  var reduceMotion = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);

  P.ui = { esc: esc, icon: icon };

  /* ---------- light / dark theme ---------- */
  function currentTheme() { return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
  function themeToggle() {
    var t = currentTheme();
    return '<div class="theme-toggle" role="group" aria-label="Color theme">' +
      '<button data-theme-set="light" aria-pressed="' + (t === 'light') + '" title="Light mode">' + icon('sun') + '<span>Light</span></button>' +
      '<button data-theme-set="dark" aria-pressed="' + (t === 'dark') + '" title="Dark mode">' + icon('moon') + '<span>Dark</span></button></div>';
  }
  function setTheme(t) {
    t = t === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('portal-theme', t); } catch (e) { /* storage blocked: theme lasts for this page only */ }
    document.querySelectorAll('[data-theme-set]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-theme-set') === t)); });
  }
  P.ui.setTheme = setTheme;

  /* ---------- shell ---------- */
  var page = '';
  function navKey() {
    if (page !== 'modules') return page;
    var c = /^cat\/(.+)$/.exec(location.hash.slice(1));
    return c ? 'team:' + c[1] : 'team:pm';
  }
  function renderNav() {
    var nav = $('#nav'), key = navKey();
    if (!nav) return;
    var items = [['Home', 'index.html', 'home', '']].concat(TEAMS.map(function (t) {
      return [t.short, t.live ? 'modules.html' : 'modules.html#cat/' + t.id, 'team:' + t.id, t.live ? '' : '<span class="soon">Soon</span>'];
    })).concat([['Employee Info', 'knowledge.html', 'knowledge', ''], ['How to use', 'help.html', 'help', '']]);
    nav.innerHTML = items.map(function (n) {
      var on = n[2] === key;
      return '<a href="' + n[1] + '"' + (on ? ' class="active" aria-current="page"' : '') + '>' + n[0] + n[3] + '</a>';
    }).join('');
  }

  function renderShell() {
    document.body.insertAdjacentHTML('afterbegin', '<div class="bg" aria-hidden="true"><span class="blob b1"></span><span class="blob b2"></span><span class="blob b3"></span><span class="grid-lines"></span></div>');
    $('#shell').innerHTML =
      '<a class="skip" href="#main">Skip to content</a>' +
      '<div class="topbar"><div class="wrap topbar-in"><span class="restricted-note">' + icon('lock') + '<b>For the Marketing Group only</b></span>' +
      '<span class="topbar-sep">Works offline · nothing leaves this computer</span><div class="folder" id="folder"></div>' + themeToggle() + '</div></div>' +
      '<div class="masthead"><div class="wrap masthead-in"><a class="brand" href="index.html" title="Go to Home">' + LOGO +
      '<span class="brand-text"><b>Marketing Portal</b><small>Sterling Bank of Asia</small></span></a><nav class="nav" id="nav" aria-label="Main menu"></nav></div></div>';
    renderNav();
    renderFolder();
    renderFooter();
    document.body.insertAdjacentHTML('beforeend', '<div class="fab-stack no-print"><button class="suggest-fab" type="button" data-suggest title="Suggest a change to this portal">' + icon('chat') + '<span>Suggest a change</span></button>' +
      (page !== 'help' ? '<a class="help-fab" href="help.html" title="How to use this site">' + icon('help') + '<span>How to use</span></a>' : '') + '</div>');
  }

  function renderFooter() {
    var f = $('#foot');
    if (!f) return;
    f.innerHTML = '<div class="wrap foot-grid"><div class="foot-brand"><div class="brand light">' + LOGO +
      '<span class="brand-text"><b>Marketing Portal</b><small>Sterling Bank of Asia</small></span></div>' +
      '<p>An offline workspace that turns recurring files into draft reports for your review. Files are read on this computer and never leave it.</p></div>' +
      '<div><h4>Teams</h4><ul>' + TEAMS.map(function (t) { return '<li><a href="' + (t.live ? 'modules.html' : 'modules.html#cat/' + t.id) + '">' + esc(t.name) + (t.live ? '' : ' <small>(soon)</small>') + '</a></li>'; }).join('') + '</ul></div>' +
      '<div><h4>Help</h4><ul><li><a href="help.html">How to use this site</a></li><li><a href="help.html#reports">Making a report</a></li><li><a href="help.html#errors">Fixing file errors</a></li><li><a href="help.html#faq">Common questions</a></li><li><a href="knowledge.html">Employee Info</a></li></ul></div>' +
      '<div><h4>About the figures</h4><p>Every number is calculated from the files you supply. Commentary marked DRAFT uses thresholds not yet approved by SBA. Outputs are drafts until you review and release them.</p></div></div>' +
      '<div class="foot-base"><div class="wrap foot-base-in"><span>Sterling Bank of Asia · Restricted to the Marketing Group. Do not share this portal or its outputs outside the group without approval.</span><span>Phase 1</span></div></div>';
  }

  function renderFolder() {
    var f = P.files, box = $('#folder');
    if (!box) return;
    var st = f.status(), name = esc(f.folderName()), html = icon('folder');
    if (st === 'connected') {
      html += '<span title="Reference files are read from this folder; each project saves its outputs in its own Outputs folder.">Portal folder: <b>' + name + '</b></span><button class="linkbtn" data-act="connect">Change</button><button class="linkbtn" data-act="disconnect">Disconnect</button>';
    } else if (st === 'needs-permission') {
      html += '<span>Portal folder <b>' + name + '</b> needs permission</span><button class="linkbtn strong" data-act="reconnect">Allow access</button>';
    } else if (st === 'none') {
      html += '<span title="Pick one folder: the portal reads your reference files from it and saves outputs into it.">No portal folder yet</span><button class="linkbtn strong" data-act="connect">Choose folder</button>';
    } else {
      html += '<span>Files save to your Downloads folder</span>';
    }
    if (f.lastError) html += '<span class="folder-err" title="' + esc(f.lastError) + '">!</span>';
    box.innerHTML = html;
    var setup = $('#folder-setup');
    if (setup) setup.innerHTML = st === 'none' || st === 'needs-permission' ? '<div class="card folder-setup">' + icon('folder') + '<div><h2>' + (st === 'none' ? 'Set up your portal folder' : 'Allow your portal folder') + '</h2>' +
      (st === 'none' ? '<p>Pick one folder on this computer (for example <b>Documents › SBA Portal Files</b>). The portal adds one folder per project inside it: <b>Employee Info</b>, <b>QR Ph Billers</b> and <b>Industry Ranking</b> (one folder per quarter, e.g. 2026-Q3). Each project keeps its saved files in its own <b>Outputs</b> folder. Drop each new file in its project folder and the pages find it by themselves.</p>'
        : '<p>Chrome asks again after it restarts. Click Allow, then choose <b>Allow on every visit</b> if Chrome offers it.</p>') +
      '<p><button class="btn gold" data-act="' + (st === 'none' ? 'connect' : 'reconnect') + '">' + icon('folder') + (st === 'none' ? 'Choose folder' : 'Allow folder') + '</button> <a href="help.html#folder">How it works</a></p></div></div>' : '';
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-theme-set]');
    if (t) { setTheme(t.getAttribute('data-theme-set')); return; }
    var b = e.target.closest('#folder [data-act], #folder-setup [data-act]');
    if (!b) return;
    var act = b.getAttribute('data-act');
    if (act === 'connect') P.files.connect();
    else if (act === 'reconnect') P.files.reconnect();
    else if (act === 'disconnect') P.files.disconnect();
  });


  /* ---------- "Suggest a change" (opens the user's own mail app; the portal sends nothing) ---------- */
  var MAILTO_MAX = 1800;
  function suggestPage() {
    var c = document.querySelector('.crumbs');
    if (c) return c.textContent.replace(/\s*›\s*/g, ' › ').replace(/\s+/g, ' ').trim();
    return page === 'home' ? 'Home' : document.title.replace(/ · Marketing Portal$/, '');
  }
  function suggestText(f) {
    var lines = ['Page: ' + f.page, 'Kind: ' + f.kind, '', 'What should change:', f.what, ''];
    if (f.why) lines.push('Why it helps:', f.why, '');
    lines.push('From: ' + (f.name || '(not given)'), 'Date: ' + new Date().toLocaleString('en-US'), 'Browser: ' + navigator.userAgent.replace(/^.*(Edg|Chrome)\/(\d+).*$/, '$1 $2'));
    return lines.join('\n');
  }
  function suggestDialog() {
    var d = $('#suggest-dialog');
    if (d) return d;
    var FB = root.SBA_FEEDBACK || { to: '', subject: '[Marketing Portal] Suggestion' };
    document.body.insertAdjacentHTML('beforeend',
      '<dialog id="suggest-dialog" class="suggest-dialog" aria-labelledby="suggest-title"><form method="dialog" class="suggest-form" novalidate>' +
      '<h2 id="suggest-title">' + icon('chat') + 'Suggest a change</h2>' +
      '<p class="muted">Tell us what to improve. Your email app opens with the message ready for <b>' + esc(FB.to || 'the portal owner') + '</b>; check it, then click Send.</p>' +
      '<label><span>Which page?</span><input name="page" type="text"></label>' +
      '<label><span>What kind?</span><select name="kind"><option>Something isn’t working</option><option>Wording or design</option><option>New idea</option><option>Other</option></select></label>' +
      '<label><span>What should change? <span class="req">*</span></span><textarea name="what" rows="3" placeholder="For example: the Save button is hard to find on small screens"></textarea></label>' +
      '<label><span>Why does it help? <small>(optional)</small></span><textarea name="why" rows="2"></textarea></label>' +
      '<label><span>Your name <small>(optional)</small></span><input name="name" type="text"></label>' +
      '<p class="suggest-note">The portal does not send anything by itself. Please don’t include customer or confidential data.</p>' +
      '<p class="suggest-msg" role="status"></p>' +
      '<div class="suggest-actions"><button class="btn primary" type="button" data-sg="mail">Open email ' + icon('arrow') + '</button><button class="btn" type="button" data-sg="copy">Copy text</button><button class="btn" type="button" data-sg="cancel">Cancel</button></div>' +
      '<a id="suggest-mailto" hidden></a></form></dialog>');
    d = $('#suggest-dialog');
    var form = $('form', d), msg = $('.suggest-msg', d);
    function fields() { return { page: form.page.value.trim(), kind: form.kind.value, what: form.what.value.trim(), why: form.why.value.trim(), name: form.name.value.trim() }; }
    function check() { var f = fields(); if (!f.what) { msg.textContent = 'Please describe what should change.'; msg.className = 'suggest-msg bad'; form.what.focus(); return null; } return f; }
    function copy(text) {
      var done = function () { msg.textContent = 'Copied. Paste it into a new email to ' + FB.to + '.'; msg.className = 'suggest-msg ok'; };
      if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(done, function () { legacyCopy(text); done(); });
      legacyCopy(text); done();
    }
    function legacyCopy(text) { var t = document.createElement('textarea'); t.value = text; d.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (e) { /* ignore */ } t.remove(); }
    d.addEventListener('click', function (e) {
      var b = e.target.closest('[data-sg]');
      if (!b) { if (e.target === d) d.close(); return; }
      var act = b.getAttribute('data-sg');
      if (act === 'cancel') { d.close(); return; }
      var f = check(); if (!f) return;
      var body = suggestText(f);
      if (act === 'copy') { copy(body); return; }
      var subject = FB.subject + ' – ' + f.kind + ' – ' + f.page;
      var href = 'mailto:' + encodeURIComponent(FB.to).replace(/%40/g, '@') + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
      if (href.length > MAILTO_MAX) { msg.textContent = 'This message is too long to open in email directly. Click Copy text, then paste it into a new email to ' + FB.to + '.'; msg.className = 'suggest-msg bad'; return; }
      var a = $('#suggest-mailto'); a.href = href; a.click();
      msg.textContent = 'Your email app should open now. Check the message and click Send.'; msg.className = 'suggest-msg ok';
    });
    return d;
  }
  document.addEventListener('click', function (e) {
    if (!e.target.closest || !e.target.closest('[data-suggest]')) return;
    var d = suggestDialog(), form = $('form', d);
    form.reset(); form.page.value = suggestPage(); $('.suggest-msg', d).textContent = '';
    if (d.showModal) d.showModal(); else d.setAttribute('open', '');
    form.what.focus();
  });

  /* ---------- scroll-reactive background + reveal ---------- */
  /** Each <section data-scene="..."> sets the background scene while it is the main thing on screen;
      blobs drift with scroll position. Pure decoration: off for reduced motion and print. */
  function initScenes() {
    var d = document.documentElement, ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      root.requestAnimationFrame(function () {
        ticking = false;
        var max = Math.max(1, document.documentElement.scrollHeight - root.innerHeight);
        d.style.setProperty('--sy', String(root.scrollY));
        d.style.setProperty('--sp', (root.scrollY / max).toFixed(3));
        var best = null, bestVis = 0, vh = root.innerHeight;
        document.querySelectorAll('body [data-scene]').forEach(function (s) {
          var r = s.getBoundingClientRect(), vis = Math.min(r.bottom, vh) - Math.max(r.top, 0);
          if (vis > bestVis) { bestVis = vis; best = s; }
        });
        d.setAttribute('data-scene', best ? best.getAttribute('data-scene') : 'calm');
      });
    }
    if (!reduceMotion) { root.addEventListener('scroll', onScroll, { passive: true }); root.addEventListener('resize', onScroll); }
    P.ui.refreshScene = onScroll;
    onScroll();
  }
  function reveal(scope) {
    if (reduceMotion || !('IntersectionObserver' in root)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    (scope || document).querySelectorAll('.reveal').forEach(function (n, i) { n.style.setProperty('--d', (i % 4) * 60 + 'ms'); n.classList.add('armed'); io.observe(n); });
  }
  function settle(scope) { reveal(scope); if (P.ui.refreshScene) P.ui.refreshScene(); }

  /* ---------- shared pieces ---------- */
  function groupsMap(list) {
    var groups = {};
    list.forEach(function (s) { (groups[s.group || 'Other'] = groups[s.group || 'Other'] || []).push(s); });
    var names = SECTION_ORDER.filter(function (g) { return groups[g]; })
      .concat(Object.keys(groups).filter(function (g) { return SECTION_ORDER.indexOf(g) < 0; }));
    return { groups: groups, names: names };
  }
  function moduleCard(s, ico) {
    var st = s.status || 'ready';
    return '<a class="mcard reveal st-' + esc(st) + '" href="' + esc(skillHref(s)) + '"><div class="mcard-top"><span class="mcard-ico">' + icon(ico || meta(s.group).icon) + '</span>' +
      '<span class="pill pill-' + esc(st) + '">' + esc(STATUS_LABEL[st] || st) + '</span></div>' +
      '<h3>' + esc(s.title) + '</h3><p>' + esc(s.description || '') + '</p>' +
      '<span class="more">' + (isLive(s) ? 'Open' : 'See what it will do') + icon('arrow') + '</span></a>';
  }
  /** Picture slot: shows the image if the file exists, otherwise a labelled placeholder naming the file to add. */
  function imgSlot(src, label, cls) {
    return '<figure class="imgslot ' + (cls || '') + '"><img src="' + esc(src) + '" alt="' + esc(label) + '" onerror="this.parentNode.classList.add(\'empty\')">' +
      '<figcaption class="imgslot-ph">' + icon('image') + '<b>' + esc(label) + '</b><span>Add a picture named</span><code>' + esc(src) + '</code></figcaption></figure>';
  }
  function pageHead(crumbs, title, lede, extra, scene) {
    return '<header class="page-head" data-scene="' + (scene || 'calm') + '"><div class="wrap"><nav class="crumbs" aria-label="You are here"><a href="index.html">' + icon('home') + 'Home</a>' +
      crumbs.map(function (c) { return '<span aria-hidden="true">›</span>' + (c[1] ? '<a href="' + c[1] + '">' + esc(c[0]) + '</a>' : '<b>' + esc(c[0]) + '</b>'); }).join('') + '</nav>' +
      '<div class="page-title"><div><h1>' + esc(title) + '</h1>' + (lede ? '<p class="lede">' + lede + '</p>' : '') + '</div>' + (extra || '') + '</div></div></header>';
  }

  /* ---------- quick finder (Home) ---------- */
  function initFinder() {
    var input = $('#finder'), list = $('#finder-list');
    if (!input) return;
    var all = skills.map(function (s) { return { t: s.title, d: s.description || '', h: skillHref(s), st: s.status || 'ready', g: s.group || '' }; })
      .concat([{ t: 'Employee Info', d: 'Employee Directory (phone numbers, branches), Code of Conduct', h: 'knowledge.html', st: 'ready', g: 'Reference' },
        { t: 'How to use this site', d: 'Step-by-step guide and common questions', h: 'help.html', st: 'ready', g: 'Help' }]);
    function show() {
      var q = input.value.trim().toLowerCase();
      if (!q) { list.hidden = true; list.innerHTML = ''; return; }
      var hits = all.filter(function (x) { return (x.t + ' ' + x.d + ' ' + x.g).toLowerCase().indexOf(q) >= 0; }).slice(0, 6);
      hits.push({ t: 'Search Employee Info for “' + input.value.trim() + '”', d: '', h: 'knowledge.html#q=' + encodeURIComponent(input.value.trim()), st: 'ready', g: 'Employee Directory and Code of Conduct' });
      list.innerHTML = hits.length ? hits.map(function (x) {
        return '<li><a href="' + esc(x.h) + '"><b>' + esc(x.t) + '</b><span>' + esc(x.g) + ' · ' + esc(STATUS_LABEL[x.st] || '') + '</span></a></li>';
      }).join('') : '<li class="none">Nothing matches "' + esc(input.value) + '". Try a simpler word, or open <a href="help.html">How to use</a>.</li>';
      list.hidden = false;
    }
    input.addEventListener('input', show);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { var a = $('a', list); if (a) location.href = a.getAttribute('href'); }
      if (e.key === 'Escape') { input.value = ''; show(); }
    });
  }

  /* ---------- home ---------- */
  function renderHome(main) {
    var H = root.SBA_HOME || {}, pm = pmSkills(), gm = groupsMap(pm);
    var ready = pm.filter(isLive).length, soon = pm.filter(function (s) { return s.status === 'planned'; }).length;

    var html = '<section class="home-hero" data-scene="hero"><div class="hero-art" aria-hidden="true"><span></span><span></span><span></span></div><div class="wrap home-hero-in"><div class="home-hero-copy">' +
      '<p class="restricted">' + icon('lock') + 'For the Marketing Group only</p>' +
      '<h1>' + esc(H.headline || 'Welcome to the Marketing Portal') + '</h1>' +
      '<p class="hero-lede">' + esc(H.intro || 'Create reports and find reference information in a few clicks. Everything stays on this computer.') + '</p>' +
      '<div class="finder"><label for="finder" class="sr-only">Search for a report or tool</label>' + icon('search') +
      '<input id="finder" type="search" autocomplete="off" placeholder="What do you need? Try “ranking”, “DRB” or “biller”"><ul id="finder-list" class="finder-list" hidden></ul></div>' +
      '<div class="hero-cta"><a class="btn gold lg" href="modules.html">Open Product Management ' + icon('arrow') + '</a><a class="btn ghost-light lg" href="help.html">' + icon('help') + 'How to use this site</a></div></div>' +
      imgSlot(H.heroImage || 'assets/images/home-hero.jpg', 'Main picture', 'hero-img') + '</div></section>';

    var pmTeam = TEAMS[0];
    html += '<div class="wrap"><div id="folder-setup"></div></div>';
    html += '<section class="band" data-scene="sky"><div class="wrap"><header class="band-head"><p class="kicker">Step 1</p><h2>Choose your team</h2><p>Pick the area you work in. More teams are on the way.</p></header>' +
      '<div class="teams"><a class="team team-live reveal" href="modules.html"><span class="team-ico">' + icon(pmTeam.icon) + '</span><span class="pill pill-ready">Open now</span>' +
      '<h3>' + esc(pmTeam.name) + '</h3><p>' + esc(pmTeam.blurb) + '</p><dl class="team-stats"><div><dt>Ready to use</dt><dd>' + ready + '</dd></div><div><dt>Coming soon</dt><dd>' + soon + '</dd></div></dl>' +
      '<span class="more">Go to Product Management' + icon('arrow') + '</span></a><div class="teams-soon">' +
      TEAMS.slice(1).map(function (t) {
        return '<a class="team team-soon reveal" href="modules.html#cat/' + t.id + '"><span class="team-ico">' + icon(t.icon) + '</span><div><h3>' + esc(t.name) + '</h3><p>' + esc(t.blurb) + '</p></div><span class="pill">' + icon('clock') + 'Coming soon</span></a>';
      }).join('') + '</div></div></div></section>';

    html += '<section class="band alt" data-scene="gold"><div class="wrap"><header class="band-head"><p class="kicker">Step 2</p><h2>Jump straight to a report</h2><p>The main areas inside Product Management.</p></header><div class="shortcuts">' +
      gm.names.map(function (g) {
        var mm = meta(g), n = gm.groups[g].length, live = gm.groups[g].filter(isLive).length;
        return '<a class="shortcut reveal" href="modules.html#' + mm.id + '"><span class="shortcut-ico">' + icon(mm.icon) + '</span><span class="shortcut-txt"><b>' + esc(g) + '</b><small>' + n + (n === 1 ? ' module' : ' modules') + (live ? ' · ' + live + ' ready' : '') + '</small></span>' + icon('arrow', 'shortcut-arrow') + '</a>';
      }).join('') + '<a class="shortcut reveal" href="knowledge.html"><span class="shortcut-ico">' + icon('bank') + '</span><span class="shortcut-txt"><b>Employee Info</b><small>Employee Directory, Code of Conduct</small></span>' + icon('arrow', 'shortcut-arrow') + '</a></div></div></section>';

    var feats = H.features || [];
    if (feats.length) {
      html += '<section class="band" data-scene="mint"><div class="wrap"><header class="band-head"><p class="kicker">' + esc(H.featuresKicker || 'Highlights') + '</p><h2>' + esc(H.featuresTitle || 'From the Marketing Group') + '</h2></header><div class="features">' +
        feats.map(function (f, i) { return '<article class="feature reveal">' + imgSlot(f.image, 'Picture ' + (i + 1)) + '<div class="feature-body"><h3>' + esc(f.title) + '</h3><p>' + esc(f.text) + '</p></div></article>'; }).join('') +
        '</div></div></section>';
    }

    var steps = [['file', 'Choose your file', 'Open a module and pick the Excel or PDF file. It is read on this computer only.'],
      ['check', 'The portal checks it', 'If something is missing or wrong in the file, you get a plain list of what to fix.'],
      ['eye', 'Review the draft', 'Figures, charts and comments appear on screen for you to check.'],
      ['save', 'Save and send', 'Save as Excel, Word or PDF. You decide what gets sent, and to whom.']];
    html += '<section class="band how" data-scene="navy"><div class="wrap"><header class="band-head center"><p class="kicker">New here?</p><h2>How it works</h2><p>Every report follows the same four steps.</p></header><ol class="steps">' +
      steps.map(function (s, i) { return '<li class="reveal"><span class="step-ico">' + icon(s[0]) + '</span><span class="step-n">Step ' + (i + 1) + '</span><h3>' + s[1] + '</h3><p>' + s[2] + '</p></li>'; }).join('') +
      '</ol><p class="center-cta"><a class="btn" href="help.html">' + icon('help') + 'Read the full guide</a></p></div></section>';
    main.innerHTML = html;
    initFinder();
    settle(main);
  }

  /* ---------- Product Management page ---------- */
  function renderModules(main, tab) {
    var gm = groupsMap(pmSkills()), names = gm.names, groups = gm.groups;
    var shown = names.filter(function (g) { return !tab || meta(g).id === tab; });
    if (!shown.length) { shown = names; tab = ''; }
    var html = pageHead([['Product Management']], 'Product Management', 'Pick a report. Each one turns one kind of file into a draft for your review. Cards marked <b>Coming soon</b> are still being built.', '', 'calm') +
      '<div class="tabs-bar"><div class="wrap"><nav class="tabs" aria-label="Product Management sections"><a href="modules.html"' + (!tab ? ' class="active" aria-current="true"' : '') + '>All</a>' +
      names.map(function (g) { var id = meta(g).id; return '<a href="modules.html#' + id + '"' + (tab === id ? ' class="active" aria-current="true"' : '') + '>' + esc(g) + ' <span class="tab-n">' + groups[g].length + '</span></a>'; }).join('') +
      '</nav></div></div>';
    var scenes = ['sky', 'gold', 'mint', 'navy'];
    shown.forEach(function (g, gi) {
      var mm = meta(g);
      html += '<section class="band' + (gi % 2 ? ' alt' : '') + '" id="' + mm.id + '" data-scene="' + scenes[gi % scenes.length] + '"><div class="wrap band-in"><header class="band-head">' +
        '<span class="band-ico">' + icon(mm.icon) + '</span><h2>' + esc(g) + '</h2><p>' + esc(mm.blurb) + '</p></header><div class="cards">' +
        groups[g].map(function (s) { return moduleCard(s, mm.icon); }).join('') + '</div></div></section>';
    });
    main.innerHTML = html;
    settle(main);
  }

  /* ---------- coming-soon team pages ---------- */
  function renderTeam(main, t) {
    main.innerHTML = pageHead([[t.name]], t.name, esc(t.blurb), '<span class="pill">' + icon('clock') + 'Coming soon</span>', 'calm') +
      '<section class="band" data-scene="gold"><div class="wrap"><div class="card soon-card reveal"><span class="team-ico big">' + icon(t.icon) + '</span>' +
      '<h2>This area is not open yet</h2><p>We are still planning the tools for ' + esc(t.name) + '. Nothing here needs your action for now.</p>' +
      '<p>Looking for reports today? They are in <b>Product Management</b>.</p>' +
      '<div class="btn-row"><a class="btn primary lg" href="modules.html">Go to Product Management ' + icon('arrow') + '</a><a class="btn lg" href="index.html">' + icon('back') + 'Back to Home</a></div></div></div></section>';
    settle(main);
  }

  /* ---------- skill runner ---------- */
  function renderRunner(main, skill) {
    var state = { inputs: {}, params: {}, metrics: null, manual: {} };
    var st = skill.status || 'ready', g = skill.group || '', gid = meta(g).id;
    var head = pageHead([['Product Management', 'modules.html'], [g, 'modules.html#' + gid], [skill.title]], skill.title, esc(skill.description || ''),
      '<span class="pill pill-' + esc(st) + '">' + esc(STATUS_LABEL[st] || st) + '</span>', 'calm');
    var back = '<a class="backlink" href="modules.html#' + gid + '">' + icon('back') + 'Back to ' + esc(g) + '</a>';

    if (!isLive(skill)) {
      main.innerHTML = head + '<div class="wrap page-body">' + back + '<div class="card notice"><h2>' + icon('clock') + 'This report is coming soon</h2><p>' + esc(skill.note || 'It is still being built.') + '</p>' +
        '<div class="notice-cols">' + listBlock('You will provide', skill.plannedInputs) + listBlock('You will get', skill.plannedOutputs) + '</div>' +
        '<a class="btn primary" href="modules.html#' + gid + '">' + icon('back') + 'Back to ' + esc(g) + '</a></div></div>';
      settle(main);
      return;
    }

    main.innerHTML = head + '<div class="wrap page-body">' + back +
      '<div class="guide no-print"><b>How to use this page:</b><ol><li>Choose your file</li><li>Check the settings</li><li>Click <b>Create report</b></li><li>Review it, then save</li></ol><a href="help.html#reports">More help</a></div>' +
      '<div class="runner-grid">' +
      '<section class="card"><h2><span class="step">1</span>Choose your file</h2><div id="inputs"></div></section>' +
      '<section class="card"><h2><span class="step">2</span>Check the settings</h2><div id="params"></div>' +
      '<div class="actions"><button class="btn primary lg" id="run">Create report ' + icon('arrow') + '</button></div>' + rulesNote(skill) + '</section></div>' +
      '<div id="errors"></div><section id="results"></section></div>';

    var inBox = $('#inputs'), rows = {};
    (skill.inputs || []).forEach(function (d) { inBox.appendChild(rows[d.key] = inputRow(d, state)); });
    fillFromFolder(skill, state, rows);
    runnerRefill = function () { fillFromFolder(skill, state, rows); };
    inBox.addEventListener('click', function (e) {
      var b = e.target.closest('[data-src-refill]'); if (!b) return;
      state.manual = {}; fillFromFolder(skill, state, rows);
    });
    if (!(skill.inputs || []).length) inBox.innerHTML = '<p class="muted">No files needed.</p>';

    var pBox = $('#params');
    (skill.params || []).forEach(function (d) { pBox.appendChild(paramRow(d, state)); });
    if (!(skill.params || []).length) pBox.innerHTML = '<p class="muted">No settings.</p>';

    $('#run').addEventListener('click', function () { run(skill, state); });
    settle(main);
  }

  /* ---------- portal folder: fill a skill's inputs from the folder the user connected ---------- */
  var runnerRefill = null;
  function fillFromFolder(skill, state, rows) {
    (skill.inputs || []).filter(function (d) { return d.source && !state.manual[d.key]; }).forEach(function (d) {
      var r = rows[d.key];
      P.files.find(d.source, d.type).then(function (res) {
        if (state.manual[d.key]) return;
        if (res.status === 'unsupported') return r._note('');
        if (res.status === 'no-folder') return r._note(icon('folder') + 'Tip: choose your <b>portal folder</b> (top bar) and this is filled in for you from its <b>' + esc(d.source.folder) + '</b> folder.');
        if (res.status === 'needs-permission') return r._note(icon('folder') + 'Your portal folder needs permission again. <button class="linkbtn-dark" data-folder-allow>Allow folder</button>');
        if (res.status === 'not-found') {
          return r._note(icon('folder') + (d.required ? 'Not found in ' : 'Nothing in ') + esc(P.files.folderName()) + ' › <b>' + esc(res.path.replace(/\\/g, ' › ')) + '</b> (' + esc(res.why) + ').' +
            (d.required ? ' Put the file there and <button class="linkbtn-dark" data-src-refill>look again</button>, or choose it below.' : ''));
        }
        r._fill(res.files);
        r._note(icon('check') + 'From your portal folder: <b>' + esc(P.files.folderName() + ' › ' + res.path.replace(/\\/g, ' › ')) + '</b> (' + esc(res.why) + '). <button class="linkbtn-dark" data-src-refill>Look again</button>');
      });
    });
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-folder-allow]')) P.files.reconnect();
  });

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
      (d.help ? '<p class="help">' + esc(d.help) + '</p>' : '') + '<p class="src-note" hidden></p><div class="file-line"></div></div>');
    var line = $('.file-line', row);

    if (d.type === 'paste') {
      var ta = el('<textarea rows="6" placeholder="Paste text here"></textarea>');
      ta.addEventListener('input', function () { state.inputs[d.key] = ta.value ? { kind: 'text', name: 'pasted', text: ta.value } : undefined; });
      line.appendChild(ta);
      return row;
    }
    var many = !!d.multiple;
    var btn = el('<button class="btn">' + (many ? 'Choose files…' : 'Choose file…') + '</button>');
    var info = el('<span class="file-info muted">' + (many ? 'No files chosen. You can also drag files here.' : 'No file chosen. You can also drag the file here.') + '</span>');
    /* Reads the chosen files. A multiple input keeps every file as an array (adding to what is already there). */
    function load(list) {
      list = Array.prototype.slice.call(list || []);
      if (!list.length) return;
      if (!many) list = list.slice(0, 1);
      info.className = 'file-info muted';
      info.textContent = 'Reading ' + list.map(function (f) { return f.name; }).join(', ') + '…';
      Promise.all(list.map(function (file) {
        return P.parse.input(d, file).then(function (data) { return data; }, function (e) {
          return { kind: 'error', name: file.name, error: String(e && e.message || e) };
        });
      })).then(function (res) {
        var ok = res.filter(function (r) { return r.kind !== 'error'; }), bad = res.filter(function (r) { return r.kind === 'error'; });
        if (many) {
          var prev = (state.inputs[d.key] || []).filter(function (p) { return !ok.some(function (n) { return n.name === p.name; }); });
          state.inputs[d.key] = prev.concat(ok);
        } else state.inputs[d.key] = ok[0];
        var cur = many ? state.inputs[d.key] : (ok[0] ? [ok[0]] : []);
        info.innerHTML = (cur.length ? '<span class="ok">' + cur.map(function (r) { return '<b>' + esc(r.name) + '</b> · ' + esc(summary(r)); }).join('<br>') + '</span>' : '') +
          (bad.length ? '<span class="bad">' + bad.map(function (r) { return 'Could not read ' + esc(r.name) + ': ' + esc(r.error); }).join('<br>') + '</span>' : '') +
          (many && cur.length ? '<button class="linkbtn-dark" data-clear>Clear files</button>' : '');
        info.className = 'file-info' + (bad.length || !cur.length ? ' bad' : ' ok');
        if (!many && !ok.length) state.inputs[d.key] = undefined;
      });
    }
    /* Used by the portal folder: replace whatever is there with the files found in the folder. */
    row._fill = function (list) { state.inputs[d.key] = undefined; load(list); };
    row._note = function (html) { var n = $('.src-note', row); n.innerHTML = html || ''; n.hidden = !html; };
    btn.addEventListener('click', function () {
      P.files.pick({ accept: P.files.acceptFor(d.type), multiple: many }).then(function (l) {
        if (l.length) { state.manual[d.key] = true; if (d.source) row._note('Using the file you chose. <button class="linkbtn-dark" data-src-refill>Use the portal folder again</button>'); }
        load(l);
      });
    });
    info.addEventListener('click', function (e) {
      if (!e.target.closest('[data-clear]')) return;
      state.inputs[d.key] = undefined;
      info.className = 'file-info muted'; info.textContent = 'No files chosen. You can also drag files here.';
    });
    row.classList.add('dropzone');
    row.addEventListener('dragover', function (e) { e.preventDefault(); row.classList.add('over'); });
    row.addEventListener('dragleave', function (e) { if (!row.contains(e.relatedTarget)) row.classList.remove('over'); });
    row.addEventListener('drop', function (e) { e.preventDefault(); row.classList.remove('over'); state.manual[d.key] = true; load(e.dataTransfer && e.dataTransfer.files); });
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
    box.innerHTML = '<div class="card errors"><h2>' + esc(title || 'A few things need fixing in your file') + '</h2><ul>' +
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
    if (errs.length) { $('#errors').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }

    var m;
    try { m = skill.analyze(state.inputs, state.params); }
    catch (e) { showErrors([String(e && e.message || e)], 'Calculation error'); return; }
    state.metrics = m;

    var files = [], screens = [];
    (skill.outputs || []).forEach(function (o) { (o.format === 'html' ? screens : files).push(o); });

    var html = '<div class="results-bar no-print"><h2><span class="step">3</span>Review, then save</h2><div class="out-buttons">';
    files.forEach(function (o) {
      html += o.format === 'action' ? '<button class="btn" data-out="' + esc(o.key) + '" title="' + esc(o.note || '') + '">' + icon('file') + esc(o.label) + '</button>'
        : '<button class="btn primary" data-out="' + esc(o.key) + '">' + icon('save') + 'Save ' + esc(o.label) + '</button>';
    });
    if (screens.length && skill.screenPrint !== false) html += '<button class="btn" data-print>Print / PDF</button>';
    html += '</div><p id="save-msg" class="muted"></p></div>';
    screens.forEach(function (o) { html += '<article class="output-html" data-screen="' + esc(o.key) + '"></article>'; });
    results.innerHTML = html;

    screens.forEach(function (o) {
      Promise.resolve(o.render(m, state.params)).then(function (h) { $('[data-screen="' + o.key + '"]', results).innerHTML = h; });
    });
    files.forEach(function (o) {
      $('[data-out="' + o.key + '"]', results).addEventListener('click', function () {
        if (o.format !== 'action') return saveOutput(skill, o, m, state.params);
        var msg = $('#save-msg'); msg.textContent = o.note || '';   // an output that does something itself (e.g. opens a print view)
        Promise.resolve().then(function () { return o.run(m, state.params); }).catch(function (e) { msg.textContent = String(e && e.message || e); });
      });
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
      var sub = skill.outputFolder || ((skill.inputs || []).filter(function (d) { return d.source; })[0] || { source: { folder: skill.title } }).source.folder;
      return P.files.save(P.export.safeName(base) + '.' + built.ext, built.blob, P.export.safeName(sub));
    }).then(function (r) {
      msg.textContent = r.where === 'folder' ? 'Saved "' + r.name + '" to folder ' + r.folder + '.' : 'Downloaded "' + r.name + '".' + (r.error ? ' ' + r.error : '');
      renderFolder();
    }, function (e) { msg.textContent = 'Export failed: ' + (e && e.message || e); });
  }

  /* ---------- boot ---------- */
  function route() {
    var main = $('#main'), h = location.hash.slice(1), m = /^skill\/(.+)$/.exec(h), c = /^cat\/(.+)$/.exec(h);
    var skill = m && P.getSkill(decodeURIComponent(m[1])), t = c && team(c[1]);
    runnerRefill = null;
    if (skill) { renderRunner(main, skill); document.title = skill.title + ' · Marketing Portal'; }
    else if (t && !t.live) { renderTeam(main, t); document.title = t.name + ' · Marketing Portal'; }
    else {
      var sec = SECTION_ORDER.map(meta).find(function (x) { return x.id === h; }) ? h : '';
      renderModules(main, sec); document.title = 'Product Management · Marketing Portal';
    }
    renderNav();
    root.scrollTo(0, 0);
  }

  /** p: 'home' (index.html), 'modules' (modules.html), 'knowledge' or 'help'. */
  P.ui.boot = function (p) {
    page = p;
    renderShell();
    initScenes();
    P.files.onChange(function (st) { renderFolder(); if (runnerRefill && st !== 'none') runnerRefill(); });
    P.files.init();
    var ready = P.skillsLoaded || Promise.resolve();
    if (p === 'home') ready.then(function () { renderHome($('#main')); });
    else if (p === 'modules') ready.then(function () { root.addEventListener('hashchange', route); route(); });
    else settle(document);
  };
})(typeof window !== 'undefined' ? window : globalThis);
