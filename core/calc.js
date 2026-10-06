/* core/calc.js — shared metrics and number formatting. Pure functions, no DOM. */
(function (root) {
  'use strict';
  var P = root.Portal = root.Portal || {};

  var calc = P.calc = {
    sum: function (rows, col) {
      return rows.reduce(function (t, r) { return t + (Number(r[col]) || 0); }, 0);
    },

    /** { key: sum(col) } grouped by keyCol. */
    groupSum: function (rows, keyCol, col) {
      var out = {};
      rows.forEach(function (r) { var k = r[keyCol]; out[k] = (out[k] || 0) + (Number(r[col]) || 0); });
      return out;
    },

    /** Period-on-period change. pct is null when the previous value is 0 or missing. */
    change: function (cur, prev) {
      if (prev === null || prev === undefined) return { abs: null, pct: null };
      return { abs: cur - prev, pct: prev ? (cur - prev) / Math.abs(prev) * 100 : null };
    },

    share: function (part, total) { return total ? part / total * 100 : null; },

    /** Competition ranking (1,2,2,4), highest value = rank 1. Returns { key: rank }. */
    rank: function (map) {
      var keys = Object.keys(map).sort(function (a, b) { return map[b] - map[a]; });
      var out = {};
      keys.forEach(function (k, i) {
        out[k] = (i > 0 && map[k] === map[keys[i - 1]]) ? out[keys[i - 1]] : i + 1;
      });
      return out;
    },

    /** Positive = moved up the ranking. null if no previous rank. */
    rankMovement: function (cur, prev) {
      return (prev === null || prev === undefined) ? null : prev - cur;
    },

    /** "Q3 2026" -> "Q2 2026"; "Q1 2026" -> "Q4 2025". */
    prevQuarter: function (q) {
      var m = /^Q([1-4]) (\d{4})$/.exec(String(q).trim());
      if (!m) return null;
      var n = +m[1], y = +m[2];
      return n === 1 ? 'Q4 ' + (y - 1) : 'Q' + (n - 1) + ' ' + y;
    },

    round: function (v, dp) { var f = Math.pow(10, dp || 0); return Math.round(v * f) / f; }
  };

  P.fmt = {
    num: function (v, dp) {
      if (v === null || v === undefined || !isFinite(v)) return '—';
      // typographic minus (U+2212) for negatives
      return Number(v).toLocaleString('en-US', { minimumFractionDigits: dp || 0, maximumFractionDigits: dp || 0 }).replace(/^-/, '\u2212');
    },
    pct: function (v, dp) { return (v === null || v === undefined) ? '—' : P.fmt.num(v, dp === undefined ? 1 : dp) + '%'; },
    signedPct: function (v, dp) { return (v === null || v === undefined) ? '—' : (v > 0 ? '+' : '') + P.fmt.pct(v, dp); },
    signed: function (v, dp) { return (v === null || v === undefined) ? '—' : (v > 0 ? '+' : '') + P.fmt.num(v, dp); },
    /** ₱24,902.6M style (value already in millions). */
    peso: function (v, dp) { return (v === null || v === undefined) ? '—' : '\u20B1' + P.fmt.num(v, dp === undefined ? 1 : dp) + 'M'; },
    /** 1st, 2nd, 3rd, 10th */
    ordinal: function (n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); },
    move: function (v) { return v === null || v === undefined ? '—' : v > 0 ? '▲' + v : v < 0 ? '▼' + (-v) : '—'; }
  };

})(typeof window !== 'undefined' ? window : globalThis);
