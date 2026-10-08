/* skills/registry.js — ordered list of skill files to load.
   Adding a skill = add its file to skills/ and one line below. Core code does not change.
   A skill that registers an id already used by placeholders.js replaces that placeholder. */
(function (root) {
  'use strict';
  var SKILL_FILES = [
    'placeholders.js',        // menu tiles for modules not built yet
    'industry-ranking.js',    // Benchmarking: BSP thrift-bank ranking deck + report
    'qrph-p2b-directory.js',  // RIB: QR Ph P2B biller directory (Word + PDF)
    'demo-branch-deposits.js' // milestone 1 demo (synthetic data only)
  ];

  var P = root.Portal = root.Portal || {};
  var here = (document.currentScript && document.currentScript.src) || 'skills/registry.js';
  var base = here.replace(/registry\.js(\?.*)?$/, '');

  // Classic <script> tags (file:// safe). async=false keeps the listed order.
  P.skillsLoaded = Promise.all(SKILL_FILES.map(function (f) {
    return new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = base + f;
      s.async = false;
      s.onload = function () { resolve(); };
      s.onerror = function () { console.error('Could not load skill file: ' + f); resolve(); };
      document.head.appendChild(s);
    });
  }));
})(window);
