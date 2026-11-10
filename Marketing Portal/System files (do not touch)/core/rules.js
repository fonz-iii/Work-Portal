/* core/rules.js — evaluates a skill's `rules` block against computed values and returns commentary.
   Thresholds live in the skill's rules block (configuration), never here. Pure functions, no DOM. */
(function (root) {
  'use strict';
  var P = root.Portal = root.Portal || {};

  var rules = P.rules = {
    /** First band whose [min, max) contains v. A missing min/max is open-ended. */
    band: function (bands, v) {
      if (v === null || v === undefined || !bands) return null;
      for (var i = 0; i < bands.length; i++) {
        var b = bands[i];
        if ((b.min === undefined || b.min === null || v >= b.min) && (b.max === undefined || b.max === null || v < b.max)) return b;
      }
      return null;
    },

    /** "{name} grew {pct}" + {name:'X', pct:'5%'} -> "X grew 5%". Unknown keys are left visible. */
    fill: function (template, values) {
      return String(template).replace(/\{(\w+)\}/g, function (m, k) {
        return Object.prototype.hasOwnProperty.call(values, k) ? values[k] : m;
      });
    },

    /** One sentence for `value` using the named band set, or null if no band matches. */
    sentence: function (ruleSet, bandSet, value, values) {
      var b = rules.band(ruleSet.bands && ruleSet.bands[bandSet], value);
      if (!b) return null;
      var v = Object.assign({ band: b.label }, values || {});
      return rules.fill(b.text, v);
    },

    isDraft: function (ruleSet) { return !ruleSet || ruleSet.status !== 'APPROVED'; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
