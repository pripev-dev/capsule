import * as rng from "./rng.mjs";

// engine/paper.js - torn and deckled edges, generated from a seed.
// No edge is drawn by hand and no path string is stored anywhere. A rectangle
// becomes a piece of paper by running this over its own seed.


// Two-frequency noise round a rectangle, the same construction the visual
// pipeline used on the fragments themselves, so the page and the cutouts tear alike.
function tornRect(box, seed, opts) {
  opts = opts || {};
  var amp = opts.amplitude != null ? opts.amplitude : Math.max(3, Math.min(box.w, box.h) * 0.012);
  var per = opts.period != null ? opts.period : Math.max(18, Math.min(box.w, box.h) * 0.07);
  var r = rng.rngFrom(seed);
  var phase = [r() * 6.28, r() * 6.28, r() * 6.28, r() * 6.28];
  var pts = [];
  var sides = [
    { from: [box.x, box.y], to: [box.x + box.w, box.y], nx: 0, ny: -1 },
    { from: [box.x + box.w, box.y], to: [box.x + box.w, box.y + box.h], nx: 1, ny: 0 },
    { from: [box.x + box.w, box.y + box.h], to: [box.x, box.y + box.h], nx: 0, ny: 1 },
    { from: [box.x, box.y + box.h], to: [box.x, box.y], nx: -1, ny: 0 }
  ];
  for (var s = 0; s < 4; s++) {
    var sd = sides[s];
    var len = Math.hypot(sd.to[0] - sd.from[0], sd.to[1] - sd.from[1]);
    var n = Math.max(6, Math.round(len / per * 3));
    for (var i = 0; i < n; i++) {
      var t = i / n;
      var d = Math.sin(t * len / per * 6.283 + phase[s]) * amp
            + Math.sin(t * len / per * 17.1 + phase[(s + 1) % 4]) * amp * 0.45
            + (r() - 0.5) * amp * 0.7;
      pts.push([sd.from[0] + (sd.to[0] - sd.from[0]) * t + sd.nx * d,
                sd.from[1] + (sd.to[1] - sd.from[1]) * t + sd.ny * d]);
    }
  }
  return pts;
}

function toPath(pts) {
  var d = 'M' + pts[0][0].toFixed(2) + ' ' + pts[0][1].toFixed(2);
  for (var i = 1; i < pts.length; i++) d += 'L' + pts[i][0].toFixed(2) + ' ' + pts[i][1].toFixed(2);
  return d + 'Z';
}
function toClipPercent(pts, box) {
  return 'polygon(' + pts.map(function (p) {
    return (((p[0] - box.x) / box.w) * 100).toFixed(3) + '% ' + (((p[1] - box.y) / box.h) * 100).toFixed(3) + '%';
  }).join(',') + ')';
}

var API = { tornRect: tornRect, toPath: toPath, toClipPercent: toClipPercent };

export { tornRect, toPath, toClipPercent };
