/* RIB Advisory Generator (module 6)
 * Drafts RIB Inbox advisories from templates, tracks UAT -> approval -> Prod,
 * and keeps a filterable compilation of Prod posts with screenshots.
 * Offline, file:// safe, no network. Pure functions are exposed on window.RIB for testing.
 * Template wording comes from 002_RIB_Inbox_Compilation.pptx and BSP_CPR_v2_Compilation.pptx (2026 posts).
 */
(function () {
  'use strict';

  // ------------------------------------------------------------------ config
  var C = {
    font: { face: 'Trebuchet MS', size: '3' },
    footer: 'For inquiries or concerns, you may contact our 24/7 Customer Service Helplines at +632 8721 6000 or +632 8672 6300 or email customer.service@sterlingbankasia.com.',
    securityLine: 'For more security tips, visit our website’s Financial Literacy and Awareness page.',
    thanks: ['', 'Thank you.', 'Thank you for your understanding.', 'Thank you for your patience and understanding.'],
    channel: 'Sterling Bank Online (Personal and Business)',
    services: [
      { k: 'sbo', label: 'Sterling Bank Online (Personal and Business)', re: /sterling ?bank online|\bsbo\b|online banking|internet banking|mobile banking/i, def: true },
      { k: 'card', label: 'Card transactions (Debit and Prepaid)', re: /card transactions?|debit card|prepaid card/i },
      { k: 'atm', label: 'Sterling Bank ATMs', re: /\batms?\b/i },
      { k: 'pos', label: 'POS transactions', re: /\bpos\b/i },
      { k: 'instapay', label: 'InstaPay', re: /instapay/i, def: true },
      { k: 'pesonet', label: 'PESONet', re: /pesonet/i, def: true },
      { k: 'visaotp', label: 'Visa OTP', re: /visa ?otp|3-?d ?secure/i }
    ],
    sm: {
      title: 'System Maintenance on ',
      one: 'There will be a scheduled system maintenance on ',
      range: 'There will be a scheduled system maintenance from ',
      multi: 'There will be a scheduled system maintenance during the following period:',
      during: 'During this period, {services} will be temporarily unavailable.',
      choose: 'You may choose to perform your transactions before or after this time.'
    },
    cpr: {
      subject: 'Tips to fight financial fraud',
      standard: 'Makipag-ugnayan agad sa official channels ng inyong bangko o e-money issuer kung nakumpromiso ang inyong account o personal na impormasyon.',
      closings: [
        'Gawin ang #CPR o #CheckProtectReport para sa mas ligtas at secure na transaksyon.',
        'Gawin ang #CheckProtectReport para sa mas ligtas at secure na transaksyon.',
        'Protektahan ang sarili mula sa scams at iba pang uri ng panloloko! Gawin ang #CheckProtectReport',
        'Maging wais online. Gawin ang #CheckProtectReport para sa mas ligtas at secure na transaksyon.'
      ]
    },
    unavailable: {
      subjectSched: '{SERVICE} ADVISORY',
      subjectUnsched: '{Service} Service Temporarily Unavailable',
      sched: 'Please be informed that {Service} fund transfers will be unavailable through {channel} during the following period:',
      plan: 'We recommend planning your transactions in advance to avoid any inconvenience.',
      alt: { PESONet: 'For urgent fund transfers to other local banks, you can use InstaPay.' },
      unsched: 'Fund transfer via {Service} is temporarily unavailable on {channel}.',
      resolving: 'Rest assured that we are working on resolving the issue as soon as possible. We will keep you posted once this has been resolved.'
    },
    resumption: {
      subject: '{Service} {is} back online',
      body1: 'We are pleased to inform you that fund transfer via {Service} on {channel} {is} already available.',
      body2: 'You may now transfer funds to other local banks via {Service}.'
    },
    typos: [
      [/\b(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)dayday\b/gi, 'Weekday has a doubled "day"'],
      [/unagayan/gi, '"Makipag-ugnayan" is misspelled'],
      [/\bo-emoney\b/gi, 'Should read "o e-money"'],
      [/\bas secure\b/gi, 'Check "as secure" (usually "at secure")'],
      [/\bis a temporarily\b/gi, 'Remove the "a" in "is a temporarily"'],
      [/\b(Wedneday|Thurday|Saterday)\b/gi, 'Weekday is misspelled']
    ],
    statuses: [
      { k: 'drafted', label: 'Drafted', short: 'Drafted', next: 'I’ve posted it on UAT' },
      { k: 'uat', label: 'Posted on UAT', short: 'On UAT (test)', next: 'I’ve sent it for Ms. Rocky’s approval' },
      { k: 'approval', label: 'For Ms. Rocky’s approval', short: 'For approval', next: 'It’s approved and posted on Prod' },
      { k: 'prod', label: 'Posted on Prod', short: 'On Prod (live)' }
    ]
  };

  var CATS = [
    { k: 'system-maintenance', label: 'System Maintenance' },
    { k: 'bsp-cpr', label: 'BSP CPR' },
    { k: 'security', label: 'Security Advisory' },
    { k: 'sbo', label: 'Sterling Bank Online / Product Advisory' },
    { k: 'regulatory', label: 'Regulatory Advisory' },
    { k: 'unavailable', label: 'InstaPay/PESONet Unavailability' },
    { k: 'resumption', label: 'InstaPay/PESONet Resumption' }
  ];
  var CAT = {}; CATS.forEach(function (c) { CAT[c.k] = c; });

  // ------------------------------------------------------------------ dates
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function pd(s) { var a = String(s).split('-'); return new Date(+a[0], +a[1] - 1, +a[2]); }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function md(d) { return MONTHS[d.getMonth()] + ' ' + d.getDate(); }
  function long(d) { return md(d) + ', ' + d.getFullYear(); }
  function wd(d) { return WD[d.getDay()]; }
  function today() { return iso(new Date()); }
  function tm(hhmm) {
    var a = String(hhmm).split(':'), h = +a[0], m = a[1] || '00';
    var ap = h >= 12 ? 'pm' : 'am'; h = h % 12; if (h === 0) h = 12;
    return h + ':' + m + ' ' + ap;
  }
  function sundayOf(s) { var d = pd(s); return iso(addDays(d, -d.getDay())); }

  // ------------------------------------------------------------------ text model
  // A paragraph is an array of segments [text, bold]. "\n" inside text = line break.
  function joinList(a) {
    if (a.length < 2) return a.join('');
    if (a.length === 2) return a[0] + ' and ' + a[1];
    return a.slice(0, -1).join(', ') + ', and ' + a[a.length - 1];
  }
  function fill(t, o) { return t.replace(/\{(\w+)\}/g, function (m, k) { return o[k] != null ? o[k] : m; }); }
  function textToParas(str) {
    str = String(str || '').replace(/\r\n?/g, '\n').trim();
    if (!str) return [];
    return str.split(/\n[ \t]*\n+/).map(function (p) {
      var segs = [], re = /\*\*([^*]+)\*\*/g, last = 0, m;
      while ((m = re.exec(p))) { if (m.index > last) segs.push([p.slice(last, m.index)]); segs.push([m[1], 1]); last = re.lastIndex; }
      if (last < p.length) segs.push([p.slice(last)]);
      return segs;
    });
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function render(out) {
    var plain = out.paras.map(function (p) { return p.map(function (s) { return s[0]; }).join(''); }).join('\n\n');
    var inner = out.paras.map(function (p) {
      return p.map(function (s) { var t = esc(s[0]).replace(/\n/g, '<br>'); return s[1] ? '<b>' + t + '</b>' : t; }).join('');
    }).join('<br><br>');
    var open = '<font face="' + C.font.face + '" size="' + C.font.size + '">';
    return {
      subject: out.subject,
      plain: plain,
      html: open + inner + '</font>',
      subjectHtml: open + '<b>' + esc(out.subject) + '</b></font>'
    };
  }
  function tail(paras, f, opt) {
    if (opt && opt.security && f.securityLine) paras.push([[C.securityLine]]);
    if (f.footer !== false) paras.push([[C.footer]]);
    if (f.thanks) paras.push([[f.thanks]]);
  }

  // ------------------------------------------------------------------ builders
  function smWindows(f) {
    return (f.windows || []).filter(function (x) { return x.date && x.start && x.end; }).map(function (x) {
      // End date: as entered (multi-day maintenance); if blank, the same day, or the next day when the end time is earlier.
      var s = pd(x.date), e = x.endDate ? pd(x.endDate) : (x.end <= x.start ? addDays(s, 1) : s);
      return { s: s, e: e, st: x.start, et: x.end, over: +e !== +s, bad: +e < +s || (+e === +s && x.endDate && x.end <= x.start) };
    }).sort(function (a, b) { return (a.s - b.s) || a.st.localeCompare(b.st); });
  }
  function smSpan(x) {
    return x.over
      ? md(x.s) + ' (' + wd(x.s) + '), ' + tm(x.st) + ' to ' + md(x.e) + ' (' + wd(x.e) + '), ' + tm(x.et)
      : md(x.s) + ' (' + wd(x.s) + '), from ' + tm(x.st) + ' to ' + tm(x.et);
  }
  function smTitleDates(w) {
    var years = {}; w.forEach(function (x) { years[x.s.getFullYear()] = 1; years[x.e.getFullYear()] = 1; });
    var oneYear = Object.keys(years).length === 1, y = w[0].s.getFullYear();
    var sameMonth = w.every(function (x) { return x.e.getMonth() === w[0].s.getMonth(); });
    if (oneYear && sameMonth) {
      var days = [];
      w.forEach(function (x) { days.push(x.over ? x.s.getDate() + ' to ' + x.e.getDate() : String(x.s.getDate())); });
      return MONTHS[w[0].s.getMonth()] + ' ' + joinList(days) + ', ' + y;
    }
    var parts = w.map(function (x) {
      var a = oneYear ? md(x.s) : long(x.s), b = oneYear ? md(x.e) : long(x.e);
      return x.over ? a + ' to ' + b : a;
    });
    return joinList(parts) + (oneYear ? ', ' + y : '');
  }
  function serviceLabels(f) {
    var out = C.services.filter(function (s) { return (f.services || []).indexOf(s.k) >= 0; }).map(function (s) { return s.label; });
    String(f.otherServices || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (s) { out.push(s); });
    return out;
  }
  function svcWords(svc) { return { Service: svc, SERVICE: svc.toUpperCase(), is: /\band\b/.test(svc) ? 'are' : 'is', channel: C.channel }; }

  var BUILD = {
    'system-maintenance': function (f) {
      var errs = [], w = smWindows(f), svc = serviceLabels(f), paras = [], subject = '';
      if (!w.length) errs.push('Add at least one maintenance window (date, start time and end time).');
      if (w.some(function (x) { return x.bad; })) errs.push('A maintenance window ends before it starts. Check its end date and time.');
      if (!svc.length) errs.push('Tick at least one affected service.');
      if (w.length) {
        subject = C.sm.title + smTitleDates(w);
        if (w.length === 1) paras.push([[w[0].over ? C.sm.range : C.sm.one], [smSpan(w[0]), 1], ['.']]);
        else { paras.push([[C.sm.multi]]); w.forEach(function (x) { paras.push([[smSpan(x), 1]]); }); }
      }
      paras.push([[fill(C.sm.during, { services: joinList(svc) || '…' })]]);
      paras.push([[C.sm.choose]]);
      tail(paras, f);
      return { subject: subject, paras: paras, errors: errs };
    },
    'bsp-cpr': function (f) {
      var errs = [], paras = [];
      if (!String(f.body || '').trim() && !String(f.hook || '').trim()) errs.push('Add the CPR text from BSP.');
      if (f.hook) paras.push([[f.hook.trim()]]);
      paras = paras.concat(textToParas(f.body));
      if (f.standard) paras.push([[C.cpr.standard]]);
      if (f.closing) paras.push([[f.closing]]);
      return { subject: f.subject || C.cpr.subject, paras: paras, errors: errs };
    },
    'unavailable': function (f) {
      var errs = [], o = svcWords(f.service || 'InstaPay'), paras = [], U = C.unavailable, subject;
      if (f.mode === 'unscheduled') {
        subject = fill(U.subjectUnsched, o);
        paras.push([[fill(U.unsched, o)]], [[U.resolving]]);
      } else {
        subject = fill(U.subjectSched, o);
        if (!f.fromDate || !f.fromTime || !f.toDate || !f.toTime) errs.push('Complete the From and To date and time.');
        paras.push([[fill(U.sched, o)]]);
        var a = f.fromDate ? long(pd(f.fromDate)) + (f.fromTime ? ', at ' + tm(f.fromTime) : '') : '…';
        var b = f.toDate ? long(pd(f.toDate)) + (f.toTime ? ', at ' + tm(f.toTime) : '') : '…';
        paras.push([['From: ' + a + '\nTo: ' + b, 1]]);
        var p = [[U.plan]]; if (f.alt && U.alt[o.Service]) p[0][0] += ' ' + U.alt[o.Service];
        paras.push(p);
      }
      tail(paras, f);
      return { subject: subject, paras: paras, errors: errs };
    },
    'resumption': function (f) {
      var o = svcWords(f.service || 'InstaPay'), R = C.resumption, paras = [[[fill(R.body1, o)]], [[fill(R.body2, o)]]];
      tail(paras, f);
      return { subject: fill(R.subject, o), paras: paras, errors: [] };
    }
  };
  function freeForm(security) {
    return function (f) {
      var errs = [];
      if (!String(f.subject || '').trim()) errs.push('Add a subject.');
      if (!String(f.body || '').trim()) errs.push('Add the advisory text.');
      var paras = textToParas(f.body);
      tail(paras, f, { security: security });
      return { subject: (f.subject || '').trim(), paras: paras, errors: errs };
    };
  }
  BUILD.security = freeForm(true);
  BUILD.sbo = freeForm(false);
  BUILD.regulatory = freeForm(false);

  function build(cat, f) { var r = BUILD[cat](f || {}); var o = render(r); o.errors = r.errors; return o; }

  // ------------------------------------------------------------------ defaults + form fields
  var FIELDS = {
    'system-maintenance': [
      { k: 'windows', type: 'windows', label: 'Maintenance window(s)', hint: 'For maintenance over several days, set the End date. Leave it blank for the same day (or the next day if the end time is earlier).' },
      { k: 'services', type: 'services', label: 'Temporarily unavailable' },
      { k: 'thanks', type: 'thanks', label: 'Closing line' }
    ],
    'bsp-cpr': [
      { k: 'weekOf', type: 'date', label: 'Week of (Sunday)', hint: 'Filled from the release date. Change it if BSP assigned another week.' },
      { k: 'subject', type: 'text', label: 'Subject' },
      { k: 'hook', type: 'text', label: 'Opening line (optional)', hint: 'e.g. Mukhang sulit? Baka scam pala!' },
      { k: 'body', type: 'textarea', label: 'BSP text (keep or rewrite)', hint: 'Blank line = new paragraph. Wrap text in **double asterisks** for bold.' },
      { k: 'standard', type: 'check', label: 'Add the standard “Makipag-ugnayan agad…” line' },
      { k: 'closing', type: 'datalist', label: 'Closing line', opts: C.cpr.closings }
    ],
    'security': [
      { k: 'subject', type: 'text', label: 'Subject' },
      { k: 'body', type: 'textarea', label: 'Advisory text', hint: 'Blank line = new paragraph. Wrap text in **double asterisks** for bold.' },
      { k: 'securityLine', type: 'check', label: 'Add “For more security tips…” line' },
      { k: 'footer', type: 'check', label: 'Add the helpline footer' },
      { k: 'thanks', type: 'thanks', label: 'Closing line' }
    ],
    'unavailable': [
      { k: 'service', type: 'select', label: 'Service', opts: ['InstaPay', 'PESONet', 'InstaPay and PESONet'] },
      { k: 'mode', type: 'select', label: 'Type', opts: [['scheduled', 'Scheduled (with period)'], ['unscheduled', 'Unscheduled (issue being fixed)']] },
      { k: 'fromDate', type: 'date', label: 'From date', show: function (f) { return f.mode !== 'unscheduled'; } },
      { k: 'fromTime', type: 'time', label: 'From time', show: function (f) { return f.mode !== 'unscheduled'; } },
      { k: 'toDate', type: 'date', label: 'To date', show: function (f) { return f.mode !== 'unscheduled'; } },
      { k: 'toTime', type: 'time', label: 'To time', show: function (f) { return f.mode !== 'unscheduled'; } },
      { k: 'alt', type: 'check', label: 'Suggest InstaPay for urgent transfers', show: function (f) { return f.mode !== 'unscheduled' && f.service === 'PESONet'; } },
      { k: 'footer', type: 'check', label: 'Add the helpline footer' },
      { k: 'thanks', type: 'thanks', label: 'Closing line' }
    ],
    'resumption': [
      { k: 'service', type: 'select', label: 'Service', opts: ['InstaPay', 'PESONet', 'InstaPay and PESONet'] },
      { k: 'footer', type: 'check', label: 'Add the helpline footer' },
      { k: 'thanks', type: 'thanks', label: 'Closing line' }
    ]
  };
  FIELDS.sbo = FIELDS.security.filter(function (x) { return x.k !== 'securityLine'; });
  FIELDS.regulatory = FIELDS.sbo;

  function defaults(cat) {
    switch (cat) {
      case 'system-maintenance': return { windows: [{ date: '', start: '', endDate: '', end: '' }], services: C.services.filter(function (s) { return s.def; }).map(function (s) { return s.k; }), otherServices: '', footer: true, thanks: '' };
      case 'bsp-cpr': return { weekOf: '', subject: C.cpr.subject, hook: '', body: '', standard: true, closing: C.cpr.closings[0] };
      case 'security': return { subject: '', body: '', securityLine: true, footer: true, thanks: '' };
      case 'unavailable': return { service: 'InstaPay', mode: 'scheduled', fromDate: '', fromTime: '', toDate: '', toTime: '', alt: true, footer: true, thanks: 'Thank you.' };
      case 'resumption': return { service: 'InstaPay', footer: true, thanks: 'Thank you.' };
      default: return { subject: '', body: '', footer: true, thanks: 'Thank you.' };
    }
  }

  // ------------------------------------------------------------------ checks
  var MDW = new RegExp('\\b(' + MONTHS.join('|') + ') (\\d{1,2})(?:, (\\d{4}))? \\((' + WD.join('|') + ')\\)', 'g');
  function checks(cat, f, out, postDate) {
    var list = [], text = out.subject + '\n' + out.plain, ref = postDate ? pd(postDate) : new Date(), m;
    out.errors.forEach(function (e) { list.push(['error', e]); });
    MDW.lastIndex = 0;
    while ((m = MDW.exec(text))) {
      var mi = MONTHS.indexOf(m[1]), y = m[3] ? +m[3] : ref.getFullYear();
      if (!m[3] && mi < ref.getMonth() - 6) y++;
      var d = new Date(y, mi, +m[2]);
      if (WD[d.getDay()] !== m[4]) list.push(['error', m[1] + ' ' + m[2] + ', ' + y + ' is a ' + WD[d.getDay()] + ', not ' + m[4] + '.']);
    }
    if (cat === 'system-maintenance') smWindows(f).forEach(function (x) { if ((x.e - x.s) / 864e5 > 7) list.push(['warn', 'A maintenance window lasts more than 7 days. Check the dates.']); });
    var yrs = text.match(/\b20\d\d\b/g) || [];
    yrs.forEach(function (y) { if (+y < ref.getFullYear() || +y > ref.getFullYear() + 1) list.push(['warn', 'Year ' + y + ' differs from the posting year ' + ref.getFullYear() + '.']); });
    var dbl = text.match(/\b([A-Za-z]{2,})\s+\1\b/gi); if (dbl) dbl.forEach(function (w) { list.push(['warn', 'Repeated word: “' + w + '”']); });
    if (/[^\S\n]{2,}/.test(text)) list.push(['warn', 'Double spaces found.']);
    if (/[^\S\n]+[,.!?;:](?!\w)/.test(text)) list.push(['warn', 'Space before punctuation.']);
    C.typos.forEach(function (t) { t[0].lastIndex = 0; if (t[0].test(text)) list.push(['warn', t[1] + '.']); });
    if (cat === 'bsp-cpr') {
      if (f.weekOf && postDate) {
        var w0 = pd(f.weekOf), r = pd(postDate);
        if (r < w0 || r > addDays(w0, 6)) list.push(['warn', 'Release date is outside the week of ' + long(w0) + '.']);
      }
      if (!/#CheckProtectReport/.test(text)) list.push(['warn', 'No #CheckProtectReport hashtag.']);
    } else if (f.footer === false) list.push(['info', 'Helpline footer is off.']);
    if (!postDate) list.push(['error', 'Set the posting date (Prod).']);
    // de-duplicate
    var seen = {}; return list.filter(function (x) { var k = x[0] + x[1]; if (seen[k]) return false; seen[k] = 1; return true; });
  }

  // ------------------------------------------------------------------ email parsing (.eml / .msg / pasted)
  function bytesToStr(u8) { var s = '', i, n = 0x8000; for (i = 0; i < u8.length; i += n) s += String.fromCharCode.apply(null, u8.subarray(i, i + n)); return s; }
  function strToBytes(s) { var u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; }
  function decodeBytes(binStr, charset) {
    try { return new TextDecoder((charset || 'utf-8').toLowerCase().replace(/^us-ascii$/, 'utf-8')).decode(strToBytes(binStr)); }
    catch (e) { return new TextDecoder('utf-8').decode(strToBytes(binStr)); }
  }
  function qp(s) { return s.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, function (m, h) { return String.fromCharCode(parseInt(h, 16)); }); }
  function b64(s) { try { return atob(s.replace(/[^A-Za-z0-9+/=]/g, '')); } catch (e) { return ''; } }
  function decodeWords(s) {
    return s.replace(/=\?([^?]+)\?([BQ])\?([^?]*)\?=(\s+(?==\?))?/gi, function (m, cs, enc, txt) {
      var bin = enc.toUpperCase() === 'B' ? b64(txt) : qp(txt.replace(/_/g, ' '));
      return decodeBytes(bin, cs);
    });
  }
  function splitHead(raw) {
    var i = raw.search(/\r?\n\r?\n/); if (i < 0) return { head: raw, body: '' };
    var head = raw.slice(0, i).replace(/\r?\n[ \t]+/g, ' '), h = {};
    head.split(/\r?\n/).forEach(function (l) { var j = l.indexOf(':'); if (j > 0) { var k = l.slice(0, j).trim().toLowerCase(); if (!(k in h)) h[k] = l.slice(j + 1).trim(); } });
    return { h: h, body: raw.slice(i).replace(/^\r?\n\r?\n/, '') };
  }
  function param(v, name) { var m = new RegExp(name + '\\s*=\\s*"?([^";]+)"?', 'i').exec(v || ''); return m ? m[1] : ''; }
  function walkMime(raw, acc) {
    var p = splitHead(raw), h = p.h || {}, ct = h['content-type'] || 'text/plain', type = ct.split(';')[0].trim().toLowerCase();
    if (/^multipart\//.test(type)) {
      var bd = param(ct, 'boundary'); if (!bd) return;
      p.body.split('--' + bd).slice(1).forEach(function (part) { if (!/^--/.test(part)) walkMime(part.replace(/^\r?\n/, ''), acc); });
      return;
    }
    if (/attachment/i.test(h['content-disposition'] || '')) return;
    if (type !== 'text/plain' && type !== 'text/html') return;
    var cte = (h['content-transfer-encoding'] || '').toLowerCase(), bin = p.body;
    if (cte === 'base64') bin = b64(bin); else if (cte === 'quoted-printable') bin = qp(bin);
    var txt = decodeBytes(bin, param(ct, 'charset'));
    if (type === 'text/plain' && acc.plain == null) acc.plain = txt;
    if (type === 'text/html' && acc.html == null) acc.html = txt;
  }
  function htmlToText(html) {
    html = String(html).replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|h\d|table)>/gi, '\n\n').replace(/<\/(div|tr|li)>/gi, '\n').replace(/<li[^>]*>/gi, '• ');
    var doc = new DOMParser().parseFromString(html, 'text/html');
    return (doc.body ? doc.body.textContent : '').replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  function parseEml(buf) {
    var raw = bytesToStr(new Uint8Array(buf)), p = splitHead(raw), acc = {};
    walkMime(raw, acc);
    var h = p.h || {};
    return {
      subject: decodeWords(h.subject || ''), from: decodeWords(h.from || ''), date: h.date || '',
      body: acc.plain != null ? acc.plain.replace(/\r\n?/g, '\n') : (acc.html != null ? htmlToText(acc.html) : '')
    };
  }
  function parseMsg(buf) {
    if (!window.CFB) throw new Error('The .msg reader (vendor/cfb.min.js) is not loaded.');
    var cfb = window.CFB.read(new Uint8Array(buf), { type: 'array' }), top = {};
    cfb.FullPaths.forEach(function (p, i) {
      var m = /^[^/]+\/__substg1\.0_([0-9A-F]{4})([0-9A-F]{4})$/i.exec(p);
      if (m) top[(m[1] + m[2]).toUpperCase()] = cfb.FileIndex[i].content;
    });
    function str(id) {
      var u = top[id + '001F'];
      if (u) return new TextDecoder('utf-16le').decode(new Uint8Array(u)).replace(/\u0000+$/, '');
      u = top[id + '001E'];
      if (u) return new TextDecoder('windows-1252').decode(new Uint8Array(u)).replace(/\u0000+$/, '');
      return '';
    }
    var body = str('1000');
    if (!body.trim()) {
      var hb = top['10130102'];
      var html = hb ? new TextDecoder('utf-8').decode(new Uint8Array(hb)) : str('1013');
      if (html) body = htmlToText(html);
    }
    if (!body.trim()) throw new Error('This .msg file has no plain-text or HTML body. Open the email and paste its text instead.');
    var headers = str('007D'), dm = /^Date:\s*(.+)$/mi.exec(headers);
    return { subject: str('0037'), from: str('0C1A') || str('5D01'), date: dm ? dm[1].trim() : '', body: body.replace(/\r\n?/g, '\n') };
  }

  function cleanSubject(s) {
    s = String(s || '').trim();
    var prev; do { prev = s; s = s.replace(/^(re|fw|fwd)\s*:\s*/i, '').replace(/^\[(external|ext)\]\s*/i, '').replace(/^(for (rib )?posting|rib( inbox)?( advisory)?|advisory for posting)\s*[:\-–]\s*/i, ''); } while (s !== prev);
    return s;
  }
  function cleanBody(t) {
    var lines = String(t || '').replace(/\r\n?/g, '\n').split('\n').map(function (l) { return l.replace(/\s+$/, ''); });
    lines = lines.filter(function (l) { return !/^>/.test(l) && !/^(From|Sent|To|Cc|Bcc|Subject|Date|Importance):\s/i.test(l) && !/^-{2,}\s*(Original|Forwarded) Message/i.test(l); });
    var cut = -1;
    lines.some(function (l, i) { var x = l.trim(); if (/^((best|warm|kind)\s+)?regards[,.!]?$/i.test(x) || /^(confidentiality( notice)?|disclaimer)\b/i.test(x) || /^this (e-?mail|message) (and any|is intended|contains)/i.test(x)) { cut = i; return true; } return false; });
    if (cut > 0) lines = lines.slice(0, cut);
    var paras = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim().split(/\n\s*\n/);
    while (paras.length > 1 && paras[0].length < 200 && (/^(hi|hello|good\s+(morning|afternoon|evening|day)|dear|greetings)\b/i.test(paras[0].trim()) || /^(please|kindly)\b.*\b(post|publish|blast|upload|see)\b/i.test(paras[0].trim()))) paras.shift();
    return paras.join('\n\n');
  }
  // remove lines the generator adds itself; returns { body, found:{footer,security,thanks,standard,closing} }
  function stripStandard(body) {
    var found = {}, keep = [];
    body.split(/\n\s*\n/).forEach(function (p) {
      var x = p.trim();
      if (/^for inquiries or concerns|customer service helplines/i.test(x)) { found.footer = true; return; }
      if (/financial literacy and awareness page/i.test(x)) { found.security = true; return; }
      if (/^thank you[^.\n]{0,40}[.!]?$/i.test(x)) { found.thanks = x.replace(/!$/, '.'); if (!/\.$/.test(found.thanks)) found.thanks += '.'; return; }
      if (/^makipag-?\s*u\w* agad/i.test(x)) { found.standard = true; return; }
      keep.push(p);
    });
    if (keep.length && /#CheckProtectReport/i.test(keep[keep.length - 1]) && keep[keep.length - 1].length < 200) found.closing = keep.pop().trim();
    return { body: keep.join('\n\n'), found: found };
  }

  var MRE = '(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?';
  function monthIdx(s) { return ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(s.slice(0, 3).toLowerCase()); }
  function scanEvents(text, refYear) {
    var ev = [], m, masked = text;
    var dRe = new RegExp('\\b' + MRE + '\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?(?!\\d|:)', 'gi');
    while ((m = dRe.exec(text))) {
      var mi = monthIdx(m[1]), y = m[3] ? +m[3] : refYear;
      ev.push({ i: m.index, t: 'd', v: iso(new Date(y, mi, +m[2])) });
      var rest = text.slice(dRe.lastIndex), r2 = /^\s*(?:to|-|–|and)\s*(\d{1,2})(?!\d|:|\s*(?:am|pm|a\.m|p\.m|nn|noon))(?:,?\s*(\d{4}))?/i.exec(rest);
      if (r2) ev.push({ i: dRe.lastIndex + r2.index + 1, t: 'd', v: iso(new Date(r2[2] ? +r2[2] : y, mi, +r2[1])) });
      masked = masked.slice(0, m.index) + ' '.repeat(m[0].length) + masked.slice(m.index + m[0].length);
    }
    var nRe = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g;
    while ((m = nRe.exec(text))) { var yy = +m[3]; if (yy < 100) yy += 2000; ev.push({ i: m.index, t: 'd', v: iso(new Date(yy, +m[1] - 1, +m[2])) }); }
    var tRe = /\b(\d{1,2})(?::(\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?|nn|noon|mn|midnight)(?![a-z])/gi;
    while ((m = tRe.exec(masked))) {
      var h = +m[1], mm = m[2] || '00', ap = m[3].toLowerCase().replace(/[.\s]/g, '');
      if (h > 12) continue;
      if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0;
      if (ap === 'nn' || ap === 'noon') h = 12; if (ap === 'mn' || ap === 'midnight') h = 0;
      ev.push({ i: m.index, t: 't', v: pad(h) + ':' + mm });
    }
    var hRe = /\b([01]\d|2[0-3]):?([0-5]\d)\s*(?:H|hrs?)\b/g;
    while ((m = hRe.exec(masked))) ev.push({ i: m.index, t: 't', v: m[1] + ':' + m[2] });
    return ev.sort(function (a, b) { return a.i - b.i; });
  }
  function windowsFrom(ev) {
    var out = [], run = [], pend = null, startDate = null, endDate = null;
    ev.forEach(function (e) {
      if (e.t === 'd') {
        if (pend) { if (!endDate && e.v > startDate) endDate = e.v; return; } // end date of a window that runs past its start day; end time follows
        if (run.length && out.length && run.lastUsed) run = [];
        run.push(e.v); run.lastUsed = false;
      } else {
        if (!run.length) return;
        if (!pend) { pend = e.v; startDate = run[0]; return; }
        var st = pend, et = e.v, ed = endDate; pend = null; endDate = null;
        var consecutive = run.length === 2 && iso(addDays(pd(run[0]), 1)) === run[1];
        if (ed) out.push({ date: startDate, start: st, endDate: ed, end: et });
        else if (run.length === 1 || (consecutive && et <= st)) out.push({ date: startDate, start: st, end: et });
        else run.forEach(function (d) { out.push({ date: d, start: st, end: et }); });
        run.lastUsed = true;
      }
    });
    var seen = {};
    return out.filter(function (w) { var k = w.date + w.start + (w.endDate || '') + w.end; if (seen[k]) return false; seen[k] = 1; return true; });
  }
  function guessCategory(subject, body) {
    var t = (subject + '\n' + body).toLowerCase();
    if (/check\s*-?\s*protect\s*-?\s*report|#cpr\b|securitips|\bcpr\b/.test(t)) return 'bsp-cpr';
    if (/maintenance/.test(t)) return 'system-maintenance';
    if (/(instapay|pesonet)/.test(t) && /(back online|now available|already available|restored|resum)/.test(t)) return 'resumption';
    if (/(instapay|pesonet)/.test(t) && /(unavailable|cut-?over|downtime|not available|interruption)/.test(t)) return 'unavailable';
    if (/(bsp circular|circular no|memorandum no|withdrawal limit)/.test(t)) return 'regulatory';
    if (/(scam|phishing|fraud|vigilant|security tips|social engineering)/.test(t)) return 'security';
    return 'sbo';
  }
  function refYearOf(dateHeader) { var d = new Date(dateHeader); return isNaN(d) ? new Date().getFullYear() : d.getFullYear(); }
  function extract(email, cat) {
    var subject = cleanSubject(email.subject), body = cleanBody(email.body);
    cat = cat || guessCategory(subject, body);
    var f = defaults(cat), y = refYearOf(email.date), st = stripStandard(body), fd = st.found;
    if (cat === 'system-maintenance') {
      var w = windowsFrom(scanEvents(body, y));
      if (!w.length) w = windowsFrom(scanEvents(subject + '\n' + body, y));
      if (w.length) f.windows = w;
      var hit = C.services.filter(function (s) { return s.re.test(body); }).map(function (s) { return s.k; });
      if (hit.length) f.services = hit;
      if (fd.thanks) f.thanks = fd.thanks;
    } else if (cat === 'bsp-cpr') {
      var paras = st.body.split(/\n\s*\n/), first = (paras[0] || '').trim();
      if (/^tips to fight financial fraud$/i.test(first)) { paras.shift(); first = (paras[0] || '').trim(); }
      if (first && first.length <= 120 && first.indexOf('\n') < 0 && paras.length > 1) { f.hook = first; paras.shift(); }
      f.body = paras.join('\n\n');
      f.standard = true;
      if (fd.closing) f.closing = fd.closing;
    } else if (cat === 'unavailable' || cat === 'resumption') {
      var t = (subject + ' ' + body).toLowerCase(), ip = /instapay/.test(t), pn = /pesonet/.test(t);
      f.service = ip && pn ? 'InstaPay and PESONet' : pn ? 'PESONet' : 'InstaPay';
      if (cat === 'unavailable') {
        var w2 = windowsFrom(scanEvents(body, y));
        if (w2.length) {
          f.fromDate = w2[0].date; f.fromTime = w2[0].start; f.toTime = w2[0].end;
          f.toDate = w2[0].end <= w2[0].start ? iso(addDays(pd(w2[0].date), 1)) : w2[0].date;
        } else f.mode = /(unscheduled|intermittent|issue|resolv)/.test(t) ? 'unscheduled' : 'scheduled';
      }
      if (fd.thanks) f.thanks = fd.thanks;
    } else {
      f.subject = subject; f.body = st.body;
      if (cat === 'security') f.securityLine = true;
      if (fd.thanks) f.thanks = fd.thanks;
    }
    return { cat: cat, f: f };
  }

  window.RIB = {
    config: C, categories: CATS, fields: FIELDS, defaults: defaults, build: build, checks: checks,
    parseEml: parseEml, parseMsg: parseMsg, extract: extract, guessCategory: guessCategory,
    scanEvents: scanEvents, windowsFrom: windowsFrom, cleanBody: cleanBody, sundayOf: sundayOf,
    util: { pd: pd, iso: iso, long: long, today: today, esc: esc }
  };

  if (window.Portal && typeof window.Portal.registerSkill === 'function') {
    try { window.Portal.registerSkill({ id: 'rib-advisory', title: 'RIB Advisory Generator', group: 'RIB', description: 'Draft RIB Inbox advisories, track UAT to Prod, and keep the compilation', page: 'rib.html' }); } catch (e) { /* shell may use a stricter contract */ }
  }
})();
