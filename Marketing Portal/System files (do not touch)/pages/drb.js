/* pages/drb.js — the DRB Usage page of the one-page app (was drb-usage.html).
   Runs once, the first time the page is opened; `page` is its container in Marketing Portal.html. */
(function (root) {
  (root.Portal = root.Portal || {}).pages = root.Portal.pages || {};
  root.Portal.pages['drb'] = function (page) {
  'use strict';
  var P = window.Portal, D = window.DRB, F = P.files, $ = function (id) { return document.getElementById(id); };
  var esc = P.ui.esc, fmtN = function (v) { return typeof v === 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : (v === null || v === undefined ? '' : esc(String(v))); };
  var pct = function (v, d) { return typeof v === 'number' ? (v * 100).toFixed(d == null ? 1 : d) + '%' : (v == null ? '' : esc(String(v))); };
  var SOURCES = [
    { k: 'raw', label: 'DRB Usage export', who: 'Ms. Hong', need: true },
    { k: 'drb_summary', label: 'DRB Reports (quarter-end month)', who: 'Sir Jun', need: true },
    { k: 'itcom_dcb', label: 'ITCom DCB Reports (quarter-end month)', who: 'Sir Jun', need: true },
    { k: 'idle', label: 'RIB Idle Accounts Report', who: 'Automailer', need: true },
    { k: 'rib', label: 'RIB Usage (cross-check)', who: 'RIB Inbox shared drive', need: false },
    { k: 'dcb_stats', label: 'DRB DCB Stats (cross-check)', who: 'Sir Jun', need: false }
  ];
  var SENDERS = ['Ms. Hong', 'Sir Jun', 'Automailer', 'RIB Inbox shared drive'];
  var PRIOR_LABELS = { total_cif: 'Total CIFs', enrolled: 'Total enrolled CIFs', cif_usage: 'CIF w/ usage (CIF Profile)', fin: 'Have financial transactions', cif_any: "Have any online activity (Sir RD's count, optional)",
    login: 'Have logged in to their accounts', inactive: 'Inactive (not logged in for > 90 days)', female: 'Have financial transactions – female', male: 'Have financial transactions – male', txn_total: 'Successful financial transactions', ftob: 'Fund transfers to other banks (DRB)',
    ip_nonqr: '…of which InstaPay, regular (non-QR)', card: 'Transactions from cards', qr_ob: D.QRG[0], qr_p2m: D.QRG[1], qr_3p: D.QRG[2], qr_own: D.QRG[3], qr_p2b: D.QRG[4], qr_micro: D.QRG[5] };
  var PRIOR_NEED = ['total_cif', 'enrolled', 'cif_usage', 'fin', 'login', 'inactive', 'female', 'male'];
  var S = { files: {}, books: {}, scan: {}, agg: null, aggKey: '', extraMap: {}, result: null, inputs: null, synthetic: false, lastRunKey: '', running: false };

  /* ---------- quarter ---------- */
  function lastQuarter() { var d = new Date(), q = Math.floor(d.getMonth() / 3); return q === 0 ? { y: d.getFullYear() - 1, q: 4 } : { y: d.getFullYear(), q: q }; }
  (function () {
    var lq = lastQuarter(), ys = $('q-year');
    for (var y = lq.y + 1; y >= 2025; y--) ys.insertAdjacentHTML('beforeend', '<option>' + y + '</option>');
    ys.value = lq.y; $('q-q').value = lq.q;
  })();
  function info() { return D.quarterInfo(+$('q-year').value, +$('q-q').value); }
  function qpath() { return 'DRB Usage/' + info().folder; }

  /* ---------- storage (portal folder, else this browser) ---------- */
  function readJson(path, lsKey) {
    if (F.status() === 'connected') {
      var parts = path.split('/'), name = parts.pop();
      return F.folder(parts.join('/')).then(function (d) { return d.getFileHandle(name); }).then(function (h) { return h.getFile(); }).then(function (f) { return f.text(); })
        .then(function (t) { return JSON.parse(t); }).catch(function () { return null; });
    }
    try { return Promise.resolve(JSON.parse(localStorage.getItem(lsKey) || 'null')); } catch (e) { return Promise.resolve(null); }
  }
  function writeJson(path, lsKey, obj) {
    var txt = JSON.stringify(obj, null, 1);
    if (F.status() === 'connected') {
      var parts = path.split('/'), name = parts.pop();
      return F.folder(parts.join('/'), true).then(function (d) { return d.getFileHandle(name, { create: true }); }).then(function (h) { return h.createWritable(); })
        .then(function (w) { return w.write(txt).then(function () { return w.close(); }); }).catch(function () {});
    }
    try { localStorage.setItem(lsKey, txt); } catch (e) { /* storage blocked */ }
    return Promise.resolve();
  }
  function tmap() { var m = Object.assign({}, window.SBA_DRB_TXN_MAP || {}); Object.keys(S.extraMap).forEach(function (k) { m[k] = S.extraMap[k]; }); return m; }

  /* ---------- files: find and recognise ---------- */
  function key(f) { return f.name + '|' + f.size + '|' + f.lastModified; }
  function book(f) {
    var k = key(f); if (S.books[k]) return Promise.resolve(S.books[k]);
    return D.maybeGunzip(f).then(function (b) { return P.parse.excel(new File([b], f.name, { lastModified: f.lastModified })); }).then(function (bk) { bk.name = f.name; S.books[k] = bk; return bk; });
  }
  function hasSynth(bk) { return bk.sheetNames.some(function (n) { return (bk.grids[n] || []).slice(0, 8).some(function (r) { return (r || []).some(function (c) { return /synthetic test data/i.test(String(c || '')); }); }); }); }
  function kindOfBook(bk) {
    var sn = bk.sheetNames, any = function (re) { return sn.some(function (s) { return re.test(s); }); };
    if (any(/RIB Stats/i) && any(/API Channel/i) && any(/Insta-Peso-QR/i)) return 'drb_summary';
    if (any(/^DRB/i) && any(/^DCB/i)) return 'dcb_stats';
    if (any(/^DCB/i)) return 'itcom_dcb';
    if (sn.some(function (s) { return s.trim().toUpperCase() === 'RAW'; })) return 'raw';
    var g = bk.grids[sn[0]] || [], h6 = (g[5] || []).map(function (c) { return String(c || '').trim(); });
    if (h6.indexOf('CIF_ID_NO') >= 0 && h6.indexOf('IDLE') >= 0 && h6.indexOf('ADB') >= 0) return 'idle';
    var rib = sn.some(function (s) { return (bk.grids[s] || []).slice(0, 30).some(function (r) { var v = (r || []).map(function (c) { return String(c || '').trim(); }); return v.indexOf('TRANSACTION_TYPE') >= 0 && v.indexOf('STATUS') >= 0; }); });
    return rib ? 'rib' : null;
  }
  function classify(f) {   // -> Promise<kind|null>
    if (/\.csv$/i.test(f.name)) return f.slice(0, 4000).text().then(function (t) { return /TRANSACTION_TYPE/.test(t) && /CIF_ID_NO/.test(t) ? 'raw' : null; });
    if (/\.xlsb$/i.test(f.name)) return D.xlsbKind(f).then(function (r) { if (r.synthetic) S.synthetic = true; return r.kind; }, function () { return null; });   // binary workbook: header rows only
    if (!/\.(xlsx|xlsm|xls|zip|gz)$/i.test(f.name)) return Promise.resolve(null);
    if (/\.(xlsx|xlsm)$/i.test(f.name) && f.size > 15e6) return D.xlsxKind(f).catch(function () { return null; });   // too big to open whole: RAW sheet or header row only
    return book(f).then(function (bk) { if (hasSynth(bk)) S.synthetic = true; return kindOfBook(bk); }, function () { return null; });
  }
  function scan() {
    S.scan = {}; S.synthetic = false; $('scan-note').textContent = '';
    if (F.status() !== 'connected') { paintFiles(); return Promise.resolve(); }
    $('scan-note').textContent = 'Looking in your portal folder…';
    var base = qpath(), found = [];
    return Promise.all([''].concat(SENDERS).map(function (sub) {
      return F.list(base + (sub ? '/' + sub : '')).then(function (es) { es.forEach(function (e) { if (e.kind === 'file' && !/\.json$/i.test(e.name)) found.push({ file: e.file, where: sub || '(quarter folder)' }); }); });
    })).then(function () {
      return Promise.all(found.map(function (x) { return classify(x.file).then(function (k) { x.kind = k; }); }));
    }).then(function () {
      var end = ['', 'mar|march|-03-|_03_', 'jun|june|-06-|_06_', 'sep|sept|september|-09-|_09_', 'dec|december|-12-|_12_'][+$('q-q').value], endRe = new RegExp(end, 'i');
      SOURCES.forEach(function (s) {
        var c = found.filter(function (x) { return x.kind === s.k; });
        c.sort(function (a, b) { return (endRe.test(b.file.name) - endRe.test(a.file.name)) || (b.file.lastModified - a.file.lastModified); });
        if (c.length) S.scan[s.k] = { file: c[0].file, where: c[0].where, others: c.length - 1 };
      });
      if (/synthetic/i.test(S.scan.raw && S.scan.raw.file.name || '')) S.synthetic = true;
      $('scan-note').textContent = found.length ? found.length + ' file(s) looked at in ' + F.folderName() + '\\' + F.where(base) + '.' : 'No files yet in ' + F.folderName() + '\\' + F.where(base) + '.';
      paintFiles();
    });
  }
  function chosen(k) { return S.files[k] || S.scan[k] || null; }
  function paintFiles() {
    var inactiveTyped = $('cif-inactive').value !== '';
    $('files-t').innerHTML = SOURCES.map(function (s) {
      var c = chosen(s.k), need = s.need && !(s.k === 'idle' && inactiveTyped);
      var st = c ? '<span class="st ok">Ready</span> <span class="fname">' + esc(c.file.name) + (c.where ? ' · ' + esc(c.where) : ' · chosen by you') + (c.others ? ' · ' + c.others + ' other file(s) of this kind; using the quarter-end edition' : '') + '</span>'
        : need ? '<span class="st bad">Missing</span>' : '<span class="st off">Optional, not supplied</span>';
      return '<tr><td><b>' + esc(s.label) + '</b><br><span class="fname">' + esc(s.who) + '</span></td><td>' + st + '</td><td class="n"><label class="btn">Choose file<input type="file" data-src="' + s.k + '" hidden></label>' +
        (S.files[s.k] ? ' <button class="linkbtn-dark" type="button" data-unpick="' + s.k + '">Use the folder\'s</button>' : '') + '</td></tr>';
    }).join('');
    $('synth').classList.toggle('hide', !(S.synthetic || CIF.synthetic));
  }

  /* ---------- CIF Profile + prior ---------- */
  function defaults() {
    var i = info(), y = +$('q-year').value;
    return { cif: { total_cif: null, enrolled: null, cif_usage: null, inactive: null, inactive_why: '' }, generations: D.defaultGenerations(y), staff: D.STAFF.map(function (s) { return [s[0], s[1], null, null]; }),
      confirmed: false, prior: {}, priorNotes: {}, prior_categories: {}, prior_categories_source: '', open_items: [], priorFrom: '' , quarter: i.quarter };
  }
  // portal-inputs.json lives in the folder (or browser storage) and could be changed outside this page: keep numbers as numbers and text as text
  function cleanInputs(x) {
    if (!x || typeof x !== 'object') return null;
    var d = defaults(), n = numOrNull, t = function (v) { return v === null || v === undefined ? '' : String(v); }, arr = function (v) { return Array.isArray(v) ? v : []; };
    var c = x.cif || {}, out = {
      cif: { total_cif: n(c.total_cif), enrolled: n(c.enrolled), cif_usage: n(c.cif_usage), inactive: n(c.inactive), inactive_why: t(c.inactive_why) },
      generations: arr(x.generations).length ? x.generations.map(function (g) { g = arr(g); return [t(g[0]), t(g[1]), n(g[2]), n(g[3]), n(g[4]), n(g[5])]; }) : d.generations,
      staff: arr(x.staff).length ? x.staff.map(function (r) { r = arr(r); return [t(r[0]), t(r[1]), n(r[2]), n(r[3])]; }) : d.staff,
      confirmed: x.confirmed === true, prior: {}, priorNotes: {}, prior_categories: {}, prior_categories_source: t(x.prior_categories_source),
      open_items: arr(x.open_items).map(t), priorFrom: t(x.priorFrom), priorConfirmed: x.priorConfirmed === true, quarter: t(x.quarter),
      priorMissing: arr(x.priorMissing).filter(function (k) { return D.PRIOR_KEYS.indexOf(k) >= 0; })
    };
    D.PRIOR_KEYS.forEach(function (k) { if (x.prior && k in x.prior) out.prior[k] = n(x.prior[k]); if (x.priorNotes && x.priorNotes[k] != null) out.priorNotes[k] = t(x.priorNotes[k]); });
    Object.keys(x.prior_categories || {}).forEach(function (k) { out.prior_categories[k] = n(x.prior_categories[k]); });
    var f = x.cifFrom;
    if (f && typeof f === 'object') out.cifFrom = { name: t(f.name), where: t(f.where), key: t(f.key), pics: n(f.pics) || 0, found: arr(f.found).map(t), flags: arr(f.flags).map(t),
      checks: arr(f.checks).map(function (k) { return { label: t(k && k.label), ok: !!(k && k.ok) }; }) };
    return out;
  }
  function numOrNull(v) { if (v === '' || v === null || v === undefined) return null; var n = Number(v); return isFinite(n) ? n : null; }
  function paintInputs() {
    var x = S.inputs;
    $('cif-total').value = x.cif.total_cif == null ? '' : x.cif.total_cif; $('cif-enrolled').value = x.cif.enrolled == null ? '' : x.cif.enrolled;
    $('cif-usage').value = x.cif.cif_usage == null ? '' : x.cif.cif_usage; $('cif-inactive').value = x.cif.inactive == null ? '' : x.cif.inactive; $('cif-inactive-why').value = x.cif.inactive_why || '';
    $('inactive-why-f').classList.toggle('hide', x.cif.inactive == null);
    $('gen-t').innerHTML = x.generations.map(function (g, i) {
      return '<tr><td><input type="text" data-g="' + i + ',0" value="' + esc(g[0]) + '"></td><td><input type="text" data-g="' + i + ',1" value="' + esc(g[1]) + '"></td>' +
        [2, 3, 4, 5].map(function (j) { return '<td class="n"><input class="num" type="number" min="0" step="1" data-g="' + i + ',' + j + '" value="' + (g[j] == null ? '' : g[j]) + '"></td>'; }).join('') + '</tr>';
    }).join('');
    $('staff-t').innerHTML = x.staff.map(function (s, i) {
      return '<tr><td>' + esc(s[0]) + '</td><td>' + esc(s[1] || '(blank)') + '</td>' + [2, 3].map(function (j) { return '<td class="n"><input class="num" type="number" min="0" step="1" data-s="' + i + ',' + j + '" value="' + (s[j] == null ? '' : s[j]) + '"></td>'; }).join('') + '</tr>';
    }).join('');
    paintPrior(); paintReadback();
  }
  function paintPrior() {
    var x = S.inputs;
    var pq = info().prior_quarter, KEYF = ['total_cif', 'enrolled', 'fin', 'login', 'inactive', 'cif_any', 'txn_total', 'card'];
    var miss = (x.priorMissing || []).filter(function (k) { return x.prior[k] == null; });
    $('prior-src').innerHTML = x.priorFrom ? '<b>Read from ' + esc(x.priorFrom) + '</b> (' + esc(pq) + '). Read these back:<dl>' +
        KEYF.map(function (k) { return '<dt>' + esc(PRIOR_LABELS[k]) + '</dt><dd>' + (x.prior[k] == null ? '<span class="muted">not stated</span>' : fmtN(x.prior[k])) + '</dd>'; }).join('') + '</dl>' +
        (miss.length ? '<p class="k-warn">Not in that workbook, so type ' + (miss.length === 1 ? 'it' : 'them') + ' under “Show and edit”: ' + miss.map(function (k) { return esc(PRIOR_LABELS[k]); }).join(', ') + '.</p>' : '') +
        '<label class="k-check"><input type="checkbox" id="prior-ok"' + (x.priorConfirmed ? ' checked' : '') + '> These are last quarter\'s figures</label>' :
      'Last quarter\'s workbook (' + esc(pq) + ') was not found in <b>Product Management › DRB Usage › Outputs</b> or last quarter\'s folder. Put it there and click <b>Read it again</b>, choose it, or type the figures under “Show and edit”.';
    $('prior-t').innerHTML = D.PRIOR_KEYS.map(function (k) {
      var v = x.prior[k];
      return '<tr><td>' + esc(PRIOR_LABELS[k]) + (PRIOR_NEED.indexOf(k) >= 0 ? ' <span class="req">*</span>' : '') + '</td><td class="n"><input class="num" type="number" step="1" data-p="' + k + '" value="' + (v == null ? '' : v) + '"></td><td><input type="text" data-pn="' + k + '" value="' + esc(x.priorNotes[k] || '') + '"></td></tr>';
    }).join('');
    var cats = Object.keys(x.prior_categories);
    $('pcat-t').innerHTML = cats.length ? cats.map(function (c) { return '<tr><td>' + esc(c) + '</td><td class="n"><input class="num" type="number" step="1" data-pc="' + esc(c) + '" value="' + (x.prior_categories[c] == null ? '' : x.prior_categories[c]) + '"></td></tr>'; }).join('')
      : '<tr><td colspan="2" class="muted">None yet. They come from last quarter\'s workbook (Transactions sheet).</td></tr>';
    $('open-items').value = (x.open_items || []).join('\n');
    if (!x.priorFrom) $('prior-box').open = true;
  }
  function paintReadback() {
    var x = S.inputs, c = x.cif, ok = c.total_cif != null && c.enrolled != null && c.cif_usage != null;
    var genA = x.generations.reduce(function (s, g) { return s + (g[4] || 0); }, 0), genI = x.generations.reduce(function (s, g) { return s + (g[5] || 0); }, 0);
    var stA = x.staff.reduce(function (s, g) { return s + (g[2] || 0); }, 0), stI = x.staff.reduce(function (s, g) { return s + (g[3] || 0); }, 0);
    $('readback').innerHTML = !ok ? '<b>Type the CIF figures above.</b> They are read back here for you to check before the report is built.' :
      '<b>Read these back against the CIF Profile:</b><dl><dt>Total CIFs</dt><dd>' + fmtN(c.total_cif) + '</dd><dt>Total enrolled CIFs</dt><dd>' + fmtN(c.enrolled) + '</dd><dt>CIF w/ usage</dt><dd>' + fmtN(c.cif_usage) + '</dd>' +
      '<dt>Inactive CIFs</dt><dd>' + (c.inactive == null ? 'from the idle report' : fmtN(c.inactive) + ' (typed)') + '</dd><dt>Generation table, active / idle</dt><dd>' + fmtN(genA) + ' / ' + fmtN(genI) + '</dd><dt>Staff table, active / idle</dt><dd>' + fmtN(stA) + ' / ' + fmtN(stI) + '</dd></dl>' +
      (genA + genI !== stA + stI ? '<p class="k-warn">The generation total and the staff total differ (' + fmtN(genA + genI) + ' vs ' + fmtN(stA + stI) + '). The Checks sheet will show FAIL.</p>' : '') +
      '<label class="k-check"><input type="checkbox" id="cif-ok"' + (x.confirmed ? ' checked' : '') + '> These match the CIF Profile</label>';
  }
  function saveInputs() { return writeJson(qpath() + '/portal-inputs.json', 'drb-inputs-' + info().folder, S.inputs); }
  function loadPrior(file, book) {   // last quarter's workbook -> prior figures
    return (book ? Promise.resolve(book) : P.parse.excel(file)).then(function (bk) {
      var r = D.readPrior(bk), x = S.inputs, pq = info().prior_quarter;
      x.priorMissing = r.missing || []; x.priorConfirmed = false;
      D.PRIOR_KEYS.forEach(function (k) { x.prior[k] = r.prior[k] != null ? r.prior[k] : x.prior[k]; x.priorNotes[k] = pq + ' workbook (QoQ carry-forward)'; });
      x.prior_categories = r.categories; x.prior_categories_source = pq + ' workbook, Transactions sheet (Quarter total)';
      if (!x.open_items || !x.open_items.length) x.open_items = r.open_items;
      x.priorFrom = file.name + (r.quarter && r.quarter !== pq ? ' (its quarter is ' + r.quarter + ', not ' + pq + ')' : '');
      paintPrior(); return saveInputs();
    });
  }
  // last quarter's workbook, found by what is inside it (Inputs › Quarter = last quarter, with a QoQ carry-forward table), whatever its name
  function findPrior() {
    if (F.status() !== 'connected') return Promise.resolve(null);
    var i = info(), pq = i.prior_quarter, want = D.fileName(pq).toLowerCase().replace(/[\s_-]+/g, ' ');
    var dirs = ['DRB Usage/Outputs', 'DRB Usage/' + i.priorFolder, 'DRB Usage/' + i.priorFolder + '/Outputs'].concat(SENDERS.map(function (sd) { return 'DRB Usage/' + i.priorFolder + '/' + sd; }));
    return Promise.all(dirs.map(function (d) { return F.list(d).catch(function () { return []; }); })).then(function (ls) {
      var c = [].concat.apply([], ls).filter(function (e) { return e.kind === 'file' && /\.xlsx$/i.test(e.name) && !/^~\$/.test(e.name); });
      var named = function (e) { return e.name.toLowerCase().replace(/[\s_-]+/g, ' ').indexOf(want) === 0 ? 1 : 0; };
      c.sort(function (a, b) { return (named(b) - named(a)) || (b.file.lastModified - a.file.lastModified); });
      return c.reduce(function (pr, e) {
        return pr.then(function (hit) {
          if (hit) return hit;
          return P.parse.excel(e.file).then(function (bk) {
            if (!bk.grids.QoQ || !bk.grids.Inputs) return null;
            var r; try { r = D.readPrior(bk); } catch (er) { return null; }
            return r.quarter === pq ? { file: e.file, book: bk } : null;
          }, function () { return null; });
        });
      }, Promise.resolve(null));
    });
  }
  function loadQuarter() {
    var i = info();
    $('q-where').innerHTML = F.status() === 'connected' ? 'Files are read from <b>' + esc(F.folderName()) + ' › Product Management › DRB Usage › ' + i.folder + '</b>, one folder per sender (Ms. Hong, Sir Jun, Automailer, RIB Inbox shared drive). The workbook is saved to <b>Product Management › DRB Usage › Outputs</b>.'
      : 'No portal folder yet: choose it in the top bar, or pick each file below with <b>Choose file</b>.';
    $('btn-mkdirs').classList.toggle('hide', F.status() !== 'connected');
    S.files = {}; S.result = null; $('c-review').classList.add('hide');
    return Promise.all([readJson(qpath() + '/portal-inputs.json', 'drb-inputs-' + i.folder), readJson('DRB Usage/txn_map.json', 'drb-txn-map')]).then(function (v) {
      S.extraMap = v[1] || {};
      var x = cleanInputs(v[0]) || defaults(); S.inputs = x; paintInputs();
      var p = x.priorFrom ? Promise.resolve() : findPrior().then(function (f) { return f ? loadPrior(f.file, f.book) : null; }).catch(function (er) { $('prior-src').innerHTML = '<span class="k-warn">' + esc(er.message || er) + '</span>'; });
      return Promise.all([p, scan(), cifAuto()]);
    }).then(maybeAutoRun);
  }

  /* ---------- CIF Profile from Ms. Hong (step 3): her email, its pasted pictures, an Excel file or pasted text ---------- */
  var CIF = { src: null, shown: null, synthetic: false };
  function isPic(n, ty) { return /^image\//i.test(ty || '') || /\.(png|jpe?g|gif|bmp)$/i.test(n || ''); }
  // files -> { name, key, pics: [{ name, bytes }], text } or null when nothing in them looks like the CIF Profile
  function cifSource(files, where) {
    var pics = files.filter(function (f) { return isPic(f.name, f.type); });
    if (pics.length && pics.length === files.length) {
      return Promise.all(pics.map(function (f) { return f.arrayBuffer().then(function (b) { return { name: f.name, bytes: new Uint8Array(b) }; }); }))
        .then(function (ps) { return { name: pics.length === 1 ? pics[0].name : pics.length + ' pictures', where: where, key: pics.map(key).join('/'), pics: ps, text: '' }; });
    }
    var f = files[0], k = key(f);
    if (/\.(msg|eml)$/i.test(f.name)) {
      return f.arrayBuffer().then(function (b) {
        var m = /\.msg$/i.test(f.name) ? window.RIB.parseMsg(b) : window.RIB.parseEml(b), all = (m.subject || '') + '\n' + (m.body || '');
        var ps = (m.files || []).filter(function (a) { return isPic(a.name, a.type); }).map(function (a) { return { name: a.name, bytes: a.bytes }; });
        if (!/cif\s*profile|total\s*enrol/i.test(all) && !ps.length) return null;
        return { name: f.name, where: where, key: k, pics: ps, text: m.body || '', synthetic: /synthetic test data/i.test(all) };
      });
    }
    if (/\.(xlsx|xls)$/i.test(f.name)) {
      return book(f).then(function (bk) {
        var t = bk.sheetNames.map(function (n) { return (bk.grids[n] || []).map(function (r) { return (r || []).map(function (c) { return c == null ? '' : String(c); }).join('\t'); }).join('\n'); }).join('\n');
        return /total\s*enrol/i.test(t) ? { name: f.name, where: where, key: k, pics: [], text: t, synthetic: hasSynth(bk) } : null;
      }, function () { return null; });
    }
    if (/\.txt$/i.test(f.name)) return f.text().then(function (t) { return /total\s*enrol/i.test(t) ? { name: f.name, where: where, key: k, pics: [], text: t } : null; });
    return Promise.resolve(null);
  }
  function findCif() {   // newest email (or Excel file) in the Ms. Hong folder that holds the CIF Profile; else the pictures saved there
    if (F.status() !== 'connected') return Promise.resolve(null);
    return F.list(qpath() + '/Ms. Hong').catch(function () { return []; }).then(function (es) {
      var fs = es.filter(function (e) { return e.kind === 'file' && !/\.json$/i.test(e.name) && !/^~\$/.test(e.name); }).map(function (e) { return e.file; })
        .sort(function (a, b) { return b.lastModified - a.lastModified; });
      var docs = fs.filter(function (f) { return /\.(msg|eml|xlsx|xls|txt)$/i.test(f.name); }), pics = fs.filter(function (f) { return isPic(f.name); });
      return docs.reduce(function (pr, f) { return pr.then(function (hit) { return hit || cifSource([f], 'Ms. Hong folder').catch(function () { return null; }); }); }, Promise.resolve(null))
        .then(function (hit) { return hit || (pics.length ? cifSource(pics.sort(function (a, b) { return a.name < b.name ? -1 : 1; }), 'Ms. Hong folder') : null); });
    });
  }
  function showPics(src) {   // the pictures beside the form, to compare (data URLs: they are a few KB)
    if (CIF.shown === src) return; CIF.shown = src;
    $('cif-pics').innerHTML = '';
    (src && src.pics || []).forEach(function (p) {
      var bin = '', u = p.bytes; for (var i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
      var ty = /\.jpe?g$/i.test(p.name) ? 'image/jpeg' : /\.gif$/i.test(p.name) ? 'image/gif' : 'image/png';
      var im = new Image(); im.src = 'data:' + ty + ';base64,' + btoa(bin); im.alt = p.name; im.title = p.name; $('cif-pics').appendChild(im);
    });
  }
  function paintCif() {
    var x = S.inputs, c = x && x.cifFrom;
    if (!c) { $('cif-src').innerHTML = F.status() === 'connected' ? 'Ms. Hong\'s email was not found in <b>Product Management › DRB Usage › ' + esc(info().folder) + ' › Ms. Hong</b>. Save it there (in Outlook: File › Save As), choose it below, or type the figures.' : 'Choose Ms. Hong\'s email (or its pictures) below, or type the figures.'; $('cif-checks').innerHTML = ''; return; }
    var bad = (c.flags || []).length;
    $('cif-src').innerHTML = '<b>Read from ' + esc(c.name) + '</b>' + (c.where ? ' (' + esc(c.where) + ')' : '') + (c.pics ? ', ' + c.pics + ' picture' + (c.pics === 1 ? '' : 's') : '') + '. ' +
      (bad ? '<span class="k-warn">Check the items marked ! and correct the figures below.</span>' : 'The figures add up' + (c.pics ? '; compare them with the pictures below' : '') + ', then tick “These match the CIF Profile”.');
    var seen = {};
    $('cif-checks').innerHTML = (c.checks || []).map(function (k) { seen[k.label] = 1; return '<li class="' + (k.ok ? 'ok' : 'bad') + '">' + esc(k.label) + '</li>'; }).join('') +
      (c.flags || []).filter(function (f) { return !seen[f]; }).map(function (f) { return '<li class="bad">' + esc(f) + '</li>'; }).join('');
  }
  function readCif(src) {
    var x = S.inputs, y = +$('q-year').value; CIF.src = src; CIF.synthetic = !!src.synthetic; showPics(src);
    if (CIF.synthetic) $('synth').classList.remove('hide');
    var job = src.pics.length ? src.pics.reduce(function (pr, p, k) {
      return pr.then(function (acc) {
        return P.ocr.read(p.bytes, D.CIF_PASSES, function (m) { $('cif-src').textContent = 'Picture ' + (k + 1) + ' of ' + src.pics.length + ': ' + m; })
          .then(function (ws) { acc.push({ name: p.name, passes: ws }); return acc; });
      });
    }, Promise.resolve([])).then(function (imgs) { return D.readCifPictures(imgs, y); }) : Promise.resolve(D.readCifText(src.text, y));
    $('cif-src').textContent = 'Reading ' + src.name + '…';
    return job.then(function (r) {
      ['total_cif', 'enrolled', 'cif_usage'].forEach(function (k) { if (r.cif[k] != null) x.cif[k] = r.cif[k]; });
      if (r.generations) x.generations = r.generations.map(function (g, i) { var o = x.generations[i] || g; return [g[0], g[1], g[2], g[3], g[4] != null ? g[4] : o[4], g[5] != null ? g[5] : o[5]]; });
      if (r.staff) x.staff = r.staff.map(function (s_, i) { var o = x.staff[i] || s_; return [s_[0], s_[1], s_[2] != null ? s_[2] : o[2], s_[3] != null ? s_[3] : o[3]]; });
      x.confirmed = false;
      x.cifFrom = { name: src.name, where: src.where || '', key: src.key, pics: src.pics.length, checks: r.checks, flags: r.flags, found: r.found };
      paintInputs(); paintCif(); return saveInputs();
    }).catch(function (e) { $('cif-src').innerHTML = '<span class="k-warn">Could not read ' + esc(src.name) + ': ' + esc(e && e.message || e) + '</span> Type the figures below instead.'; });
  }
  function cifAuto(force) {   // on opening the quarter: read Ms. Hong's email when it is new (the figures are saved, so it is not read twice)
    return findCif().then(function (src) {
      CIF.src = src; CIF.synthetic = !!(src && src.synthetic); showPics(src);
      if (CIF.synthetic) $('synth').classList.remove('hide');
      if (src && (force || !S.inputs.cifFrom || S.inputs.cifFrom.key !== src.key)) return readCif(src);
      paintCif();
    }).catch(function () { paintCif(); });
  }

  /* ---------- events ---------- */
  $('q-year').addEventListener('change', loadQuarter); $('q-q').addEventListener('change', loadQuarter);
  $('btn-rescan').addEventListener('click', function () { scan().then(maybeAutoRun); });
  $('btn-mkdirs').addEventListener('click', function () {
    var base = qpath();
    Promise.all(SENDERS.map(function (s) { return F.folder(base + '/' + s, true); })).then(function () { $('mkdirs-note').textContent = 'Done: ' + F.folderName() + '\\' + F.where(base) + ' now has a folder for each sender.'; scan(); },
      function (e) { $('mkdirs-note').textContent = 'Could not create the folders (' + (e && e.message || e) + ').'; });
  });
  page.addEventListener('change', function (e) {
    var t = e.target;
    if (t.matches('[data-src]')) { if (t.files[0]) { S.files[t.getAttribute('data-src')] = { file: t.files[0], where: '' }; if (/synthetic/i.test(t.files[0].name)) S.synthetic = true; paintFiles(); maybeAutoRun(); } t.value = ''; return; }
    if (t.id === 'prior-file' && t.files[0]) { S.inputs.priorFrom = ''; loadPrior(t.files[0]).catch(function (er) { $('prior-src').innerHTML = '<span class="k-warn">' + esc(er.message || er) + '</span>'; }); t.value = ''; return; }
    if (t.id === 'cif-ok') { S.inputs.confirmed = t.checked; saveInputs(); maybeAutoRun(); return; }
    if (t.id === 'prior-ok') { S.inputs.priorConfirmed = t.checked; saveInputs(); maybeAutoRun(); return; }
    if (t.id === 'cif-file' && t.files.length) { var fl = Array.from(t.files); t.value = ''; cifSource(fl, '').then(function (src) { if (src) readCif(src); else $('cif-src').innerHTML = '<span class="k-warn">No CIF Profile figures or pictures were found in that file.</span>'; }); return; }
  });
  page.addEventListener('click', function (e) {
    var u = e.target.closest('[data-unpick]'); if (u) { delete S.files[u.getAttribute('data-unpick')]; paintFiles(); maybeAutoRun(); }
  });
  page.addEventListener('input', function (e) {
    var t = e.target, x = S.inputs; if (!x) return;
    var map = { 'cif-total': 'total_cif', 'cif-enrolled': 'enrolled', 'cif-usage': 'cif_usage', 'cif-inactive': 'inactive' };
    if (map[t.id]) { x.cif[map[t.id]] = numOrNull(t.value); x.confirmed = false; if (t.id === 'cif-inactive') { $('inactive-why-f').classList.toggle('hide', t.value === ''); paintFiles(); } paintReadback(); saveInputs(); return; }
    if (t.id === 'cif-inactive-why') { x.cif.inactive_why = t.value; saveInputs(); return; }
    var g = t.getAttribute('data-g'); if (g) { var a = g.split(','); x.generations[+a[0]][+a[1]] = +a[1] < 2 ? t.value : numOrNull(t.value); x.confirmed = false; paintReadback(); saveInputs(); return; }
    var s = t.getAttribute('data-s'); if (s) { var b = s.split(','); x.staff[+b[0]][+b[1]] = numOrNull(t.value); x.confirmed = false; paintReadback(); saveInputs(); return; }
    var p = t.getAttribute('data-p'); if (p) { x.prior[p] = numOrNull(t.value); saveInputs(); return; }
    var pn = t.getAttribute('data-pn'); if (pn) { x.priorNotes[pn] = t.value; saveInputs(); return; }
    var pc = t.getAttribute('data-pc'); if (pc) { x.prior_categories[pc] = numOrNull(t.value); saveInputs(); return; }
    if (t.id === 'open-items') { x.open_items = t.value.split('\n').map(function (l) { return l.trim(); }).filter(Boolean); saveInputs(); }
  });
  $('btn-prior-reload').addEventListener('click', function () { S.inputs.priorFrom = ''; findPrior().then(function (f) { if (f) return loadPrior(f.file, f.book); paintPrior(); }).catch(function (er) { $('prior-src').innerHTML = '<span class="k-warn">' + esc(er.message || er) + '</span>'; }); });
  $('btn-cif-reread').addEventListener('click', function () { if (CIF.src) readCif(CIF.src); else cifAuto(true); });
  $('btn-cif-paste').addEventListener('click', function () { var t = $('cif-paste').value; if (t.trim()) readCif({ name: 'the pasted text', key: 'paste:' + t.length, text: t, pics: [] }); });

  /* ---------- run ---------- */
  function progress(msg, p) { $('prog').classList.remove('hide'); $('prog').firstChild.style.width = Math.max(2, Math.min(100, p || 0)) + '%'; $('prog-msg').textContent = msg; }
  function fail(msg) { S.running = false; $('run-err').innerHTML = '<div class="errors card msg" role="alert"><b>Could not create the report.</b> ' + esc(msg) + '</div>'; $('btn-run').disabled = false; $('prog').classList.add('hide'); $('prog-msg').textContent = ''; }
  function problems() {
    var x = S.inputs, c = x.cif, out = [];
    SOURCES.forEach(function (s) { if (s.need && !chosen(s.k) && !(s.k === 'idle' && c.inactive != null)) out.push('Add the ' + s.label + ' (' + s.who + ').'); });
    if (c.total_cif == null || c.enrolled == null || c.cif_usage == null) out.push('Type the Total CIFs, Total enrolled CIFs and CIF w/ usage from the CIF Profile.');
    if (x.generations.some(function (g) { return g[4] == null || g[5] == null; }) || x.staff.some(function (s) { return s[2] == null || s[3] == null; })) out.push('Fill in every Active and Idle cell in the generation and staff tables (0 if none).');
    if (!x.confirmed) out.push('Tick “These match the CIF Profile” after reading the figures back.');
    if (x.priorFrom && !x.priorConfirmed) out.push('Tick “These are last quarter\'s figures” in step 4.');
    var miss = PRIOR_NEED.filter(function (k) { return x.prior[k] == null; });
    if (miss.length) out.push('Last quarter\'s figures are missing: ' + miss.map(function (k) { return PRIOR_LABELS[k]; }).join(', ') + '.');
    return out;
  }
  // auto-run: the report builds itself once every required file is recognised and both read-back ticks are done,
  // once per unchanged set of inputs (ticking again does not rebuild); Create report always rebuilds
  function readyToRun() { var x = S.inputs; return !!x && x.confirmed && (!x.priorFrom || x.priorConfirmed) && !problems().length; }
  function inputKey() {
    var x = S.inputs, f = SOURCES.map(function (s) { var c = chosen(s.k); return c ? key(c.file) : ''; });
    return JSON.stringify([info().quarter, f, x.cif, x.generations, x.staff, x.prior, x.prior_categories, x.open_items, S.extraMap]);
  }
  function maybeAutoRun() {
    if (S.running || !readyToRun() || !$('c-map').classList.contains('hide')) return;
    var k = inputKey(); if (k === S.lastRunKey) return;
    S.lastRunKey = k; run();
  }
  function config(agg) {
    var i = info(), x = S.inputs, c = x.cif, months = i.months.slice();
    // use the export's own month spellings when they are this quarter's months (the workbook matches on them)
    (agg && agg.months ? Array.from(agg.months) : []).forEach(function (m) { var j = months.map(function (z) { return z.slice(0, 3); }).indexOf(String(m).slice(0, 3).toUpperCase()); if (j >= 0) months[j] = m; });
    var files = {}; SOURCES.forEach(function (s) { var f = chosen(s.k); files[s.k] = f ? f.file.name : null; });
    if (c.inactive != null && !chosen('idle')) files.idle = null;
    var prior = {}; D.PRIOR_KEYS.forEach(function (k) { prior[k] = [x.prior[k] == null ? null : x.prior[k], x.priorNotes[k] || 'Typed']; });
    return { quarter: i.quarter, period: i.period, months: months, prior_quarter: i.prior_quarter, prior_months: i.prior_months, as_of: i.as_of, files: files, display: Object.assign({}, D.DEFAULT_DISPLAY, agg && agg.layout === 'v2' ? { raw: D.V2_DISPLAY } : {}),
      cif: { total_cif: [c.total_cif, 'CIF Profile (Ms. Maria Hong), net of dormant and closed'], enrolled: [c.enrolled, 'CIF Profile (Ms. Maria Hong), net of dormant and closed'],
        cif_usage: [c.cif_usage, 'CIF Profile (Ms. Maria Hong); usage net of Seniors, Neo below 18, BOS accts, Iremit, closed and dormant'], inactive: [c.inactive, c.inactive == null ? '' : (c.inactive_why || 'Typed override')] },
      generations: x.generations.map(function (g) { return g.slice(); }), staff: x.staff.map(function (s) { return s.slice(); }), prior: prior,
      prior_categories: x.prior_categories, prior_categories_source: x.prior_categories_source,
      // the rows left out of the export are noted on the Method sheet (as the skill's prep_raw.py does), replacing last quarter's note
      open_items: (x.open_items || []).filter(function (o) { return !/dated outside/.test(o); }).concat(agg && D.outsideNote(agg.dropped, i.quarter) ? [D.outsideNote(agg.dropped, i.quarter)] : []) };
  }
  function readRaw() {
    var f = chosen('raw').file, months = info().months, k = key(f) + '|' + months.join();
    if (S.agg && S.aggKey === k) return Promise.resolve(S.agg);
    var agg = new D.RawAgg(tmap(), months);   // rows from outside the quarter's months are left out and counted
    var job = /\.csv$/i.test(f.name) ? D.readRawCsv(f, agg, progress) : /\.xlsb$/i.test(f.name) ? D.readRawXlsb(f, agg, progress) : D.readRawXlsx(f, agg, progress);
    return job.then(function (r) {
      agg.layout = r && r.layout;
      var out = Object.keys(agg.dropped);
      if (!agg.n && out.length) throw new Error('None of the rows in the DRB Usage export are from ' + months.join(', ') + ' (it has ' + out.join(', ') + '). Check the quarter chosen in step 1.');
      var have = Array.from(agg.months).map(function (m) { return String(m).trim().slice(0, 3).toUpperCase(); }), none = months.filter(function (m) { return have.indexOf(m.slice(0, 3)) < 0; });
      if (none.length) throw new Error('The DRB Usage export has no rows for ' + none.join(', ') + '. Ask Ms. Hong for the full-quarter file, or check the quarter chosen in step 1.');
      S.agg = agg; S.aggKey = k; return agg;
    }, function (e) {
      if (e instanceof RangeError || /allocation|memory|Invalid string length|out of memory/i.test(String(e && e.message))) {
        throw new Error('This computer ran out of memory reading the DRB Usage export. Open it in Excel, save the RAW sheet as “CSV (Comma delimited)”, put the CSV in the Ms. Hong folder (or choose it), and try again.');
      }
      throw e;
    });
  }
  function outside(d, what) {   // e.g. " Left out 120 rows from OCTOBER (DRB Usage export, outside the quarter)."
    var k = Object.keys(d); if (!k.length) return '';
    return ' Left out ' + k.map(function (m) { return fmtN(d[m]) + ' row' + (d[m] === 1 ? '' : 's') + ' from ' + m; }).join(', ') + ' (' + what + ', outside the quarter).';
  }
  function run() {
    $('run-err').innerHTML = ''; $('c-map').classList.add('hide');
    var pr = problems();
    if (pr.length) { $('run-err').innerHTML = '<div class="errors card msg" role="alert"><b>Before the report can be built:</b><ul>' + pr.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul></div>'; return; }
    $('btn-run').disabled = true; $('c-review').classList.add('hide'); S.running = true;
    readRaw().then(function (agg) {
      var tm = tmap(), raw = agg.finish(tm);
      if (raw.unmapped) { S.running = false; showMap(raw.unmapped, tm); $('btn-run').disabled = false; $('prog').classList.add('hide'); $('prog-msg').textContent = ''; return; }
      progress('Reading the other files…', 96);
      var books = {};
      var i = info(), q = { year: +i.quarter.slice(-4), months: i.months }, rib = null;
      return Promise.all(['drb_summary', 'itcom_dcb', 'dcb_stats', 'idle', 'rib'].map(function (k) {
        var c = chosen(k); if (!c) return null;
        if (k === 'rib' && /\.xlsb$/i.test(c.file.name)) return D.readRibXlsb(c.file, null, q).then(function (r) { rib = r; });
        return book(c.file).then(function (b) { books[k] = b; if (hasSynth(b)) S.synthetic = true; });
      })).then(function () {
        if (books.rib) rib = D.readRib(books.rib, q);
        var cfg = config(agg);
        if (!books.idle) cfg.files.idle = null;
        progress('Building the workbook…', 97);
        var res = D.build({ cfg: cfg, tmap: tm, raw: raw, idle: books.idle ? D.readIdle(books.idle) : null, rib: rib,
          books: { drb_summary: books.drb_summary, itcom_dcb: books.itcom_dcb, dcb_stats: books.dcb_stats }, today: new Date() });
        progress('Working out every figure…', 98);
        res.wb.calculate();
        S.result = { wb: res.wb, cfg: cfg, fig: D.figures(res.wb), synthetic: S.synthetic || CIF.synthetic };
        dashboard();
        $('prog').classList.add('hide'); $('prog-msg').textContent = 'Read ' + agg.n.toLocaleString('en-US') + ' rows from ' + i.period + '.' + outside(agg.dropped, 'DRB Usage export') + (rib && rib.dropped ? outside({ 'other dates': rib.dropped }, 'RIB Usage extraction') : ''); $('btn-run').disabled = false; S.running = false;
        review();
      });
    }).catch(function (e) { fail(e && e.message || String(e)); });
  }
  $('btn-run').addEventListener('click', function () { if (S.inputs) S.lastRunKey = inputKey(); run(); });

  /* ---------- new transaction types ---------- */
  function showMap(unm, tm) {
    var cats = {}; Object.keys(tm).forEach(function (t) { cats[tm[t].category] = 1; });
    var opts = Object.keys(cats).sort();
    var qrs = ['-'].concat(D.QRG, ['QR activation']);
    $('map-t').innerHTML = Object.keys(unm).sort().map(function (t, i) {
      return '<tr><td><b>' + esc(t) + '</b></td><td class="n">' + fmtN(unm[t]) + '</td><td><select data-mc="' + i + '"><option value="">Choose…</option>' + opts.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('') + '<option value="__new">New category…</option></select><input type="text" data-mn="' + i + '" class="hide" placeholder="Name of the new category"></td>' +
        '<td><select data-mq="' + i + '">' + qrs.map(function (q) { return '<option>' + esc(q) + '</option>'; }).join('') + '</select></td><td><select data-mf="' + i + '"><option value="">Choose…</option><option>Yes</option><option>No</option></select></td></tr>';
    }).join('');
    $('map-t').setAttribute('data-types', JSON.stringify(Object.keys(unm).sort()));
    $('c-map').classList.remove('hide'); $('c-map').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  $('map-t').addEventListener('change', function (e) { var c = e.target.getAttribute('data-mc'); if (c !== null) document.querySelector('[data-mn="' + c + '"]').classList.toggle('hide', e.target.value !== '__new'); });
  $('btn-map').addEventListener('click', function () {
    var types = JSON.parse($('map-t').getAttribute('data-types') || '[]'), add = {}, bad = [];
    types.forEach(function (t, i) {
      var c = document.querySelector('[data-mc="' + i + '"]').value, n = document.querySelector('[data-mn="' + i + '"]').value.trim(), q = document.querySelector('[data-mq="' + i + '"]').value, f = document.querySelector('[data-mf="' + i + '"]').value;
      var cat = c === '__new' ? n : c;
      if (!cat || !f) bad.push(t); else add[t] = { category: cat, qr_group: q === '-' ? '' : q, financial: f };
    });
    if (bad.length) { alert('Choose a category and Financial yes/no for: ' + bad.join(', ')); return; }
    Object.assign(S.extraMap, add);
    writeJson('DRB Usage/txn_map.json', 'drb-txn-map', S.extraMap).then(function () { $('c-map').classList.add('hide'); run(); });
  });

  /* ---------- dashboard (default tab) and details ---------- */
  function dashboard() {   // never blocks the review or the save: on an error it notes it and shows Details
    var R = S.result; R.dashOk = false; $('dash-msg').textContent = '';
    try {
      R.dash = D.dashboardData(R.wb, { synthetic: R.synthetic });
      D.renderDashboard($('rv-dash'), R.dash, { save: function (name, blob) {
        return F.save(name, blob, 'DRB Usage').then(function (r) {
          $('dash-msg').innerHTML = r.where === 'folder' ? 'Saved <b>' + esc(r.name) + '</b> in ' + esc(r.folder) + '.' : 'Downloaded <b>' + esc(r.name) + '</b>' + (r.error ? ' (' + esc(r.error) + ')' : '') + '.';
        });
      } });
      R.dashOk = true;
    } catch (e) { $('rv-dash').innerHTML = '<p class="k-warn">The dashboard could not be drawn (' + esc(e && e.message || e) + '). The figures are under Details.</p>'; }
  }
  function showTab(dash) {
    $('tab-dash').setAttribute('aria-selected', String(dash)); $('tab-det').setAttribute('aria-selected', String(!dash));
    $('rv-dash').hidden = !dash; $('dash-msg').hidden = !dash; $('rv-details').hidden = dash; document.body.classList.toggle('print-dash', dash);
  }
  $('tab-dash').addEventListener('click', function () { showTab(true); });
  $('tab-det').addEventListener('click', function () { showTab(false); });

  /* ---------- review ---------- */
  function chgTxt(v, kind) {
    if (typeof v !== 'number') return '<span class="muted">' + esc(v == null ? '' : String(v)) + '</span>';
    var up = v > 0, s = kind === 'pts' ? Math.abs(v).toFixed(1) + ' pts' : (Math.abs(v) * 100).toFixed(1) + '%';
    return v === 0 ? '–' : '<span class="chg ' + (up ? 'up' : 'down') + '">' + (up ? '▲ ' : '▼ ') + s + '</span>';
  }
  function review() {
    var R = S.result, f = R.fig, c = R.cfg;
    $('rv-q').textContent = c.quarter + ' vs ' + c.prior_quarter; $('rv-cq').textContent = c.quarter; $('rv-pq').textContent = c.prior_quarter;
    $('rv-tiles').innerHTML = f.tiles.map(function (t) {
      return '<div class="tile"><small>' + esc(t.label) + '</small><b>' + (t.pct ? pct(t.value, 0) : fmtN(t.value)) + '</b><div>' + esc(t.sub || '') + '</div><div>' + chgTxt(t.chg, t.chgKind) + ' <span style="font-size:12px">vs ' + esc(c.prior_quarter) + '</span></div></div>';
    }).join('');
    $('rv-stm').innerHTML = f.statements.filter(Boolean).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    $('rv-ck').innerHTML = '<span class="st ok">' + f.pass + ' pass</span> <span class="st ' + (f.fail ? 'bad' : 'off') + '">' + f.fail + ' fail</span> <span class="st warn">' + f.review + ' review</span>';
    $('rv-checks').innerHTML = f.checks.map(function (k) {
      var cls = k.result === 'PASS' ? 'ok' : k.result === 'FAIL' ? 'bad' : k.result === 'REVIEW' ? 'warn' : 'off';
      return '<tr><td>' + k.n + '</td><td>' + esc(k.label) + '<br><span class="fname">' + esc(k.why || '') + '</span></td><td class="n">' + fmtN(k.a) + '</td><td class="n">' + fmtN(k.b) + '</td><td><span class="st ' + cls + '">' + esc(k.result || '') + '</span></td></tr>';
    }).join('');
    var top = function (l) { return l.map(function (b, i) { return '<tr><td>' + (i + 1) + '</td><td>' + esc(b.name || '') + '</td><td class="n">' + fmtN(b.count) + '</td><td class="n">' + pct(b.pct) + '</td></tr>'; }).join(''); };
    $('rv-billers').innerHTML = top(f.billers); $('rv-banks').innerHTML = top(f.banks);
    $('rv-qoq').innerHTML = f.qoq.map(function (q) {
      var v = function (x) { return q.pct ? pct(x) : fmtN(x); };
      return '<tr><td>' + esc(q.label) + '</td><td class="n">' + v(q.cur) + '</td><td class="n">' + v(q.prior) + '</td><td class="n">' + (q.pct ? chgTxt(q.chg, 'pts') : (typeof q.chg === 'number' ? (q.chg > 0 ? '▲ ' : q.chg < 0 ? '▼ ' : '') + fmtN(Math.abs(q.chg)) : esc(q.chg || ''))) + '</td><td class="n">' + (q.pct ? '' : chgTxt(q.pchg, 'pct')) + '</td></tr>';
    }).join('');
    $('btn-save').disabled = f.fail > 0;
    $('save-msg').innerHTML = f.fail > 0 ? '<span class="k-warn">' + f.fail + ' check(s) FAIL. Fix the inputs (see Checks below), then create the report again. The workbook cannot be saved while a check fails.</span>' : 'Saves “' + esc(D.fileName(c.quarter) + (R.synthetic ? ' (TEST DATA)' : '')) + '.xlsx” to Product Management › DRB Usage › Outputs.';
    $('synth').classList.toggle('hide', !R.synthetic);
    showTab(!!R.dashOk);
    $('c-review').classList.remove('hide'); $('c-review').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  $('btn-save').addEventListener('click', function () {
    var R = S.result; if (!R || R.fig.fail) return;
    var name = D.fileName(R.cfg.quarter) + (R.synthetic ? ' (TEST DATA)' : '') + '.xlsx';
    $('btn-save').disabled = true; $('save-msg').textContent = 'Saving…';
    R.wb.toBlob().then(function (blob) { return F.save(name, blob, 'DRB Usage'); }).then(function (r) {
      $('save-msg').innerHTML = r.where === 'folder' ? 'Saved <b>' + esc(r.name) + '</b> in ' + esc(r.folder) + '. Next quarter, it is read for the comparison.' : 'Downloaded <b>' + esc(r.name) + '</b>' + (r.error ? ' (' + esc(r.error) + ')' : '') + '. Keep it in your portal folder under Product Management › DRB Usage › Outputs for next quarter.';
      $('btn-save').disabled = false;
    }, function (e) { $('save-msg').textContent = 'Could not save: ' + (e && e.message || e); $('btn-save').disabled = false; });
  });

  F.ready.then(loadQuarter);
  F.onChange(function () { loadQuarter(); });
  };
})(window);
