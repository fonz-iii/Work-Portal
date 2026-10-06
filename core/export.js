/* core/export.js — turns an output's render() result into a downloadable/saveable Blob.
   excel: { sheets:[{ name, rows:[[...]], cols?:[widths] }] }        -> .xlsx (SheetJS)
   word:  { title, html, images?:[{ name, dataUrl }] }                -> .doc  (MHTML; Word opens it, images embedded)
   html:  string                                                      -> shown on screen; printable via print stylesheet
   html-file: string (or { html })                                    -> self-contained .html file (e.g. a slide deck) */
(function (root) {
  'use strict';
  var P = root.Portal = root.Portal || {};

  function b64utf8(str) {
    var bytes = new TextEncoder().encode(str), bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function wrap76(s) { return s.replace(/.{1,76}/g, '$&\r\n'); }

  var WORD_CSS =
    '@page Section1{size:595.3pt 841.9pt;margin:54pt 54pt 54pt 54pt;}' +
    'div.Section1{page:Section1;}' +
    'body{font-family:"Segoe UI",Calibri,Arial,sans-serif;font-size:10.5pt;color:#1a2433;}' +
    'h1{font-size:18pt;color:#0d2240;margin:0 0 4pt;}h2{font-size:13pt;color:#0d2240;margin:14pt 0 4pt;}' +
    'p{margin:0 0 6pt;line-height:1.35;}.muted{color:#5b6676;font-size:9pt;}' +
    'table{border-collapse:collapse;width:100%;margin:4pt 0 8pt;}' +
    'th{background:#0d2240;color:#ffffff;font-weight:bold;padding:4pt 6pt;text-align:left;font-size:9.5pt;}' +
    'td{padding:3pt 6pt;border-bottom:1px solid #dfe5ed;font-size:9.5pt;}' +
    'tr.alt td{background:#f5f7fa;}td.n,th.n{text-align:right;}' +
    '.draft{color:#9a5b00;font-weight:bold;}';

  P.export = {
    excelBlob: function (spec) {
      var X = root.XLSX, wb = X.utils.book_new();
      spec.sheets.forEach(function (sh) {
        var ws = X.utils.aoa_to_sheet(sh.rows);
        if (sh.cols) ws['!cols'] = sh.cols.map(function (w) { return { wch: w }; });
        X.utils.book_append_sheet(wb, ws, String(sh.name).slice(0, 31));
      });
      var out = X.write(wb, { bookType: 'xlsx', type: 'array' });
      return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    },

    wordBlob: function (spec) {
      var B = '----=_SBA_Portal_Part', base = 'file:///C:/sba-portal/';
      var html =
        '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">' +
        '<head><meta charset="utf-8"><title>' + (spec.title || 'Report') + '</title>' +
        '<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->' +
        '<style>' + WORD_CSS + (spec.css || '') + '</style></head>' +
        '<body><div class="Section1">' + spec.html + '</div></body></html>';
      var parts = ['MIME-Version: 1.0', 'Content-Type: multipart/related; boundary="' + B + '"; type="text/html"', '',
        '--' + B, 'Content-Type: text/html; charset="utf-8"', 'Content-Transfer-Encoding: base64',
        'Content-Location: ' + base + 'report.htm', '', wrap76(b64utf8(html))];
      (spec.images || []).forEach(function (img) {
        parts.push('--' + B, 'Content-Type: image/png', 'Content-Transfer-Encoding: base64',
          'Content-Location: ' + base + img.name, '', wrap76(img.dataUrl.split(',')[1]));
      });
      parts.push('--' + B + '--', '');
      return new Blob([parts.join('\r\n')], { type: 'application/msword' });
    },

    /** -> { blob, ext } for a file-producing format. */
    build: function (format, spec) {
      if (format === 'excel') return { blob: P.export.excelBlob(spec), ext: 'xlsx' };
      if (format === 'word') return { blob: P.export.wordBlob(spec), ext: 'doc' };
      if (format === 'html-file') return { blob: new Blob([typeof spec === 'string' ? spec : spec.html], { type: 'text/html;charset=utf-8' }), ext: 'html' };
      throw new Error('Unknown export format: ' + format);
    },

    safeName: function (s) { return String(s).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim(); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
