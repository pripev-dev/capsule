// engine/geometry.js - polygons, scanlines, obstacle intervals.
// Pure arithmetic. Nothing here reads the DOM and nothing here knows what a
// fragment means.

function bbox(poly) {
  var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (var i = 0; i < poly.length; i++) {
    var p = poly[i];
    if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
    if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// Place a normalised contour (0..1 in its own image box) into surface coordinates.
function placePoly(poly, box, rotDeg) {
  var cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  var a = (rotDeg || 0) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  var out = [];
  for (var i = 0; i < poly.length; i++) {
    var px = box.x + poly[i][0] * box.w - cx;
    var py = box.y + poly[i][1] * box.h - cy;
    out.push([cx + px * ca - py * sa, cy + px * sa + py * ca]);
  }
  return out;
}

// Grow a polygon away from its centroid: the gutter that keeps text off the edge.
function inflate(poly, amount) {
  var cx = 0, cy = 0, n = poly.length;
  for (var i = 0; i < n; i++) { cx += poly[i][0]; cy += poly[i][1]; }
  cx /= n; cy /= n;
  return poly.map(function (p) {
    var dx = p[0] - cx, dy = p[1] - cy, d = Math.hypot(dx, dy) || 1;
    return [p[0] + dx / d * amount, p[1] + dy / d * amount];
  });
}

// x-crossings of a horizontal line through a closed polygon.
function crossings(poly, y) {
  var xs = [], n = poly.length;
  for (var i = 0; i < n; i++) {
    var a = poly[i], b = poly[(i + 1) % n];
    if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
      xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
    }
  }
  return xs.sort(function (p, q) { return p - q; });
}

// The horizontal span a polygon occupies across a band of height h, which is
// what a line of text actually collides with.
function bandSpan(poly, y, h) {
  var lo = Infinity, hi = -Infinity, steps = 4;
  for (var s = 0; s <= steps; s++) {
    var xs = crossings(poly, y + h * s / steps);
    for (var i = 0; i + 1 < xs.length; i += 2) { if (xs[i] < lo) lo = xs[i]; if (xs[i + 1] > hi) hi = xs[i + 1]; }
  }
  return hi > lo ? [lo, hi] : null;
}

// [x0,x1] minus a list of blocking spans -> the free intervals a line may use.
function freeIntervals(x0, x1, blockers) {
  var free = [[x0, x1]];
  for (var b = 0; b < blockers.length; b++) {
    var bl = blockers[b], next = [];
    for (var i = 0; i < free.length; i++) {
      var f = free[i];
      if (bl[1] <= f[0] || bl[0] >= f[1]) { next.push(f); continue; }
      if (bl[0] > f[0]) next.push([f[0], bl[0]]);
      if (bl[1] < f[1]) next.push([bl[1], f[1]]);
    }
    free = next;
  }
  return free.filter(function (f) { return f[1] - f[0] > 0.5; });
}

function rectsOverlapArea(a, b) {
  var w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  var h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

function polyToPath(poly) {
  if (!poly.length) return '';
  var d = 'M' + poly[0][0].toFixed(2) + ' ' + poly[0][1].toFixed(2);
  for (var i = 1; i < poly.length; i++) d += 'L' + poly[i][0].toFixed(2) + ' ' + poly[i][1].toFixed(2);
  return d + 'Z';
}

var API = { bbox: bbox, placePoly: placePoly, inflate: inflate, crossings: crossings,
            bandSpan: bandSpan, freeIntervals: freeIntervals, rectsOverlapArea: rectsOverlapArea,
            polyToPath: polyToPath };

export { bbox, placePoly, inflate, crossings, bandSpan, freeIntervals, rectsOverlapArea, polyToPath };
