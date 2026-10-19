/* core/ocr.js — offline text recognition for pictures (Tesseract OCR, vendored; Apache-2.0).
   The engine (vendor/tesseract-core-lstm.wasm.js, wasm embedded) and the English data (vendor/tesseract-eng.js)
   are loaded only when a picture is read, with classic <script> tags (works from file://, no worker, no network).
   P.ocr.read(bytes, passes, onProgress) -> Promise<[words per pass]>; a word is { text, conf, x0, y0, x1, y1 }
   in the picture's own pixels. A pass is { scale, thr, psm, wl }: enlarge, optional black/white threshold,
   Tesseract page-segmentation mode and character whitelist. */
(function (root) {
  'use strict';
  var P = root.Portal = root.Portal || {};
  var engine = null;

  function script(src) {
    return new Promise(function (ok, bad) {
      var s = document.createElement('script'); s.src = src;
      s.onload = function () { ok(); }; s.onerror = function () { bad(new Error('Could not load ' + src + '. Is the vendor folder complete?')); };
      document.head.appendChild(s);
    });
  }
  function b64bytes(b64) { var s = atob(b64), u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
  function gunzip(u8) {
    if (typeof DecompressionStream === 'undefined') return Promise.reject(new Error('This browser cannot unpack the text-recognition data.'));
    return new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }
  function ready(prog) {
    if (engine) return engine;
    prog('Loading the text-recognition engine (first time only)…');
    engine = (root.TesseractCore ? Promise.resolve() : script('vendor/tesseract-core-lstm.wasm.js'))
      .then(function () { return root.SBA_TESS_ENG ? null : script('vendor/tesseract-eng.js'); })
      .then(function () { return Promise.all([root.TesseractCore({}), gunzip(b64bytes(root.SBA_TESS_ENG))]); })
      .then(function (x) {
        var M = x[0]; M.FS.writeFile('/eng.traineddata', x[1]);
        var api = new M.TessBaseAPI();
        if (api.Init(null, 'eng') !== 0) throw new Error('The text-recognition engine did not start.');
        return { M: M, api: api };
      });
    engine.catch(function () { engine = null; });
    return engine;
  }
  // enlarge (and optionally threshold) the picture on a canvas; -> PNG bytes
  function prepare(bytes, scale, thr) {
    return createImageBitmap(new Blob([bytes])).then(function (bm) {
      var c = document.createElement('canvas'); c.width = bm.width * scale; c.height = bm.height * scale;
      var x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
      x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(bm, 0, 0, c.width, c.height);
      if (thr) {
        var d = x.getImageData(0, 0, c.width, c.height), p = d.data;
        for (var i = 0; i < p.length; i += 4) { var v = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2] < thr ? 0 : 255; p[i] = p[i + 1] = p[i + 2] = v; }
        x.putImageData(d, 0, 0);
      }
      return new Promise(function (ok) { c.toBlob(ok, 'image/png'); });
    }).then(function (b) { return b.arrayBuffer(); }).then(function (a) { return new Uint8Array(a); });
  }
  function words(tsv, scale) {   // Tesseract TSV, level 5 rows = words
    return tsv.split('\n').map(function (l) { return l.split('\t'); }).filter(function (c) { return c[0] === '5' && c[11] && c[11].trim(); })
      .map(function (c) { var l = +c[6], t = +c[7]; return { text: c[11].trim(), conf: +c[10], x0: l / scale, y0: t / scale, x1: (l + +c[8]) / scale, y1: (t + +c[9]) / scale }; });
  }
  P.ocr = {
    read: function (bytes, passes, onProgress) {
      var prog = onProgress || function () {}, out = [];
      return ready(prog).then(function (e) {
        return passes.reduce(function (pr, ps, k) {
          return pr.then(function () {
            prog('Reading the picture (pass ' + (k + 1) + ' of ' + passes.length + ')…');
            return prepare(bytes, ps.scale || 1, ps.thr || 0).then(function (png) {
              e.M.FS.writeFile('/input', png);
              e.api.SetVariable('tessedit_pageseg_mode', String(ps.psm || 3));
              e.api.SetVariable('tessedit_char_whitelist', ps.wl || '');
              e.api.SetImageFile(1, 0); e.api.Recognize(null);
              out.push(words(e.api.GetTSVText(0), ps.scale || 1));
            });
          });
        }, Promise.resolve());
      }).then(function () { return out; });
    }
  };
})(window);
