import * as rng from "./rng.mjs";

// engine/marks.js - the cookbook grammar, drawn.
//
// Every stroke is generated from the mark's own box and a seed. There is no
// stored artwork and no hand-placed path. writing-cookbook-marks decides what
// carries a mark; this decides what the stroke looks like when it does.


function jitter(r, a) { return (r() - 0.5) * a; }

function circle(box, seed) {
  var r = rng.rngFrom(seed);
  // The box IS the line, so the loop's vertical reach is measured against the
  // leading: much over half of it and the circle grazes the lines above and
  // below rather than reading as a loop round this one.
  var cx = box.x + box.w / 2, cy = box.y + box.h * 0.52;
  var rx = box.w / 2 + box.h * 0.30, ry = box.h * 0.56;
  var start = rng.range(r, 2.2, 3.4), turns = rng.range(r, 1.06, 1.22);
  var steps = 46, d = '';
  for (var i = 0; i <= steps; i++) {
    var t = start + (i / steps) * turns * 6.2832;
    var wob = 1 + Math.sin(t * 2.7 + start) * 0.045 + jitter(r, 0.05);
    var x = cx + Math.cos(t) * rx * wob, y = cy + Math.sin(t) * ry * wob * (1 + i / steps * 0.06);
    d += (i ? 'L' : 'M') + x.toFixed(2) + ' ' + y.toFixed(2);
  }
  return { d: d, width: Math.max(1.1, box.h * 0.055), fill: 'none', cap: 'round', opacity: 0.9 };
}

function underline(box, seed, style) {
  var r = rng.rngFrom(seed);
  var y0 = box.y + box.h * 0.9, steps = Math.max(8, Math.round(box.w / 7)), d = '';
  var dash = null;
  for (var i = 0; i <= steps; i++) {
    var t = i / steps, x = box.x + box.w * t;
    var y = y0 + Math.sin(t * 3.1 + r() * 0.2) * box.h * 0.035 + jitter(r, box.h * 0.03);
    if (style === 'squiggle') y = y0 + Math.sin(t * box.w / 5.5) * box.h * 0.11 + jitter(r, box.h * 0.02);
    d += (i ? 'L' : 'M') + x.toFixed(2) + ' ' + y.toFixed(2);
  }
  if (style === 'dotted') dash = (box.h * 0.07).toFixed(2) + ' ' + (box.h * 0.13).toFixed(2);
  return { d: d, width: Math.max(1, box.h * (style === 'squiggle' ? 0.045 : 0.055)),
           fill: 'none', cap: 'round', dash: dash, opacity: 0.92 };
}

function highlight(box, seed) {
  var r = rng.rngFrom(seed);
  var y = box.y + box.h * 0.56;
  var d = 'M' + (box.x - box.h * 0.06).toFixed(2) + ' ' + (y + jitter(r, box.h * 0.04)).toFixed(2) +
          'L' + (box.x + box.w + box.h * 0.08).toFixed(2) + ' ' + (y + jitter(r, box.h * 0.05)).toFixed(2);
  return { d: d, width: box.h * rng.range(r, 0.66, 0.8), fill: 'none', cap: 'butt',
           opacity: 0.42, blend: 'multiply' };
}

function strike(box, seed) {
  var r = rng.rngFrom(seed);
  var y = box.y + box.h * 0.52;
  return { d: 'M' + (box.x - 1).toFixed(2) + ' ' + (y + jitter(r, box.h * 0.05)).toFixed(2) +
              'L' + (box.x + box.w + 1).toFixed(2) + ' ' + (y + jitter(r, box.h * 0.05)).toFixed(2),
           d2: null, width: Math.max(1, box.h * 0.05), fill: 'none', cap: 'round', opacity: 0.75 };
}

// Colouring-over: several passes of a soft crayon, the way a page gets a block
// of colour when someone had no highlighter.
function colourOver(box, seed) {
  var r = rng.rngFrom(seed), passes = rng.intRange(r, 3, 5), d = '';
  for (var p = 0; p < passes; p++) {
    var y = box.y + box.h * (0.22 + 0.6 * (p / Math.max(1, passes - 1)));
    d += 'M' + (box.x + jitter(r, box.h * 0.2)).toFixed(2) + ' ' + (y + jitter(r, box.h * 0.06)).toFixed(2) +
         'L' + (box.x + box.w + jitter(r, box.h * 0.25)).toFixed(2) + ' ' + (y + jitter(r, box.h * 0.06)).toFixed(2);
  }
  return { d: d, width: box.h * 0.3, fill: 'none', cap: 'round', opacity: 0.3, blend: 'multiply' };
}

function ruleAcross(box, seed) {
  var r = rng.rngFrom(seed), steps = Math.max(10, Math.round(box.w / 12)), d = '';
  for (var i = 0; i <= steps; i++) {
    var t = i / steps;
    d += (i ? 'L' : 'M') + (box.x + box.w * t).toFixed(2) + ' ' +
         (box.y + Math.sin(t * 2.3 + r()) * 1.4 + jitter(r, 0.9)).toFixed(2);
  }
  return { d: d, width: 1.6, fill: 'none', cap: 'round', opacity: 0.7 };
}

function bulletMark(x, y, size, seed) {
  var r = rng.rngFrom(seed);
  return { d: 'M' + (x).toFixed(2) + ' ' + (y + size * 0.1).toFixed(2) +
              'Q' + (x + size * 0.22).toFixed(2) + ' ' + (y + size * 0.55 + jitter(r, size * 0.06)).toFixed(2) +
              ' ' + (x + size * 0.62).toFixed(2) + ' ' + (y - size * 0.18).toFixed(2),
           width: Math.max(1, size * 0.075), fill: 'none', cap: 'round', opacity: 0.85 };
}

function numberRing(x, y, size, seed) {
  var r = rng.rngFrom(seed), steps = 30, d = '';
  var rx = size * 0.62, ry = size * 0.56, start = rng.range(r, 0, 6.28);
  for (var i = 0; i <= steps; i++) {
    var t = start + (i / steps) * 6.6;
    d += (i ? 'L' : 'M') + (x + Math.cos(t) * rx * (1 + jitter(r, 0.06))).toFixed(2) + ' ' +
         (y + Math.sin(t) * ry * (1 + jitter(r, 0.06))).toFixed(2);
  }
  return { d: d, width: Math.max(1, size * 0.06), fill: 'none', cap: 'round', opacity: 0.8 };
}

// A gap is not an error. It gets a light bracket in the margin, not a red box.
function gapBracket(box, seed) {
  var r = rng.rngFrom(seed);
  var x = box.x - box.h * 0.55, top = box.y + box.h * 0.1, bot = box.y + box.h * 0.95;
  return { d: 'M' + (x + box.h * 0.3).toFixed(2) + ' ' + top.toFixed(2) +
              'Q' + x.toFixed(2) + ' ' + ((top + bot) / 2).toFixed(2) +
              ' ' + (x + box.h * 0.3 + jitter(r, 1)).toFixed(2) + ' ' + bot.toFixed(2),
           width: Math.max(1, box.h * 0.05), fill: 'none', cap: 'round', opacity: 0.55 };
}

var BUILDERS = { circle: circle, underline: underline, highlight: highlight, strike: strike,
                 'colour-over': colourOver, 'rule-above': ruleAcross, 'rule-below': ruleAcross,
                 bulleted: bulletMark, numbered: numberRing, gap: gapBracket };

var API = Object.assign({ BUILDERS: BUILDERS }, BUILDERS);

export { BUILDERS, circle, underline, highlight, strike, colourOver as "colour-over", ruleAcross as "rule-above", ruleAcross as "rule-below", bulletMark as bulleted, numberRing as numbered, gapBracket as gap };
