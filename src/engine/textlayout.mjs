// engine/textlayout.js - text measured once, laid out many times, off the DOM.
//
// This is the property CONSTRAINTS.md fixes: prepare a string once (word
// advances at a reference size) and then break it against arbitrary shapes
// repeatedly - per surface, per locale, per print sheet, and on every frame of
// a drag - with no layout read-back. The measurer is injected so the same code
// runs in a browser, in a validator and in a headless job.

var REF = 100; // reference font size; advances scale linearly

function makeCanvasMeasurer(canvasFactory) {
  var ctx = canvasFactory().getContext('2d');
  var cache = Object.create(null);
  return function (text, fontSpec) {
    var key = fontSpec.key + '\u0000' + text;
    var hit = cache[key];
    if (hit !== undefined) return hit;
    ctx.font = (fontSpec.style || 'normal') + ' ' + (fontSpec.weight || 400) + ' ' + REF + 'px ' + fontSpec.stack;
    var w = ctx.measureText(text).width;
    cache[key] = w;
    return w;
  };
}

// Deterministic fallback for environments with no canvas. Widths are coarse but
// stable, which is what a validator needs.
function makeMetricMeasurer() {
  var cache = Object.create(null);
  return function (text, fontSpec) {
    var key = fontSpec.key + '\u0000' + text;
    if (cache[key] !== undefined) return cache[key];
    var w = 0;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (c === ' ') w += 26;
      else if ('iljtfr.,;:!|\'"'.indexOf(c) >= 0) w += 30;
      else if (c === c.toUpperCase() && c !== c.toLowerCase()) w += 66;
      else if ('mwшщжю'.indexOf(c) >= 0) w += 82;
      else w += 54;
    }
    cache[key] = w;
    return w;
  };
}

// Which way a run of text reads. This is a property of the script the characters
// are in - a Unicode fact, not a design decision and not a locale setting. A
// mirrored page cannot make a Cyrillic sentence read right to left, and an
// left-to-right page cannot make an Arabic one read left to right.
var RTL_RANGES = /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u07C0-\u07FF\u0800-\u083F\u0840-\u085F\uFB1D-\uFDFF\uFE70-\uFEFF]/;
var LTR_RANGES = /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF\u0530-\u058F\u0900-\u097F\u3040-\u30FF\u4E00-\u9FFF]/;

// 'rtl' only when the run's own strong characters are right-to-left. A run with
// no strong characters either way takes the surrounding direction.
function directionOf(text, fallback) {
  var s = String(text || '');
  var rtl = RTL_RANGES.test(s), ltr = LTR_RANGES.test(s);
  if (rtl && !ltr) return 'rtl';
  if (ltr) return 'ltr';
  return fallback || 'ltr';
}

// Split into layout atoms, keeping the source string's own characters. Nothing
// here rewrites her words; it only records where they may break.
function prepare(text, fontSpec, measure) {
  var atoms = [], i = 0, cursor = 0;
  var parts = String(text).split(/(\s+)/);
  for (var p = 0; p < parts.length; p++) {
    var s = parts[p];
    if (!s) continue;
    var isSpace = /^\s+$/.test(s);
    atoms.push({ text: s, space: isSpace, start: cursor, end: cursor + s.length,
                 w: measure(isSpace ? ' ' : s, fontSpec) / REF });
    cursor += s.length;
  }
  return { text: String(text), atoms: atoms, fontSpec: fontSpec };
}

// shapeFor(y, h) -> array of [x0,x1] free intervals for a line at that band.
function layout(prepared, opts) {
  var size = opts.size, lead = opts.leading * size;
  var lines = [], y = opts.y, i = 0, atoms = prepared.atoms;
  var guard = 0;
  while (i < atoms.length && guard++ < 4000) {
    var intervals = opts.shapeFor(y, lead);
    if (!intervals.length) { y += lead; continue; }
    // Widest interval wins; a sliver beside a cutout is not a line of text.
    var iv = intervals.reduce(function (a, b) { return (b[1] - b[0]) > (a[1] - a[0]) ? b : a; });
    if (iv[1] - iv[0] < opts.minLine) { y += lead; continue; }
    while (i < atoms.length && atoms[i].space) i++;
    var lineAtoms = [], x = 0, j = i;
    while (j < atoms.length) {
      var w = atoms[j].w * size;
      if (x + w > (iv[1] - iv[0]) && lineAtoms.length) break;
      lineAtoms.push(atoms[j]); x += w; j++;
    }
    while (lineAtoms.length && lineAtoms[lineAtoms.length - 1].space) { x -= lineAtoms.pop().w * size; }
    if (!lineAtoms.length) { y += lead; continue; }
    var last = j >= atoms.length;
    lines.push({ x: iv[0], y: y, w: iv[1] - iv[0], used: x, h: lead, size: size,
                 rtl: !!opts.rtl, last: last,
                 atoms: lineAtoms.map(function (a) { return a; }),
                 text: lineAtoms.map(function (a) { return a.text; }).join(''),
                 start: lineAtoms[0].start, end: lineAtoms[lineAtoms.length - 1].end });
    i = j; y += lead;
  }
  return { lines: lines, bottom: y };
}

// Where a character range sits on the page, in boxes - one per line it spans.
// Marks are drawn from these, so a circle round a quantity is computed, never placed.
function spanBoxes(laid, start, end, size) {
  var out = [];
  for (var l = 0; l < laid.lines.length; l++) {
    var line = laid.lines[l];
    if (end <= line.start || start >= line.end) continue;
    var x = line.x, x0 = null, x1 = null;
    var dir = line.rtl ? -1 : 1;
    var cursor = line.rtl ? line.x + line.w : line.x;
    for (var a = 0; a < line.atoms.length; a++) {
      var at = line.atoms[a], w = at.w * size;
      var ax = line.rtl ? cursor - w : cursor;
      if (at.end > start && at.start < end) {
        if (x0 === null || ax < x0) x0 = ax;
        if (x1 === null || ax + w > x1) x1 = ax + w;
      }
      cursor += dir * w;
    }
    if (x0 !== null) out.push({ x: x0, y: line.y, w: x1 - x0, h: line.h, size: size });
  }
  return out;
}

var API = { REF: REF, makeCanvasMeasurer: makeCanvasMeasurer, makeMetricMeasurer: makeMetricMeasurer,
            prepare: prepare, layout: layout, spanBoxes: spanBoxes, directionOf: directionOf };

export { REF, makeCanvasMeasurer, makeMetricMeasurer, prepare, layout, spanBoxes, directionOf };
