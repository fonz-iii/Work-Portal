/* core/charts.js — inline SVG charts (no external library) + PNG conversion for Word exports.
   Style: direct labels (no legend), vertical gridlines only, SBA in amber, peers in grey, source note underneath.
   Colors come from the CSS chart tokens. Outputs use the light set (default); UI charts can follow the
   screen theme with charts.mount(), which redraws on theme change. */
(function (root) {
  'use strict';
  var P = root.Portal = root.Portal || {};

  /** Light chart tokens: used for outputs (official documents) and when CSS is unavailable. */
  var LIGHT = { sba: '#F5A623', primary: '#0A2A66', peer: '#C7CCD4', grid: '#DDE2E9', text: '#5A626E', ink: '#16181D', bg: '#FFFFFF',
    series: ['#F5A623', '#0A2A66', '#2E8B8B', '#7A5CA8', '#C0603A', '#8A919C'] };

  function palette(theme, scope) {
    if (theme !== 'auto' || !root.getComputedStyle) return LIGHT;
    var cs = getComputedStyle(scope || document.documentElement);
    var v = function (n, d) { var x = cs.getPropertyValue(n).trim(); return x || d; };
    return { sba: v('--chart-sba', LIGHT.sba), primary: v('--chart-primary', LIGHT.primary), peer: v('--chart-peer', LIGHT.peer),
      grid: v('--chart-grid', LIGHT.grid), text: v('--chart-text', LIGHT.text), ink: v('--chart-ink', LIGHT.ink), bg: v('--chart-bg', LIGHT.bg), series: LIGHT.series };
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /** Rounds an axis maximum up to a clean step (1, 2, 2.5, 5 x 10^n). */
  function niceMax(v) {
    if (v <= 0) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }
  /** Horizontal bar with only the right end rounded (3px). */
  function bar(x, y, w, h, fill, title) {
    var r = Math.min(3, w / 2, h / 2);
    var d = w <= 0 ? '' : 'M' + x + ' ' + y + 'h' + (w - r) + 'a' + r + ' ' + r + ' 0 0 1 ' + r + ' ' + r + 'v' + (h - 2 * r) + 'a' + r + ' ' + r + ' 0 0 1 -' + r + ' ' + r + 'h-' + (w - r) + 'z';
    return '<path d="' + d + '" fill="' + fill + '"><title>' + esc(title) + '</title></path>';
  }

  P.charts = {
    light: LIGHT,

    /** Horizontal bars, one row per item; optional previous-period bar under each.
        opts: { title, data:[{label, value, prev?, highlight?}], seriesLabels:[cur, prev], format:fn, source, width, theme:'light'|'auto', scope }
        highlight:true marks the SBA row (amber bar, bold label). Returns an SVG string. */
    hbar: function (opts) {
      var c = palette(opts.theme, opts.scope);
      var data = opts.data || [], fmt = opts.format || function (v) { return P.fmt.num(v); };
      var hasPrev = data.some(function (d) { return d.prev !== undefined && d.prev !== null; });
      var labels = opts.seriesLabels || ['Current', 'Previous'];
      var W = opts.width || 760, labelW = 176, valueW = 132, top = opts.title ? 40 : 12;
      var barH = 12, rowH = hasPrev ? 38 : 26;
      var plotH = data.length * rowH, axisY = top + plotH + 4;
      var H = axisY + 22 + (opts.source ? 22 : 0);
      var max = niceMax(Math.max.apply(null, data.map(function (d) { return Math.max(d.value || 0, d.prev || 0); }).concat([0])));
      var plotW = W - labelW - valueW;
      var x = function (v) { return Math.max(0, v) / max * plotW; };
      var s = [];
      s.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(opts.title || 'Bar chart') + '" font-family="Source Sans 3, Arial, sans-serif" style="font-variant-numeric: tabular-nums">');
      s.push('<rect width="100%" height="100%" fill="' + c.bg + '"/>');
      if (opts.title) s.push('<text x="0" y="18" font-size="16" font-weight="600" font-family="Source Serif 4, Georgia, serif" fill="' + c.ink + '">' + esc(opts.title) + '</text>');
      for (var g = 0; g <= 4; g++) {
        var gx = labelW + plotW * g / 4;
        s.push('<line x1="' + gx + '" y1="' + top + '" x2="' + gx + '" y2="' + axisY + '" stroke="' + c.grid + '"/>');
        s.push('<text x="' + gx + '" y="' + (axisY + 16) + '" font-size="12" text-anchor="middle" fill="' + c.text + '">' + esc(fmt(max * g / 4)) + '</text>');
      }
      data.forEach(function (d, i) {
        var y0 = top + i * rowH + (rowH - (hasPrev ? barH * 2 + 3 : barH)) / 2;
        var curFill = d.highlight ? c.sba : c.primary;
        s.push('<text x="' + (labelW - 10) + '" y="' + (y0 + barH - 1) + '" font-size="12.5"' + (d.highlight ? ' font-weight="700"' : '') + ' text-anchor="end" fill="' + c.ink + '">' + esc(d.label) + '</text>');
        s.push(bar(labelW, y0, x(d.value), barH, curFill, d.label + ' (' + labels[0] + '): ' + fmt(d.value)));
        // direct labels: value, plus the series name on the first row instead of a legend
        s.push('<text x="' + (labelW + x(d.value) + 6) + '" y="' + (y0 + barH - 1) + '" font-size="12" fill="' + c.ink + '">' + esc(fmt(d.value)) + (i === 0 && hasPrev ? '  ' + esc(labels[0]) : '') + '</text>');
        if (hasPrev && d.prev !== null && d.prev !== undefined) {
          var y1 = y0 + barH + 3;
          s.push(bar(labelW, y1, x(d.prev), barH, c.peer, d.label + ' (' + labels[1] + '): ' + fmt(d.prev)));
          s.push('<text x="' + (labelW + x(d.prev) + 6) + '" y="' + (y1 + barH - 1) + '" font-size="12" fill="' + c.text + '">' + esc(fmt(d.prev)) + (i === 0 ? '  ' + esc(labels[1]) : '') + '</text>');
        }
      });
      if (opts.source) s.push('<text x="0" y="' + (H - 6) + '" font-size="12" fill="' + c.text + '">' + esc(opts.source) + '</text>');
      s.push('</svg>');
      return s.join('');
    },

    /** Render a UI chart into el using the screen theme, and redraw whenever the theme changes. */
    mount: function (el, kind, opts) {
      var draw = function () { el.innerHTML = P.charts[kind](Object.assign({}, opts, { theme: 'auto', scope: el })); };
      draw();
      root.addEventListener('portal:themechange', draw);
      return draw;
    },

    /** SVG string -> PNG data URL (for Word, which cannot show inline SVG). */
    toPng: function (svg, scale) {
      scale = scale || 2;
      return new Promise(function (resolve, reject) {
        var url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
        var img = new Image();
        img.onload = function () {
          var cv = document.createElement('canvas');
          cv.width = img.width * scale; cv.height = img.height * scale;
          var ctx = cv.getContext('2d');
          ctx.scale(scale, scale); ctx.drawImage(img, 0, 0);
          URL.revokeObjectURL(url);
          resolve({ dataUrl: cv.toDataURL('image/png'), width: img.width, height: img.height });
        };
        img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Chart image conversion failed.')); };
        img.src = url;
      });
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
