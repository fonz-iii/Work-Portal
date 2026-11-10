/* pages/rib.js — the RIB Advisory Generator page of the one-page app (was rib.html).
   Runs once, the first time the page is opened; `page` is its container in Marketing Portal.html. */
(function (root) {
  (root.Portal = root.Portal || {}).pages = root.Portal.pages || {};
  root.Portal.pages['rib'] = function (page) {
  'use strict';
  var R = window.RIB, U = R.util, $ = function (id) { return document.getElementById(id); };
  var S = { method: 'file', email: null, cat: 'system-maintenance', f: R.defaults('system-maintenance'), postDate: U.today(), editId: null, sourceFile: null,
            entries: [], store: null, filters: { cats: [], kw: '', from: '', to: '' }, catGuessed: false };

  // ---------------------------------------------------------------- helpers
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (k === 'class') el.className = v; else if (k === 'html') el.innerHTML = v; else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v); else if (v === true) el.setAttribute(k, ''); else if (v !== false && v != null) el.setAttribute(k, v);
    });
    (kids || []).forEach(function (c) { if (c != null) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(function () { t.classList.remove('show'); }, 2200); }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function catLabel(k) { var c = R.categories.filter(function (x) { return x.k === k; })[0]; return c ? c.label : k; }
  function stLabel(k) { var s = R.config.statuses.filter(function (x) { return x.k === k; })[0]; return s ? s.label : k; }
  function newId() { var d = new Date(); return U.iso(d).replace(/-/g, '') + '-' + [d.getHours(), d.getMinutes(), d.getSeconds()].map(function (n) { return (n < 10 ? '0' : '') + n; }).join('') + '-' + Math.random().toString(36).slice(2, 6); }
  function fmtDate(s) { return s ? U.long(U.pd(s)) : '—'; }
  function blobToDataURL(b) { return new Promise(function (res) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.readAsDataURL(b); }); }
  function dataURLToBlob(u) { var p = u.split(','), mime = /:(.*?);/.exec(p[0])[1], bin = atob(p[1]), a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: mime }); }
  function extOf(type) { return ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' })[type] || 'png'; }

  // ---------------------------------------------------------------- storage
  var IDB = (function () {
    var dbp;
    function db() { if (!dbp) dbp = new Promise(function (res, rej) { var r = indexedDB.open('sba-rib', 1); r.onupgradeneeded = function () { var d = r.result; d.createObjectStore('entries', { keyPath: 'id' }); d.createObjectStore('blobs'); d.createObjectStore('meta'); }; r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); return dbp; }
    function tx(store, mode, fn) { return db().then(function (d) { return new Promise(function (res, rej) { var t = d.transaction(store, mode), s = t.objectStore(store), q = fn(s); t.oncomplete = function () { res(q && q.result); }; t.onerror = function () { rej(t.error); }; }); }); }
    return {
      get: function (s, k) { return tx(s, 'readonly', function (o) { return o.get(k); }); },
      put: function (s, v, k) { return tx(s, 'readwrite', function (o) { return k === undefined ? o.put(v) : o.put(v, k); }); },
      del: function (s, k) { return tx(s, 'readwrite', function (o) { return o.delete(k); }); },
      all: function (s) { return tx(s, 'readonly', function (o) { return o.getAll(); }); }
    };
  })();

  var BrowserStore = {
    mode: 'browser', label: 'Saved in this browser only (this PC)',
    list: function () { return IDB.all('entries'); },
    save: function (e) { return IDB.put('entries', e); },
    remove: function (e) { return Promise.all([IDB.del('entries', e.id)].concat((e.screenshots || []).map(function (n) { return IDB.del('blobs', 'shot/' + n); }))); },
    putBlob: function (dir, name, blob) { return IDB.put('blobs', blob, dir + '/' + name); },
    getBlob: function (dir, name) { return IDB.get('blobs', dir + '/' + name); }
  };
  function FolderStore(root) {
    var base, dirs = {};
    function dir(name) { if (!dirs[name]) dirs[name] = base.then(function (b) { return b.getDirectoryHandle(name, { create: true }); }); return dirs[name]; }
    base = Portal.files.folder('RIB Advisories', true);   // Product Management\\RIB Advisories
    async function write(d, name, data) { var fh = await (await dir(d)).getFileHandle(name, { create: true }); var w = await fh.createWritable(); await w.write(data); await w.close(); }
    return {
      mode: 'folder', root: root, label: 'Saved in your portal folder: ' + root.name + ' › Product Management › RIB Advisories',
      list: async function () { var out = [], d = await dir('entries'); for await (var pair of d.entries()) { if (/\.json$/.test(pair[0])) { try { out.push(JSON.parse(await (await pair[1].getFile()).text())); } catch (e) { console.warn('Skipped', pair[0], e); } } } return out; },
      save: function (e) { return write('entries', e.id + '.json', JSON.stringify(e, null, 2)); },
      remove: async function (e) { await (await dir('entries')).removeEntry(e.id + '.json').catch(function () {}); var sd = await dir('screenshots'); for (var n of (e.screenshots || [])) await sd.removeEntry(n).catch(function () {}); },
      putBlob: function (d, name, blob) { return write(d === 'shot' ? 'screenshots' : 'emails', name, blob); },
      getBlob: async function (d, name) { try { return await (await (await dir(d === 'shot' ? 'screenshots' : 'emails')).getFileHandle(name)).getFile(); } catch (e) { return null; } }
    };
  }
  var urlCache = {};
  async function shotURL(name) { if (urlCache[name]) return urlCache[name]; var b = await S.store.getBlob('shot', name); if (!b) return ''; return (urlCache[name] = URL.createObjectURL(b)); }

  async function useStore(st) { S.store = st; urlCache = {}; S.entries = tidy(await st.list()); paintStore(); paintAll(); }
  function paintStore(pending) {
    var p = $('storePill'), b = $('btnFolder'), ban = $('banner');
    ban.classList.add('hide');
    if (pending) {
      p.className = 'warn'; p.textContent = 'Your portal folder needs permission.'; b.textContent = 'Allow folder';
      ban.innerHTML = ''; ban.appendChild(h('span', { text: 'Your portal folder needs permission again before the tracker and compilation can load.' }));
      ban.appendChild(h('button', { class: 'btn pri sm', text: 'Allow folder', onclick: reconnect })); ban.classList.remove('hide');
      return;
    }
    p.className = S.store && S.store.mode === 'folder' ? 'ok' : 'warn';
    p.textContent = S.store ? S.store.label : '—';
    b.textContent = S.store && S.store.mode === 'folder' ? 'Change' : 'Choose a portal folder to keep them safely';
    b.title = 'Advisories are kept in the RIB Advisories folder inside your portal folder.';
    b.classList.toggle('hide', !Portal.files.supported);
  }
  /* Storage uses the PORTAL folder (one grant for the whole portal): <portal folder>\RIB Advisories\entries|screenshots|emails.
     Without it, advisories are kept in this browser (BrowserStore) and can be moved into the folder later. */
  function connectFolder() { return Portal.files.connect(); }
  function reconnect() { return Portal.files.reconnect(); }
  async function moveLocalInto(fresh) {
    var local = tidy(await BrowserStore.list());
    if (!local.length || !confirm('Move ' + local.length + ' advisories saved in this browser into the portal folder?')) return;
    for (var e of local) { for (var n of (e.screenshots || [])) { var bl = await BrowserStore.getBlob('shot', n); if (bl) await fresh.putBlob('shot', n, bl); } await fresh.save(e); await BrowserStore.remove(e); }
  }
  var syncing = Promise.resolve();
  function syncStore() {
    syncing = syncing.then(async function () {
      var st = Portal.files.status();
      if (st === 'connected') {
        if (S.store && S.store.mode === 'folder' && S.store.root === Portal.files.dir) return;
        var fresh = FolderStore(Portal.files.dir);
        await moveLocalInto(fresh);
        return useStore(fresh);
      }
      if (st === 'needs-permission') { S.store = null; paintStore(true); paintAll(); return; }
      if (!S.store || S.store.mode !== 'browser') return useStore(BrowserStore);
    }).catch(function (e) { console.error(e); return useStore(BrowserStore); });
    return syncing;
  }
  function initStore() {
    Portal.files.onChange(function () { syncStore(); });    // connect / allow / disconnect later on
    return Portal.files.ready.then(syncStore);             // after the remembered folder has been checked
  }
  async function saveOut(name, blob) {
    var r = await Portal.files.save(name, blob, 'RIB Advisories');
    toast(r.where === 'folder' ? 'Saved to ' + r.folder : 'Downloaded ' + name);
  }

  // ---------------------------------------------------------------- source / email
  function setMethod(m) {
    S.method = m;
    Array.prototype.forEach.call($('methodSeg').children, function (b) { b.classList.toggle('on', b.dataset.m === m); });
    ['file', 'paste', 'form'].forEach(function (k) { $('m-' + k).classList.toggle('hide', k !== m); });
    if (m === 'form') { S.email = null; S.sourceFile = null; paintEmail(); }
  }
  async function readFile(file) {
    try {
      var buf = await file.arrayBuffer(), em;
      if (/\.msg$/i.test(file.name)) em = R.parseMsg(buf);
      else if (/\.eml$/i.test(file.name) || /rfc822/.test(file.type)) em = R.parseEml(buf);
      else throw new Error('Choose an .eml or .msg file.');
      S.sourceFile = file; loadEmail(em, file.name);
    } catch (err) { alert('Could not read the email: ' + err.message); }
  }
  function readPaste() {
    var t = $('pasteText').value.replace(/\r\n?/g, '\n'); if (!t.trim()) return;
    var m = /^\s*Subject:\s*(.+)$/mi.exec(t), from = /^\s*From:\s*(.+)$/mi.exec(t), dt = /^\s*(?:Sent|Date):\s*(.+)$/mi.exec(t);
    var subject = m ? m[1].trim() : t.trim().split('\n')[0];
    var body = m ? t.slice(t.indexOf(m[0]) + m[0].length) : t.split('\n').slice(1).join('\n');
    S.sourceFile = null;
    loadEmail({ subject: subject, from: from ? from[1].trim() : '', date: dt ? dt[1].trim() : '', body: body }, 'Pasted text');
  }
  function loadEmail(em, label) {
    S.email = em; S.email.label = label;
    var x = R.extract(em);
    S.cat = x.cat; S.f = x.f; S.catGuessed = true; clearEdit();
    if (x.cat === 'bsp-cpr') S.f.weekOf = R.sundayOf(S.postDate);
    S.editId = null;
    paintEmail(); paintCats(); paintForm(); paintPreview();
    toast('Email read. Check every field before copying.');
  }
  function paintEmail() {
    var b = $('emailBox'); b.innerHTML = '';
    if (!S.email) { b.classList.add('hide'); return; }
    b.classList.remove('hide');
    var dl = h('dl', null, [h('dt', { text: 'Source' }), h('dd', { text: S.email.label }), h('dt', { text: 'Subject' }), h('dd', { text: S.email.subject || '—' }), h('dt', { text: 'From' }), h('dd', { text: S.email.from || '—' }), h('dt', { text: 'Date' }), h('dd', { text: S.email.date || '—' })]);
    var det = h('details', null, [h('summary', { text: 'Show email text' }), h('pre', { text: S.email.body })]);
    b.appendChild(dl); b.appendChild(det);
  }

  // ---------------------------------------------------------------- category + form
  function paintCats() {
    var box = $('catChips'); box.innerHTML = '';
    R.categories.forEach(function (c) {
      box.appendChild(h('button', { class: 'chip' + (c.k === S.cat ? ' on' : ''), text: c.label, onclick: function () { setCat(c.k); } }));
    });
    $('catNote').textContent = S.catGuessed && S.email ? 'Picked from the email: ' + catLabel(S.cat) + '. Choose another if this is wrong.' : '';
    $('postDateLabel').textContent = S.cat === 'bsp-cpr' ? 'Release date (Prod)' : 'Posting date (Prod)';
  }
  function setCat(k) {
    if (k === S.cat) return;
    if (edited() && !confirm('Switch to ' + catLabel(k) + '? The text you typed in the preview will be replaced.')) return;
    clearEdit();
    S.cat = k; S.catGuessed = false;
    S.f = S.email ? R.extract(S.email, k).f : R.defaults(k);
    if (k === 'bsp-cpr') S.f.weekOf = R.sundayOf(S.postDate);
    paintCats(); paintForm(); paintPreview();
  }
  function bind(el, key, isCheck) {
    el.addEventListener(isCheck ? 'change' : 'input', function () {
      S.f[key] = isCheck ? el.checked : el.value;
      if (el.tagName === 'SELECT') paintForm();
      paintPreview();
    });
    return el;
  }
  function paintForm() {
    var box = $('formFields'); box.innerHTML = '';
    R.fields[S.cat].forEach(function (fd) {
      if (fd.show && !fd.show(S.f)) return;
      var wrap = h('div', { class: 'field' }), v = S.f[fd.k], id = 'f_' + fd.k;
      if (fd.type === 'check') { var cb = h('input', { type: 'checkbox', id: id }); cb.checked = v !== false && !!v; wrap.appendChild(h('label', { class: 'check' }, [bind(cb, fd.k, true), fd.label])); box.appendChild(wrap); return; }
      wrap.appendChild(h('label', { for: id, text: fd.label }));
      if (fd.type === 'text' || fd.type === 'date' || fd.type === 'time') { var inp = h('input', { type: fd.type, id: id }); inp.value = v || ''; wrap.appendChild(bind(inp, fd.k)); }
      else if (fd.type === 'textarea') { var ta = h('textarea', { id: id }); ta.value = v || ''; wrap.appendChild(bind(ta, fd.k)); }
      else if (fd.type === 'select' || fd.type === 'thanks') {
        var opts = fd.type === 'thanks' ? R.config.thanks.map(function (t) { return [t, t || '(none)']; }) : fd.opts;
        var sel = h('select', { id: id }); opts.forEach(function (o) { var val = Array.isArray(o) ? o[0] : o; var op = h('option', { value: val, text: Array.isArray(o) ? o[1] : o }); if (val === (v || '')) op.selected = true; sel.appendChild(op); });
        wrap.appendChild(bind(sel, fd.k));
      }
      else if (fd.type === 'datalist') {
        var dlId = id + '_l', inp2 = h('input', { type: 'text', id: id, list: dlId }); inp2.value = v || '';
        var dl = h('datalist', { id: dlId }); fd.opts.forEach(function (o) { dl.appendChild(h('option', { value: o })); });
        wrap.appendChild(bind(inp2, fd.k)); wrap.appendChild(dl);
      }
      else if (fd.type === 'windows') wrap.appendChild(windowsEditor());
      else if (fd.type === 'services') wrap.appendChild(servicesEditor());
      if (fd.hint) wrap.appendChild(h('div', { class: 'hint', text: fd.hint }));
      box.appendChild(wrap);
    });
  }
  function windowsEditor() {
    var box = h('div');
    S.f.windows.forEach(function (w, i) {
      function inp(type, key, label) { var e = h('input', { type: type }); e.value = w[key] || ''; e.addEventListener('input', function () { w[key] = e.value; paintPreview(); }); return h('div', null, [h('small', { text: label }), e]); }
      var del = h('button', { class: 'btn sm', text: 'Remove', title: 'Remove this window', onclick: function () { S.f.windows.splice(i, 1); if (!S.f.windows.length) S.f.windows.push({ date: '', start: '', endDate: '', end: '' }); paintForm(); paintPreview(); } });
      var endD = inp('date', 'endDate', 'End date'); endD.title = 'Leave blank for the same day (or the next day if the end time is earlier).';
      box.appendChild(h('div', { class: 'win' }, [inp('date', 'date', 'Start date'), inp('time', 'start', 'Start time'), endD, inp('time', 'end', 'End time'), del]));
    });
    box.appendChild(h('button', { class: 'btn sm', text: '+ Add another window', onclick: function () { S.f.windows.push({ date: '', start: '', endDate: '', end: '' }); paintForm(); } }));
    return box;
  }
  function servicesEditor() {
    var box = h('div', { class: 'svc' });
    R.config.services.forEach(function (s) {
      var cb = h('input', { type: 'checkbox' }); cb.checked = S.f.services.indexOf(s.k) >= 0;
      cb.addEventListener('change', function () { var a = S.f.services.filter(function (x) { return x !== s.k; }); if (cb.checked) a.push(s.k); S.f.services = a; paintPreview(); });
      box.appendChild(h('label', { class: 'check' }, [cb, s.label]));
    });
    var other = h('input', { type: 'text', placeholder: 'Other services, separated by commas' }); other.value = S.f.otherServices || '';
    other.addEventListener('input', function () { S.f.otherServices = other.value; paintPreview(); });
    return h('div', null, [box, h('div', { class: 'mt' }, [other])]);
  }

  // ---------------------------------------------------------------- who is preparing / updating (one value, shown in step 1 and in the tracker)
  var PEOPLE = ['Fons', 'Nicole'];
  function who() { return $('preparedBy').value.trim(); }
  function setWho(v) { $('preparedBy').value = v; ls('rib.preparedBy', v); paintWho(); paintPreview(); }
  function paintWho() {
    var v = who(), known = PEOPLE.indexOf(v) >= 0, oth = S.whoOther || (v && !known);
    Array.prototype.forEach.call(document.querySelectorAll('[data-who]'), function (box) {
      box.innerHTML = '';
      var sel = h('select', { 'aria-label': 'Prepared by', class: v ? '' : 'need' });
      [['', 'Choose your name…']].concat(PEOPLE.map(function (n) { return [n, n]; }), [['__other', 'Someone else…']]).forEach(function (o) {
        var op = h('option', { value: o[0], text: o[1] }); if (oth ? o[0] === '__other' : (known ? o[0] === v : !o[0])) op.selected = true; sel.appendChild(op);
      });
      var other = h('input', { type: 'text', placeholder: 'Type your name, then press Enter', class: oth ? '' : 'hide' }); other.value = v && !known ? v : '';
      sel.addEventListener('change', function () {
        S.whoOther = sel.value === '__other';
        setWho(S.whoOther && known ? '' : (S.whoOther ? v : sel.value));
        if (S.whoOther) { var o = box.querySelector('input'); if (o) o.focus(); }
      });
      other.addEventListener('change', function () { setWho(other.value.trim()); });
      box.appendChild(sel); box.appendChild(other);
    });
  }
  function needWho() {
    if (who()) return false;
    toast('First choose who you are (“You are” / Step 1).');
    var s = document.querySelector('#tab-' + (S.tab || 'new') + ' [data-who] select') || document.querySelector('[data-who] select'); if (s) s.focus();
    return true;
  }

  // ---------------------------------------------------------------- preview + checks
  var OUT = null;
  // Text typed into the preview: S.edit = { subject: string|null, body: inner HTML|null, base: what the form gave at that moment }.
  function edited() { return !!(S.edit && (S.edit.subject != null || S.edit.body != null)); }
  function clearEdit() { S.edit = null; }
  function cur() {   // the text actually copied and saved: typed edits win over the form
    var e = S.edit || {}, subject = e.subject != null ? e.subject : OUT.subject, inner = e.body != null ? e.body : OUT.inner;
    return { subject: subject, subjectHtml: R.subjectHtml(subject), inner: inner, html: R.wrapBody(inner), plain: e.body != null ? R.plainFromInner(inner) : OUT.plain, errors: OUT.errors };
  }
  function cleanInner(el) {   // keep text, line breaks, bold, italic, underline; nothing else
    function walk(n) {
      if (n.nodeType === 3) return U.esc(n.nodeValue.replace(/\u00a0/g, ' '));
      if (n.nodeType !== 1) return '';
      var t = n.tagName.toLowerCase(); if (t === 'br') return '<br>';
      if (/^(script|style|head|title|template|noscript|object|iframe)$/.test(t)) return '';   // their contents are not text
      var kids = Array.prototype.map.call(n.childNodes, walk).join(''), st = n.style || {};
      var tag = /^(b|strong)$/.test(t) || /bold|[6-9]00/.test(st.fontWeight || '') ? 'b' : /^(i|em)$/.test(t) || st.fontStyle === 'italic' ? 'i' : t === 'u' || /underline/.test(st.textDecoration || st.textDecorationLine || '') ? 'u' : '';
      if (tag && kids) kids = '<' + tag + '>' + kids + '</' + tag + '>';
      if (/^(div|p)$/.test(t)) kids = '<br>' + kids;   // a new line typed with Enter
      return kids;
    }
    var out = Array.prototype.map.call(el.childNodes, walk).join('');
    return out.replace(/^(<br>)+/, '').replace(/<(b|i|u)><\/\1>/g, '');
  }
  // Saved advisories are files that others with folder access (or another local page, through browser storage) could change:
  // their HTML is cleaned to text, line breaks, bold, italic and underline each time it is loaded, never used as stored.
  function safeInner(html) { var t = document.createElement('template'); t.innerHTML = String(html == null ? '' : html); return cleanInner(t.content); }
  function tidy(list) {
    (list || []).forEach(function (e) {
      if (e.bodyHtml != null) e.bodyHtml = R.wrapBody(safeInner(e.bodyHtml));
      if (e.edited && e.edited.body != null) e.edited.body = safeInner(e.edited.body);
    });
    return list;
  }
  function paintEditNote() {
    var on = edited(), b = on && S.edit.base;
    var stale = !!b && ((S.edit.subject != null && b.subject !== OUT.subject) || (S.edit.body != null && b.inner !== OUT.inner));
    $('editTextNote').classList.toggle('hide', !on); $('editTextNote').classList.toggle('stale', !!stale);
    $('editTextMsg').textContent = stale ? 'You changed the text by hand, and the form has changed since. Your typed text is kept; click Rebuild to use the form instead.' : 'You changed the text by hand. Your changes are kept when you save.';
    $('pvSubj').classList.toggle('edited', !!(on && S.edit.subject != null)); $('pvBody').classList.toggle('edited', !!(on && S.edit.body != null));
  }
  function onEdit(which) {
    if (!S.edit) S.edit = { subject: null, body: null, base: { subject: OUT.subject, inner: OUT.inner } };
    if (which === 'subject') S.edit.subject = $('pvSubj').textContent.replace(/\s+/g, ' ').trim();
    else S.edit.body = cleanInner($('pvBody'));
    paintPreview(true);
  }
  function paintPreview(fromTyping) {
    OUT = R.build(S.cat, S.f);
    var ps = $('pvSubj'), pb = $('pvBody'), C2 = cur();
    if (!fromTyping) {
      ps.textContent = C2.subject || '';
      pb.innerHTML = C2.inner;
    }
    paintEditNote();
    var list = R.checks(S.cat, S.f, C2, S.postDate), ul = $('checks'); ul.innerHTML = '';
    if (!list.length) ul.appendChild(h('li', { class: 'ok', text: 'No issues found. Still read it once before posting.' }));
    list.forEach(function (c) { ul.appendChild(h('li', { class: c[0], text: c[1] })); });
    var blocked = list.some(function (c) { return c[0] === 'error'; });
    $('btnSave').disabled = blocked || !S.store || !who(); $('cpRich').disabled = $('cpPlain').disabled = $('cpSubj').disabled = !C2.subject && !C2.plain;
    $('btnSave').textContent = S.editId ? 'Update in tracker' : 'Save to tracker';
    $('editNote').textContent = !who() ? 'Choose who is preparing it (Step 1) to save.' : blocked ? 'Fix the red item above to save.' : S.editId ? 'You are editing a saved advisory.' : (!S.store ? 'Waiting for storage…' : '');
    $('btnCancelEdit').classList.toggle('hide', !S.editId);
  }
  async function copyRich(html, plain) {
    try { await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([plain], { type: 'text/plain' }) })]); return true; } catch (e) {}
    var d = h('div', { contenteditable: 'true', html: html }); d.style.cssText = 'position:fixed;left:-9999px;top:0'; document.body.appendChild(d);
    var r = document.createRange(); r.selectNodeContents(d); var s = getSelection(); s.removeAllRanges(); s.addRange(r);
    var ok = document.execCommand('copy'); s.removeAllRanges(); d.remove(); return ok;
  }
  async function copyPlain(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch (e) {}
    var ta = h('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;left:-9999px'; document.body.appendChild(ta); ta.select(); var ok = document.execCommand('copy'); ta.remove(); return ok;
  }

  // ---------------------------------------------------------------- save / tracker
  async function saveCurrent() {
    if (!S.store) return;
    if (needWho()) return;
    var by = who(), now = new Date().toISOString(), e;
    if (S.editId) {
      e = S.entries.filter(function (x) { return x.id === S.editId; })[0];
      e.history.push({ status: e.status, at: now, by: by, note: 'Edited' });
    } else {
      e = { id: newId(), v: 1, status: 'drafted', history: [{ status: 'drafted', at: now, by: by }], screenshots: [], createdAt: now, preparedBy: by };
      if (S.email) e.source = { method: S.method, label: S.email.label, subject: S.email.subject, from: S.email.from, date: S.email.date };
      else e.source = { method: 'form' };
      if (S.sourceFile) { var fn = e.id + '-' + S.sourceFile.name.replace(/[^\w.\-]+/g, '_'); await S.store.putBlob('email', fn, S.sourceFile); e.source.file = fn; }
      S.entries.push(e);
    }
    Object.assign(e, { category: S.cat, fields: JSON.parse(JSON.stringify(S.f)), subject: cur().subject, bodyText: cur().plain, bodyHtml: cur().html, postDate: S.postDate, updatedAt: now });
    if (edited()) e.edited = JSON.parse(JSON.stringify(S.edit)); else delete e.edited;
    if (S.cat === 'bsp-cpr') e.weekOf = S.f.weekOf; else delete e.weekOf;
    if (e.status === 'prod') e.prodDate = e.prodDate || S.postDate;
    await S.store.save(e);
    var wasNew = !S.editId;
    S.editId = e.id; paintAll(); paintPreview(); toast(wasNew ? 'Saved to tracker' : 'Changes saved');
    $('savedPanel').classList.remove('hide'); $('savedPanel').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function openEntry(e) {
    S.editId = e.id; S.cat = e.category; S.f = JSON.parse(JSON.stringify(e.fields || R.defaults(e.category))); S.postDate = e.prodDate || e.postDate || U.today();
    S.edit = e.edited ? JSON.parse(JSON.stringify(e.edited)) : null;
    S.email = null; S.sourceFile = null; S.catGuessed = false; $('postDate').value = S.postDate;
    $('savedPanel').classList.add('hide');
    setMethod('form'); paintCats(); paintForm(); paintPreview(); switchTab('new'); scrollTo(0, 0);
  }
  function resetNew() {
    S.editId = null; S.email = null; S.sourceFile = null; S.cat = 'system-maintenance'; S.f = R.defaults(S.cat); S.postDate = U.today(); S.catGuessed = false; clearEdit();
    $('postDate').value = S.postDate; $('pasteText').value = ''; $('emailFile').value = '';
    $('savedPanel').classList.add('hide');
    setMethod('file'); paintEmail(); paintCats(); paintForm(); paintPreview();
  }
  async function advance(e) {
    var i = R.config.statuses.map(function (s) { return s.k; }).indexOf(e.status), next = R.config.statuses[i + 1];
    if (!next || needWho()) return;
    if (next.k === 'prod') return openProd(e);
    e.status = next.k; e.history.push({ status: next.k, at: new Date().toISOString(), by: who() }); e.updatedAt = new Date().toISOString();
    await S.store.save(e); paintAll(); toast('Updated: ' + stLabel(next.k));
  }
  async function undoStep(e) {
    var keys = R.config.statuses.map(function (s) { return s.k; }), i = keys.indexOf(e.status);
    if (i <= 0 || needWho()) return;
    if (!confirm('Move “' + (e.subject || 'this advisory') + '” back to “' + stLabel(keys[i - 1]) + '”?')) return;
    var now = new Date().toISOString();
    e.status = keys[i - 1]; e.history.push({ status: e.status, at: now, by: who(), note: 'Undone' }); e.updatedAt = now;
    await S.store.save(e); paintAll(); toast('Moved back to: ' + stLabel(e.status));
  }
  async function removeEntry(e) {
    if (!confirm('Delete "' + (e.subject || 'this advisory') + '"? This removes it from the tracker and compilation.')) return;
    await S.store.remove(e); S.entries = S.entries.filter(function (x) { return x !== e; }); if (S.editId === e.id) S.editId = null; paintAll(); paintPreview();
  }
  function paintTracker() {
    var box = $('trkTable'), chips = $('trkChips'); box.innerHTML = ''; chips.innerHTML = '';
    var open = S.entries.filter(function (e) { return e.status !== 'prod'; }).length, live = S.entries.length - open;
    [['open', 'Still in progress', open], ['prod', 'Posted on Prod', live], ['all', 'All', S.entries.length]].forEach(function (c) {
      chips.appendChild(h('button', { class: 'chip' + (S.trk === c[0] ? ' on' : ''), text: c[1] + ' (' + c[2] + ')', onclick: function () { S.trk = c[0]; paintTracker(); } }));
    });
    if (!S.store) { box.appendChild(h('div', { class: 'empty-state', text: 'Allow your portal folder (above) to see saved advisories.' })); return; }
    var q = $('trkSearch').value.trim().toLowerCase(), keys = R.config.statuses.map(function (x) { return x.k; });
    var rows = S.entries.filter(function (e) { return (S.trk === 'all' || (S.trk === 'prod') === (e.status === 'prod')) && (!q || (e.subject || '').toLowerCase().indexOf(q) >= 0); })
      .sort(function (a, b) { return (b.prodDate || b.postDate || '').localeCompare(a.prodDate || a.postDate || '') || (b.updatedAt || '').localeCompare(a.updatedAt || ''); });
    if (!rows.length) {
      box.appendChild(h('div', { class: 'empty-state', text: S.trk === 'open' ? 'Nothing in progress. Advisories you save in Step 1 appear here.' : 'No advisories here yet.' }));
      return;
    }
    rows.forEach(function (e) {
      var i = keys.indexOf(e.status), nx = R.config.statuses[i], last = e.history[e.history.length - 1] || {};
      var prog = h('ol', { class: 'prog' }, R.config.statuses.map(function (st, j) {
        return h('li', { class: j < i ? 'done' : j === i ? 'cur' : '' }, [h('span', { class: 'dot' }), h('span', { class: 'lbl', text: st.short || st.label })]);
      }));
      var acts = h('div', { class: 'trk-acts' }, [
        nx && nx.next ? h('button', { class: 'btn pri', text: nx.next, onclick: function () { advance(e); } }) : h('span', { class: 'live', text: '✓ Live since ' + fmtDate(e.prodDate) }),
        e.status === 'prod' ? h('button', { class: 'lnk', text: 'Screenshots / live date', onclick: function () { openProd(e); } }) : null,
        h('button', { class: 'lnk', text: 'Edit text', onclick: function () { openEntry(e); } }),
        i > 0 ? h('button', { class: 'lnk', text: 'Undo last step', onclick: function () { undoStep(e); } }) : null,
        h('button', { class: 'lnk danger', text: 'Delete', onclick: function () { removeEntry(e); } })
      ]);
      box.appendChild(h('article', { class: 'trk-card' }, [
        h('div', { class: 'trk-top' }, [h('span', { class: 'tag', text: catLabel(e.category) }), h('span', { class: 'note', text: (e.status === 'prod' ? 'Live: ' : 'Planned: ') + fmtDate(e.prodDate || e.postDate) + ' · Prepared by ' + (e.preparedBy || '—') })]),
        h('h3', { text: e.subject || '(no subject)' }),
        prog,
        h('div', { class: 'note', text: 'Last update: ' + stLabel(e.status) + (last.note === 'Undone' ? ' (moved back)' : '') + (last.by ? ' by ' + last.by : '') + (last.at ? ' · ' + new Date(last.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '') }),
        acts
      ]));
    });
  }

  // ---------------------------------------------------------------- Prod dialog
  var dlgEntry = null, dlgShots = [];
  function openProd(e) {
    dlgEntry = e; dlgShots = [];
    $('prodDate').value = e.prodDate || e.postDate || U.today(); $('shotThumbs').innerHTML = '';
    (e.screenshots || []).forEach(function (n) { shotURL(n).then(function (u) { if (u) $('shotThumbs').appendChild(h('img', { src: u, title: n })); }); });
    $('prodDlg').showModal(); setTimeout(function () { $('pasteZone').focus(); }, 50);
  }
  function addShot(blob) { dlgShots.push(blob); $('shotThumbs').appendChild(h('img', { src: URL.createObjectURL(blob) })); }
  async function saveProd() {
    var e = dlgEntry; if (!e) return;
    var d = $('prodDate').value; if (!d) { alert('Set the Prod posting date.'); return; }
    if (needWho()) return;
    var now = new Date().toISOString(), by = who();
    for (var b of dlgShots) { var n = e.id + '-' + (e.screenshots.length + 1) + '.' + extOf(b.type); await S.store.putBlob('shot', n, b); e.screenshots.push(n); }
    if (e.status !== 'prod') { e.status = 'prod'; e.history.push({ status: 'prod', at: now, by: by }); }
    e.prodDate = d; e.updatedAt = now;
    await S.store.save(e); $('prodDlg').close(); dlgEntry = null; paintAll(); toast('Marked as posted on Prod');
  }

  // ---------------------------------------------------------------- compilation
  function compRows() {
    var F = S.filters, kw = F.kw.toLowerCase();
    return S.entries.filter(function (e) {
      if (e.status !== 'prod') return false;
      if (F.cats.length && F.cats.indexOf(e.category) < 0) return false;
      if (F.from && (e.prodDate || '') < F.from) return false;
      if (F.to && (e.prodDate || '') > F.to) return false;
      if (kw && ((e.subject || '') + ' ' + (e.bodyText || '')).toLowerCase().indexOf(kw) < 0) return false;
      return true;
    }).sort(function (a, b) { return (b.prodDate || '').localeCompare(a.prodDate || ''); });
  }
  function filterSummary() {
    var F = S.filters, p = [];
    p.push(F.cats.length ? F.cats.map(catLabel).join(', ') : 'All categories');
    if (F.from || F.to) p.push((F.from ? fmtDate(F.from) : 'start') + ' to ' + (F.to ? fmtDate(F.to) : 'latest'));
    if (F.kw) p.push('keyword \u201c' + F.kw + '\u201d');
    return p.join(' · ');
  }
  function paintComp() {
    var cs = $('compCat');
    if (!cs.options.length) {
      cs.appendChild(h('option', { value: '', text: 'All kinds' }));
      R.categories.forEach(function (c) { cs.appendChild(h('option', { value: c.k, text: c.label })); });
    }
    cs.value = S.filters.cats[0] || '';
    var rows = compRows(), box = $('compList'); box.innerHTML = '';
    $('compCount').textContent = rows.length + ' advisor' + (rows.length === 1 ? 'y' : 'ies') + ' shown · ' + filterSummary();
    $('printSub').textContent = filterSummary() + ' · ' + rows.length + ' advisories · printed ' + U.long(new Date());
    if (!S.store) { box.appendChild(h('div', { class: 'empty-state', text: 'Allow your portal folder (above) to see the compilation.' })); return; }
    if (!rows.length) { box.appendChild(h('div', { class: 'empty-state', text: 'Nothing here yet. An advisory appears here once you mark it “Posted on Prod” in Step 2.' })); return; }
    rows.forEach(function (e) {
      var shots = h('div', { class: 'shots' });
      (e.screenshots || []).forEach(function (n) { shotURL(n).then(function (u) { if (u) shots.appendChild(h('img', { src: u, alt: 'Prod screenshot', onclick: function () { $('viewerImg').src = u; $('viewer').showModal(); } })); }); });
      box.appendChild(h('div', { class: 'entry' }, [
        h('div', null, [h('div', { class: 'date', text: fmtDate(e.prodDate) }), h('span', { class: 'tag', text: catLabel(e.category) }),
          e.weekOf ? h('div', { class: 'note', text: 'Week of ' + fmtDate(e.weekOf) }) : null,
          h('div', { class: 'no-print', style: 'margin-top:8px' }, [h('button', { class: 'btn sm', text: 'Add screenshot', onclick: function () { openProd(e); } })])]),
        h('div', null, [h('div', { class: 'paper' }, [h('div', { html: '<font face="Trebuchet MS" size="3"><b>' + U.esc(e.subject || '') + '</b></font>' }), h('div', { style: 'margin-top:10px', html: e.bodyHtml || '' })]), shots])
      ]));
    });
  }
  function b64utf8(s) { return btoa(unescape(encodeURIComponent(s))); }
  function wrap76(s) { return s.replace(/(.{76})/g, '$1\r\n'); }
  function imgSize(blob) { return new Promise(function (res) { var i = new Image(); i.onload = function () { res([i.naturalWidth, i.naturalHeight]); URL.revokeObjectURL(i.src); }; i.onerror = function () { res([600, 300]); }; i.src = URL.createObjectURL(blob); }); }
  async function exportWord() {
    var rows = compRows(); if (!rows.length) { alert('Nothing to export with the current filters.'); return; }
    var parts = [], n = 0, body = '';
    for (var e of rows) {
      var imgs = '';
      for (var name of (e.screenshots || [])) {
        var b = await S.store.getBlob('shot', name); if (!b) continue;
        var sz = await imgSize(b), w = Math.min(560, sz[0]), hgt = Math.round(sz[1] * w / sz[0]), loc = 'file:///C:/rib_files/img' + (++n) + '.' + extOf(b.type);
        parts.push({ loc: loc, type: b.type || 'image/png', data: (await blobToDataURL(b)).split(',')[1] });
        imgs += '<p><img width="' + w + '" height="' + hgt + '" src="' + loc + '"></p>';
      }
      body += '<table width="100%" style="border-collapse:collapse;margin-bottom:18pt"><tr><td width="22%" valign="top" style="border-top:1pt solid #E3A21A;padding:8pt 8pt 0 0;font-family:Segoe UI,Arial;font-size:10pt"><b style="color:#0E2A47">' + U.esc(fmtDate(e.prodDate)) + '</b><br><span style="color:#7A4E00">' + U.esc(catLabel(e.category)) + '</span>' + (e.weekOf ? '<br><span style="color:#5C6878">Week of ' + U.esc(fmtDate(e.weekOf)) + '</span>' : '') + '</td>' +
        '<td valign="top" style="border-top:1pt solid #E3A21A;padding-top:8pt"><p><font face="Trebuchet MS" size="3"><b>' + U.esc(e.subject || '') + '</b></font></p><p>' + (e.bodyHtml || '') + '</p>' + imgs + '</td></tr></table>';
    }
    var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>RIB Inbox Advisories</title><style>@page{margin:2cm}body{font-family:"Segoe UI",Arial;font-size:10pt}</style></head><body>' +
      '<h1 style="font-family:Segoe UI,Arial;font-size:18pt;color:#0E2A47;margin:0">RIB Inbox Advisories</h1><p style="color:#5C6878">' + U.esc(filterSummary()) + ' · ' + rows.length + ' advisories · as of ' + U.esc(U.long(new Date())) + '</p>' + body + '</body></html>';
    var bd = '----=_RIB_' + Date.now(), mht = 'MIME-Version: 1.0\r\nContent-Type: multipart/related; boundary="' + bd + '"; type="text/html"\r\n\r\n' +
      '--' + bd + '\r\nContent-Type: text/html; charset="utf-8"\r\nContent-Transfer-Encoding: base64\r\nContent-Location: file:///C:/rib.htm\r\n\r\n' + wrap76(b64utf8(html)) + '\r\n';
    parts.forEach(function (p) { mht += '--' + bd + '\r\nContent-Type: ' + p.type + '\r\nContent-Transfer-Encoding: base64\r\nContent-Location: ' + p.loc + '\r\n\r\n' + wrap76(p.data) + '\r\n'; });
    mht += '--' + bd + '--\r\n';
    await saveOut('RIB Inbox Advisories ' + U.today() + '.doc', new Blob([mht], { type: 'application/msword' }));
  }

  // ---------------------------------------------------------------- backup
  async function exportBackup() {
    var images = {};
    for (var e of S.entries) for (var n of (e.screenshots || [])) { var b = await S.store.getBlob('shot', n); if (b) images[n] = await blobToDataURL(b); }
    await saveOut('RIB advisories backup ' + U.today() + '.json', new Blob([JSON.stringify({ app: 'rib-advisories', v: 1, exportedAt: new Date().toISOString(), entries: S.entries, images: images })], { type: 'application/json' }));
  }
  async function importBackup(file) {
    try {
      var data = JSON.parse(await file.text()); if (data.app !== 'rib-advisories' || !Array.isArray(data.entries)) throw new Error('This is not an RIB advisories backup.');
      var added = 0, updated = 0, byId = {}; S.entries.forEach(function (e) { byId[e.id] = e; });
      for (var e of tidy(data.entries)) {
        var cur = byId[e.id]; if (cur && (cur.updatedAt || '') >= (e.updatedAt || '')) continue;
        for (var n of (e.screenshots || [])) if (data.images && data.images[n]) await S.store.putBlob('shot', n, dataURLToBlob(data.images[n]));
        await S.store.save(e); cur ? updated++ : added++;
      }
      S.entries = tidy(await S.store.list()); paintAll(); toast('Imported: ' + added + ' new, ' + updated + ' updated');
    } catch (err) { alert('Import failed: ' + err.message); }
  }

  // ---------------------------------------------------------------- tabs + wiring
  function switchTab(t) {
    S.tab = t;
    Array.prototype.forEach.call(document.querySelectorAll('.flow-step'), function (b) { b.classList.toggle('on', b.dataset.tab === t); b.setAttribute('aria-current', b.dataset.tab === t ? 'step' : 'false'); });
    ['new', 'tracker', 'compilation'].forEach(function (k) { $('tab-' + k).classList.toggle('hide', k !== t); });
    ls('rib.tab', t);
  }
  function paintAll() {
    $('nTracker').textContent = S.entries.filter(function (e) { return e.status !== 'prod'; }).length;
    $('nComp').textContent = S.entries.filter(function (e) { return e.status === 'prod'; }).length;
    paintTracker(); paintComp();
  }

  document.querySelectorAll('.flow-step').forEach(function (b) { b.addEventListener('click', function () { switchTab(b.dataset.tab); scrollTo({ top: 0, behavior: 'smooth' }); }); });
  $('methodSeg').addEventListener('click', function (ev) { var b = ev.target.closest('[data-m]'); if (b) setMethod(b.dataset.m); });
  $('emailFile').addEventListener('change', function () { if (this.files[0]) readFile(this.files[0]); });
  var drop = $('drop');
  ['dragenter', 'dragover'].forEach(function (n) { drop.addEventListener(n, function (ev) { ev.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (n) { drop.addEventListener(n, function (ev) { ev.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (ev) { var f = ev.dataTransfer.files[0]; if (f) readFile(f); });
  $('btnReadPaste').addEventListener('click', readPaste);
  $('postDate').addEventListener('input', function () { S.postDate = this.value; if (S.cat === 'bsp-cpr' && this.value) { S.f.weekOf = R.sundayOf(this.value); paintForm(); } paintPreview(); });
  // ---- editable preview
  try { document.execCommand('styleWithCSS', false, false); } catch (e) {}
  $('pvSubj').addEventListener('input', function () { onEdit('subject'); });
  $('pvSubj').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); ev.target.blur(); } });
  $('pvBody').addEventListener('input', function () { onEdit('body'); });
  [$('pvSubj'), $('pvBody')].forEach(function (el) {
    el.addEventListener('paste', function (ev) {   // paste words only, never outside styles
      ev.preventDefault(); var t = (ev.clipboardData || window.clipboardData).getData('text/plain') || '';
      if (el.id === 'pvSubj') t = t.replace(/\s+/g, ' ');
      document.execCommand('insertText', false, t);
    });
  });
  document.querySelectorAll('.rib .fmtbar [data-fmt]').forEach(function (b) {
    b.addEventListener('mousedown', function (ev) { ev.preventDefault(); });   // keep the selection in the text
    b.addEventListener('click', function () {
      var sel = getSelection(), pb = $('pvBody');
      if (!sel.rangeCount || !pb.contains(sel.anchorNode)) { toast('First select the words in the body you want to format.'); pb.focus(); return; }
      document.execCommand(b.getAttribute('data-fmt')); onEdit('body');
    });
  });
  document.addEventListener('selectionchange', function () {
    var pb = $('pvBody'), sel = getSelection(), inside = sel.rangeCount && pb.contains(sel.anchorNode);
    document.querySelectorAll('.rib .fmtbar [data-fmt]').forEach(function (b) { var on = false; try { on = inside && document.queryCommandState(b.getAttribute('data-fmt')); } catch (e) {} b.classList.toggle('on', !!on); });
  });
  $('btnRebuild').addEventListener('click', function () {
    if (!confirm('Replace the text you typed with the text built from the form?')) return;
    clearEdit(); paintPreview(); toast('Rebuilt from the form');
  });
  $('cpSubj').addEventListener('click', function () { copyPlain(cur().subject).then(function (ok) { toast(ok ? 'Subject copied' : 'Copy failed'); }); });
  $('cpRich').addEventListener('click', function () { copyRich(cur().html, cur().plain).then(function (ok) { toast(ok ? 'Body copied with formatting' : 'Copy failed'); }); });
  $('cpPlain').addEventListener('click', function () { copyPlain(cur().plain).then(function (ok) { toast(ok ? 'Body copied as plain text' : 'Copy failed'); }); });
  $('btnSave').addEventListener('click', function () { saveCurrent().catch(function (e) { alert('Save failed: ' + e.message); }); });
  $('btnNew').addEventListener('click', resetNew);
  $('btnFolder').addEventListener('click', function () { Portal.files.status() === 'needs-permission' ? reconnect() : connectFolder(); });
  $('trkSearch').addEventListener('input', paintTracker);
  $('goTrack').addEventListener('click', function () { switchTab('tracker'); scrollTo({ top: 0, behavior: 'smooth' }); });
  $('btnCancelEdit').addEventListener('click', resetNew);
  $('compCat').addEventListener('change', function () { S.filters.cats = this.value ? [this.value] : []; paintComp(); });
  $('compKw').addEventListener('input', function () { S.filters.kw = this.value.trim(); paintComp(); });
  $('compFrom').addEventListener('input', function () { S.filters.from = this.value; paintComp(); });
  $('compTo').addEventListener('input', function () { S.filters.to = this.value; paintComp(); });
  $('compClear').addEventListener('click', function () { S.filters = { cats: [], kw: '', from: '', to: '' }; $('compKw').value = $('compFrom').value = $('compTo').value = ''; paintComp(); });
  $('expWord').addEventListener('click', function () { exportWord().catch(function (e) { alert('Export failed: ' + e.message); }); });
  $('expPdf').addEventListener('click', function () { window.print(); });
  $('expBackup').addEventListener('click', function () { exportBackup().catch(function (e) { alert('Backup failed: ' + e.message); }); });
  $('impBackup').addEventListener('change', function () { if (this.files[0]) importBackup(this.files[0]); this.value = ''; });
  $('pasteZone').addEventListener('paste', function (ev) { Array.prototype.forEach.call(ev.clipboardData.items, function (it) { if (it.type.indexOf('image/') === 0) addShot(it.getAsFile()); }); ev.preventDefault(); });
  $('shotFiles').addEventListener('change', function () { Array.prototype.forEach.call(this.files, addShot); this.value = ''; });
  $('prodOk').addEventListener('click', function () { saveProd().catch(function (e) { alert('Save failed: ' + e.message); }); });
  $('prodCancel').addEventListener('click', function () { $('prodDlg').close(); });
  $('viewer').addEventListener('click', function () { $('viewer').close(); });

  $('preparedBy').value = ls('rib.preparedBy') || ''; S.trk = 'open'; paintWho();
  $('postDate').value = S.postDate;
  paintCats(); paintForm(); paintPreview();
  switchTab(ls('rib.tab') || 'new');
  initStore().catch(function (e) { console.error(e); useStore(BrowserStore); });
  };
})(window);
