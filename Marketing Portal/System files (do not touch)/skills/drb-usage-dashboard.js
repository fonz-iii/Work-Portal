/* skills/drb-usage-dashboard.js — DRB Usage dashboard (module 3).
   Classic script, loaded after skills/drb-usage.js. No libraries, no network: inline SVG only.
   DRB.dashboardData(wb, opts) -> plain JSON object read from the CALCULATED workbook (no DOM, no recomputing).
   DRB.renderDashboard(el, data, opts) -> draws a one-page summary (KPIs, CIF enrollees, QoQ, top transaction types, top billers, key points). opts: { save(name, blob) -> Promise, actions: true } */
(function (root) {
  'use strict';
  var DRB = root.DRB = root.DRB || {};

  /* =====================================================================
     1. Data: every figure is a cell (or defined name) of the calculated workbook
     ===================================================================== */
  DRB.dashboardData = function (wb, opts) {
    opts = opts || {};
    var XC = root.XlsxCalc;   // same error test DRB.figures uses
    var isErr = function (v) { return XC && XC.isErr ? XC.isErr(v) : (v && typeof v === 'object'); };
    var g = function (sh, ref) { var v = wb.value(sh, ref); return isErr(v) || v === undefined ? null : v === '' ? null : v; };
    var nv = function (n) { var c = wb.calc, r = c.names[n.toUpperCase()]; if (!r) return null; var v = c.cellValue(r.sheet, r.r1, r.c1); return isErr(v) ? null : v === '' ? null : v; };
    var C = function (sh, r, cols) { return cols.split('').map(function (c) { return g(sh, c + r); }); };
    var findRow = function (sh, col, text, from, to) { for (var r = from || 1; r <= (to || 200); r++) if (g(sh, col + r) === text) return r; return -1; };
    var fig = DRB.figures(wb);

    var checks = fig.checks.map(function (c) { return { n: c.n, label: c.label, a: c.a, b: c.b, result: c.result, why: c.why }; });
    var tk = ['enrol', 'active', 'fin', 'txn', 'drb_avg', 'cards'];
    var tl = ['Enrolment rate', 'Active users', 'CIFs with financial transactions', 'Successful financial transactions', 'DRB monthly average fund transfers', 'Transactions from cards'];
    var tiles = fig.tiles.map(function (t, i) { return { key: tk[i], label: tl[i], value: t.value, kind: t.pct ? 'pct' : 'num', sub: t.sub, chg: typeof t.chg === 'number' ? t.chg : 'n/a', chgKind: t.chgKind }; });

    // Usage: C10:D12 enrolment; C18:H21 groups; C49:H53 two ways of counting
    var U = 'Usage', grp = function (r) { var x = C(U, r, 'CDEFGH'); return { n: x[0], pct: x[1], prior: x[2], prior_pct: x[3], chg: x[4], pchg: x[5] }; };
    var fin = grp(18), lin = grp(19), act = grp(20), ina = grp(21);
    var usage = { total: g(U, 'C10'), enrolled: g(U, 'C11'), enrol_pct: g(U, 'C12'), not_enrolled: g(U, 'C13'),
      fin: fin.n, login: lin.n, active: act.n, inactive: ina.n, fin_pct: fin.pct, login_pct: lin.pct, active_pct: act.pct, inactive_pct: ina.pct, any: g(U, 'E49'), cif_usage: g(U, 'C40'),
      prior: { total: g(U, 'D10'), enrolled: g(U, 'D11'), enrol_pct: g(U, 'D12'), fin: fin.prior, login: lin.prior, active: act.prior, inactive: ina.prior,
        fin_pct: fin.prior_pct, login_pct: lin.prior_pct, active_pct: act.prior_pct, inactive_pct: ina.prior_pct, any: g(U, 'H49'), cif_usage: g(U, 'E40') },
      two_ways: [49, 50, 51, 52].map(function (r) { var x = C(U, r, 'BCDEFGH'); return { label: x[0], report: x[1], report_pct: x[2], rd: x[3], rd_pct: x[4], prior_report: x[5], prior_rd: x[6] }; }),
      two_ways_diff: { now: g(U, 'C53'), prior: g(U, 'G53') } };

    // Profile: gender B10:G11; generation from row 18 to 'Total with known age'; active/idle and staff tables found by header
    var PR = 'Profile', gender = [10, 11].map(function (r) { var x = C(PR, r, 'BCDEFG'); return { k: x[0], n: x[1], pct: x[2], prior_n: x[3], prior_pct: x[4], chg: x[5] }; });
    var gEnd = findRow(PR, 'B', 'Total with known age', 18), gens = [];
    var aiHead = findRow(PR, 'C', 'Active', gEnd + 1), stHead = -1;
    for (var r0 = aiHead + 1; r0 < aiHead + 40; r0++) if (g(PR, 'B' + r0) === 'Staff tag' && g(PR, 'C' + r0)) { stHead = r0; break; }   // header row, not the section title
    for (var r = 18; r < gEnd; r++) { var gi = aiHead + 1 + (r - 18); gens.push({ k: g(PR, 'B' + r), born: g(PR, 'C' + r), fin: g(PR, 'F' + r), pct: g(PR, 'G' + r), active: g(PR, 'C' + gi), idle: g(PR, 'E' + gi), total: g(PR, 'G' + gi) }); }
    var staff = []; if (stHead > 0) for (r = stHead + 1; g(PR, 'B' + r) && g(PR, 'B' + r) !== 'Total'; r++) staff.push({ k: g(PR, 'B' + r), fin: g(PR, 'C' + r), fin_pct: g(PR, 'D' + r), active: g(PR, 'E' + r), idle: g(PR, 'F' + r), total: g(PR, 'G' + r) });
    var profile = { gender: gender, gender_unknown: g(PR, 'C13'), generation: gens, generation_unknown: g(PR, 'F' + (gEnd + 1)), staff: staff };

    // Transactions: header row 17 (months D:F); financial rows from 18 to 'Financial transactions'
    var T = 'Transactions', tEnd = findRow(T, 'C', 'Financial transactions', 18), types = [];
    for (r = 18; r < tEnd; r++) { var y = C(T, r, 'CDEFGHIJK'); types.push({ type: y[0], m: [y[1], y[2], y[3]], total: y[4], pct: y[5], prior: y[6], chg: y[7], pchg: y[8] }); }
    var ts = C(T, tEnd, 'DEFGIJK');
    var txn = { months: C(T, 17, 'DEF'), total: ts[3], prior_total: ts[4], chg: ts[5], pchg: ts[6], m: [ts[0], ts[1], ts[2]], by_type: types };

    // Channels: B10:L13 by channel; B32:G35 rails; B41:F46 amount ranges
    var CH = 'Channels', chRow = function (r) { var x = C(CH, r, 'BCDEFGHIJKL'); return { k: x[0], m: [x[1], x[2], x[3]], total: x[4], avg: x[5], share: x[6], prior_avg: x[7], prior_share: x[8], chg: x[9], pchg: x[10] }; };
    var cht = chRow(13);
    var channels = { months: C(CH, 9, 'CDE'), series: [10, 11, 12].map(chRow), total: { m: cht.m, avg: cht.avg, prior_avg: cht.prior_avg, chg: cht.chg, pchg: cht.pchg },
      rails: [32, 33, 34].map(function (r) { var x = C(CH, r, 'BCDEFG'); return { k: x[0], n: x[1], share: x[2], prior: x[3], chg: x[4], pchg: x[5] }; }),
      rails_total: (function (x) { return { n: x[0], prior: x[1], chg: x[2], pchg: x[3] }; })(C(CH, 35, 'CEFG')),
      ranges: [41, 42, 43, 44, 45].map(function (r) { var x = C(CH, r, 'BCDEF'); return { k: x[0], instapay: x[1], instapay_pct: x[2], pesonet: x[3], pesonet_pct: x[4] }; }),
      ranges_total: { instapay: g(CH, 'C46'), pesonet: g(CH, 'E46') } };

    // Billers_Banks: billers C10:E16 (+ C18:E18 others, D19 total); banks C25:E29 (+ C30:E30, D31)
    var BB = 'Billers_Banks', top = function (r0, n) { var out = []; for (var i = 0; i < n; i++) { var x = C(BB, r0 + i, 'CDE'); if (x[0]) out.push({ name: x[0], n: x[1], pct: x[2] }); } return out; };
    var billers = { total: g(BB, 'D19'), items: top(10, 7), others: { label: g(BB, 'C18'), n: g(BB, 'D18'), pct: g(BB, 'E18') } };
    var banks = { total: g(BB, 'D31'), items: top(25, 5), others: { label: g(BB, 'C30'), n: g(BB, 'D30'), pct: g(BB, 'E30') } };

    // QR: B10:H16 by type; C18 activation; B25:F31 by month (months C24:E24)
    var QS = 'QR', qt = C(QS, 16, 'CEGH');
    var qr = { total: qt[0], prior: qt[1], chg: qt[2], pchg: qt[3], activation: g(QS, 'C18'),
      types: [10, 11, 12, 13, 14, 15].map(function (r) { var x = C(QS, r, 'BCDEFGH'); return { k: x[0], n: x[1], pct: x[2], prior: x[3], prior_pct: x[4], chg: x[5], pchg: x[6] }; }),
      months: C(QS, 24, 'CDE'), by_month: [25, 26, 27, 28, 29, 30].map(function (r) { var x = C(QS, r, 'BCDE'); return { k: x[0], m: [x[1], x[2], x[3]] }; }), month_total: C(QS, 31, 'CDE') };

    // Cards: rows from 10 to 'Total transactions from cards', then prior / change / % change below it
    var K = 'Cards', kEnd = findRow(K, 'B', 'Total transactions from cards', 10), kt = [];
    for (r = 10; r < kEnd; r++) kt.push({ k: g(K, 'B' + r), n: g(K, 'C' + r), pct: g(K, 'D' + r) });
    var cards = { total: g(K, 'C' + kEnd), prior: g(K, 'C' + (kEnd + 1)), chg: g(K, 'C' + (kEnd + 2)), pchg: g(K, 'C' + (kEnd + 3)), cards: nv('k_cards'), by_type: kt };

    return {
      meta: { quarter: nv('in_q'), prior_quarter: nv('in_pq'), period: nv('in_period'), asof: nv('in_asof'), synthetic: !!opts.synthetic,
        months: [nv('in_m1'), nv('in_m2'), nv('in_m3')], prior_months: C('Data_Channels', 7, 'DEF') },
      checks: { pass: fig.pass, fail: fig.fail, review: fig.review, items: checks },
      tiles: tiles, statements: fig.statements.filter(function (s) { return s; }),
      usage: usage, profile: profile, txn: txn, channels: channels, billers: billers, banks: banks, qr: qr, cards: cards,
      qoq: fig.qoq.map(function (q) { return { label: q.label, cur: q.cur, prior: q.prior, chg: q.chg, pchg: q.pchg, pct: q.pct }; })
    };
  };

  /* =====================================================================
     2. Formatting (same number formats as the workbook)
     ===================================================================== */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function num(v) { return isNum(v) ? (Math.round(v) === 0 ? '–' : Math.round(v).toLocaleString('en-US')) : 'n/a'; }   // #,##0;-#,##0;"–"
  function pct(v, dp) { return isNum(v) ? (v * 100).toFixed(dp == null ? 1 : dp) + '%' : 'n/a'; }                         // 0.0%
  function chg(v, kind) {   // kind: 'pts' | 'pct' | 'num'; n/a = no badge
    if (!isNum(v)) return '<span class="na">n/a</span>';
    var t = kind === 'pts' ? Math.abs(v).toFixed(1) + ' pts' : kind === 'pct' ? (Math.abs(v) * 100).toFixed(1) + '%' : Math.round(Math.abs(v)).toLocaleString('en-US');
    if (t === '0.0 pts' || t === '0.0%' || t === '0') return '<span class="chg flat">–</span>';
    return v > 0 ? '<span class="chg up">▲ ' + t + '</span>' : '<span class="chg down">▼ ' + t + '</span>';
  }
  /* always-light palette (portal: reports and print stay light), so text never sits on a same-colour background */
  var COL = { navy: '#163560', blue: '#1f5fbf', light: '#9db7da', grey: '#c7ccd4', gold: '#f0b323', grid: '#e6eaf0' };
  function svg(w, h, body, label) { return '<svg class="ch" viewBox="0 0 ' + w + ' ' + h + '" width="100%" role="img" aria-label="' + esc(label) + '">' + body + '</svg>'; }
  function tx(x, y, s, a, cls) { return '<text x="' + x + '" y="' + y + '"' + (a ? ' text-anchor="' + a + '"' : '') + (cls ? ' class="' + cls + '"' : '') + '>' + esc(s) + '</text>'; }
  function niceMax(v) { if (!(v > 0)) return 1; var p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; }
  function legend(items) { return '<div class="lg">' + items.map(function (i) { return '<span><i class="' + (i[2] ? 'tick' : '') + '" style="background:' + i[1] + '"></i>' + esc(i[0]) + '</span>'; }).join('') + '</div>'; }

  /* ranked horizontal bars; optional prior-quarter tick; value (+ share) printed beside every bar on white */
  function rank(items, o) {
    o = o || {}; var W = 620, LW = o.lw || 250, rh = 30, H = items.length * rh + 4, VW = 120;
    var max = niceMax(Math.max.apply(null, items.map(function (d) { return Math.max(d.v || 0, isNum(d.p) ? d.p : 0); }).concat([1])));
    var pw = W - LW - VW, x = function (v) { return LW + Math.max(0, v) / max * pw; }, s = '';
    items.forEach(function (d, i) {
      var y = 2 + i * rh;
      s += tx(LW - 10, y + 19, d.label.length > 32 ? d.label.slice(0, 31) + '…' : d.label, 'end', 'lb');
      s += '<rect x="' + LW + '" y="' + (y + 7) + '" width="' + Math.max(2, x(d.v) - LW) + '" height="16" rx="3" fill="' + (d.c || COL.navy) + '"><title>' + esc(d.label + ': ' + num(d.v)) + '</title></rect>';
      if (isNum(d.p)) s += '<rect x="' + (x(d.p) - 1.5) + '" y="' + (y + 3) + '" width="3" height="24" rx="1" fill="' + COL.gold + '"><title>' + esc(d.label + ', prior quarter: ' + num(d.p)) + '</title></rect>';
      s += tx(Math.max(x(d.v), isNum(d.p) ? x(d.p) : 0) + 8, y + 19, num(d.v) + (d.share != null ? '  ·  ' + pct(d.share) : ''), null, 'vl');
    });
    return svg(W, H, s, o.label || 'Ranked bars') + (o.prior ? legend([[o.cur || 'This quarter', COL.navy], [o.prior + ' (marker)', COL.gold, 1]]) : '');
  }
  /* pie: % inside a slice only when it fits (dark text on light slices); count and % for every slice in the legend */
  function pie(parts, o) {
    o = o || {}; var R = 92, c = 100, tot = parts.reduce(function (a, p) { return a + (isNum(p.v) && p.v > 0 ? p.v : 0); }, 0), a0 = -Math.PI / 2, s = '';
    if (!tot) return '<p class="nt">n/a</p>';
    parts.forEach(function (p) {
      if (!(isNum(p.v) && p.v > 0)) return;
      var f = p.v / tot, a1 = a0 + f * 2 * Math.PI, t = esc(p.k + ': ' + num(p.v) + (isNum(p.p) ? ' (' + pct(p.p) + ')' : ''));
      if (f > 0.9999) s += '<circle cx="' + c + '" cy="' + c + '" r="' + R + '" fill="' + p.c + '"><title>' + t + '</title></circle>';
      else s += '<path d="M' + c + ',' + c + 'L' + (c + R * Math.cos(a0)).toFixed(2) + ',' + (c + R * Math.sin(a0)).toFixed(2) + 'A' + R + ',' + R + ' 0 ' + (f > 0.5 ? 1 : 0) + ' 1 ' + (c + R * Math.cos(a1)).toFixed(2) + ',' + (c + R * Math.sin(a1)).toFixed(2) + 'Z" fill="' + p.c + '" stroke="#fff" stroke-width="2"><title>' + t + '</title></path>';
      if (f >= 0.08 && isNum(p.p)) { var am = (a0 + a1) / 2; s += tx((c + R * 0.6 * Math.cos(am)).toFixed(1), (c + R * 0.6 * Math.sin(am) + 5).toFixed(1), pct(p.p, 0), 'middle', p.dk ? 'in dk' : 'in'); }
      a0 = a1;
    });
    return '<div class="pie">' + svg(200, 200, s, o.label || 'Pie chart') + '<ul class="pl">' + parts.map(function (p) {
      return '<li><i style="background:' + p.c + '"></i><span>' + esc(p.k) + '</span><b>' + num(p.v) + (isNum(p.p) ? '<em>' + pct(p.p) + '</em>' : '') + '</b></li>'; }).join('') + '</ul></div>';
  }
  /* single-series columns, value above each column */
  function cols(cats, vals, o) {
    o = o || {}; var W = 400, H = 230, T = 22, B = 28, pw = W, ph = H - T - B, s = '';
    var max = niceMax(Math.max.apply(null, vals.map(function (v) { return v || 0; }).concat([1]))), gw = pw / cats.length, bw = Math.min(70, gw * 0.55);
    for (var k = 1; k <= 4; k++) s += '<line x1="0" x2="' + W + '" y1="' + (T + ph - ph * k / 4) + '" y2="' + (T + ph - ph * k / 4) + '" stroke="' + COL.grid + '"/>';
    s += '<line x1="0" x2="' + W + '" y1="' + (T + ph) + '" y2="' + (T + ph) + '" stroke="#c9d1dc"/>';
    cats.forEach(function (c, i) {
      var v = vals[i] || 0, h = v / max * ph, bx = i * gw + (gw - bw) / 2;
      s += '<rect x="' + bx + '" y="' + (T + ph - h) + '" width="' + bw + '" height="' + h + '" rx="3" fill="' + (i === cats.length - 1 ? COL.navy : COL.light) + '"><title>' + esc(c + ': ' + num(v)) + '</title></rect>';
      s += tx(bx + bw / 2, T + ph - h - 7, num(v), 'middle', 'vl') + tx(i * gw + gw / 2, H - 8, c, 'middle', 'lb');
    });
    return svg(W, H, s, o.label || 'Columns');
  }
  function table(head, rows, o) {
    o = o || {};
    return '<table class="t' + (o.cls ? ' ' + o.cls : '') + '"><thead><tr>' + head.map(function (h, i) { return '<th' + (i ? ' class="n"' : '') + '>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr' + (r.total ? ' class="tot"' : '') + '>' + r.c.map(function (c, i) { return '<td' + (i ? ' class="n"' : '') + '>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
  }
  function panel(id, title, note, body, span) { return '<section class="pn s' + (span || 12) + '" id="' + id + '"><header><h2>' + esc(title) + '</h2>' + (note ? '<p class="nt">' + note + '</p>' : '') + '</header>' + body + '</section>'; }
  var cap = function (m) { return m ? String(m).charAt(0) + String(m).slice(1, 3).toLowerCase() : ''; };

  /* the quarter-on-quarter rows shown (labels exactly as on the QoQ sheet) */
  DRB.DASH_QOQ = ['Total CIFs', 'Total enrolled CIFs', 'Enrolment rate', 'Active users', 'Have financial transactions', 'Inactive (not logged in for > 90 days)',
    'Successful financial transactions', 'Fund transfers to other banks (DRB)', 'QR transactions (excluding activation)', 'Transactions from cards'];

  /* =====================================================================
     3. Render: a one-page summary of the workbook
        KPIs · CIF enrollees · quarter on quarter · top transaction types (+ by month) · top billers · key points + checks
     ===================================================================== */
  DRB.renderDashboard = function (el, d, opts) {
    opts = opts || {}; injectCss(el.ownerDocument || document);
    var m = d.meta, ck = d.checks, u = d.usage, up = u.prior || {}, pq = m.prior_quarter, h = [];
    var q = {}; (d.qoq || []).forEach(function (r) { q[r.label] = r; });
    var tile = function (key) { for (var i = 0; i < d.tiles.length; i++) if (d.tiles[i].key === key) return d.tiles[i]; return {}; };

    // header
    h.push('<header class="hd"><div><p class="ey">Sterling Bank Online · Digital Retail Banking</p><h1>DRB Usage ' + esc(m.quarter) + '</h1>' +
      '<p class="mt">' + esc(m.period) + ' · compared with ' + esc(pq) + ' · CIF figures as of ' + esc(m.asof) + '</p></div><div class="hr">' +
      (m.synthetic ? '<span class="badge">TEST DATA</span>' : '') +
      '<span class="st ok">' + ck.pass + ' pass</span><span class="st ' + (ck.fail ? 'bad' : 'off') + '">' + ck.fail + ' fail</span><span class="st warn">' + ck.review + ' review</span>' +
      (opts.actions === false ? '' : '<span class="acts"><button type="button" class="btn primary" data-act="print">Print / Save as PDF</button><button type="button" class="btn" data-act="save">Save dashboard (HTML)</button></span>') + '</div></header>');
    if (ck.fail) h.push('<div class="banner" role="alert"><b>' + ck.fail + ' check' + (ck.fail === 1 ? ' fails' : 's fail') + ': figures not for use.</b> See Checks below.</div>');

    // KPIs (4)
    var en = q['Total enrolled CIFs'] || {}, kp = [
      { label: 'Total enrolled CIFs', value: num(en.cur), sub: 'of ' + num(u.total) + ' total CIFs', c: chg(en.pchg, 'pct') },
      { label: 'Enrolment rate', value: pct(tile('enrol').value, 0), sub: tile('enrol').sub, c: chg(tile('enrol').chg, 'pts') },
      { label: 'Active users', value: pct(tile('active').value, 0), sub: tile('active').sub, c: chg(tile('active').chg, 'pts') },
      { label: 'Successful financial transactions', value: num(tile('txn').value), sub: tile('txn').sub, c: chg(tile('txn').chg, 'pct') }];
    h.push('<div class="kp">' + kp.map(function (k) { return '<div class="kt"><span class="kl">' + esc(k.label) + '</span><span class="kv">' + k.value + '</span><span class="ks">' + esc(k.sub) + '</span><span class="kc">' + k.c + ' vs ' + esc(pq) + '</span></div>'; }).join('') + '</div>');

    h.push('<div class="grid">');
    // CIF enrollees
    h.push(panel('d-enrol', 'CIF enrollees', 'Active users = have financial transactions + have logged in to their accounts.',
      '<div class="pies">' +
      '<div><h3>Total CIFs</h3>' + pie([{ k: 'Enrolled', v: u.enrolled, p: u.enrol_pct, c: COL.navy }, { k: 'Not enrolled', v: u.not_enrolled, p: null, c: COL.grey, dk: 1 }], { label: 'Enrolled vs not enrolled' }) + '</div>' +
      '<div><h3>Enrolled CIFs</h3>' + pie([{ k: 'Have financial transactions', v: u.fin, p: u.fin_pct, c: COL.navy }, { k: 'Have logged in to their accounts', v: u.login, p: u.login_pct, c: COL.blue },
        { k: 'Inactive (not logged in for > 90 days)', v: u.inactive, p: u.inactive_pct, c: COL.light, dk: 1 }], { label: 'Enrolled CIFs by usage group' }) + '</div></div>', 7));
    // quarter on quarter
    h.push(panel('d-qoq', 'Quarter on quarter', 'Rates in percentage points (pts); counts in % change.',
      table(['Measure', m.quarter, pq, 'Change'], DRB.DASH_QOQ.filter(function (l) { return q[l]; }).map(function (l) {
        var r = q[l]; return { c: [esc(l), r.pct ? pct(r.cur) : num(r.cur), r.pct ? pct(r.prior) : num(r.prior), r.pct ? chg(r.chg, 'pts') : chg(r.pchg, 'pct')] };
      }), { cls: 'qoq' }), 5));
    // top transaction types + by month
    var t = d.txn, types = t.by_type.slice().sort(function (a, b) { return (b.total || 0) - (a.total || 0); }), top = types.slice(0, 5);
    h.push(panel('d-types', 'Top transaction types', 'Successful financial transactions: ' + num(t.total) + ' (' + chg(t.pchg, 'pct') + ' vs ' + esc(pq) + '). Top ' + top.length + ' of ' + types.length + ' types; share = % of financial transactions.',
      rank(top.map(function (x) { return { label: x.type, v: x.total, p: x.prior, share: x.pct }; }), { prior: pq, cur: m.quarter, label: 'Top transaction types' }), 7));
    h.push(panel('d-month', 'Transactions by month', 'Successful financial transactions, ' + esc(m.period) + '.',
      cols((t.months || m.months || []).map(cap), t.m, { label: 'Successful financial transactions by month' }), 5));
    // top billers
    var b = d.billers;
    h.push(panel('d-billers', 'Top billers', 'Successful bills payments: ' + num(b.total) + '. Share = % of bills payments.',
      rank(b.items.map(function (x) { return { label: x.name, v: x.n, share: x.pct }; }).concat(b.others && isNum(b.others.n) ? [{ label: b.others.label, v: b.others.n, share: b.others.pct, c: COL.grey }] : []), { label: 'Top billers' }), 7));
    // key points + checks
    var open = ck.items.filter(function (x) { return x.result === 'FAIL' || x.result === 'REVIEW'; });
    var keys = [0, 1, 4].map(function (i) { return d.statements[i]; }).filter(function (s) { return s; });
    h.push(panel('d-points', 'Key points', 'From the workbook\'s Summary sheet.',
      '<ul class="kpts">' + keys.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>' +
      '<details class="ckd"' + (ck.fail ? ' open' : '') + '><summary>Checks: ' + ck.pass + ' pass, ' + ck.fail + ' fail, ' + ck.review + ' review' + (open.length ? ' · show ' + open.length : '') + '</summary>' +
      (open.length ? '<ul class="ckl">' + open.map(function (x) { return '<li><span class="st ' + (x.result === 'FAIL' ? 'bad' : 'warn') + '">' + esc(x.result) + '</span> ' + esc(x.label) + '</li>'; }).join('') + '</ul>' : '') + '</details>', 5));
    h.push('</div><p class="ft">Summary of “DRB Usage ' + esc(m.quarter) + ' - Worked Figures.xlsx”. Every figure is read from the workbook; the full detail is in its sheets.</p>');

    el.classList.add('drbd'); el.innerHTML = h.join('');
    if (opts.actions !== false) el.querySelector('.acts').addEventListener('click', function (e) {
      var a = e.target.getAttribute('data-act'); if (!a) return;
      if (a === 'print') window.print();
      if (a === 'save') DRB.saveDashboardHtml(el, d, opts);
    });
    return el;
  };

  /* one self-contained HTML file: the dashboard's markup + its CSS, no scripts */
  DRB.saveDashboardHtml = function (el, d, opts) {
    var m = d.meta, name = 'DRB Usage ' + m.quarter + ' - Dashboard' + (m.synthetic ? ' (TEST DATA)' : '') + '.html';
    var copy = el.cloneNode(true), a = copy.querySelector('.acts'); if (a) a.parentNode.removeChild(a);
    var html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(name.replace(/\.html$/, '')) +
      '</title><style>body{margin:0;background:#f4f6fa}' + CSS + '</style></head><body><div class="' + esc(copy.className) + '" style="max-width:1200px;margin:0 auto;padding:24px 32px">' + copy.innerHTML + '</div></body></html>';
    var blob = new Blob([html], { type: 'text/html' });
    var dl = function () { var u = URL.createObjectURL(blob), l = document.createElement('a'); l.href = u; l.download = name; document.body.appendChild(l); l.click(); setTimeout(function () { URL.revokeObjectURL(u); l.remove(); }, 1000); };
    if (opts && typeof opts.save === 'function') return Promise.resolve(opts.save(name, blob)).catch(dl);
    dl(); return Promise.resolve();
  };

  /* =====================================================================
     4. Scoped CSS: fixed light colours (portal rule for reports), portal font stack, A4 landscape print
     ===================================================================== */
  var CSS = [
    '.drbd{color:#1a2433;font:14px/1.5 "Segoe UI",system-ui,-apple-system,Roboto,"Helvetica Neue",Arial,sans-serif;background:transparent}',
    '.drbd *{box-sizing:border-box}.drbd h1,.drbd h2,.drbd h3,.drbd p,.drbd ul{margin:0}',
    '.drbd .hd{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;gap:12px 20px;padding:20px 24px;background:#fff;border:1px solid #e3e8ef;border-top:4px solid #0d2240;border-radius:10px;margin-bottom:16px}',
    '.drbd .ey{font-size:11.5px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:#5b6676}.drbd h1{font-size:24px;font-weight:700;letter-spacing:-.02em;color:#0d2240;margin:2px 0}.drbd .mt{font-size:13px;color:#5b6676}',
    '.drbd .hr{display:flex;flex-wrap:wrap;align-items:center;gap:6px}.drbd .acts{display:flex;gap:8px;margin-left:8px}',
    '.drbd .badge{font-size:11px;font-weight:700;letter-spacing:.08em;padding:3px 10px;border-radius:4px;background:#fdf4dc;color:#8a6100;border:1px solid #f0c75e}',
    '.drbd .btn{font:inherit;font-size:13px;font-weight:600;min-height:36px;padding:6px 16px;border-radius:999px;border:1px solid #cdd5e0;background:#fff;color:#0b1a2e;cursor:pointer}.drbd .btn:hover{border-color:#1f5fbf}',
    '.drbd .btn.primary{background:#1f5fbf;border-color:#1f5fbf;color:#fff}.drbd .btn.primary:hover{background:#174c9a}.drbd .btn:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(31,95,191,.3)}',
    '.drbd .banner{background:#fdecea;border:1px solid #f3c7c2;color:#b42318;border-radius:8px;padding:10px 14px;margin-bottom:16px}',
    '.drbd .kp{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}',
    '.drbd .kt{display:flex;flex-direction:column;gap:2px;padding:16px 18px;background:#fff;border:1px solid #e3e8ef;border-radius:10px;border-left:4px solid #163560}',
    '.drbd .kl{font-size:11.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#5b6676}.drbd .kv{font-size:30px;font-weight:700;letter-spacing:-.02em;line-height:1.2;color:#0d2240;font-variant-numeric:tabular-nums}',
    '.drbd .ks{font-size:12.5px;color:#5b6676}.drbd .kc{font-size:12.5px;color:#5b6676;margin-top:4px}',
    '.drbd .chg{font-weight:700;white-space:nowrap}.drbd .chg.up{color:#1d7a4f}.drbd .chg.down{color:#b42318}.drbd .chg.flat,.drbd .na{color:#5b6676}',
    '.drbd .grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:16px}.drbd .s7{grid-column:span 7}.drbd .s5{grid-column:span 5}.drbd .s12{grid-column:1/-1}',
    '.drbd .pn{min-width:0;background:#fff;border:1px solid #e3e8ef;border-radius:10px;padding:18px 20px}.drbd .pn header{margin-bottom:12px}',
    '.drbd .pn h2{font-size:15px;font-weight:700;color:#0d2240}.drbd .nt{font-size:12.5px;color:#5b6676;margin-top:2px}.drbd h3{font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#5b6676;margin-bottom:8px}',
    '.drbd svg.ch{display:block;width:100%;height:auto;max-width:600px}.drbd svg text{font-family:inherit;font-size:12.5px;fill:#1a2433}.drbd svg .lb{fill:#1a2433}.drbd svg .vl{fill:#0d2240;font-weight:700;font-variant-numeric:tabular-nums}',
    '.drbd svg .in{fill:#fff;font-weight:700;font-size:15px}.drbd svg .in.dk{fill:#0d2240}',
    '.drbd .pies{display:grid;grid-template-columns:1fr 1fr;gap:20px}.drbd .pie svg.ch{max-width:170px;margin:0 auto 10px}',
    '.drbd .pl{list-style:none;padding:0;font-size:12.5px}.drbd .pl li{display:flex;align-items:baseline;gap:8px;padding:5px 0;border-top:1px solid #eef1f6}.drbd .pl i{width:10px;height:10px;border-radius:2px;flex:none;align-self:center}',
    '.drbd .pl span{flex:1;min-width:0;color:#1a2433}.drbd .pl b{font-weight:700;color:#0d2240;white-space:nowrap;font-variant-numeric:tabular-nums}.drbd .pl em{font-style:normal;font-weight:400;color:#5b6676;margin-left:6px}',
    '.drbd .lg{display:flex;flex-wrap:wrap;gap:4px 16px;font-size:12px;color:#5b6676;margin-top:8px}.drbd .lg i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;vertical-align:-1px}.drbd .lg i.tick{width:3px;height:12px}',
    '.drbd .t{width:100%;border-collapse:collapse;font-size:13px}.drbd .t th{text-align:left;font-size:11.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#5b6676;padding:0 8px 8px;border-bottom:2px solid #0d2240}',
    '.drbd .t td{padding:7px 8px;border-bottom:1px solid #eef1f6;color:#1a2433}.drbd .t th.n,.drbd .t td.n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.drbd .t th:first-child,.drbd .t td:first-child{padding-left:0}.drbd .t th:last-child,.drbd .t td:last-child{padding-right:0}',
    '.drbd .kpts{padding-left:18px;font-size:13px}.drbd .kpts li{margin-bottom:8px}',
    '.drbd .ckd{margin-top:12px;padding-top:10px;border-top:1px solid #eef1f6;font-size:12.5px}.drbd .ckd summary{cursor:pointer;color:#1f5fbf;font-weight:600}.drbd .ckl{list-style:none;padding:0;margin-top:8px}.drbd .ckl li{padding:4px 0}',
    '.drbd .st{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:600;padding:2px 9px;border-radius:999px;white-space:nowrap}.drbd .st::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}',
    '.drbd .st.ok{background:#e8f5ee;color:#1d7a4f}.drbd .st.bad{background:#fdecea;color:#b42318}.drbd .st.warn{background:#fdf3e3;color:#9a5800}.drbd .st.off{background:#eef1f6;color:#5b6676}',
    '.drbd .ft{font-size:12px;color:#5b6676;margin-top:14px}',
    '@media (max-width:1000px){.drbd .kp{grid-template-columns:repeat(2,minmax(0,1fr))}.drbd .s7,.drbd .s5{grid-column:1/-1}}',
    '@media (max-width:560px){.drbd .kp,.drbd .pies{grid-template-columns:minmax(0,1fr)}.drbd .kv{font-size:26px}.drbd .hd,.drbd .pn{padding:16px}.drbd .acts{margin-left:0}}',
    '@media print{@page{size:A4 landscape;margin:9mm}.drbd{font-size:11.5px;-webkit-print-color-adjust:exact;print-color-adjust:exact}.drbd .acts{display:none}',
    '.drbd .kp{grid-template-columns:repeat(4,minmax(0,1fr))!important;margin-bottom:10px}.drbd .grid{gap:10px}.drbd .s7{grid-column:span 7!important}.drbd .s5{grid-column:span 5!important}',
    '.drbd .pn,.drbd .kt,.drbd .hd{break-inside:avoid}.drbd .hd{margin-bottom:8px;padding:8px 14px;border-top-width:3px}.drbd h1{font-size:19px}.drbd .pn{padding:9px 12px}.drbd .pn header{margin-bottom:6px}',
    '.drbd .kt{padding:8px 12px}.drbd .kv{font-size:21px}.drbd .pie svg.ch{max-width:104px;margin-bottom:4px}.drbd .pl li{padding:2px 0}.drbd .pies{gap:12px}',
    '.drbd .t{font-size:11px}.drbd .t td{padding:3px 6px}.drbd .t th{padding:0 6px 4px}.drbd .kpts li{margin-bottom:4px}.drbd .ft{margin-top:6px}.drbd #d-enrol{grid-column:span 5!important}.drbd #d-qoq{grid-column:span 7!important}.drbd .t td,.drbd .pl{line-height:1.3}}'
  ].join('');

  function injectCss(doc) {
    if (doc.getElementById('drbd-css')) return;
    var s = doc.createElement('style'); s.id = 'drbd-css'; s.textContent = CSS; doc.head.appendChild(s);
  }
  DRB.dashboardCss = CSS;
})(typeof window !== 'undefined' ? window : globalThis);
