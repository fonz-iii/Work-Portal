/* core/validate.js — reusable checks. Every function returns an array of plain-language error strings. */
(function (root) {
  'use strict';
  var P = root.Portal = root.Portal || {};
  var MAX_LISTED = 5;

  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  P.validate = {
    /** Required inputs and params present (run by the shell before skill.validate). */
    required: function (skill, inputs, params) {
      var errs = [];
      (skill.inputs || []).forEach(function (d) {
        if (d.required && !inputs[d.key]) errs.push('Missing input: ' + d.label + '.');
      });
      (skill.params || []).forEach(function (d) {
        if (d.required !== false && (params[d.key] === undefined || params[d.key] === '')) errs.push('Missing setting: ' + d.label + '.');
      });
      return errs;
    },

    nonEmpty: function (rows, label) {
      return rows && rows.length ? [] : [label + ' has no data rows.'];
    },

    requireColumns: function (rows, cols, label) {
      if (!rows || !rows.length) return [];
      var have = Object.keys(rows[0]);
      var missing = cols.filter(function (c) { return have.indexOf(c) < 0; });
      return missing.length
        ? [label + ' is missing column(s): ' + missing.join(', ') + '. Found: ' + (have.join(', ') || 'none') + '.']
        : [];
    },

    /** Row numbers are Excel rows (header = row 1). */
    numeric: function (rows, col, label) {
      var bad = [];
      rows.forEach(function (r, i) { if (!isNum(r[col])) bad.push(i + 2); });
      if (!bad.length) return [];
      return [label + ': column "' + col + '" must be a number on row(s) ' +
        bad.slice(0, MAX_LISTED).join(', ') + (bad.length > MAX_LISTED ? ' and ' + (bad.length - MAX_LISTED) + ' more' : '') + '.'];
    },

    /** Quarter label like "Q3 2026". */
    quarter: function (v, label) {
      return /^Q[1-4] \d{4}$/.test(String(v || '').trim()) ? [] : [label + ': "' + v + '" is not a quarter like "Q3 2026".'];
    },

    noDuplicates: function (rows, keyCols, label) {
      var seen = {}, dup = [];
      rows.forEach(function (r, i) {
        var k = keyCols.map(function (c) { return r[c]; }).join('|');
        if (seen[k]) dup.push(i + 2); else seen[k] = true;
      });
      return dup.length ? [label + ': duplicate ' + keyCols.join(' + ') + ' on row(s) ' + dup.slice(0, MAX_LISTED).join(', ') + '.'] : [];
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
