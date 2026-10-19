/* core/xlsx-writer.js — writes styled .xlsx workbooks in the browser (offline; uses vendor/jszip.min.js).
   The free SheetJS build cannot write styles or charts, so the OOXML is written directly.
   Supports: cell values and formulas (with cached values from core/xlsx-calc.js), fonts, fills, borders,
   alignment, number formats, cell protection, merges, column widths, row heights, frozen panes,
   auto-filter, tab colour, hidden gridlines, page setup + footer, sheet protection, defined names,
   data validation, conditional formatting (cellIs), internal hyperlinks, bar and doughnut charts.
   Model only; no DOM. A string starting with "=" is a formula, as in openpyxl. */
(function (root) {
  'use strict';
  var X = root.XlsxCalc;
  var NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  var R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  var BUILTIN_FMT = { 'General': 0, '0': 1, '0.00': 2, '#,##0': 3, '#,##0.00': 4, '0%': 9, '0.00%': 10 };

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''); }
  function rgb(c) { c = String(c || '000000').replace(/^#/, '').toUpperCase(); return c.length === 8 ? c : 'FF' + c; }
  function cmToEmu(cm) { return Math.round(cm * 360000); }

  /* ---------- sheet ---------- */
  function Sheet(name) {
    this.name = name; this.cells = {}; this.widths = {}; this.heights = {}; this.merges = [];
    this.freezeAt = null; this.filter = null; this.tabColor = null; this.gridLines = true;
    this.page = null; this.footer = null; this.protect = false; this.validations = []; this.condFormats = [];
    this.links = []; this.charts = []; this.maxR = 0; this.maxC = 0; this.minR = Infinity; this.minC = Infinity;
  }
  Sheet.prototype.key = function (r, c) { return r * 16384 + c; };
  Sheet.prototype.at = function (ref) {   // get or create the cell object at "B7"
    var p = X.parseA1(ref); return this.atRC(p.r, p.c);
  };
  Sheet.prototype.atRC = function (r, c) {
    var k = this.key(r, c), cell = this.cells[k];
    if (!cell) {
      cell = this.cells[k] = { r: r, c: c, v: null, f: null, s: null };
      if (r > this.maxR) this.maxR = r; if (c > this.maxC) this.maxC = c; if (r < this.minR) this.minR = r; if (c < this.minC) this.minC = c;
    }
    return cell;
  };
  Sheet.prototype.cell = function (r, c) { return this.cells[this.key(r, c)]; };
  // value: number | string | boolean | null; a string starting with "=" is stored as a formula
  Sheet.prototype.put = function (r, c, v) {
    var cell = this.atRC(r, c);
    if (typeof v === 'string' && v.charAt(0) === '=' && v.length > 1) { cell.f = v.slice(1); cell.v = null; }
    else { cell.v = v === undefined ? null : v; cell.f = null; }
    return cell;
  };
  Sheet.prototype.width = function (col, w) { this.widths[typeof col === 'string' ? X.colNum(col) : col] = w; };
  Sheet.prototype.height = function (row, h) { this.heights[row] = h; };
  Sheet.prototype.merge = function (ref) { this.merges.push(ref); };

  /* ---------- styles ---------- */
  function Styles() {
    this.fonts = ['<font><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/><family val="2"/></font>']; this.fontIx = {};
    this.fills = ['<fill><patternFill/></fill>', '<fill><patternFill patternType="gray125"/></fill>']; this.fillIx = {};
    this.borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>']; this.borderIx = {};
    this.fmts = []; this.fmtIx = {}; this.xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>']; this.xfIx = {}; this.dxfs = [];
  }
  function fontXml(f) {
    return '<font>' + (f.bold ? '<b val="1"/>' : '') + (f.italic ? '<i val="1"/>' : '') + (f.underline ? '<u val="' + (f.underline === true ? 'single' : f.underline) + '"/>' : '') +
      '<sz val="' + (f.size || 11) + '"/><color rgb="' + rgb(f.color || '000000') + '"/><name val="' + esc(f.name || 'Calibri') + '"/>' + (f.name && /^(Calibri|Arial)$/.test(f.name) ? '<family val="2"/>' : '') + '</font>';
  }
  function side(tag, s) { return s ? '<' + tag + ' style="' + s.style + '"><color rgb="' + rgb(s.color || '000000') + '"/></' + tag + '>' : '<' + tag + '/>'; }
  Styles.prototype.id = function (st) {
    if (!st) return 0;
    var key = JSON.stringify(st); if (key in this.xfIx) return this.xfIx[key];
    var fontId = 0, fillId = 0, borderId = 0, fmtId = 0, x, k;
    if (st.font) { x = fontXml(st.font); k = this.fontIx[x]; if (k === undefined) { k = this.fontIx[x] = this.fonts.length; this.fonts.push(x); } fontId = k; }
    if (st.fill) { x = '<fill><patternFill patternType="solid"><fgColor rgb="' + rgb(st.fill) + '"/><bgColor indexed="64"/></patternFill></fill>'; k = this.fillIx[x]; if (k === undefined) { k = this.fillIx[x] = this.fills.length; this.fills.push(x); } fillId = k; }
    if (st.border) {
      var b = st.border; x = '<border>' + side('left', b.left) + side('right', b.right) + side('top', b.top) + side('bottom', b.bottom) + '<diagonal/></border>';
      k = this.borderIx[x]; if (k === undefined) { k = this.borderIx[x] = this.borders.length; this.borders.push(x); } borderId = k;
    }
    if (st.numFmt && st.numFmt !== 'General') {
      if (st.numFmt in BUILTIN_FMT) fmtId = BUILTIN_FMT[st.numFmt];
      else { k = this.fmtIx[st.numFmt]; if (k === undefined) { k = this.fmtIx[st.numFmt] = 164 + this.fmts.length; this.fmts.push(st.numFmt); } fmtId = k; }
    }
    var al = st.align, alx = '';
    if (al) {
      alx = '<alignment' + (al.h ? ' horizontal="' + al.h + '"' : '') + (al.v ? ' vertical="' + al.v + '"' : '') + (al.wrap ? ' wrapText="1"' : '') + (al.indent ? ' indent="' + al.indent + '"' : '') + '/>';
    }
    var prot = st.locked === false ? '<protection locked="0"/>' : '';
    var xml = '<xf numFmtId="' + fmtId + '" fontId="' + fontId + '" fillId="' + fillId + '" borderId="' + borderId + '" xfId="0"' +
      (fmtId ? ' applyNumberFormat="1"' : '') + (fontId ? ' applyFont="1"' : '') + (fillId ? ' applyFill="1"' : '') + (borderId ? ' applyBorder="1"' : '') +
      (alx ? ' applyAlignment="1"' : '') + (prot ? ' applyProtection="1"' : '') + (alx || prot ? '>' + alx + prot + '</xf>' : '/>');
    var id = this.xfs.length; this.xfs.push(xml); this.xfIx[key] = id; return id;
  };
  Styles.prototype.dxf = function (d) {
    var x = '<dxf>' + (d.font ? '<font>' + (d.font.bold ? '<b val="1"/>' : '') + '<color rgb="' + rgb(d.font.color) + '"/></font>' : '') +
      (d.fill ? '<fill><patternFill patternType="solid"><fgColor rgb="' + rgb(d.fill) + '"/><bgColor rgb="' + rgb(d.fill) + '"/></patternFill></fill>' : '') + '</dxf>';
    var i = this.dxfs.indexOf(x); if (i < 0) { i = this.dxfs.length; this.dxfs.push(x); } return i;
  };
  Styles.prototype.xml = function () {
    var self = this;
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="' + NS + '">' +
      (this.fmts.length ? '<numFmts count="' + this.fmts.length + '">' + this.fmts.map(function (f, i) { return '<numFmt numFmtId="' + (164 + i) + '" formatCode="' + esc(f) + '"/>'; }).join('') + '</numFmts>' : '') +
      '<fonts count="' + this.fonts.length + '">' + this.fonts.join('') + '</fonts>' +
      '<fills count="' + this.fills.length + '">' + this.fills.join('') + '</fills>' +
      '<borders count="' + this.borders.length + '">' + this.borders.join('') + '</borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="' + this.xfs.length + '">' + this.xfs.join('') + '</cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '<dxfs count="' + self.dxfs.length + '">' + self.dxfs.join('') + '</dxfs><tableStyles count="0"/></styleSheet>';
  };

  /* ---------- charts ---------- */
  var A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main', C_NS = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
  function q(sheet) { return "'" + String(sheet).replace(/'/g, "''") + "'"; }
  function absRef(sheet, ref) { return q(sheet) + '!' + ref.replace(/([A-Z]+)(\d+)/g, '$$$1$$$2'); }
  function fill(c) { return '<a:solidFill><a:srgbClr val="' + String(c).toUpperCase() + '"/></a:solidFill>'; }
  function chartXml(ch) {
    var title = '<c:title><c:tx><c:rich><a:bodyPr/><a:p><a:pPr><a:defRPr/></a:pPr><a:r><a:t>' + esc(ch.title) + '</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>';
    var body;
    if (ch.type === 'doughnut') {
      var s = ch.series[0];
      body = '<c:doughnutChart><c:varyColors val="1"/><c:ser><c:idx val="0"/><c:order val="0"/>' +
        (ch.colors || []).map(function (c, i) { return '<c:dPt><c:idx val="' + i + '"/><c:bubble3D val="0"/><c:spPr>' + fill(c) + '</c:spPr></c:dPt>'; }).join('') +
        '<c:cat><c:strRef><c:f>' + esc(ch.cats) + '</c:f></c:strRef></c:cat><c:val><c:numRef><c:f>' + esc(s.ref) + '</c:f></c:numRef></c:val></c:ser>' +
        '<c:dLbls><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="1"/><c:showBubbleSize val="0"/><c:showLeaderLines val="0"/></c:dLbls>' +
        '<c:firstSliceAng val="0"/><c:holeSize val="' + (ch.hole || 55) + '"/></c:doughnutChart>';
    } else {
      body = '<c:barChart><c:barDir val="' + (ch.dir === 'bar' ? 'bar' : 'col') + '"/><c:grouping val="clustered"/><c:varyColors val="0"/>' +
        ch.series.map(function (s, i) {
          var tx = s.titleRef ? '<c:tx><c:strRef><c:f>' + esc(s.titleRef) + '</c:f></c:strRef></c:tx>' : s.title ? '<c:tx><c:v>' + esc(s.title) + '</c:v></c:tx>' : '';
          return '<c:ser><c:idx val="' + i + '"/><c:order val="' + i + '"/>' + tx + (s.color ? '<c:spPr>' + fill(s.color) + '<a:ln>' + fill(s.color) + '</a:ln></c:spPr>' : '') +
            '<c:invertIfNegative val="0"/><c:cat><c:strRef><c:f>' + esc(ch.cats) + '</c:f></c:strRef></c:cat><c:val><c:numRef><c:f>' + esc(s.ref) + '</c:f></c:numRef></c:val></c:ser>';
        }).join('') +
        '<c:gapWidth val="150"/><c:axId val="10"/><c:axId val="100"/></c:barChart>' +
        '<c:catAx><c:axId val="10"/><c:scaling><c:orientation val="' + (ch.dir === 'bar' ? 'maxMin' : 'minMax') + '"/></c:scaling><c:delete val="0"/><c:axPos val="' + (ch.dir === 'bar' ? 'l' : 'b') + '"/>' +
        '<c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="100"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>' +
        '<c:valAx><c:axId val="100"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="' + (ch.dir === 'bar' ? 'b' : 'l') + '"/><c:numFmt formatCode="#,##0" sourceLinked="0"/>' +
        '<c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="10"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>';
    }
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<c:chartSpace xmlns:c="' + C_NS + '" xmlns:a="' + A_NS + '" xmlns:r="' + R_NS + '"><c:roundedCorners val="0"/><c:chart>' + title +
      '<c:plotArea><c:layout/>' + body + '</c:plotArea>' + (ch.legend ? '<c:legend><c:legendPos val="' + ch.legend + '"/><c:overlay val="0"/></c:legend>' : '') +
      '<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>';
  }
  function drawingXml(charts) {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="' + A_NS + '">' +
      charts.map(function (ch, i) {
        var p = X.parseA1(ch.anchor);
        return '<xdr:oneCellAnchor><xdr:from><xdr:col>' + (p.c - 1) + '</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>' + (p.r - 1) + '</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>' +
          '<xdr:ext cx="' + cmToEmu(ch.w) + '" cy="' + cmToEmu(ch.h) + '"/><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="' + (i + 2) + '" name="Chart ' + (i + 1) + '"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>' +
          '<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="' + C_NS + '"><c:chart xmlns:c="' + C_NS + '" xmlns:r="' + R_NS + '" r:id="rId' + (i + 1) + '"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:oneCellAnchor>';
      }).join('') + '</xdr:wsDr>';
  }

  /* ---------- workbook ---------- */
  function Workbook() { this.sheets = []; this.byName = {}; this.names = {}; this.creator = 'SBA Marketing Portal'; }
  Workbook.prototype.addSheet = function (name) { var s = new Sheet(name); this.sheets.push(s); this.byName[name] = s; return s; };
  Workbook.prototype.sheet = function (name) { return this.byName[name]; };
  Workbook.prototype.defineName = function (name, text) { this.names[name] = text; };
  // Calculates every formula (cached values) with core/xlsx-calc.js; returns the Calc so callers can read figures.
  Workbook.prototype.calculate = function () {
    var model = { sheets: {}, names: this.names }, self = this;
    this.sheets.forEach(function (s) { model.sheets[s.name] = { cell: function (r, c) { var x = s.cell(r, c); return x ? { v: x.v, f: x.f == null ? null : x.f } : undefined; } }; });
    var calc = new X.Calc(model);
    this.sheets.forEach(function (s) { Object.keys(s.cells).forEach(function (k) { var c = s.cells[k]; if (c.f != null) c.cached = calc.cellValue(s.name, c.r, c.c); }); });
    this.calc = calc;
    return calc;
  };
  Workbook.prototype.value = function (sheet, ref) {   // value of a cell after calculate()
    var p = X.parseA1(ref), c = this.byName[sheet].cell(p.r, p.c);
    return !c ? null : c.f != null ? c.cached : c.v;
  };

  function cellXml(c, sid) {
    var ref = X.colName(c.c) + c.r, s = sid ? ' s="' + sid + '"' : '';
    if (c.f != null) {
      var v = c.cached, t = '', vx = '';
      if (v === undefined || v === null) vx = '';
      else if (X.isErr(v)) { t = ' t="e"'; vx = '<v>' + esc(v.err) + '</v>'; }
      else if (typeof v === 'number') vx = isFinite(v) ? '<v>' + v + '</v>' : '';
      else if (typeof v === 'boolean') { t = ' t="b"'; vx = '<v>' + (v ? 1 : 0) + '</v>'; }
      else { t = ' t="str"'; vx = '<v>' + esc(v) + '</v>'; }
      return '<c r="' + ref + '"' + s + t + '><f>' + esc(c.f) + '</f>' + vx + '</c>';
    }
    var val = c.v;
    if (val === null || val === undefined || val === '') return '<c r="' + ref + '"' + s + '/>';
    if (typeof val === 'number') return '<c r="' + ref + '"' + s + '><v>' + val + '</v></c>';
    if (typeof val === 'boolean') return '<c r="' + ref + '"' + s + ' t="b"><v>' + (val ? 1 : 0) + '</v></c>';
    var str = String(val), sp = /^\s|\s$/.test(str) ? ' xml:space="preserve"' : '';
    return '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t' + sp + '>' + esc(str) + '</t></is></c>';
  }
  function sheetXml(sh, styles, hasDrawing) {
    var out = [], keys = Object.keys(sh.cells).map(Number).sort(function (a, b) { return a - b; });
    var rows = {}; keys.forEach(function (k) { var c = sh.cells[k]; (rows[c.r] = rows[c.r] || []).push(c); });
    Object.keys(sh.heights).forEach(function (r) { rows[r] = rows[r] || []; });
    var dim = sh.maxR ? X.colName(Math.min(sh.minC, sh.maxC)) + Math.min(sh.minR, sh.maxR) + ':' + X.colName(sh.maxC) + sh.maxR : 'A1';
    out.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="' + NS + '" xmlns:r="' + R_NS + '">');
    out.push('<sheetPr>' + (sh.tabColor ? '<tabColor rgb="' + rgb(sh.tabColor) + '"/>' : '') + (sh.page && sh.page.fitToPage ? '<pageSetUpPr fitToPage="1"/>' : '') + '</sheetPr>');
    out.push('<dimension ref="' + dim + '"/>');
    var view = '<sheetView' + (sh.gridLines ? '' : ' showGridLines="0"') + ' workbookViewId="0">';
    if (sh.freezeAt) {
      var fp = X.parseA1(sh.freezeAt), xs = fp.c - 1, ys = fp.r - 1;
      var pane = xs && ys ? 'bottomRight' : ys ? 'bottomLeft' : 'topRight';
      view += '<pane' + (xs ? ' xSplit="' + xs + '"' : '') + (ys ? ' ySplit="' + ys + '"' : '') + ' topLeftCell="' + sh.freezeAt + '" activePane="' + pane + '" state="frozen"/>' +
        '<selection pane="' + pane + '" activeCell="' + sh.freezeAt + '" sqref="' + sh.freezeAt + '"/>';
    }
    out.push('<sheetViews>' + view + '</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>');
    var cols = Object.keys(sh.widths).map(Number).sort(function (a, b) { return a - b; });
    if (cols.length) out.push('<cols>' + cols.map(function (c) { return '<col min="' + c + '" max="' + c + '" width="' + sh.widths[c] + '" customWidth="1"/>'; }).join('') + '</cols>');
    out.push('<sheetData>');
    Object.keys(rows).map(Number).sort(function (a, b) { return a - b; }).forEach(function (r) {
      var h = sh.heights[r];
      out.push('<row r="' + r + '"' + (h ? ' ht="' + h + '" customHeight="1"' : '') + '>' + rows[r].map(function (c) { return cellXml(c, styles.id(c.s)); }).join('') + '</row>');
    });
    out.push('</sheetData>');
    if (sh.protect) out.push('<sheetProtection sheet="1" objects="0" scenarios="0" formatColumns="0" formatRows="0" autoFilter="0" sort="0" selectLockedCells="0" selectUnlockedCells="0" formatCells="1" insertColumns="1" insertRows="1" insertHyperlinks="1" deleteColumns="1" deleteRows="1" pivotTables="1"/>');
    if (sh.filter) out.push('<autoFilter ref="' + sh.filter + '"/>');
    if (sh.merges.length) out.push('<mergeCells count="' + sh.merges.length + '">' + sh.merges.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join('') + '</mergeCells>');
    var prio = 1;
    sh.condFormats.forEach(function (cf) {
      out.push('<conditionalFormatting sqref="' + cf.sqref + '">' + cf.rules.map(function (ru) {
        return '<cfRule type="cellIs" dxfId="' + styles.dxf(ru.dxf) + '" priority="' + (prio++) + '" operator="' + ru.op + '"><formula>' + esc(ru.formula) + '</formula></cfRule>';
      }).join('') + '</conditionalFormatting>');
    });
    if (sh.validations.length) out.push('<dataValidations count="' + sh.validations.length + '">' + sh.validations.map(function (d) {
      return '<dataValidation type="' + d.type + '" operator="' + d.op + '" allowBlank="1" showErrorMessage="1" errorTitle="' + esc(d.errorTitle) + '" error="' + esc(d.error) + '" sqref="' + d.sqref.join(' ') + '"><formula1>' + esc(d.formula1) + '</formula1></dataValidation>';
    }).join('') + '</dataValidations>');
    if (sh.links.length) out.push('<hyperlinks>' + sh.links.map(function (l) { return '<hyperlink ref="' + l.ref + '" location="' + esc(l.location) + '" display="' + esc(l.display) + '"/>'; }).join('') + '</hyperlinks>');
    out.push('<pageMargins left="0.75" right="0.75" top="1" bottom="1" header="0.5" footer="0.5"/>');
    if (sh.page) out.push('<pageSetup orientation="' + (sh.page.orientation || 'portrait') + '" fitToWidth="' + (sh.page.fitToWidth == null ? 1 : sh.page.fitToWidth) + '" fitToHeight="' + (sh.page.fitToHeight == null ? 1 : sh.page.fitToHeight) + '"/>');
    if (sh.footer) out.push('<headerFooter><oddFooter>' + esc((sh.footer.left ? '&L' + sh.footer.left : '') + (sh.footer.right ? '&R' + sh.footer.right : '')) + '</oddFooter></headerFooter>');
    if (hasDrawing) out.push('<drawing r:id="rId1"/>');
    out.push('</worksheet>');
    return out.join('');
  }

  // -> Promise<Blob> (or another JSZip output type, e.g. 'nodebuffer' in tests). Call calculate() first to store cached values.
  Workbook.prototype.toBlob = function (type) {
    if (!root.JSZip) return Promise.reject(new Error('vendor/jszip.min.js did not load.'));
    var zip = new root.JSZip(), styles = new Styles(), self = this, ct = [], wbRels = [], chartN = 0, drawN = 0;
    this.sheets.forEach(function (sh, i) {
      var n = i + 1, hasD = sh.charts.length > 0;
      zip.file('xl/worksheets/sheet' + n + '.xml', sheetXml(sh, styles, hasD));
      ct.push('<Override PartName="/xl/worksheets/sheet' + n + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>');
      wbRels.push('<Relationship Id="rId' + n + '" Type="' + R_NS + '/worksheet" Target="worksheets/sheet' + n + '.xml"/>');
      if (hasD) {
        drawN++;
        zip.file('xl/worksheets/_rels/sheet' + n + '.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="' + R_NS + '/drawing" Target="../drawings/drawing' + drawN + '.xml"/></Relationships>');
        zip.file('xl/drawings/drawing' + drawN + '.xml', drawingXml(sh.charts));
        ct.push('<Override PartName="/xl/drawings/drawing' + drawN + '.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>');
        var dr = sh.charts.map(function (ch, j) {
          chartN++;
          zip.file('xl/charts/chart' + chartN + '.xml', chartXml(ch));
          ct.push('<Override PartName="/xl/charts/chart' + chartN + '.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>');
          return '<Relationship Id="rId' + (j + 1) + '" Type="' + R_NS + '/chart" Target="../charts/chart' + chartN + '.xml"/>';
        });
        zip.file('xl/drawings/_rels/drawing' + drawN + '.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + dr.join('') + '</Relationships>');
      }
    });
    var n = this.sheets.length;
    wbRels.push('<Relationship Id="rId' + (n + 1) + '" Type="' + R_NS + '/styles" Target="styles.xml"/>');
    var names = Object.keys(this.names);
    zip.file('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="' + NS + '" xmlns:r="' + R_NS + '"><workbookPr/><bookViews><workbookView activeTab="0"/></bookViews><sheets>' +
      this.sheets.map(function (sh, i) { return '<sheet name="' + esc(sh.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') + '</sheets>' +
      (names.length ? '<definedNames>' + names.map(function (k) { return '<definedName name="' + esc(k) + '">' + esc(self.names[k]) + '</definedName>'; }).join('') + '</definedNames>' : '') +
      '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>');
    zip.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + wbRels.join('') + '</Relationships>');
    zip.file('xl/styles.xml', styles.xml());
    var now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    zip.file('docProps/core.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>' + esc(this.creator) + '</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">' + now + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + now + '</dcterms:modified></cp:coreProperties>');
    zip.file('docProps/app.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Microsoft Excel</Application></Properties>');
    zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="' + R_NS + '/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="' + R_NS + '/extended-properties" Target="docProps/app.xml"/></Relationships>');
    zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' + ct.join('') + '</Types>');
    return zip.generateAsync({ type: type || 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  };

  root.XlsxW = { Workbook: Workbook, absRef: absRef, cmToEmu: cmToEmu };
})(typeof window !== 'undefined' ? window : globalThis);
