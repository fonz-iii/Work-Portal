/* core/files.js — folder connection, remembered handle, file-input + download fallback.
   Folder access only through the user-granted File System Access API prompt. */
(function (root) {
  'use strict';
  var P = root.Portal = root.Portal || {};

  var DB_NAME = 'sba-portal', STORE = 'handles', KEY = 'outputFolder';

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
          if (p === 'granted') files.dir = h; else files.pending = h;
        });
      }).catch(function (e) { files.lastError = String(e && e.message || e); })
        .then(notify);
    },

    /** Must be called from a click. Opens the browser's folder prompt. */
    connect: function () {
      if (!files.supported) return Promise.resolve(false);
      return root.showDirectoryPicker({ id: 'sba-portal', mode: 'readwrite' }).then(function (h) {
        files.dir = h; files.pending = null; files.lastError = '';
        return idbSet(KEY, h).catch(function () {}).then(function () { notify(); return true; });
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
        if (p === 'granted') { files.dir = h; files.pending = null; }
        notify();
        return p === 'granted';
      }, function (e) { files.lastError = String(e && e.message || e); notify(); return false; });
    },

    disconnect: function () {
      files.dir = null; files.pending = null;
      return idbDel(KEY).catch(function () {}).then(notify);
    },

    /** Save a Blob: into the connected folder if possible, else as a browser download.
        Resolves { where: 'folder'|'download', name, folder? }. */
    save: function (name, blob) {
      var dir = files.dir;
      if (!dir) { files.download(name, blob); return Promise.resolve({ where: 'download', name: name }); }
      return dir.getFileHandle(name, { create: true })
        .then(function (fh) { return fh.createWritable(); })
        .then(function (w) { return w.write(blob).then(function () { return w.close(); }); })
        .then(function () { return { where: 'folder', name: name, folder: dir.name }; })
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
