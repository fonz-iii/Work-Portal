/* core/parse.js — Excel/CSV via SheetJS, PDF text via PDF.js.
   PDF.js worker is started from a Blob URL because file:// blocks worker script URLs. */
(function (root) {
  'use strict';
  var P = root.Portal = root.Portal || {};
  var workerReady = null;

  function readBuffer(file) {
    if (file.arrayBuffer) return file.arrayBuffer();
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
      r.readAsArrayBuffer(file);
    });
  }

  /** Lazy-load the 1 MB worker wrapper only when a PDF is actually parsed. */
  function ensurePdfWorker() {
    if (workerReady) return workerReady;
    workerReady = new Promise(function (resolve, reject) {
      if (!root.pdfjsLib) return reject(new Error('PDF.js is not loaded (vendor/pdf.min.js).'));
      function start() {
        var src = '(' + root.PDFJS_WORKER_FN.toString() + ')();';
        root.pdfjsLib.GlobalWorkerOptions.workerSrc =
          URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
        resolve();
      }
      if (root.PDFJS_WORKER_FN) return start();
      var base = (document.querySelector('script[src$="vendor/pdf.min.js"]') || {}).src || 'vendor/pdf.min.js';
      var s = document.createElement('script');
      s.src = base.replace(/pdf\.min\.js$/, 'pdf.worker.fn.js');
      s.onload = start;
      s.onerror = function () { reject(new Error('Could not load vendor/pdf.worker.fn.js')); };
      document.head.appendChild(s);
    });
    return workerReady;
  }

  /** Row objects with trimmed header names; blank cells become null. */
  function sheetRows(ws) {
    return root.XLSX.utils.sheet_to_json(ws, { defval: null, raw: true }).map(function (r) {
      var o = {};
      Object.keys(r).forEach(function (k) { o[String(k).trim()] = r[k]; });
      return o;
    });
  }

  var parse = P.parse = {
    /** -> { kind:'excel', name, sheetNames, sheets:{name:rows[]}, rows (first sheet) } */
    excel: function (file) {
      return readBuffer(file).then(function (buf) {
        var wb = root.XLSX.read(buf, { type: 'array', cellDates: true });
        var sheets = {};
        wb.SheetNames.forEach(function (n) { sheets[n] = sheetRows(wb.Sheets[n]); });
        return { kind: 'excel', name: file.name, sheetNames: wb.SheetNames, sheets: sheets, rows: sheets[wb.SheetNames[0]] || [] };
      });
    },

    /** -> { kind:'pdf', name, pages:[string] } */
    pdf: function (file) {
      return Promise.all([readBuffer(file), ensurePdfWorker()]).then(function (res) {
        return root.pdfjsLib.getDocument({ data: new Uint8Array(res[0]), isEvalSupported: false, disableFontFace: true }).promise;
      }).then(function (doc) {
        var jobs = [];
        for (var i = 1; i <= doc.numPages; i++) {
          jobs.push(doc.getPage(i).then(function (pg) { return pg.getTextContent(); }).then(function (tc) {
            return tc.items.map(function (it) { return it.str + (it.hasEOL ? '\n' : ''); }).join('');
          }));
        }
        return Promise.all(jobs);
      }).then(function (pages) { return { kind: 'pdf', name: file.name, pages: pages }; });
    },

    text: function (file) {
      return file.text().then(function (t) { return { kind: 'text', name: file.name, text: t }; });
    },

    /** Dispatch by the skill input's declared type. */
    input: function (def, file) {
      if (def.type === 'excel' || def.type === 'csv') return parse.excel(file);
      if (def.type === 'pdf') return parse.pdf(file);
      return parse.text(file);
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
