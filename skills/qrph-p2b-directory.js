/* skills/qrph-p2b-directory.js: QR Ph P2B Biller Directory (Product Management › RIB).
   Port of the Claude skill "qrph-p2b-directory" (scripts/build_directory.py). Same rules, same warnings,
   same Word layout: the SBA letterhead templates in data/qrph-templates.js are filled row by row.
   Twice a month: BancNet/InstaPay "P2B Biller Masterlist" .xlsx -> "QR PH P2B List of Billers (as of …)". */
(function (root) {
  'use strict';
  var P = root.Portal;
  var W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

  var CANON = ['Agriculture', 'Automotive', 'Banking/Finance', 'Cable/Internet', 'Construction', 'Credit Cards', 'Electric Utilities', 'FMCG',
    'Healthcare', 'Insurance', 'IT Provider', 'Loans', 'Manufacturing', 'Organization', 'Organization/Foundation', 'Others', 'Payment Gateway',
    'Petroleum/Oil', 'Real Estate', 'Retailer', 'Schools', 'Services', 'Telecoms', 'Transportation/Logistics', 'Travel', 'Travel/Leisure',
    'Water Utilities', 'Wholesale/Retail'];
  var CANON_MAP = {};
  CANON.forEach(function (c) { CANON_MAP[cf(c)] = c; });
  CANON_MAP.school = 'Schools';
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var STATUS_LABEL = { 'new': 'New biller', updated: 'Updated details', existing: '' };

  /* ---------- helpers (Python semantics) ---------- */
  function cf(s) { return String(s).toLowerCase(); }                       // str.casefold for Latin text
  function cmp(a, b) { a = cf(a); b = cf(b); return a < b ? -1 : a > b ? 1 : 0; }
  function sortByName(list) { return list.slice().sort(function (a, b) { return cmp(a.name, b.name); }); }
  function pyStr(v) { return v === null || v === undefined ? 'None' : String(v); }
  function isDigits(s) { return /^\d+$/.test(s); }
  function esc(s) { return P.ui.esc(s); }

  function normCode(v) {
    if (v === null || v === undefined) return '';
    var s = String(v).trim();
    if (isDigits(s) && s.length < 4) s = ('0000' + s).slice(-4);
    else if (isDigits(s) && s.length > 4 && s.charAt(0) === '0') { s = s.replace(/^0+/, ''); while (s.length < 4) s = '0' + s; }   // '01172' -> '1172'
    return s;
  }
  function normCat(v, warnings, name) {
    var raw = v === null || v === undefined ? '' : String(v).trim(), c = CANON_MAP[cf(raw)];
    if (c === undefined) { warnings.push("Unknown category '" + raw + "' for " + name + ' (kept as-is)'); return raw; }
    return c;
  }
  function cell(grid, addr) {
    var m = /^([A-Z])(\d+)$/.exec(addr), row = grid[+m[2] - 1] || [];
    var v = row[m[1].charCodeAt(0) - 65];
    return v === undefined ? null : v;
  }

  /* ---------- read the masterlist (read_masterlist) ---------- */
  function readMasterlist(book) {
    var ws = book.grids && book.grids['List of Billers'];
    if (!ws) throw new Error('Sheet "List of Billers" not found in ' + book.name + '. Is this the P2B Biller Masterlist?');
    var hdr = -1, cols = {};
    for (var r = 0; r < Math.min(30, ws.length); r++) {
      var vals = (ws[r] || []).map(function (c) { return c === null || c === undefined ? '' : String(c).trim(); });
      if (vals.indexOf('Biller_Display_Name') >= 0) { hdr = r; vals.forEach(function (v, i) { if (v) cols[cf(v)] = i; }); break; }
    }
    if (hdr < 0) throw new Error("Header row with 'Biller_Display_Name' not found in 'List of Billers' (" + book.name + ').');
    ['biller_display_name', 'biller_category', 'biller_code'].forEach(function (k) { if (!(k in cols)) throw new Error("Column '" + k + "' not found in 'List of Billers' (" + book.name + ').'); });
    if (!('qr ph' in cols)) throw new Error("'QR Ph' column not found (" + book.name + ').');
    var ci = { name: cols.biller_display_name, cat: cols.biller_category, code: cols.biller_code, qr: cols['qr ph'] };
    var rows = [];
    for (r = hdr + 1; r < ws.length; r++) {
      var row = ws[r] || [], n = row[ci.name];
      if (n === null || n === undefined || String(n).trim() === '') continue;
      var q = row[ci.qr];
      rows.push({ name: String(n).trim(), cat_raw: row[ci.cat] === undefined ? null : row[ci.cat], code_raw: row[ci.code] === undefined ? null : row[ci.code],
        qr: (q === null || q === undefined || q === '' || q === 0 || q === false ? '' : String(q)).trim().toUpperCase() });
    }
    var s = book.grids.Summary;
    if (!s) throw new Error('Sheet "Summary" not found in ' + book.name + '.');
    var summary = { new_total: cell(s, 'E6'), upd_total: cell(s, 'E7'), new_qr: cell(s, 'C6'), upd_qr: cell(s, 'C7'), dereg_qr: cell(s, 'C8'), total_qr: cell(s, 'C10'), advisory_no: cell(s, 'C3') };
    var synthetic = s.concat(ws.slice(0, 5)).some(function (row) { return (row || []).some(function (c) { return /synthetic test data/i.test(String(c || '')); }); });
    return { rows: rows, summary: summary, b3: cell(s, 'B3'), name: book.name, synthetic: synthetic };
  }

  function parseAsof(ml) {
    var txt = ml.b3 instanceof Date ? '' : pyStr(ml.b3 === null ? '' : ml.b3);
    var m = /([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/.exec(txt);
    if (m) return { month: m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase(), day: +m[2], year: +m[3] };
    m = /(\d{4})-(\d{2})-(\d{2})/.exec(ml.name || '');
    if (m) return { month: MONTHS[+m[2] - 1], day: +m[3], year: +m[1] };
    if (ml.b3 instanceof Date) return { month: MONTHS[ml.b3.getMonth()], day: ml.b3.getDate(), year: ml.b3.getFullYear() };
    throw new Error("Could not find the 'as of' date in Summary!B3 or in the file name (" + ml.name + ').');
  }
  function num(v) { var n = Number(v); return isFinite(n) ? Math.trunc(n) : 0; }

  /* ---------- the list (build_rows); pure ---------- */
  function buildRows(base, ov) {
    ov = ov || {};
    var lower = function (a) { var o = {}; (a || []).forEach(function (x) { o[cf(x)] = true; }); return o; };
    var excl = lower(ov.exclude), fnew = lower(ov.forceNew), fupd = lower(ov.forceUpdated), finc = lower(ov.include);
    var any = function (o) { return Object.keys(o).length > 0; };
    var ml = base.current, summ = ml.summary, warnings = [];
    var nt = num(summ.new_total || 0), ut = num(summ.upd_total || 0);
    var seen = {}, out = [];
    ml.rows.forEach(function (r, i) {
      var key = cf(r.name);
      if (excl[key]) return;
      if (r.qr !== 'Y') {
        if (!finc[key]) return;
        warnings.push('Included although Excel QR Ph = ' + (r.qr || 'blank') + ': ' + r.name);
      }
      if (seen[key]) { warnings.push('Duplicate QR biller name skipped: ' + r.name); return; }
      seen[key] = true;
      var status = i < nt ? 'new' : (i < nt + ut ? 'updated' : 'existing');
      if (fnew[key]) status = 'new'; else if (fupd[key]) status = 'updated';
      var code = normCode(r.code_raw), rawS = pyStr(r.code_raw).trim();
      if (rawS !== code && isDigits(rawS)) warnings.push('Code padded ' + pyStr(r.code_raw) + ' -> ' + code + ' (' + r.name + ')');
      out.push({ name: r.name, category: normCat(r.cat_raw, warnings, r.name), code: code, status: status });
    });
    var nw = sortByName(out.filter(function (x) { return x.status === 'new'; }));
    var up = sortByName(out.filter(function (x) { return x.status === 'updated'; }));
    var rest = sortByName(out.filter(function (x) { return x.status === 'existing'; }));
    var fin = nw.concat(up, rest);
    var given = function (v) { return v !== null && v !== undefined; };
    var checks = { new_qr_found: nw.length, new_qr_summary: summ.new_qr, updated_qr_found: up.length, updated_qr_summary: summ.upd_qr, total_found: fin.length, total_qr_summary: summ.total_qr };
    if (given(summ.new_qr) && nw.length !== Number(summ.new_qr) && !any(fnew)) warnings.push('New QR count ' + nw.length + ' != Summary ' + summ.new_qr);
    if (given(summ.upd_qr) && up.length !== Number(summ.upd_qr) && !any(fupd)) warnings.push('Updated QR count ' + up.length + ' != Summary ' + summ.upd_qr);
    if (given(summ.total_qr) && fin.length !== Number(summ.total_qr) && !any(excl) && !any(finc)) warnings.push('Total QR count ' + fin.length + ' != Summary ' + summ.total_qr);
    var diff = null;
    if (base.previous) {
      var pq = {}, cq = {}, flagged = {};
      base.previous.rows.forEach(function (r) { if (r.qr === 'Y') pq[cf(r.name)] = r.name; });
      fin.forEach(function (x) { cq[cf(x.name)] = true; });
      nw.concat(up).forEach(function (x) { flagged[cf(x.name)] = true; });
      var added = fin.filter(function (x) { return !(cf(x.name) in pq); }).map(function (x) { return x.name; }).sort(cmp);
      var removed = Object.keys(pq).filter(function (k) { return !cq[k]; }).map(function (k) { return pq[k]; }).sort(cmp);
      diff = { added_vs_previous: added, removed_vs_previous: removed };
      var notFlagged = added.filter(function (a) { return !flagged[cf(a)]; });
      if (notFlagged.length) warnings.push('In current QR list but not previous, yet not flagged new/updated: ' + notFlagged.join('; '));
    }
    var d = base.asof;
    return { rows: fin, meta: { month: d.month, day: d.day, year: d.year, advisory_no: summ.advisory_no, checks: checks,
      'new': nw.map(function (x) { return x.name; }), updated: up.map(function (x) { return x.name; }), previous_diff: diff, warnings: warnings } };
  }

  /** inputs.masterlist / inputs.previous are parsed Excel books. Pure: no DOM. */
  function analyze(inputs) {
    var cur = readMasterlist(inputs.masterlist);
    var prev = inputs.previous ? readMasterlist(inputs.previous) : null;
    var base = { current: cur, previous: prev, asof: parseAsof(cur) };
    return { base: base, overrides: { forceNew: [], forceUpdated: [], exclude: [], include: [] }, synthetic: cur.synthetic || !!(prev && prev.synthetic) };
  }
  function result(m) { return buildRows(m.base, m.overrides); }
  function asofText(meta) { return meta.month + ' ' + meta.day + ', ' + meta.year; }
  function fileName(meta) { return 'List of QR Ph P2B list of billers_' + asofText(meta); }

  /* ---------- Word (.docx) from the letterhead template (render) ---------- */
  function kids(el, local) { return Array.prototype.filter.call(el.childNodes, function (n) { return n.nodeType === 1 && n.namespaceURI === W && n.localName === local; }); }
  function setCellText(doc, tc, text) {
    var p = kids(tc, 'p')[0], runs = kids(p, 'r');
    if (!runs.length) { var r = doc.createElementNS(W, 'w:r'); r.appendChild(doc.createElementNS(W, 'w:t')); p.appendChild(r); runs = [r]; }
    var t = kids(runs[0], 't')[0];
    if (!t) { t = doc.createElementNS(W, 'w:t'); runs[0].appendChild(t); }
    t.textContent = text;
    if (text !== text.trim() || text.indexOf('  ') >= 0) t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
    runs.slice(1).forEach(function (x) { p.removeChild(x); });
  }
  function rowFill(tr) {
    var shd = tr.getElementsByTagNameNS(W, 'shd')[0];
    return shd ? (shd.getAttributeNS(W, 'fill') || 'auto').toUpperCase() : 'AUTO';
  }
  function hasDrawing(r) { return r.getElementsByTagNameNS(W, 'drawing').length > 0; }

  /** -> Promise<{ xml, zip }>: the filled document.xml and the template zip. */
  function fillTemplate(res, test) {
    var rows = res.rows, meta = res.meta;
    var hasUpd = rows.some(function (x) { return x.status === 'updated'; }), hasNew = rows.some(function (x) { return x.status === 'new'; });
    var T = root.SBA_QRPH_TEMPLATES;
    if (!T || !root.JSZip) return Promise.reject(new Error('The Word templates did not load (data/qrph-templates.js, vendor/jszip.min.js).'));
    return root.JSZip.loadAsync(hasUpd ? T.newAndUpdated : T.newOnly, { base64: true }).then(function (zip) {
      return zip.file('word/document.xml').async('string').then(function (src) {
        var doc = new DOMParser().parseFromString(src, 'application/xml'), body = kids(doc.documentElement, 'body')[0];
        var p0 = Array.prototype.filter.call(body.childNodes, function (n) { return n.nodeType === 1; })[0];
        var textRuns = kids(p0, 'r').filter(function (r) { return !hasDrawing(r) && kids(r, 't').length; });
        kids(textRuns[0], 't')[0].textContent = (test ? '[TEST DATA] ' : '') + 'QR PH P2B List of Billers (as of ' + asofText(meta) + ')';
        textRuns.slice(1).forEach(function (r) { p0.removeChild(r); });
        if (!hasNew && !hasUpd) kids(p0, 'r').filter(hasDrawing).forEach(function (r) { p0.removeChild(r); });
        var tbl = kids(body, 'tbl')[0], trs = kids(tbl, 'tr'), protos = {};
        trs.slice(1).forEach(function (tr) {
          var f = rowFill(tr);
          protos[f === 'FFFF00' ? 'new' : f === 'F4B083' ? 'updated' : 'existing'] = tr;
          tbl.removeChild(tr);
        });
        rows.forEach(function (x) {
          var tr = protos[x.status].cloneNode(true), tcs = kids(tr, 'tc');
          setCellText(doc, tcs[0], x.name); setCellText(doc, tcs[1], x.category); setCellText(doc, tcs[2], x.code);
          tbl.appendChild(tr);
        });
        var xml = new XMLSerializer().serializeToString(doc);
        if (!/^<\?xml/.test(xml)) xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' + xml;
        return { xml: xml, zip: zip };
      });
    });
  }
  function buildDocx(m) {
    var res = result(m);
    return fillTemplate(res, m.synthetic).then(function (o) {
      o.zip.file('word/document.xml', o.xml, { createFolders: false });
      return o.zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    }).then(function (blob) { return { blob: blob, ext: 'docx' }; });
  }

  /* ---------- PDF: print-ready page with the letterhead (user picks "Save as PDF") ---------- */
  function printHtml(m) {
    var res = result(m), meta = res.meta;
    var hasUpd = res.rows.some(function (x) { return x.status === 'updated'; }), hasNew = res.rows.some(function (x) { return x.status === 'new'; });
    var T = root.SBA_QRPH_TEMPLATES;
    return root.JSZip.loadAsync(T.newAndUpdated, { base64: true }).then(function (zip) {
      return Promise.all([zip.file('word/media/image2.jpeg').async('base64'), zip.file('word/media/image3.png').async('base64')]);
    }).then(function (img) {
      /* Layout measured from the official Word-to-PDF directory: Letter page, 1in side margins, Calibri 11pt,
         table 4.13 / 1.72 / 0.93in, header row on page 1 only, numbering inside the name cell. */
      var legend = (hasNew ? '<span><i style="background:#ffff00"></i>— New Biller</span>' : '') + (hasUpd ? '<span><i style="background:#f4b083"></i>— Updated Biller Details</span>' : '');
      return '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(fileName(meta)) + '</title><style>' +
        '@page{size:letter portrait;margin:0}*{box-sizing:border-box}html,body{margin:0;background:#fff;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
        'body{font-family:Calibri,Carlito,"Segoe UI",Arial,sans-serif;font-size:11pt}' +
        'table.page{width:8.5in;border-collapse:collapse}table.page>thead td,table.page>tfoot td,table.page>tbody>tr>td{padding:0}' +
        '.head{height:1.532in;overflow:hidden;width:8.5in}.head img{display:block;width:8.854in;margin-left:-.354in}' +   /* Word crops the letterhead to its top 13.4% (srcRect b=86626) */
        '.head-space{height:.47in}.foot-space{height:1in}.foot{position:fixed;bottom:.4in;left:0;width:8.5in}.foot img{display:block;width:8.49in;margin-left:.01in}' +
        '.content{padding:0 0 0 1in}.title{position:relative;width:6.79in;height:.45in}.title.two{height:.62in}' +
        '.title h1{position:absolute;left:0;top:.02in;font-size:12pt;font-weight:bold;margin:0}' +
        '.legend{position:absolute;right:0;top:.12in;display:flex;flex-direction:column;gap:2pt;font-size:11pt;font-weight:bold}.legend span{display:flex;align-items:center;gap:6pt}' +
        '.legend i{display:inline-block;width:.17in;height:.13in;border:.75pt solid #000}' +
        'table.list{width:6.79in;table-layout:fixed;border-collapse:collapse}table.list td{border:.5pt solid #000;padding:0 5.4pt;height:15.5pt;vertical-align:middle;white-space:pre;overflow:hidden}' +
        'table.list td.c{text-align:center}table.list tr{break-inside:avoid}table.list tr.hd td{background:#2f5496;color:#fff;font-weight:bold}' +
        'table.list .no{display:inline-block;width:.46in;margin-left:-.055in;padding-right:.25in;text-align:right;white-space:nowrap}' +
        'tr.new td{background:#ffff00}tr.updated td{background:#f4b083}.test{position:absolute;left:0;top:-.22in;margin:0;color:#b42318;font-weight:bold;font-size:9pt}' +
        '.bar{position:fixed;top:10px;right:10px;font:13px Arial}@media screen{body{width:8.5in;margin:0 auto;box-shadow:0 0 12px rgba(0,0,0,.25)}}@media print{.bar{display:none}}</style></head><body>' +
        '<div class="bar"><button onclick="print()">Print / Save as PDF</button></div>' +
        '<div class="foot"><img src="data:image/png;base64,' + img[1] + '" alt=""></div>' +
        '<table class="page"><thead><tr><td><div class="head"><img src="data:image/jpeg;base64,' + img[0] + '" alt="Sterling Bank of Asia"></div><div class="head-space"></div></td></tr></thead>' +
        '<tfoot><tr><td><div class="foot-space"></div></td></tr></tfoot><tbody><tr><td><div class="content">' +
        '<div class="title' + (hasNew && hasUpd ? ' two' : '') + '">' + (m.synthetic ? '<p class="test">TEST DATA: made from a synthetic practice masterlist. Do not circulate.</p>' : '') +
        '<h1>QR PH P2B List of Billers (as of ' + esc(asofText(meta)) + ')</h1><div class="legend">' + legend + '</div></div>' +
        '<table class="list"><colgroup><col style="width:4.13in"><col style="width:1.72in"><col style="width:.94in"></colgroup><tbody>' +
        '<tr class="hd"><td>Biller Display Name</td><td class="c">Biller Category</td><td class="c">Biller Code</td></tr>' +
        res.rows.map(function (x, i) { return '<tr class="' + x.status + '"><td><span class="no">' + (i + 1) + '.</span>' + esc(x.name) + '</td><td class="c">' + esc(x.category) + '</td><td class="c">' + esc(x.code) + '</td></tr>'; }).join('') +
        '</tbody></table></div></td></tr></tbody></table><script>window.onload=function(){setTimeout(function(){print()},300)}<\/script></body></html>';
    });
  }
  function openPdf(m) {
    var w = root.open('', '_blank');
    if (!w) return Promise.reject(new Error('The browser blocked the new window. Allow pop-ups for this page, then try again.'));
    w.document.write('<p style="font:14px Arial;padding:20px">Preparing the PDF version…</p>');
    return printHtml(m).then(function (html) { w.document.open(); w.document.write(html); w.document.close(); }, function (e) { w.close(); throw e; });
  }

  /* ---------- Excel check sheet ---------- */
  function buildExcel(m) {
    var res = result(m), M = res.meta, c = M.checks;
    return { sheets: [
      { name: 'Directory', cols: [6, 46, 24, 10, 22], rows: [['QR PH P2B List of Billers (as of ' + asofText(M) + ')'], m.synthetic ? ['TEST DATA - synthetic practice masterlist'] : [], ['#', 'Biller Display Name', 'Biller Category', 'Biller Code', 'Highlight']]
        .concat(res.rows.map(function (x, i) { return [i + 1, x.name, x.category, x.code, STATUS_LABEL[x.status]]; })) },
      { name: 'Checks', cols: [36, 14, 14], rows: [['Masterlist', m.base.current.name], ['Previous masterlist', m.base.previous ? m.base.previous.name : '(not given)'], ['Advisory no.', M.advisory_no], [],
        ['Check', 'Found', 'Excel Summary'], ['New QR billers', c.new_qr_found, c.new_qr_summary], ['Updated QR billers', c.updated_qr_found, c.updated_qr_summary], ['Total QR billers', c.total_found, c.total_qr_summary], [],
        ['Manual changes'], ['Marked new', m.overrides.forceNew.join('; ')], ['Marked updated', m.overrides.forceUpdated.join('; ')], ['Left out', m.overrides.exclude.join('; ')], ['Added although QR Ph = N', m.overrides.include.join('; ')], [],
        ['Warnings']].concat(M.warnings.map(function (w) { return [w]; })) }
    ] };
  }

  /* ---------- review screen ---------- */
  var current = null;
  function okMark(found, summ) { return summ === null || summ === undefined ? '<span class="muted">not in Summary</span>' : (Number(summ) === found ? '<b class="q-ok">✓ matches</b>' : '<b class="q-bad">✗ Summary says ' + esc(summ) + '</b>'); }
  function names(list) { return list.length ? '<ul class="q-names">' + list.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>' : '<p class="muted">None.</p>'; }
  function renderScreen(m) {
    current = m;
    return '<div class="q-screen" id="q-screen">' + screenBody(m) + '</div>';
  }
  function screenBody(m) {
    var res = result(m), M = res.meta, c = M.checks, d = M.previous_diff, ov = m.overrides;
    var ovList = [['forceNew', 'Marked new'], ['forceUpdated', 'Marked updated'], ['exclude', 'Left out'], ['include', 'Added (QR Ph = N)']]
      .map(function (k) { return ov[k[0]].map(function (n) { return '<span class="q-chip">' + esc(k[1]) + ': <b>' + esc(n) + '</b> <button type="button" data-q-undo="' + k[0] + '" data-q-name="' + esc(n) + '" aria-label="Undo">×</button></span>'; }).join(''); }).join('');
    return (m.synthetic ? '<div class="ir-danger"><b>Practice file (synthetic).</b> The outputs are marked TEST DATA. Do not circulate them.</div>' : '') +
      '<div class="q-kpis"><div><small>As of</small><b>' + esc(asofText(M)) + '</b></div><div><small>QR Ph billers</small><b>' + c.total_found + '</b></div>' +
      '<div><small>New</small><b>' + c.new_qr_found + '</b></div><div><small>Updated</small><b>' + c.updated_qr_found + '</b></div><div><small>Advisory no.</small><b>' + esc(M.advisory_no === null || M.advisory_no === undefined ? '-' : M.advisory_no) + '</b></div></div>' +
      '<div class="q-cols"><section><h3>Counts against the Excel Summary sheet</h3><table><tr><th>Check</th><th>Found</th><th>Result</th></tr>' +
      '<tr><td>New QR billers</td><td>' + c.new_qr_found + '</td><td>' + okMark(c.new_qr_found, c.new_qr_summary) + '</td></tr>' +
      '<tr><td>Updated QR billers</td><td>' + c.updated_qr_found + '</td><td>' + okMark(c.updated_qr_found, c.updated_qr_summary) + '</td></tr>' +
      '<tr><td>Total QR billers</td><td>' + c.total_found + '</td><td>' + okMark(c.total_found, c.total_qr_summary) + '</td></tr></table>' +
      '<h3>New billers (yellow)</h3>' + names(M['new']) + '<h3>Updated billers (orange)</h3>' + names(M.updated) + '</section>' +
      '<section><h3>Compare with the P2B Biller Advisory email</h3><ul class="q-check">' +
      '<li>The advisory’s <b>New Billers</b> with QR Ph = Y are the same as the new billers listed here.</li>' +
      '<li>The advisory’s Summary <b>Total Billers</b> (QR Ph) is <b>' + c.total_found + '</b>.</li>' +
      '<li>No biller under <b>For Deregistration</b> is still in the list.</li>' +
      '<li>For <b>Existing Biller for Updating</b>, the QR Ph flags match the Excel. If they differ, the Excel wins; use the changes box below only if you decide otherwise.</li></ul>' +
      (d ? '<h3>Changes since the previous masterlist</h3><p><b>Added (' + d.added_vs_previous.length + '):</b> ' + (esc(d.added_vs_previous.join('; ')) || 'none') + '</p><p><b>Dropped (' + d.removed_vs_previous.length + '):</b> ' + (esc(d.removed_vs_previous.join('; ')) || 'none') + '</p>'
        : '<p class="muted">Add the previous masterlist to also see which billers were added or dropped since last time.</p>') +
      (M.warnings.length ? '<h3>Warnings (' + M.warnings.length + ')</h3><ul class="q-warn">' + M.warnings.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>' : '<h3>Warnings</h3><p class="q-ok">None.</p>') + '</section></div>' +
      '<section class="q-ov no-print"><h3>Changes to the list (only if the advisory says so)</h3><div class="q-ov-row"><input type="search" id="q-find" placeholder="Find a biller in the masterlist" autocomplete="off"><ul id="q-hits" class="q-hits"></ul></div>' +
      (ovList ? '<div class="q-chips">' + ovList + '</div>' : '<p class="muted">No changes. The list follows the Excel exactly.</p>') + '</section>' +
      '<h3>Preview (' + res.rows.length + ' billers)</h3><table class="q-list"><thead><tr><th>#</th><th>Biller Display Name</th><th>Biller Category</th><th>Biller Code</th></tr></thead><tbody>' +
      res.rows.map(function (x, i) { return '<tr class="q-' + x.status + '"><td>' + (i + 1) + '</td><td>' + esc(x.name) + '</td><td>' + esc(x.category) + '</td><td>' + esc(x.code) + '</td></tr>'; }).join('') + '</tbody></table>';
  }
  function redraw() { var s = document.getElementById('q-screen'); if (s && current) { s.innerHTML = screenBody(current); } }
  function hits(q) {
    var box = document.getElementById('q-hits'); if (!box) return;
    q = cf(q.trim());
    if (q.length < 2) { box.innerHTML = ''; return; }
    var res = result(current), inList = {};
    res.rows.forEach(function (x) { inList[cf(x.name)] = x.status; });
    var found = current.base.current.rows.filter(function (r) { return cf(r.name).indexOf(q) >= 0; }).slice(0, 12);
    box.innerHTML = found.length ? found.map(function (r) {
      var st = inList[cf(r.name)], acts = st ? [['forceNew', 'Mark new'], ['forceUpdated', 'Mark updated'], ['exclude', 'Leave out']] : [['include', 'Add to list']];
      return '<li><span><b>' + esc(r.name) + '</b> <small>QR Ph ' + esc(r.qr || 'blank') + (st ? ' · in list' + (STATUS_LABEL[st] ? ' (' + STATUS_LABEL[st].toLowerCase() + ')' : '') : ' · not in list') + '</small></span>' +
        acts.map(function (a) { return '<button type="button" class="btn" data-q-act="' + a[0] + '" data-q-name="' + esc(r.name) + '">' + a[1] + '</button>'; }).join('') + '</li>';
    }).join('') : '<li class="muted">No biller with that name in the masterlist.</li>';
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('click', function (e) {
      if (!current) return;
      var a = e.target.closest('[data-q-act]'), u = e.target.closest('[data-q-undo]');
      if (a) {
        var k = a.getAttribute('data-q-act'), n = a.getAttribute('data-q-name'), ov = current.overrides;
        ['forceNew', 'forceUpdated', 'exclude', 'include'].forEach(function (x) { if (x !== 'include' || k === 'exclude') ov[x] = ov[x].filter(function (y) { return cf(y) !== cf(n); }); });
        if (ov[k].indexOf(n) < 0) ov[k].push(n);
        redraw();
      } else if (u) {
        var key = u.getAttribute('data-q-undo'), nm = u.getAttribute('data-q-name');
        current.overrides[key] = current.overrides[key].filter(function (y) { return y !== nm; });
        redraw();
      }
    });
    document.addEventListener('input', function (e) { if (e.target.id === 'q-find' && current) hits(e.target.value); });
  }

  /* ---------- registration ---------- */
  P.registerSkill({
    id: 'qrph-p2b-directory',
    title: 'QR Ph P2B Biller Directory',
    group: 'RIB',
    status: 'ready',
    description: 'Alphabetized "QR PH P2B List of Billers" on SBA letterhead (Word and PDF) from the BancNet/InstaPay biller masterlist.',
    inputs: [
      { key: 'masterlist', label: 'P2B Biller Masterlist (this period)', type: 'excel', required: true,
        help: 'The "P2B Biller Masterlist-As of YYYY-MM-DD.xlsx" downloaded from the HUB (15th and month-end). Practice file: samples/qrph-p2b/.' },
      { key: 'previous', label: 'Previous masterlist (optional)', type: 'excel',
        help: 'Last period’s masterlist. Used only to show which billers were added or dropped.' }
    ],
    params: [],
    validate: function (inputs) {
      try { var m = analyze(inputs); result(m); return []; } catch (e) { return [String(e && e.message || e)]; }
    },
    analyze: analyze,
    screenPrint: false,
    outputs: [
      { key: 'screen', label: 'Review', format: 'html', render: renderScreen },
      { key: 'docx', label: 'Word directory (.docx)', format: 'file', filename: function (m) { return fileName(result(m).meta) + (m.synthetic ? ' (TEST DATA)' : ''); }, render: buildDocx },
      { key: 'pdf', label: 'PDF version', format: 'action', note: 'Opens a print-ready page; choose Save as PDF.', run: openPdf },
      { key: 'excel', label: 'Check sheet (Excel)', format: 'excel', filename: function (m) { return 'QR Ph P2B check sheet_' + asofText(result(m).meta) + (m.synthetic ? ' (TEST DATA)' : ''); }, render: buildExcel }
    ]
  });

  /* exposed for checks only */
  root.__SBA_QRPH = { analyze: analyze, buildRows: buildRows, readMasterlist: readMasterlist, fillTemplate: fillTemplate, result: result, printHtml: printHtml };
})(typeof window !== 'undefined' ? window : globalThis);
