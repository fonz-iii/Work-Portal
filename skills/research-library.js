/* skills/research-library.js — Research Library (Market & Research): the rules behind research.html.
   Pure functions on window.RLIB (no DOM): which quarter a document belongs to, its group (your subfolders),
   its kind (for the preview) and the search over names and PDF text. The page reads the files from the
   portal folder's "Research Library" folder; nothing is copied or uploaded. Decided 2026-10-21 with Fons:
   quarter folders (2026-Q3), else a date in the file name, else the date the file was last saved; subfolders
   show as groups; every file is listed; PDFs and pictures preview in the portal; search covers names and the
   text inside PDFs. */
(function (root) {
  'use strict';
  var R = root.RLIB = {};
  R.ROOT = 'Research Library';
  var MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  var MON = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?';

  function q(y, m) { return y + '-Q' + (Math.floor((m - 1) / 3) + 1); }
  R.quarterOfMonth = q;
  R.quarterLabel = function (k) { var m = /^(\d{4})-Q([1-4])$/.exec(k || ''); return m ? 'Q' + m[2] + ' ' + m[1] : 'No date'; };

  // A folder named like a quarter: "2026-Q3", "2026 Q3", "2026Q3", "Q3 2026", "Q3-2026".
  R.quarterFolder = function (name) {
    var t = String(name || '').trim(), m = /^(20\d{2})\s*[-_ ]?\s*q([1-4])$/i.exec(t) || /^q([1-4])\s*[-_ ]?\s*(20\d{2})$/i.exec(t);
    if (!m) return null;
    return /^\d{4}$/.test(m[1]) ? m[1] + '-Q' + m[2] : m[2] + '-Q' + m[1];
  };

  // The quarter a file name points to, from a date in it; null when there is none.
  // Reads: 2026-Q3 / Q3 2026, 2026-09-30, 30 September 2026, September 30, 2026, September 2026 / Sep-2026.
  R.quarterInName = function (name) {
    var n = String(name || '').replace(/\.[a-z0-9]{1,5}$/i, ''), m;
    if ((m = /(?:^|[^0-9a-z])(20\d{2})\s*[-_ ]?\s*q([1-4])(?![0-9a-z])/i.exec(n))) return m[1] + '-Q' + m[2];
    if ((m = /(?:^|[^0-9a-z])q([1-4])\s*[-_ ]?\s*(20\d{2})(?!\d)/i.exec(n))) return m[2] + '-Q' + m[1];
    if ((m = /(?:^|\D)(20\d{2})[-_.](\d{1,2})[-_.](\d{1,2})(?!\d)/.exec(n)) && +m[2] >= 1 && +m[2] <= 12) return q(+m[1], +m[2]);
    if ((m = new RegExp('(?:^|[^a-z])' + MON + '[\\s_.,-]*(?:\\d{1,2}(?:st|nd|rd|th)?[\\s_.,-]+)?(20\\d{2})(?!\\d)', 'i').exec(n))) return q(+m[2], MONTHS.indexOf(m[1].toLowerCase()) + 1);
    if ((m = new RegExp('(?:^|\\D)\\d{1,2}(?:st|nd|rd|th)?[\\s_.-]+' + MON + '[\\s_.,-]+(20\\d{2})(?!\\d)', 'i').exec(n))) return q(+m[2], MONTHS.indexOf(m[1].toLowerCase()) + 1);
    return null;
  };

  // folders: the folder names between "Research Library" and the file. -> { quarter, how, group }
  // how: 'folder' (a quarter folder in its path), 'name' (a date in the file name), 'saved' (the date it was last saved).
  R.place = function (folders, name, lastModified) {
    var qi = -1, quarter = null;
    folders.forEach(function (f, i) { var k = R.quarterFolder(f); if (k && qi < 0) { qi = i; quarter = k; } });
    var group = folders.filter(function (f, i) { return i !== qi; }).join(' › ');
    if (quarter) return { quarter: quarter, how: 'folder', group: group };
    var k = R.quarterInName(name);
    if (k) return { quarter: k, how: 'name', group: group };
    var d = new Date(lastModified || 0);
    return { quarter: lastModified ? q(d.getFullYear(), d.getMonth() + 1) : null, how: 'saved', group: group };
  };

  R.KINDS = {
    pdf: { re: /\.pdf$/i, label: 'PDF', short: 'PDF' }, image: { re: /\.(png|jpe?g|gif|bmp|webp)$/i, label: 'Picture', short: 'IMG' },
    word: { re: /\.(docx|docm|doc|rtf)$/i, label: 'Word', short: 'DOC' }, excel: { re: /\.(xlsx|xlsm|xls|csv)$/i, label: 'Excel', short: 'XLS' },
    powerpoint: { re: /\.(pptx|pptm|ppt)$/i, label: 'PowerPoint', short: 'PPT' }, text: { re: /\.(txt|md)$/i, label: 'Text', short: 'TXT' }
  };
  R.kindOf = function (name) { for (var k in R.KINDS) if (R.KINDS[k].re.test(name)) return k; return 'other'; };
  // Office files the page can show as text (the newer formats only; .doc/.ppt are older binary files)
  R.textPreview = function (name) { return /\.(docx|docm|pptx|pptm|xlsx|xlsm|xls|csv|txt|md)$/i.test(name); };
  R.hidden = function (name) { return /^(~\$|\.|thumbs\.db$|desktop\.ini$)/i.test(name); };

  /* ---------- search: every word must appear in the name, folder, quarter or (for PDFs) the text ---------- */
  R.norm = function (s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); };
  R.terms = function (query) { return R.norm(query).split(/\s+/).map(function (t) { return t.replace(/^["'(]+|["'),.;:]+$/g, ''); }).filter(Boolean); };
  // doc: { name, group, quarter, text?: [page text] } -> null or { score, inName, pages: [page numbers], snippet }
  R.match = function (doc, terms) {
    if (!terms.length) return null;
    var head = R.norm(doc.name + ' ' + doc.group + ' ' + R.quarterLabel(doc.quarter) + ' ' + (doc.quarter || '')), pages = doc.normText || (doc.text ? doc.text.map(R.norm) : []);
    var inHead = terms.filter(function (t) { return head.indexOf(t) >= 0; });
    var hitPages = [];
    pages.forEach(function (p, i) { if (terms.every(function (t) { return head.indexOf(t) >= 0 || p.indexOf(t) >= 0; }) && terms.some(function (t) { return p.indexOf(t) >= 0; })) hitPages.push(i + 1); });
    var all = terms.every(function (t) { return head.indexOf(t) >= 0 || pages.some(function (p) { return p.indexOf(t) >= 0; }); });
    if (!all) return null;
    var snippet = '';
    if (hitPages.length && doc.text) snippet = R.snippet(doc.text[hitPages[0] - 1], terms);
    return { score: inHead.length * 10 + Math.min(hitPages.length, 9), inName: inHead.length === terms.length, pages: hitPages, snippet: snippet };
  };
  // ~160 characters of text around the first term found
  R.snippet = function (text, terms) {
    var t = String(text || '').replace(/\s+/g, ' '), n = R.norm(t), at = -1;
    terms.some(function (w) { at = n.indexOf(w); return at >= 0; });
    if (at < 0) return '';
    var a = Math.max(0, at - 70), b = Math.min(t.length, at + 90);
    return (a > 0 ? '…' : '') + t.slice(a, b).trim() + (b < t.length ? '…' : '');
  };

  R.size = function (b) { return b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : b >= 1024 ? Math.round(b / 1024) + ' KB' : (b || 0) + ' B'; };

  if (root.Portal && typeof root.Portal.registerSkill === 'function') {
    try { root.Portal.registerSkill({ id: 'research-library', title: 'Research Library', group: 'Market & Research', page: 'research.html', status: 'ready',
      description: 'Browse past studies and references by quarter and topic, search their names and the text inside PDFs, and preview them here.' }); } catch (e) { /* shell may use a stricter contract */ }
  }
})(typeof window !== 'undefined' ? window : globalThis);
