/* core/xlsx-calc.js — small Excel formula evaluator (offline, no dependencies).
   Used to store cached values in workbooks the portal writes (so a file opened in Protected View
   already shows its numbers) and to show the same figures on screen.
   Covers the functions the portal's workbooks use: SUM, AVERAGE, COUNTA, COUNTIF, COUNTIFS, SUMIFS,
   IF, IFERROR, AND, OR, INDEX, MATCH (exact), LARGE, ABS, ISNUMBER, NA, ROW, TEXT; operators
   + - * / ^ & = <> < > <= >=, unary minus, sheet references and defined names.
   Semantics follow Excel: blanks are 0 / "", text compares case-insensitively, criteria accept
   ">0", ">="&x, wildcards * ? and ~. Pure: works on a plain workbook model, no DOM. */
(function (root) {
  'use strict';

  function Err(code) { this.err = code; }
  Err.prototype.toString = function () { return this.err; };
  var NA = new Err('#N/A'), DIV0 = new Err('#DIV/0!'), VALUE = new Err('#VALUE!'), REF = new Err('#REF!'), NAME = new Err('#NAME?'), NUM = new Err('#NUM!');
  function isErr(v) { return v instanceof Err; }

  /* ---------- A1 helpers ---------- */
  function colNum(s) { var n = 0; for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64); return n; }
  function colName(n) { var s = ''; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
  function parseA1(ref) { var m = /^\$?([A-Z]{1,3})\$?(\d+)$/.exec(ref); return m ? { c: colNum(m[1]), r: +m[2] } : null; }

  /* ---------- tokenizer ---------- */
  var OPS = ['<>', '<=', '>=', '+', '-', '*', '/', '^', '&', '=', '<', '>', '(', ')', ',', ':', '%'];
  function tokenize(src) {
    var t = [], i = 0, s = src;
    while (i < s.length) {
      var ch = s[i];
      if (ch === ' ' || ch === '\n' || ch === '\t') { i++; continue; }
      if (ch === '"') {
        var j = i + 1, str = '';
        for (;;) {
          if (j >= s.length) throw new Error('Unclosed string in formula: ' + src);
          if (s[j] === '"') { if (s[j + 1] === '"') { str += '"'; j += 2; continue; } break; }
          str += s[j++];
        }
        t.push({ k: 'str', v: str }); i = j + 1; continue;
      }
      var m;
      if ((m = /^(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)/.exec(s.slice(i)))) { t.push({ k: 'num', v: parseFloat(m[1]) }); i += m[1].length; continue; }
      // quoted sheet name: 'My Sheet'!A1
      if (ch === "'") {
        var e = s.indexOf("'!", i + 1); if (e < 0) throw new Error('Bad sheet reference: ' + src);
        var sheet = s.slice(i + 1, e).replace(/''/g, "'"); i = e + 2;
        m = /^(\$?[A-Z]{1,3}\$?\d+)(?::(\$?[A-Z]{1,3}\$?\d+))?/.exec(s.slice(i));
        if (!m) throw new Error('Bad reference after sheet: ' + src);
        t.push({ k: 'ref', sheet: sheet, a: m[1], b: m[2] || null }); i += m[0].length; continue;
      }
      if ((m = /^([A-Za-z_\\][A-Za-z0-9_.]*)!(\$?[A-Z]{1,3}\$?\d+)(?::(\$?[A-Z]{1,3}\$?\d+))?/.exec(s.slice(i)))) {
        t.push({ k: 'ref', sheet: m[1], a: m[2], b: m[3] || null }); i += m[0].length; continue;
      }
      if ((m = /^(\$?[A-Z]{1,3}\$?\d+)(?::(\$?[A-Z]{1,3}\$?\d+))?(?![A-Za-z0-9_(])/.exec(s.slice(i)))) {
        t.push({ k: 'ref', sheet: null, a: m[1], b: m[2] || null }); i += m[0].length; continue;
      }
      if ((m = /^([A-Za-z_\\][A-Za-z0-9_.]*)/.exec(s.slice(i)))) {
        var id = m[1]; i += id.length;
        var up = id.toUpperCase();
        if (s[i] === '(') t.push({ k: 'fn', v: up });
        else if (up === 'TRUE' || up === 'FALSE') t.push({ k: 'bool', v: up === 'TRUE' });
        else t.push({ k: 'name', v: id });
        continue;
      }
      var op = null;
      for (var o = 0; o < OPS.length; o++) if (s.substr(i, OPS[o].length) === OPS[o]) { op = OPS[o]; break; }
      if (!op) throw new Error('Unexpected "' + ch + '" in formula: ' + src);
      t.push({ k: 'op', v: op }); i += op.length;
    }
    return t;
  }

  /* ---------- parser (Excel precedence, low to high: comparison, &, + -, * /, ^, unary minus, %) ---------- */
  function parse(src) {
    var t = tokenize(src.charAt(0) === '=' ? src.slice(1) : src), p = 0;
    function peek() { return t[p]; }
    function isOp(v) { var x = t[p]; return x && x.k === 'op' && x.v === v; }
    function expect(v) { if (!isOp(v)) throw new Error('Expected "' + v + '" in formula: ' + src); p++; }
    function cmp() {
      var a = cat();
      while (t[p] && t[p].k === 'op' && /^(=|<>|<|>|<=|>=)$/.test(t[p].v)) { var o = t[p++].v; a = { k: 'bin', o: o, a: a, b: cat() }; }
      return a;
    }
    function cat() { var a = add(); while (isOp('&')) { p++; a = { k: 'bin', o: '&', a: a, b: add() }; } return a; }
    function add() { var a = mul(); while (isOp('+') || isOp('-')) { var o = t[p++].v; a = { k: 'bin', o: o, a: a, b: mul() }; } return a; }
    function mul() { var a = pow(); while (isOp('*') || isOp('/')) { var o = t[p++].v; a = { k: 'bin', o: o, a: a, b: pow() }; } return a; }
    function pow() { var a = un(); while (isOp('^')) { p++; a = { k: 'bin', o: '^', a: a, b: un() }; } return a; }
    function un() {
      if (isOp('-')) { p++; return { k: 'neg', a: un() }; }
      if (isOp('+')) { p++; return un(); }
      var a = prim();
      while (isOp('%')) { p++; a = { k: 'bin', o: '/', a: a, b: { k: 'lit', v: 100 } }; }
      return a;
    }
    function prim() {
      var x = t[p++];
      if (!x) throw new Error('Formula ends early: ' + src);
      if (x.k === 'num' || x.k === 'str' || x.k === 'bool') return { k: 'lit', v: x.v };
      if (x.k === 'ref') return { k: 'ref', sheet: x.sheet, a: x.a, b: x.b };
      if (x.k === 'name') return { k: 'name', v: x.v };
      if (x.k === 'fn') {
        expect('('); var args = [];
        if (!isOp(')')) { for (;;) { if (isOp(',')) args.push({ k: 'lit', v: null }); else args.push(cmp()); if (isOp(',')) { p++; continue; } break; } }
        expect(')'); return { k: 'fn', v: x.v, args: args };
      }
      if (x.k === 'op' && x.v === '(') { var e = cmp(); expect(')'); return e; }
      throw new Error('Unexpected token in formula: ' + src);
    }
    var ast = cmp();
    if (p !== t.length) throw new Error('Unexpected text at the end of formula: ' + src);
    return ast;
  }

  /* ---------- values ---------- */
  function Range(sheet, r1, c1, r2, c2) { this.sheet = sheet; this.r1 = Math.min(r1, r2); this.c1 = Math.min(c1, c2); this.r2 = Math.max(r1, r2); this.c2 = Math.max(c1, c2); }
  function isBlank(v) { return v === null || v === undefined; }
  function toNum(v) {
    if (isErr(v)) return v;
    if (isBlank(v)) return 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    var s = String(v).trim();
    if (s === '') return VALUE;
    var n = Number(s.replace(/,/g, ''));
    if (!isNaN(n)) return n;
    var pc = /^(-?[\d.]+)%$/.exec(s); if (pc) return parseFloat(pc[1]) / 100;
    return VALUE;
  }
  function general(n) {   // number -> text as Excel's General format would show it in a concatenation
    if (!isFinite(n)) return '#NUM!';
    if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
    var s = Number(n.toPrecision(15)).toString();
    if (/e/.test(s)) { var m = Number(n.toPrecision(6)); s = m.toExponential().replace(/e\+?/, 'E+').replace('E+-', 'E-'); }
    return s;
  }
  function toStr(v) {
    if (isErr(v)) return v;
    if (isBlank(v)) return '';
    if (typeof v === 'number') return general(v);
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    return String(v);
  }
  function typeRank(v) { return typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : 2; }
  function compare(a, b) {   // Excel ordering: numbers < text < booleans; blank equals 0 or ""
    if (isBlank(a)) a = typeof b === 'string' ? '' : (typeof b === 'boolean' ? false : 0);
    if (isBlank(b)) b = typeof a === 'string' ? '' : (typeof a === 'boolean' ? false : 0);
    var ta = typeRank(a), tb = typeRank(b);
    if (ta !== tb) return ta - tb;
    if (ta === 1) { a = a.toLowerCase(); b = b.toLowerCase(); }
    if (ta === 2) { a = a ? 1 : 0; b = b ? 1 : 0; }
    return a < b ? -1 : a > b ? 1 : 0;
  }

  /* ---------- criteria (COUNTIF / SUMIFS) ---------- */
  function wildRe(s) {
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (ch === '~' && i + 1 < s.length && /[*?~]/.test(s[i + 1])) { out += '\\' + s[++i]; continue; }
      out += ch === '*' ? '.*' : ch === '?' ? '.' : ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
    return new RegExp('^' + out + '$', 'i');
  }
  function criterion(c) {
    if (isErr(c)) return function () { return false; };
    if (typeof c === 'number' || typeof c === 'boolean') {
      return function (v) { return typeof v === typeof c ? v === c : (typeof c === 'number' && typeof v === 'string' && v.trim() !== '' && Number(v) === c); };
    }
    if (isBlank(c)) c = '';
    var s = String(c), m = /^(<=|>=|<>|<|>|=)?([\s\S]*)$/.exec(s), op = m[1] || '=', rest = m[2];
    var num = rest.trim() !== '' && !isNaN(Number(rest)) ? Number(rest) : null;
    if (op === '=' || op === '<>') {
      var eq;
      if (rest === '') eq = function (v) { return isBlank(v) || v === ''; };
      else if (num !== null) eq = function (v) { return typeof v === 'number' ? v === num : (typeof v === 'string' && v.trim() !== '' && Number(v) === num); };
      else if (/[*?]/.test(rest)) { var re = wildRe(rest); eq = function (v) { return typeof v === 'string' && re.test(v); }; }
      else { var low = rest.toLowerCase().replace(/~([*?~])/g, '$1'); eq = function (v) { return typeof v === 'string' && v.toLowerCase() === low; }; }
      return op === '=' ? eq : function (v) { return !eq(v); };
    }
    if (num !== null) {
      return function (v) { if (typeof v !== 'number') return false; return op === '<' ? v < num : op === '>' ? v > num : op === '<=' ? v <= num : v >= num; };
    }
    var lr = rest.toLowerCase();
    return function (v) { if (typeof v !== 'string') return false; var x = v.toLowerCase(); return op === '<' ? x < lr : op === '>' ? x > lr : op === '<=' ? x <= lr : x >= lr; };
  }

  /* ---------- number formats for TEXT() ---------- */
  function roundHalfAway(x, d) { var f = Math.pow(10, d); return Math.sign(x) * Math.round(Math.abs(x) * f + 1e-9) / f; }
  function fmtNum(n, fmt) {
    var secs = fmt.split(';'), sec = secs[0];
    if (n < 0 && secs.length > 1) { sec = secs[1]; n = Math.abs(n); }
    else if (n === 0 && secs.length > 2) sec = secs[2];
    var m = /^([^0#,.%]*)([0#,]*)(\.(0+))?(%?)(.*)$/.exec(sec);
    if (!m) return general(n);
    var pre = m[1].replace(/"/g, ''), body = m[2], dec = m[4] ? m[4].length : 0, pct = !!m[5], post = m[6].replace(/"/g, '');
    if (pct) n = n * 100;
    var neg = n < 0 && secs.length === 1; n = Math.abs(n);
    var s = roundHalfAway(n, dec).toFixed(dec), ip = s.split('.')[0], fp = s.split('.')[1];
    if (body.indexOf(',') >= 0) ip = ip.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    if (/^#+,?#*$/.test(body.replace(/,/g, '')) && ip === '0' && body.indexOf('0') < 0) ip = '';
    return (neg ? '-' : '') + pre + ip + (dec ? '.' + fp : '') + (pct ? '%' : '') + post;
  }

  /* ---------- evaluator ---------- */
  // wb: { sheets: {name: sheet}, names: {name: 'Sheet!$A$1:$B$2'} }; sheet.cell(r, c) -> {v, f} or undefined
  function Calc(wb) {
    this.wb = wb; this.memo = {}; this.busy = {}; this.ast = {}; this.names = {}; this.lists = {};
    var self = this;
    Object.keys(wb.names || {}).forEach(function (n) {
      var m = /^'?(.+?)'?!\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/.exec(wb.names[n]);
      if (m) self.names[n.toUpperCase()] = new Range(m[1], +m[3], colNum(m[2]), m[5] ? +m[5] : +m[3], m[4] ? colNum(m[4]) : colNum(m[2]));
    });
  }
  Calc.prototype.cellValue = function (sheet, r, c) {
    var sh = this.wb.sheets[sheet]; if (!sh) return REF;
    var cell = sh.cell(r, c); if (!cell) return null;
    if (cell.f == null) return isBlank(cell.v) ? null : cell.v;
    var key = sheet + '!' + r + ',' + c;
    if (key in this.memo) return this.memo[key];
    if (this.busy[key]) throw new Error('Circular reference at ' + sheet + '!' + colName(c) + r);
    this.busy[key] = 1;
    var v;
    try {
      var ast = this.ast[cell.f] || (this.ast[cell.f] = parse(cell.f));
      v = this.ev(ast, { sheet: sheet, r: r, c: c });
      if (v instanceof Range) v = this.single(v, { sheet: sheet, r: r, c: c });
      if (isBlank(v)) v = 0;   // a formula pointing at a blank shows 0
    } finally { delete this.busy[key]; }
    this.memo[key] = v;
    return v;
  };
  Calc.prototype.single = function (rg, ctx) {   // implicit intersection for a range used as one value
    if (rg.r1 === rg.r2 && rg.c1 === rg.c2) return this.cellValue(rg.sheet, rg.r1, rg.c1);
    if (rg.c1 === rg.c2 && ctx.r >= rg.r1 && ctx.r <= rg.r2 && ctx.sheet === rg.sheet) return this.cellValue(rg.sheet, ctx.r, rg.c1);
    if (rg.r1 === rg.r2 && ctx.c >= rg.c1 && ctx.c <= rg.c2 && ctx.sheet === rg.sheet) return this.cellValue(rg.sheet, rg.r1, ctx.c);
    return VALUE;
  };
  Calc.prototype.val = function (node, ctx) { var v = this.ev(node, ctx); return v instanceof Range ? this.single(v, ctx) : v; };
  Calc.prototype.list = function (rg) {   // values of a range, row by row (cached: ranges repeat a lot)
    var key = rg.sheet + '!' + rg.r1 + ',' + rg.c1 + ':' + rg.r2 + ',' + rg.c2;
    if (this.lists[key]) return this.lists[key];
    var out = this.lists[key] = [];
    for (var r = rg.r1; r <= rg.r2; r++) for (var c = rg.c1; c <= rg.c2; c++) out.push(this.cellValue(rg.sheet, r, c));
    return out;
  };
  Calc.prototype.ev = function (n, ctx) {
    var self = this, a, b;
    switch (n.k) {
      case 'lit': return n.v;
      case 'ref': {
        var A = parseA1(n.a), B = n.b ? parseA1(n.b) : A;
        return new Range(n.sheet || ctx.sheet, A.r, A.c, B.r, B.c);
      }
      case 'name': { var rg = this.names[n.v.toUpperCase()]; return rg || NAME; }
      case 'neg': a = toNum(this.val(n.a, ctx)); return isErr(a) ? a : -a;
      case 'bin': {
        a = this.val(n.a, ctx); b = this.val(n.b, ctx);
        if (n.o === '&') { a = toStr(a); b = toStr(b); if (isErr(a)) return a; if (isErr(b)) return b; return a + b; }
        if (/^(=|<>|<|>|<=|>=)$/.test(n.o)) {
          if (isErr(a)) return a; if (isErr(b)) return b;
          var c = compare(a, b);
          return n.o === '=' ? c === 0 : n.o === '<>' ? c !== 0 : n.o === '<' ? c < 0 : n.o === '>' ? c > 0 : n.o === '<=' ? c <= 0 : c >= 0;
        }
        a = toNum(a); b = toNum(b); if (isErr(a)) return a; if (isErr(b)) return b;
        if (n.o === '+') return a + b;
        if (n.o === '-') return a - b;
        if (n.o === '*') return a * b;
        if (n.o === '/') return b === 0 ? DIV0 : a / b;
        if (n.o === '^') return Math.pow(a, b);
        return VALUE;
      }
      case 'fn': {
        var f = FN[n.v]; if (!f) return NAME;
        return f.call(this, n.args, ctx);
      }
    }
    return VALUE;
  };
  function rng(self, node, ctx) { var v = self.ev(node, ctx); return v instanceof Range ? v : null; }
  function flatNums(self, args, ctx) {   // numbers from ranges (text and blanks ignored) and from direct values (coerced)
    var out = [];
    for (var i = 0; i < args.length; i++) {
      var v = self.ev(args[i], ctx);
      if (v instanceof Range) { var l = self.list(v); for (var j = 0; j < l.length; j++) { if (isErr(l[j])) return l[j]; if (typeof l[j] === 'number') out.push(l[j]); } }
      else { if (isErr(v)) return v; var x = toNum(v); if (isErr(x)) return x; out.push(x); }
    }
    return out;
  }
  function ifs(self, args, ctx, start) {   // matched index lists for (range, criterion) pairs
    var pairs = [];
    for (var i = start; i + 1 < args.length; i += 2) {
      var r = rng(self, args[i], ctx); if (!r) return VALUE;
      pairs.push({ list: self.list(r), test: criterion(self.val(args[i + 1], ctx)) });
    }
    var n = pairs[0].list.length, hit = [];
    for (var k = 0; k < pairs.length; k++) if (pairs[k].list.length !== n) return VALUE;
    for (var j = 0; j < n; j++) { var ok = true; for (k = 0; k < pairs.length && ok; k++) ok = pairs[k].test(pairs[k].list[j]); if (ok) hit.push(j); }
    return hit;
  }
  var FN = {
    SUM: function (args, ctx) { var l = flatNums(this, args, ctx); if (isErr(l)) return l; var s = 0; for (var i = 0; i < l.length; i++) s += l[i]; return s; },
    AVERAGE: function (args, ctx) { var l = flatNums(this, args, ctx); if (isErr(l)) return l; if (!l.length) return DIV0; var s = 0; for (var i = 0; i < l.length; i++) s += l[i]; return s / l.length; },
    COUNTA: function (args, ctx) {
      var c = 0;
      for (var i = 0; i < args.length; i++) { var v = this.ev(args[i], ctx); if (v instanceof Range) this.list(v).forEach(function (x) { if (!isBlank(x)) c++; }); else if (!isBlank(v)) c++; }
      return c;
    },
    COUNTIF: function (args, ctx) { var h = ifs(this, args, ctx, 0); return isErr(h) ? h : h.length; },
    COUNTIFS: function (args, ctx) { var h = ifs(this, args, ctx, 0); return isErr(h) ? h : h.length; },
    SUMIFS: function (args, ctx) {
      var sr = rng(this, args[0], ctx); if (!sr) return VALUE;
      var h = ifs(this, args, ctx, 1); if (isErr(h)) return h;
      var l = this.list(sr), s = 0;
      for (var i = 0; i < h.length; i++) { var v = l[h[i]]; if (typeof v === 'number') s += v; }
      return s;
    },
    IF: function (args, ctx) {
      var c = this.val(args[0], ctx); if (isErr(c)) return c;
      var t = typeof c === 'string' ? (/^true$/i.test(c) ? true : /^false$/i.test(c) ? false : VALUE) : !!toNum(c);
      if (isErr(t)) return t;
      if (t) return args.length > 1 ? this.val(args[1], ctx) : true;
      return args.length > 2 ? this.val(args[2], ctx) : false;
    },
    IFERROR: function (args, ctx) { var v = this.val(args[0], ctx); return isErr(v) ? this.val(args[1], ctx) : v; },
    AND: function (args, ctx) { for (var i = 0; i < args.length; i++) { var v = this.val(args[i], ctx); if (isErr(v)) return v; if (!toNum(v)) return false; } return true; },
    OR: function (args, ctx) { var any = false; for (var i = 0; i < args.length; i++) { var v = this.val(args[i], ctx); if (isErr(v)) return v; if (toNum(v)) any = true; } return any; },
    INDEX: function (args, ctx) {
      var r = rng(this, args[0], ctx); if (!r) return VALUE;
      var i = toNum(this.val(args[1], ctx)); if (isErr(i)) return i;
      var j = args.length > 2 ? toNum(this.val(args[2], ctx)) : 1; if (isErr(j)) return j;
      i = Math.trunc(i); j = Math.trunc(j);
      var rows = r.r2 - r.r1 + 1, cols = r.c2 - r.c1 + 1;
      if (rows === 1 && args.length === 2) { j = i; i = 1; }
      if (i < 1 || j < 1 || i > rows || j > cols) return REF;
      return this.cellValue(r.sheet, r.r1 + i - 1, r.c1 + j - 1);
    },
    MATCH: function (args, ctx) {
      var v = this.val(args[0], ctx); if (isErr(v)) return v;
      var r = rng(this, args[1], ctx); if (!r) return NA;
      var l = this.list(r), test = typeof v === 'string' && /[*?]/.test(v) ? criterion('=' + v) : null;
      for (var i = 0; i < l.length; i++) {
        var x = l[i];
        if (test ? test(x) : (!isBlank(x) && typeRank(x) === typeRank(v) && compare(x, v) === 0)) return i + 1;
      }
      return NA;
    },
    LARGE: function (args, ctx) {
      var r = this.ev(args[0], ctx), k = toNum(this.val(args[1], ctx)); if (isErr(k)) return k;
      var l = r instanceof Range ? this.list(r) : [r], nums = [];
      for (var i = 0; i < l.length; i++) { if (isErr(l[i])) return l[i]; if (typeof l[i] === 'number') nums.push(l[i]); }
      k = Math.ceil(k);
      if (k < 1 || k > nums.length) return NUM;
      nums.sort(function (a, b) { return b - a; });
      return nums[k - 1];
    },
    ABS: function (args, ctx) { var v = toNum(this.val(args[0], ctx)); return isErr(v) ? v : Math.abs(v); },
    ISNUMBER: function (args, ctx) { return typeof this.val(args[0], ctx) === 'number'; },
    NA: function () { return NA; },
    ROW: function (args, ctx) { if (!args.length) return ctx.r; var r = rng(this, args[0], ctx); return r ? r.r1 : VALUE; },
    TEXT: function (args, ctx) {
      var v = this.val(args[0], ctx), f = toStr(this.val(args[1], ctx)); if (isErr(v)) return v; if (isErr(f)) return f;
      var n = typeof v === 'string' ? toNum(v) : toNum(v);
      if (isErr(n)) return typeof v === 'string' ? v : n;
      return fmtNum(n, f);
    }
  };

  root.XlsxCalc = { Calc: Calc, parse: parse, Err: Err, isErr: isErr, colName: colName, colNum: colNum, parseA1: parseA1, fmtNum: fmtNum, criterion: criterion, general: general };
})(typeof window !== 'undefined' ? window : globalThis);
