/* core/files.js — folder connection, remembered handle, file-input + download fallback.
   Folder access only through the user-granted File System Access API prompt. */
(function (root) {
  'use strict';
  var P = root.Portal = root.Portal || {};

  var DB_NAME = 'sba-portal', STORE = 'handles', KEY = 'outputFolder';

  /* The portal folder: one folder the user picks once. The portal creates these subfolders inside it,
     reads each module's reference files from them, and saves outputs into Outputs\<module>. */
  var LAYOUT = ['Employee Info', 'QR Ph Billers', 'Industry Ranking', 'Outputs'];
  var README = 'SBA MARKETING PORTAL FOLDER\r\n\r\nPut each new file in its folder, then open the page in the portal. The portal uses the newest file by itself.\r\n\r\n' +
    'Employee Info      the phone directory Excel and the Code of Conduct PDF\r\n' +
    'QR Ph Billers      the P2B Biller Masterlist files (keep the previous one too; the newest is "this period")\r\n' +
    'Industry Ranking   one folder per quarter, named like 2026-Q3, holding that quarter\'s four BSP thrift PDFs\r\n' +
    '                   (the old "Industry Ranking as of ..." workbook may go in the previous quarter\'s folder)\r\n' +
    'Outputs            everything the portal saves, one folder per report\r\n\r\n' +
    'Files here stay on this computer. Do not upload them to GitHub or the shared portal folder.\r\n';
  var MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  var EXT = { excel: /\.(xlsx|xls|xlsm|csv)$/i, csv: /\.csv$/i, pdf: /\.pdf$/i, 'pdf-or-excel': /\.(pdf|xlsx|xls|xlsm)$/i, text: /\.txt$/i };

  /** Sort key from a name: '20260915' for dates, '2026Q3' for quarter folders; '' when there is none. */
  function nameKey(n) {
    var m = /(\d{4})-(\d{2})-(\d{2})/.exec(n);
    if (m) return m[1] + m[2] + m[3];
    m = /(?:^|\D)(\d{1,2})[\s_.-]+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s_.,-]+(\d{4})/i.exec(n);
    if (m) return m[3] + pad(MONTHS.indexOf(m[2].toLowerCase()) + 1) + pad(m[1]);
    m = /(?:^|[^a-z])(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s_.-]+(\d{1,2}),?[\s_.-]+(\d{4})/i.exec(n);
    if (m) return m[3] + pad(MONTHS.indexOf(m[1].toLowerCase()) + 1) + pad(m[2]);
    m = /(\d{4})\s*[-_ ]?\s*q([1-4])/i.exec(n) || /q([1-4])\s*[-_ ]?\s*(\d{4})/i.exec(n);
    if (m) return /^\d{4}$/.test(m[1]) ? m[1] + 'Q' + m[2] : m[2] + 'Q' + m[1];
    return '';
  }
  function pad(x) { return ('0' + x).slice(-2); }
  /** Newest first: by the date in the name, then by last-modified, then by name. */
  function newestFirst(a, b) {
    var ka = nameKey(a.name), kb = nameKey(b.name);
    if (ka !== kb) return ka < kb ? 1 : -1;
    var ta = a.file ? a.file.lastModified : 0, tb = b.file ? b.file.lastModified : 0;
    if (ta !== tb) return tb - ta;
    return a.name < b.name ? 1 : a.name > b.name ? -1 : 0;
  }
  function entries(dir) {
    var out = [];
    var it = dir.values(), step = function () {
      return it.next().then(function (r) {
        if (r.done) return out;
        var h = r.value, n = h.name;
        if (/^(~\$|\.)/.test(n)) return step();          // Office lock files, hidden files
        if (h.kind === 'directory') { out.push({ name: n, kind: 'folder', handle: h }); return step(); }
        return h.getFile().then(function (f) { out.push({ name: n, kind: 'file', handle: h, file: f }); return step(); });
      });
    };
    return step();
  }

  function idb() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function idbDo(mode, fn) {
    return idb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, mode), req = fn(tx.objectStore(STORE));
        tx.oncomplete = function () { db.close(); resolve(req && req.result); };
        tx.onerror = function () { db.close(); reject(tx.error); };
      });
    });
  }
  var idbGet = function (k) { return idbDo('readonly', function (s) { return s.get(k); }); };
  var idbSet = function (k, v) { return idbDo('readwrite', function (s) { return s.put(v, k); }); };
  var idbDel = function (k) { return idbDo('readwrite', function (s) { return s.delete(k); }); };

  var listeners = [];
  var files = P.files = {
    /** FileSystemDirectoryHandle with granted readwrite permission, or null. */
    dir: null,
    /** Stored handle still waiting for the user to re-grant permission. */
    pending: null,
    /** False when the API is missing (e.g. other browsers) or blocked by policy. */
    supported: typeof root.showDirectoryPicker === 'function',
    lastError: '',

    /** 'connected' | 'needs-permission' | 'none' | 'unsupported' */
    status: function () {
      if (!files.supported) return 'unsupported';
      if (files.dir) return 'connected';
      if (files.pending) return 'needs-permission';
      return 'none';
    },
    folderName: function () {
      var h = files.dir || files.pending;
      return h ? h.name : '';
    },
    onChange: function (fn) { listeners.push(fn); },

    /** On page load: restore the remembered handle. Permission re-prompt needs a click, so it waits in `pending`. */
    init: function () {
      if (!files.supported || !root.indexedDB) { files.supported = false; return Promise.resolve(); }
      return idbGet(KEY).then(function (h) {
        if (!h) return;
        return h.queryPermission({ mode: 'readwrite' }).then(function (p) {
          if (p === 'granted') { files.dir = h; return files.ensureLayout(); }
          files.pending = h;
        });
      }).catch(function (e) { files.lastError = String(e && e.message || e); })
        .then(notify);
    },

    /** Must be called from a click. Opens the browser's folder prompt. */
    connect: function () {
      if (!files.supported) return Promise.resolve(false);
      return root.showDirectoryPicker({ id: 'sba-portal', mode: 'readwrite' }).then(function (h) {
        files.dir = h; files.pending = null; files.lastError = '';
        return idbSet(KEY, h).catch(function () {}).then(files.ensureLayout).then(function () { notify(); return true; });
      }, function (e) {
        if (e && e.name === 'AbortError') return false;     // user cancelled
        files.lastError = (e && e.name === 'SecurityError')
          ? 'Folder access is blocked on this computer. Files will download instead.'
          : String(e && e.message || e);
        if (e && e.name === 'SecurityError') files.supported = false;
        notify();
        return false;
      });
    },

    /** Must be called from a click. Re-asks permission for the remembered folder. */
    reconnect: function () {
      var h = files.pending;
      if (!h) return files.connect();
      return h.requestPermission({ mode: 'readwrite' }).then(function (p) {
        if (p !== 'granted') { notify(); return false; }
        files.dir = h; files.pending = null;
        return files.ensureLayout().then(function () { notify(); return true; });
      }, function (e) { files.lastError = String(e && e.message || e); notify(); return false; });
    },

    disconnect: function () {
      files.dir = null; files.pending = null;
      return idbDel(KEY).catch(function () {}).then(notify);
    },

    layout: LAYOUT,
    nameKey: nameKey,

    /** Create the standard subfolders and READ ME.txt if they are missing. Never overwrites anything. */
    ensureLayout: function () {
      var dir = files.dir;
      if (!dir) return Promise.resolve();
      return Promise.all(LAYOUT.map(function (n) { return dir.getDirectoryHandle(n, { create: true }); }))
        .then(function () {
          return dir.getFileHandle('READ ME.txt').then(function () {}, function () {
            return dir.getFileHandle('READ ME.txt', { create: true }).then(function (fh) { return fh.createWritable(); })
              .then(function (w) { return w.write(README).then(function () { return w.close(); }); });
          });
        }).catch(function (e) { files.lastError = 'Could not set up the portal folder (' + (e && e.message || e) + ').'; });
    },

    /** Entries of a subfolder path like 'QR Ph Billers' or 'Industry Ranking/2026-Q3'; [] if it does not exist. */
    list: function (path) {
      if (!files.dir) return Promise.resolve([]);
      var parts = String(path || '').split(/[\\/]/).filter(Boolean), d = Promise.resolve(files.dir);
      parts.forEach(function (p) { d = d.then(function (h) { return h.getDirectoryHandle(p); }); });
      return d.then(entries, function () { return []; });
    },

    /** Find a skill input's files in the portal folder.
        source: { folder, match?: RegExp, pick?: 'newest'|'second', subfolder?: 'newest'|'second' }, type: the input type.
        -> { status: 'ok'|'no-folder'|'needs-permission'|'unsupported'|'not-found', files: File[], path, why } */
    find: function (source, type) {
      var st = files.status(), base = source.folder, extRe = EXT[type] || /./;
      if (st !== 'connected') return Promise.resolve({ status: st === 'none' ? 'no-folder' : st, files: [], path: base });
      var idx = (source.subfolder || source.pick) === 'second' ? 1 : 0;
      if (source.subfolder) {
        return files.list(base).then(function (es) {
          var subs = es.filter(function (e) { return e.kind === 'folder'; }).sort(newestFirst), sub = subs[idx];
          if (!sub) return { status: 'not-found', files: [], path: base, why: idx ? 'only one quarter folder' : 'no quarter folders' };
          return files.list(base + '/' + sub.name).then(function (fs) {
            var got = fs.filter(function (e) { return e.kind === 'file' && extRe.test(e.name); }).sort(function (a, b) { return a.name < b.name ? -1 : 1; });
            return { status: got.length ? 'ok' : 'not-found', files: got.map(function (e) { return e.file; }), path: base + '\\' + sub.name, why: idx ? 'previous quarter folder' : 'newest quarter folder' };
          });
        });
      }
      return files.list(base).then(function (es) {
        var all = es.filter(function (e) { return e.kind === 'file' && extRe.test(e.name); });
        var got = source.match ? all.filter(function (e) { return source.match.test(e.name); }) : all;
        if (!got.length && source.match && all.length === 1 && !idx) got = all;   // a single file of the right type is used even if its name differs
        got.sort(newestFirst);
        var f = got[idx];
        return f ? { status: 'ok', files: [f.file], path: base, why: idx ? 'the one before the newest, by date' : 'newest file, by date' } : { status: 'not-found', files: [], path: base, why: idx ? 'no older file' : 'no matching file' };
      });
    },

    /** Save a Blob: into the portal folder (Outputs\<sub> when given) if possible, else as a browser download.
        Resolves { where: 'folder'|'download', name, folder? }. */
    save: function (name, blob, sub) {
      var dir = files.dir;
      if (!dir) { files.download(name, blob); return Promise.resolve({ where: 'download', name: name }); }
      var target = sub ? dir.getDirectoryHandle('Outputs', { create: true }).then(function (o) { return o.getDirectoryHandle(sub, { create: true }); }) : Promise.resolve(dir);
      return target.then(function (d) { return d.getFileHandle(name, { create: true }); })
        .then(function (fh) { return fh.createWritable(); })
        .then(function (w) { return w.write(blob).then(function () { return w.close(); }); })
        .then(function () { return { where: 'folder', name: name, folder: dir.name + (sub ? '\\Outputs\\' + sub : '') }; })
        .catch(function (e) {
          files.lastError = 'Could not write to folder (' + (e && e.message || e) + '). Downloaded instead.';
          files.download(name, blob);
          return { where: 'download', name: name, error: files.lastError };
        });
    },

    download: function (name, blob) {
      var url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = name; a.style.display = 'none';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    },

    /** Plain <input type="file"> picker. Always available. Resolves File[] (empty if cancelled). */
    pick: function (opts) {
      opts = opts || {};
      return new Promise(function (resolve) {
        var input = document.createElement('input');
        input.type = 'file';
        if (opts.accept) input.accept = opts.accept;
        if (opts.multiple) input.multiple = true;
        input.style.display = 'none';
        input.addEventListener('change', function () { resolve(Array.prototype.slice.call(input.files || [])); input.remove(); });
        input.addEventListener('cancel', function () { resolve([]); input.remove(); });
        document.body.appendChild(input);
        input.click();
      });
    },

    /** Accept attribute for an input type in a skill's `inputs` list. */
    acceptFor: function (type) {
      return ({
        excel: '.xlsx,.xls,.xlsm,.csv',
        csv: '.csv',
        pdf: '.pdf,application/pdf',
        'pdf-or-excel': '.pdf,application/pdf,.xlsx,.xls,.xlsm',
        text: '.txt'
      })[type] || '';
    }
  };

  function notify() { listeners.forEach(function (fn) { try { fn(files.status()); } catch (e) { /* ignore */ } }); }
})(typeof window !== 'undefined' ? window : globalThis);
