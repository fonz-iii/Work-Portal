/* core/knowledge.js — Employee Info page (knowledge.html): Phone Directory + Code of Conduct.
   PRIVACY: the real files hold staff names and numbers. They are read in the browser on the office PC
   and kept only in this browser's IndexedDB on that PC. Nothing here is written to the repo or sent anywhere.
   parseDirectory() and parseCode() are pure functions (no DOM) so they can be tested with sample data. */
(function (root) {
  'use strict';
  var P = root.Portal = root.Portal || {};
  var K = P.knowledge = {};

  /* ---------- text helpers ---------- */
  function str(v) {
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return v.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    return String(v).replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim();
  }
  function fold(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }
  function letters(s) { return (s.match(/[A-Za-zÀ-ÿ]/g) || []).length; }
  function isCaps(s) { return letters(s) > 0 && s === s.toUpperCase(); }
  function oneLine(s) { return s.replace(/\s*\n\s*/g, ' ').replace(/\s+-\s*/g, ' - ').trim(); }
  function titleCase(s) { return s.toLowerCase().replace(/(^|[\s\-'(./])([a-zà-ÿ])/g, function (m, a, b) { return a + b.toUpperCase(); }); }
  var AS_OF = /as of\s+((?:[A-Z][a-z]+\.?\s+\d{1,2},?\s+\d{4})|(?:\d{1,2}\s+[A-Z][a-z]+\.?\s+\d{4}))/i;

  /** Phone cell -> { local/direct text, mobiles[] }. Mobile = 10-11 digits starting 9 / 09. */
  function phones(raw) {
    var s = typeof raw === 'number' ? (String(raw).length === 10 && /^9/.test(String(raw)) ? '0' + raw : String(raw)) : str(raw);
    var mobiles = [];
    var rest = s.replace(/(?:\+?63|0)?(9\d{2})[\s\-]?(\d{3})[\s\-]?(\d{4})(?!\d)/g, function (m, a, b, c) { mobiles.push('0' + a + ' ' + b + ' ' + c); return ' '; });
    rest = rest.split(/\n/).map(function (x) { return x.trim(); }).filter(Boolean).join(' / ').replace(/^[\s\/]+|[\s\/]+$/g, '');
    return { text: rest, mobiles: mobiles };
  }
  var OFFICE_WORDS = /\b(fax|room|conference|helpline|helpdesk|hotline|service|services|mailing|maintenance|clinic|guard|operator|canteen|local|unit|team|department|dept|collection|branch|line|office|desk|vacant)\b/i;
  function kindOf(name) {
    if (/^vacant\b/i.test(name) || /\(vacant\)/i.test(name)) return 'vacant';
    if (name.indexOf(',') > 0 && !OFFICE_WORDS.test(name.split(',')[0])) return 'person';
    return 'line';
  }

  /* ---------- Phone Directory parser (pure) ---------- */
  function headerRow(grid, test) {
    for (var r = 0; r < Math.min(grid.length, 30); r++) if (test(grid[r].map(function (c) { return fold(str(c)); }))) return r;
    return -1;
  }

  function parseBlocks(loc, grid, out) {
    var hr = headerRow(grid, function (row) { return row.some(function (c, i) { return c === 'name' && row[i + 1] === 'local'; }); });
    var head = grid[hr].map(function (c) { return fold(str(c)); });
    var starts = [];
    head.forEach(function (c, i) { if (c === 'name' && head[i + 1] === 'local') starts.push(i); });
    // Lines above the header: title, as-of, trunk/fax lines.
    for (var r0 = 0; r0 < hr; r0++) {
      var t = grid[r0].map(str).filter(Boolean).join('  ');
      t = t.replace(/^.*?telephone directory\s*/i, '').replace(/\s*As of [^ ]+ \d{1,2},? \d{4}/i, '').trim();
      if (t && !/^sterling bank of asia inc/i.test(t) && /\d/.test(t)) out.info.push({ loc: loc, text: t.replace(/\s{2,}/g, ' · ').replace(/\s*:\s*·\s*/g, ': ') });
    }
    starts.forEach(function (c) {
      var dept = '', unit = '', last = null;
      for (var r = hr + 1; r < grid.length; r++) {
        var row = grid[r] || [], n = str(row[c]), l = row[c + 1], d = row[c + 2], ls = str(l), ds = str(d);
        if (!n && !ls && !ds) continue;
        if (!n) {                                               // continuation of the row above
          if (!last) {
            if (dept || unit) out.groupNotes.push({ loc: loc, group: groupName(dept, unit), text: 'Also ' + [ls, ds].filter(Boolean).join(' / ') });
            else out.skipped.push({ loc: loc, row: r + 1, text: [ls, ds].filter(Boolean).join(' ') });
            continue;
          }
          addNumbers(last, l, d);
          continue;
        }
        if (!ls && (!ds || /^\*/.test(ds))) {                   // heading (optionally with a hunt line like *4008)
          var m = n.match(/^([\s\S]*?)\s*(telephone numbers?[\s\S]*)$/i), name = oneLine(m ? m[1] : n), extra = m ? oneLine(m[2]) : '';
          if (!letters(name)) { var tx = [name, extra].filter(Boolean).join(' '); if (tx && (unit || dept)) out.groupNotes.push({ loc: loc, group: groupName(dept, unit), text: tx }); continue; }
          name = name.replace(/:$/, '');
          if (isCaps(name) && letters(name) >= 5) { dept = name; unit = ''; } else unit = name;
          if (ds || extra) out.groupNotes.push({ loc: loc, group: groupName(dept, unit), text: [ds ? 'Group line ' + ds : '', extra].filter(Boolean).join(' · ') });
          last = null;
          continue;
        }
        var e = { name: oneLine(n), kind: kindOf(n), local: '', direct: '', mobile: [], note: [], dept: groupName(dept, unit), loc: loc };
        addNumbers(e, l, d);
        out.people.push(e); last = e;
      }
    });
    function groupName(a, b) { return [a, b].filter(Boolean).join(' › '); }
  }
  function addNumbers(e, l, d) {
    [[l, 'local'], [d, 'direct']].forEach(function (p) {
      var s = str(p[0]);
      if (!s) return;
      if (!/\d/.test(s)) { e.note.push(oneLine(s)); return; }
      var ph = phones(p[0]);
      e.mobile = e.mobile.concat(ph.mobiles);
      if (ph.text) e[p[1]] = e[p[1]] ? e[p[1]] + ' / ' + ph.text : ph.text;
    });
  }

  function parseBranches(loc, grid, out) {
    var width = Math.max.apply(null, grid.map(function (r) { return r.length; }));
    var codeRe = /\n\s*(\d{3})\s*$/;
    for (var c = 0; c < width; c++) {
      var cur = null;
      for (var r = 0; r < grid.length; r++) {
        var row = grid[r] || [], n = str(row[c]), lab = str(row[c + 1]), num = row[c + 2];
        if (n && codeRe.test(String(row[c]))) {
          cur = { name: oneLine(String(row[c]).replace(codeRe, '')), code: String(row[c]).match(codeRe)[1], lines: [], loc: loc };
          out.branches.push(cur);
        } else if (n) { cur = null; continue; }
        if (cur && lab && /[a-z]/i.test(lab)) {
          var ph = phones(num), val = [ph.text].concat(ph.mobiles).filter(Boolean).join(' / ');
          cur.lines.push({ label: lab, number: val });
        }
      }
    }
  }

  function parseMobiles(loc, grid, out) {
    var hr = headerRow(grid, function (row) { return row.indexOf('name') >= 0 && row.some(function (c) { return /mobile/.test(c); }); });
    var head = grid[hr].map(function (c) { return fold(str(c)); });
    var ni = head.indexOf('name'), di = head.findIndex(function (c) { return /department|unit/.test(c); }), mi = head.findIndex(function (c) { return /mobile/.test(c); });
    for (var r = hr + 1; r < grid.length; r++) {
      var row = grid[r] || [], n = str(row[ni]);
      if (!n) continue;
      var ph = phones(row[mi]);
      out.mobiles.push({ name: n, dept: str(row[di]), mobile: ph.mobiles.length ? ph.mobiles : (ph.text ? [ph.text] : []) });
    }
  }

  function personKey(name) {
    var p = fold(name).replace(/^\(.*?\)\s*|^atty\.?\s*/g, '').split(',');
    if (p.length < 2) return '';
    return p[0].replace(/[^a-z]/g, '') + '|' + (p[1].trim().split(/[\s.]/)[0] || '').replace(/[^a-z]/g, '');
  }

  /** book: { sheetNames, grids:{name:cells[][]} } (from Portal.parse.excel) -> directory object. */
  K.parseDirectory = function (book, fileName) {
    var out = { fileName: fileName || '', asOf: '', people: [], branches: [], info: [], groupNotes: [], mobiles: [], skipped: [], sheets: [] };
    (book.sheetNames || []).forEach(function (name) {
      var grid = (book.grids || {})[name] || [];
      if (!out.asOf) grid.slice(0, 6).some(function (row) { return row.some(function (c) { var m = str(c).match(AS_OF); if (m) out.asOf = m[1]; return !!m; }); });
      var flat = grid.slice(0, 30).map(function (row) { return row.map(function (c) { return fold(str(c)); }); });
      var type = flat.some(function (row) { return row.indexOf('name') >= 0 && row.some(function (c) { return /mobile/.test(c); }); }) ? 'mobile'
        : flat.some(function (row) { return row.some(function (c, i) { return c === 'name' && row[i + 1] === 'local'; }); }) ? 'blocks'
        : grid.reduce(function (n, row) { return n + row.filter(function (c) { return /\n\s*\d{3}\s*$/.test(String(c || '')); }).length; }, 0) >= 3 ? 'branches' : '';
      out.sheets.push({ name: name, type: type || 'not recognised' });
      if (type === 'blocks') parseBlocks(name, grid, out);
      else if (type === 'branches') parseBranches(name, grid, out);
      else if (type === 'mobile') parseMobiles(name, grid, out);
    });
    // Attach mobile numbers to the matching person; list the rest on their own.
    var byKey = {};
    out.people.forEach(function (p) { if (p.kind === 'person') { var k = personKey(p.name); if (k) (byKey[k] = byKey[k] || []).push(p); } });
    var mobLoc = (out.sheets.filter(function (s) { return s.type === 'mobile'; })[0] || {}).name || 'Mobile';
    out.mobiles.forEach(function (m) {
      var hit = byKey[personKey(m.name)];
      if (hit && hit.length === 1) { hit[0].mobile = hit[0].mobile.concat(m.mobile.filter(function (x) { return hit[0].mobile.indexOf(x) < 0; })); hit[0].mobileDept = m.dept; }
      else out.people.push({ name: titleCase(m.name).replace(/\s+,/, ','), kind: 'person', local: '', direct: '', mobile: m.mobile, note: [], dept: m.dept, loc: mobLoc });
    });
    out.people.forEach(function (p) { p.note = p.note.join(' · '); });
    out.synthetic = (book.sheetNames || []).some(function (n) { return ((book.grids || {})[n] || []).slice(0, 6).some(function (row) { return row.some(function (c) { return /synthetic test/i.test(str(c)); }); }); });
    out.counts = {
      people: out.people.filter(function (p) { return p.kind === 'person'; }).length,
      lines: out.people.filter(function (p) { return p.kind === 'line'; }).length,
      vacant: out.people.filter(function (p) { return p.kind === 'vacant'; }).length,
      branches: out.branches.length, mobiles: out.mobiles.length
    };
    delete out.mobiles;
    return out;
  };

  /* ---------- Code of Conduct parser (pure) ---------- */
  var RE_ART = /^ARTICLE\s+([IVXL]+)\b\.?\s*[:\-–]?\s*(.*)$/, RE_CH = /^CHAPTER\s+([A-Z])\b\.?\s*[:\-–]?\s*(.*)$/, RE_SEC = /^SECTION\s+(\d+)\s*[.:\-–]\s*(.*)$/;
  var RE_TOP = /^(INTRODUCTION|PREAMBLE|DEFINITIONS?(?: OF (?:BASIC )?TERMS)?|GLOSSARY)$/;
  var RE_ITEM = /^(?:[A-Z]|[a-z]|\d{1,2}|[ivx]{1,4})[.)]\s|^\((?:[a-z]|\d{1,2}|[ivx]{1,4})\)\s|^[•\-–]\s/;

  /** pages: [string] (from Portal.parse.pdf) -> { title, edition, nodes:[{id,level,num,title,page,paras:[{t,h}]}] } */
  K.parseCode = function (pages, fileName) {
    var lines = pages.map(function (p) { return p.split('\n').map(function (l) { return l.replace(/\s+/g, ' ').trim(); }).filter(Boolean); });
    // Running header/footer: a line that starts or ends most pages.
    var freq = {};
    lines.forEach(function (ls) { [ls[0], ls[ls.length - 1]].forEach(function (l) { if (l) freq[l] = (freq[l] || 0) + 1; }); });
    var running = Object.keys(freq).filter(function (l) { return freq[l] >= Math.max(3, pages.length * 0.5); });
    var all = lines.join('\n');
    var out = { fileName: fileName || '', title: '', edition: '', running: running[0] || '', pages: pages.length, nodes: [] };
    var cover = (lines[0] || []).join(' ');
    var em = cover.match(/((?:revised|effective|updated|amended)[^.]*?\d{4})/i) || all.match(/((?:revised|effective) as of [^\n]*?\d{4})/i);
    out.edition = em ? em[1] : '';
    var coverLines = []; (lines[0] || []).some(function (l) { if (/\d{4}|revised|effective|synthetic/i.test(l)) return true; coverLines.push(l); });
    out.synthetic = /synthetic test/i.test(all);
    out.title = titleCase(coverLines.filter(function (l) { return !/\d{4}/.test(l) && !/^(sterling bank of asia)$/i.test(l) && running.indexOf(l) < 0; }).join(' ')).replace(/\b(And|Of)\b/g, function (w) { return w.toLowerCase(); }) || 'Code of Conduct';
    // Body starts at the first page with prose (cover and table of contents have only short lines).
    var start = lines.findIndex(function (ls, i) { return i > 0 && ls.some(function (l) { return l.length >= 70; }) && !ls.some(function (l) { return /table of contents/i.test(l); }); });
    if (start < 0) start = 0;
    var typical = (function () {
      var lens = []; lines.slice(start).forEach(function (ls) { ls.forEach(function (l) { lens.push(l.length); }); });
      lens.sort(function (a, b) { return a - b; }); return lens[Math.floor(lens.length * 0.9)] || 80;
    })();
    var node = null, art = null, ch = null, para = null, pendingTitle = null;
    function add(level, num, title, page) {
      node = { id: 'n' + out.nodes.length, level: level, num: num, title: title, page: page, paras: [], art: art ? art.id : '', ch: ch ? ch.id : '' };
      out.nodes.push(node); para = null; return node;
    }
    for (var pi = start; pi < lines.length; pi++) {
      var ls = lines[pi].filter(function (l) { return running.indexOf(l) < 0 && !/^(page\s*)?\d{1,3}(\s*of\s*\d+)?$/i.test(l); });
      for (var li = 0; li < ls.length; li++) {
        var l = ls[li], m;
        if (pendingTitle && isCaps(l) && l.length < typical && !RE_SEC.test(l) && !RE_CH.test(l) && !RE_ART.test(l)) {
          pendingTitle.title = (pendingTitle.title ? pendingTitle.title + ' ' : '') + l; continue;
        }
        pendingTitle = null;
        if ((m = l.match(RE_ART))) { ch = null; art = add(1, 'Article ' + m[1], m[2], pi + 1); art.art = art.id; pendingTitle = art; continue; }
        if ((m = l.match(RE_CH))) { ch = add(2, 'Chapter ' + m[1], m[2], pi + 1); ch.ch = ch.id; pendingTitle = ch; continue; }
        if ((m = l.match(RE_SEC))) { add(3, 'Section ' + m[1], m[2], pi + 1); continue; }
        if (RE_TOP.test(l)) { art = null; ch = null; add(1, '', l, pi + 1); continue; }
        if (!node) add(1, '', 'Introduction', pi + 1);
        var heading = isCaps(l) && l.length < 60 && letters(l) >= 4 && !RE_ITEM.test(l);
        if (heading) { node.paras.push({ t: l, h: true }); para = null; continue; }
        if (!para || RE_ITEM.test(l)) { para = { t: l }; node.paras.push(para); }
        else para.t += (/-$/.test(para.t) && !/ -$/.test(para.t) ? '' : ' ') + l;
        if (l.length < typical * 0.75 && /[.:;”"]$/.test(l)) para = null;   // short line ending a sentence closes the paragraph
      }
    }
    out.nodes.forEach(function (n) { n.title = titleCase(n.title || '').replace(/\bDevcom\b/g, 'DEVCom').replace(/\b(And|Of|On|The|In|To|For|Or|As|A|An|Is|With|Without)\b/g, function (w, x, i) { return i ? w.toLowerCase() : w; }); });
    return out;
  };

  /* ---------- local storage (this PC only) ---------- */
  var DB = 'sba-portal-reference', STORE = 'kv';
  function idb() {
    return new Promise(function (resolve, reject) {
      if (!root.indexedDB) return reject(new Error('no indexedDB'));
      var req = indexedDB.open(DB, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function idbDo(mode, fn) {
    return idb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, mode), req = fn(tx.objectStore(STORE));
        tx.oncomplete = function () { db.close(); resolve(req && req.result); };
        tx.onerror = function () { db.close(); reject(tx.error); };
      });
    });
  }
  K.store = {
    get: function (k) { return idbDo('readonly', function (s) { return s.get(k); }).catch(function () { return null; }); },
    set: function (k, v) { return idbDo('readwrite', function (s) { return s.put(v, k); }).then(function () { return true; }, function () { return false; }); },
    del: function (k) { return idbDo('readwrite', function (s) { return s.delete(k); }).catch(function () {}); }
  };

  /* ---------- page ---------- */
  var esc, icon, state = { tab: 'directory', q: '', loc: '', dept: '', vacant: false, dir: null, code: null, saved: { directory: true, code: true }, hit: 0 };
  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }
  function terms(q) { return fold(q).split(/[\s,]+/).filter(Boolean); }
  function matchAll(hay, ts) { hay = fold(hay); return ts.every(function (t) { return hay.indexOf(t) >= 0; }); }
  /** Highlight query terms inside already-plain text (accent-insensitive). */
  function mark(text, ts) {
    text = String(text || '');
    if (!ts.length) return esc(text);
    var f = text.normalize('NFD'), map = [], plain = '';
    for (var i = 0; i < f.length; i++) { if (!/[̀-ͯ]/.test(f[i])) { map.push(i); plain += f[i].toLowerCase(); } }
    var on = new Array(plain.length + 1).join('0').split('');
    ts.forEach(function (t) { var at = 0; while ((at = plain.indexOf(t, at)) >= 0) { for (var k = at; k < at + t.length; k++) on[k] = '1'; at += t.length; } });
    var html = '', open = false;
    for (var j = 0; j < plain.length; j++) {
      var chunk = f.slice(map[j], j + 1 < map.length ? map[j + 1] : f.length).normalize('NFC');
      if (on[j] === '1' && !open) { html += '<mark>'; open = true; }
      if (on[j] !== '1' && open) { html += '</mark>'; open = false; }
      html += esc(chunk);
    }
    return html + (open ? '</mark>' : '');
  }
  function toast(msg) {
    var t = $('#k-toast');
    if (!t) { t = document.createElement('div'); t.id = 'k-toast'; t.className = 'k-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove('show'); }, 1800);
  }
  function copy(text) {
    var ok = function () { toast('Copied ' + text); };
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(ok, legacy);
    legacy();
    function legacy() { var t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); ok(); } catch (e) { /* ignore */ } t.remove(); }
  }

  function loader(kind) {
    var d = kind === 'directory' ? state.dir : state.code, label = kind === 'directory' ? 'phone directory Excel (.xls or .xlsx)' : 'Code of Conduct PDF';
    var accept = kind === 'directory' ? '.xls,.xlsx,.xlsm' : '.pdf';
    if (!d) return '<div class="card k-empty dropzone" data-drop="' + kind + '">' + icon(kind === 'directory' ? 'chat' : 'book') +
      '<h2>Load the ' + label + '</h2><p class="muted">Choose the file or drag it here. It is read on this computer and remembered in this browser only. It is never uploaded.</p>' +
      '<label class="btn primary">' + icon('folder') + 'Choose file<input type="file" accept="' + accept + '" data-load="' + kind + '" hidden></label>' +
      '<p class="k-small">Just trying it out? Use the practice file in <code>samples/employee-info/</code>.</p></div>';
    var when = d.loadedAt ? new Date(d.loadedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    return '<div class="k-status" data-drop="' + kind + '">' + icon('check') + '<span>' + (d.synthetic ? '<span class="pill pill-on-hold">Practice file (synthetic)</span> ' : '') + '<b>' + esc(d.fileName) + '</b>' +
      (kind === 'directory' && d.asOf ? ' · as of ' + esc(d.asOf) : '') + (kind === 'code' && d.edition ? ' · ' + esc(d.edition) : '') +
      ' · loaded ' + esc(when) + ' · ' + (state.saved[kind] ? 'saved on this PC only' : '<b class="k-warn">not saved (browser storage is blocked), load it again next time</b>') + '</span>' +
      '<label class="btn">Replace with newer file<input type="file" accept="' + accept + '" data-load="' + kind + '" hidden></label>' +
      '<button class="btn" type="button" data-remove="' + kind + '">Remove from this PC</button></div>';
  }

  /* --- directory view --- */
  function dirResults() {
    var d = state.dir, ts = terms(state.q);
    var list = d.people.filter(function (p) {
      if (!state.vacant && p.kind === 'vacant') return false;
      if (state.loc && p.loc !== state.loc) return false;
      if (state.dept && p.dept !== state.dept) return false;
      return !ts.length || matchAll([p.name, p.dept, p.loc, p.local, p.direct, p.mobile.join(' '), p.mobile.join(' ').replace(/\s/g, ''), p.note, p.mobileDept].join(' '), ts);
    });
    var br = d.branches.filter(function (b) {
      if (state.loc && b.loc !== state.loc) return false;
      if (state.dept) return false;
      return !ts.length ? !!state.loc : matchAll([b.name, b.code, b.lines.map(function (l) { return l.label + ' ' + l.number + ' ' + l.number.replace(/\D/g, ''); }).join(' ')].join(' '), ts);
    });
    if (ts.length) {
      var first = ts[0];
      list.sort(function (a, b) { return score(b) - score(a) || a.name.localeCompare(b.name); });
    }
    function score(p) { var n = fold(p.name); return (n.indexOf(first) === 0 ? 4 : 0) + (n.indexOf(first) >= 0 ? 2 : 0) + (p.kind === 'person' ? 1 : 0); }
    return { people: list, branches: br };
  }
  function numBtn(label, val) {
    return val ? '<button type="button" class="k-num" data-copy="' + esc(val) + '" title="Click to copy"><small>' + label + '</small>' + mark(val, terms(state.q)) + '</button>' : '';
  }
  function personCard(p) {
    var ts = terms(state.q);
    return '<article class="k-person k-' + p.kind + '"><div class="k-person-head"><span class="k-avatar" aria-hidden="true">' + (p.kind === 'person' ? esc(initials(p.name)) : icon(p.kind === 'vacant' ? 'clock' : 'chat')) + '</span>' +
      '<div><h3>' + mark(p.name, ts) + (p.kind === 'vacant' ? ' <span class="pill">Vacant</span>' : '') + '</h3><p>' + mark(p.dept || '—', ts) + ' · ' + esc(p.loc) + '</p></div></div>' +
      '<div class="k-nums">' + numBtn('Local', p.local) + numBtn('Direct', p.direct) + p.mobile.map(function (m) { return numBtn('Mobile', m); }).join('') + '</div>' +
      (p.note ? '<p class="k-note">' + mark(p.note, ts) + '</p>' : '') + '</article>';
  }
  function initials(n) { var p = n.replace(/^\(.*?\)\s*|^atty\.?\s*/i, '').split(','); var a = (p[1] || '').trim()[0] || '', b = (p[0] || '').trim()[0] || ''; return (a + b).toUpperCase(); }
  function branchCard(b) {
    var ts = terms(state.q);
    return '<article class="k-branch"><h3>' + icon('bank') + mark(b.name, ts) + ' <span class="pill">' + mark(b.code, ts) + '</span></h3><dl>' +
      b.lines.map(function (l) { return '<dt>' + esc(l.label) + '</dt><dd>' + (l.number ? '<button type="button" class="k-num plain" data-copy="' + esc(l.number) + '">' + mark(l.number, ts) + '</button>' : '<span class="muted">—</span>') + '</dd>'; }).join('') + '</dl></article>';
  }
  function infoByLoc(info) {
    var o = [], at = {};
    info.forEach(function (i) { if (!(i.loc in at)) { at[i.loc] = o.length; o.push([i.loc, i.text]); } else o[at[i.loc]][1] += ' · ' + i.text; });
    return o;
  }
  function renderDirectory() {
    var box = $('#k-directory'), d = state.dir;
    if (!d) { box.innerHTML = loader('directory'); return; }
    var locs = [];
    d.people.concat(d.branches).forEach(function (p) { if (locs.indexOf(p.loc) < 0) locs.push(p.loc); });
    var depts = [];
    d.people.forEach(function (p) { if ((!state.loc || p.loc === state.loc) && p.dept && depts.indexOf(p.dept) < 0) depts.push(p.dept); });
    depts.sort();
    if (state.dept && depts.indexOf(state.dept) < 0) state.dept = '';
    var res = dirResults(), browsing = !state.q && !state.dept;
    var info = d.info.filter(function (i) { return !state.loc || i.loc === state.loc; });
    var notes = d.groupNotes.filter(function (n) { return state.dept && n.group === state.dept && (!state.loc || n.loc === state.loc); });
    var html = loader('directory') +
      '<div class="k-filters"><div class="chips" role="group" aria-label="Location"><button type="button" class="chip' + (!state.loc ? ' on' : '') + '" data-loc="">All locations</button>' +
      locs.map(function (l) { return '<button type="button" class="chip' + (state.loc === l ? ' on' : '') + '" data-loc="' + esc(l) + '">' + esc(l) + '</button>'; }).join('') + '</div>' +
      '<div class="k-filter-row"><label>Department <select id="k-dept"><option value="">All departments</option>' + depts.map(function (x) { return '<option' + (x === state.dept ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select></label>' +
      '<label class="k-check"><input type="checkbox" id="k-vacant"' + (state.vacant ? ' checked' : '') + '> Show vacant lines</label>' +
      '<span class="k-count">' + d.counts.people + ' people · ' + d.counts.branches + ' branches</span></div></div>' +
      (info.length && (state.loc || browsing) ? '<div class="k-info">' + infoByLoc(info).map(function (i) { return '<span><b>' + esc(i[0]) + ':</b> ' + esc(i[1]) + '</span>'; }).join('') + '</div>' : '') +
      (notes.length ? '<div class="k-info">' + notes.map(function (n) { return '<span>' + esc(n.text) + '</span>'; }).join('') + '</div>' : '');
    if (browsing && !state.loc) {
      var groups = {};
      res.people.forEach(function (p) { var g = p.loc + ' — ' + (p.dept || 'General'); (groups[g] = groups[g] || []).push(p); });
      html += '<p class="k-hint">Type a name, department, branch or number in the search box above, or open a department below.</p><div class="k-groups">' +
        Object.keys(groups).map(function (g) { return '<details class="k-group"><summary>' + esc(g) + ' <span class="tab-n">' + groups[g].length + '</span></summary><div class="k-grid">' + groups[g].map(personCard).join('') + '</div></details>'; }).join('') +
        (d.branches.length ? '<details class="k-group"><summary>Branches <span class="tab-n">' + d.branches.length + '</span></summary><div class="k-grid">' + d.branches.map(branchCard).join('') + '</div></details>' : '') + '</div>';
    } else {
      var shown = res.people.slice(0, 120);
      html += (res.branches.length ? '<h3 class="k-sub">Branches (' + res.branches.length + ')</h3><div class="k-grid">' + res.branches.map(branchCard).join('') + '</div>' : '') +
        (res.people.length ? '<h3 class="k-sub">People and lines (' + res.people.length + ')</h3><div class="k-grid">' + shown.map(personCard).join('') + '</div>' +
          (res.people.length > shown.length ? '<p class="k-hint">Showing the first ' + shown.length + '. Type more of the name to narrow it down.</p>' : '') : '') +
        (!res.people.length && !res.branches.length ? '<div class="k-none">No match for “' + esc(state.q) + '”. Check the spelling, try only the surname, or clear the filters.</div>' : '');
    }
    if (d.skipped.length) html += '<details class="k-skipped"><summary>' + d.skipped.length + ' row(s) in the file could not be placed</summary><ul>' + d.skipped.map(function (s) { return '<li>' + esc(s.loc) + ', row ' + s.row + ': ' + esc(s.text) + '</li>'; }).join('') + '</ul></details>';
    box.innerHTML = html;
  }

  /* --- code of conduct view --- */
  function codeHits(ts) {
    var hits = {};
    if (!ts.length) return hits;
    state.code.nodes.forEach(function (n) {
      var text = [n.num, n.title].concat(n.paras.map(function (p) { return p.t; })).join(' '), f = fold(text), c = 0;
      ts.forEach(function (t) { var at = 0; while ((at = f.indexOf(t, at)) >= 0) { c++; at += t.length; } });
      if (c && matchAll(text, ts)) hits[n.id] = c;
    });
    return hits;
  }
  function quickJumps(c) {
    var want = [['Grave infractions', /^grave infractions/i], ['Less grave infractions', /^less grave/i], ['Light infractions', /^light infractions/i], ['Kinds of sanctions', /kinds of sanctions/i], ['Definitions', /^definition/i]];
    return want.map(function (w) { var n = c.nodes.filter(function (x) { return w[1].test(x.title); })[0]; return n ? '<button type="button" class="chip" data-jump="' + n.id + '"' + (/infractions/i.test(w[0]) ? ' data-find="' + esc(w[0].toLowerCase()) + '"' : '') + '>' + esc(w[0]) + '</button>' : ''; }).join('');
  }
  function renderCode() {
    var box = $('#k-code'), c = state.code;
    if (!c) { box.innerHTML = loader('code'); return; }
    var ts = terms(state.q), hits = codeHits(ts), total = Object.keys(hits).reduce(function (s, k) { return s + hits[k]; }, 0);
    var toc = c.nodes.map(function (n) {
      return '<a href="#' + n.id + '" data-jump="' + n.id + '" class="lv' + n.level + (ts.length && !hits[n.id] ? ' dim' : '') + '">' + (n.num ? '<b>' + esc(n.num) + '</b> ' : '') + esc(n.title) + (hits[n.id] ? ' <span class="tab-n">' + hits[n.id] + '</span>' : '') + '</a>';
    }).join('');
    var body = c.nodes.map(function (n) {
      var H = n.level === 1 ? 'h2' : n.level === 2 ? 'h3' : 'h4';
      return '<section class="k-sec lv' + n.level + '" id="' + n.id + '"><' + H + '>' + (n.num ? '<span class="k-num-lbl">' + mark(n.num, ts) + '</span> ' : '') + mark(n.title, ts) + ' <small class="k-page">p. ' + n.page + '</small></' + H + '>' +
        n.paras.map(function (p) { return p.h ? '<p class="k-h">' + mark(p.t, ts) + '</p>' : '<p' + (RE_ITEM.test(p.t) ? ' class="k-item"' : '') + '>' + mark(p.t, ts) + '</p>'; }).join('') + '</section>';
    }).join('');
    box.innerHTML = loader('code') +
      '<div class="k-code-bar"><div class="chips">' + quickJumps(c) + '</div>' +
      (ts.length ? '<div class="k-hitnav"><span id="k-hitcount">' + (total ? '<b>' + total + '</b> match' + (total === 1 ? '' : 'es') + ' in ' + Object.keys(hits).length + ' section(s)' : 'No match for “' + esc(state.q) + '”') + '</span>' +
        (total ? '<button type="button" class="btn" data-hit="-1" aria-label="Previous match">‹ Prev</button><button type="button" class="btn" data-hit="1" aria-label="Next match">Next ›</button>' : '') + '</div>' : '') + '</div>' +
      '<p class="k-small">Reading aid only. The official version is the PDF issued by HR' + (c.edition ? ' (' + esc(c.edition) + ')' : '') + '; page numbers refer to it.</p>' +
      '<div class="k-reader"><nav class="k-toc" aria-label="Contents"><p>Contents</p>' + toc + '</nav><div class="k-text">' + body + '</div></div>';
    state.hit = -1;
  }
  function stepHit(dir) {
    var marks = $$('#k-code .k-text mark');
    if (!marks.length) return;
    $$('#k-code mark.cur').forEach(function (m) { m.classList.remove('cur'); });
    state.hit = (state.hit + dir + marks.length) % marks.length;
    var m = marks[state.hit]; m.classList.add('cur'); m.scrollIntoView({ block: 'center', behavior: 'smooth' });
    var c = $('#k-hitcount'); if (c) c.innerHTML = 'Match <b>' + (state.hit + 1) + '</b> of ' + marks.length;
  }

  /* --- tabs / counts --- */
  function renderTabs() {
    var ts = terms(state.q), dc = '', cc = '';
    if (ts.length && state.dir) { var r = dirResults(); dc = r.people.length + r.branches.length; }
    if (ts.length && state.code) { var h = codeHits(ts); cc = Object.keys(h).length; }
    $$('#k-tabs a').forEach(function (a) {
      var t = a.getAttribute('data-tab'), n = t === 'directory' ? dc : t === 'code' ? cc : '';
      a.classList.toggle('active', t === state.tab); a.setAttribute('aria-current', t === state.tab ? 'true' : 'false');
      var b = $('.tab-n', a); if (b) { b.textContent = n; b.hidden = n === ''; }
    });
    $$('.k-panel').forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== state.tab; });
  }
  function render() { renderTabs(); if (state.tab === 'directory') renderDirectory(); if (state.tab === 'code') renderCode(); }

  /* --- loading files --- */
  function load(kind, file) {
    if (!file) return;
    var box = $(kind === 'directory' ? '#k-directory' : '#k-code');
    box.insertAdjacentHTML('afterbegin', '<p class="k-busy">Reading ' + esc(file.name) + '…</p>');
    var job = kind === 'directory'
      ? (/\.(xlsx?|xlsm)$/i.test(file.name) ? P.parse.excel(file).then(function (b) { return K.parseDirectory(b, file.name); }) : Promise.reject(new Error('Please choose the phone directory Excel file (.xls or .xlsx).')))
      : (/\.pdf$/i.test(file.name) ? P.parse.pdf(file).then(function (r) { return K.parseCode(r.pages, file.name); }) : Promise.reject(new Error('Please choose the Code of Conduct PDF.')));
    job.then(function (data) {
      if (kind === 'directory' && !data.people.length && !data.branches.length) throw new Error('No names or numbers were found in this file. Is it the phone directory?');
      if (kind === 'code' && data.nodes.length < 3) throw new Error('No Articles or Sections were found in this PDF. Is it the Code of Conduct (a text PDF, not a scan)?');
      data.loadedAt = Date.now();
      if (kind === 'directory') state.dir = data; else state.code = data;
      return K.store.set(kind, data).then(function (ok) { state.saved[kind] = ok; render(); toast('Loaded ' + file.name); });
    }).catch(function (e) {
      var b = $('.k-busy', box); if (b) b.remove();
      box.insertAdjacentHTML('afterbegin', '<div class="errors" role="alert"><b>Could not read that file.</b> ' + esc(e.message || e) + '</div>');
    });
  }

  K.init = function () {
    esc = P.ui.esc; icon = P.ui.icon;
    var main = $('#k-app'), q = $('#k-q');
    function fromHash() {
      var m = location.hash.match(/(?:^#|&)q=([^&]*)/); if (m) { state.q = decodeURIComponent(m[1]); q.value = state.q; }
      if (/^#code\b/.test(location.hash)) state.tab = 'code';
    }
    fromHash();
    root.addEventListener('hashchange', function () { fromHash(); render(); });
    var t;
    q.addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { state.q = q.value; render(); }, 120); });
    q.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { q.value = ''; state.q = ''; render(); }
      if (e.key === 'Enter' && state.tab === 'code') { e.preventDefault(); stepHit(e.shiftKey ? -1 : 1); }
    });
    main.addEventListener('click', function (e) {
      var a = e.target.closest('[data-tab]'); if (a) { e.preventDefault(); state.tab = a.getAttribute('data-tab'); render(); return; }
      var c = e.target.closest('[data-copy]'); if (c) { copy(c.getAttribute('data-copy')); return; }
      var l = e.target.closest('[data-loc]'); if (l) { state.loc = l.getAttribute('data-loc'); state.dept = ''; renderDirectory(); return; }
      var r = e.target.closest('[data-remove]');
      if (r) {
        var k = r.getAttribute('data-remove');
        if (!confirm('Remove the ' + (k === 'directory' ? 'phone directory' : 'Code of Conduct') + ' from this PC? You can load the file again any time.')) return;
        K.store.del(k).then(function () { if (k === 'directory') state.dir = null; else state.code = null; render(); });
        return;
      }
      var j = e.target.closest('[data-jump]');
      if (j) { e.preventDefault(); var s = document.getElementById(j.getAttribute('data-jump')); if (s) s.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      var h = e.target.closest('[data-hit]'); if (h) { stepHit(+h.getAttribute('data-hit')); return; }
    });
    main.addEventListener('change', function (e) {
      if (e.target.matches('[data-load]')) { load(e.target.getAttribute('data-load'), e.target.files[0]); e.target.value = ''; }
      if (e.target.id === 'k-dept') { state.dept = e.target.value; renderDirectory(); }
      if (e.target.id === 'k-vacant') { state.vacant = e.target.checked; renderDirectory(); }
    });
    ['dragover', 'dragleave', 'drop'].forEach(function (ev) {
      main.addEventListener(ev, function (e) {
        var z = e.target.closest('[data-drop]'); if (!z) return;
        e.preventDefault();
        z.classList.toggle('over', ev === 'dragover');
        if (ev === 'drop' && e.dataTransfer.files[0]) load(z.getAttribute('data-drop'), e.dataTransfer.files[0]);
      });
    });
    Promise.all([K.store.get('directory'), K.store.get('code')]).then(function (v) { state.dir = v[0] || null; state.code = v[1] || null; render(); });
    render();
  };
})(typeof window !== 'undefined' ? window : globalThis);
