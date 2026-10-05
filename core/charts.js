/* core/charts.js — inline SVG charts (no external library) + PNG conversion for Word exports. */
(function (root) {
  'use strict';
  var P = root.Portal = root.Portal || {};

  var COLORS = { current: '#12305a', previous: '#e0a526', grid: '#e4dccb', text: '#1d2433', muted: '#5d6475' };

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /** Rounds an axis maximum up to a clean step (1, 2, 2.5, 5 x 10^n). */
  function niceMax(v) {
    if (v <= 0) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }

  P.charts = {
    colors: COLORS,

    /** Horizontal bars, one row per item; optional second (previous-period) series.
        opts: { title, data:[{label, value, prev?}], seriesLabels:[cur, prev], format:fn, width } -> SVG string */
    hbar: function (opts) {
      var data = opts.data || [], fmt = opts.format || function (v) { return P.fmt.num(v); };
      var hasPrev = data.some(function (d) { return d.prev !== undefined && d.prev !== null; });
      var W = opts.width || 760, labelW = 170, valueW = 80, top = opts.title ? 54 : 30;
      var rowH = hasPrev ? 30 : 22, barH = hasPrev ? 11 : 14;
      var H = top + data.length * rowH + 30;
      var max = niceMax(Math.max.apply(null, data.map(function (d) { return Math.max(d.value || 0, d.prev || 0); }).concat([0])));
      var plotW = W - labelW - valueW;
      var x = function (v) { return labelW + Math.max(0, v) / max * plotW; };
      var s = [];
      s.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(opts.title || 'Bar chart') + '" font-family="Segoe UI, Arial, sans-serif">');
      s.push('<rect width="100%" height="100%" fill="#ffffff"/>');
      if (opts.title) s.push('<text x="0" y="20" font-size="15" font-weight="700" fill="' + COLORS.text + '">' + esc(opts.title) + '</text>');
      // legend
      var labels = opts.seriesLabels || ['Current', 'Previous'], lx = labelW, ly = top - 16;
      s.push('<rect x="' + lx + '" y="' + (ly - 9) + '" width="10" height="10" fill="' + COLORS.current + '"/><text x="' + (lx + 14) + '" y="' + ly + '" font-size="11" fill="' + COLORS.muted + '">' + esc(labels[0]) + '</text>');
      if (hasPrev) s.push('<rect x="' + (lx + 110) + '" y="' + (ly - 9) + '" width="10" height="10" fill="' + COLORS.previous + '"/><text x="' + (lx + 124) + '" y="' + ly + '" font-size="11" fill="' + COLORS.muted + '">' + esc(labels[1]) + '</text>');
      // grid + axis labels
      for (var g = 0; g <= 4; g++) {
        var gx = labelW + plotW * g / 4;
        s.push('<line x1="' + gx + '" y1="' + top + '" x2="' + gx + '" y2="' + (H - 24) + '" stroke="' + COLORS.grid + '"/>');
        s.push('<text x="' + gx + '" y="' + (H - 8) + '" font-size="10" text-anchor="middle" fill="' + COLORS.muted + '">' + esc(fmt(max * g / 4)) + '</text>');
      }
      data.forEach(function (d, i) {
        var y = top + i * rowH + (rowH - (hasPrev ? barH * 2 + 2 : barH)) / 2;
        s.push('<text x="' + (labelW - 8) + '" y="' + (top + i * rowH + rowH / 2 + 4) + '" font-size="11.5" text-anchor="end" fill="' + COLORS.text + '">' + esc(d.label) + '</text>');
        s.push('<rect x="' + labelW + '" y="' + y + '" width="' + (x(d.value) - labelW) + '" height="' + barH + '" fill="' + COLORS.current + '" rx="2"><title>' + esc(d.label + ': ' + fmt(d.value)) + '</title></rect>');
        s.push('<text x="' + (x(d.value) + 5) + '" y="' + (y + barH - 2) + '" font-size="10.5" fill="' + COLORS.text + '">' + esc(fmt(d.value)) + '</text>');
        if (hasPrev && d.prev !== null && d.prev !== undefined) {
          s.push('<rect x="' + labelW + '" y="' + (y + barH + 2) + '" width="' + (x(d.prev) - labelW) + '" height="' + barH + '" fill="' + COLORS.previous + '" rx="2"><title>' + esc(d.label + ' (' + labels[1] + '): ' + fmt(d.prev)) + '</title></rect>');
        }
      });
      s.push('</svg>');
      return s.join('');
    },

    /** SVG string -> PNG data URL (for Word, which cannot show inline SVG). */
    toPng: function (svg, scale) {
      scale = scale || 2;
      return new Promise(function (resolve, reject) {
        var url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
        var img = new Image();
        img.onload = function () {
          var c = document.createElement('canvas');
          c.width = img.width * scale; c.height = img.height * scale;
          var ctx = c.getContext('2d');
          ctx.scale(scale, scale); ctx.drawImage(img, 0, 0);
          URL.revokeObjectURL(url);
          resolve({ dataUrl: c.toDataURL('image/png'), width: img.width, height: img.height });
        };
        img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Chart image conversion failed.')); };
        img.src = url;
      });
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
