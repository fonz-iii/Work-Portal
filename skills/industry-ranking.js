/* skills/industry-ranking.js — Industry Ranking (thrift banks).
   Port of the sba-industry-ranking Claude skill: parse_bsp.py + compute.py + build_deck_html.py + qoq_slopes.py
   + build_report.js, minus the UKB view, the watch list, the thin-cushion rule and the Recommendations slide
   (Fons, 2026-10-06). Inputs: the BSP "Ranking as to ..." pages saved as PDF (this quarter and the previous one;
   the previous quarter may also come from an old "Industry Ranking as of ..." workbook, top 10 only).
   Settings live in data/industry-ranking-config.js; logos in data/brand-logos.js.
   Every figure is computed here; renderers only lay out formatted strings. */
(function (root) {
  'use strict';
  var P = root.Portal, CFG = root.SBA_IR_CONFIG;
  if (!CFG) { console.error('industry-ranking: data/industry-ranking-config.js is not loaded'); return; }
  var SBA = CFG.sba_name, MINUS = '−', BR = CFG.brand;
  var METRICS = CFG.metrics, SUFFIXES = CFG.name_suffixes.slice().sort(function (a, b) { return b.length - a.length; });
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  /* ======================= formatting (the only place numbers become strings) ======================= */
  /** Half-up to one decimal on the decimal value, as BSP rounds (compute.py r1). Returns tenths as an integer. */
  function tenths(x) {
    var a = Math.abs(x), s = String(a);
    if (/e/i.test(s)) s = a.toFixed(20);
    var p = s.split('.'), ip = p[0], fp = (p[1] || '') + '00';
    var t = Number(ip) * 10 + Number(fp[0]) + (Number(fp[1]) >= 5 ? 1 : 0);
    return x < 0 ? -t : t;
  }
  function fix1(x) {
    var t = tenths(x), a = Math.abs(t), ip = Math.floor(a / 10), d = a % 10;
    return { neg: t < 0, ip: ip, d: d };
  }
  function groups(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function mn(x) { var f = fix1(x); return (f.neg ? '-' : '') + groups(f.ip) + '.' + f.d; }
  function peso(x) { return '₱' + mn(x) + 'M'; }
  function r1s(x) { var f = fix1(Math.abs(x)); return f.ip + '.' + f.d; }
  function pct(x, sign) {
    var s = r1s(Math.abs(x)) + '%';
    return sign === false ? s : (x >= 0 ? '+' : MINUS) + s;
  }
  function plain(x) { return x >= 0 ? pct(x, false) : pct(x); }
  function art(x) { var s = r1s(Math.abs(x)); return (s[0] === '8' || s.indexOf('11.') === 0 || s.indexOf('18.') === 0) ? 'an' : 'a'; }
  function ordinal(n) { n = +n; var suf = (n % 100 >= 10 && n % 100 <= 20) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'); return n + suf; }
  function longDate(d) { return d.d + ' ' + MONTHS[d.m - 1] + ' ' + d.y; }
  function quarter(d) { return 'Q' + (Math.floor((d.m - 1) / 3) + 1) + ' ' + d.y; }
  function iso(d) { return d.y + '-' + String(d.m).padStart(2, '0') + '-' + String(d.d).padStart(2, '0'); }
  function cmpDate(a, b) { return iso(a) < iso(b) ? -1 : iso(a) > iso(b) ? 1 : 0; }
  function monthsBetween(a, b) { return (b.y - a.y) * 12 + (b.m - a.m); }
  function disp(bank) { return CFG.display_names[bank] || bank.toLowerCase().replace(/(^|[^a-z0-9'])([a-z])/g, function (m, p1, c) { return p1 + c.toUpperCase(); }); }
  function isSub(bank) { return Object.prototype.hasOwnProperty.call(CFG.subsidiaries, bank); }
  function numWord(n) { return n >= 0 && n <= 4 ? ['no', 'one', 'two', 'three', 'four'][n] : String(n); }
  function joinAnd(xs) { return xs.length === 1 ? xs[0] : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]; }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function median(xs) { var a = xs.slice().sort(function (p, q) { return p - q; }), n = a.length; return n ? (n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2) : null; }
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function metricOf(key) { return METRICS.find(function (m) { return m.key === key; }); }
  function bspTitle(key) { return { assets: 'Ranking as to Total Assets', capital: "Ranking as to Total Stockholder's Equity", deposits: 'Ranking as to Total Deposit Liabilities', loans: 'Ranking as to Total Loans and Receivables' }[key]; }

  /* ======================= reading the BSP pages (parse_bsp.py) ======================= */
  var NUM = /^\d{1,3}(,\d{3})*(\.\d+)?$|^\d+(\.\d+)?$/;
  /** BSP's long legal names -> the short key used everywhere else. */
  function stripEnds(s) { return s.replace(/^[ .,\-]+|[ .,\-]+$/g, ''); }
  function canon(name) {
    var s = stripEnds(String(name).replace(/\s+/g, ' ').trim().toUpperCase());
    SUFFIXES.forEach(function (suf) {
      if (s.slice(-suf.length) === suf) { var s2 = stripEnds(s.slice(0, s.length - suf.length)); if (s2) s = s2; }
    });
    s = stripEnds(s.replace(/\s+/g, ' '));
    return CFG.aliases[s] || s;
  }
  function metricFor(title) {
    var t = String(title).toLowerCase();
    var m = METRICS.find(function (x) { return x.match.some(function (k) { return t.indexOf(k) >= 0; }); });
    return m ? m.key : null;
  }
  function parseDate(s) {
    var m = /(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/.exec(String(s));
    if (!m) return null;
    var mi = MONTHS.findIndex(function (x) { return x.slice(0, 3).toLowerCase() === m[2].slice(0, 3).toLowerCase(); });
    return mi < 0 ? null : { d: +m[1], m: mi + 1, y: +m[3] };
  }
  function readPdf(f) {
    var out = { file: f.name, metric: null, group: null, asOf: null, posted: null, rows: [] };
    (f.pages || []).join('\n').split('\n').forEach(function (line) {
      var s = line.trim(); if (!s) return;
      var low = s.toLowerCase();
      if (low.indexOf('ranking as to') === 0 && !out.metric) { out.metric = metricFor(s); out.title = s; }
      else if (low.indexOf('thrift bank group') >= 0) out.group = 'thrift';
      else if (low.indexOf('universal and commercial') >= 0) out.group = 'ukb';
      else if (low.indexOf('as of') === 0 && !out.asOf) out.asOf = parseDate(s);
      else if (low.indexOf('posted as of') === 0) out.posted = parseDate(s);
      else {
        var parts = s.split(/\s+/);
        if (parts.length >= 3 && /^\d+$/.test(parts[0]) && NUM.test(parts[parts.length - 1])) {
          var name = parts.slice(1, -1).join(' ');
          if (name && !NUM.test(name)) out.rows.push({ rank: +parts[0], name: name, amount: +parts[parts.length - 1].replace(/,/g, '') });
        }
      }
    });
    return out;
  }
  /** Old "Industry Ranking as of ..." workbook: the comparison sheet's current-period block, first block per metric. */
  function readWorkbook(f) {
    var sheet = (f.sheetNames || []).find(function (n) { return /\d+-\d{4}\s*vs\s*\d+-\d{4}/.test(n); });
    if (!sheet) return { file: f.name, error: f.name + ' has no comparison sheet (named like "9-2025 vs 3-2026"). Use the BSP PDFs instead.' };
    var rows = f.grids[sheet], seen = {}, cur = {}, cdate = null;
    var isNum = function (v) { return typeof v === 'number'; }, isStr = function (v) { return typeof v === 'string'; };
    var i = 0;
    while (i < rows.length) {
      var r = rows[i] || [];
      var title = r.slice(0, 2).find(function (c) { return isStr(c) && c.toLowerCase().indexOf('ranking as to') === 0; });
      if (!title) { i++; continue; }
      var key = metricFor(title), first = key && !seen[key];
      if (key) seen[key] = true;
      for (var j = i + 1; j < Math.min(i + 7, rows.length); j++) {
        (rows[j] || []).slice(4, 7).forEach(function (c) { if (isStr(c) && c.toLowerCase().indexOf('as of') === 0 && !cdate) cdate = parseDate(c); });
      }
      var k = i + 1;
      while (k < rows.length && !(isNum((rows[k] || [])[0]) && isStr((rows[k] || [])[1]))) { k++; if (k - i > 8) break; }
      while (k < rows.length && isNum((rows[k] || [])[0]) && isStr((rows[k] || [])[1])) {
        var rr = rows[k];
        if (first && isNum(rr[4]) && isStr(rr[5]) && isNum(rr[6])) (cur[key] = cur[key] || []).push({ rank: rr[4], name: rr[5], amount: rr[6] });
        k++;
      }
      i = k + 1;
    }
    return { file: f.name, asOf: cdate, data: cur };
  }

  /** Both boxes -> periods + tables per metric, with plain-language errors and warnings. Pure. */
  function collect(inputs) {
    var errors = [], warnings = [], list = function (v) { return v ? (Array.isArray(v) ? v : [v]) : []; };
    function box(files, label, allowBook) {
      var res = { data: {}, source: {}, files: {}, asOf: null, posted: null, books: [] };
      files.forEach(function (f) {
        if (f.kind === 'excel') {
          if (!allowBook) { errors.push(f.name + ' is a workbook. ' + label + ' needs the four BSP PDFs.'); return; }
          var w = readWorkbook(f);
          if (w.error) errors.push(w.error); else res.books.push(w);
          return;
        }
        if (f.kind !== 'pdf') { errors.push(f.name + ' could not be read as a PDF.'); return; }
        var p = readPdf(f);
        if (p.group === 'ukb') { errors.push(f.name + ' is a universal and commercial bank page. Only thrift bank pages are used; remove it from ' + label + '.'); return; }
        if (!p.metric) { errors.push('Could not tell which ranking ' + f.name + ' is. It should be a BSP "Ranking as to ..." page saved as PDF.'); return; }
        if (!p.rows.length) { errors.push(f.name + ' has no bank rows. Re-save the BSP page as PDF and try again.'); return; }
        if (res.data[p.metric]) { errors.push('Two files in ' + label + ' are the ' + metricOf(p.metric).label + ' ranking (' + res.files[p.metric] + ' and ' + f.name + '). Keep one.'); return; }
        if (p.asOf && res.asOf && cmpDate(p.asOf, res.asOf) !== 0) { errors.push(label + ' mixes periods: ' + f.name + ' is as of ' + longDate(p.asOf) + ' but another file is as of ' + longDate(res.asOf) + '. Each box must hold one quarter.'); return; }
        if (p.asOf) res.asOf = p.asOf;
        if (p.posted && !res.posted) res.posted = p.posted;
        res.data[p.metric] = p.rows; res.source[p.metric] = 'pdf'; res.files[p.metric] = f.name;
      });
      return res;
    }
    var cur = box(list(inputs.current), 'This quarter', false), pri = box(list(inputs.prior), 'Previous quarter', true);
    var missCur = METRICS.filter(function (m) { return !cur.data[m.key]; });
    if (missCur.length) errors.push('This quarter is missing: ' + missCur.map(function (m) { return m.label + ' (BSP "' + bspTitle(m.key) + '")'; }).join('; ') + '.');
    if (!cur.asOf && Object.keys(cur.data).length) errors.push('Could not find the "As of" date in the This quarter PDFs.');
    if (Object.keys(cur.data).length && !cur.posted) errors.push('Could not find the "Posted as of" line at the foot of the This quarter PDFs. Save the whole BSP page, including the last page.');
    // fill prior gaps from a workbook
    pri.books.forEach(function (w) {
      METRICS.forEach(function (m) {
        if (!pri.data[m.key] && w.data[m.key]) {
          if (pri.asOf && w.asOf && cmpDate(pri.asOf, w.asOf) !== 0) { errors.push(w.file + ' is as of ' + longDate(w.asOf) + ' but the Previous quarter PDFs are as of ' + longDate(pri.asOf) + '.'); return; }
          pri.data[m.key] = w.data[m.key]; pri.source[m.key] = 'workbook'; pri.files[m.key] = w.file;
          if (!pri.asOf) pri.asOf = w.asOf;
        }
      });
    });
    var missPri = METRICS.filter(function (m) { return !pri.data[m.key]; });
    if (missPri.length && list(inputs.prior).length) errors.push('Previous quarter is missing: ' + missPri.map(function (m) { return m.label; }).join(', ') + '. Add its BSP PDF, or the old "Industry Ranking as of ..." workbook.');
    if (cur.asOf && pri.asOf && cmpDate(pri.asOf, cur.asOf) >= 0) errors.push('The Previous quarter files (' + longDate(pri.asOf) + ') are not earlier than This quarter (' + longDate(cur.asOf) + '). Check the two boxes are not swapped.');
    return { cur: cur, pri: pri, errors: errors, warnings: warnings };
  }

  /* ======================= analysis (compute.py) ======================= */
  function rankTable(rows) {
    var sorted = rows.slice().sort(function (a, b) { return b.amount - a.amount; }), out = {};
    sorted.forEach(function (r, i) { out[r.bank] = { rank: i + 1, amount: r.amount }; });
    return out;
  }
  function growthLabel(m) { return ({ 3: 'Quarter-on-quarter growth', 6: 'Six-month growth', 9: 'Nine-month growth', 12: 'Year-on-year growth' })[m] || (m + '-month growth'); }

  function analyse(c) {
    var errors = [], warnings = [];
    var cur = c.cur.asOf, pri = c.pri.asOf, posted = c.cur.posted;
    var bankCount = Math.max.apply(null, METRICS.map(function (m) { return (c.cur.data[m.key] || []).length; }));
    var mths = monthsBetween(pri, cur);
    var meta = {
      current_long: longDate(cur), prior_long: longDate(pri), current_q: quarter(cur), prior_q: quarter(pri),
      doc_title: 'Q' + (Math.floor((cur.m - 1) / 3) + 1) + ' Industry Rankings', posting_long: longDate(posted),
      bank_count: bankCount, months: mths, growth_label: growthLabel(mths), is_one_quarter: mths === 3,
      coverage: {}, coverage_prior: {}, prior_source: c.pri.source, files: { cur: c.cur.files, pri: c.pri.files }
    };
    var out = { meta: meta, views: { all: {}, sa: {} } }, unclassified = {};
    METRICS.forEach(function (m) {
      var k = m.key;
      var rc = (c.cur.data[k] || []).map(function (r) { return { rank: r.rank, bank: canon(r.name), amount: r.amount }; });
      var rp = (c.pri.data[k] || []).map(function (r) { return { rank: r.rank, bank: canon(r.name), amount: r.amount }; });
      meta.coverage[k] = rc.length; meta.coverage_prior[k] = rp.length;
      if (rc.length < bankCount) warnings.push(m.label + ': this quarter’s table has ' + rc.length + ' of ' + bankCount + ' banks.');
      if (rp.length && rp.length < bankCount) warnings.push(m.label + ': the previous quarter (' + (c.pri.source[k] === 'workbook' ? 'from the old workbook' : 'PDF') + ') lists only ' + rp.length + ' banks, so growth and the peer median use the ' + rp.length + ' banks in both periods.');
      var names = rc.map(function (r) { return r.bank; });
      var dupes = names.filter(function (n, i) { return names.indexOf(n) !== i; });
      if (dupes.length) errors.push(m.label + ': two rows have the same bank name after cleanup (' + dupes.map(disp).join(', ') + '). Check aliases in data/industry-ranking-config.js.');
      if (names.indexOf(SBA) < 0) { errors.push(m.label + ': Sterling Bank of Asia is not in the ' + longDate(cur) + ' table.'); return; }
      var rt = rankTable(rc);
      rc.forEach(function (r) { if (r.rank && r.rank !== rt[r.bank].rank) errors.push(m.label + ': ' + disp(r.bank) + ' is listed as rank ' + r.rank + ' but its amount puts it ' + rt[r.bank].rank + '. Check the source page.'); });
      var pmap = {}, cmap = {};
      rp.forEach(function (r) { pmap[r.bank] = r.amount; }); rc.forEach(function (r) { cmap[r.bank] = r.amount; });
      names.forEach(function (b) {
        if (!isSub(b) && CFG.stand_alone_confirmed.indexOf(b) < 0) unclassified[b] = true;
        if (pmap[b] > 0 && Math.abs(cmap[b] / pmap[b] - 1) > 0.5) warnings.push(m.label + ': ' + disp(b) + ' moved more than 50% between periods. Confirm it is not a typo or a merger.');
      });
      ['all', 'sa'].forEach(function (view) {
        var vc = view === 'all' ? rc : rc.filter(function (r) { return !isSub(r.bank); });
        var vp = view === 'all' ? rp : rp.filter(function (r) { return !isSub(r.bank); });
        out.views[view][k] = viewMetric(k, m, vc, vp, rc, bankCount, view, warnings);
      });
    });
    var un = Object.keys(unclassified);
    if (un.length) warnings.push('Treated as stand-alone because the settings do not classify them: ' + un.map(disp).sort().join(', ') + '. Add each to "subsidiaries" or "stand_alone_confirmed" in data/industry-ranking-config.js.');
    out.errors = errors; out.warnings = warnings;
    return out;
  }

  function viewMetric(k, m, vc, vp, allCur, bankCount, view, warnings) {
    var rt = rankTable(vc), rp = rankTable(vp);
    var rows = Object.keys(rt).sort(function (a, b) { return rt[a].rank - rt[b].rank; }).map(function (b) {
      var pa = rp[b] ? rp[b].amount : null;
      return { bank: b, display: disp(b), rank: rt[b].rank, amount: rt[b].amount, amount_fmt: mn(rt[b].amount),
        prior_rank: rp[b] ? rp[b].rank : null, prior_amount: pa, growth: pa ? (rt[b].amount / pa - 1) * 100 : null,
        is_sba: b === SBA, subsidiary: isSub(b) };
    });
    var sba = rows.find(function (r) { return r.is_sba; }), sRank = sba.rank;
    var peers = rows.filter(function (r) { return !r.is_sba && r.growth !== null; }).map(function (r) { return r.growth; });
    var med = median(peers);
    var above = rows.find(function (r) { return r.rank === sRank - 1; }), below = rows.find(function (r) { return r.rank === sRank + 1; });
    var move = 'held';
    if (sba.prior_rank) move = sRank < sba.prior_rank ? 'up' : sRank > sba.prior_rank ? 'down' : 'held';
    var n = rows.length, last = Math.max(sRank, Math.min(5, n)), ladder;
    if (last <= 8) ladder = rows.filter(function (r) { return r.rank <= Math.min(last + 1, n); }).map(function (r) { return r.rank; });
    else ladder = [1, 2, 3, 4, 5, 6, null, sRank - 1, sRank].concat(below ? [sRank + 1] : []);
    var ladderRows = ladder.map(function (x) { return x === null ? null : rows.find(function (r) { return r.rank === x; }); });
    var crossings = rows.filter(function (r) { return r.prior_rank && r.prior_rank !== r.rank && r.rank <= 10; })
      .map(function (r) { return { display: r.display, from: ordinal(r.prior_rank), to: ordinal(r.rank), dir: r.rank < r.prior_rank ? 'up' : 'down' }; });
    var src = view === 'all' ? rankTable(allCur) : rt, total = view === 'all' ? bankCount : Object.keys(rt).length;
    var byPos = {}; Object.keys(src).forEach(function (b) { byPos[src[b].rank] = b; });
    var sbaPos = src[SBA].rank, dots = [];
    for (var pos = 1; pos <= total; pos++) { var b = byPos[pos]; dots.push(b === SBA ? 'sba' : !b ? 'unknown' : pos < sbaPos ? 'above' : 'below'); }
    var res = { metric: k, label: m.label, short: m.short, view: view, n_banks: n, rows: rows, ladder: ladderRows, crossings: crossings, dots: dots,
      sba: { rank: sRank, rank_fmt: ordinal(sRank), prior_rank: sba.prior_rank, prior_rank_fmt: sba.prior_rank ? ordinal(sba.prior_rank) : null,
        move: move, amount: sba.amount, amount_fmt: peso(sba.amount), prior_amount: sba.prior_amount,
        prior_amount_fmt: sba.prior_amount ? peso(sba.prior_amount) : null, growth: sba.growth,
        growth_fmt: sba.growth !== null ? pct(sba.growth) : 'n/a', grew: sba.growth !== null && sba.growth >= 0 },
      peer_median: med, peer_median_fmt: med !== null ? pct(med) : 'n/a', peer_median_n: peers.length,
      vs_median: med === null || sba.growth === null ? null : (sba.growth > med ? 'above' : 'below'), above: null, below: null };
    if (above) {
      var gap = above.amount - sba.amount;
      res.above = { display: above.display, rank_fmt: ordinal(above.rank), gap: gap, gap_fmt: peso(gap), gap_pct: gap / sba.amount * 100,
        growth: above.growth, growth_fmt: above.growth !== null ? pct(above.growth) : null };
    }
    if (below) {
      var cush = sba.amount - below.amount;
      res.below = { display: below.display, rank_fmt: ordinal(below.rank), cushion: cush, cushion_fmt: peso(cush),
        growth: below.growth, growth_fmt: below.growth !== null ? pct(below.growth) : null };
    } else if (sRank === n && n < bankCount) {
      warnings.push((view === 'all' ? 'All thrift banks' : 'Stand-alone') + ' / ' + m.label + ': SBA is the last row available, so the lead over the bank below cannot be shown.');
    }
    return res;
  }

  function ratios(out) {
    var A = out.views.all, a = A.assets, c = A.capital, d = A.deposits, l = A.loans, r = {};
    if (a && c && a.sba.prior_amount && c.sba.prior_amount) {
      r.equity_to_assets_prior = c.sba.prior_amount / a.sba.prior_amount * 100; r.equity_to_assets = c.sba.amount / a.sba.amount * 100;
    }
    if (d && l && d.sba.prior_amount && l.sba.prior_amount) {
      r.loans_to_deposits_prior = l.sba.prior_amount / d.sba.prior_amount * 100; r.loans_to_deposits = l.sba.amount / d.sba.amount * 100;
    }
    return r;
  }

  /* ======================= drafted wording (compute.py templates; editable on screen) ======================= */
  function takeaway(v, meta) {
    var s = v.sba, scope = v.view === 'all' ? ' of ' + meta.bank_count : '';
    var verb = { held: 'held ' + s.rank_fmt + scope, up: 'rose to ' + s.rank_fmt + scope, down: 'moved to ' + s.rank_fmt + scope }[s.move];
    var med = v.view === 'all' ? 'median' : 'peer median';
    if (v.peer_median === null || s.growth === null) return 'Sterling Bank of Asia ' + verb;
    if (s.grew) return 'Sterling Bank of Asia ' + verb + ', growing ' + plain(s.growth) + ' against ' + art(v.peer_median) + ' ' + plain(v.peer_median) + ' ' + med;
    var sv = { held: 'held ' + s.rank_fmt, up: 'rose to ' + s.rank_fmt, down: 'moved to ' + s.rank_fmt }[s.move];
    return 'Sterling Bank of Asia ' + sv + '; ' + v.short.toLowerCase() + ' fell ' + pct(Math.abs(s.growth), false) + ' against ' + art(v.peer_median) + ' ' + plain(v.peer_median) + ' ' + med;
  }
  function qoqTakeaway(V, sa) {
    var vs = Object.keys(V).map(function (k) { return V[k]; });
    var moves = vs.map(function (v) { return v.sba.move; });
    var above = vs.filter(function (v) { return v.vs_median === 'above'; }).length;
    var ranks = sa ? 'stand-alone ranks' : 'ranks';
    var count = function (x) { return moves.filter(function (y) { return y === x; }).length; };
    var lead = moves.every(function (x) { return x === 'held'; }) ? 'SBA held all four ' + ranks
      : 'SBA improved ' + numWord(count('up')) + ' and lost ' + numWord(count('down')) + ' of four ' + ranks;
    return lead + '; ' + numWord(above) + ' of four metrics outgrew the peer median';
  }
  function draftNarrative(out) {
    var meta = out.meta, A = out.views.all, S = out.views.sa;
    var vals = function (V) { return Object.keys(V).map(function (k) { return V[k]; }); };
    var strong = vals(A).filter(function (v) { return v.vs_median === 'above'; })
      .map(function (v) { return v.label + ' grew ' + plain(v.sba.growth) + ' against ' + art(v.peer_median) + ' ' + plain(v.peer_median) + ' peer median'; });
    var up = vals(A).filter(function (v) { return v.sba.grew; }), down = vals(A).filter(function (v) { return !v.sba.grew; }), bits = [];
    if (up.length) bits.push('rose in ' + joinAnd(up.map(function (v) { return v.short.toLowerCase() + ' (' + plain(v.sba.growth) + ')'; })));
    if (down.length) bits.push('fell in ' + joinAnd(down.map(function (v) { return v.short.toLowerCase() + ' (' + pct(Math.abs(v.sba.growth), false) + ')'; })));
    var nAbove = vals(A).filter(function (v) { return v.vs_median === 'above'; }).length;
    return {
      takeaways: Object.keys(A).reduce(function (o, k) { o['all.' + k] = takeaway(A[k], meta); o['sa.' + k] = takeaway(S[k], meta); return o; }, {}),
      qoq_all: qoqTakeaway(A, false), qoq_sa: qoqTakeaway(S, true),
      headline: qoqTakeaway(A, false).replace('SBA', 'Sterling Bank of Asia'),
      summary: vals(A).every(function (v) { return v.sba.move === 'held'; })
        ? 'All four ranks held between ' + meta.prior_q + ' and ' + meta.current_q + ', so the movement this quarter is in the balances rather than the positions.'
        : 'Ranks moved between ' + meta.prior_q + ' and ' + meta.current_q + '; the balances behind them are set out below.',
      qoq_paragraph: 'Balances ' + bits.join(' and ') + '. ' + cap(numWord(nAbove)) + ' of four metrics grew faster than the peer median.',
      strengths: strong.slice(0, 3)
    };
  }

  /** Full pipeline. Pure: no DOM access. */
  function analyze(inputs, params) {
    var c = collect(inputs);
    if (c.errors.length) return { errors: c.errors, warnings: c.warnings };
    var out = analyse(c);
    if (out.errors.length) return out;
    out.meta.presented_by = (params && params.presented_by) || 'Marketing';
    out.ratios = ratios(out);
    out.warnings = c.warnings.concat(out.warnings);
    out.draft = draftNarrative(out);
    out.narrative = JSON.parse(JSON.stringify(out.draft));
    return out;
  }

  /* ======================= on-screen review with editable wording ======================= */
  var CURRENT = null;   // metrics object of the last run; edits on screen are written into CURRENT.narrative
  var EDITS = [
    ['qoq_all', 'Quarter-on-quarter slide, all thrift banks (subline)'],
    ['qoq_sa', 'Quarter-on-quarter slide, stand-alone (subline)'],
    ['headline', 'Report headline'],
    ['summary', 'Report summary sentence'],
    ['qoq_paragraph', 'Report paragraph under the comparison chart'],
    ['strengths', 'Report "What is strong" (one point per line; leave empty if none)']
  ];
  function narrValue(n, k) { return k === 'strengths' ? (n.strengths || []).join('\n') : n[k]; }
  if (typeof document !== 'undefined') {
    document.addEventListener('input', function (e) {
      var t = e.target; if (!CURRENT || !t.matches || !t.matches('[data-ir-key]')) return;
      var k = t.getAttribute('data-ir-key');
      CURRENT.narrative[k] = k === 'strengths' ? t.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean) : t.value.trim();
    });
    document.addEventListener('click', function (e) {
      if (!CURRENT || !e.target.closest || !e.target.closest('[data-ir-reset]')) return;
      CURRENT.narrative = JSON.parse(JSON.stringify(CURRENT.draft));
      document.querySelectorAll('[data-ir-key]').forEach(function (t) { t.value = narrValue(CURRENT.narrative, t.getAttribute('data-ir-key')); });
    });
  }
  function moveTxt(v) { return v.sba.move === 'held' ? 'held' : (v.sba.move === 'up' ? 'up from ' : 'down from ') + v.sba.prior_rank_fmt; }
  function moveCls(v) { return v.sba.move === 'up' ? 'ir-pos' : v.sba.move === 'down' ? 'ir-neg' : 'ir-flat'; }
  function growthCls(v) { return v.vs_median === 'above' ? 'ir-pos' : v.sba.grew ? '' : 'ir-neg'; }

  function renderScreen(m) {
    CURRENT = m;
    var M = m.meta, A = m.views.all, S = m.views.sa;
    var kpis = METRICS.map(function (x) {
      var a = A[x.key], s = S[x.key];
      return '<div class="kpi"><span class="kpi-label">' + esc(a.label) + '</span><span class="kpi-value">' + esc(a.sba.rank_fmt) +
        ' <small class="ir-of">of ' + M.bank_count + '</small></span><span class="kpi-sub"><span class="' + moveCls(a) + '">' + esc(moveTxt(a)) + '</span> · stand-alone ' + esc(s.sba.rank_fmt) +
        '<br><b class="' + growthCls(a) + '">' + esc(a.sba.growth_fmt) + '</b> vs ' + esc(a.peer_median_fmt) + ' peer median</span></div>';
    }).join('');
    var rows = METRICS.map(function (x, i) {
      var a = A[x.key], s = S[x.key];
      return '<tr' + (i % 2 ? ' class="alt"' : '') + '><td><b>' + esc(a.label) + '</b></td><td class="n">' + esc(mn(a.sba.amount)) + '</td><td>' + esc(a.sba.rank_fmt) +
        ' <span class="' + moveCls(a) + '">' + esc(moveTxt(a)) + '</span></td><td>' + esc(s.sba.rank_fmt) + ' <span class="' + moveCls(s) + '">' + esc(moveTxt(s)) + '</span></td>' +
        '<td class="n"><b class="' + growthCls(a) + '">' + esc(a.sba.growth_fmt) + '</b></td><td class="n">' + esc(a.peer_median_fmt) + '</td>' +
        '<td class="n">' + (a.above ? esc(a.above.gap_fmt) + ' to ' + esc(a.above.rank_fmt) : '—') + '</td><td class="n">' + (a.below ? esc(a.below.cushion_fmt) + ' over ' + esc(a.below.rank_fmt) : '—') + '</td></tr>';
    }).join('');
    var src = METRICS.filter(function (x) { return M.prior_source[x.key] === 'workbook'; }).map(function (x) { return x.label; });
    var warn = m.warnings.length ? '<div class="ir-warn"><b>Check before sending</b><ul>' + m.warnings.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul></div>' : '';
    var edits = EDITS.map(function (e) {
      var v = narrValue(m.narrative, e[0]);
      return '<label class="ir-edit"><span>' + esc(e[1]) + '</span><textarea data-ir-key="' + e[0] + '" rows="' + (e[0] === 'strengths' || e[0] === 'qoq_paragraph' ? 3 : 2) + '">' + esc(v) + '</textarea></label>';
    }).join('');
    return '<div class="report ir-screen"><p class="eyebrow">BSP thrift bank rankings · posted ' + esc(M.posting_long) + '</p>' +
      '<h2>' + esc(M.doc_title) + ', as of ' + esc(M.current_long) + '</h2>' +
      '<p class="muted">Compared with ' + esc(M.prior_long) + ' · ' + M.bank_count + ' thrift banks · ₱ million' + (src.length ? ' · previous ' + esc(src.join(', ')) + ' from the old workbook (top 10)' : '') + '</p>' +
      warn + '<h3>Where SBA ranks</h3><div class="kpis">' + kpis + '</div>' +
      '<h3>Scorecard</h3><table><thead><tr><th>Metric</th><th class="n">₱ million</th><th>Rank of ' + M.bank_count + '</th><th>Stand-alone rank</th><th class="n">Growth since ' + esc(M.prior_q) +
      '</th><th class="n">Peer median</th><th class="n">Gap to rank above</th><th class="n">Lead over rank below</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<h3>Wording for the deck and report</h3><p class="muted">Drafted from the figures above. Edit freely; your wording is used when you save the slide deck and the Word report. Keep every figure exactly as shown.</p>' +
      '<div class="ir-edits">' + edits + '</div><p><button class="btn" data-ir-reset>Reset wording to the draft</button></p></div>';
  }

  /* ======================= slide deck (build_deck_html.py + qoq_slopes.py) ======================= */
  function niceMax(v) {
    var p = Math.pow(10, Math.floor(Math.log10(v / 4)));
    var ms = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
    for (var i = 0; i < ms.length; i++) if (4 * ms[i] * p >= v) return 4 * ms[i] * p;
    return 40 * p;
  }
  function axis(v) { return groups(Math.round(v)); }
  function card(title, right, inner, cls) {
    var head = title ? '<div class="card-head"><span>' + title + '</span>' + (right ? '<span class="card-right">' + right + '</span>' : '') + '</div>' : '';
    return '<div class="card ' + (cls || '') + '">' + head + inner + '</div>';
  }

  function buildDeck(m) {
    var M = m.meta, N = m.narrative, LOGO = (root.SBA_LOGOS || {}).color || '', LOGO_REV = (root.SBA_LOGOS || {}).reverse || '';
    var FOOT = ['As of ' + M.current_long, M.bank_count + ' Thrift Banks | Amounts in Million Pesos', 'Source: BSP website', 'BSP posting date: ' + M.posting_long]
      .map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('');
    function contentSlide(view, eyebrow, title, subline, body) {
      var band = view === 'sa' ? 'band-sa' : 'band-all';
      var sub = subline ? '<p class="subline">' + esc(subline).replace(/\n/g, '<br>') + '</p>' : '';
      return '<section class="slide light' + (view === 'sa' ? ' slide-sa' : '') + '"><div class="band ' + band + '"></div><header class="head"><div class="head-left">' +
        '<p class="eyebrow">' + esc(eyebrow) + '</p><h1 class="' + (title.length > 24 ? 'h1-long' : '') + '">' + esc(title).toUpperCase() + '</h1></div>' +
        '<div class="head-right">' + sub + '<img class="logo" src="' + LOGO + '" alt="Sterling Bank of Asia"></div></header>' +
        '<div class="body">' + body + '</div><footer class="foot">' + FOOT + '<span class="conf">Confidential</span></footer><div class="band band-bot ' + band + '"></div></section>';
    }
    function ladder(v) {
      var mx = niceMax(v.rows[0].amount), rows = v.ladder.map(function (r) {
        if (!r) return '<div class="lrow gap"><span class="lell">&middot;&middot;&middot;</span></div>';
        var w = (r.amount / mx * 100).toFixed(2);
        return '<div class="lrow' + (r.is_sba ? ' sba' : '') + '"><span class="lrank">' + r.rank + '</span><span class="lname">' + esc(r.display) + '</span>' +
          '<span class="lplot"><span class="lbar" style="width:' + w + '%"></span><span class="ldot" style="left:' + w + '%"></span></span><span class="lval">' + esc(r.amount_fmt) + '</span></div>';
      }).join('');
      var ticks = '<span class="lspacer"></span><span class="lspacer"></span><span class="lticks">' + [0, 0.5, 1].map(function (f) { return '<span>' + axis(mx * f) + '</span>'; }).join('') + '</span>';
      var notes = [];
      if (v.above) notes.push('<span>Gap to ' + esc(v.above.rank_fmt) + ': <b>' + esc(v.above.gap_fmt) + '</b></span>');
      if (v.below) notes.push('<span>Lead over ' + esc(v.below.rank_fmt) + ': <b>' + esc(v.below.cushion_fmt) + '</b></span>');
      var scope = v.view === 'all' ? v.ladder.filter(Boolean).length + ' of ' + M.bank_count + ' shown &middot; &#8369; million' : v.n_banks + ' stand-alone banks &middot; &#8369; million';
      return card(v.view === 'all' ? 'Total ranking' : 'Stand-alone ranking', scope,
        '<div class="ladder">' + rows + '</div><div class="laxis">' + ticks + '</div><div class="lnotes">' + notes.join('') + '</div>', 'card-grow');
    }
    function rankCard(v) {
      var s = v.sba, scope = v.view === 'all' ? 'of ' + M.bank_count + ' thrift banks' : 'of ' + v.n_banks + ' stand-alone thrift banks';
      var g = { up: ['&#9650;', 'pos'], down: ['&#9660;', 'neg'], held: ['&#9679;', 'flat'] }[s.move];
      var mt = s.move === 'held' ? 'Held since ' + M.prior_q : (s.move === 'up' ? 'Up' : 'Down') + ' from ' + s.prior_rank_fmt + ' in ' + M.prior_q;
      var dots = v.dots.map(function (st) { return '<i class="d-' + st + '"></i>'; }).join('');
      var leg = v.view === 'all' ? 'Each dot is one of ' + M.bank_count + ' thrift banks' : 'Each dot is one of ' + v.n_banks + ' stand-alone thrift banks';
      return card(v.view === 'all' ? 'Total rank' : 'Stand-alone rank', '', '<div><span class="bignum">' + esc(s.rank_fmt) + '</span><span class="bigsub">' + esc(scope) + '</span></div>' +
        '<div class="bigmove ' + g[1] + '">' + g[0] + ' ' + esc(mt) + '</div><div class="dots">' + dots + '</div>' +
        '<div class="dotleg"><span><i class="k-sba"></i>Sterling Bank of Asia</span><span><i class="k-above"></i>Ranked above</span></div><div class="dotleg dotcount">' + esc(leg) + '</div>');
    }
    function moveCard(v) {
      var s = v.sba, gcls = v.vs_median === 'above' ? 'pos' : (!s.grew ? 'neg' : '');
      var verdict = v.vs_median === 'above' ? 'Faster than the peer median' : v.vs_median === 'below' ? 'Slower than the peer median' : '';
      return card('Movement since ' + M.prior_q, '', '<div class="kv hl"><span>' + esc(M.growth_label) + '</span><b class="' + gcls + '">' + esc(s.growth_fmt) + '</b></div>' +
        '<div class="kv"><span>Peer median, ' + v.peer_median_n + ' banks</span><b>' + esc(v.peer_median_fmt) + '</b></div>' +
        (verdict ? '<div class="verdict ' + (v.vs_median === 'above' ? 'pos' : 'flat') + '">' + esc(verdict) + '</div>' : ''));
    }
    function metricSlide(view, key) {
      var v = m.views[view][key];
      return contentSlide(view, view === 'all' ? 'All ' + M.bank_count + ' thrift banks' : 'Stand-alone thrift banks', v.label,
        view === 'all' ? 'Where Sterling Bank of Asia sits among peers, ' + M.current_long : 'Excluding subsidiaries of larger banking groups',
        '<div class="grid-8-4">' + ladder(v) + '<div class="col-side">' + rankCard(v) + moveCard(v) + '</div></div>');
    }
    function qoqSlide(view) {
      return contentSlide(view, view === 'all' ? 'All ' + M.bank_count + ' thrift banks' : 'Stand-alone thrift banks', 'Quarter on quarter',
        view === 'all' ? N.qoq_all : N.qoq_sa, slopesBody(m, view));
    }
    var navyBlock = function (inner, logo) {
      return '<section class="slide navy' + (logo ? ' cover' : '') + '"><div class="band band-all"></div>' + (logo ? '<img class="logo-cover" src="' + LOGO_REV + '" alt="Sterling Bank of Asia">' : '') + '<div class="cover-block">' + inner + '<p class="eyebrow amber conf-cover">Confidential</p></div></section>';
    };
    var slides = [];
    slides.push(navyBlock('<p class="eyebrow amber">Finance Industry &middot; Thrift Bank Ranking</p><h1 class="cover-title">' + esc(M.doc_title) + '</h1><div class="rule-amber"></div>' +
      '<div class="pill"><span class="pill-a">Presented by</span><span class="pill-b">' + esc(M.presented_by) + '</span></div>' +
      '<p class="cover-line">As of ' + esc(M.current_long) + ' &middot; ' + M.bank_count + ' Thrift Banks &middot; Amounts in Million Pesos</p>' +
      '<p class="cover-src">Source: BSP website &middot; BSP posting date ' + esc(M.posting_long) + '</p>', true));
    var items = ['Where Sterling Bank of Asia sits among all thrift banks', 'Standing among stand-alone thrift banks'];
    slides.push(contentSlide('all', 'What we will cover', 'Agenda', M.current_q + ' thrift bank rankings,\nas of ' + M.current_long,
      '<div class="card card-grow agenda">' + items.map(function (t, i) { return '<div class="agrow"><span class="agnum">' + String(i + 1).padStart(2, '0') + '</span><span class="agtxt">' + esc(t) + '</span></div>'; }).join('') + '</div>'));
    METRICS.forEach(function (x) { slides.push(metricSlide('all', x.key)); });
    slides.push(qoqSlide('all'));
    var stats = METRICS.map(function (x) { var v = m.views.sa[x.key]; return '<div class="dstat"><p class="dlab">' + esc(v.short) + '</p><p class="dval">' + esc(v.sba.rank_fmt) + '</p></div>'; }).join('');
    slides.push(navyBlock('<p class="eyebrow amber">Section TWO</p><h1 class="sect-title">Stand-Alone Thrift Banks</h1><div class="rule-amber"></div>' +
      '<p class="sect-lede">The same four metrics, measured only against thrift banks that operate independently — subsidiaries of larger banking groups excluded.</p><div class="dstats">' + stats + '</div>', false));
    METRICS.forEach(function (x) { slides.push(metricSlide('sa', x.key)); });
    slides.push(qoqSlide('sa'));
    slides.push(navyBlock('<h1 class="sect-title">Thank you</h1><div class="rule-amber"></div><p class="cover-line">' + esc(M.doc_title) + ' &middot; Presented by ' + esc(M.presented_by) + '</p>', true));
    return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>' + esc(M.doc_title) + ' &middot; Sterling Bank of Asia</title><style>' + deckCss() + SLOPE_CSS + '</style></head><body>\n' + slides.join('\n') + '\n</body></html>';
  }

  /* ---- quarter-on-quarter value slopes (qoq_slopes.py, layout rules unchanged) ---- */
  var SW = 277, TOP = 28, BOT = 290, GAP = 22, FS = 15, ORDQ = { 1: '1ST', 2: '2ND', 3: '3RD', 4: '4TH' };
  function tw(s, px) { px = px || FS; var w = 0; String(s).split('').forEach(function (c) { w += ',. '.indexOf(c) >= 0 ? 0.278 : '▲▼'.indexOf(c) >= 0 ? 1.0 : 0.556; }); return w * px; }
  function qhead(q) { var p = q.replace('Q', '').split(' '); return [ORDQ[+p[0]] + ' QRT', p[1]]; }
  /** One shared monotone value->y map (log scale); dots in one column stay >= GAP apart. */
  function solveY(left, right) {
    var seen = {}, pts = [];
    [['L', left], ['R', right]].forEach(function (cv) { cv[1].forEach(function (v) { var key = v + '|' + cv[0]; if (!seen[key]) { seen[key] = 1; pts.push([v, cv[0]]); } }); });
    pts.sort(function (a, b) { return b[0] - a[0] || (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0); });
    var hi = Math.log(pts[0][0]), lo = Math.log(pts[pts.length - 1][0]);
    var raw = pts.map(function (p) { return (hi - Math.log(p[0])) / ((hi - lo) || 1) * (BOT - TOP); });
    function place(sc, gap) {
      var ys = [], last = {};
      pts.forEach(function (p, i) {
        var y = i === 0 ? 0 : ys[i - 1] + (p[0] === pts[i - 1][0] ? 0 : sc * (raw[i] - raw[i - 1]));
        if (last[p[1]] !== undefined) y = Math.max(y, last[p[1]] + gap);
        ys.push(y); last[p[1]] = y;
      });
      return ys;
    }
    var gap = GAP;
    while (place(0, gap)[pts.length - 1] > BOT - TOP && gap > 16) gap -= 1;
    var a = 0, b = 1;
    for (var it = 0; it < 40; it++) { var mid = (a + b) / 2; if (place(mid, gap)[pts.length - 1] <= BOT - TOP) a = mid; else b = mid; }
    var ys = place(a, gap), endY = ys[ys.length - 1], k = endY > BOT - TOP ? (BOT - TOP) / endY : 1, map = {};
    pts.forEach(function (p, i) { map[p[0] + '|' + p[1]] = TOP + ys[i] * k; });
    return map;
  }
  function panelSvg(rows, heads) {
    var f1 = function (x) { return x.toFixed(1); };
    var anymv = rows.some(function (r) { return r.mv; });
    var rw = Math.max.apply(null, rows.map(function (r) { return tw(String(r.rank)); }));
    var x1 = Math.max.apply(null, rows.map(function (r) { return tw(r.lfmt); })) + 11;
    var x2 = SW - (12 + Math.max.apply(null, rows.map(function (r) { return tw(r.rfmt); })) + 7 + rw + (anymv ? 5 + tw('▲1') : 0));
    if (x2 - x1 < 64) throw new Error('A quarter-on-quarter slope is narrower than 64px, so labels would collide. Tell the portal maintainer.');
    var xr = x2 + 12 + Math.max.apply(null, rows.map(function (r) { return tw(r.rfmt); })) + 7;
    var o = ['<svg class="qslope" viewBox="0 -14 ' + SW + ' 316" width="' + SW + '" height="316" role="img" aria-label="Quarter-on-quarter value slope">'];
    [[x1, heads[0], ''], [x2, heads[1], ' cur']].forEach(function (h) {
      o.push('<line class="qs-axis" x1="' + f1(h[0]) + '" y1="15" x2="' + f1(h[0]) + '" y2="300"/><text class="qs-h' + h[2] + '" x="' + f1(h[0]) + '" y="-3" text-anchor="middle">' + h[1][0] + '</text>' +
        '<text class="qs-h' + h[2] + '" x="' + f1(h[0]) + '" y="10" text-anchor="middle">' + h[1][1] + '</text>');
    });
    var order = rows.slice().sort(function (a, b) { return (a.sba - b.sba) || (!!a.mv - !!b.mv); });
    order.forEach(function (r) { r.k = r.sba ? ' sba' : r.mv > 0 ? ' up' : r.mv < 0 ? ' down' : ''; o.push('<line class="qs-l' + r.k + '" x1="' + f1(x1) + '" y1="' + f1(r.yl) + '" x2="' + f1(x2) + '" y2="' + f1(r.yr) + '"/>'); });
    order.forEach(function (r) {
      var rad = r.sba ? 7.5 : 6, tk = r.sba ? r.k : '', mk = r.mv > 0 ? ' up' : r.mv < 0 ? ' down' : '';
      o.push('<circle class="qs-d' + r.k + '" cx="' + f1(x1) + '" cy="' + f1(r.yl) + '" r="' + rad + '"/><circle class="qs-d' + r.k + ' cur" cx="' + f1(x2) + '" cy="' + f1(r.yr) + '" r="' + rad + '"/>' +
        '<text class="qs-t' + tk + '" x="' + f1(x1 - 11) + '" y="' + f1(r.yl) + '" dy=".35em" text-anchor="end">' + r.lfmt + '</text>' +
        '<text class="qs-t' + r.k + '" x="' + f1(x2 + 12) + '" y="' + f1(r.yr) + '" dy=".35em">' + r.rfmt + '</text>' +
        '<text class="qs-t r' + mk + '" x="' + f1(xr) + '" y="' + f1(r.yr) + '" dy=".35em">' + r.rank + '</text>');
      if (r.mv) o.push('<text class="qs-t' + mk + '" x="' + f1(xr + rw + 5) + '" y="' + f1(r.yr) + '" dy=".35em">' + (r.mv > 0 ? '▲' : '▼') + Math.abs(r.mv) + '</text>');
    });
    return o.join('') + '</svg>';
  }
  function slopesBody(m, view) {
    var M = m.meta, V = m.views[view], heads = [qhead(M.prior_q), qhead(M.current_q)], panels = [], missing = 0;
    METRICS.forEach(function (x) {
      var v = V[x.key]; if (!v) return;
      var s = v.sba, cut = s.rank <= 10 ? Math.max(8, s.rank) : 8;
      var pick = v.rows.filter(function (r) { return r.rank <= cut || r.is_sba; });
      missing = Math.max(missing, pick.filter(function (r) { return !r.prior_amount; }).length);
      pick = pick.filter(function (r) { return r.prior_amount; });
      var ymap = solveY(pick.map(function (r) { return r.prior_amount; }), pick.map(function (r) { return r.amount; }));
      var rows = pick.map(function (r) {
        return { sba: r.is_sba, lfmt: mn(r.prior_amount), rfmt: r.amount_fmt, rank: r.rank, mv: r.prior_rank ? r.prior_rank - r.rank : 0, yl: ymap[r.prior_amount + '|L'], yr: ymap[r.amount + '|R'] };
      });
      ['yl', 'yr'].forEach(function (col) {
        var ys = rows.map(function (r) { return r[col]; }).sort(function (a, b) { return a - b; });
        for (var i = 1; i < ys.length; i++) if (ys[i] - ys[i - 1] < 15.5) throw new Error('Dots overlap on the ' + (view === 'all' ? 'all-thrift' : 'stand-alone') + ' ' + v.label + ' slope. Tell the portal maintainer.');
      });
      var head = { up: 'SBA rose to ' + s.rank_fmt, down: 'SBA slipped to ' + s.rank_fmt }[s.move] || 'SBA held ' + s.rank_fmt;
      panels.push([v.label, panelSvg(rows, heads), head, s.growth_fmt, s.grew ? 'up' : 'down', v.peer_median_fmt, s.amount_fmt]);
    });
    var note = 'Heights are proportional to balance; dots are spaced apart where balances are close';
    if (missing) note += '; ' + missing + ' bank' + (missing > 1 ? 's' : '') + ' not drawn (no ' + M.prior_q + ' balance on file)';
    var ps = panels.map(function (p) {
      return '<div class="qq-panel"><p class="qq-title">' + esc(p[0]) + '</p>' + p[1] + '<div class="qq-cap"><b class="h">' + esc(p[2]) + '</b><span><b class="' + p[4] + '">' + esc(p[3]) + '</b>' +
        (p[5] ? ' vs ' + esc(p[5]) + ' peer median' : '') + '</span><span>' + esc(p[6]) + '</span></div></div>';
    }).join('');
    return '<div class="stack"><div class="card card-grow qq"><div class="qq-strip"><span class="qq-badge">Quarter-end figures</span><span>' + esc(M.prior_long) + ' and ' + esc(M.current_long) + ', not averages</span>' +
      '<span class="qq-leg"><span><span class="up">&#9650;</span> Rank gained</span><span><span class="down">&#9660;</span> Rank lost</span><span><i></i>Rank held</span><span>Bold number after the ' + esc(M.current_q) + ' value = rank</span></span></div>' +
      '<div class="qq-panels">' + ps + '</div><p class="qq-note">' + esc(note) + '</p></div></div>';
  }
  var SLOPE_CSS = '.qq{padding:12px 14px 10px}.qq-strip{display:flex;align-items:center;gap:14px;padding-bottom:9px;border-bottom:1px solid var(--rule);font-size:14px;color:var(--slate);flex:0 0 auto}' +
    '.qq-badge{font-size:13px;font-weight:bold;letter-spacing:.14em;text-transform:uppercase;padding:5px 11px;background:var(--amber);color:var(--ink)}' +
    '.qq-leg{margin-left:auto;display:flex;gap:12px;align-items:center;font-size:13px;color:var(--ink)}.qq-leg i{display:inline-block;width:20px;height:2px;background:#C7CCD4;vertical-align:middle;margin-right:5px}' +
    '.qq-leg .up,.qq-cap .up{color:var(--pos)}.qq-leg .down,.qq-cap .down{color:var(--neg)}.qq-panels{display:grid;grid-template-columns:repeat(4,1fr);column-gap:16px;flex:1 1 auto;min-height:0;margin-top:9px}' +
    '.qq-panel{display:flex;flex-direction:column;min-width:0}.qq-title{font-size:13px;font-weight:bold;letter-spacing:.14em;color:var(--ink);padding-bottom:5px;border-bottom:1px solid var(--rule);white-space:nowrap;text-transform:uppercase}' +
    '.qq-panel svg{display:block;flex:0 0 auto;overflow:visible;margin-top:4px;font-family:Arial,Helvetica,sans-serif}.qq-cap{margin-top:auto;display:flex;flex-direction:column;gap:1px;font-size:14px;color:var(--slate)}' +
    '.qq-cap b.h{font-size:19px;color:var(--navy)}.qq-note{font-size:12.5px;color:var(--muted);margin-top:5px}.qs-axis{stroke:#E4E8EE;stroke-width:1}.qs-h{font-size:12px;font-weight:bold;letter-spacing:.04em;fill:var(--muted)}' +
    '.qs-h.cur{fill:var(--navy)}.qs-l{stroke:#C7CCD4;stroke-width:2;stroke-linecap:round}.qs-l.up{stroke:var(--pos);stroke-width:3.5}.qs-l.down{stroke:var(--neg);stroke-width:3.5}.qs-l.sba{stroke:var(--navy);stroke-width:5}' +
    '.qs-d{fill:#C7CCD4}.qs-d.up{fill:var(--pos)}.qs-d.down{fill:var(--neg)}.qs-d.sba{fill:var(--navy)}.qs-d.sba.cur{fill:var(--amber)}.qs-t{font-size:15px;fill:var(--slate);font-variant-numeric:tabular-nums}' +
    '.qs-t.r{font-weight:bold;fill:var(--muted)}.qs-t.up{fill:var(--pos);font-weight:bold}.qs-t.down{fill:var(--neg);font-weight:bold}.qs-t.sba{fill:var(--navy);font-weight:bold}';
  function deckCss() {
    var C = function (k) { return '#' + BR[k]; };
    return '*{box-sizing:border-box;margin:0;padding:0}:root{--navy:' + C('navy') + ';--amber:' + C('amber') + ';--canvas:' + C('canvas') + ';--surface:' + C('surface') + ';--ink:' + C('ink') +
      ';--slate:' + C('slate') + ';--muted:' + C('muted') + ';--rule:' + C('rule') + ';--grid:' + C('grid') + ';--baseline:' + C('baseline') + ';--peer:' + C('peer') + ';--peerdot:' + C('peer_dot') +
      ';--tint:' + C('sba_tint') + ';--pos:' + C('positive') + ';--neg:' + C('negative') + ';--warn:' + C('warning') + ';--mist:' + C('mist') + ';--steel:' + C('steel') + ';--satint:#EAF0FA}' +
      'html,body{background:#555;font-family:Arial,Helvetica,sans-serif;color:var(--ink);-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
      '.slide{position:relative;width:1280px;height:720px;margin:24px auto;overflow:hidden;background:var(--canvas);display:flex;flex-direction:column;padding:34px 40px 30px}' +
      '.slide.navy{background:var(--navy);color:#fff;justify-content:center;padding:0 62px}.band{position:absolute;top:0;left:0;right:0;height:6px}.band-bot{top:auto;bottom:0}' +
      '.band-all{background:var(--amber)}.band-sa{background:var(--navy)}.slide.navy .band-all{background:var(--amber)}' +
      '.head{background:var(--surface);padding:22px 30px;display:flex;align-items:center;justify-content:space-between;gap:30px;flex:0 0 auto}.head-left{min-width:0}' +
      '.head-right{display:flex;align-items:center;gap:22px;flex:0 0 auto}.eyebrow{font-size:14px;font-weight:bold;letter-spacing:.18em;text-transform:uppercase;color:var(--muted)}' +
      'h1{font-size:42px;font-weight:bold;line-height:1.08;margin:7px 0 0;letter-spacing:-.01em;white-space:nowrap}.h1-long{font-size:34px}' +
      '.subline{font-size:17px;color:var(--slate);text-align:right;line-height:1.35;max-width:330px}.logo{width:150px;height:auto;flex:0 0 auto}' +
      '.body{flex:1 1 auto;display:flex;min-height:0;margin-top:17px}.grid-8-4{display:grid;grid-template-columns:2fr 1fr;gap:17px;width:100%;min-height:0}' +
      '.col-side{display:flex;flex-direction:column;gap:17px;min-height:0}.col-side .card:first-child{flex:1 1 56%}.col-side .card:last-child{flex:0 0 auto}' +
      '.stack{display:flex;flex-direction:column;gap:17px;width:100%;min-height:0}.card{background:var(--surface);padding:19px 24px;display:flex;flex-direction:column;min-height:0}.card-grow{flex:1 1 auto}' +
      '.card-head{display:flex;justify-content:space-between;align-items:baseline;gap:12px;font-size:14px;font-weight:bold;letter-spacing:.18em;text-transform:uppercase;padding-bottom:9px;border-bottom:1px solid var(--rule);flex:0 0 auto}' +
      '.card-right{font-size:13px;font-weight:normal;letter-spacing:0;text-transform:none;color:var(--muted)}' +
      '.foot{display:flex;justify-content:space-between;align-items:baseline;gap:18px;font-size:13px;color:var(--muted);padding-top:12px;flex:0 0 auto}.conf{font-weight:bold;letter-spacing:.18em;text-transform:uppercase;color:var(--slate)}' +
      '.ladder{flex:1 1 auto;display:flex;flex-direction:column;justify-content:space-evenly;padding:6px 0;min-height:0}' +
      '.lrow{display:grid;grid-template-columns:36px minmax(245px,1fr) 2.6fr 120px;align-items:center;gap:12px;font-size:20px;color:var(--slate);padding:6px 8px;margin:0 -8px}' +
      '.lrow.sba{background:var(--tint);color:var(--ink);font-weight:bold}.slide-sa .lrow.sba{background:var(--satint)}.lrow.gap{padding:0;min-height:14px}.lell{color:var(--slate);letter-spacing:3px}' +
      '.lname{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lplot{position:relative;height:20px;background:linear-gradient(to right,var(--baseline) 0 1px,transparent 1px 25%,var(--grid) 25% calc(25% + 1px),transparent calc(25% + 1px) 50%,var(--grid) 50% calc(50% + 1px),transparent calc(50% + 1px) 75%,var(--grid) 75% calc(75% + 1px),transparent calc(75% + 1px) 100%)}' +
      '.lbar{position:absolute;top:4px;height:12px;border-radius:6px;background:var(--peer)}.lrow.sba .lbar{background:var(--amber)}' +
      '.ldot{position:absolute;top:2px;width:16px;height:16px;border-radius:50%;background:var(--peerdot);transform:translateX(-8px)}.lrow.sba .ldot{background:var(--amber)}.lval{text-align:right;font-variant-numeric:tabular-nums}' +
      '.laxis{display:grid;grid-template-columns:36px minmax(245px,1fr) 2.6fr 120px;gap:12px;font-size:14px;color:var(--slate);flex:0 0 auto;padding:2px 8px 0;margin:0 -8px}.lticks{grid-column:3;display:flex;justify-content:space-between}' +
      '.lnotes{display:flex;gap:34px;font-size:19px;padding-top:12px;flex:0 0 auto}' +
      '.bignum{font-size:78px;font-weight:bold;line-height:1;color:var(--navy);margin-top:10px;display:inline-block;vertical-align:baseline}.bigsub{font-size:19px;color:var(--slate);display:inline-block;margin-left:12px}' +
      '.bigmove{font-size:17px;margin-top:8px}.pos{color:var(--pos)}.neg{color:var(--neg)}.flat{color:var(--slate)}' +
      '.dots{display:flex;flex-wrap:wrap;gap:6px;margin-top:14px}.dots i{width:14px;height:14px;border-radius:50%;background:var(--peerdot);display:block}.dots .d-above{background:var(--navy)}.dots .d-sba{background:var(--amber)}' +
      '.dotleg{display:flex;gap:20px;font-size:13px;color:var(--slate);margin-top:11px}.dotcount{color:var(--muted);font-size:12px;margin-top:6px}.dotleg span{display:flex;align-items:center;gap:7px}' +
      '.dotleg i{width:11px;height:11px;border-radius:50%;display:block}.dotleg .k-sba{background:var(--amber)}.dotleg .k-above{background:var(--navy)}' +
      '.kv{display:flex;justify-content:space-between;align-items:baseline;font-size:19px;color:var(--slate);padding:7px 0}.kv.hl{background:var(--tint);margin:0 -10px;padding:7px 10px}' +
      '.kv b{color:var(--ink);font-variant-numeric:tabular-nums}.verdict{font-size:18px;font-weight:bold;padding-top:7px}' +
      '.agenda{justify-content:space-evenly;padding:30px 34px}.agrow{display:flex;align-items:center;gap:28px;padding:18px 0;border-bottom:1px solid var(--rule)}.agrow:last-child{border-bottom:none}' +
      '.agnum{font-size:30px;font-weight:bold;color:var(--navy);min-width:48px}.agtxt{font-size:30px}' +
      '.cover-block{max-width:760px}.cover-title{font-size:68px;font-weight:bold;line-height:1.05;margin-top:10px;letter-spacing:-.015em}.sect-title{font-size:58px;font-weight:bold;line-height:1.05;margin-top:10px;letter-spacing:-.015em}' +
      '.rule-amber{width:124px;height:5px;background:var(--amber);margin:22px 0 20px}.pill{display:inline-flex;align-items:stretch;background:#fff;border-radius:999px;overflow:hidden;margin-bottom:24px}' +
      '.pill-a{background:var(--amber);color:var(--navy);font-size:15px;font-weight:bold;padding:9px 18px;border-radius:999px}.pill-b{color:var(--navy);font-size:17px;font-weight:bold;padding:9px 22px 9px 16px}' +
      '.cover-line{font-size:19px;color:#fff;margin-top:8px}.cover-src{font-size:17px;color:var(--steel);margin-top:8px}.sect-lede{font-size:21px;color:var(--mist);line-height:1.45;max-width:700px}' +
      '.dstats{display:flex;gap:56px;margin-top:30px}.dlab{font-size:14px;font-weight:bold;letter-spacing:.18em;text-transform:uppercase;color:var(--steel)}.dval{font-size:34px;font-weight:bold;color:#fff;margin-top:6px}' +
      '.conf-cover{margin-top:26px}.amber{color:var(--amber)}.logo-cover{width:330px;position:absolute;top:72px;right:62px}.cover{justify-content:center}' +
      '@media print{@page{size:1280px 720px;margin:0}html,body{background:#fff}.slide{margin:0;page-break-after:always;break-after:page}.slide:last-child{page-break-after:auto;break-after:auto}}';
  }

  /* ======================= Word report (build_report.js, minus watch list) ======================= */
  function svgQoq(m) {
    var V = m.views.all, M = m.meta, rows = METRICS.map(function (x) { return V[x.key]; });
    var lim = Math.max.apply(null, rows.map(function (v) { return Math.max(Math.abs(v.sba.growth || 0), Math.abs(v.peer_median || 0)); })) * 1.45 || 1;
    var W = 980, L = 210, R = W - 20, H = 46 + rows.length * 56, cx = L + (R - L) / 2, sx = function (v) { return cx + v / lim * (R - L) / 2; };
    var s = ['<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" font-family="Arial, sans-serif"><rect width="100%" height="100%" fill="#fff"/>',
      '<text x="0" y="16" font-size="13" font-weight="bold" fill="#' + BR.ink + '">' + esc(M.growth_label.toUpperCase() + ', ' + M.prior_q + ' TO ' + M.current_q) + '</text>',
      '<text x="' + R + '" y="16" font-size="13" text-anchor="end" fill="#' + BR.slate + '">SBA (solid) vs peer median (grey)</text>',
      '<line x1="0" y1="26" x2="' + R + '" y2="26" stroke="#' + BR.rule + '"/>',
      '<line x1="' + cx + '" y1="34" x2="' + cx + '" y2="' + (H - 4) + '" stroke="#' + BR.baseline + '"/>'];
    rows.forEach(function (v, i) {
      var y = 40 + i * 56, g = v.sba.growth || 0, p = v.peer_median || 0, gc = g >= 0 ? '#' + BR.positive : '#' + BR.negative;
      s.push('<text x="0" y="' + (y + 22) + '" font-size="14" font-weight="bold" fill="#' + BR.ink + '">' + esc(v.label) + '</text>');
      s.push('<rect x="' + Math.min(cx, sx(g)) + '" y="' + (y + 6) + '" width="' + Math.abs(sx(g) - cx) + '" height="16" fill="' + gc + '"/>');
      s.push('<text x="' + (g >= 0 ? sx(g) + 6 : sx(g) - 6) + '" y="' + (y + 19) + '" font-size="13" font-weight="bold" text-anchor="' + (g >= 0 ? 'start' : 'end') + '" fill="' + gc + '">' + esc(v.sba.growth_fmt) + '</text>');
      s.push('<rect x="' + Math.min(cx, sx(p)) + '" y="' + (y + 26) + '" width="' + Math.abs(sx(p) - cx) + '" height="11" fill="#' + BR.peer + '"/>');
      s.push('<text x="' + (p >= 0 ? sx(p) + 6 : sx(p) - 6) + '" y="' + (y + 36) + '" font-size="12" text-anchor="' + (p >= 0 ? 'start' : 'end') + '" fill="#' + BR.slate + '">peer ' + esc(v.peer_median_fmt) + '</text>');
    });
    return s.join('') + '</svg>';
  }
  function trimLadder(ladder, keep) {
    keep = keep || 6;
    if (ladder.length <= keep) return ladder;
    var i = ladder.findIndex(function (r) { return r && r.is_sba; });
    var tail = ladder.slice(Math.max(0, i - 1), i + 2), head = ladder.slice(0, Math.max(0, keep - tail.length - 1));
    return head.concat([null], tail);
  }
  function svgLadders(m, view) {
    var V = m.views[view], M = m.meta, PW = 480, gapX = 20, rowH = 26;
    var nRows = Math.max.apply(null, METRICS.map(function (x) { return trimLadder(V[x.key].ladder).length; }));
    var PH = 40 + nRows * rowH, W = PW * 2 + gapX, H = PH * 2 + 16;
    var s = ['<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" font-family="Arial, sans-serif"><rect width="100%" height="100%" fill="#fff"/>'];
    METRICS.forEach(function (x, idx) {
      var v = V[x.key], ox = (idx % 2) * (PW + gapX), oy = Math.floor(idx / 2) * (PH + 16), rows = trimLadder(v.ladder), mx = niceMax(v.rows[0].amount);
      var bx = ox + 175, bw = PW - 175 - 80, sc = v.sba;
      s.push('<text x="' + ox + '" y="' + (oy + 14) + '" font-size="12" font-weight="bold" fill="#' + BR.ink + '">' + esc(v.label.toUpperCase()) + '</text>');
      s.push('<text x="' + (ox + PW) + '" y="' + (oy + 14) + '" font-size="12" font-weight="bold" text-anchor="end" fill="' + (sc.grew ? '#' + BR.ink : '#' + BR.negative) + '">' +
        esc(sc.rank_fmt + ' ' + (view === 'all' ? 'of ' + M.bank_count : 'stand-alone') + ' · ' + sc.growth_fmt) + '</text>');
      s.push('<line x1="' + ox + '" y1="' + (oy + 22) + '" x2="' + (ox + PW) + '" y2="' + (oy + 22) + '" stroke="#' + BR.rule + '"/>');
      [0, .25, .5, .75, 1].forEach(function (f) { s.push('<line x1="' + (bx + bw * f) + '" y1="' + (oy + 28) + '" x2="' + (bx + bw * f) + '" y2="' + (oy + 30 + rows.length * rowH) + '" stroke="#' + (f ? BR.grid : BR.baseline) + '"/>'); });
      rows.forEach(function (r, i) {
        var y = oy + 30 + i * rowH;
        if (!r) { s.push('<text x="' + ox + '" y="' + (y + 17) + '" font-size="12" fill="#' + BR.slate + '">…</text>'); return; }
        var col = r.is_sba ? '#' + BR.ink : '#' + BR.slate, fw = r.is_sba ? 'bold' : 'normal';
        if (r.is_sba) s.push('<rect x="' + ox + '" y="' + (y + 1) + '" width="' + PW + '" height="' + (rowH - 2) + '" fill="#' + BR.sba_tint + '"/>');
        s.push('<rect x="' + bx + '" y="' + (y + 9) + '" width="' + (r.amount / mx * bw) + '" height="8" rx="4" fill="#' + (r.is_sba ? BR.amber : BR.peer) + '"/>');
        s.push('<circle cx="' + (bx + r.amount / mx * bw) + '" cy="' + (y + 13) + '" r="5" fill="#' + (r.is_sba ? BR.amber : BR.peer_dot) + '"/>');
        s.push('<text x="' + ox + '" y="' + (y + 17) + '" font-size="12" font-weight="' + fw + '" fill="' + col + '">' + r.rank + '</text>');
        s.push('<text x="' + (ox + 24) + '" y="' + (y + 17) + '" font-size="12" font-weight="' + fw + '" fill="' + col + '">' + esc(r.display) + '</text>');
        s.push('<text x="' + (ox + PW) + '" y="' + (y + 17) + '" font-size="12" font-weight="' + fw + '" text-anchor="end" fill="' + col + '">' + esc(r.amount_fmt) + '</text>');
      });
    });
    return s.join('') + '</svg>';
  }
  function buildReport(m) {
    var M = m.meta, N = m.narrative, A = m.views.all, S = m.views.sa;
    var col = function (k) { return '#' + BR[k]; };
    var label = function (t, extra) { return '<p class="lab" style="' + (extra || '') + '">' + esc(t.toUpperCase()) + '</p>'; };
    var growthColor = function (v) { return v.vs_median === 'above' ? col('positive') : v.sba.grew ? col('ink') : col('negative'); };
    var moveColor = function (v) { return v.sba.move === 'up' ? col('positive') : v.sba.move === 'down' ? col('negative') : col('slate'); };
    var subs = Object.keys(CFG.subsidiaries).filter(function (b) { return A.assets.rows.some(function (r) { return r.bank === b; }); }).map(disp);
    var minCov = Math.min.apply(null, METRICS.map(function (x) { return M.coverage[x.key]; })), minCovP = Math.min.apply(null, METRICS.map(function (x) { return M.coverage_prior[x.key]; }));
    var head = ['Metric', '₱ million', 'Rank of ' + M.bank_count, 'Stand-alone rank', 'Growth since ' + M.prior_q, 'Peer median'];
    var score = '<table class="sc"><tr>' + head.map(function (h, i) { return '<th' + (i === 1 || i >= 4 ? ' class="n"' : '') + '>' + esc(h.toUpperCase()) + '</th>'; }).join('') + '</tr>' +
      METRICS.map(function (x) {
        var a = A[x.key], s = S[x.key];
        return '<tr><td><b>' + esc(a.label) + '</b></td><td class="n">' + esc(mn(a.sba.amount)) + '</td>' +
          '<td><b>' + esc(a.sba.rank_fmt) + '</b> <span style="font-size:8pt;color:' + moveColor(a) + '">' + esc(moveTxt(a)) + '</span></td>' +
          '<td><b>' + esc(s.sba.rank_fmt) + '</b> <span style="font-size:8pt;color:' + moveColor(s) + '">' + esc(moveTxt(s)) + '</span></td>' +
          '<td class="n"><b style="color:' + growthColor(a) + '">' + esc(a.sba.growth_fmt) + '</b></td><td class="n" style="color:' + col('slate') + '">' + esc(a.peer_median_fmt) + '</td></tr>';
      }).join('') + '</table>';
    var strengths = (N.strengths || []).length ? N.strengths.map(function (x) { return '<p class="bul"><span style="color:' + col('positive') + '">●</span>&nbsp; ' + esc(x) + '</p>'; }).join('')
      : '<p style="color:' + col('slate') + '">No metric outgrew the peer median this quarter; see the scorecard above.</p>';
    var method = [
      'Source: BSP thrift bank rankings as of ' + M.current_long + ', posted by BSP ' + M.posting_long + '; comparison balances as of ' + M.prior_long + '. Amounts in ₱ million, rounded half up to one decimal.',
      'Stand-alone view excludes subsidiaries of larger banking groups (in this table: ' + subs.join(', ') + '). Ranks are recomputed from the all-thrift figures, never copied by hand.',
      'Peer median is the median growth of the other banks present in both periods. The current table covers ' + minCov + ' of ' + M.bank_count + ' banks and the comparison table ' + minCovP + ', so medians reflect the overlap.'
    ];
    var css = 'body{font-family:Arial,sans-serif;font-size:9pt;color:' + col('ink') + '}p{margin:0 0 3pt}.lab{font-size:7.5pt;font-weight:bold;letter-spacing:1.5pt;border-bottom:1px solid ' + col('rule') + ';padding-bottom:2pt;margin:10pt 0 4.5pt}' +
      'table.sc{border-collapse:collapse;width:100%}table.sc th{background:#fff;color:' + col('muted') + ';font-size:7pt;letter-spacing:1pt;text-align:left;border-bottom:1px solid ' + col('rule') + ';padding:2.5pt 4pt}' +
      'table.sc td{font-size:9pt;border-bottom:1px solid ' + col('rule') + ';padding:2.5pt 4pt;background:#fff}.n{text-align:right}.bul{margin:0 0 3.5pt 11pt;text-indent:-11pt}.small{font-size:7pt;color:' + col('slate') + '}';
    return Promise.all([P.charts.toPng(svgQoq(m)), P.charts.toPng(svgLadders(m, 'all')), P.charts.toPng(svgLadders(m, 'sa'))]).then(function (png) {
      var img = function (name, p, wPt) { return '<p><img src="' + name + '" width="' + Math.round(wPt * 4 / 3) + '" height="' + Math.round(wPt * 4 / 3 * p.height / p.width) + '"></p>'; };
      var logo = (root.SBA_LOGOS || {}).color;
      var html = '<table style="width:100%;border-collapse:collapse"><tr><td style="width:40%;border:0">' + (logo ? '<img src="logo.png" width="170" height="84">' : '') + '</td>' +
        '<td style="text-align:right;border:0"><p style="font-size:7.5pt;font-weight:bold;letter-spacing:1.5pt;color:' + col('muted') + '">' + esc(M.doc_title.toUpperCase()) + '</p>' +
        '<p style="font-size:11pt;font-weight:bold">Thrift bank group, as of ' + esc(M.current_long) + '</p><p style="font-size:7.5pt;font-weight:bold;letter-spacing:1.5pt;color:' + col('slate') + '">CONFIDENTIAL</p></td></tr></table>' +
        '<p style="border-bottom:2.25pt solid ' + col('amber') + ';margin:0 0 6pt"></p>' +
        label('Summary', 'margin-top:3pt') + '<p style="font-size:15pt;font-weight:bold;margin-bottom:4.5pt">' + esc(N.headline) + '</p>' +
        (N.summary ? '<p style="font-size:9.5pt">' + esc(N.summary) + '</p>' : '') +
        '<p class="small">BSP thrift bank rankings posted ' + esc(M.posting_long) + '. Balances in ₱ million at ' + esc(M.current_long) + ', compared with ' + esc(M.prior_long) + '.</p>' +
        label('Scorecard of SBA') + score +
        '<p class="small" style="margin-top:3pt">Peer median: growth of the other banks present in both periods (' + A.assets.peer_median_n + ' in the all-thrift view). Growth above the median in green, contraction in red.</p>' +
        label(M.is_one_quarter ? 'Quarter-on-quarter comparison' : 'Movement, ' + M.prior_q + ' to ' + M.current_q) + img('chart_qoq.png', png[0], 497) +
        (N.qoq_paragraph ? '<p>' + esc(N.qoq_paragraph) + '</p>' : '') +
        '<br clear="all" style="page-break-before:always">' +
        label('Where SBA sits · all ' + M.bank_count + ' thrift banks', 'margin-top:0') + img('chart_ladders_all.png', png[1], 497) +
        label('Stand-alone thrift banks') + img('chart_ladders_sa.png', png[2], 497) +
        label('What is strong') + strengths + label('Method and sources') + method.map(function (x) { return '<p class="small">' + esc(x) + '</p>'; }).join('') +
        '<p class="small" style="margin-top:8pt;color:' + col('muted') + '">Source: BSP website · As of ' + esc(M.current_long) + ' · ' + M.bank_count + ' thrift banks · ₱ million · Posted by BSP ' + esc(M.posting_long) + ' · CONFIDENTIAL</p>';
      var images = [{ name: 'chart_qoq.png', dataUrl: png[0].dataUrl }, { name: 'chart_ladders_all.png', dataUrl: png[1].dataUrl }, { name: 'chart_ladders_sa.png', dataUrl: png[2].dataUrl }];
      if (logo) images.push({ name: 'logo.png', dataUrl: logo });
      return { title: M.doc_title, html: html, images: images, css: css };
    });
  }

  /* ======================= Excel figures (audit trail) ======================= */
  function buildExcel(m) {
    var M = m.meta, sheets = [{ name: 'Summary', cols: [34, 22, 22], rows: [
      [M.doc_title + ' · Sterling Bank of Asia'], [],
      ['As of', M.current_long], ['Compared with', M.prior_long], ['BSP posting date', M.posting_long], ['Thrift banks in table', M.bank_count], [],
      ['Metric', 'Rank (all thrift)', 'Rank (stand-alone)', '₱ million', 'Growth %', 'Peer median %', 'Peer median banks']
    ].concat(METRICS.map(function (x) {
      var a = m.views.all[x.key], s = m.views.sa[x.key];
      return [a.label, a.sba.rank, s.sba.rank, Math.round(a.sba.amount * 100) / 100, a.sba.growth === null ? null : Math.round(a.sba.growth * 1000) / 1000, a.peer_median === null ? null : Math.round(a.peer_median * 1000) / 1000, a.peer_median_n];
    })).concat([[], ['Previous-quarter source per metric']], METRICS.map(function (x) { return [x.label, M.prior_source[x.key] === 'workbook' ? 'old workbook (top 10)' : 'BSP PDF', M.files.pri[x.key]]; }),
      [[], ['Warnings']], m.warnings.map(function (w) { return [w]; })) }];
    ['all', 'sa'].forEach(function (view) {
      METRICS.forEach(function (x) {
        var v = m.views[view][x.key];
        sheets.push({ name: (view === 'all' ? 'All ' : 'SA ') + v.short, cols: [6, 34, 16, 10, 16, 10], rows: [
          ['Rank', 'Bank', M.current_q + ' (₱M)', 'Prior rank', M.prior_q + ' (₱M)', 'Growth %', 'Subsidiary']
        ].concat(v.rows.map(function (r) { return [r.rank, r.display, r.amount, r.prior_rank, r.prior_amount, r.growth === null ? null : Math.round(r.growth * 1000) / 1000, r.subsidiary ? 'yes' : '']; })) });
      });
    });
    return { sheets: sheets };
  }

  /* ======================= registration ======================= */
  var fileBase = function (prefix) { return function (m) { return prefix + m.meta.current_q.replace(' ', '_'); }; };
  P.registerSkill({
    id: 'industry-ranking',
    title: 'Industry Ranking',
    group: 'Benchmarking',
    status: 'ready',
    description: 'Thrift-bank ranking slide deck and 2-page President’s report from the BSP ranking PDFs.',
    inputs: [
      { key: 'current', label: 'This quarter: the four BSP thrift-bank PDFs', type: 'pdf', multiple: true, required: true,
        help: 'On the BSP website, open each thrift-bank ranking page (Total Assets, Stockholder’s Equity, Deposit Liabilities, Loans and Receivables), press Ctrl+P and choose Save as PDF. Add all four here. Keep a copy: BSP replaces these pages every quarter.' },
      { key: 'prior', label: 'Previous quarter: its four PDFs (or the old workbook)', type: 'pdf-or-excel', multiple: true, required: true,
        help: 'The same four pages saved last quarter. If one is missing, also add the old “Industry Ranking as of …” workbook; it fills the gap with its top 10 banks.' }
    ],
    params: [{ key: 'presented_by', label: 'Presented by (shown on the cover slide)', type: 'text', default: 'Marketing' }],
    validate: function (inputs, params) { var m = analyze(inputs, params); return m.errors || []; },
    analyze: analyze,
    rules: { status: 'DRAFT', note: 'Wording comes from fixed templates (no numeric thresholds). Review and edit it before saving.' },
    outputs: [
      { key: 'screen', label: 'Review', format: 'html', render: renderScreen },
      { key: 'deck', label: 'Slide deck (.html)', format: 'html-file', filename: fileBase('SBA_Industry_Ranking_'), render: buildDeck },
      { key: 'report', label: 'Word report', format: 'word', filename: fileBase('SBA_Industry_Ranking_Report_'), render: buildReport },
      { key: 'excel', label: 'Figures (Excel)', format: 'excel', filename: fileBase('SBA_Industry_Ranking_Figures_'), render: buildExcel }
    ]
  });

  /* exposed for checks only */
  root.__SBA_IR = { analyze: analyze, buildDeck: buildDeck };
})(typeof window !== 'undefined' ? window : globalThis);
