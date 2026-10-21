/* skills/registry.js — ordered list of skill files to load.
   Adding a skill = add its file to skills/ and one line below. Core code does not change.
   A skill that registers an id already used by placeholders.js replaces that placeholder. */
(function (root) {
  'use strict';
  var SKILL_FILES = [
    'industry-ranking.js',    // Market & Research: BSP thrift-bank ranking deck + report (first in its section)
    'placeholders.js',        // menu tiles for modules not built yet
    'research-library.js',    // Market & Research: Research Library (its own page, research.html; replaces its placeholder)
    'qrph-p2b-directory.js',  // Payments & Risk: QR Ph P2B biller directory (Word + PDF)
    'rib-advisory.js',        // Digital Banking: RIB Advisory Generator (its own page, rib.html)
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
