/* skills/demo-branch-deposits.js — MILESTONE 1 DEMO. Proves the skill contract end to end:
   Excel in -> validate -> metrics -> one chart -> on-screen report, Excel and Word export.
   Uses SYNTHETIC data only (samples/demo-branch-deposits.xlsx). Not a real SBA report. */
(function () {
  'use strict';
  var C = Portal.calc, F = Portal.fmt, R = Portal.rules, esc = function (s) { return Portal.ui.esc(s); };
  var COLS = ['Branch', 'Region', 'Quarter', 'Deposits'];

  var rules = {
    status: 'DRAFT',
    note: 'Demo placeholder bands for testing the engine only. Not SBA thresholds.',
    bands: {
      // quarter-on-quarter % change of total deposits
      totalGrowth: [
        { min: 5, label: 'strong growth', text: 'Total deposits reached PHP {total}M in {period}, up {pct} quarter on quarter ({band}).' },
        { min: 0, max: 5, label: 'modest growth', text: 'Total deposits reached PHP {total}M in {period}, up {pct} quarter on quarter ({band}).' },
        { min: -5, max: 0, label: 'slight decline', text: 'Total deposits were PHP {total}M in {period}, down {pct} quarter on quarter ({band}).' },
        { max: -5, label: 'significant decline', text: 'Total deposits fell to PHP {total}M in {period}, down {pct} quarter on quarter ({band}).' }
      ],
      // % change per branch, used to count branches per band
      branchGrowth: [
        { min: 5, label: 'grew strongly (5% or more)' },
        { min: 0, max: 5, label: 'grew modestly (0% to under 5%)' },
        { max: 0, label: 'declined' }
      ]
    }
  };

  function analyze(inputs, params) {
    var rows = inputs.data.rows, period = String(params.period).trim(), prevPeriod = C.prevQuarter(period);
    var cur = rows.filter(function (r) { return String(r.Quarter).trim() === period; });
    var prev = rows.filter(function (r) { return String(r.Quarter).trim() === prevPeriod; });
    var curMap = C.groupSum(cur, 'Branch', 'Deposits'), prevMap = C.groupSum(prev, 'Branch', 'Deposits');
    var hasPrev = prev.length > 0;
    var region = {};
    cur.forEach(function (r) { region[r.Branch] = r.Region; });

    var total = C.sum(cur, 'Deposits'), prevTotal = hasPrev ? C.sum(prev, 'Deposits') : null;
    var rankCur = C.rank(curMap), rankPrev = hasPrev ? C.rank(prevMap) : {};

    var branches = Object.keys(curMap).map(function (b) {
      var p = hasPrev && prevMap[b] !== undefined ? prevMap[b] : null, ch = C.change(curMap[b], p);
      return {
        branch: b, region: region[b], value: curMap[b], prev: p, abs: ch.abs, pct: ch.pct,
        share: C.share(curMap[b], total), rank: rankCur[b],
        prevRank: rankPrev[b] === undefined ? null : rankPrev[b],
        move: C.rankMovement(rankCur[b], rankPrev[b])
      };
    }).sort(function (a, b) { return a.rank - b.rank || a.branch.localeCompare(b.branch); });

    var regCur = C.groupSum(cur, 'Region', 'Deposits'), regPrev = C.groupSum(prev, 'Region', 'Deposits');
    var regions = Object.keys(regCur).sort().map(function (k) {
      var ch = C.change(regCur[k], hasPrev ? (regPrev[k] || 0) : null);
      return { region: k, value: regCur[k], prev: hasPrev ? (regPrev[k] || 0) : null, pct: ch.pct, share: C.share(regCur[k], total) };
    });

    var totalCh = C.change(total, prevTotal);
    var withPct = branches.filter(function (b) { return b.pct !== null; });
    var gainer = withPct.slice().sort(function (a, b) { return b.pct - a.pct; })[0] || null;
    var decliner = withPct.slice().sort(function (a, b) { return a.pct - b.pct; })[0] || null;

    // Commentary: every sentence is built from the computed values above.
    var commentary = [];
    if (totalCh.pct !== null) {
      commentary.push(R.sentence(rules, 'totalGrowth', totalCh.pct, { total: F.num(total, 1), period: period, pct: F.pct(Math.abs(totalCh.pct)) }));
    } else {
      commentary.push('Total deposits were PHP ' + F.num(total, 1) + 'M in ' + period + '. No ' + prevPeriod + ' data was supplied, so no quarter-on-quarter change is shown.');
    }
    if (branches.length) commentary.push(branches[0].branch + ' is the largest branch with PHP ' + F.num(branches[0].value, 1) + 'M, a ' + F.pct(branches[0].share) + ' share.');
    if (gainer && gainer.pct > 0) commentary.push(gainer.branch + ' grew fastest at ' + F.signedPct(gainer.pct) + '.');
    if (decliner && decliner.pct < 0) commentary.push(decliner.branch + ' had the largest decline at ' + F.signedPct(decliner.pct) + '.');
    if (withPct.length) {
      var counts = rules.bands.branchGrowth.map(function (b) {
        var n = withPct.filter(function (x) { return R.band(rules.bands.branchGrowth, x.pct) === b; }).length;
        return n + ' ' + (n === 1 ? 'branch' : 'branches') + ' ' + b.label;
      });
      commentary.push('Of ' + withPct.length + ' branches: ' + counts.join('; ') + '.');
    }

    return {
      period: period, prevPeriod: prevPeriod, hasPrev: hasPrev, source: inputs.data.name,
      total: total, prevTotal: prevTotal, totalAbs: totalCh.abs, totalPct: totalCh.pct,
      branchCount: branches.length, branches: branches, regions: regions,
      commentary: commentary.filter(Boolean), rulesStatus: rules.status
    };
  }

  /* ---------- shared rendering ---------- */
  function chartSvg(m) {
    return Portal.charts.hbar({
      title: 'Deposits by branch (PHP M)',
      data: m.branches.map(function (b) { return { label: b.branch, value: b.value, prev: b.prev }; }),
      seriesLabels: [m.period, m.prevPeriod],
      format: function (v) { return F.num(v, 0); },
      source: 'Source: ' + m.source + ' (synthetic demo data), ' + m.branchCount + ' branches, ' + m.period + ' vs ' + m.prevPeriod + '.'
    });
  }

  function branchTable(m) {
    var h = '<table><thead><tr><th class="n">Rank</th><th>Branch</th><th>Region</th><th class="n">' + esc(m.period) + ' (₱M)</th>' +
      '<th class="n">' + esc(m.prevPeriod) + ' (₱M)</th><th class="n">Change (%)</th><th class="n">Share (%)</th><th class="n">Rank move</th></tr></thead><tbody>';
    m.branches.forEach(function (b, i) {
      h += '<tr' + (i % 2 ? ' class="alt"' : '') + '><td class="n">' + b.rank + '</td><td>' + esc(b.branch) + '</td><td>' + esc(b.region) + '</td>' +
        '<td class="n">' + F.num(b.value, 1) + '</td><td class="n">' + F.num(b.prev, 1) + '</td><td class="n">' + F.signedPct(b.pct) + '</td>' +
        '<td class="n">' + F.pct(b.share) + '</td><td class="n">' + F.move(b.move) + '</td></tr>';
    });
    return h + '<tr class="total"><td></td><td><b>Total</b></td><td></td><td class="n"><b>' + F.num(m.total, 1) + '</b></td><td class="n"><b>' +
      F.num(m.prevTotal, 1) + '</b></td><td class="n"><b>' + F.signedPct(m.totalPct) + '</b></td><td class="n">100.0%</td><td></td></tr></tbody></table>';
  }

  function commentaryHtml(m) {
    return '<ul class="commentary">' + m.commentary.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul>' +
      (m.rulesStatus !== 'APPROVED' ? '<p class="draft">Commentary bands are DRAFT demo placeholders, not SBA thresholds.</p>' : '');
  }

  function fileBase(m) { return 'DEMO Branch Deposits ' + m.period; }

  Portal.registerSkill({
    id: 'demo-branch-deposits',
    title: 'Demo: Branch Deposits',
    group: 'Demo',
    status: 'demo',
    description: 'Synthetic data only. Proves the pipeline: Excel in, metrics, chart, Excel and Word out.',
    inputs: [
      { key: 'data', label: 'Branch deposits workbook', type: 'excel', required: true,
        help: 'Use samples/demo-branch-deposits.xlsx. Columns: Branch, Region, Quarter (e.g. "Q3 2026"), Deposits (PHP M).' }
    ],
    params: [{ key: 'period', label: 'Quarter', type: 'quarter', default: 'Q3 2026' }],

    validate: function (inputs, params) {
      var V = Portal.validate, rows = inputs.data.rows, label = inputs.data.name;
      var errs = V.nonEmpty(rows, label).concat(V.requireColumns(rows, COLS, label));
      if (errs.length) return errs;
      errs = errs.concat(V.numeric(rows, 'Deposits', label), V.noDuplicates(rows, ['Branch', 'Quarter'], label), V.quarter(params.period, 'Quarter'));
      var badQ = rows.filter(function (r) { return V.quarter(r.Quarter, '').length; }).length;
      if (badQ) errs.push(label + ': ' + badQ + ' row(s) have a Quarter value not written like "Q3 2026".');
      var period = String(params.period).trim();
      if (!errs.length && !rows.some(function (r) { return String(r.Quarter).trim() === period; })) {
        var found = rows.map(function (r) { return r.Quarter; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
        errs.push('No rows for ' + period + ' in ' + label + '. Quarters found: ' + found.join(', ') + '.');
      }
      return errs;
    },

    analyze: analyze,
    rules: rules,

    outputs: [
      { key: 'screen', label: 'On-screen report', format: 'html', render: function (m) {
        var kpi = function (label, value, sub, cls) { return '<div class="kpi"><span class="kpi-label">' + esc(label) + '</span><span class="kpi-value' + (cls ? ' ' + cls : '') + '">' + value + '</span><span class="kpi-sub">' + sub + '</span></div>'; };
        var arrow = m.totalAbs === null ? '' : m.totalAbs >= 0 ? '▲ ' : '▼ ';
        return '<div class="report"><p class="eyebrow">Synthetic demo · ' + esc(m.source) + '</p><h2>Branch deposits, ' + esc(m.period) + '</h2>' +
          '<div class="kpis">' +
          kpi('Total deposits', F.peso(m.total), arrow + F.peso(m.prevTotal) + ' in ' + esc(m.prevPeriod)) +
          kpi('Quarter-on-quarter', F.signedPct(m.totalPct), arrow + (m.totalAbs === null ? '—' : F.signed(m.totalAbs, 1) + 'M')) +
          kpi('Branches', String(m.branchCount), m.regions.length + ' regions') +
          kpi('Largest branch', esc(m.branches[0] ? m.branches[0].branch : '—'), m.branches[0] ? F.pct(m.branches[0].share) + ' share' : '', 'text') +
          '</div><h3>Highlights</h3>' + commentaryHtml(m) + '<div class="chart">' + chartSvg(m) + '</div><h3>Branch detail</h3>' + branchTable(m) + '</div>';
      } },

      { key: 'excel', label: 'Excel workbook', format: 'excel', filename: fileBase, render: function (m) {
        var r1 = function (v) { return v === null ? null : C.round(v, 1); };
        return { sheets: [
          { name: 'Summary', cols: [28, 18], rows: [
            ['SYNTHETIC DEMO DATA. Not an SBA report.'], [],
            ['Quarter', m.period], ['Previous quarter', m.prevPeriod], ['Source file', m.source],
            ['Total deposits (PHP M)', r1(m.total)], ['Previous total (PHP M)', r1(m.prevTotal)],
            ['QoQ change (PHP M)', r1(m.totalAbs)], ['QoQ change (%)', r1(m.totalPct)], ['Branches', m.branchCount], [],
            ['Commentary (rules: ' + m.rulesStatus + ')']].concat(m.commentary.map(function (c) { return [c]; })) },
          { name: 'Branches', cols: [6, 24, 12, 12, 12, 12, 10, 10, 8], rows: [
            ['Rank', 'Branch', 'Region', m.period + ' (PHP M)', m.prevPeriod + ' (PHP M)', 'Change (PHP M)', 'Change (%)', 'Share (%)', 'Rank move']
          ].concat(m.branches.map(function (b) { return [b.rank, b.branch, b.region, r1(b.value), r1(b.prev), r1(b.abs), r1(b.pct), r1(b.share), b.move]; })) },
          { name: 'Regions', cols: [16, 14, 14, 10, 10], rows: [
            ['Region', m.period + ' (PHP M)', m.prevPeriod + ' (PHP M)', 'Change (%)', 'Share (%)']
          ].concat(m.regions.map(function (g) { return [g.region, r1(g.value), r1(g.prev), r1(g.pct), r1(g.share)]; })) }
        ] };
      } },

      { key: 'word', label: 'Word report', format: 'word', filename: fileBase, render: function (m) {
        return Portal.charts.toPng(chartSvg(m)).then(function (png) {
          var w = 480, h = Math.round(png.height * w / png.width);
          return {
            title: 'Branch Deposits ' + m.period,
            images: [{ name: 'chart1.png', dataUrl: png.dataUrl }],
            html: '<p class="muted">SYNTHETIC DEMO DATA. Not an SBA report. Source: ' + esc(m.source) + '</p>' +
              '<h1>Branch Deposits, ' + esc(m.period) + '</h1>' +
              '<h2>Highlights</h2>' + m.commentary.map(function (c) { return '<p>• ' + esc(c) + '</p>'; }).join('') +
              '<p class="draft">Commentary bands are DRAFT demo placeholders, not SBA thresholds.</p>' +
              '<p><img src="chart1.png" width="' + w + '" height="' + h + '" alt="Deposits by branch"></p>' +
              '<h2>Branch detail</h2>' + branchTable(m)
          };
        });
      } }
    ]
  });
})();
