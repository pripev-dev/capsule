import * as rng from "./rng.mjs";
import * as geo from "./geometry.mjs";

// engine/collage.js - the banner heap and the body scatter.
//
// The skill says which fragments, how dense, and with what seed. This file
// decides where. It never reads a label and never chooses a fragment.
//
// The banner is arranged by coverage, not by a row formula: an occupancy grid
// records what is still empty and each new piece is aimed at the emptiest cell.
// Every selected fragment is a physical editorial choice and appears once. A
// sparse selection leaves visible paper instead of manufacturing copies of a
// family image.
//
// TWO THINGS THIS FILE IS RESPONSIBLE FOR NOT DOING.
//
// It must not turn one kind into wallpaper. The deck is drawn by weight and a
// seeded tie break, and every member is exhausted after one placement.
//
// And the body scatter must be random where it says it is random. An anchor
// block with a left/right formula is not a scatter, it is a two-column figure
// layout: every piece lands at the same offset from the same edge, and a piece
// with no matching block lands dead centre over her sentences. A scatter is a
// sampled position - candidates drawn from the seeded stream across the band the
// piece belongs to, scored against what is already on the page, best one kept.
// The one thing no candidate may be is centred in the text column: a cutout
// belongs on an edge, leaning in, the way one lies on a real page.


var WEIGHT_AREA = { heavy: 1.3, medium: 1.0, light: 0.76 };

function packBanner(opts) {
  var frags = opts.fragments, box = opts.box, density = opts.density;
  if (!frags.length) return { items: [], coverage: 0 };
  var r = rng.stream(opts.seed, 'banner');
  if (frags.length === 1) {
    // The grid's first empty cell is its top-left corner. With one piece there
    // is no later placement to balance it. Centre the source, fitting its
    // rotated envelope so none of the photograph is lost at a paper edge.
    var f = frags[0], aspect = Math.max(0.01, f.aspect || 1);
    var rot = rng.range(r, -2.5, 2.5), angle = Math.abs(rot) * Math.PI / 180;
    var h = Math.min(box.w * 0.92 / (aspect * Math.cos(angle) + Math.sin(angle)),
                     box.h * 0.92 / (Math.cos(angle) + aspect * Math.sin(angle)));
    var w = h * aspect;
    return { items: [{ fragmentId: f.id, src: f.src,
      x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2,
      w: w, h: h, rot: rot, z: 0, weight: f.weight, mode: f.mode, label: f.label }],
      coverage: w * h * (f.fill || 1) / (box.w * box.h),
      kindsUsed: 1, kindsAvailable: 1, timesUsed: { [f.id]: 1 }, perKindCap: 1 };
  }
  var GX = 7, GY = 5, grid = new Float64Array(GX * GY);
  // Density changes the scale, overlap and rotation of the selected pieces. It
  // never changes their count: repeating an approved fragment turns a collage
  // into wallpaper and overstates the family's source material.
  var target = 0.62 + density * 0.75;
  // How much of its own box each cutout actually covers. A string of sweets on
  // a transparent ground fills a third of its rectangle; counting the whole
  // rectangle as paper left a heap of them full of holes. A fragment that does
  // not say is taken as solid, so older capsules pack exactly as before.
  var fillOf = function (f) { return f.fill > 0 && f.fill <= 1 ? Math.max(0.25, f.fill) : 1; };
  var maxItems = frags.length;
  // Size the unique pieces by their actual visible contribution. A sparse motif
  // receives a larger box than a solid photograph, while a heavy piece carries
  // more of the composition than a light accent.
  var capacity = frags.reduce(function (sum, f) {
    var weight = WEIGHT_AREA[f.weight] || 1;
    return sum + fillOf(f) * weight * weight;
  }, 0);
  var baseArea = box.w * box.h * target / Math.max(0.2, capacity);
  var items = [], guard = 0;

  // Heaviest first so the light pieces land on top of them. Equal weights keep
  // a seeded tie break so two capsules do not settle into the same composition.
  var deck = frags.slice().sort(function (a, b) { return wRank(b) - wRank(a); });
  var timesUsed = {};
  deck.forEach(function (f) { timesUsed[f.id] = 0; });
  var perKindCap = 1;

  function drawNext() {
    var eligible = deck.filter(function (f) { return timesUsed[f.id] < perKindCap; });
    if (!eligible.length) return null;
    var least = Infinity;
    eligible.forEach(function (f) { if (timesUsed[f.id] < least) least = timesUsed[f.id]; });
    var pool = eligible.filter(function (f) { return timesUsed[f.id] === least; });
    var topRank = pool.reduce(function (m, f) { return Math.max(m, wRank(f)); }, 0);
    var heavy = pool.filter(function (f) { return wRank(f) === topRank; });
    return heavy[Math.floor(r() * heavy.length) % heavy.length];
  }

  while (items.length < maxItems && guard++ < 900) {
    var minIdx = 0;
    for (var g = 1; g < grid.length; g++) if (grid[g] < grid[minIdx]) minIdx = g;
    var gx = minIdx % GX, gy = Math.floor(minIdx / GX);
    var f = drawNext();
    if (!f) break;
    timesUsed[f.id]++;
    var wRel = WEIGHT_AREA[f.weight] || 1;
    var h = Math.sqrt(baseArea * wRel * wRel / Math.max(0.2, f.aspect))
            * rng.range(r, 0.84, 1.2);
    h = Math.max(box.h * 0.13, Math.min(box.h * 0.98, h));
    var w = h * f.aspect;
    // A very wide cutout is scaled to the rectangle rather than allowed past it.
    var wMax = box.w * (opts.allowBleed === false ? 0.94 : 1.08);
    if (w > wMax) { w = wMax; h = w / f.aspect; }
    var cx = box.x + box.w * ((gx + rng.range(r, 0.12, 0.88)) / GX);
    var cy = box.y + box.h * ((gy + rng.range(r, 0.12, 0.88)) / GY);
    var rot = rng.range(r, -1, 1) * (7 + density * 13);
    // A cutout may lean off the edge on a screen, but only by a little. A
    // printed sheet has a real edge, and nothing is allowed past it.
    var bleed = opts.allowBleed === false ? 0 : Math.min(box.w, box.h) * 0.018;
    var x = Math.max(box.x - bleed, Math.min(cx - w / 2, box.x + box.w - w + bleed));
    var y = Math.max(box.y - bleed, Math.min(cy - h / 2, box.y + box.h - h + bleed));
    var item = { fragmentId: f.id, src: f.src, x: x, y: y, w: w, h: h,
                 rot: rot, z: items.length, weight: f.weight, mode: f.mode, label: f.label };
    items.push(item);
    stamp(grid, GX, GY, box, item, fillOf(f));
  }
  var cov = 0; for (var i = 0; i < grid.length; i++) cov += Math.min(1, grid[i]);
  var kinds = Object.keys(timesUsed).filter(function (k) { return timesUsed[k] > 0; });
  return { items: items, coverage: cov / grid.length, cellCoverage: Array.from(grid),
           kindsUsed: kinds.length, kindsAvailable: deck.length, timesUsed: timesUsed,
           perKindCap: perKindCap };
}

function wRank(f) { return f.weight === 'heavy' ? 3 : f.weight === 'medium' ? 2 : 1; }

function stamp(grid, GX, GY, box, it, fill) {
  var cw = box.w / GX, ch = box.h / GY;
  for (var gy = 0; gy < GY; gy++) for (var gx = 0; gx < GX; gx++) {
    var cell = { x: box.x + gx * cw, y: box.y + gy * ch, w: cw, h: ch };
    var a = geo.rectsOverlapArea(cell, it);
    if (a > 0) grid[gy * GX + gx] += a / (cw * ch) * (fill || 1);
  }
}

// Supporting fragments in the body.
//
// The skill gives each piece an anchor block, a band to live in, a scale range
// and a zone policy. The engine samples positions: several candidates from the
// piece's own seeded stream, each scored, the best kept. Same seed, same page;
// different seed, a genuinely different arrangement.
//
// Every candidate straddles an edge of the text column - it leans in from the
// left margin or the right, and a heavy piece with a contour may lean further.
// None of them is centred in the column, because a cutout dropped in the middle
// of a paragraph is the one arrangement that reads as a mistake rather than as a
// page someone made. And no candidate lands in a marker gutter a list container
// reserved (`opts.keepOut`): a list keeps one gutter for all its items, so a
// numeral cannot step aside for a photograph the way a line of text can.
var CANDIDATES = 16;

function zonesFor(brief) {
  var deep = brief.wrapPriority === 'contour';
  var z = [
    { id: 'lean-left',  side: 'left',  reach: [0.45, 0.95] },
    { id: 'lean-right', side: 'right', reach: [0.05, 0.55] }
  ];
  if (deep) {
    z.push({ id: 'bite-left',  side: 'left',  reach: [0.16, 0.42] });
    z.push({ id: 'bite-right', side: 'right', reach: [0.58, 0.86] });
  }
  return z;
}

function scatter(opts) {
  var out = [], gutter = opts.gutter, col = opts.col;
  var bandFloor = opts.bodyBottom != null ? opts.bodyBottom : Infinity;
  for (var i = 0; i < opts.briefs.length; i++) {
    var b = opts.briefs[i], f = opts.byId[b.fragmentId];
    if (!f) continue;
    var anchorY = opts.blockY[b.anchor.blockId];
    if (anchorY == null) continue;
    var r = rng.stream(opts.seed, 'scatter/' + b.placementId);
    var w = opts.surfaceW * rng.range(r, b.scaleRange.min, b.scaleRange.max);
    var h = w / f.aspect;
    // The band: from a little above the block it belongs to, down as far as the
    // skill said its reach extends, and never past the end of the body.
    var reach = (b.band && b.band.sentences ? b.band.sentences : 3) * (opts.lead || h * 0.4);
    var top = anchorY - (opts.lead || 0) * 0.6;
    var bottom = Math.min(bandFloor - h * 0.5, anchorY + reach);
    if (!(bottom > top)) bottom = top + Math.max(8, (opts.lead || 12));
    var zones = zonesFor(b);
    var best = null;
    for (var c = 0; c < CANDIDATES; c++) {
      var z = zones[Math.floor(r() * zones.length) % zones.length];
      var side = z.side;
      if (opts.mirror) side = side === 'left' ? 'right' : 'left';
      var x = side === 'left'
        ? col.x - w * rng.range(r, z.reach[0], z.reach[1])
        : col.x + col.w - w * rng.range(r, z.reach[0], z.reach[1]);
      var y = rng.range(r, top, bottom);
      x = Math.max(opts.bleed.x, Math.min(x, opts.bleed.x + opts.bleed.w - w));
      var rect = { x: x, y: y, w: w, h: h };
      // Score: far from everything already placed, and not stacked on the very
      // top of the band with everything else.
      var worst = Infinity, overlap = 0;
      for (var p = 0; p < out.length; p++) {
        var o = out[p];
        var d = Math.hypot((x + w / 2) - (o.x + o.w / 2), (y + h / 2) - (o.y + o.h / 2));
        var norm = d / Math.max(1, Math.min(w, h));
        if (norm < worst) worst = norm;
        var ov = geo.rectsOverlapArea(rect, o);
        overlap = Math.max(overlap, ov / Math.max(1, Math.min(w * h, o.w * o.h)));
      }
      if (overlap > 0.2) continue;                 // the validator refuses 0.55; this is well clear
      // A marker gutter a list container reserved is not free space. A cutout
      // there is a cutout drawn under her numerals, and the numerals cannot move
      // out of the way, because a list keeps one gutter for all its items.
      var inGutter = 0;
      for (var k = 0; k < (opts.keepOut || []).length; k++)
        inGutter += geo.rectsOverlapArea(rect, opts.keepOut[k]);
      if (inGutter > w * h * 0.06) continue;
      var score = (out.length ? Math.min(worst, 6) : 6) - overlap * 8;
      if (!best || score > best.score) best = { score: score, rect: rect, zone: z.id, side: side };
    }
    if (!best) continue;
    // The contract names it rotationRangeDegrees; the prototype's in-memory
    // brief called it rotation. Reading only the latter crashed every real
    // capsule with a free fragment.
    var turn = b.rotationRangeDegrees || b.rotation || { min: -6, max: 6 };
    var rot = rng.range(r, turn.min, turn.max) * (opts.mirror ? -1 : 1);
    out.push({ placementId: b.placementId, fragmentId: b.fragmentId, src: f.src,
               x: best.rect.x, y: best.rect.y, w: best.rect.w, h: best.rect.h,
               rot: rot, zone: best.zone, side: best.side,
               wrapPriority: b.wrapPriority, layerHint: b.layerHint, label: f.label,
               poly: geo.inflate(geo.placePoly(f.contour, best.rect, rot), gutter) });
  }
  return out;
}

var API = { packBanner: packBanner, scatter: scatter };

export { packBanner, scatter };
