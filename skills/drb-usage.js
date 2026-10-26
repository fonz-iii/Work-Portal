/* skills/drb-usage.js — DRB Usage (module 3): engine.
   Port of the Claude skill "drb-usage-report" (scripts/build_drb_usage.py): same inputs, same rules, same
   workbook ("DRB Usage Qn YYYY - Worked Figures.xlsx": Cover, Summary, Usage, Profile, Transactions,
   Channels, Billers_Banks, QR, Cards, QoQ, Checks, Sources, Method, Inputs and the data tabs), every figure a
   live formula. Cached values come from core/xlsx-calc.js instead of a LibreOffice recalc.
   Pure functions on window.DRB (no DOM); the page is drb-usage.html.
   PRIVACY: names, mobile numbers, emails, account and card numbers never go into the workbook
   (card numbers become CARD-00001 …). Real files are read on the office PC only. */
(function (root) {
  'use strict';
  var XW = root.XlsxW, XC = root.XlsxCalc;
  var DRB = root.DRB = {};

  /* ---------- look (same as the skill) ---------- */
  var NAVY = '0A2A66', AMBER = 'F5A623', CREAM = 'FFF6E6', INK = '16181D', SLATE = '5A626E', RULE = 'D8DCE2';
  var SRCFILL = 'E3EDF8', GREEN = '1F7A4D', RED = 'B3261E', WARN = '8F5300', PEER = 'C7CCD4';
  var INT = '#,##0;-#,##0;"–"', PCT = '0.0%';
  var CHG = '[Color10]▲ #,##0;[Red]▼ #,##0;"–"', PCHG = '[Color10]▲ 0.0%;[Red]▼ 0.0%;"–"', PTSF = '[Color10]▲ 0.0" pts";[Red]▼ 0.0" pts";"–"';
  var THIN = { style: 'thin', color: RULE }, NAVY_SIDE = { style: 'medium', color: NAVY };
  var REPORT = ['Summary', 'Usage', 'Profile', 'Transactions', 'Channels', 'Billers_Banks', 'QR', 'Cards', 'QoQ', 'Checks'];
  var DATA = ['Map', 'Lists', 'Data_Channels', 'Data_Idle', 'Data_CIF', 'Data_Txn'];
  var ORDER = ['Cover'].concat(REPORT, ['Sources', 'Method', 'Inputs'], DATA);
  var FTOB = 'Fund transfer to other bank', BP = 'Bills payment';
  var QRG = ['QR fund transfer to other bank', 'QR P2M', 'QR fund transfer to 3rd party account', 'QR fund transfer to own account', 'QR P2B', 'QR P2Micro'];
  var BANDS = [['Php 1 – 500', 0, 500], ['Php 501 – 1,000', 500, 1000], ['Php 1,001 – 50,000', 1000, 50000], ['Above Php 50,000', 50000, 1e15]];
  var ALLM = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var R0 = 8;

  function L(n) { return XC.colName(n); }
  function stop(msg) { var e = new Error(msg); e.stop = true; throw e; }
  function pyCmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }   // Python str ordering (code points; fine for BMP text)
  function tupleCmp(a, b) { for (var i = 0; i < a.length; i++) { var c = pyCmp(a[i], b[i]); if (c) return c; } return 0; }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function toNumber(s) {   // pd.to_numeric(errors="coerce")
    if (s === null || s === undefined) return NaN;
    if (typeof s === 'number') return s;
    var t = String(s).trim(); if (t === '' || /^0x/i.test(t)) return NaN;
    var n = Number(t); return isNaN(n) && /^[+-]?inf(inity)?$/i.test(t) ? NaN : n;
  }
  function pyFloat(n) {   // Python str(float)
    if (Number.isInteger(n) && Math.abs(n) < 1e16) return n.toFixed(1);
    var t = String(n);
    if (/e/.test(t)) { var m = /^(-?[\d.]+)e([+-])(\d+)$/.exec(t); if (m) t = (/\./.test(m[1]) ? m[1] : m[1] + '.0').replace(/\.0$/, Number.isInteger(+m[1]) ? '.0' : '') + 'e' + m[2] + (m[3].length < 2 ? '0' : '') + m[3]; }
    return t;
  }
  function nn(v) {   // the skill's nn(): blank -> None, whole floats -> int
    if (v === null || v === undefined || v === '' || (typeof v === 'number' && isNaN(v))) return null;
    return v;
  }
  // pandas turns these exact texts into blanks when it reads a file (its default na_values); copied so counts match the skill
  var NA_STR = new Set(['', '#N/A', '#N/A N/A', '#NA', '-1.#IND', '-1.#QNAN', '-NaN', '-nan', '1.#IND', '1.#QNAN', '<NA>', 'N/A', 'NA', 'NULL', 'NaN', 'None', 'n/a', 'nan', 'null']);
  function cell(v) {   // pandas dtype=str + strip: blanks stay null
    if (v === null || v === undefined) return null;
    if (typeof v === 'string' && NA_STR.has(v)) return null;
    if (v instanceof Date) return v.toISOString().slice(0, 19).replace('T', ' ');
    if (typeof v === 'number') return String(v);
    if (typeof v === 'boolean') return v ? 'True' : 'False';
    return String(v).trim();
  }

  /* =====================================================================
     1. The DRB Usage export, read row by row (streaming) and kept small.
        Mapping-dependent results are worked out in finish(), so a new transaction type can be mapped
        on screen without reading the 50 MB file again.
     ===================================================================== */
  var RAW_NEED = ['CIF_ID_NO', 'TRANSACTION_TYPE', 'TRANSACTION_MONTH', 'TRANSACTION STATUS', 'TRANSACTION SERVICE', 'BENEFICIARY BANK NAME',
    'BILLER/MERCHANT NAME', 'ACCOUNT_NUMBER', 'CARDTYPE', 'TRANSACTION_AMOUNT', 'GENDER', 'AGE', 'CIF_STAFF_TAGGING(Y/N)'];
  // The export's header row, as the skill's prep_raw.py finds it: the row with TRANSACTION_MONTH. Ms. Hong's file leaves the
  // first header (the transaction type) blank; the first unnamed column is then TRANSACTION_TYPE. -> column indexes, or null.
  function rawCols(cells) {
    var names = Array.from(cells, function (c) { return c === null || c === undefined ? '' : String(c).trim(); });
    if (names.indexOf('TRANSACTION_MONTH') < 0) return null;
    if (names.indexOf('TRANSACTION_TYPE') < 0) {
      var b = names.indexOf('');
      if (b < 0) stop('The DRB Usage export has no TRANSACTION_TYPE column and no unnamed column to use for it.');
      names[b] = 'TRANSACTION_TYPE';
    }
    if (names.indexOf('TRANSACTION STATUS') < 0) stop('This file has no TRANSACTION STATUS column: it looks like the RIB Usage layout, not the DRB Usage export. The Regular Extraction of RIB Usage Report goes in the RIB Inbox shared drive folder.');
    var cols = RAW_NEED.map(function (k) { return names.indexOf(k); });
    var miss = RAW_NEED.filter(function (k, i) { return cols[i] < 0; });
    if (miss.length) stop('Column(s) missing from the DRB Usage export: ' + miss.join(', ') + '.');
    return cols;
  }
  function headerKind(cells) {   // 'raw' | 'rib' | null for one row
    var v = Array.from(cells, function (c) { return c === null || c === undefined ? '' : String(c).trim(); });
    if (v.indexOf('TRANSACTION_MONTH') >= 0) { try { return rawCols(v) ? 'raw' : null; } catch (e) { return v.indexOf('STATUS') >= 0 && v.indexOf('CIF_ID_NO') >= 0 ? 'rib' : null; } }
    return v.indexOf('TRANSACTION_TYPE') >= 0 && v.indexOf('STATUS') >= 0 && v.indexOf('CIF_ID_NO') >= 0 ? 'rib' : null;
  }
  function RawAgg(tmap, months) { this.tmap = tmap || null; this.keep = months ? new Set(months.map(function (m) { return String(m).trim().slice(0, 3).toUpperCase(); })) : null; this.dropped = {}; this.ix = null; this.n = 0; this.pre = new Map(); this.cifs = new Map(); this.cardType = new Map(); this.cardSeen = new Set(); this.months = new Set(); }
  DRB.RawAgg = RawAgg;
  RawAgg.prototype.header = function (cols) {
    var names = cols.map(function (c) { return c === null || c === undefined ? '' : String(c).trim(); }), ix = {}, miss = [];
    RAW_NEED.forEach(function (k) { var i = names.indexOf(k); if (i < 0) miss.push(k); ix[k] = i; });
    if (miss.length) stop('This does not look like the DRB Usage export: column(s) ' + miss.join(', ') + ' not found.');
    this.ix = ix;
  };
  function band(a) {
    for (var i = 0; i < BANDS.length; i++) if (a > BANDS[i][1] && a <= BANDS[i][2]) return BANDS[i][0];
    return 'Not stated';
  }
  RawAgg.prototype.row = function (arr) {
    var ix = this.ix, g = function (k) { return cell(arr[ix[k]]); };
    var cif = g('CIF_ID_NO'); if (cif === null || cif === 'CIF_ID_NO') return;   // (a header repeated on a later sheet is skipped)
    var month = g('TRANSACTION_MONTH');
    // only this quarter's months are counted (the RIB Usage Report V2 also carries the first day of the next month)
    if (this.keep && !this.keep.has(String(month || '').trim().slice(0, 3).toUpperCase())) { this.dropped[month || '(blank)'] = (this.dropped[month || '(blank)'] || 0) + 1; return; }
    this.n++;
    var type = g('TRANSACTION_TYPE'), status = g('TRANSACTION STATUS'), acct = g('ACCOUNT_NUMBER') || '';
    var source = acct.length === 16 ? 'CARD' : acct.length > 0 ? 'ACCOUNT' : 'NONE';
    if (source === 'CARD') { this.cardSeen.add(acct); var ct = g('CARDTYPE'); if (ct !== null && !this.cardType.has(acct)) this.cardType.set(acct, ct); }
    // known types: keep the bank only for transfers to other banks and the biller only for bills payment (finish() would drop them anyway);
    // types not in the map keep everything until they are mapped
    var tm = this.tmap && this.tmap[type], cat = tm ? tm.category : null, keepB = !tm || cat === FTOB, keepP = !tm || cat === BP;
    var key = [month || '', type || '', status || '', g('TRANSACTION SERVICE') || '', keepB ? g('BENEFICIARY BANK NAME') || '' : '', keepP ? g('BILLER/MERCHANT NAME') || '' : '', source, source === 'CARD' ? acct : '', keepB ? band(toNumber(g('TRANSACTION_AMOUNT'))) : ''].join('\u0001');
    this.pre.set(key, (this.pre.get(key) || 0) + 1);
    var c = this.cifs.get(cif);
    if (!c) { c = { g: null, a: null, s: null, t: {} }; this.cifs.set(cif, c); }
    if (c.g === null) c.g = g('GENDER'); if (c.a === null) c.a = g('AGE'); if (c.s === null) c.s = g('CIF_STAFF_TAGGING(Y/N)');
    var tt = c.t[type] || (c.t[type] = [0, 0]); tt[0]++; if (status === 'SUCCESSFUL') tt[1]++;
    if (month) this.months.add(month);
  };
  // -> everything the workbook needs, for a given transaction map. unmapped: {type: rows} (stop and ask).
  RawAgg.prototype.finish = function (tmap) {
    var pre = [], unm = {};
    this.pre.forEach(function (n, k) { var p = k.split('\u0001'); p.push(n); pre.push(p); if (!(p[1] in tmap)) unm[p[1]] = (unm[p[1]] || 0) + n; });
    if (Object.keys(unm).length) return { unmapped: unm, N: this.n };
    var cat = function (t) { return tmap[t].category; }, fin = function (t) { return (tmap[t].financial || 'Yes') === 'Yes'; };
    var qr = function (t) { return tmap[t].qr_group || '-'; };
    var cards = Array.from(this.cardSeen).sort(pyCmp), cref = {}, cardType = this.cardType;
    cards.forEach(function (a, i) { cref[a] = 'CARD-' + String(i + 1).padStart(5, '0'); });
    var ctFirst = {}; cards.forEach(function (a) { ctFirst[cref[a]] = cardType.has(a) ? cardType.get(a) : 'Not stated'; });
    var cube = new Map(), okCat = {}, okCatOrder = [], cardCat = {}, cardCatOrder = [], billersOk = new Set(), banksOk = new Set(), okQr = {}, okN = 0, cardRows = 0, okCatAll = {};
    pre.forEach(function (p) {
      var month = p[0], type = p[1], status = p[2], svc = p[3], bank = p[4], biller = p[5], source = p[6], acct = p[7], bnd = p[8], n = p[9];
      var c = cat(type), isft = c === FTOB, ok = status === 'SUCCESSFUL';
      var cr = acct ? cref[acct] : '', ct = acct ? ctFirst[cr] : '';
      var key = [month, type, status, svc, isft ? bank : '', c === BP ? biller : '', source, cr, ct, isft ? bnd : ''];
      var ks = key.join('\u0001'), e = cube.get(ks);
      if (e) e.n += n; else cube.set(ks, { k: key, n: n });
      if (ok) {
        okN += n; if (!(c in okCat)) { okCat[c] = 0; okCatOrder.push(c); } okCat[c] += n;
        var q = qr(type); okQr[q] = (okQr[q] || 0) + n;
        if (c === BP && biller) billersOk.add(biller);
        if (isft && bank) banksOk.add(bank);
      }
      if (source === 'CARD') { cardRows += n; if (!(c in cardCat)) { cardCat[c] = 0; cardCatOrder.push(c); } cardCat[c] += n; }
    });
    var cubeRows = Array.from(cube.values()).sort(function (a, b) { return tupleCmp(a.k, b.k); });
    var cifRows = [], cifAny = 0, cifOk = 0, female = 0, male = 0;
    Array.from(this.cifs.keys()).sort(pyCmp).forEach(function (id) {
      var c = this.cifs.get(id), n = 0, f = 0, k = 0;
      Object.keys(c.t).forEach(function (t) { var x = c.t[t]; n += x[0]; if (fin(t)) { f += x[0]; k += x[1]; } });
      cifRows.push([id, c.g, c.a, c.s, n, f, k]); cifAny++; if (k > 0) cifOk++; if (c.g === 'F') female++; if (c.g === 'M') male++;
    }, this);
    var CATFIN = {};
    Object.keys(tmap).forEach(function (t) { var v = tmap[t]; CATFIN[v.category] = CATFIN[v.category] || (v.financial || 'Yes') === 'Yes'; });
    function byCount(counts, order) {   // value_counts(): highest first; ties in first-seen order
      return order.slice().sort(function (a, b) { return counts[b] - counts[a] || order.indexOf(a) - order.indexOf(b); });
    }
    var okOrder = byCount(okCat, okCatOrder);
    function order(fl) {
      var cs = okOrder.filter(function (c) { return CATFIN[c] === fl; });
      return cs.concat(Object.keys(CATFIN).filter(function (c) { return CATFIN[c] === fl && cs.indexOf(c) < 0; }).sort(pyCmp));
    }
    function uniq(set) {
      var seen = {}; Array.from(set).sort(pyCmp).forEach(function (x) { var l = x.toLowerCase(); if (!(l in seen)) seen[l] = x; });
      return Object.keys(seen).map(function (l) { return seen[l]; }).sort(function (a, b) { return pyCmp(a.toLowerCase(), b.toLowerCase()); });
    }
    var cardOrder = byCount(cardCat, cardCatOrder);
    var catsFin = order(true), catsOth = order(false), cats = catsFin.concat(catsOth);
    var catsCnt = {}; cats.forEach(function (c) { catsCnt[c] = okCat[c] || 0; });
    var qrCnt = {}; QRG.forEach(function (g) { qrCnt[g] = okQr[g] || 0; });
    return {
      N: this.n, cube: cubeRows, cifs: cifRows, cref: cref, cardRefs: cards.map(function (a) { return cref[a]; }), ctFirst: ctFirst,
      catsFin: catsFin, catsOth: catsOth, cats: cats, ccats: cardOrder.concat(cats.filter(function (c) { return cardOrder.indexOf(c) < 0; })),
      billers: uniq(billersOk), banks: uniq(banksOk), CATFIN: CATFIN, months: Array.from(this.months),
      expected: { rows: this.n, successful: okN, cif_any: cifAny, cif_ok: cifOk, female: female, male: male, cats: catsCnt, qr: qrCnt, card_rows: cardRows, cards: cards.length, cube_rows: cubeRows.length }
    };
  };

  /* =====================================================================
     2. Other sources
     ===================================================================== */
  // RIB Idle Accounts Report: header on row 6 (as the skill reads it); rolled up per CIF.
  // book: the parsed report (all sheets: past 65,536 rows it runs over several, and later sheets carry on with or without
  // their own header), or one sheet's grid.
  DRB.readIdle = function (src) {
    var grids = Array.isArray(src) ? [src] : src.sheetNames.map(function (n) { return src.grids[n] || []; });
    var names = function (r) { return Array.from(r || [], function (c) { return c === null || c === undefined ? '' : String(c).trim(); }); };
    var hdr = names(grids[0][5]);
    var ci = hdr.indexOf('CIF_ID_NO'), ai = hdr.indexOf('ACCOUNT_NUMBER'), ii = hdr.indexOf('IDLE'), bi = hdr.indexOf('ADB');
    if (ci < 0 || ii < 0 || bi < 0) stop('This does not look like the RIB Idle Accounts Report: CIF_ID_NO, IDLE and ADB were not found on row 6.');
    var parts = [{ g: grids[0], start: 6, ci: ci, ii: ii, bi: bi }];
    grids.slice(1).forEach(function (g) {
      var h = -1; for (var k = 0; k < Math.min(10, g.length); k++) if (names(g[k]).indexOf('CIF_ID_NO') >= 0) { h = k; break; }
      if (h >= 0) { var n = names(g[h]); parts.push({ g: g, start: h + 1, ci: n.indexOf('CIF_ID_NO'), ii: n.indexOf('IDLE'), bi: n.indexOf('ADB') }); }
      else parts.push({ g: g, start: 0, ci: ci, ii: ii, bi: bi });
    });
    // pandas reads the CIF column with type inference: if every value looks like a number it becomes a number
    // (leading zeros dropped; "123.0" when a blank row makes the column float). Each sheet is read on its own and then
    // joined (a number column stays a number column only when every sheet's is). Copied so the ids match the skill.
    parts.forEach(function (p) {
      p.last = p.g.length - 1;
      while (p.last >= p.start && !(p.g[p.last] || []).some(function (v) { return v !== null && v !== undefined && v !== ''; })) p.last--;
      p.hasNull = false; p.allNum = true; p.nonInt = false;
      for (var r = p.start; r <= p.last; r++) {
        var v = (p.g[r] || [])[p.ci];
        if (v === null || v === undefined || (typeof v === 'string' && NA_STR.has(v))) { p.hasNull = true; continue; }
        if (!(typeof v === 'number' || (typeof v === 'string' && /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(v)))) p.allNum = false;
        else if (!Number.isInteger(Number(v))) p.nonInt = true;
      }
      p.isFloat = p.hasNull || p.nonInt;
    });
    parts = parts.filter(function (p) { return p.last >= p.start; });
    var allNum = parts.every(function (p) { return p.allNum; }), anyFloat = parts.some(function (p) { return p.allNum && p.isFloat; });
    var idOf = function (p, v) {
      if (!p.allNum) return String(v).trim();
      var n = Number(v);
      return (allNum ? anyFloat : p.isFloat) ? pyFloat(n) : String(n);
    };
    var by = new Map(), acc = 0;
    parts.forEach(function (p) {
      for (var r = p.start; r <= p.last; r++) {
        var row = p.g[r] || [], id = row[p.ci];
        if (id === null || id === undefined || (typeof id === 'string' && NA_STR.has(id))) continue;
        id = idOf(p, id); acc++;
        var e = by.get(id); if (!e) { e = { acc: 0, bal: 0, idle: null }; by.set(id, e); }
        e.acc++;
        var b = toNumber(row[p.bi]); if (!isNaN(b)) e.bal += b;
        var d = toNumber(row[p.ii]); if (!isNaN(d) && (e.idle === null || d < e.idle)) e.idle = d;
      }
    });
    var rows = Array.from(by.keys()).sort(pyCmp).map(function (id) { var e = by.get(id); return [id, e.acc, Math.round(e.bal * 100) / 100, e.idle === null ? 0 : Math.trunc(e.idle)]; });
    return { rows: rows, accounts: acc };
  };
  // RIB Usage export (optional cross-check): rows across all sheets after the header row.
  // q = { year, months: ['JULY', …] }: only rows dated in the quarter are counted (the extraction run on the 1st also carries that day's rows)
  function RibAgg(q) {
    this.hdr = null; this.rows = 0; this.ok = 0; this.cifs = new Set(); this.ftob = 0; this.dropped = 0;
    this.keep = q ? new Set(q.months.map(function (m) { return q.year * 100 + MONTHS.indexOf(String(m).trim().toUpperCase()) + 1; })) : null;
  }
  var MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
  function yearMonth(v) {   // Excel serial, Date or text -> yyyymm, or null when unreadable
    if (v instanceof Date) return isNaN(v) ? null : v.getFullYear() * 100 + v.getMonth() + 1;
    if (typeof v === 'number') { var d = new Date(Math.round((v - 25569) * 864e5)); return d.getUTCFullYear() * 100 + d.getUTCMonth() + 1; }
    var t = String(v == null ? '' : v).trim(), m;
    if ((m = /^(\d{4})-(\d{1,2})-\d{1,2}/.exec(t))) return +m[1] * 100 + +m[2];
    if ((m = /^(\d{1,2})\/\d{1,2}\/(\d{4})/.exec(t))) return +m[2] * 100 + +m[1];
    return null;   // other spellings are left unread (and the row kept), as in the skill
  }
  RibAgg.prototype.row = function (r) {
    var vals = r.map(function (x) { return x === null || x === undefined ? '' : x; });
    if (this.hdr === null) {
      if (vals.indexOf('TRANSACTION_TYPE') >= 0) { this.hdr = vals.map(function (x) { return String(x).trim(); }); this.ci = this.hdr.indexOf('CIF_ID_NO'); this.si = this.hdr.indexOf('STATUS'); this.ti = this.hdr.indexOf('TRANSACTION_TYPE'); this.di = this.hdr.indexOf('TRANSACTION_DATE'); }
      return;
    }
    if (!vals.some(function (x) { return String(x).trim(); })) return;
    var cif = String(vals[this.ci] === undefined ? '' : vals[this.ci]).trim(); if (!cif.length) return;
    if (this.keep && this.di >= 0) { var ym = yearMonth(vals[this.di]); if (ym !== null && !this.keep.has(ym)) { this.dropped++; return; } }
    this.rows++; this.cifs.add(cif);
    var good = String(vals[this.si] === undefined ? '' : vals[this.si]).trim().toUpperCase().indexOf('SUCCESS') === 0, t = String(vals[this.ti] === undefined ? '' : vals[this.ti]).trim();
    if (good) { this.ok++; if (t === 'FUND TRANSFER TO OTHER BANK' || t === 'QR FUND TRANSFER TO OTHER BANK') this.ftob++; }
  };
  RibAgg.prototype.finish = function () {
    if (!this.hdr) stop('This does not look like the RIB Usage Report: no TRANSACTION_TYPE header found.');
    var r = { 'Rows': this.rows, 'Successful rows': this.ok, 'Distinct CIFs': this.cifs.size, 'Successful transfers to other banks': this.ftob };
    Object.defineProperty(r, 'dropped', { value: this.dropped });   // rows dated outside the quarter (not a workbook figure)
    return r;
  };
  DRB.readRib = function (book, q) {   // parsed .xls/.xlsx book: rows across all sheets after the header row
    var a = new RibAgg(q);
    book.sheetNames.forEach(function (sn) { (book.grids[sn] || []).forEach(function (r) { a.row(r); }); });
    return a.finish();
  };
  DRB.readRibXlsb = function (data, onProgress, q) {   // .xlsb, read as a stream of rows
    var a = new RibAgg(q);
    return DRB.xlsbRows(data, null, function (si, ri, cells) { a.row(cells); }, onProgress).then(function () { return a.finish(); });
  };
  // Monthly channel counts (ITCom DCB, DRB Reports, DRB DCB Stats).
  // Of the sheets whose names match (e.g. this month's and an earlier month's Insta-Peso-QR), the first with the row and all six months.
  function pullSheet(book, pat, label, occ, months6) {
    var re = new RegExp(pat, 'i'), sns = book.sheetNames.filter(function (s) { return re.test(s); }), why = [];
    if (!sns.length) stop("No sheet matching '" + pat.replace(/^\^/, '') + "' in " + book.name + '. Is this the right report?');
    for (var i = 0; i < sns.length; i++) {
      try { return { sn: sns[i].trim(), vals: pull(book.grids[sns[i]] || [], label, occ, months6, book.name) }; }
      catch (e) { if (!e.stop || sns.length === 1) throw e; why.push(sns[i].trim() + ': ' + e.message); }
    }
    stop(book.name + ': ' + why.join(' '));
  }
  function pull(g, label, occ, months6, fileName) {
    var hdr = null;
    for (var i = 0; i < g.length && !hdr; i++) {
      var hit = {}, n = 0;
      (g[i] || []).forEach(function (v, j) { if (typeof v === 'string') { var t = v.trim(); if (ALLM.indexOf(t.toUpperCase().slice(0, 3)) >= 0 && t.length <= 9) { if (!(t.toUpperCase().slice(0, 3) in hit)) n++; hit[t.toUpperCase().slice(0, 3)] = j; } } });
      if (n >= 3) hdr = hit;
    }
    var rows = g.filter(function (r) { return (r || []).slice(0, 4).some(function (v) { return typeof v === 'string' && v.trim().toLowerCase().indexOf(label.toLowerCase()) === 0; }); });
    if (!hdr || !rows.length) stop("Could not find '" + label + "' in " + fileName + '.');
    var miss = months6.filter(function (m) { return !(m in hdr); });
    if (miss.length) stop('Months ' + miss.join(', ') + " are missing for '" + label + "' in " + fileName + '. Use the quarter-end edition, which carries all six months.');
    var r = rows[occ < 0 ? rows.length + occ : occ];
    return months6.map(function (m) { var v = r[hdr[m]]; return typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : 0; });
  }

  /* =====================================================================
     3. The workbook (same layout as the skill)
     ===================================================================== */
  // input: { cfg, tmap, raw: RawAgg.finish() result, idle: readIdle() | null, rib: readRib() | null,
  //          books: { drb_summary, itcom_dcb, dcb_stats? } (parsed Excel books), today: Date }
  DRB.build = function (input) {
    var cfg = input.cfg, TMAP = input.tmap, RAW = input.raw, files = cfg.files || {};
    var DN = cfg.display || {};
    var dn = function (k) { return DN[k] || files[k] || k; };
    var wb = new XW.Workbook(), WS = {};
    ORDER.forEach(function (n) { WS[n] = wb.addSheet(n); WS[n].tabColor = n === 'Inputs' ? AMBER : DATA.indexOf(n) >= 0 ? PEER : NAVY; });

    // ---- cell styling, as the skill's S() ----
    function st(c) { return c.s || (c.s = {}); }
    function S(ws, ref, v, k, fmt, o) {
      o = o || {}; k = k || 'body';
      var c = ws.at(ref); if (v !== undefined && v !== null) set(c, v);
      var s = st(c), f = { name: 'Arial', size: 10, color: INK }, a = { v: 'center', wrap: !!o.wrap };
      if (k === 'title') { f.name = 'Georgia'; f.size = 18; f.bold = true; f.color = NAVY; }
      else if (k === 'sub') { f.color = SLATE; }
      else if (k === 'h2') { f.name = 'Georgia'; f.size = 13; f.bold = true; }
      else if (k === 'th') { f.bold = true; f.color = 'FFFFFF'; s.fill = NAVY; a.h = 'center'; a.wrap = true; }
      else if (k === 'num' || k === 'ref') { a.h = 'right'; s.numFmt = fmt || INT; s.border = { bottom: THIN }; if (k === 'ref') s.fill = SRCFILL; }
      else if (k === 'body' || k === 'refl') { s.border = { bottom: THIN }; if (k === 'refl') s.fill = SRCFILL; }
      else if (k === 'input') {
        f.color = '0000FF'; s.fill = CREAM; s.border = { bottom: THIN }; s.locked = false;
        if (typeof v === 'number' || typeof v === 'boolean' || v === null || v === undefined) { a.h = 'right'; s.numFmt = fmt || INT; }
      }
      else if (k === 'total') { f.bold = true; s.border = { top: NAVY_SIDE, bottom: THIN }; if (fmt) { a.h = 'right'; s.numFmt = fmt; } }
      else if (k === 'note') { f.size = 9; f.color = SLATE; }
      if (fmt && ['num', 'ref', 'input', 'total'].indexOf(k) < 0) { s.numFmt = fmt; a.h = 'right'; }
      if (o.bold !== undefined && o.bold !== null) f.bold = o.bold;
      if (o.color) f.color = o.color;
      if (o.align) a.h = o.align;
      s.font = clean(f); s.align = clean(a);
      return c;
    }
    function clean(o) { var r = {}; Object.keys(o).forEach(function (k) { if (o[k] !== undefined && o[k] !== false && o[k] !== null) r[k] = o[k]; }); return r; }
    function set(c, v) { if (typeof v === 'string' && v.charAt(0) === '=' && v.length > 1) { c.f = v.slice(1); c.v = null; } else { c.v = v; c.f = null; } }
    function put(ws, r, col, v) { var c = ws.atRC(r, col); if (v === undefined) v = null; set(c, v); return c; }
    function nm(name, ws, ref) {
      var m = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(ref);
      wb.defineName(name, ws.name + '!$' + m[1] + '$' + m[2] + (m[3] ? ':$' + m[3] + '$' + m[4] : ''));
    }
    // openpyxl merge: other cells reset, then the start cell's border copied to the range edges
    function merge(ws, ref) {
      var m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(ref), c1 = XC.colNum(m[1]), r1 = +m[2], c2 = XC.colNum(m[3]), r2 = +m[4];
      for (var r = r1; r <= r2; r++) for (var c = c1; c <= c2; c++) if (r !== r1 || c !== c1) { var x = ws.cell(r, c); if (x) { x.v = null; x.f = null; x.s = null; } }
      var start = ws.cell(r1, c1), b = start && start.s && start.s.border;
      if (b) ['top', 'left', 'right', 'bottom'].forEach(function (side) {
        if (!b[side]) return;
        for (var r = r1; r <= r2; r++) for (var c = c1; c <= c2; c++) {
          var edge = (side === 'top' && r === r1) || (side === 'bottom' && r === r2) || (side === 'left' && c === c1) || (side === 'right' && c === c2);
          if (!edge) continue;
          var x = ws.atRC(r, c), s = st(x); s.border = Object.assign({}, s.border || {}); s.border[side] = b[side];
        }
      });
      ws.merge(ref);
    }
    function mergeNote(ws, row, text, c2, k, h) {
      S(ws, 'B' + row, text, k || 'note', null, { wrap: true }); merge(ws, 'B' + row + ':' + c2 + row); ws.height(row, h || 26);
      ws.at('B' + row).s.align = { v: 'top', wrap: true };
    }
    function page(ws, title, sub, widths, what, last, legend) {
      last = last || 'I'; if (legend === undefined) legend = true;
      ws.gridLines = false; ws.width(1, 2);
      widths.forEach(function (w, i) { ws.width(i + 2, w); });
      if (title) { S(ws, 'B2', title, 'title'); ws.height(2, 28); }
      if (sub) S(ws, 'B3', sub, 'sub');
      if (what) {
        mergeNote(ws, 4, 'What this sheet shows:  ' + what, last, 'body', 30);
        for (var cc = 2; cc <= XC.colNum(last); cc++) st(ws.atRC(4, cc)).fill = CREAM;
      }
      if (legend) [['B', SRCFILL, 'Shaded blue: taken from a reference file'], ['D', CREAM, 'Cream: typed input (Inputs sheet)'], ['F', 'FFFFFF', 'White: calculated by formula']].forEach(function (x) {
        var c = ws.at(x[0] + '5'); set(c, '  ' + x[2]); var s = st(c); s.fill = x[1]; s.font = { name: 'Arial', size: 8, color: SLATE }; s.border = { left: THIN, right: THIN, top: THIN, bottom: THIN };
      });
      ws.page = { orientation: 'landscape', fitToWidth: 1, fitToHeight: (ws.name === 'Summary' || ws.name === 'Cover') ? 1 : 0, fitToPage: true };
      ws.footer = { left: 'Sterling Bank Online | Digital Retail Banking (DRB) – Usage Report', right: '&P' };
    }
    function head(ws, row, labels, col) { col = col || 2; labels.forEach(function (t, i) { S(ws, L(col + i) + row, t, 'th'); }); ws.height(row, 30); }
    function src(ws, row, text) { S(ws, 'B' + row, 'Source: ' + text, 'note'); }
    function ref(ws, c1, r1, c2, r2) { return XW.absRef(ws.name, L(c1) + r1 + (c2 ? ':' + L(c2) + r2 : '')); }
    function bar(ws, anchor, title, kind, h, w, series, cats, legend) {
      ws.charts.push({ type: 'bar', dir: kind === 'bar' ? 'bar' : 'col', title: title, h: h || 7.5, w: w || 16, series: series, cats: cats, legend: legend || null, anchor: anchor });
    }
    function donut(ws, anchor, title, data, cats, colors, h, w) {
      ws.charts.push({ type: 'doughnut', title: title, h: h || 7, w: w || 10, series: [{ ref: data }], cats: cats, colors: colors, legend: 'b', anchor: anchor, hole: 55 });
    }
    function chg(cur, pri) { return '=IF(OR(' + pri + '="",' + cur + '=""),"n/a",' + cur + '-' + pri + ')'; }
    function pchg(cur, pri) { return '=IF(OR(' + pri + '="",' + pri + '=0,' + cur + '=""),"n/a",' + cur + '/' + pri + '-1)'; }
    function pts(cur, pri) { return '=IF(OR(' + pri + '="",' + cur + '=""),"n/a",(' + cur + '-' + pri + ')*100)'; }
    function shade(ws, r0, r1, c0, c1, csrc) {
      for (var r = r0; r <= r1; r++) for (var c = c0; c <= c1; c++) { var s = st(ws.atRC(r, c)); s.font = { name: 'Arial', size: 9, color: INK }; if (c <= csrc) s.fill = SRCFILL; }
    }
    var N = RAW.N, cube = RAW.cube, cats_fin = RAW.catsFin, cats_oth = RAW.catsOth, cats = RAW.cats;
    var OKC = 'tx_status,"SUCCESSFUL"', ws, i, r_;

    // ================================================================== Data_Txn
    ws = WS.Data_Txn;
    page(ws, 'Transaction export, summarised', 'Source: ' + dn('raw') + '. Each row is one unique combination of the fields below; ROWS is how many transactions share it.',
      [11, 40, 13, 13, 34, 28, 10, 12, 11, 18, 9, 36, 30, 11], 'every transaction in the quarter\'s export, grouped so the file stays small. Columns B to L are taken from the export (blue); M to O are formulas that look up the report category, QR group and financial flag on the Map sheet.', 'O');
    head(ws, 7, ['MONTH', 'TRANSACTION TYPE (as exported)', 'STATUS', 'SERVICE', 'BENEFICIARY BANK (transfers to other banks only)', 'BILLER (bills payment only)', 'SOURCE',
      'CARD REF', 'CARD TYPE', 'AMOUNT BAND (transfers to other banks only)', 'ROWS', 'REPORT CATEGORY', 'QR GROUP', 'FINANCIAL?']);
    cube.forEach(function (row, j) {
      var r = R0 + j;
      row.k.forEach(function (v, x) { put(ws, r, 2 + x, v !== '' ? v : null); });
      put(ws, r, 12, row.n);
      put(ws, r, 13, '=IFERROR(INDEX(map_cat,MATCH(C' + r + ',map_type,0)),"UNMAPPED")'); put(ws, r, 14, '=IFERROR(INDEX(map_qr,MATCH(C' + r + ',map_type,0)),"-")'); put(ws, r, 15, '=IFERROR(INDEX(map_fin,MATCH(C' + r + ',map_type,0)),"No")');
    });
    var TL = R0 + cube.length - 1; shade(ws, R0, TL, 2, 15, 12);
    ws.freezeAt = 'C' + R0; ws.filter = 'B7:O' + TL;
    [['tx_month', 'B'], ['tx_type', 'C'], ['tx_status', 'D'], ['tx_service', 'E'], ['tx_bank', 'F'], ['tx_biller', 'G'], ['tx_source', 'H'], ['tx_card', 'I'], ['tx_ctype', 'J'], ['tx_band', 'K'], ['tx_n', 'L'], ['tx_cat', 'M'], ['tx_qr', 'N'], ['tx_fin', 'O']]
      .forEach(function (x) { nm(x[0], ws, x[1] + R0 + ':' + x[1] + TL); });

    // ================================================================== Data_CIF
    ws = WS.Data_CIF;
    page(ws, 'CIFs with financial transactions', 'Source: ' + dn('raw') + '. One row per CIF in the export, with its gender, age and staff tag as exported.',
      [24, 10, 8, 11, 15, 16, 17], 'each client (CIF) with any online activity in the quarter, listed once, with how many of its rows are financial transactions (money movements). Profile and Usage count from this list.', 'H');
    head(ws, 7, ['CIF_ID_NO', 'GENDER', 'AGE', 'STAFF TAG', 'ALL ACTIVITY ROWS', 'FINANCIAL ROWS (any status)', 'SUCCESSFUL FINANCIAL ROWS']);
    RAW.cifs.forEach(function (r, j) {
      var row = R0 + j, age = toNumber(r[2]);
      put(ws, row, 2, r[0]); put(ws, row, 3, nn(r[1])); put(ws, row, 4, isNaN(age) ? null : age); put(ws, row, 5, nn(r[3])); put(ws, row, 6, r[4]); put(ws, row, 7, r[5]); put(ws, row, 8, r[6]);
    });
    var CL = R0 + RAW.cifs.length - 1; shade(ws, R0, CL, 2, 8, 8);
    ws.freezeAt = 'C' + R0; ws.filter = 'B7:H' + CL;
    [['cif_id', 'B'], ['cif_gender', 'C'], ['cif_age', 'D'], ['cif_staff', 'E'], ['cif_n', 'F'], ['cif_fin', 'G'], ['cif_ok', 'H']].forEach(function (x) { nm(x[0], ws, x[1] + R0 + ':' + x[1] + CL); });

    // ================================================================== Data_Idle
    ws = WS.Data_Idle;
    page(ws, 'Idle CIFs', 'Source: ' + (files.idle ? dn('idle') : 'no idle report supplied') + '. The report lists one row per idle account; accounts are rolled up here to one row per CIF.',
      [24, 11, 16, 13, 11], 'every client (CIF) in the RIB Idle Accounts Report. A client counts as inactive when its balance is above the minimum and it has been idle for more than the threshold (both on Inputs).', 'F');
    head(ws, 7, ['CIF_ID_NO', 'ACCOUNTS', 'TOTAL ADB (Php)', 'LEAST IDLE DAYS', 'INACTIVE (1 = yes)']);
    var NI = 0, IACC = 0;
    if (files.idle && input.idle) {
      IACC = input.idle.accounts; NI = input.idle.rows.length;
      input.idle.rows.forEach(function (r, j) {
        var row = R0 + j; put(ws, row, 2, r[0]); put(ws, row, 3, r[1]); put(ws, row, 4, r[2]); put(ws, row, 5, r[3]);
        put(ws, row, 6, '=IF(AND(D' + row + '>in_min_bal,E' + row + '>in_idle_days),1,0)');
      });
    }
    var IL = R0 + Math.max(NI, 1) - 1; shade(ws, R0, IL, 2, 6, 5);
    for (i = R0 - 1 + 1; i <= Math.max(ws.maxR, IL); i++) st(ws.atRC(i, 4)).numFmt = '#,##0.00';
    ws.freezeAt = 'C' + R0; ws.filter = 'B7:F' + IL;
    [['id_cif', 'B'], ['id_acc', 'C'], ['id_bal', 'D'], ['id_idle', 'E'], ['id_inact', 'F']].forEach(function (x) { nm(x[0], ws, x[1] + R0 + ':' + x[1] + IL); });
    if (!files.idle && cfg.cif.inactive[0] === null) stop('No RIB Idle Accounts Report and no typed inactive count: add the report, or type the inactive count in the CIF Profile.');

    // ================================================================== Map
    ws = WS.Map;
    page(ws, 'Transaction type map', 'Decides which report category each exported transaction type is counted under.', [46, 46, 36, 12, 12, 14],
      'the transaction types exactly as they appear in the export, the report category each belongs to, and whether it counts as a financial transaction (a money movement, as in the RIB Usage export). Edit only if a new transaction type appears.', 'G');
    head(ws, 7, ['Transaction type (as exported)', 'Report category', 'QR group', 'Financial?', 'Rows (all)', 'Rows (successful)']);
    var types = Object.keys(TMAP).sort(pyCmp);
    types.forEach(function (t, j) {
      var r = R0 + j;
      S(ws, 'B' + r, t, 'refl'); S(ws, 'C' + r, TMAP[t].category, 'input'); S(ws, 'D' + r, TMAP[t].qr_group || '-', 'input');
      S(ws, 'E' + r, TMAP[t].financial || 'Yes', 'body', null, { align: 'center' });
      S(ws, 'F' + r, '=SUMIFS(tx_n,tx_type,B' + r + ')', 'num'); S(ws, 'G' + r, '=SUMIFS(tx_n,tx_type,B' + r + ',' + OKC + ')', 'num');
    });
    var me = R0 + types.length - 1;
    S(ws, 'B' + (me + 1), 'Total', 'total');
    'CDE'.split('').forEach(function (c) { S(ws, c + (me + 1), null, 'total'); });
    S(ws, 'F' + (me + 1), '=SUM(F' + R0 + ':F' + me + ')', 'total', INT); S(ws, 'G' + (me + 1), '=SUM(G' + R0 + ':G' + me + ')', 'total', INT);
    mergeNote(ws, me + 3, "Financial? is fixed when the workbook is built, because Data_CIF counts each client's financial rows from it. To change it, update the skill's type map and rebuild.", 'G');
    nm('map_type', ws, 'B' + R0 + ':B' + me); nm('map_cat', ws, 'C' + R0 + ':C' + me); nm('map_qr', ws, 'D' + R0 + ':D' + me); nm('map_fin', ws, 'E' + R0 + ':E' + me); ws.freezeAt = 'B' + R0;

    // ================================================================== Lists
    ws = WS.Lists;
    page(ws, 'Name lists', 'Source: ' + dn('raw') + '. Distinct names found in the export, with live counts.', [38, 10, 12, 2, 46, 10, 12, 2, 13, 12, 10],
      'every biller, beneficiary bank and card found in the export, each with a formula count. The ranked tables on Billers_Banks and Cards read from here.', 'L');
    var billers = RAW.billers, banks = RAW.banks;
    head(ws, 7, ['Biller (bills payment)', 'Count', 'Sort key']); head(ws, 7, ['Beneficiary bank', 'Count', 'Sort key'], 6); head(ws, 7, ['Card ref', 'Card type', 'Txns'], 10);
    billers.forEach(function (b, j) { var r = R0 + j; S(ws, 'B' + r, b, 'refl'); S(ws, 'C' + r, '=SUMIFS(tx_n,' + OKC + ',tx_cat,"' + BP + '",tx_biller,B' + r + ')', 'num'); S(ws, 'D' + r, '=C' + r + '-ROW()/1000000', 'num', '0.000000'); });
    banks.forEach(function (b, j) { var r = R0 + j; S(ws, 'F' + r, b, 'refl'); S(ws, 'G' + r, '=SUMIFS(tx_n,' + OKC + ',tx_cat,"' + FTOB + '",tx_bank,F' + r + ')', 'num'); S(ws, 'H' + r, '=G' + r + '-ROW()/1000000', 'num', '0.000000'); });
    RAW.cardRefs.slice().sort(pyCmp).forEach(function (c, j) { var r = R0 + j; S(ws, 'J' + r, c, 'refl'); S(ws, 'K' + r, RAW.ctFirst[c] || 'Not stated', 'refl'); S(ws, 'L' + r, '=SUMIFS(tx_n,tx_card,J' + r + ')', 'num'); });
    var be = R0 + billers.length - 1, ke = R0 + banks.length - 1, ce = R0 + Math.max(RAW.cardRefs.length, 1) - 1;
    nm('lb_name', ws, 'B' + R0 + ':B' + be); nm('lb_cnt', ws, 'C' + R0 + ':C' + be); nm('lb_key', ws, 'D' + R0 + ':D' + be);
    nm('lk_name', ws, 'F' + R0 + ':F' + ke); nm('lk_cnt', ws, 'G' + R0 + ':G' + ke); nm('lk_key', ws, 'H' + R0 + ':H' + ke);
    nm('lc_type', ws, 'K' + R0 + ':K' + ce); nm('lc_cnt', ws, 'L' + R0 + ':L' + ce); ws.freezeAt = 'B' + R0;

    // ================================================================== Data_Channels
    var M3 = function (m) { return m.slice(0, 3).toUpperCase(); };
    var months6 = cfg.prior_months.concat(cfg.months).map(M3);
    var series = [];
    function add(key, label, fkey, pat, rowlabel, occ) {
      if (!files[fkey] || !input.books[fkey]) return;
      var g = pullSheet(input.books[fkey], pat, rowlabel, occ || 0, months6); series.push([key, label, dn(fkey) + ' › ' + g.sn, g.vals]);
    }
    add('drb_ft', 'DRB – Fund Transfer from/to Other Banks', 'drb_summary', 'RIB Stats', 'Fund Transfer from/to Other Banks');
    add('dcb_ft', 'DCB – Fund Transfer To Other Bank', 'itcom_dcb', '^DCB', 'Fund Transfer To Other Bank');
    add('api_ft', 'API – Fund Transfer to Other Banks (client table total)', 'drb_summary', 'API Channel', 'TOTAL', -1);
    add('api_sum', 'API – Fund Transfer to Other Banks (summary line)', 'drb_summary', 'API Channel', 'Fund Transfer to Other Banks');
    add('drb_x', 'DRB – second copy, for cross-checking', 'dcb_stats', '^DRB', 'Fund Transfer from/to Other Banks');
    add('dcb_x', 'DCB – second copy, for cross-checking', 'dcb_stats', '^DCB', 'Fund Transfer To Other Bank');
    [['ip_recv', 'InstaPay Receiving'], ['ip_send', 'InstaPay Sending'], ['ip_api', 'InstaPay Sending (API Channel)'], ['pn_recv', 'PESONet Receiving'], ['pn_send', 'PESONet Sending'], ['pn_api', 'PESONet Sending (API Channel)']]
      .forEach(function (x) { add(x[0], x[1], 'drb_summary', 'Insta-Peso-QR', x[1]); });
    ws = WS.Data_Channels;
    page(ws, 'Channel source data', 'Monthly counts copied from the ITCom and DRB report files.', [50, 54, 10, 10, 10, 10, 10, 10],
      "the monthly counts copied from the ITCom and DRB report files: last quarter's three months first, then this quarter's. The Channels sheet uses them.", 'I');
    head(ws, 7, ['Series', 'Taken from (file › sheet)'].concat(months6));
    var DC = {};
    series.forEach(function (x, j) {
      var r = R0 + j; S(ws, 'B' + r, x[1]); S(ws, 'C' + r, x[2], 'note');
      x[3].forEach(function (v, q) { S(ws, L(4 + q) + r, v, 'ref'); });
      DC[x[0]] = r;
    });
    ['drb_ft', 'dcb_ft', 'api_ft', 'api_sum', 'ip_recv', 'ip_send', 'ip_api', 'pn_recv', 'pn_send', 'pn_api'].forEach(function (k) {
      if (!(k in DC)) stop('The ' + (/^dcb/.test(k) ? 'ITCom DCB Reports' : 'DRB Reports') + ' file is missing, so the channel figures cannot be built.');
    });
    var RB = R0 + series.length + 3;
    S(ws, 'B' + (RB - 1), 'RIB Usage export – totals for cross-checking', 'h2');
    head(ws, RB, ['Figure', 'Taken from', 'Value']);
    var RIB = files.rib && input.rib ? input.rib : {};
    var ribOn = Object.keys(RIB).length > 0;
    ['Rows', 'Successful rows', 'Distinct CIFs', 'Successful transfers to other banks'].forEach(function (lab, j) {
      var r = RB + 1 + j; S(ws, 'B' + r, lab); S(ws, 'C' + r, ribOn ? dn('rib') : 'not supplied this quarter', 'note'); S(ws, 'D' + r, ribOn ? RIB[lab] : 'not supplied', 'ref');
    });
    nm('rib_ok', ws, 'D' + (RB + 2)); nm('rib_cif', ws, 'D' + (RB + 3)); nm('rib_ftob', ws, 'D' + (RB + 4));
    ws.freezeAt = 'D' + R0;
    var dcp = function (k) { return 'Data_Channels!D' + DC[k] + ':F' + DC[k]; }, dcc = function (k) { return 'Data_Channels!G' + DC[k] + ':I' + DC[k]; };

    // ================================================================== Inputs
    ws = WS.Inputs;
    page(ws, 'Inputs', 'Cream cells are the only ones you type into. Everything else updates from them and from the data sheets.', [46, 18, 16, 12, 12, 12, 64],
      "the figures that are typed in rather than calculated: the report period, the CIF counts from the CIF Profile, the inactive rule, the age bands and last quarter's figures. The note column says where each comes from.", 'H');
    S(ws, 'B7', 'Report period', 'h2'); head(ws, 8, ['Item', 'Value', '', '', '', '', 'Source / note']);
    [['Quarter', cfg.quarter, 'in_q', 'Typed'], ['Period covered', cfg.period, 'in_period', 'Typed'], ['Month 1 (spelled as in the export)', cfg.months[0], 'in_m1', 'Must match the MONTH column on Data_Txn'],
      ['Month 2', cfg.months[1], 'in_m2', ''], ['Month 3', cfg.months[2], 'in_m3', ''], ['Prior quarter', cfg.prior_quarter, 'in_pq', 'Typed'], ['CIF figures as of', cfg.as_of, 'in_asof', 'Typed']]
      .forEach(function (x, j) { var r = 9 + j; S(ws, 'B' + r, x[0]); S(ws, 'C' + r, x[1], 'input'); nm(x[2], ws, 'C' + r); S(ws, 'H' + r, x[3], 'note'); });
    S(ws, 'B18', 'CIF figures', 'h2'); head(ws, 19, ['Figure', 'This quarter', 'Prior quarter', '', '', '', 'Source / note']);
    [['Total CIFs (net of dormant and closed)', 'total_cif'], ['Total enrolled CIFs', 'enrolled'], ['CIF w/ usage (CIF Profile)', 'cif_usage'], ['Inactive CIFs used in the report', 'inactive']].forEach(function (x, j) {
      var r = 20 + j, k = x[1];
      S(ws, 'B' + r, x[0]); S(ws, 'D' + r, cfg.prior[k][0], 'input');
      if (k === 'inactive') { S(ws, 'C' + r, '=IF(in_inactive_ovr="",SUM(id_inact),in_inactive_ovr)', 'num'); S(ws, 'H' + r, 'Calculated: the override below if filled in, otherwise the count worked out on Data_Idle. Prior: ' + cfg.prior[k][1] + '.', 'note'); }
      else { S(ws, 'C' + r, cfg.cif[k][0], 'input'); S(ws, 'H' + r, 'This quarter: ' + cfg.cif[k][1] + '. Prior: ' + cfg.prior[k][1] + '.', 'note'); }
      nm('in_' + k, ws, 'C' + r); nm('p_' + k, ws, 'D' + r);
    });
    [['Inactive CIFs – typed override', cfg.cif.inactive[0], 'in_inactive_ovr', 'Leave blank to use the count from the idle report. ' + (cfg.cif.inactive[1] || '')],
      ['Inactive rule: idle for more than (days)', cfg.idle_days == null ? 90 : cfg.idle_days, 'in_idle_days', 'Days since last login. A CIF at exactly this number is not counted.'],
      ['Inactive rule: balance above (Php)', cfg.min_balance == null ? 0 : cfg.min_balance, 'in_min_bal', "Average daily balance, summed across the CIF's accounts."]].forEach(function (x, j) {
      var r = 24 + j; S(ws, 'B' + r, x[0]); S(ws, 'C' + r, x[1], 'input'); S(ws, 'H' + r, x[3], 'note'); nm(x[2], ws, 'C' + r);
    });
    S(ws, 'B29', 'Enrolled CIFs by generation, active vs idle', 'h2'); head(ws, 30, ['Generation', 'Born', 'Age from', 'Age to', 'Active', 'Idle', 'Source / note']);
    var G0 = 31;
    cfg.generations.forEach(function (g, j) { var r = G0 + j; S(ws, 'B' + r, g[0]); S(ws, 'C' + r, g[1], 'input'); for (var q = 2; q < 6; q++) S(ws, L(2 + q) + r, g[q], 'input'); });
    var G1 = G0 + cfg.generations.length - 1;
    S(ws, 'H' + G0, 'Active and Idle: CIF Profile (active = last login within 90 days).', 'note');
    S(ws, 'H' + (G0 + 1), 'Age bands: move each band up by one every January.', 'note');
    S(ws, 'B' + (G1 + 3), 'Enrolled CIFs by staff tag, active vs idle', 'h2'); head(ws, G1 + 4, ['Staff tag', 'Code in export', '', '', 'Active', 'Idle', 'Source / note']);
    var T0 = G1 + 5;
    cfg.staff.forEach(function (s_, j) { var r = T0 + j; S(ws, 'B' + r, s_[0]); S(ws, 'C' + r, s_[1] || '(blank)'); S(ws, 'F' + r, s_[2], 'input'); S(ws, 'G' + r, s_[3], 'input'); });
    S(ws, 'H' + T0, 'CIF Profile.', 'note');
    var T1 = T0 + cfg.staff.length - 1, PR0 = T1 + 4;
    S(ws, 'B' + (PR0 - 2), 'Prior-quarter figures', 'h2'); head(ws, PR0 - 1, ['Figure', 'Prior quarter', '', '', '', '', 'Source / note']);
    var prl = [['fin', 'Have financial transactions'], ['cif_any', "Have any online activity (Sir RD's count)"], ['login', 'Have logged in to their accounts'],
      ['female', 'Have financial transactions – female'], ['male', 'Have financial transactions – male'],
      ['txn_total', 'Successful financial transactions'], ['ftob', 'Fund transfers to other banks (DRB)'], ['ip_nonqr', '…of which InstaPay, regular (non-QR)'],
      ['card', 'Transactions from cards'], ['qr_ob', QRG[0]], ['qr_p2m', QRG[1]], ['qr_3p', QRG[2]], ['qr_own', QRG[3]], ['qr_p2b', QRG[4]], ['qr_micro', QRG[5]]];
    prl.forEach(function (x, j) { var r = PR0 + j, v = cfg.prior[x[0]] || [null, '']; S(ws, 'B' + r, x[1]); S(ws, 'C' + r, v[0], 'input'); S(ws, 'H' + r, v[1], 'note'); nm('p_' + x[0], ws, 'C' + r); });
    var PC0 = PR0 + prl.length + 3;
    S(ws, 'B' + (PC0 - 2), 'Prior-quarter successful transactions by type', 'h2'); head(ws, PC0 - 1, ['Transaction type', 'Prior quarter', '', '', '', '', 'Source / note']);
    var pcat = cfg.prior_categories || {};
    cats.forEach(function (c, j) { var r = PC0 + j; S(ws, 'B' + r, c); S(ws, 'C' + r, c in pcat ? pcat[c] : (c === FTOB ? cfg.prior.ftob[0] : null), 'input'); });
    S(ws, 'H' + PC0, (cfg.prior_categories_source ? cfg.prior_categories_source + '. ' : '') + "Leave blank where last quarter's report did not state the figure. From next quarter, copy from the Transactions sheet's Quarter total column.", 'note');
    ws.validations.push({ type: 'decimal', op: 'greaterThanOrEqual', formula1: '0', errorTitle: 'Number expected', error: 'Enter a number of zero or more.',
      sqref: ['C20:C22', 'D20:D23', 'C24:C26', 'D' + G0 + ':G' + G1, 'F' + T0 + ':G' + T1, 'C' + PR0 + ':C' + (PC0 + cats.length)] });
    ws.freezeAt = 'A7';

    // ================================================================== Usage
    ws = WS.Usage;
    page(ws, 'Enrolment and usage', '="Sterling Bank Online | Digital Retail Banking (DRB)  ·  "&in_period&"  ·  compared with "&in_pq', [44, 14, 13, 14, 13, 14, 14, 54],
      'how many clients (CIFs) are enrolled, and of those, how many used the platform. Active users = have financial transactions + have logged in to their accounts. Inactive = not logged in for > 90 days. All % are of total enrolled CIFs (net of dormant and closed).');
    S(ws, 'B7', 'Enrolment', 'h2'); src(ws, 8, 'CIF Profile (Inputs)');
    head(ws, 9, ['Measure', 'This quarter', 'Prior quarter', 'Change', '% change', '', '', 'How it is calculated']);
    [['Total CIFs (net of dormant and closed)', '=in_total_cif', '=p_total_cif', INT, 'ref', 'From the CIF Profile'], ['Total enrolled CIFs', '=in_enrolled', '=p_enrolled', INT, 'ref', 'From the CIF Profile'],
      ['Enrolment rate', '=C11/C10', '=D11/D10', PCT, 'num', 'Enrolled CIFs ÷ Total CIFs'], ['CIFs not enrolled', '=C10-C11', '=D10-D11', INT, 'num', 'Total CIFs − Enrolled CIFs']].forEach(function (x, j) {
      var r = 10 + j; S(ws, 'B' + r, x[0]); S(ws, 'C' + r, x[1], x[4], x[3]); S(ws, 'D' + r, x[2], x[4], x[3]);
      S(ws, 'E' + r, x[3] === PCT ? pts('C' + r, 'D' + r) : chg('C' + r, 'D' + r), 'num', x[3] === PCT ? PTSF : CHG);
      S(ws, 'F' + r, x[3] === PCT ? '' : pchg('C' + r, 'D' + r), 'num', PCHG); S(ws, 'I' + r, x[5], 'note');
    });
    nm('u_enrol_pct', ws, 'C12'); nm('u_enrol_pct_p', ws, 'D12');
    S(ws, 'B15', 'Usage of enrolled CIFs', 'h2'); src(ws, 16, 'CIFs with financial transactions from ' + dn('raw') + ' (Data_CIF); inactive from the RIB Idle Accounts Report (Data_Idle) or the override; enrolled from the CIF Profile');
    head(ws, 17, ['Group', 'This quarter', '% of enrolled', 'Prior quarter', 'Prior %', 'Change', '% change', 'How it is calculated']);
    [['Have financial transactions', '=COUNTIF(cif_fin,">0")', '=p_fin', 'num', 'Clients on Data_CIF with at least one financial transaction (money movement, any status), as in the RIB Usage basis'],
      ['Have logged in to their accounts', '=in_enrolled-(C18+C21)', '=p_login', 'num', 'Enrolled − (with financial transactions + inactive)'],
      ['Active users', '=C18+C19', '=E18+E19', 'total', 'Have financial transactions + have logged in to their accounts'],
      ['Inactive (not logged in for > 90 days)', '=in_inactive', '=p_inactive', 'ref', 'From the RIB Idle Accounts Report (worked below), or the typed override'],
      ['Total enrolled CIFs', '=C20+C21', '=E20+E21', 'total', 'Active users + Inactive']].forEach(function (x, j) {
      var r = 18 + j, k = x[3], kk = k === 'total' ? 'total' : 'num';
      S(ws, 'B' + r, x[0], k === 'total' ? 'total' : 'body'); S(ws, 'C' + r, x[1], k, INT); S(ws, 'D' + r, '=C' + r + '/in_enrolled', kk, PCT);
      S(ws, 'E' + r, x[2], k === 'total' ? 'total' : 'ref', INT); S(ws, 'F' + r, '=E' + r + '/p_enrolled', kk, PCT);
      S(ws, 'G' + r, chg('C' + r, 'E' + r), kk, CHG); S(ws, 'H' + r, pchg('C' + r, 'E' + r), kk, PCHG);
      S(ws, 'I' + r, x[4], 'note', null, { wrap: true }); ws.height(r, 26);
    });
    [['u_fin', 'C18'], ['u_login', 'C19'], ['u_active', 'C20'], ['u_fin_pct', 'D18'], ['u_login_pct', 'D19'], ['u_active_pct', 'D20'], ['u_inactive_pct', 'D21'], ['u_active_pct_p', 'F20']].forEach(function (x) { nm(x[0], ws, x[1]); });
    S(ws, 'B25', 'Inactive CIFs, worked from the RIB Idle Accounts Report', 'h2'); src(ws, 26, (files.idle ? dn('idle') : 'no idle report supplied this quarter') + ' (Data_Idle)');
    head(ws, 27, ['Step', 'CIFs', '', '', '', '', '', 'How it is calculated']);
    [['Account rows in the idle report', '=SUM(id_acc)', 'num', 'Total of the ACCOUNTS column on Data_Idle'],
      ['Distinct idle CIFs', '=COUNTA(id_cif)', 'num', 'Number of clients listed on Data_Idle'],
      ['…with a balance above the minimum', '=COUNTIF(id_bal,">"&in_min_bal)', 'num', 'Clients whose ADB, summed across their accounts, is above the minimum on Inputs'],
      ['…less those not past the idle-day threshold', '=C30-C32', 'num', 'Clients idle for the threshold number of days or fewer'],
      ['Inactive CIFs by the rule', '=SUM(id_inact)', 'total', 'Balance above the minimum and idle days above the threshold'],
      ['Typed override on the Inputs sheet', '=IF(in_inactive_ovr="","none",in_inactive_ovr)', 'num', 'Used instead of the calculated count when filled in'],
      ['Inactive CIFs used in this report', '=in_inactive', 'total', 'The override if present, otherwise the calculated count']].forEach(function (x, j) {
      var r = 28 + j; S(ws, 'B' + r, x[0], x[2] === 'total' ? 'total' : 'body'); S(ws, 'C' + r, x[1], x[2], INT); S(ws, 'I' + r, x[3], 'note', null, { wrap: true });
    });
    nm('u_inact_calc', ws, 'C32');
    S(ws, 'B37', 'Reference figures', 'h2'); src(ws, 38, 'CIF Profile (Inputs); ' + dn('raw') + ' (Data_CIF)');
    head(ws, 39, ['Figure', 'This quarter', '% of enrolled', 'Prior quarter', 'Prior %', 'Change', '% change', 'How it is calculated']);
    S(ws, 'B40', 'CIF w/ usage (CIF Profile)'); S(ws, 'C40', '=in_cif_usage', 'ref'); S(ws, 'D40', '=C40/in_enrolled', 'num', PCT); S(ws, 'E40', '=p_cif_usage', 'ref'); S(ws, 'F40', '=E40/p_enrolled', 'num', PCT);
    S(ws, 'G40', chg('C40', 'E40'), 'num', CHG); S(ws, 'H40', pchg('C40', 'E40'), 'num', PCHG); S(ws, 'I40', 'From the CIF Profile. Shown for continuity; not traced to the export.', 'note', null, { wrap: true });
    S(ws, 'B41', 'CIFs with at least one successful financial transaction'); S(ws, 'C41', '=COUNTIF(cif_ok,">0")', 'num'); S(ws, 'D41', '=C41/in_enrolled', 'num', PCT); S(ws, 'I41', 'Clients on Data_CIF with SUCCESSFUL FINANCIAL ROWS above zero', 'note', null, { wrap: true });
    S(ws, 'B42', 'CIFs with failed financial transactions only'); S(ws, 'C42', '=C18-C41', 'num'); S(ws, 'D42', '=C42/in_enrolled', 'num', PCT); S(ws, 'I42', 'With financial transactions − with a successful one', 'note', null, { wrap: true });
    S(ws, 'B43', 'CIFs with non-financial activity only'); S(ws, 'C43', '=COUNTA(cif_id)-C18', 'num'); S(ws, 'D43', '=C43/in_enrolled', 'num', PCT); S(ws, 'I43', "e.g. password change or sign-up only. They fall under 'Have logged in to their accounts'.", 'note', null, { wrap: true });
    [41, 42, 43].forEach(function (r) { 'EFGH'.split('').forEach(function (c) { S(ws, c + r, null, 'num'); }); });
    nm('u_fin_ok', ws, 'C41');
    S(ws, 'B46', 'Two ways of counting active clients', 'h2'); src(ws, 47, dn('raw') + ' (Data_CIF); enrolled from the CIF Profile; inactive as above. The report uses the first column.');
    head(ws, 48, ['Measure', 'Report count', '% of enrolled', "Sir RD's count", '% of enrolled', 'Prior qtr (report)', 'Prior qtr (Sir RD)', 'What is counted']);
    [['Have financial transactions / Have any online activity', '=u_fin', '=COUNTA(cif_id)', '=p_fin', '=IF(p_cif_any="","",p_cif_any)',
      "Report count: CIFs with at least one money movement (transfer, bills payment, QR, loan, time deposit, check order), any status. Sir RD's count (Q2 2026 deck): CIFs with any row in the usage file, including password changes, sign-ups, favorites, alerts and statement requests."],
      ['Have logged in to their accounts', '=in_enrolled-(C49+in_inactive)', '=in_enrolled-(E49+in_inactive)', '=p_login', '=IF(p_cif_any="","",p_enrolled-(p_cif_any+p_inactive))', 'Total enrolled − (first row + inactive), on each count.'],
      ['Inactive (not logged in for > 90 days)', '=in_inactive', '=in_inactive', '=p_inactive', '=p_inactive', 'Same on both counts.'],
      ['Active users', '=C49+C50', '=E49+E50', '=p_fin+p_login', '=IF(p_cif_any="","",G49+G50)', 'Same on both counts: the first row is subtracted to get the second, so it cancels out.']].forEach(function (x, j) {
      var r = 49 + j;
      S(ws, 'B' + r, x[0], r === 52 ? 'total' : 'body'); S(ws, 'C' + r, x[1], 'num', INT); S(ws, 'D' + r, '=C' + r + '/in_enrolled', 'num', PCT); S(ws, 'E' + r, x[2], 'num', INT); S(ws, 'F' + r, '=E' + r + '/in_enrolled', 'num', PCT);
      S(ws, 'G' + r, x[3], 'ref', INT); S(ws, 'H' + r, x[4], 'ref', INT); S(ws, 'I' + r, x[5], 'note', null, { wrap: true }); ws.height(r, r === 49 ? 40 : 26);
    });
    S(ws, 'B53', 'Difference: CIFs with non-financial activity only'); S(ws, 'C53', '=E49-C49', 'num', INT); S(ws, 'D53', null, 'num', PCT); S(ws, 'E53', null, 'num'); S(ws, 'F53', null, 'num', PCT);
    S(ws, 'G53', '=IF(p_cif_any="","",H49-G49)', 'ref', INT); S(ws, 'H53', null, 'ref');
    S(ws, 'I53', 'Counted as having financial transactions by Sir RD; counted as logged in by the report.', 'note', null, { wrap: true }); ws.height(53, 26);
    nm('u_any', ws, 'E49');
    donut(ws, 'K7', 'Enrolled CIFs: active vs inactive', ref(ws, 3, 20, 3, 21), ref(ws, 2, 20, 2, 21), [AMBER, PEER]);
    bar(ws, 'K23', 'Usage groups: this quarter vs prior', 'col', 7.5, 15, [{ ref: ref(ws, 5, 18, 5, 19), titleRef: ref(ws, 5, 17), color: PEER }, { ref: ref(ws, 3, 18, 3, 19), titleRef: ref(ws, 3, 17), color: AMBER }], ref(ws, 2, 18, 2, 19), 'b');
    ws.freezeAt = 'C7';

    // ================================================================== Profile
    ws = WS.Profile;
    page(ws, 'User profile', '="Gender, generation and staff tag  ·  "&in_period', [34, 18, 13, 13, 15, 13, 13, 13],
      'who the users are. The first two tables cover clients with financial transactions this quarter; the active vs idle tables cover all enrolled clients, from the CIF Profile.');
    S(ws, 'B7', 'Gender of CIFs with financial transactions', 'h2'); src(ws, 8, dn('raw') + ' (Data_CIF, GENDER column); prior from Inputs');
    head(ws, 9, ['Gender', 'CIFs', '% of known', 'Prior CIFs', 'Prior %', 'Change']);
    [['Female', 'F', 'p_female'], ['Male', 'M', 'p_male']].forEach(function (x, j) {
      var r = 10 + j; S(ws, 'B' + r, x[0]); S(ws, 'C' + r, '=COUNTIFS(cif_fin,">0",cif_gender,"' + x[1] + '")', 'num'); S(ws, 'D' + r, '=C' + r + '/C$12', 'num', PCT);
      S(ws, 'E' + r, '=' + x[2], 'ref'); S(ws, 'F' + r, '=E' + r + '/E$12', 'num', PCT); S(ws, 'G' + r, pts('D' + r, 'F' + r), 'num', PTSF);
    });
    S(ws, 'B12', 'Total with known gender', 'total'); S(ws, 'C12', '=C10+C11', 'total', INT); S(ws, 'D12', '=D10+D11', 'total', PCT); S(ws, 'E12', '=E10+E11', 'total', INT); S(ws, 'F12', '=F10+F11', 'total', PCT); S(ws, 'G12', null, 'total');
    S(ws, 'B13', 'Gender not stated (left out of the %)'); S(ws, 'C13', '=u_fin-C12', 'num');
    nm('pr_f_pct', ws, 'D10'); nm('pr_f', ws, 'C10'); nm('pr_m', ws, 'C11');
    var ng = cfg.generations.length, A0 = 18, A1 = A0 + ng - 1;
    S(ws, 'B15', 'Generation of CIFs with financial transactions', 'h2'); src(ws, 16, dn('raw') + ' (Data_CIF, AGE column) against the age bands on Inputs');
    head(ws, 17, ['Generation', 'Born', 'Age from', 'Age to', 'CIFs with financial transactions', '% of known']);
    for (i = 0; i < ng; i++) {
      r_ = A0 + i; var s_ = G0 + i;
      S(ws, 'B' + r_, '=Inputs!B' + s_); S(ws, 'C' + r_, '=Inputs!C' + s_, 'refl'); S(ws, 'D' + r_, '=Inputs!D' + s_, 'ref', '0'); S(ws, 'E' + r_, '=Inputs!E' + s_, 'ref', '0');
      S(ws, 'F' + r_, '=COUNTIFS(cif_fin,">0",cif_age,">="&D' + r_ + ',cif_age,"<="&E' + r_ + ')', 'num'); S(ws, 'G' + r_, '=F' + r_ + '/F$' + (A1 + 1), 'num', PCT);
    }
    S(ws, 'B' + (A1 + 1), 'Total with known age', 'total');
    'CDE'.split('').forEach(function (c) { S(ws, c + (A1 + 1), null, 'total'); });
    S(ws, 'F' + (A1 + 1), '=SUM(F' + A0 + ':F' + A1 + ')', 'total', INT); S(ws, 'G' + (A1 + 1), '=SUM(G' + A0 + ':G' + A1 + ')', 'total', PCT);
    S(ws, 'B' + (A1 + 2), 'Age not determined (left out of the %)'); S(ws, 'F' + (A1 + 2), '=u_fin-F' + (A1 + 1), 'num');
    var mi = cfg.generations.map(function (g) { return g[0]; }).indexOf('Millennials');
    if (mi < 0) stop('The generations table needs a "Millennials" row (it is used in the summary).');
    nm('pr_mill_pct', ws, 'G' + (A0 + mi));
    var B0 = A1 + 7, B1 = B0 + ng - 1;
    S(ws, 'B' + (B0 - 3), 'Generation of all enrolled CIFs, active vs idle', 'h2'); src(ws, B0 - 2, 'CIF Profile (Inputs). Uses the wider enrolled base (active + idle).');
    head(ws, B0 - 1, ['Generation', 'Active', 'Active %', 'Idle', 'Idle %', 'Total', 'Total %']);
    for (i = 0; i < ng; i++) {
      r_ = B0 + i; s_ = G0 + i;
      S(ws, 'B' + r_, '=Inputs!B' + s_); S(ws, 'C' + r_, '=Inputs!F' + s_, 'ref'); S(ws, 'D' + r_, '=C' + r_ + '/C$' + (B1 + 1), 'num', PCT);
      S(ws, 'E' + r_, '=Inputs!G' + s_, 'ref'); S(ws, 'F' + r_, '=E' + r_ + '/E$' + (B1 + 1), 'num', PCT); S(ws, 'G' + r_, '=C' + r_ + '+E' + r_, 'num'); S(ws, 'H' + r_, '=G' + r_ + '/G$' + (B1 + 1), 'num', PCT);
    }
    S(ws, 'B' + (B1 + 1), 'Total', 'total');
    [INT, PCT, INT, PCT, INT, PCT].forEach(function (f, j) { var c = 'CDEFGH'[j]; S(ws, c + (B1 + 1), '=SUM(' + c + B0 + ':' + c + B1 + ')', 'total', f); });
    nm('pr_act_tbl', ws, 'C' + (B1 + 1)); nm('pr_idle_tbl', ws, 'E' + (B1 + 1)); nm('pr_all_tbl', ws, 'G' + (B1 + 1)); nm('pr_mill_enr_pct', ws, 'H' + (B0 + mi));
    var C0 = B1 + 7, C1 = C0 + cfg.staff.length;
    S(ws, 'B' + (C0 - 3), 'Staff tag', 'h2'); src(ws, C0 - 2, 'with financial transactions: ' + dn('raw') + ' (Data_CIF); active and idle: CIF Profile (Inputs)');
    head(ws, C0 - 1, ['Staff tag', 'CIFs with financial transactions', '% of CIFs with fin. txns', 'Active', 'Idle', 'Total enrolled', '% of enrolled']);
    cfg.staff.forEach(function (s, j) {
      var r = C0 + j; S(ws, 'B' + r, s[0]);
      S(ws, 'C' + r, s[1] ? '=COUNTIFS(cif_fin,">0",cif_staff,"' + s[1] + '")' : '=u_fin-SUM(C' + C0 + ':C' + (r - 1) + ')', 'num'); S(ws, 'D' + r, '=C' + r + '/C$' + C1, 'num', PCT);
      S(ws, 'E' + r, '=Inputs!F' + (T0 + j), 'ref'); S(ws, 'F' + r, '=Inputs!G' + (T0 + j), 'ref'); S(ws, 'G' + r, '=E' + r + '+F' + r, 'num'); S(ws, 'H' + r, '=G' + r + '/G$' + C1, 'num', PCT);
    });
    S(ws, 'B' + C1, 'Total', 'total');
    [INT, PCT, INT, INT, INT, PCT].forEach(function (f, j) { var c = 'CDEFGH'[j]; S(ws, c + C1, '=SUM(' + c + C0 + ':' + c + (C1 - 1) + ')', 'total', f); });
    donut(ws, 'K7', 'CIFs with financial transactions by gender', ref(ws, 3, 10, 3, 11), ref(ws, 2, 10, 2, 11), [AMBER, NAVY]);
    bar(ws, 'K22', 'CIFs with financial transactions by generation', 'col', 7.5, 15, [{ ref: ref(ws, 6, A0, 6, A1), color: NAVY }], ref(ws, 2, A0, 2, A1), null);
    bar(ws, 'K39', 'All enrolled CIFs by generation: active vs idle', 'col', 7.5, 15, [{ ref: ref(ws, 3, B0, 3, B1), titleRef: ref(ws, 3, B0 - 1), color: AMBER }, { ref: ref(ws, 5, B0, 5, B1), titleRef: ref(ws, 5, B0 - 1), color: PEER }], ref(ws, 2, B0, 2, B1), 'b');
    ws.freezeAt = 'C7';

    // ================================================================== Transactions
    ws = WS.Transactions;
    page(ws, 'Transaction count', '="Successful transactions by type  ·  "&in_period', [5, 50, 11, 11, 11, 13, 11, 12, 12, 11],
      'how many successful transactions clients made, by type and month. Financial transactions (money movements) are counted first; other online activity such as password changes is listed below them. Failed attempts are left out.', 'K');
    S(ws, 'B7', 'Rows in the export by status', 'h2'); src(ws, 8, dn('raw') + ' (Data_Txn)');
    head(ws, 9, ['', 'Status', 'Rows', '% of rows']);
    [['Successful', '=SUMIFS(tx_n,' + OKC + ')'], ['Failed', '=SUMIFS(tx_n,tx_status,"FAILED")'], ['Other status', '=D13-D10-D11']].forEach(function (x, j) {
      var r = 10 + j; S(ws, 'B' + r, null); S(ws, 'C' + r, x[0]); S(ws, 'D' + r, x[1], 'num'); S(ws, 'E' + r, '=D' + r + '/D$13', 'num', PCT);
    });
    S(ws, 'B13', null, 'total'); S(ws, 'C13', 'Total rows', 'total'); S(ws, 'D13', '=SUM(tx_n)', 'total', INT); S(ws, 'E13', '=SUM(E10:E12)', 'total', PCT);
    nm('t_ok', ws, 'D10'); nm('t_rows', ws, 'D13');
    S(ws, 'B15', 'Successful transactions by type', 'h2'); src(ws, 16, dn('raw') + ' (Data_Txn); types and the financial flag from the Map sheet; prior quarter from Inputs');
    head(ws, 17, ['#', 'Transaction type', '=in_m1', '=in_m2', '=in_m3', 'Quarter total', '% of financial', 'Prior quarter', 'Change', '% change']);
    var X0 = 18, nf = cats_fin.length, XF1 = X0 + nf - 1, XFS = XF1 + 1, XO0 = XFS + 1, XO1 = XO0 + cats_oth.length - 1, XOS = XO1 + 1, XG = XOS + 1, CROW = {};
    function trow(r, ix, c, fin) {
      CROW[c] = r;
      S(ws, 'B' + r, ix + 1, 'num', '0'); S(ws, 'C' + r, c);
      'DEF'.split('').forEach(function (cl) { S(ws, cl + r, '=SUMIFS(tx_n,' + OKC + ',tx_cat,$C' + r + ',tx_month,' + cl + '$17)', 'num'); });
      S(ws, 'G' + r, '=SUM(D' + r + ':F' + r + ')', 'num'); S(ws, 'H' + r, fin ? '=G' + r + '/G$' + XFS : '', 'num', PCT);
      var k = cats.indexOf(c);
      S(ws, 'I' + r, '=IF(Inputs!C' + (PC0 + k) + '="","",Inputs!C' + (PC0 + k) + ')', 'ref'); S(ws, 'J' + r, chg('G' + r, 'I' + r), 'num', CHG); S(ws, 'K' + r, pchg('G' + r, 'I' + r), 'num', PCHG);
    }
    function tsub(r, lab, r0, r1, prior, pct) {
      S(ws, 'B' + r, null, 'total'); S(ws, 'C' + r, lab, 'total');
      'DEFG'.split('').forEach(function (cl) { S(ws, cl + r, r1 >= r0 ? '=SUM(' + cl + r0 + ':' + cl + r1 + ')' : 0, 'total', INT); });
      S(ws, 'H' + r, pct, 'total', PCT); S(ws, 'I' + r, prior, 'total', INT);
      S(ws, 'J' + r, chg('G' + r, 'I' + r), 'total', CHG); S(ws, 'K' + r, pchg('G' + r, 'I' + r), 'total', PCHG);
    }
    cats_fin.forEach(function (c, j) { trow(X0 + j, j, c, true); });
    tsub(XFS, 'Financial transactions', X0, XF1, '=IF(p_txn_total="","",p_txn_total)', '=SUM(H' + X0 + ':H' + XF1 + ')');
    cats_oth.forEach(function (c, j) { trow(XO0 + j, nf + j, c, false); });
    tsub(XOS, 'Other online activity (non-financial)', XO0, XO1, '=""', null);
    S(ws, 'B' + XG, null, 'total'); S(ws, 'C' + XG, 'All successful activity', 'total');
    'DEFG'.split('').forEach(function (cl) { S(ws, cl + XG, '=' + cl + XFS + '+' + cl + XOS, 'total', INT); });
    'HIJK'.split('').forEach(function (cl) { S(ws, cl + XG, null, 'total'); });
    S(ws, 'C' + (XG + 1), "n/a = last quarter's report did not state this figure. Last quarter's figures are on the RIB Usage basis, which covers financial transactions only.", 'note');
    nm('t_total', ws, 'G' + XFS); nm('t_all', ws, 'G' + XG); nm('t_cat', ws, 'C' + X0 + ':C' + XF1); nm('t_cnt', ws, 'G' + X0 + ':G' + XF1);
    if (!(FTOB in CROW)) stop('The transaction map has no "' + FTOB + '" category.');
    nm('t_ftob', ws, 'G' + CROW[FTOB]);
    var Y0 = XG + 6;
    S(ws, 'B' + (Y0 - 3), 'Top three financial transaction types', 'h2'); src(ws, Y0 - 2, 'ranked from the financial rows of the table above');
    head(ws, Y0 - 1, ['Rank', 'Transaction type', 'Count', '% of financial']);
    for (i = 0; i < 3; i++) {
      r_ = Y0 + i; S(ws, 'B' + r_, i + 1, 'num', '0'); S(ws, 'C' + r_, '=INDEX(t_cat,MATCH(D' + r_ + ',t_cnt,0))'); S(ws, 'D' + r_, '=LARGE(t_cnt,B' + r_ + ')', 'num'); S(ws, 'E' + r_, '=D' + r_ + '/t_total', 'num', PCT);
      nm('t_top' + (i + 1), ws, 'C' + r_); nm('t_top' + (i + 1) + '_pct', ws, 'E' + r_);
    }
    var TOP8 = Math.min(X0 + 7, XF1);
    bar(ws, 'M7', 'Successful financial transactions by type', 'bar', 8, 17, [{ ref: ref(ws, 7, X0, 7, TOP8), color: NAVY }], ref(ws, 3, X0, 3, TOP8), null);
    bar(ws, 'M25', 'Successful financial transactions by month', 'col', 7.5, 12, [{ ref: ref(ws, 4, XFS, 6, XFS), color: AMBER }], ref(ws, 4, 17, 6, 17), null);
    ws.freezeAt = 'D7';

    // ================================================================== Channels
    ws = WS.Channels;
    page(ws, 'Fund transfers by channel', '="Fund transfers to and from other banks  ·  "&in_period&" vs "&in_pq', [42, 11, 11, 11, 13, 13, 10, 13, 10, 12, 11],
      'how many fund transfers to and from other banks went through each channel: DRB (online banking), DCB (corporate) and API (partner clients). Monthly counts come from the ITCom and DRB report files.', 'L');
    S(ws, 'B7', 'Monthly average by channel', 'h2'); src(ws, 8, dn('drb_summary') + '; ' + dn('itcom_dcb') + ' (Data_Channels)');
    head(ws, 9, ['Channel', '=Data_Channels!G7', '=Data_Channels!H7', '=Data_Channels!I7', 'Quarter total', 'Monthly average', 'Share', 'Prior monthly average', 'Prior share', 'Change', '% change']);
    [['DRB', 'drb_ft'], ['DCB', 'dcb_ft'], ['API', 'api_ft']].forEach(function (x, j) {
      var r = 10 + j; S(ws, 'B' + r, x[0]);
      'CDE'.split('').forEach(function (cl, q) { S(ws, cl + r, '=Data_Channels!' + 'GHI'[q] + DC[x[1]], 'ref'); });
      S(ws, 'F' + r, '=SUM(C' + r + ':E' + r + ')', 'num'); S(ws, 'G' + r, '=AVERAGE(C' + r + ':E' + r + ')', 'num'); S(ws, 'H' + r, '=G' + r + '/G$13', 'num', PCT);
      S(ws, 'I' + r, '=AVERAGE(' + dcp(x[1]) + ')', 'num'); S(ws, 'J' + r, '=I' + r + '/I$13', 'num', PCT); S(ws, 'K' + r, '=G' + r + '-I' + r, 'num', CHG); S(ws, 'L' + r, '=G' + r + '/I' + r + '-1', 'num', PCHG);
    });
    S(ws, 'B13', 'Total', 'total');
    'CDEFGI'.split('').forEach(function (cl) { S(ws, cl + '13', '=SUM(' + cl + '10:' + cl + '12)', 'total', INT); });
    S(ws, 'H13', '=SUM(H10:H12)', 'total', PCT); S(ws, 'J13', '=SUM(J10:J12)', 'total', PCT); S(ws, 'K13', '=G13-I13', 'total', CHG); S(ws, 'L13', '=G13/I13-1', 'total', PCHG);
    S(ws, 'B14', "Monthly average = the three monthly counts ÷ 3. Prior average uses last quarter's three months on Data_Channels.", 'note');
    [['c_drb_avg', 'G10'], ['c_dcb_avg', 'G11'], ['c_api_avg', 'G12'], ['c_tot_avg', 'G13'], ['c_drb_p', 'I10'], ['c_dcb_p', 'I11'], ['c_api_p', 'I12'], ['c_tot_p', 'I13'], ['c_drb_chg', 'L10'], ['c_dcb_chg', 'L11'], ['c_api_chg', 'L12'], ['c_drb_share', 'H10']].forEach(function (x) { nm(x[0], ws, x[1]); });
    S(ws, 'B17', 'InstaPay and PESONet, bank-wide', 'h2'); src(ws, 18, dn('drb_summary') + ' (Data_Channels)');
    head(ws, 19, ['Series', '=Data_Channels!G7', '=Data_Channels!H7', '=Data_Channels!I7', 'Quarter total', 'Prior quarter total', 'Change', '% change']);
    ['ip_recv', 'ip_send', 'ip_api', 'pn_recv', 'pn_send', 'pn_api'].forEach(function (k, j) {
      var r = 20 + j; S(ws, 'B' + r, '=Data_Channels!B' + DC[k]);
      'CDE'.split('').forEach(function (cl, q) { S(ws, cl + r, '=Data_Channels!' + 'GHI'[q] + DC[k], 'ref'); });
      S(ws, 'F' + r, '=SUM(C' + r + ':E' + r + ')', 'num'); S(ws, 'G' + r, '=SUM(' + dcp(k) + ')', 'num'); S(ws, 'H' + r, '=F' + r + '-G' + r, 'num', CHG); S(ws, 'I' + r, pchg('F' + r, 'G' + r), 'num', PCHG);
    });
    S(ws, 'B26', 'Total', 'total');
    'CDEFG'.split('').forEach(function (cl) { S(ws, cl + '26', '=SUM(' + cl + '20:' + cl + '25)', 'total', INT); });
    S(ws, 'H26', '=F26-G26', 'total', CHG); S(ws, 'I26', '=F26/G26-1', 'total', PCHG);
    S(ws, 'B29', 'DRB fund transfers to other banks, by rail', 'h2'); src(ws, 30, dn('raw') + ' (Data_Txn: SERVICE and QR GROUP columns); prior from Inputs');
    head(ws, 31, ['Rail', 'Count', 'Share', 'Prior quarter', 'Change', '% change']);
    S(ws, 'B32', 'InstaPay – regular'); S(ws, 'C32', '=SUMIFS(tx_n,' + OKC + ',tx_cat,"' + FTOB + '",tx_service,"INSTAPAY")-C33', 'num'); S(ws, 'E32', '=IF(p_ip_nonqr="","",p_ip_nonqr)', 'ref');
    S(ws, 'B33', 'InstaPay – QR P2P'); S(ws, 'C33', '=SUMIFS(tx_n,' + OKC + ',tx_qr,"' + QRG[0] + '")', 'num'); S(ws, 'E33', '=IF(p_qr_ob="","",p_qr_ob)', 'ref');
    S(ws, 'B34', 'PESONet'); S(ws, 'C34', '=SUMIFS(tx_n,' + OKC + ',tx_cat,"' + FTOB + '",tx_service,"PESONET")', 'num'); S(ws, 'E34', '=IF(OR(E32="",E33="",E35=""),"",E35-E32-E33)', 'num');
    [32, 33, 34].forEach(function (r) { S(ws, 'D' + r, '=C' + r + '/C$35', 'num', PCT); S(ws, 'F' + r, chg('C' + r, 'E' + r), 'num', CHG); S(ws, 'G' + r, pchg('C' + r, 'E' + r), 'num', PCHG); });
    S(ws, 'B35', 'Total fund transfers to other banks', 'total'); S(ws, 'C35', '=SUM(C32:C34)', 'total', INT); S(ws, 'D35', '=SUM(D32:D34)', 'total', PCT); S(ws, 'E35', '=IF(p_ftob="","",p_ftob)', 'total', INT);
    S(ws, 'F35', chg('C35', 'E35'), 'total', CHG); S(ws, 'G35', pchg('C35', 'E35'), 'total', PCHG);
    nm('c_ip_pct', ws, 'D32'); nm('c_qrp2p_pct', ws, 'D33'); nm('c_rail_tot', ws, 'C35');
    S(ws, 'B38', 'Amount ranges, DRB fund transfers to other banks', 'h2'); src(ws, 39, dn('raw') + " (Data_Txn: AMOUNT BAND, set from each transaction's amount)");
    head(ws, 40, ['Range', 'InstaPay', '% of InstaPay', 'PESONet', '% of PESONet']);
    BANDS.concat([['Not stated', 0, 0]]).forEach(function (b, j) {
      var r = 41 + j; S(ws, 'B' + r, b[0]);
      [['C', 'INSTAPAY', 'D'], ['E', 'PESONET', 'F']].forEach(function (x) {
        S(ws, x[0] + r, '=SUMIFS(tx_n,' + OKC + ',tx_cat,"' + FTOB + '",tx_service,"' + x[1] + '",tx_band,$B' + r + ')', 'num'); S(ws, x[2] + r, '=' + x[0] + r + '/' + x[0] + '$46', 'num', PCT);
      });
    });
    S(ws, 'B46', 'Total', 'total');
    [INT, PCT, INT, PCT].forEach(function (f, j) { var cl = 'CDEF'[j]; S(ws, cl + '46', '=SUM(' + cl + '41:' + cl + '45)', 'total', f); });
    nm('c_amt_tot', ws, 'C46'); nm('c_amt_tot2', ws, 'E46');
    bar(ws, 'N7', 'Monthly average transfers: this quarter vs prior', 'col', 7.5, 15, [{ ref: ref(ws, 9, 10, 9, 12), titleRef: ref(ws, 9, 9), color: PEER }, { ref: ref(ws, 7, 10, 7, 12), titleRef: ref(ws, 7, 9), color: AMBER }], ref(ws, 2, 10, 2, 12), 'b');
    donut(ws, 'N24', 'Transfers to other banks by rail', ref(ws, 3, 32, 3, 34), ref(ws, 2, 32, 2, 34), [NAVY, AMBER, PEER]);
    ws.freezeAt = 'C7';

    // ================================================================== Billers_Banks
    ws = WS.Billers_Banks;
    page(ws, 'Top billers and beneficiary banks', '="Successful bills payments and fund transfers to other banks  ·  "&in_period', [7, 48, 12, 14, 12],
      'which billers clients paid most often, and which banks they sent money to most often. Only successful transactions are counted.', 'F');
    S(ws, 'B7', 'Top billers, bills payment', 'h2'); src(ws, 8, dn('raw') + ' (Lists sheet)');
    head(ws, 9, ['Rank', 'Biller', 'Count', '% of bills payments', 'Row in Lists']);
    for (i = 0; i < 7; i++) {
      r_ = 10 + i; S(ws, 'B' + r_, i + 1, 'num', '0'); S(ws, 'F' + r_, '=MATCH(LARGE(lb_key,B' + r_ + '),lb_key,0)', 'num', '0');
      S(ws, 'C' + r_, '=INDEX(lb_name,F' + r_ + ')'); S(ws, 'D' + r_, '=INDEX(lb_cnt,F' + r_ + ')', 'num'); S(ws, 'E' + r_, '=D' + r_ + '/D$19', 'num', PCT);
    }
    S(ws, 'B17', null); S(ws, 'C17', 'Top 7 billers'); S(ws, 'D17', '=SUM(D10:D16)', 'num'); S(ws, 'E17', '=D17/D19', 'num', PCT);
    S(ws, 'B18', null); S(ws, 'C18', '="All other billers ("&COUNTIF(lb_cnt,">0")-7&")"'); S(ws, 'D18', '=D19-D17', 'num'); S(ws, 'E18', '=D18/D19', 'num', PCT);
    S(ws, 'B19', null, 'total'); S(ws, 'C19', 'Total bills payments', 'total'); S(ws, 'D19', '=SUMIFS(tx_n,' + OKC + ',tx_cat,"' + BP + '")', 'total', INT); S(ws, 'E19', '=E17+E18', 'total', PCT);
    nm('bb_bp_total', ws, 'D19');
    S(ws, 'B22', 'Top beneficiary banks, fund transfers to other banks', 'h2'); src(ws, 23, dn('raw') + ' (Lists sheet)');
    head(ws, 24, ['Rank', 'Beneficiary bank', 'Count', '% of transfers', 'Row in Lists']);
    for (i = 0; i < 5; i++) {
      r_ = 25 + i; S(ws, 'B' + r_, i + 1, 'num', '0'); S(ws, 'F' + r_, '=MATCH(LARGE(lk_key,B' + r_ + '),lk_key,0)', 'num', '0');
      S(ws, 'C' + r_, '=INDEX(lk_name,F' + r_ + ')'); S(ws, 'D' + r_, '=INDEX(lk_cnt,F' + r_ + ')', 'num'); S(ws, 'E' + r_, '=D' + r_ + '/D$31', 'num', PCT);
    }
    S(ws, 'B30', null); S(ws, 'C30', '="All others ("&COUNTIF(lk_cnt,">0")-5&" banks)"'); S(ws, 'D30', '=D31-SUM(D25:D29)', 'num'); S(ws, 'E30', '=D30/D31', 'num', PCT);
    S(ws, 'B31', null, 'total'); S(ws, 'C31', 'Total fund transfers to other banks', 'total'); S(ws, 'D31', '=SUMIFS(tx_n,' + OKC + ',tx_cat,"' + FTOB + '")', 'total', INT); S(ws, 'E31', '=SUM(E25:E30)', 'total', PCT);
    nm('bb_ob_total', ws, 'D31'); nm('bb_bank1', ws, 'C25'); nm('bb_bank1_pct', ws, 'E25');
    mergeNote(ws, 33, 'How the ranking works: LARGE picks the 1st, 2nd, 3rd … biggest count on the Lists sheet; INDEX returns the name and count in that row.', 'F');
    bar(ws, 'H7', 'Top 7 billers', 'bar', 7.5, 15, [{ ref: ref(ws, 4, 10, 4, 16), color: AMBER }], ref(ws, 3, 10, 3, 16), null);
    bar(ws, 'H23', 'Top beneficiary banks', 'bar', 7.5, 15, [{ ref: ref(ws, 4, 25, 4, 30), color: NAVY }], ref(ws, 3, 25, 3, 30), null);
    ws.freezeAt = 'C7';

    // ================================================================== QR
    ws = WS.QR;
    page(ws, 'QR transactions', '="Successful QR transactions by type  ·  "&in_period&" vs "&in_pq', [44, 13, 11, 13, 11, 13, 12],
      'how many successful payments and transfers clients made by scanning QR codes, by type, against last quarter.', 'H');
    S(ws, 'B7', 'QR transactions by type', 'h2'); src(ws, 8, dn('raw') + ' (Data_Txn: QR GROUP column); prior quarter from Inputs');
    head(ws, 9, ['QR transaction type', 'This quarter', '% of total', 'Prior quarter', 'Prior %', 'Change', '% change']);
    QRG.forEach(function (g, j) {
      var r = 10 + j, p = ['p_qr_ob', 'p_qr_p2m', 'p_qr_3p', 'p_qr_own', 'p_qr_p2b', 'p_qr_micro'][j];
      S(ws, 'B' + r, g); S(ws, 'C' + r, '=SUMIFS(tx_n,' + OKC + ',tx_qr,B' + r + ')', 'num'); S(ws, 'D' + r, '=C' + r + '/C$16', 'num', PCT);
      S(ws, 'E' + r, '=IF(' + p + '="","",' + p + ')', 'ref'); S(ws, 'F' + r, '=IF(E' + r + '="","n/a",E' + r + '/E$16)', 'num', PCT); S(ws, 'G' + r, chg('C' + r, 'E' + r), 'num', CHG); S(ws, 'H' + r, pchg('C' + r, 'E' + r), 'num', PCHG);
    });
    S(ws, 'B16', 'Total QR transactions (excluding activation)', 'total'); S(ws, 'C16', '=SUM(C10:C15)', 'total', INT); S(ws, 'D16', '=SUM(D10:D15)', 'total', PCT); S(ws, 'E16', '=SUM(E10:E15)', 'total', INT);
    S(ws, 'F16', '=SUM(F10:F15)', 'total', PCT); S(ws, 'G16', '=C16-E16', 'total', CHG); S(ws, 'H16', '=IF(E16=0,"n/a",C16/E16-1)', 'total', PCHG);
    S(ws, 'B18', 'QR activation'); S(ws, 'C18', '=SUMIFS(tx_n,' + OKC + ',tx_qr,"QR activation")', 'num');
    S(ws, 'B19', 'All QR rows including activation', 'total'); S(ws, 'C19', '=C16+C18', 'total', INT);
    nm('q_total', ws, 'C16'); nm('q_mtot', ws, 'F31'); nm('q_prior', ws, 'E16'); nm('q_chg', ws, 'H16');
    S(ws, 'B22', 'QR transactions by month', 'h2'); src(ws, 23, dn('raw') + ' (Data_Txn: MONTH and QR GROUP columns), successful only');
    head(ws, 24, ['QR transaction type', '=in_m1', '=in_m2', '=in_m3', 'Quarter total', 'Month 3 vs month 1', '% change']);
    QRG.forEach(function (g, j) {
      var r = 25 + j;
      S(ws, 'B' + r, g); ['C', 'D', 'E'].forEach(function (c) { S(ws, c + r, '=SUMIFS(tx_n,' + OKC + ',tx_qr,$B' + r + ',tx_month,' + c + '$24)', 'num', INT); });
      S(ws, 'F' + r, '=SUM(C' + r + ':E' + r + ')', 'num', INT); S(ws, 'G' + r, chg('E' + r, 'C' + r), 'num', CHG); S(ws, 'H' + r, pchg('E' + r, 'C' + r), 'num', PCHG);
    });
    S(ws, 'B31', 'Total QR transactions (excluding activation)', 'total'); 'CDEF'.split('').forEach(function (c) { S(ws, c + '31', '=SUM(' + c + '25:' + c + '30)', 'total', INT); });
    S(ws, 'G31', '=E31-C31', 'total', CHG); S(ws, 'H31', '=IF(C31=0,"n/a",E31/C31-1)', 'total', PCHG);
    S(ws, 'B32', 'Quarter total by month = quarter total above (C16)', 'note'); S(ws, 'F32', '=IF(F31=C16,"PASS","FAIL")', 'note');
    S(ws, 'B52', 'The chart shows the total and the three largest QR types; QR P2B, QR own-account transfers and QR P2Micro are too small to show as lines and are in the table above.', 'note');
    ws.charts.push({ type: 'line', title: 'QR transactions by month', anchor: 'B35', h: 8, w: 17, legend: 'b', cats: ref(ws, 3, 24, 5, 24),
      series: [[31, NAVY, 'Total QR transactions'], [25, AMBER, QRG[0]], [26, '2e7d9a', QRG[1]], [27, SLATE, QRG[2]]].map(function (x) { return { ref: ref(ws, 3, x[0], 5, x[0]), title: x[2], color: x[1] }; }) });
    bar(ws, 'J7', 'QR transactions: this quarter vs prior', 'col', 7.5, 17, [{ ref: ref(ws, 5, 10, 5, 15), titleRef: ref(ws, 5, 9), color: PEER }, { ref: ref(ws, 3, 10, 3, 15), titleRef: ref(ws, 3, 9), color: AMBER }], ref(ws, 2, 10, 2, 15), 'b');
    ws.freezeAt = 'C7';

    // ================================================================== Cards
    ws = WS.Cards;
    page(ws, 'Card activity', '="Transactions made from cards  ·  "&in_period', [52, 13, 12],
      'transactions made from cards (prepaid and debit) rather than from savings or current accounts, by type. All statuses are counted, as in prior reports.', 'G');
    var ccats = RAW.ccats;
    S(ws, 'B7', 'Transactions from cards, by type', 'h2'); src(ws, 8, dn('raw') + ' (Data_Txn: SOURCE = CARD, i.e. a 16-digit card number in the account field)');
    head(ws, 9, ['Transaction type', 'Count', '% of total']);
    var K0 = 10, K1 = K0 + ccats.length - 1;
    ccats.forEach(function (c, j) { var r = K0 + j; S(ws, 'B' + r, c); S(ws, 'C' + r, '=SUMIFS(tx_n,tx_source,"CARD",tx_cat,B' + r + ')', 'num'); S(ws, 'D' + r, '=C' + r + '/C$' + (K1 + 1), 'num', PCT); });
    S(ws, 'B' + (K1 + 1), 'Total transactions from cards', 'total'); S(ws, 'C' + (K1 + 1), '=SUM(C' + K0 + ':C' + K1 + ')', 'total', INT); S(ws, 'D' + (K1 + 1), '=SUM(D' + K0 + ':D' + K1 + ')', 'total', PCT);
    S(ws, 'B' + (K1 + 2), 'Prior quarter'); S(ws, 'C' + (K1 + 2), '=IF(p_card="","",p_card)', 'ref');
    S(ws, 'B' + (K1 + 3), 'Change'); S(ws, 'C' + (K1 + 3), chg('C' + (K1 + 1), 'C' + (K1 + 2)), 'num', CHG);
    S(ws, 'B' + (K1 + 4), '% change'); S(ws, 'C' + (K1 + 4), pchg('C' + (K1 + 1), 'C' + (K1 + 2)), 'num', PCHG);
    nm('k_total', ws, 'C' + (K1 + 1)); nm('k_chg', ws, 'C' + (K1 + 4));
    var K2 = K1 + 9;
    S(ws, 'B' + (K2 - 3), 'Cards with activity', 'h2'); src(ws, K2 - 2, dn('raw') + ' (Lists sheet: one row per card)');
    head(ws, K2 - 1, ['Card type', 'Cards', '% of cards']);
    ['PREPAID', 'DEBIT', 'Not stated'].forEach(function (t, j) { var r = K2 + j; S(ws, 'B' + r, t); S(ws, 'C' + r, '=COUNTIFS(lc_type,B' + r + ',lc_cnt,">0")', 'num'); S(ws, 'D' + r, '=C' + r + '/C$' + (K2 + 3), 'num', PCT); });
    S(ws, 'B' + (K2 + 3), 'Total cards with activity', 'total'); S(ws, 'C' + (K2 + 3), '=SUM(C' + K2 + ':C' + (K2 + 2) + ')', 'total', INT); S(ws, 'D' + (K2 + 3), '=SUM(D' + K2 + ':D' + (K2 + 2) + ')', 'total', PCT);
    nm('k_cards', ws, 'C' + (K2 + 3));
    bar(ws, 'F7', 'Transactions from cards, by type', 'bar', 7.5, 16, [{ ref: ref(ws, 3, K0, 3, K0 + 6), color: AMBER }], ref(ws, 2, K0, 2, K0 + 6), null);
    donut(ws, 'F24', 'Cards with activity, by type', ref(ws, 3, K2, 3, K2 + 2), ref(ws, 2, K2, 2, K2 + 2), [AMBER, NAVY, PEER], 6.5, 9);
    ws.freezeAt = 'C7';

    // ================================================================== QoQ
    ws = WS.QoQ;
    page(ws, 'Quarter-on-quarter comparison', '=in_q&" compared with "&in_pq', [46, 15, 15, 15, 13, 16],
      "every headline figure next to last quarter's. Green ▲ = went up; red ▼ = went down. Rates show the change in percentage points (pts).", 'G');
    S(ws, 'B7', 'Headline figures', 'h2'); src(ws, 8, 'the sheet named in the last column; prior quarter from Inputs');
    head(ws, 9, ['Measure', '=in_q', '=in_pq', 'Change', '% change', 'Worked on sheet']);
    var qrows = [['Total CIFs', '=in_total_cif', '=p_total_cif', INT, 'Usage'], ['Total enrolled CIFs', '=in_enrolled', '=p_enrolled', INT, 'Usage'], ['Enrolment rate', '=u_enrol_pct', '=u_enrol_pct_p', PCT, 'Usage'],
      ['Active users', '=u_active', '=p_fin+p_login', INT, 'Usage'], ['Have financial transactions', '=u_fin', '=p_fin', INT, 'Usage'], ['Have logged in to their accounts', '=u_login', '=p_login', INT, 'Usage'],
      ['Inactive (not logged in for > 90 days)', '=in_inactive', '=p_inactive', INT, 'Usage'], ["Have any online activity (Sir RD's count)", '=u_any', '=IF(p_cif_any="","",p_cif_any)', INT, 'Usage'], ['Active users (% of enrolled)', '=u_active_pct', '=u_active_pct_p', PCT, 'Usage'],
      ['CIF w/ usage (CIF Profile)', '=in_cif_usage', '=p_cif_usage', INT, 'Usage'], ['Female share of CIFs with financial transactions', '=pr_f_pct', '=p_female/(p_female+p_male)', PCT, 'Profile'],
      ['Successful financial transactions', '=t_total', '=IF(p_txn_total="","",p_txn_total)', INT, 'Transactions'], ['Fund transfers to other banks (DRB)', '=t_ftob', '=IF(p_ftob="","",p_ftob)', INT, 'Transactions'],
      ['DRB monthly average fund transfers', '=c_drb_avg', '=c_drb_p', INT, 'Channels'], ['DCB monthly average fund transfers', '=c_dcb_avg', '=c_dcb_p', INT, 'Channels'],
      ['API monthly average fund transfers', '=c_api_avg', '=c_api_p', INT, 'Channels'], ['All channels, monthly average', '=c_tot_avg', '=c_tot_p', INT, 'Channels'],
      ['QR transactions (excluding activation)', '=q_total', '=q_prior', INT, 'QR'], ['Transactions from cards', '=k_total', '=IF(p_card="","",p_card)', INT, 'Cards']];
    qrows.forEach(function (x, j) {
      var r = 10 + j; S(ws, 'B' + r, x[0]); S(ws, 'C' + r, x[1], 'num', x[3]); S(ws, 'D' + r, x[2], 'ref', x[3]);
      S(ws, 'E' + r, x[3] === PCT ? pts('C' + r, 'D' + r) : chg('C' + r, 'D' + r), 'num', x[3] === PCT ? PTSF : CHG);
      S(ws, 'F' + r, x[3] === PCT ? '' : pchg('C' + r, 'D' + r), 'num', PCHG); S(ws, 'G' + r, x[4], 'note');
    });
    var QE = 9 + qrows.length;
    S(ws, 'B' + (QE + 1), "n/a = last quarter's report did not state the figure.", 'note');
    var CF = QE + 5;
    S(ws, 'B' + (CF - 2), 'Carry-forward for next quarter', 'h2'); S(ws, 'B' + (CF - 1), 'Next quarter, copy these values into the prior-quarter cells on the Inputs sheet.', 'note');
    head(ws, CF, ['Inputs item', 'Value']);
    var cfr = [['Total CIFs', '=in_total_cif'], ['Total enrolled CIFs', '=in_enrolled'], ['CIF w/ usage (CIF Profile)', '=in_cif_usage'], ['Inactive (not logged in for > 90 days)', '=in_inactive'],
      ['Have financial transactions', '=u_fin'], ['Have logged in to their accounts', '=u_login'], ["Have any online activity (Sir RD's count)", '=u_any'],
      ['Have financial transactions – female', '=pr_f'], ['Have financial transactions – male', '=pr_m'],
      ['Successful financial transactions', '=t_total'], ['Fund transfers to other banks (DRB)', '=t_ftob'], ['…of which InstaPay, regular (non-QR)', '=Channels!C32'], ['Transactions from cards', '=k_total']]
      .concat(QRG.map(function (g, j) { return [g, '=QR!C' + (10 + j)]; }));
    cfr.forEach(function (x, j) { var r = CF + 1 + j; S(ws, 'B' + r, x[0]); S(ws, 'C' + r, x[1], 'num'); });
    S(ws, 'B' + (CF + cfr.length + 1), 'Transaction counts by type carry forward from the Transactions sheet, Quarter total column.', 'note');
    bar(ws, 'I7', 'CIFs by usage group: this quarter vs prior', 'col', 7.5, 16, [{ ref: ref(ws, 4, 13, 4, 16), title: 'Prior quarter', color: PEER }, { ref: ref(ws, 3, 13, 3, 16), title: 'This quarter', color: AMBER }], ref(ws, 2, 13, 2, 16), 'b');
    ws.freezeAt = 'C7';

    // ================================================================== Checks
    ws = WS.Checks;
    page(ws, 'Checks', 'Automatic tests on the figures and their sources.', [5, 56, 14, 14, 13, 11, 66],
      'tests that run every time the workbook calculates. PASS (green) = the numbers agree. FAIL (red) = something is wrong and must be fixed. REVIEW (amber) = a known difference between sources that needs a decision, not an error.', 'H');
    head(ws, 7, ['#', 'Check', 'Value A', 'Value B', 'Difference', 'Result', 'What it means']);
    var gs = 'Profile!F' + A0 + ':F' + A1;
    var checks = [
      ['No unmapped transaction types in the export', '=SUMIFS(tx_n,tx_cat,"UNMAPPED")', '=0', 'P', 'Every exported type has a category on the Map sheet.'],
      ['Rows counted = rows in the export file', '=t_rows', '=' + N, 'P', "B is the export's row count, read when the workbook was built."],
      ['Sum of types = successful rows', '=t_all', '=t_ok', 'P', 'Every successful row falls in exactly one type.'],
      ['Sum of the three months = quarter total', '=SUM(Transactions!D' + XG + ':F' + XG + ')', '=t_all', 'P', 'Fails if a month name on Inputs does not match the export.'],
      ['QR by month: sum of the three months = QR quarter total', '=q_mtot', '=q_total', 'P', 'Fails if a month name on Inputs does not match the export.'],
      ['Map sheet row counts = total rows', '=Map!F' + (me + 1), '=t_rows', 'P', 'Map covers every row.'],
      ['Data_CIF transactions = total rows', '=SUM(cif_n)', '=t_rows', 'P', 'Every row belongs to a listed CIF.'],
      ['Biller list covers all bills payments', '=SUM(lb_cnt)', '=bb_bp_total', 'P', 'Fails if a biller is missing from the Lists sheet.'],
      ['Bank list covers all transfers to other banks', '=SUM(lk_cnt)', '=bb_ob_total', 'P', 'Fails if a bank is missing from the Lists sheet.'],
      ['InstaPay + PESONet = transfers to other banks', '=c_rail_tot', '=t_ftob', 'P', 'Every transfer to another bank has a rail.'],
      ['Amount ranges cover all transfers to other banks', '=c_amt_tot+c_amt_tot2', '=t_ftob', 'P', 'Every transfer falls in a range.'],
      ['Gender: female + male + not stated = CIFs with financial transactions', '=pr_f+pr_m+Profile!C13', '=u_fin', 'P', 'One gender per CIF.'],
      ['Generation: bands + not determined = CIFs with financial transactions', '=SUM(' + gs + ')+Profile!F' + (A1 + 2), '=u_fin', 'P', 'Age bands do not overlap or leave gaps.'],
      ['Card list covers all card transactions', '=SUM(lc_cnt)', '=k_total', 'P', 'Every card transaction has a card ref on the Lists sheet.'],
      ['Have logged in to their accounts: count is not negative', '=u_login', '=0', 'GE', 'Negative means inactive + have financial transactions exceeds enrolled: the inputs are on different bases.'],
      ['Inactive count differs from prior quarter', '=in_inactive', '=p_inactive', 'NE', 'Equal values suggest the prior figure was not updated.'],
      ['Idle report carries balances', '=COUNTIF(id_bal,">0")', '=0', 'GT', "Zero means the report's balance column is empty, so the rule cannot be applied and a typed override is needed."],
      ['Inactive used = inactive calculated from the idle report', '=in_inactive', '=u_inact_calc', 'R', 'They differ when a typed override is in use.'],
      ['Active/idle table: generation total = staff total', '=pr_act_tbl+pr_idle_tbl', '=Profile!G' + C1, 'P', 'The two CIF tables describe the same clients.'],
      ['DCB monthly counts: ITCom file = Stats file', '=SUM(' + dcc('dcb_ft') + ')', 'dcb_x' in DC ? '=SUM(' + dcc('dcb_x') + ')' : null, 'P', 'The two DCB sources agree for the quarter.'],
      ['DRB monthly counts: Summary file = Stats file', '=SUM(' + dcc('drb_ft') + ')', 'drb_x' in DC ? '=SUM(' + dcc('drb_x') + ')' : null, 'P', 'The two DRB sources agree for the quarter.'],
      ['API: client table total = summary line', '=SUM(' + dcc('api_ft') + ')', '=SUM(' + dcc('api_sum') + ')', 'R', 'The report uses the client table total, as in prior reports.'],
      ['Enrolled total = active + idle table total', '=in_enrolled', '=pr_all_tbl', 'R', 'The enrolled total is net of dormant and closed; the active/idle table is not. Reason to be confirmed.'],
      ['Active users (computed) = active in CIF table', '=u_active', '=pr_act_tbl', 'R', 'Follows from the two enrolled bases above.'],
      ['CIF w/ usage (CIF Profile) = CIFs with financial transactions', '=in_cif_usage', '=u_fin', 'R', 'The supplied figure is not derived from the export; its source is to be confirmed.'],
      ['CIFs with financial transactions: all statuses = successful only', '=u_fin', '=u_fin_ok', 'R', 'The report counts CIFs with any financial transaction, as in prior reports; B counts successful only.'],
      ['RIB vs DRB: successful financial transactions', '=t_total', '=rib_ok', 'R', 'Both exports should agree on financial transactions. n/a = RIB Usage not supplied this quarter.'],
      ['RIB vs DRB: CIFs with financial transactions', '=u_fin', '=rib_cif', 'R', 'Both exports should agree on CIFs with financial transactions.'],
      ['RIB vs DRB: transfers to other banks', '=t_ftob', '=rib_ftob', 'R', 'Both exports should agree on transfers to other banks.']
    ];
    checks.forEach(function (x, j) {
      var r = 8 + j;
      S(ws, 'B' + r, j + 1, 'num', '0'); S(ws, 'C' + r, x[0], 'body', null, { wrap: true }); S(ws, 'D' + r, x[1], 'num'); S(ws, 'E' + r, x[2] === null ? 'not supplied' : x[2], 'num'); if (x[2] === null) { var es = ws.at('E' + r).s; es.font.size = 9; es.font.color = SLATE; delete es.align.h; } S(ws, 'F' + r, x[2] === null ? 'n/a' : '=IFERROR(D' + r + '-E' + r + ',"n/a")', 'num', INT);
      var rule = { P: 'IF(D' + r + '=E' + r + ',"PASS","FAIL")', GE: 'IF(D' + r + '>=E' + r + ',"PASS","FAIL")', GT: 'IF(D' + r + '>E' + r + ',"PASS","REVIEW")', NE: 'IF(D' + r + '<>E' + r + ',"PASS","REVIEW")', R: 'IF(D' + r + '=E' + r + ',"PASS","REVIEW")' }[x[3]];
      if (x[2] === null) rule = '"n/a"';
      S(ws, 'G' + r, '=IFERROR(' + rule + ',"n/a")', 'body', null, { bold: true, align: 'center' }); S(ws, 'H' + r, x[4], 'note', null, { wrap: true }); ws.height(r, 26);
    });
    var CE = 7 + checks.length;
    ws.condFormats.push({ sqref: 'G8:G' + CE, rules: [['PASS', GREEN, 'E6F2EC'], ['FAIL', RED, 'F8E5E3'], ['REVIEW', WARN, 'FFF1D6']].map(function (x) { return { op: 'equal', formula: '"' + x[0] + '"', dxf: { font: { bold: true, color: x[1] }, fill: x[2] } }; }) });
    S(ws, 'C' + (CE + 2), 'Count of results', 'h2');
    ['PASS', 'FAIL', 'REVIEW'].forEach(function (t, j) { S(ws, 'C' + (CE + 3 + j), t); S(ws, 'D' + (CE + 3 + j), '=COUNTIF(G8:G' + CE + ',"' + t + '")', 'num'); nm('ck_' + t.toLowerCase(), ws, 'D' + (CE + 3 + j)); });
    donut(ws, 'J7', 'Check results', ref(ws, 4, CE + 3, 4, CE + 5), ref(ws, 3, CE + 3, 3, CE + 5), [GREEN, RED, AMBER], 6.5, 9);
    ws.freezeAt = 'D8';

    // ================================================================== Sources
    ws = WS.Sources;
    page(ws, 'Reference files', 'Where every number in this workbook comes from.', [40, 46, 46, 24], 'each file the figures were taken from, what was taken, and where it is in this workbook. Anything not listed here is calculated by formula from these.', 'E', false);
    head(ws, 7, ['Reference data (sent by)', 'What it contains', 'What this workbook takes from it', 'Where it is in this workbook']);
    var srows = [[dn('raw'), 'Every online banking activity in the quarter, one row per transaction or action', "Month, type, status, service, beneficiary bank, biller, card and amount; each CIF's gender, age and staff tag", 'Data_Txn, Data_CIF, Lists'],
      [dn('rib'), 'Financial transactions only, in the older RIB layout', files.rib ? 'Totals used only to cross-check the DRB Usage export' : 'Not supplied this quarter; cross-checks show n/a', 'Data_Channels (bottom table), Checks'],
      [dn('cif'), 'Total CIFs, total enrolled CIFs, CIF w/ usage; active vs idle by generation and staff tag', 'Those figures, typed in from the text or snippet sent', 'Inputs'],
      [dn('idle'), 'Every enrolled account with no login for 90 days or more, with its balance', files.idle ? "Each CIF's number of accounts, total balance and least idle days" : 'Not supplied this quarter', 'Data_Idle'],
      [dn('drb_summary'), 'Monthly DRB, API, InstaPay and PESONet counts', 'Monthly fund-transfer counts for DRB and API; InstaPay and PESONet sending and receiving', 'Data_Channels'],
      [dn('itcom_dcb'), 'Monthly DCB (corporate) transaction counts', 'Monthly DCB fund transfers to other banks', 'Data_Channels'],
      [dn('dcb_stats'), 'A second copy of the DRB and DCB monthly counts', files.dcb_stats ? 'Monthly counts, only to cross-check' : 'Not supplied; its cross-checks show n/a', 'Data_Channels, Checks'],
      [cfg.prior_quarter + ' workbook and presentation', "Last quarter's reported figures", 'Prior-quarter figures, typed in', 'Inputs (prior-quarter cells)']];
    srows.forEach(function (row, j) {
      var r = 8 + j;
      row.forEach(function (t, q) { S(ws, L(2 + q) + r, t, q === 0 ? 'refl' : 'body', null, { wrap: true, bold: q === 0 ? true : null }); });
      ws.height(r, 42);
    });
    mergeNote(ws, 8 + srows.length + 1, 'Personal details (names, mobile numbers, email addresses), account numbers and card numbers are not copied into this workbook. Card numbers are replaced by card refs (CARD-00001 …).', 'E');

    // ================================================================== Method
    ws = WS.Method;
    page(ws, 'Method notes', 'What each figure means, how it is calculated and where it comes from.', [32, 54, 62, 36], 'the definition of every figure in plain words, the calculation behind it, and its source. Open items at the bottom are questions still to be settled.', 'E', false);
    head(ws, 7, ['Figure', 'What it means', 'How it is calculated', 'Source']);
    var meth = [
      ['Total CIFs', 'All client records (CIFs), excluding dormant and closed.', 'Typed in.', 'CIF Profile'],
      ['Total enrolled CIFs', 'Clients enrolled in Sterling Bank Online, excluding dormant and closed. Base for every usage %.', 'Typed in.', 'CIF Profile'],
      ['Enrolment rate', 'Share of all clients that are enrolled.', 'Enrolled CIFs ÷ Total CIFs.', 'Usage sheet'],
      ['Have financial transactions', 'Enrolled clients who made at least one financial transaction (a money movement such as a transfer, QR payment or bills payment) this quarter, successful or not. Password changes, sign-ups and other settings do not count.', 'Clients on Data_CIF with FINANCIAL ROWS above zero. Same basis as the RIB Usage export used up to Q1 2026.', 'DRB Usage'],
      ['Inactive (not logged in for > 90 days)', 'Enrolled clients with no login for more than 90 days who still hold a balance.', 'On Data_Idle: clients whose balance (summed across accounts) is above zero and whose least idle days exceed 90. Reproduces the Q1 2026 figure exactly.'  /* the skill's text quotes the figure; real figures stay out of the repo */, 'RIB Idle Accounts Report'],
      ['Have logged in to their accounts', 'Enrolled clients who logged in within 90 days but did not transact.', 'Enrolled − (with financial transactions + inactive).', 'Usage sheet'],
      ['Active users', 'Enrolled clients who transacted or logged in within 90 days.', 'Have financial transactions + have logged in to their accounts.', 'Usage sheet'],
      ["Have any online activity (Sir RD's count)", "Enrolled clients with any row in the usage file this quarter, including password changes, sign-ups, favorites, alerts and statement requests. The Q2 2026 deck reported this as 'have financial transactions'. Shown for comparison only.", 'All clients on Data_CIF (COUNTA). Active users are the same on both counts.', 'DRB Usage'],
      ['CIF w/ usage (CIF Profile)', "Ms. Hong's own usage figure, net of seniors, Neo below 18, BOS accounts, Iremit, closed and dormant.", 'Typed in; not traced to the export.', 'CIF Profile'],
      ['Gender and generation', 'Profile of clients who transacted. Clients with no gender or age are left out of the %.', "COUNTIF on Data_CIF's GENDER and AGE columns.", 'DRB Usage'],
      ['Generation, active vs idle', 'All enrolled clients by generation, split by login within 90 days.', 'Typed in; % are column shares.', 'CIF Profile'],
      ['Transaction count', 'Successful transactions, grouped into report types; financial transactions first, other online activity listed separately.', 'SUMIFS on Data_Txn by status, category and month. The Financial? flag comes from the Map sheet.', 'DRB Usage'],
      ['Monthly average by channel', 'Average monthly transfers to and from other banks, per channel.', 'Three monthly counts ÷ 3.', 'DRB Reports Summary; ITCom DCB Reports'],
      ['Top billers and banks', 'Billers and beneficiary banks with the most successful transactions.', 'SUMIFS per name on Lists; ranked with LARGE, returned with INDEX and MATCH.', 'DRB Usage'],
      ['QR transactions', 'Successful QR payments and transfers, excluding QR activation.', "SUMIFS on Data_Txn's QR GROUP column.", 'DRB Usage'],
      ['Transactions from cards', 'Transactions where the source is a card. All statuses count, as in prior reports.', 'SUMIFS on Data_Txn where SOURCE = CARD.', 'DRB Usage'],
      ['Prior-quarter figures', 'The comparison basis for every change shown.', "Typed in; channel figures use last quarter's months on Data_Channels.", "Last quarter's workbook and presentation"],
      ['RIB and DRB', 'RIB = Retail Internet Banking, the earlier name and export layout of the online banking platform. DRB = Digital Retail Banking (Sterling Bank Online).', '—', '—'],
      ['Green ▲ / red ▼', 'Direction of change against last quarter.', "Built into the cell's number format: green ▲ when the change is above zero, red ▼ when below.", '—']
    ];
    meth.forEach(function (row, j) {
      var r = 8 + j; row.forEach(function (t, q) { S(ws, L(2 + q) + r, t, 'body', null, { wrap: true, bold: q === 0 ? true : null }); }); ws.height(r, 40);
    });
    var r1 = 8 + meth.length + 2;
    S(ws, 'B' + r1, 'Open items', 'h2');
    (cfg.open_items || []).forEach(function (t, j) { mergeNote(ws, r1 + 1 + j, '•  ' + t, 'E', 'sub', 28); });

    // ================================================================== Summary
    ws = WS.Summary;
    page(ws, 'Quarter summary', '="Sterling Bank Online | Digital Retail Banking (DRB)  ·  "&in_period&"  ·  compared with "&in_pq', [14, 13, 14, 13, 14, 13, 14, 13, 14, 13, 14, 13],
      'the headline figures and what they show. Every number and sentence here is a formula linked to the detailed sheets, so it updates by itself.', 'M', false);
    var tiles = [['ENROLMENT RATE', '=u_enrol_pct', '0%', '=TEXT(in_enrolled,"#,##0")&" of "&TEXT(in_total_cif,"#,##0")&" CIFs"', '=(u_enrol_pct-u_enrol_pct_p)*100', PTSF],
      ['ACTIVE USERS', '=u_active_pct', '0%', '=TEXT(u_active,"#,##0")&" of enrolled CIFs"', '=(u_active_pct-u_active_pct_p)*100', PTSF],
      ['HAVE FIN. TXNS', '=u_fin', '#,##0', '=TEXT(u_fin_pct,"0%")&" of enrolled CIFs"', '=u_fin/p_fin-1', PCHG],
      ['FINANCIAL TXNS', '=t_total', '#,##0', '="Top type: "&TEXT(t_top1_pct,"0%")&" of total"', '=IF(p_txn_total="","no prior figure",t_total/p_txn_total-1)', PCHG],
      ['DRB MONTHLY AVG FT', '=c_drb_avg', '#,##0', '=TEXT(c_drb_share,"0%")&" of all channels"', '=c_drb_chg', PCHG],
      ['CARD TRANSACTIONS', '=k_total', '#,##0', '=TEXT(k_cards,"#,##0")&" cards with activity"', '=k_chg', PCHG]];
    tiles.forEach(function (x, j) {
      var a = L(2 + j * 2), b = L(3 + j * 2), r;
      for (r = 6; r < 10; r++) [a, b].forEach(function (cc) { st(ws.at(cc + r)).fill = NAVY; });
      [7, 8, 9, 10].forEach(function (rr) { merge(ws, a + rr + ':' + b + rr); });
      [[7, x[0], { name: 'Arial', size: 9, bold: true, color: '8FA2C2' }, null], [8, x[1], { name: 'Georgia', size: 24, bold: true, color: j === 1 ? AMBER : 'FFFFFF' }, x[2]],
        [9, x[3], { name: 'Arial', size: 9, color: 'C8D2E4' }, null], [10, x[4], { name: 'Arial', size: 10, bold: true, color: INK }, x[5]]].forEach(function (y) {
        var c = ws.at(a + y[0]); set(c, y[1]); var s = st(c); s.font = y[2]; s.align = { h: 'left', v: 'center', indent: 1 };
        if (y[3]) s.numFmt = y[3];
      });
      [a, b].forEach(function (cc) { st(ws.at(cc + '10')).border = { bottom: { style: 'medium', color: NAVY } }; });
    });
    S(ws, 'B12', '="Line under each tile: change vs "&in_pq&". Green ▲ up, red ▼ down."', 'note');
    ws.height(6, 6); ws.height(8, 38); ws.height(10, 22);
    S(ws, 'B14', 'What the data shows', 'h2');
    var stm = [
      '="Enrolment stands at "&TEXT(u_enrol_pct,"0%")&" of total CIFs ("&TEXT(in_enrolled,"#,##0")&" of "&TEXT(in_total_cif,"#,##0")&"), "&IF(in_enrolled>=p_enrolled,"up ","down ")&TEXT(ABS(in_enrolled/p_enrolled-1),"0%")&" from "&TEXT(p_enrolled,"#,##0")&" in "&in_pq&"."',
      '=TEXT(u_active,"#,##0")&" enrolled CIFs ("&TEXT(u_active_pct,"0%")&") are active users: "&TEXT(u_fin,"#,##0")&" have financial transactions and "&TEXT(u_login,"#,##0")&" have logged in to their accounts. "&TEXT(in_inactive,"#,##0")&" ("&TEXT(u_inactive_pct,"0%")&") have not logged in for more than 90 days."',
      '="CIFs with financial transactions "&IF(u_fin>=p_fin,"rose ","fell ")&TEXT(ABS(u_fin/p_fin-1),"0%")&" to "&TEXT(u_fin,"#,##0")&" from "&TEXT(p_fin,"#,##0")&"; CIFs that have logged in to their accounts "&IF(u_login>=p_login,"rose ","fell ")&TEXT(ABS(u_login/p_login-1),"0%")&" to "&TEXT(u_login,"#,##0")&" from "&TEXT(p_login,"#,##0")&"."',
      '="Of CIFs with financial transactions, "&TEXT(pr_f_pct,"0%")&" are female and "&TEXT(pr_mill_pct,"0%")&" are Millennials. Of all enrolled CIFs, Millennials are "&TEXT(pr_mill_enr_pct,"0%")&"."',
      '="The top three transaction types are "&t_top1&" ("&TEXT(t_top1_pct,"0%")&"), "&t_top2&" ("&TEXT(t_top2_pct,"0%")&") and "&t_top3&" ("&TEXT(t_top3_pct,"0%")&"), out of "&TEXT(t_total,"#,##0")&" successful financial transactions"&IF(p_txn_total="","."," ("&TEXT(t_total/p_txn_total-1,"+0%;-0%")&" vs "&in_pq&").")',
      '="DRB fund transfers to and from other banks averaged "&TEXT(c_drb_avg,"#,##0")&" a month ("&TEXT(c_drb_chg,"+0%;-0%")&" vs "&in_pq&"); DCB averaged "&TEXT(c_dcb_avg,"#,##0")&" ("&TEXT(c_dcb_chg,"+0%;-0%")&") and API "&TEXT(c_api_avg,"#,##0")&" ("&TEXT(c_api_chg,"+0%;-0%")&")."',
      '="InstaPay carries "&TEXT(c_ip_pct+c_qrp2p_pct,"0%")&" of DRB transfers to other banks, of which QR P2P is "&TEXT(c_qrp2p_pct,"0%")&" of the total. "&bb_bank1&" receives "&TEXT(bb_bank1_pct,"0%")&" of these transfers."',
      '="QR transactions total "&TEXT(q_total,"#,##0")&IF(q_prior>0," ("&TEXT(q_chg,"+0%;-0%")&" vs "&in_pq&")","")&". Transactions from cards total "&TEXT(k_total,"#,##0")&IF(ISNUMBER(k_chg)," ("&TEXT(k_chg,"+0%;-0%")&" vs "&in_pq&")","")&" across "&TEXT(k_cards,"#,##0")&" cards."'];
    stm.forEach(function (f, j) {
      var r = 15 + j; S(ws, 'B' + r, f, 'body', null, { wrap: true }); merge(ws, 'B' + r + ':M' + r); ws.height(r, 30);
      for (var cc = 2; cc < 14; cc++) st(ws.atRC(r, cc)).fill = CREAM;
    });
    S(ws, 'B24', '="Checks: "&ck_pass&" pass, "&ck_fail&" fail, "&ck_review&" for review (see the Checks sheet)."', 'note');
    var us = WS.Usage, tr = WS.Transactions, chs = WS.Channels;
    donut(ws, 'B26', 'Enrolled CIFs: active vs inactive', ref(us, 3, 20, 3, 21), ref(us, 2, 20, 2, 21), [AMBER, PEER], 7, 8.5);
    bar(ws, 'F26', 'Successful financial transactions by type', 'bar', 7, 15.5, [{ ref: ref(tr, 7, X0, 7, TOP8), color: NAVY }], ref(tr, 3, X0, 3, TOP8), null);
    bar(ws, 'L26', 'Monthly avg transfers by channel', 'col', 7, 8.5, [{ ref: ref(chs, 7, 10, 7, 12), color: AMBER }], ref(chs, 2, 10, 2, 12), null);

    // ================================================================== Cover
    ws = WS.Cover; page(ws, null, null, [26, 84, 18], null, null, false);
    for (var rr = 1; rr < 10; rr++) 'ABCD'.split('').forEach(function (cc) { st(ws.at(cc + rr)).fill = NAVY; });
    [['B3', 'QUARTERLY USAGE REPORT  ·  WORKED FIGURES', { name: 'Arial', size: 9, bold: true, color: '8FA2C2' }],
      ['B5', 'Sterling Bank Online | Digital Retail Banking (DRB)', { name: 'Georgia', size: 22, bold: true, color: 'FFFFFF' }],
      ['B6', '="DRB Usage, "&in_q&"  ·  "&in_period', { name: 'Georgia', size: 14, color: AMBER }],
      ['B8', '="Compared with "&in_pq&"  ·  CIF figures as of "&in_asof', { name: 'Arial', size: 10, color: 'C8D2E4' }]].forEach(function (x) { var c = ws.at(x[0]); set(c, x[1]); st(c).font = x[2]; });
    ws.height(5, 34); ws.height(6, 24);
    S(ws, 'B11', 'How to use this workbook', 'h2');
    ['Start with Summary for the headline figures and what they show.',
      'Open any report sheet (navy tabs) for the detail. The cream box at the top of each sheet says what it shows; the line under each table title says where the numbers come from.',
      'Colours tell you where a number comes from: shaded blue = taken from a reference file; cream with blue text = typed in on the Inputs sheet; white = calculated by formula.',
      'Green ▲ means a figure went up versus last quarter; red ▼ means it went down.',
      'Look at the Checks sheet: PASS and REVIEW are fine to proceed; any FAIL must be fixed before the figures are used.',
      'Formulas are locked so they cannot be overwritten by accident. Only the cream cells can be typed into. To unlock a sheet: Review › Unprotect Sheet (no password).'].forEach(function (t, j) {
      var r = 12 + j; S(ws, 'B' + r, j + 1, 'num', '0', { align: 'center' }); S(ws, 'C' + r, t, 'body', null, { wrap: true }); ws.height(r, 30);
    });
    S(ws, 'B19', 'Contents', 'h2'); head(ws, 20, ['Sheet', 'What it shows']);
    var toc = [['Summary', 'Headline figures and what the data shows'], ['Usage', 'Enrolment rate and the active / inactive split of enrolled CIFs'], ['Profile', 'Gender, generation and staff tag'],
      ['Transactions', 'Successful transactions by type and month'], ['Channels', 'Fund transfers by channel (DRB, DCB, API), InstaPay and PESONet'], ['Billers_Banks', 'Top billers and beneficiary banks'],
      ['QR', 'QR transactions by type'], ['Cards', 'Transactions made from cards'], ['QoQ', "Quarter-on-quarter comparison and next quarter's carry-forward"],
      ['Checks', 'Automatic tests on the figures'], ['Sources', 'Which reference file each number comes from'], ['Method', 'Definitions, calculations and open items'],
      ['Inputs', 'The typed figures: period, CIF counts, inactive rule, prior quarter'], ['Map', 'Exported transaction type → report category'], ['Lists', 'Billers, banks and cards with live counts'],
      ['Data_Channels', 'Monthly channel counts from the ITCom and DRB report files'], ['Data_Idle', 'The RIB Idle Accounts Report, one row per idle CIF'],
      ['Data_CIF', 'Clients who transacted, one row per CIF'], ['Data_Txn', 'The transaction export, summarised']];
    toc.forEach(function (x, j) {
      var r = 21 + j, c = S(ws, 'B' + r, x[0]); ws.links.push({ ref: 'B' + r, location: x[0] + '!A1', display: x[0] });
      c.s.font = { name: 'Arial', size: 10, color: '2563A8', underline: 'single' }; S(ws, 'C' + r, x[1]);
    });
    var today = input.today || new Date();
    S(ws, 'B' + (21 + toc.length + 1), 'Prepared ' + String(today.getDate()).padStart(2, '0') + ' ' + MONTHS[today.getMonth()] + ' ' + today.getFullYear() + '  ·  Product Management, Sterling Bank of Asia  ·  Internal', 'note');

    ORDER.forEach(function (n) { WS[n].protect = true; });
    var exp = Object.assign({}, RAW.expected, { idle_cifs: NI, idle_accounts: IACC });
    return { wb: wb, expected: exp, layout: { XFS: XFS, X0: X0, XF1: XF1, CE: CE, A0: A0, A1: A1 } };
  };

  /* ---------- headline figures for the review screen (after wb.calculate()) ---------- */
  DRB.figures = function (wb) {
    var c = wb.calc, nv = function (n) { var r = c.names[n.toUpperCase()]; if (!r) return null; var v = c.cellValue(r.sheet, r.r1, r.c1); return XC.isErr(v) ? null : v; };
    var get = function (sh, ref) { var v = wb.value(sh, ref); return XC.isErr(v) ? null : v; };
    var checks = [], CE = 8;
    for (var r = 8; get('Checks', 'C' + r); r++) { checks.push({ n: get('Checks', 'B' + r), label: get('Checks', 'C' + r), a: get('Checks', 'D' + r), b: get('Checks', 'E' + r), result: get('Checks', 'G' + r), why: get('Checks', 'H' + r) }); CE = r; }
    var top = function (r0, n) { var out = []; for (var i = 0; i < n; i++) out.push({ name: get('Billers_Banks', 'C' + (r0 + i)), count: get('Billers_Banks', 'D' + (r0 + i)), pct: get('Billers_Banks', 'E' + (r0 + i)) }); return out; };
    var qoq = []; for (r = 10; get('QoQ', 'B' + r) && r < 40; r++) qoq.push({ label: get('QoQ', 'B' + r), cur: get('QoQ', 'C' + r), prior: get('QoQ', 'D' + r), chg: get('QoQ', 'E' + r), pchg: get('QoQ', 'F' + r), pct: /rate|share|%/i.test(get('QoQ', 'B' + r)) });
    var stm = []; for (r = 15; r < 23; r++) stm.push(get('Summary', 'B' + r));
    return {
      tiles: [
        { label: 'Enrolment rate', value: nv('u_enrol_pct'), pct: true, sub: get('Summary', 'B9'), chg: get('Summary', 'B10'), chgKind: 'pts' },
        { label: 'Active users', value: nv('u_active_pct'), pct: true, sub: get('Summary', 'D9'), chg: get('Summary', 'D10'), chgKind: 'pts' },
        { label: 'CIFs with financial transactions', value: nv('u_fin'), sub: get('Summary', 'F9'), chg: get('Summary', 'F10'), chgKind: 'pct' },
        { label: 'Financial transactions', value: nv('t_total'), sub: get('Summary', 'H9'), chg: get('Summary', 'H10'), chgKind: 'pct' },
        { label: 'DRB monthly average fund transfers', value: nv('c_drb_avg'), sub: get('Summary', 'J9'), chg: get('Summary', 'J10'), chgKind: 'pct' },
        { label: 'Card transactions', value: nv('k_total'), sub: get('Summary', 'L9'), chg: get('Summary', 'L10'), chgKind: 'pct' }
      ],
      statements: stm, checks: checks, pass: nv('ck_pass'), fail: nv('ck_fail'), review: nv('ck_review'),
      billers: top(10, 7), billersTotal: get('Billers_Banks', 'D19'), banks: top(25, 5), banksTotal: get('Billers_Banks', 'D31'), qoq: qoq
    };
  };

  /* ---------- prior quarter, read from last quarter's workbook (QoQ carry-forward + Transactions quarter totals) ---------- */
  var CARRY = { 'Total CIFs': 'total_cif', 'Total enrolled CIFs': 'enrolled', 'CIFs with usage (as supplied)': 'cif_usage', 'Inactive CIFs': 'inactive',
    'Active CIFs with financial transactions': 'fin', 'Active CIFs, logged in only': 'login', 'Transacting CIFs – female': 'female', 'Transacting CIFs – male': 'male',
    // labels used from the Q3 2026 layout on (older workbooks use the ones above)
    'CIF w/ usage (CIF Profile)': 'cif_usage', 'Inactive (not logged in for > 90 days)': 'inactive', 'Have financial transactions': 'fin', 'Have logged in to their accounts': 'login',
    "Have any online activity (Sir RD's count)": 'cif_any', 'Have financial transactions – female': 'female', 'Have financial transactions – male': 'male',
    'Successful financial transactions': 'txn_total', 'Fund transfers to other banks (DRB)': 'ftob', '…of which InstaPay, regular (non-QR)': 'ip_nonqr', 'Transactions from cards': 'card' };
  QRG.forEach(function (g, j) { CARRY[g] = ['qr_ob', 'qr_p2m', 'qr_3p', 'qr_own', 'qr_p2b', 'qr_micro'][j]; });
  var PRIOR_LIST = ['total_cif', 'enrolled', 'cif_usage', 'fin', 'cif_any', 'login', 'inactive', 'female', 'male', 'txn_total', 'ftob', 'ip_nonqr', 'card', 'qr_ob', 'qr_p2m', 'qr_3p', 'qr_own', 'qr_p2b', 'qr_micro'];
  DRB.PRIOR_KEYS = ['total_cif', 'enrolled', 'cif_usage', 'fin', 'cif_any', 'login', 'inactive', 'female', 'male', 'txn_total', 'ftob', 'ip_nonqr', 'card', 'qr_ob', 'qr_p2m', 'qr_3p', 'qr_own', 'qr_p2b', 'qr_micro'];
  DRB.readPrior = function (book) {   // book: parsed .xlsx (cached values)
    var q = book.grids.QoQ, t = book.grids.Transactions, inp = book.grids.Inputs;
    if (!q || !t) stop('This does not look like a DRB Usage worked-figures workbook (no QoQ or Transactions sheet).');
    var out = { prior: {}, categories: {}, quarter: null, open_items: [] }, label = 'last quarter\'s workbook';
    var qi = (q.find(function (r) { return r && typeof r[1] === 'string' && /compared with/.test(r[1]); }) || [])[1];
    var start = q.findIndex(function (r) { return r && r[1] === 'Inputs item'; });
    if (start < 0) stop('The QoQ sheet of last quarter\'s workbook has no carry-forward table.');
    if (q[9] == null || q[9][2] === null || q[9][2] === undefined || q[9][2] === '') stop('Last quarter\'s workbook has no stored values (it was saved without being calculated). Open it in Excel, save it, and try again.');
    for (var r = start + 1; r < q.length; r++) {
      var row = q[r] || [], k = CARRY[row[1]];
      if (k) out.prior[k] = typeof row[2] === 'number' ? Math.round(row[2]) : null;
    }
    out.missing = PRIOR_LIST.filter(function (k) { return out.prior[k] == null; });   // not in the carry-forward: to be typed
    if (inp) for (r = 0; r < inp.length; r++) if (inp[r] && inp[r][1] === 'Quarter') { out.quarter = inp[r][2]; break; }
    var hr = t.findIndex(function (r) { return r && r[2] === 'Transaction type' && r[6] === 'Quarter total'; });
    if (hr >= 0) for (r = hr + 1; r < t.length; r++) {
      var x = t[r] || [];
      if (x[2] === 'Financial transactions' || x[2] === 'All successful activity') break;   // financial types only, as read_prior.py
      if (typeof x[2] === 'string' && typeof x[6] === 'number') out.categories[x[2]] = Math.round(x[6]);
    }
    var m = book.grids.Method;
    if (m) { var oi = m.findIndex(function (r) { return r && r[1] === 'Open items'; }); if (oi >= 0) for (r = oi + 1; r < m.length; r++) { var s = m[r] && m[r][1]; if (typeof s === 'string' && s.indexOf('•') === 0) out.open_items.push(s.replace(/^•\s*/, '')); } }
    out.label = label; out.compared = qi || '';
    return out;
  };

  /* =====================================================================
     4. Reading the big DRB Usage export in the browser
        .xlsx: unzipped with JSZip and scanned piece by piece; only the 13 columns the report needs are kept,
        and only the shared strings those cells use. .csv: read as a stream. Both feed a RawAgg.
     ===================================================================== */
  function unxml(s) {
    if (s.indexOf('&') < 0 && s.indexOf('_x') < 0) return s;
    return s.replace(/&(?:lt|gt|amp|quot|apos|#(\d+)|#x([0-9a-fA-F]+));/g, function (m, d, h) {
      return d ? String.fromCodePoint(+d) : h ? String.fromCodePoint(parseInt(h, 16)) : { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&apos;': "'" }[m];
    }).replace(/_x([0-9A-Fa-f]{4})_/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); });
  }
  function siText(inner) {   // text of one <si>: all <t> runs, phonetic runs left out
    inner = inner.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
    var out = '', re = /<t\b[^>]*>([\s\S]*?)<\/t>|<t\b[^>]*\/>/g, m;
    while ((m = re.exec(inner))) out += m[1] || '';
    return unxml(out);
  }
  // Streams one zip entry as text; onText(chunk, done) returns false to stop early.
  function streamEntry(entry, onText, onPct) {
    return new Promise(function (resolve, reject) {
      var dec = new TextDecoder('utf-8'), st = entry.internalStream('uint8array'), stopped = false;
      st.on('data', function (chunk, meta) {
        if (stopped) return;
        if (onPct && meta) onPct(meta.percent || 0);
        try { if (onText(dec.decode(chunk, { stream: true }), false) === false) { stopped = true; st.pause(); resolve(); } }
        catch (e) { stopped = true; st.pause(); reject(e); }
      });
      st.on('error', function (e) { if (!stopped) { stopped = true; reject(e); } });
      st.on('end', function () { if (stopped) return; try { onText(dec.decode(), true); resolve(); } catch (e) { reject(e); } });
      st.resume();
    });
  }
  function colIdx(ref) { var m = /^([A-Z]+)/.exec(ref || ''); return m ? XC.colNum(m[1]) - 1 : -1; }
  // Calls onRow(rowNumber, cells[]) for each <row>; a cell is {v, s} (s = shared-string index or -1).
  // want (optional): {colIndex: true}; other columns are skipped without being decoded.
  var R_ATTR = /\br="([A-Z]+)/, T_ATTR = /\bt="([^"]*)"/, ROW_R = /\br="(\d+)"/, V_TAG = /<v>([\s\S]*?)<\/v>/;
  function sheetScanner(onRow, want) {
    var buf = '', rowRe = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g, cRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, lastRow = 0;
    return function (text, done) {
      buf += text;
      var end;
      if (done) end = buf.length; else { end = buf.lastIndexOf('</row>'); if (end < 0) return; end += 6; }
      var seg = buf.slice(0, end); buf = buf.slice(end);
      rowRe.lastIndex = 0; var m;
      while ((m = rowRe.exec(seg))) {
        var rm = ROW_R.exec(m[1]), rn = rm ? +rm[1] : lastRow + 1; lastRow = rn;
        var cells = [], body = m[2] || '', c, pos = 0;
        cRe.lastIndex = 0;
        while ((c = cRe.exec(body))) {
          var a = c[1], ra = R_ATTR.exec(a), ci = ra ? XC.colNum(ra[1]) - 1 : pos; pos = ci + 1;
          if (want && !want[ci]) continue;
          var inner = c[2] || '', tm = T_ATTR.exec(a), t = tm ? tm[1] : null, vm = V_TAG.exec(inner), v = null, sIdx = -1;
          if (t === 's') { if (vm) sIdx = +vm[1]; }
          else if (t === 'inlineStr') { v = siText(inner); }
          else if (t === 'str' || t === 'd') { v = vm ? unxml(vm[1]) : null; }
          else if (t === 'b') { v = vm ? vm[1] === '1' : null; }
          else if (t === 'e') { v = null; }
          else if (vm) { v = Number(vm[1]); }
          cells[ci] = { v: v, s: sIdx };
        }
        onRow(rn, cells);
      }
    };
  }
  // -> Promise<{rows, sheet}>. data: Blob | ArrayBuffer | Uint8Array.
  DRB.readRawXlsx = function (data, agg, onProgress) {
    var JSZip = root.JSZip, zip, paths, hasRaw, hdrRow = 1, sstPath = null, prog = onProgress || function () {};
    prog('Opening the file…', 0);
    return JSZip.loadAsync(data).then(function (z) {
      zip = z;
      return Promise.all([z.file('xl/workbook.xml').async('string'), z.file('xl/_rels/workbook.xml.rels').async('string')]);
    }).then(function (x) {
      var sheets = [], rels = {}, m, re = /<sheet\b[^>]*?name="([^"]*)"[^>]*?r:id="([^"]*)"/g, rr = /<Relationship\b([^>]*)\/?>/g;
      while ((m = re.exec(x[0]))) sheets.push({ name: unxml(m[1]), id: m[2] });
      while ((m = rr.exec(x[1]))) {
        var id = /Id="([^"]*)"/.exec(m[1]), tg = /Target="([^"]*)"/.exec(m[1]), ty = /Type="([^"]*)"/.exec(m[1]);
        if (!id || !tg) continue;
        var path = tg[1].charAt(0) === '/' ? tg[1].slice(1) : 'xl/' + tg[1].replace(/^\.\//, '');
        rels[id[1]] = path; if (ty && /sharedStrings$/.test(ty[1])) sstPath = path;
      }
      // the RAW sheet if there is one; otherwise every sheet in order (the RIB Usage Report V2 runs over several sheets)
      var raw = sheets.filter(function (s) { return s.name.trim().toUpperCase() === 'RAW'; });
      hasRaw = raw.length > 0;
      paths = (hasRaw ? raw : sheets).map(function (s) { return rels[s.id]; }).filter(function (p) { return p && zip.file(p); });
      if (!paths.length) stop('The sheet with the transactions could not be found inside the file.');
      if (sstPath && !zip.file(sstPath)) sstPath = null;
      // pass 1: the first 40 rows of the first sheet, to find the header row
      var top = [], wantS = {};
      return streamEntry(zip.file(paths[0]), (function () {
        var scan = sheetScanner(function (rn, cells) {
          if (top.length >= 40) return;
          top.push({ rn: rn, cells: cells }); cells.forEach(function (c) { if (c && c.s >= 0) wantS[c.s] = 1; });
        });
        return function (t, done) { scan(t, done); return top.length < 40; };
      })()).then(function () { return loadStrings(wantS, true); }).then(function (sst) {
        if (!top.length) stop('The RAW sheet is empty.');
        var named = top.map(function (r) { return Array.from(r.cells, function (c) { if (!c) return ''; var v = c.s >= 0 ? sst[c.s] : c.v; return v === null || v === undefined ? '' : String(v).trim(); }); });
        var h = named.map(function (n) { return n.indexOf('TRANSACTION_MONTH') >= 0; }).indexOf(true);
        if (h < 0) stop('No header row with TRANSACTION_MONTH was found' + (hasRaw ? ' on the RAW sheet' : ' in this workbook') + '. Is it the DRB Usage export?');
        hdrRow = top[h].rn;
        return rawCols(named[h]);
      });
    }).then(function (cols) {
      // pass 2: every row after the header, the needed columns only
      var rows = [], masks = [], needS = {}, want = {}, si = 0;
      cols.forEach(function (c) { want[c] = true; });
      var scan = function () {
        return sheetScanner(function (rn, cells) {
          if (si === 0 && rn <= hdrRow) return;
          var row = new Array(cols.length), mask = 0;
          for (var k = 0; k < cols.length; k++) {
            var c = cells[cols[k]];
            if (!c) { row[k] = null; continue; }
            if (c.s >= 0) { row[k] = c.s; mask |= 1 << k; needS[c.s] = 1; } else row[k] = c.v;
          }
          rows.push(row); masks.push(mask);
        }, want);
      };
      return paths.reduce(function (pr, path, k) {
        return pr.then(function () {
          si = k; var sc = scan(), lab = paths.length > 1 ? ' (sheet ' + (k + 1) + ' of ' + paths.length + ')' : '';
          return streamEntry(zip.file(path), function (t, done) { sc(t, done); }, function (p) { prog('Reading the transactions' + lab + '… ' + Math.round(p) + '%', (k + p / 100) / paths.length * 80); });
        });
      }, Promise.resolve())
        .then(function () { return loadStrings(needS, false); })
        .then(function (sst) {
          prog('Summarising ' + rows.length.toLocaleString('en-US') + ' rows…', 95);
          agg.header(RAW_NEED);
          for (var i = 0; i < rows.length; i++) {
            var r = rows[i], m = masks[i];
            if (m) for (var k = 0; k < r.length; k++) if (m & (1 << k)) r[k] = sst[r[k]];
            agg.row(r); rows[i] = null;
          }
          return { rows: agg.n, layout: hasRaw ? 'raw' : 'v2' };
        });
    });
    function loadStrings(want, early) {   // shared strings, only the wanted indices
      var out = {}, left = Object.keys(want).length;
      if (!sstPath || !left) return Promise.resolve(out);
      var buf = '', idx = 0;
      return streamEntry(zip.file(sstPath), function (text, done) {
        buf += text;
        var end = done ? buf.length : buf.lastIndexOf('</si>');
        if (end < 0) return true;
        if (!done) end += 5;
        var seg = buf.slice(0, end), re = /<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g, m; buf = buf.slice(end);
        while ((m = re.exec(seg))) { if (want[idx]) { out[idx] = siText(m[1] || ''); left--; } idx++; }
        return !(early && left <= 0);
      }, early ? null : function (p) { prog('Reading names and labels… ' + Math.round(p) + '%', 80 + p * 0.15); }).then(function () { return out; });
    }
  };
  // What a large .xlsx holds, without opening it whole: 'raw' (RAW sheet, or the V2 header on the first sheet) or null.
  DRB.xlsxKind = function (data) {
    var JSZip = root.JSZip, zip;
    return JSZip.loadAsync(data).then(function (z) {
      zip = z;
      return Promise.all([z.file('xl/workbook.xml').async('string'), z.file('xl/_rels/workbook.xml.rels').async('string')]);
    }).then(function (x) {
      if (/<sheet\b[^>]*?name="\s*RAW\s*"/i.test(x[0])) return 'raw';
      var first = /<sheet\b[^>]*?r:id="([^"]*)"/.exec(x[0]), rels = {}, sstPath = null, m, rr = /<Relationship\b([^>]*)\/?>/g;
      while ((m = rr.exec(x[1]))) {
        var id = /Id="([^"]*)"/.exec(m[1]), tg = /Target="([^"]*)"/.exec(m[1]), ty = /Type="([^"]*)"/.exec(m[1]);
        if (!id || !tg) continue;
        var path = tg[1].charAt(0) === '/' ? tg[1].slice(1) : 'xl/' + tg[1].replace(/^\.\//, '');
        rels[id[1]] = path; if (ty && /sharedStrings$/.test(ty[1])) sstPath = path;
      }
      if (!first || !zip.file(rels[first[1]])) return null;
      var top = [], want = {};
      return streamEntry(zip.file(rels[first[1]]), (function () {
        var scan = sheetScanner(function (rn, cells) { if (top.length < 40) { top.push(cells); cells.forEach(function (c) { if (c && c.s >= 0) want[c.s] = 1; }); } });
        return function (t, done) { scan(t, done); return top.length < 40; };
      })()).then(function () {
        if (!sstPath || !zip.file(sstPath)) return {};
        var out = {}, left = Object.keys(want).length, buf = '', idx = 0;
        if (!left) return out;
        return streamEntry(zip.file(sstPath), function (text, done) {
          buf += text; var end = done ? buf.length : buf.lastIndexOf('</si>'); if (end < 0) return true; if (!done) end += 5;
          var seg = buf.slice(0, end), re = /<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g, mm; buf = buf.slice(end);
          while ((mm = re.exec(seg))) { if (want[idx]) { out[idx] = siText(mm[1] || ''); left--; } idx++; }
          return left > 0;
        }).then(function () { return out; });
      }).then(function (sst) {
        var hit = top.some(function (cells) {
          return headerKind(Array.from(cells, function (c) { if (!c) return ''; var y = c.s >= 0 ? sst[c.s] : c.v; return y === null || y === undefined ? '' : String(y).trim(); })) === 'raw';
        });
        return hit ? 'raw' : null;
      });
    });
  };
  // CSV (the RAW sheet saved as CSV): streamed; quotes handled; same columns.
  DRB.readRawCsv = function (blob, agg, onProgress) {
    var prog = onProgress || function () {}, total = blob.size || 1, seen = 0, header = null, cols = null, pre = 0;
    var field = '', row = [], inQ = false, quoteSeen = false, pendingQuote = false, bom = true;
    function endRow() {
      row.push(field); field = '';
      if (row.length === 1 && row[0] === '' && !quoteSeen) { row = []; return; }
      if (!header) {   // header = first row with TRANSACTION_MONTH (within the first 40)
        cols = rawCols(row);
        if (cols) { header = row; agg.header(RAW_NEED); }
        else if (++pre >= 40) stop('No header row with TRANSACTION_MONTH was found in the CSV. Is it the DRB Usage export?');
      } else {
        var r = cols.map(function (c) { return c < row.length ? row[c] : null; });
        agg.row(r);
      }
      row = []; quoteSeen = false;
    }
    function feed(text) {
      if (bom) { if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); bom = false; }
      for (var i = 0; i < text.length; i++) {
        var ch = text[i];
        if (pendingQuote) { pendingQuote = false; if (ch === '"') { field += '"'; continue; } inQ = false; }
        if (inQ) { if (ch === '"') pendingQuote = true; else field += ch; continue; }
        if (ch === '"') { inQ = true; quoteSeen = true; continue; }
        if (ch === ',') { row.push(field); field = ''; continue; }
        if (ch === '\n') { endRow(); continue; }
        if (ch === '\r') continue;
        field += ch;
      }
    }
    var reader = blob.stream().getReader(), dec = new TextDecoder('utf-8');
    prog('Reading the CSV…', 0);
    function pump() {
      return reader.read().then(function (x) {
        if (x.done) { feed(dec.decode()); if (pendingQuote) { pendingQuote = false; inQ = false; } if (field !== '' || row.length) endRow(); if (!header) stop('No header row with TRANSACTION_MONTH was found in the CSV. Is it the DRB Usage export?'); return { rows: agg.n }; }
        seen += x.value.length; feed(dec.decode(x.value, { stream: true }));
        prog('Reading the CSV… ' + Math.round(seen / total * 100) + '%', seen / total * 95);
        return pump();
      });
    }
    return pump();
  };
  // Unpacks a gzip file that arrived with a .zip or .xls name (the idle report sometimes does).
  DRB.maybeGunzip = function (blob) {
    return blob.slice(0, 2).arrayBuffer().then(function (b) {
      var u = new Uint8Array(b);
      if (u[0] !== 0x1f || u[1] !== 0x8b) return blob;
      if (typeof DecompressionStream === 'undefined') stop('This file is gzip-compressed and this browser cannot unpack it. Unpack it first (e.g. with 7-Zip).');
      return new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).blob();
    });
  };

  /* ---------- .xlsb (Excel binary workbook): records read straight from the zip, one sheet at a time ---------- */
  function biffRecords(u8, cb) {   // cb(type, start, len) for every record
    var p = 0, n = u8.length;
    while (p < n) {
      var t = u8[p++]; if (t & 0x80) t = (t & 0x7F) | ((u8[p++] & 0x7F) << 7);
      var len = 0, sh = 0, b;
      for (var k = 0; k < 4; k++) { b = u8[p++]; len |= (b & 0x7F) << sh; sh += 7; if (!(b & 0x80)) break; }
      if (cb(t, p, len) === false) return;
      p += len;
    }
  }
  var U16 = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-16le') : null;
  function wideStr(u8, dv, p) {   // XLWideString -> [text, nextPos]
    var cch = dv.getUint32(p, true); p += 4;
    if (cch === 0xFFFFFFFF) return [null, p];
    return [U16.decode(u8.subarray(p, p + cch * 2)), p + cch * 2];
  }
  function rk(v) {
    var x = v & 2 ? (v >> 2) : (function () { var b = new DataView(new ArrayBuffer(8)); b.setInt32(4, v & 0xFFFFFFFC, true); b.setInt32(0, 0, true); return b.getFloat64(0, true); })();
    return v & 1 ? x / 100 : x;
  }
  // onRow(sheetIndex, rowIndex, cells[]) for every row of every sheet (or only the sheets onSheets(names) returns).
  DRB.xlsbRows = function (data, onSheets, onRow, onProgress) {
    var JSZip = root.JSZip, zip, prog = onProgress || function () {}, sst = [], halt = false;   // onRow may return false to stop
    return JSZip.loadAsync(data).then(function (z) {
      zip = z;
      if (!z.file('xl/workbook.bin')) stop('This is not an Excel binary (.xlsb) workbook.');
      return Promise.all([z.file('xl/workbook.bin').async('uint8array'), z.file('xl/_rels/workbook.bin.rels').async('string')]);
    }).then(function (x) {
      var wbb = x[0], dv = new DataView(wbb.buffer, wbb.byteOffset, wbb.byteLength), sheets = [], rels = {}, sstPath = null, m;
      biffRecords(wbb, function (t, p, len) {
        if (t === 0x9C) { var a = wideStr(wbb, dv, p + 8), b = wideStr(wbb, dv, a[1]); sheets.push({ id: a[0], name: b[0] }); }
      });
      var rr = /<Relationship\b([^>]*)\/?>/g;
      while ((m = rr.exec(x[1]))) {
        var id = /Id="([^"]*)"/.exec(m[1]), tg = /Target="([^"]*)"/.exec(m[1]), ty = /Type="([^"]*)"/.exec(m[1]);
        if (!id || !tg) continue;
        var path = tg[1].charAt(0) === '/' ? tg[1].slice(1) : 'xl/' + tg[1].replace(/^\.\//, '');
        rels[id[1]] = path; if (ty && /sharedStrings$/.test(ty[1])) sstPath = path;
      }
      var use = onSheets ? onSheets(sheets.map(function (s) { return s.name; })) : sheets.map(function (s, i) { return i; });
      var job = sstPath && zip.file(sstPath) ? zip.file(sstPath).async('uint8array').then(function (u) {
        var d = new DataView(u.buffer, u.byteOffset, u.byteLength);
        biffRecords(u, function (t, p) { if (t === 0x13) sst.push(wideStr(u, d, p + 1)[0]); });
      }) : Promise.resolve();
      return use.reduce(function (pr, si, k) {
        return pr.then(function () {
          if (halt) return;
          prog('Reading sheet ' + (k + 1) + ' of ' + use.length + '…', 5 + 85 * k / use.length);
          var f = zip.file(rels[sheets[si].id]); if (!f) return;
          return f.async('uint8array').then(function (u) {
            var d = new DataView(u.buffer, u.byteOffset, u.byteLength), row = -1, cells = null, col = -1;
            var flush = function () { if (cells && onRow(k, row, cells) === false) halt = true; };
            biffRecords(u, function (t, p) {
              if (t === 0) { flush(); if (halt) return false; row = d.getUint32(p, true); cells = []; col = -1; return; }
              if (t >= 1 && t <= 11) {
                col = d.getUint32(p, true); var q = p + 8;
                if (t === 2) cells[col] = rk(d.getInt32(q, true)); else if (t === 3) cells[col] = null; else if (t === 4) cells[col] = u[q] === 1;
                else if (t === 5) cells[col] = d.getFloat64(q, true); else if (t === 6) cells[col] = wideStr(u, d, q)[0]; else if (t === 7) cells[col] = sst[d.getUint32(q, true)];
                else if (t === 8) cells[col] = wideStr(u, d, q)[0]; else if (t === 9) cells[col] = d.getFloat64(q, true); else if (t === 10) cells[col] = u[q] === 1; else if (t === 11) cells[col] = null;
                return;
              }
              if (t >= 12 && t <= 18) {
                col++; var q2 = p + 4;
                if (t === 13) cells[col] = rk(d.getInt32(q2, true)); else if (t === 15) cells[col] = u[q2] === 1; else if (t === 16) cells[col] = d.getFloat64(q2, true);
                else if (t === 17) cells[col] = wideStr(u, d, q2)[0]; else if (t === 18) cells[col] = sst[d.getUint32(q2, true)]; else cells[col] = null;
              }
            });
            if (!halt) flush();
          });
        });
      }, job);
    });
  };
  // What an .xlsb holds, from its first 40 rows: 'raw' (DRB Usage / RIB Usage Report V2 layout), 'rib' (Regular Extraction of RIB Usage Report) or null.
  DRB.xlsbKind = function (data) {
    var kind = null, synthetic = false, n = 0;
    return DRB.xlsbRows(data, function () { return [0]; }, function (si, ri, cells) {
      var v = Array.from(cells, function (c) { return c === null || c === undefined ? '' : String(c).trim(); });
      if (v.some(function (x) { return /synthetic test data/i.test(x); })) synthetic = true;
      if (v.indexOf('TRANSACTION_MONTH') >= 0 || v.indexOf('TRANSACTION_TYPE') >= 0) { kind = headerKind(v); return false; }
      return ++n < 40;
    }).then(function () { return { kind: kind, synthetic: synthetic }; });
  };
  // The export as .xlsb (e.g. "RIB Usage Report V2"): header row found on the first sheet; later sheets carry on without one.
  DRB.readRawXlsb = function (data, agg, onProgress) {
    var cols = null, layout = 'v2';
    return DRB.xlsbRows(data, function (names) {
      var raw = names.map(function (n, i) { return n.trim().toUpperCase() === 'RAW' ? i : -1; }).filter(function (i) { return i >= 0; });
      if (raw.length) layout = 'raw';
      return raw.length ? raw : names.map(function (n, i) { return i; });
    }, function (si, ri, cells) {
      if (!cols) {
        cols = rawCols(cells);
        if (cols) agg.header(RAW_NEED);
        return;
      }
      agg.row(cols.map(function (c) { var v = cells[c]; return v === undefined ? null : v; }));
    }, onProgress).then(function () {
      if (!cols) stop('No header row with TRANSACTION_MONTH was found in this workbook. Is it the DRB Usage export?');
      return { rows: agg.n, layout: layout };
    });
  };

  /* ---------- CIF Profile from Ms. Hong: pictures (OCR words), email text or an Excel sheet ---------- */
  // Her email carries three pasted pictures: the totals line (TOTAL CIF / TOTAL ENROLLED / % / CIF W/ USAGE / %), the enrolled CIFs by
  // generation (ACTIVE / IDLE / Grand Total) and by staff tag (NO / YES / Blank). Each picture is read in several passes; a figure is
  // taken when the passes agree and the table's own totals add up (Active + Idle = Grand Total, rows add up to the Grand Total row,
  // generation total = staff total, % enrolled and % with usage match). Anything else is left flagged for the user.
  DRB.CIF_PASSES = [{ scale: 3, thr: 170, psm: 3 }, { scale: 4, thr: 0, psm: 11, wl: '0123456789,%' }, { scale: 4, thr: 200, psm: 11, wl: '0123456789,%' }];
  var CIF_GEN = [['Gen Alpha', /alpha/i], ['Gen Z', /gen\s*z\b|\bz\s*\(/i], ['Millennials', /millen/i], ['Gen X', /gen\s*x\b|\bx\s*\(/i], ['Baby Boomers', /boomer/i],
    ['Silent Gen', /silent/i], ['Greatest Gen', /greatest/i]];
  var CIF_STAFF = [['Non-staff', 'N', /^no$/i], ['Staff', 'Y', /^yes$/i], ['Blank', '', /^blank$/i]];
  function numTok(words) {   // number-looking words, with "23," + "147" joined back
    var w = words.map(function (x) { return Object.assign({}, x, { t: x.text.replace(/[^\d,%]/g, ''), yc: (x.y0 + x.y1) / 2, h: x.y1 - x.y0 }); })
      .filter(function (x) { return /\d/.test(x.t); }).sort(function (a, b) { return Math.abs(a.yc - b.yc) < a.h / 2 ? a.x0 - b.x0 : a.yc - b.yc; });
    var out = [];
    w.forEach(function (x) {
      var p = out[out.length - 1];
      if (p && /^\d{1,3},$/.test(p.t) && /^\d{3}(,\d{3})*%?$/.test(x.t) && Math.abs(p.yc - x.yc) < p.h / 2 && x.x0 - p.x1 < 2 * p.h) { p.t += x.t; p.x1 = x.x1; return; }
      out.push(x);
    });
    return out.filter(function (x) { return /^(\d{1,3}(,\d{3})+|\d+)%?$/.test(x.t); })
      .map(function (x) { return { v: +x.t.replace(/[,%]/g, ''), pct: /%$/.test(x.t), x0: x.x0, x1: x.x1, yc: x.yc, h: x.h }; });
  }
  function rowsOf(words) {   // words grouped into lines by height on the picture
    var w = words.map(function (x) { return Object.assign({}, x, { yc: (x.y0 + x.y1) / 2, h: x.y1 - x.y0 }); }).sort(function (a, b) { return a.yc - b.yc; }), rows = [];
    w.forEach(function (x) {
      var r = rows[rows.length - 1];
      if (r && Math.abs(r.yc - x.yc) < Math.max(r.h, x.h) * 0.6) { r.w.push(x); r.y0 = Math.min(r.y0, x.y0); r.y1 = Math.max(r.y1, x.y1); return; }
      rows.push({ w: [x], yc: x.yc, h: x.h, y0: x.y0, y1: x.y1 });
    });
    rows.forEach(function (r) { r.w.sort(function (a, b) { return a.x0 - b.x0; }); r.text = r.w.map(function (x) { return x.text; }).join(' '); });
    return rows;
  }
  function inRow(r, t) { var pad = (r.y1 - r.y0) * 0.35; return t.yc >= r.y0 - pad && t.yc <= r.y1 + pad; }
  function tally(list) { var c = {}; list.forEach(function (v) { c[v] = (c[v] || 0) + 1; }); return c; }
  // candidates per cell -> the choice for a row of [a, i, total] with a + i = total, most votes first
  function pickRow(cands) {
    var opts = cands.map(function (l) { var c = tally(l); var k = Object.keys(c).map(Number); return k.length ? k.map(function (v) { return { v: v, n: c[v] }; }) : [{ v: 0, n: 0, blank: true }]; });
    var best = null;
    opts[0].forEach(function (a) { opts[1].forEach(function (b) { opts[2].forEach(function (t) {
      var ok = a.v + b.v === t.v, sc = (ok ? 100 : 0) + a.n + b.n + t.n;
      if (!best || sc > best.sc) best = { sc: sc, ok: ok, v: [a.v, b.v, t.v], blank: [!!a.blank, !!b.blank, !!t.blank] };
    }); }); });
    return best;
  }
  function tableOf(pic, labels) {   // a 3-number table (ACTIVE / IDLE / Grand Total) -> { rows: {key: pick}, total: pick }
    var rows = rowsOf(pic.passes[0]), hdr = rows.filter(function (r) { return /active/i.test(r.text) && /idle/i.test(r.text) && /total/i.test(r.text) && !/=/.test(r.text); })[0];   // not the ACTIVE = … / IDLE = … legend
    if (!hdr) return null;
    var hw = hdr.w, aw = hw.filter(function (x) { return /active/i.test(x.text); })[0], iw = hw.filter(function (x) { return /idle/i.test(x.text); })[0];
    var tw = hw.filter(function (x) { return /total/i.test(x.text) && x.x0 > iw.x1; }).pop();
    if (!aw || !iw || !tw) return null;
    var anch = [aw.x1, iw.x1, tw.x1], gap = Math.min(anch[1] - anch[0], anch[2] - anch[1]) * 0.45;
    var nums = pic.passes.map(function (ws) { return numTok(ws); });
    function cellsOf(r) {
      var c = [[], [], []];
      nums.forEach(function (ns) { ns.forEach(function (t) {
        if (t.pct || !inRow(r, t) || t.yc <= hdr.y1) return;
        var d = anch.map(function (a) { return Math.abs(t.x1 - a); }), k = d.indexOf(Math.min.apply(null, d));
        if (d[k] <= gap) c[k].push(t.v);
      }); });
      return c;
    }
    var out = { rows: {}, total: null, bands: {} };
    rows.forEach(function (r) {
      if (r.yc <= hdr.y1) return;
      if (/grand/i.test(r.text)) { out.total = pickRow(cellsOf(r)); return; }
      labels.forEach(function (l) {
        var hit = l[1] instanceof RegExp && l[1].test(r.text) || r.w.some(function (x) { return l[2] && l[2].test(x.text); });
        if (!hit || out.rows[l[0]]) return;
        out.rows[l[0]] = pickRow(cellsOf(r));
        var y = /(\d{4})\s*[-–—]\s*(\d{4})/.exec(r.text), a = /\(\s*(\d{1,3})\s*[-–—]\s*(\d{1,3}|above)\s*\)/i.exec(r.text);
        out.bands[l[0]] = { born: y ? 'Born ' + y[1] + '–' + y[2] : null, from: a ? +a[1] : null, to: a && /^\d+$/.test(a[2]) ? +a[2] : null };
      });
    });
    return out;
  }
  function totalsOf(pic) {   // the TOTAL line under TOTAL CIF / TOTAL ENROLLED / % ENROLLED / CIF W/ USAGE / % CIF W/ USAGE
    var rows = rowsOf(pic.passes[0]);
    var hdr = rows.filter(function (r) { return /enrolled/i.test(r.text); }).pop();
    if (!hdr) return null;
    var line = rows.filter(function (r) { return r.yc > hdr.y1 && /^total\b/i.test(r.text); }).pop();
    var cand = [[], [], []], pc = [[], []];
    pic.passes.forEach(function (ws) {
      var ns = numTok(ws).filter(function (t) { return t.yc > hdr.y1 && (line ? inRow(line, t) : true); });
      if (!line && ns.length) { var yl = Math.max.apply(null, ns.map(function (t) { return t.yc; })); ns = ns.filter(function (t) { return Math.abs(t.yc - yl) < t.h; }); }
      var n = ns.filter(function (t) { return !t.pct; }), p = ns.filter(function (t) { return t.pct; });
      if (n.length === 3) n.forEach(function (t, k) { cand[k].push(t.v); });
      if (p.length === 2) p.forEach(function (t, k) { pc[k].push(t.v); });
    });
    var o = cand.map(function (l) { var c = tally(l); return Object.keys(c).map(Number).map(function (v) { return { v: v, n: c[v] }; }); });
    var q = pc.map(function (l) { var c = tally(l); var k = Object.keys(c).sort(function (a, b) { return c[b] - c[a]; }); return k.length ? +k[0] : null; });
    var best = null;
    (o[0].length ? o[0] : [{ v: null, n: 0 }]).forEach(function (a) { (o[1].length ? o[1] : [{ v: null, n: 0 }]).forEach(function (b) { (o[2].length ? o[2] : [{ v: null, n: 0 }]).forEach(function (c) {
      var ok1 = a.v && b.v != null && q[0] != null ? Math.round(100 * b.v / a.v) === q[0] : null, ok2 = b.v && c.v != null && q[1] != null ? Math.round(100 * c.v / b.v) === q[1] : null;
      var sc = (ok1 ? 100 : 0) + (ok2 ? 100 : 0) + a.n + b.n + c.n;
      if (!best || sc > best.sc) best = { sc: sc, v: [a.v, b.v, c.v], ok: [ok1, ok2], n: [a.n, b.n, c.n] };
    }); }); });
    return { v: best.v, ok: best.ok, n: best.n, pct: q };
  }
  // images: [{ name, passes: [words of pass 1, pass 2, …] }] in DRB.CIF_PASSES order -> what was read, with checks and flags
  DRB.readCifPictures = function (images, year) {
    var res = { cif: {}, generations: null, staff: null, checks: [], flags: [], found: [] }, gen = null, stf = null, tot = null;
    images.forEach(function (pic) {
      var all = pic.passes[0].map(function (w) { return w.text; }).join(' ');
      if (!tot && /enrolled/i.test(all) && /usage/i.test(all) && !/active/i.test(all)) { tot = totalsOf(pic); if (tot) res.found.push(pic.name + ': totals'); }
      else if (!gen && /generation|millen|boomer|alpha/i.test(all)) { gen = tableOf(pic, CIF_GEN); if (gen) res.found.push(pic.name + ': by generation'); }
      else if (!stf && /staff|tagging/i.test(all)) { stf = tableOf(pic, CIF_STAFF.map(function (s) { return [s[0], null, s[2]]; })); if (stf) res.found.push(pic.name + ': by staff tag'); }
    });
    function chk(label, ok) { res.checks.push({ label: label, ok: ok }); if (!ok) res.flags.push(label); }
    if (tot) {
      res.cif = { total_cif: tot.v[0], enrolled: tot.v[1], cif_usage: tot.v[2] };
      if (tot.ok[0] !== null) chk('% enrolled on the picture (' + tot.pct[0] + '%) = total enrolled ÷ total CIFs', tot.ok[0]);
      if (tot.ok[1] !== null) chk('% with usage on the picture (' + tot.pct[1] + '%) = CIF w/ usage ÷ total enrolled', tot.ok[1]);
      ['total_cif', 'enrolled', 'cif_usage'].forEach(function (k, i) { if (tot.v[i] == null) res.flags.push('Not read: ' + { total_cif: 'Total CIFs', enrolled: 'Total enrolled CIFs', cif_usage: 'CIF w/ usage' }[k]); });
    } else res.flags.push('The totals picture (TOTAL CIF / TOTAL ENROLLED / CIF W/ USAGE) was not found.');
    function table(t, names, what) {
      if (!t) { res.flags.push('The ' + what + ' picture was not found.'); return null; }
      var sa = 0, si = 0;
      names.forEach(function (n) {
        var r = t.rows[n];
        if (!r) { res.flags.push(what + ': row "' + n + '" not read.'); return; }
        if (!r.ok) res.flags.push(what + ': ' + n + ' – Active + Idle does not equal its Grand Total.');
        sa += r.v[0]; si += r.v[1];
      });
      if (t.total) chk(what + ': rows add up to the Grand Total row', sa === t.total.v[0] && si === t.total.v[1] && t.total.ok);
      return { a: sa, i: si };
    }
    {
      var g = table(gen, CIF_GEN.map(function (x) { return x[0]; }), 'By generation');
      if (gen) {
        var def = DRB.defaultGenerations(year || 2026);
        res.generations = def.map(function (d) {
          var r = gen.rows[d[0]], b = gen.bands[d[0]] || {};
          return [d[0], b.born || d[1], b.from != null ? b.from : d[2], b.to != null ? b.to : d[3], r ? r.v[0] : null, r ? r.v[1] : null];
        });
      }
      var s = table(stf, CIF_STAFF.map(function (x) { return x[0]; }), 'By staff tag');
      if (stf) res.staff = CIF_STAFF.map(function (x) { var r = stf.rows[x[0]]; return [x[0], x[1], r ? r.v[0] : null, r ? r.v[1] : null]; });
      if (g && s) chk('Generation table total = staff table total (active and idle)', g.a === s.a && g.i === s.i);
    }
    return res;
  };
  // The same figures typed as text (email body, chat) or in an Excel sheet (rows joined with tabs).
  DRB.readCifText = function (text, year) {
    var t = String(text || ''), res = { cif: {}, generations: null, staff: null, checks: [], flags: [], found: [] };
    function num(re) { var m = re.exec(t); return m ? +m[1].replace(/,/g, '') : null; }
    res.cif = { total_cif: num(/total\s*cifs?\b[^\d\n]{0,40}([\d,]{1,12})/i), enrolled: num(/total\s*enrol+ed[^\d\n]{0,40}([\d,]{1,12})/i), cif_usage: num(/cifs?\s*w(?:ith|\/)\s*usage[^\d\n]{0,40}([\d,]{1,12})/i) };
    var lines = t.split(/\r?\n/);
    function three(re) {
      var l = lines.filter(function (x) { return re.test(x); })[0]; if (!l) return null;
      var n = (l.replace(/born\s*\d{4}\s*[-–—]\s*\d{4}/i, '').replace(/\(\s*\d+\s*[-–—]\s*(\d+|above)\s*\)/i, '').match(/\d[\d,]*/g) || []).map(function (x) { return +x.replace(/,/g, ''); });
      return n.length >= 2 ? n : null;
    }
    var def = DRB.defaultGenerations(year || 2026), gotG = 0;
    var gens = def.map(function (d, i) { var n = three(CIF_GEN[i][1]); if (n) gotG++; return [d[0], d[1], d[2], d[3], n ? (n.length === 3 ? n[0] : n[0]) : null, n ? n[1] : null]; });
    if (gotG) res.generations = gens;
    var gotS = 0, staff = CIF_STAFF.map(function (s) { var n = three(new RegExp('^\\s*(' + s[2].source.replace(/[\^$]/g, '') + ')\\b', 'i')); if (n) gotS++; return [s[0], s[1], n ? n[0] : null, n ? n[1] : null]; });
    if (gotS) res.staff = staff;
    if (res.cif.total_cif == null && !gotG && !gotS) res.flags.push('No CIF Profile figures were found in the text.');
    return res;
  };

  /* ---------- quarter helpers ---------- */
  var QMONTHS = [['JANUARY', 'FEBRUARY', 'MARCH'], ['APRIL', 'MAY', 'JUNE'], ['JULY', 'AUGUST', 'SEPTEMBER'], ['OCTOBER', 'NOVEMBER', 'DECEMBER']];
  var QEND = ['31 March', '30 June', '30 September', '31 December'];
  DRB.quarterInfo = function (y, q) {   // q = 1..4
    var pq = q === 1 ? 4 : q - 1, py = q === 1 ? y - 1 : y, cap = function (m) { return m.charAt(0) + m.slice(1).toLowerCase(); };
    return { quarter: 'Q' + q + ' ' + y, period: cap(QMONTHS[q - 1][0]) + ' – ' + cap(QMONTHS[q - 1][2]) + ' ' + y, months: QMONTHS[q - 1].slice(),
      prior_quarter: 'Q' + pq + ' ' + py, prior_months: QMONTHS[pq - 1].slice(), as_of: QEND[q - 1] + ' ' + y, folder: y + '-Q' + q, priorFolder: py + '-Q' + pq };
  };
  // the Method sheet's open item for rows left out, worded as the skill's prep_raw.py: "120 rows … (OCTOBER: 120) and are excluded."
  DRB.outsideNote = function (dropped, quarter) {
    var k = Object.keys(dropped || {}).sort(), n = k.reduce(function (t, m) { return t + dropped[m]; }, 0), f = function (v) { return v.toLocaleString('en-US'); };
    return n ? f(n) + ' rows in the transaction export are dated outside ' + quarter + ' (' + k.map(function (m) { return m + ': ' + f(dropped[m]); }).join(', ') + ') and are excluded.' : null;
  };
  DRB.V2_DISPLAY = 'RIB Usage Report V2 (shared folder RIBUsageMailerRecipients$), DRB Usage layout';   // raw source name when the export is the V2 report
  DRB.DEFAULT_DISPLAY = {
    raw: 'DRB Usage (Ms. Maria Hong, Retail Banking Group)', rib: 'Regular Extraction of RIB Usage Report (shared folder RIBUsageMailerRecipients$)', cif: 'CIF Profile (Ms. Maria Hong)',
    itcom_dcb: 'ITCom DCB Reports (Sir Jun Salvador)', drb_summary: 'DRB Reports (Sir Jun Salvador)', idle: 'RIB Idle Accounts Report (ATUS automailer)', dcb_stats: 'DRB DCB Stats (optional cross-check)'
  };
  // Generations: the age bands as of 2026; move every band up by one each January (as the skill says).
  DRB.defaultGenerations = function (year) {
    var d = year - 2026;
    return [['Gen Alpha', 'Born 2010–2024', 2, 16], ['Gen Z', 'Born 1997–2009', 17, 29], ['Millennials', 'Born 1981–1996', 30, 45], ['Gen X', 'Born 1965–1980', 46, 61],
      ['Baby Boomers', 'Born 1946–1964', 62, 80], ['Silent Gen', 'Born 1928–1945', 81, 98], ['Greatest Gen', 'Born 1901–1927', 99, 150]]
      .map(function (g, i) { return [g[0], g[1], g[2] + d, i === 6 ? g[3] : g[3] + d, null, null]; });
  };
  DRB.STAFF = [['Non-staff', 'N'], ['Staff', 'Y'], ['Blank', '']];
  DRB.QRG = QRG; DRB.ORDER = ORDER; DRB.FTOB = FTOB; DRB.BP = BP;
  DRB.fileName = function (quarter) { return 'DRB Usage ' + quarter + ' - Worked Figures'; };
})(typeof window !== 'undefined' ? window : globalThis);
