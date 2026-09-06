// NOTE: `pretext(surface)` below is NOT `@chenglou/pretext`.
//
// It is a local function, named in round five when it became the single source
// of every measurement on a surface - measure, column share, display scale,
// banner height, bleed. The name collides with a documented dependency that
// this project does not have and has never installed. Someone will read an
// import list, see the name, and conclude the dependency is satisfied. It is
// not. `@chenglou/pretext` remains prose in the handbook and nothing more.
import * as R from "./rng.mjs";
import * as G from "./geometry.mjs";
import * as T from "./textlayout.mjs";
import * as C from "./collage.mjs";
import * as M from "./marks.mjs";
import * as P from "./paper.mjs";

// engine/layout.js - one composed surface, computed.
//
// Input: the capsule (blocks + intent), the fragment geometry, a surface, and a
// measurer. Output: a pure data model - lines with coordinates, placements with
// polygons, marks with path strings. No DOM is touched and no CSS is written
// here; the renderer only draws what this returns.
//
// Nothing in this file knows what a recipe is, and nothing in it is preset:
// every size below is a function of the space available and the amount of text.


var LEGIBILITY_FLOOR_PX = 13;   // on a screen: accessibility, not taste
var PRINT_FLOOR_PT = 12;        // on paper: nothing below 12pt, ever

// Widows and orphans are counted in lines, because that is how a reader meets
// them: one line of a paragraph stranded at the top of a sheet, or a heading
// left at the foot of one with its paragraph overleaf. Two is the smallest
// number that reads as a piece of text rather than as a stray.
var KEEP_LINES = 2;

// A printed surface knows its own paper size, so the engine can work in points
// where points are what matter. Without this a page is sized in pixels and
// checked against a threshold written in points, and 10.5pt passes a 12pt floor.
// `widthInches` comes from the caller; the fallback is the CSS reference density.
function pointScale(surface) {
  if (surface.kind !== 'print') return null;
  var declared = surface.dpi || (surface.widthInches ? surface.w / surface.widthInches : null);
  // The CSS reference density is a reasonable assumption and a bad silent one, so
  // the scale carries whether it was told or guessed and the validator says which.
  var dpi = declared || 96;
  return { dpi: dpi, pxPerPt: dpi / 72, floorPx: PRINT_FLOOR_PT * (dpi / 72),
           assumed: !declared };
}
function smooth(a, b, x) { var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

// --- pretext(): the continuous layout field --------------------------------
//
// One function, called once per surface, that answers every question the page
// asks about the space it is in. It is called pretext because it runs before any
// text exists: nothing in it knows what a block is, how many there are, or what
// the recording is about.
//
// The contract, and the reason this function exists rather than a set of cases:
//
//   NO BREAKPOINTS. Every value below is a smooth function of two measurements -
//   how much room there is across, and the shape of the space. There is no
//   width at which the page becomes a different page, so there is no width at
//   which it can look wrong. Portrait, landscape, a phone, a projector and a
//   sheet of A4 are the same composition evaluated at different arguments.
//
//   NO SURFACE KINDS. `surface.kind` does not appear here. A printed sheet is
//   not a special case, it is a surface whose physical size is known, and the
//   only thing that follows from physical size is reading distance, which is
//   itself continuous. The one hard branch in the whole engine is the 12pt print
//   floor, and that is a law about eyes and paper, not a layout preference.
//
// Anything a later pass needs to know about the space comes from here, so that
// adding a case to a page cannot quietly add a breakpoint to the engine.
function pretext(surface) {
  var w = surface.w, h = surface.h || surface.pageH || surface.w;
  var shortest = Math.min(w, h);
  var pad = Math.max(14, Math.min(shortest * 0.058, 74));
  var contentW = w - pad * 2;
  // How much room there is across, on a scale of a phone to a desktop.
  var wide = smooth(430, 960, contentW);
  // The shape of the space, on a scale of tall to wide.
  var aspect = w / Math.max(1, h);
  var landscape = smooth(0.85, 1.8, aspect);
  // How far away the surface is held. Physical inches where the caller declared
  // them; otherwise the CSS reference density, which is what a screen is.
  var inches = surface.widthInches || (w / (surface.dpi || 96));
  var armsLength = smooth(3.5, 8.5, inches);
  return {
    pad: pad, contentW: contentW, wide: wide, aspect: aspect, landscape: landscape,
    inches: inches, armsLength: armsLength,
    // The measure, in characters. Wider room and a surface held further away
    // both carry more of them; neither does so in a jump. At the ends this lands
    // where the old cased values did - about 35 characters in one hand, about 58
    // on a letter sheet, about 64 on a desktop - which is the point: the cases
    // were sampling this curve.
    targetChars: 34 + 20 * wide + 10 * armsLength,
    // The column's share of the content width, and where it sits in it.
    colShare: 1 - 0.34 * wide,
    colBias: 0.40,
    // Display type against body, and the rhythm between blocks.
    displayScale: 2.05 + 1.25 * wide,
    // The opening heap's height: a share of the surface, tempered by its shape,
    // and never taller than its own width allows.
    bannerHeightShare: 0.38 + 0.15 * landscape,
    bannerWidthShare: 0.28 + 0.20 / Math.max(0.6, aspect),
    // How far outside the column a cutout may lean. A declared physical surface
    // has a real edge and a real margin; a screen has neither.
    bleedShare: 0.35 + 0.65 * armsLength
  };
}

// A role may resolve to one face for the whole page, or to one face per script
// when no single family covers them - which is the ordinary case for a page whose
// transcript and chrome are in different writing systems.
function fontSpecs(capsule) {
  var byId = {}, out = {};
  (capsule.fonts || []).forEach(function (f) { byId[f.fontId] = f; });
  (capsule.compositions[0].intent.tokens.typeStack || []).forEach(function (t) {
    var f = byId[t.fontId];
    // The family comes from the registry. The generic keyword after it is a last
    // resort for a face that fails to load, and validate.js treats that as a
    // failed render rather than an acceptable outcome.
    var spec = { key: t.fontId, stack: f ? '"' + f.family + '", serif' : 'serif',
                 family: f ? f.family : null, weight: 400, missing: !f,
                 script: t.script || null, scriptsCovered: f ? f.scriptsCovered : [] };
    var slot = out[t.role];
    if (!slot) out[t.role] = spec;
    else if (t.script) { (slot.byScript = slot.byScript || {})[t.script] = spec; }
    if (t.script) { (out[t.role].byScript = out[t.role].byScript || {})[t.script] = spec; }
  });
  return out;
}

// The face a particular run is set in: its own script's face when the role has
// one, otherwise the role's face.
function specFor(spec, text) {
  if (!spec || !spec.byScript) return spec;
  var scripts = Object.keys(spec.byScript);
  for (var i = 0; i < scripts.length; i++) {
    var s = spec.byScript[scripts[i]];
    if ((s.scriptsCovered || []).length && matchesScript(text, scripts[i])) return s;
  }
  return spec;
}
var SCRIPT_TEST = {
  Cyrillic: /[\u0400-\u04FF]/, Latin: /[A-Za-z\u00C0-\u024F]/, Greek: /[\u0370-\u03FF]/,
  Arabic: /[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/, Hebrew: /[\u0590-\u05FF]/,
  Devanagari: /[\u0900-\u097F]/
};
function matchesScript(text, script) {
  var re = SCRIPT_TEST[script];
  return re ? re.test(String(text || '')) : false;
}

function composeSurface(input) {
  var capsule = input.capsule, surface = input.surface, measure = input.measure;
  var comp = capsule.compositions[0], intent = comp.intent;
  var tok = intent.tokens, seed = intent.scatterSeed;
  var mirror = !!input.mirror, rtl = !!input.rtl;
  var fonts = fontSpecs(capsule);
  var byId = input.fragmentsById || {};

  var P0 = pretext(surface);
  var pad = P0.pad;
  var contentW = P0.contentW;
  var wide = P0.wide;
  var colW = contentW * P0.colShare;
  var colX = pad + (contentW - colW) * (mirror ? 1 - P0.colBias - 0.02 : P0.colBias);
  // How far a scattered cutout may sit outside the text column. A sheet whose
  // physical size is known has a real edge and a real margin, and the field
  // tightens the allowance continuously as the surface becomes more paper-like.
  var bleedPad = pad * P0.bleedShare;
  var bleed = { x: bleedPad, y: 0, w: surface.w - bleedPad * 2, h: 0 };

  // Type scale from the family's own text: measure what she actually said.
  var sample = (capsule.blocks || []).map(function (b) { return b.text || ''; }).join(' ').slice(0, 600) || ' ';
  var advText = measure(sample, fonts.text) / T.REF / Math.max(1, sample.length);
  // The measure is set in characters, from the space available and how far away
  // that space is held - a sheet at arm's length carries more of them than a
  // phone in one hand. Both are read off pretext(), so neither is a case.
  var targetChars = P0.targetChars;
  var pt = pointScale(surface);
  // On paper the floor is physical, so it is the floor that wins and the measure
  // gives way - a sheet with fewer characters per line is right and a sheet
  // nobody can read is not.
  var floorPx = pt ? Math.max(LEGIBILITY_FLOOR_PX, pt.floorPx) : LEGIBILITY_FLOOR_PX;
  var body = Math.max(floorPx, colW / (targetChars * advText));
  var leadScale = (tok.rhythm && tok.rhythm.leadingScale) || 1.5;
  var lead = body * leadScale;
  var display = body * P0.displayScale;
  var spacingWord = (tok.rhythm && tok.rhythm.sectionSpacing) || 'even';
  var gapUnit = lead * (spacingWord === 'tight' ? 0.5 : spacingWord === 'generous' ? 1.15 : 0.78);

  var sizes = { body: body, lead: lead, display: display, section: body * 1.62,
                caption: pt ? Math.max(pt.floorPx, body * 0.82) : body * 0.82,
                gap: gapUnit, pad: pad, colX: colX, colW: colW, wide: wide,
                field: P0, point: pt };

  // Print sheets. A page break is a band no line may occupy.
  //
  // Two bands, in fact. `foot` is the strip at the bottom of every physical
  // sheet that the running foot occupies - a loose sheet has to be able to say
  // which recipe it belongs to and whether one is missing - and `gap` is the
  // break itself. Content lives in `h`, which is what is left. Without the foot
  // band the folio is printed on top of her last line, which is how a page that
  // paginates correctly still comes out of the printer wrong.
  var page = null;
  if (surface.kind === 'print') {
    var foot = Math.max(34, pad * 1.35);
    // `h` is the CONTENT band, and the band test is anchored at `top`: a line is
    // allowed while (y - top) + its height <= h. So the sheet's own top pad has
    // to come out of the band as well as the foot strip - otherwise the band is
    // licensed to run `top` pixels past the strip and the folio prints across
    // her last line. Reserved the foot and forgot the pad, once.
    // THE STRIDE IS THE SHEET. One physical sheet of paper is one stride of the
    // composed page, so the sheets tile it exactly and a window onto sheet i can
    // never show the first lines of sheet i+1. A stride shorter than the sheet
    // leaks: it looks correct on the sheets whose text stops early, and prints
    // the next sheet's opening lines across the folio on the ones that do not.
    //
    // What is left over inside the stride is the band no line may occupy: the
    // foot strip the folio sits in, plus the next sheet's own top pad.
    page = { sheetH: surface.pageH, stride: surface.pageH, foot: foot, top: pad,
             h: surface.pageH - foot - pad };
    page.gap = page.stride - page.h - page.top;
  }

  var banner = buildBanner(capsule, intent, byId, { x: pad, y: pad, w: contentW }, surface, sizes, seed, mirror,
                           fonts, measure, colX, colW, P0);
  // With photographs the words begin under the heap. Without them the title is
  // the opening: it sits on the torn ground itself, so the page starts with her
  // saying what this is instead of with an empty band.
  var flowTop = banner.typographic
    ? banner.box.y + gapUnit * 1.15
    : banner.box.y + banner.box.h + gapUnit * 1.35;

  // Pass A: where do the blocks fall with nothing in the way.
  var passA = flowBlocks(capsule, fonts, sizes, colX, colW, flowTop, [], page, measure, rtl, banner.titleMeasure);

  // The engine turns the skill's anchors into rectangles, now that it knows
  // where the anchored blocks are.
  // Pass B: the scatter, now that every block's y is known.
  //
  // A list's marker gutter is handed to the scatter as a rectangle to keep out
  // of. Without it the engine knows the column edge but not the gutter a
  // container reserved inside it, so a candidate is free to land there - and a
  // cutout in the gutter is a cutout drawn under her numerals.
  var reservedGutters = passA.items.filter(function (it) {
    return it.kind === 'container' && it.gutter && it.box.h > 0;
  }).map(function (it) {
    return { x: it.gutter.x - body * 0.3, y: it.box.y, w: it.gutter.w + body * 0.6, h: it.box.h };
  });
  var placements = C.scatter({
    briefs: intent.freeFragments || [], byId: byId, blockY: passA.blockY, seed: seed,
    surfaceW: surface.w, col: { x: colX, w: colW }, bleed: bleed,
    lead: sizes.lead, bodyBottom: passA.bottom, keepOut: reservedGutters,
    gutter: Math.max(6, body * 0.55), mirror: mirror
  }).filter(function (p) { return surface.kind !== 'print' || p.y < passA.bottom; });

  // Pass B: the same text, wrapped round the real contours.
  var passB = flowBlocks(capsule, fonts, sizes, colX, colW, flowTop, placements, page, measure, rtl, banner.titleMeasure);

  var built = buildMarks(passB, tok, seed);
  var legendRows = (capsule.legend || []).length
    ? Math.ceil((capsule.legend || []).length / Math.max(1, Math.floor(contentW / (sizes.caption * 22)))) : 0;
  var legendH = legendRows ? legendRows * sizes.caption * 1.7 + gapUnit * 1.4 : 0;
  var totalH = Math.max(passB.bottom + pad + legendH, banner.box.y + banner.box.h + pad);
  if (page) totalH = Math.ceil((passB.bottom + legendH - page.top) / page.stride + 0.0001) * page.stride + page.top;
  sizes.legendHeight = legendH;
  // Where the legend sits. On a screen it is the foot of one long sheet; on
  // paper the foot of the LAST sheet's content, because the band between two
  // sheets is not a place, and a legend printed into it is a legend the sheet
  // does not carry.
  if (page) {
    page.count = Math.max(1, Math.round((totalH - page.top) / page.stride));
    sizes.legendY = page.top + (page.count - 1) * page.stride + page.h - pad * 0.95;
  }
  var pagination = page ? auditSheets(passB, page, sizes, legendH) : null;

  return {
    surface: surface, sizes: sizes, fonts: fonts, tokens: tok, seed: seed, rtl: rtl, mirror: mirror,
    banner: banner, flow: passB.items, blockY: passB.blockY, placements: placements,
    marks: built, height: totalH, page: page, pagination: pagination,
    paperEdge: P.tornRect({ x: 0, y: 0, w: surface.w, h: totalH }, seed + '/sheet',
                          { amplitude: Math.max(2, surface.w * 0.004) })
  };
}

// What the sheets actually came out like, per sheet, after the keeps have run.
//
// This is not a validator. It is the record a printed edition needs and nobody
// can see by looking at a screen: how many sheets, what each one opens with, and
// the two things a keep cannot fix - a block taller than the paper, and a stray
// line that had nowhere better to go. `validate.js` turns those into findings;
// the renderer uses the openings for the running foot.
function auditSheets(pass, page, sizes, legendH) {
  var usable = page.h - page.top * 0.5;
  var sheets = [], strays = [], oversize = [], splits = [];
  function sheetOf(y) { return Math.max(0, Math.floor((y - page.top) / page.stride)); }
  for (var i = 0; i < page.count; i++) sheets.push({ index: i, opensWith: null, blockIds: [], lines: 0 });

  pass.items.forEach(function (it) {
    if (!it.box) return;
    var s = sheets[Math.min(sheets.length - 1, sheetOf(it.box.y))];
    if (s) {
      if (!s.opensWith && it.kind === 'text') s.opensWith = it.blockId;
      if (s.blockIds.indexOf(it.blockId) < 0) s.blockIds.push(it.blockId);
    }
    // Oversize is only a refusal for something that may not be cut. A list or a
    // story longer than the paper is not a failure - it breaks between its own
    // items, which is what the line rules are for, and calling that a refusal
    // would make every long recipe uncertifiable. A reserved block has no items
    // to break between: a player torn from its transcript, or a figure from its
    // caption, is a broken object.
    if (it.box.h > usable) {
      if (it.kind === 'reserved') {
        oversize.push({ blockId: it.blockId, type: it.type,
          overrunPx: Math.round(it.box.h - usable),
          because: 'This block is taller than one sheet of the declared paper and may not be cut, ' +
                   'so it cannot be kept whole. It starts at a sheet top and runs over.' });
      } else if (it.kind === 'container') {
        splits.push({ blockId: it.blockId, type: it.type,
          heightPx: Math.round(it.box.h), overPx: Math.round(it.box.h - usable),
          because: 'Longer than one sheet, so it breaks between its own items rather than being ' +
                   'kept whole. The break rules still hold inside it: no item is cut, and no ' +
                   'single item is left alone at a sheet edge.' });
      }
    }
    if (it.kind !== 'text' || !it.lines || it.lines.length <= KEEP_LINES) return;
    var last = sheetOf(it.lines[it.lines.length - 1].y);
    if (last === sheetOf(it.lines[0].y)) return;
    var n = 0;
    for (var k = it.lines.length - 1; k >= 0 && sheetOf(it.lines[k].y) === last; k--) n++;
    (sheets[Math.min(sheets.length - 1, last)] || {}).carriesTail = n;
    if (n < KEEP_LINES) strays.push({ blockId: it.blockId, lines: n, sheet: last,
      because: 'Three attempts to deal this paragraph lower still left ' + n +
               ' line overleaf; the sheet above has no room to take it back.' });
  });
  pass.items.forEach(function (it) {
    if (it.kind !== 'text' || !it.lines) return;
    var s = sheets[Math.min(sheets.length - 1, sheetOf(it.box.y))];
    if (s) s.lines += it.lines.length;
  });

  return { sheetCount: page.count, usableHeight: usable, keepLines: KEEP_LINES,
           sheets: sheets, strays: strays, oversize: oversize, splits: splits,
           legendOnSheet: page.count - 1, legendHeight: legendH,
           // A last sheet that carries the legend and nothing else is not an
           // empty sheet, it is a key - and saying which one it is stops a
           // reader of this record from filing a bug against a blank page.
           legendOnOwnSheet: legendH > 0 && !!sheets[page.count - 1] &&
                             !sheets[page.count - 1].blockIds.length };
}

function buildBanner(capsule, intent, byId, box, surface, sizes, seed, mirror, fonts, measure, colX, colW, field) {
  var cluster = (intent.clusters || []).filter(function (c) { return c.role === 'opening-banner'; })[0];
  var frags = cluster ? cluster.memberFragmentIds.map(function (id) { return byId[id]; }).filter(Boolean) : [];
  var titleBlock = (capsule.blocks || []).filter(function (b) { return b.type === 'title'; })[0];
  if (!frags.length) {
    // No photographs, which is completely ordinary and is what most families
    // get. The opening is then type, and it has to be composed as type: a tinted
    // rectangle with the heading inside it is a grey box, not a banner.
    //
    // Three moves, all of them free and none of them invented:
    //   - the title is set to its OWN measure, about three quarters of the
    //     column, so it rags into a shape instead of filling a band;
    //   - two torn sheets, the lower one offset and showing along two edges, so
    //     the opening has depth the way a scrap of paper on a scrap of paper does;
    //   - one torn rule under the title, at the width of its longest line, in the
    //     page's own accent.
    // Everything below is a function of the title's measured height.
    var measureW = Math.max(200, colW * 0.74);
    var titleTop = box.y + sizes.gap * 1.15;
    var titleH = sizes.display * 1.1, longest = measureW;
    if (titleBlock && measure) {
      var laid = T.layout(T.prepare(titleBlock.text || '', fonts.display || fonts.text, measure), {
        size: sizes.display, leading: 1.06, y: 0, minLine: sizes.display * 2,
        shapeFor: function () { return [[0, measureW]]; }
      });
      titleH = Math.max(sizes.display * 1.1, laid.bottom);
      longest = laid.lines.reduce(function (m, ln) { return Math.max(m, ln.used || 0); }, 0) || measureW;
    }
    var h = sizes.gap * 1.15 + titleH + sizes.gap * 1.75;
    var bx = { x: box.x, y: box.y, w: box.w, h: h };
    var amp = Math.max(3, box.w * 0.005);
    return {
      box: bx, items: [], typographic: true, coverage: 0,
      // The upper sheet, and the one showing beneath it.
      edge: P.tornRect(bx, seed + '/banner', { amplitude: amp }),
      under: {
        box: { x: bx.x + bx.w * 0.014, y: bx.y + h * 0.09, w: bx.w * 0.986, h: h * 0.95 },
        rot: -0.8
      },
      titleMeasure: measureW,
      rule: { x: colX, y: titleTop + titleH + sizes.gap * 0.62,
              w: Math.min(measureW, Math.max(longest, measureW * 0.42)) },
      title: titleBlock ? titleBlock.text : ''
    };
  }
  var h = Math.min(surface.h * field.bannerHeightShare, box.w * field.bannerWidthShare);
  var bbox = { x: box.x, y: box.y, w: box.w, h: h };
  var packed = C.packBanner({ fragments: frags, box: bbox, density: cluster.density, seed: seed,
                              // A sheet that declared its physical size has a real
                              // edge; a screen does not. That is a fact about the
                              // surface, not a kind of page.
                              allowBleed: !(surface.widthInches || surface.dpi) });
  if (mirror) packed.items.forEach(function (it) { it.x = bbox.x + bbox.w - (it.x - bbox.x) - it.w; it.rot = -it.rot; });
  return { box: bbox, items: packed.items, coverage: packed.coverage, typographic: false,
           kindsUsed: packed.kindsUsed, kindsAvailable: packed.kindsAvailable,
           edge: P.tornRect(bbox, seed + '/banner'), title: titleBlock ? titleBlock.text : '' };
}

// What a reserved block actually needs. The transcript attached to the player is
// her whole recording, so its height is measured with the same measurer the body
// text uses rather than assumed.
function mediaHeight(block, kind, fonts, sz, width, measure) {
  var pad = sz.body * 0.9, h = pad * 1.6;
  h += sz.caption * 1.6;                                    // the heading row
  var media = kind === 'media' ? block : (block.subPage && block.subPage.media);
  // On paper the player is gone. What is left of it is the heading row that is
  // already counted above - her label and the recording's length - and the
  // download link, whose address the print stylesheet reveals. Measuring the
  // screen player's height on a sheet it will not appear on is how the index
  // below it gets pushed onto sheet two of a five-sheet print.
  if (media && block.printRemnant) return h + sz.caption * 1.8 + pad * 0.6;
  if (media) {
    h += sz.body * 2.1 + sz.body * 0.5;                     // native controls
    h += sz.caption * 2.0 + sz.body * 0.5;                  // speed, volume, download
    if (media.chapters && media.chapters.length) h += sz.caption * 2.0 + sz.body * 0.5;
    h += sz.caption * 1.8;                                  // the transcript's own label
    var expanded = !media.transcript || media.transcript.expandedByDefault !== false;
    if (expanded && media.transcriptText) {
      var size = sz.body * 0.88, lead = size * 1.55;
      var laid = T.layout(T.prepare(media.transcriptText, fonts.text, measure), {
        size: size, leading: 1.55, y: 0, minLine: size * 6,
        shapeFor: function () { return [[0, Math.max(80, width - pad * 2)]]; }
      });
      h += laid.lines.length * lead + sz.body * 0.4;
    }
  }
  if (kind === 'addition' && block.subPage) {
    (block.subPage.blocks || []).forEach(function (sb) {
      if (!sb.text) return;
      var laid = T.layout(T.prepare(sb.text, fonts.text, measure), {
        size: sz.body * 0.95, leading: sz.lead / sz.body, y: 0, minLine: sz.body * 5,
        shapeFor: function () { return [[0, Math.max(80, width - pad * 2)]]; }
      });
      h += laid.lines.length * sz.body * 0.95 * (sz.lead / sz.body) + sz.body * 0.5;
    });
  }
  return h;
}

var TEXT_TYPES = { title: 'display', 'step-group': 'section', 'ingredient-group': 'section',
                   prose: 'text', 'instruction-line': 'text', 'ingredient-line': 'text',
                   'sensory-cue': 'text', 'household-measure': 'text', 'storage-note': 'text',
                   'family-aside': 'accent', warning: 'text', 'unresolved-note': 'text',
                   variation: 'text', caption: 'caption', 'transcript-quote': 'text',
                   'checklist-item': 'text', 'ordered-item': 'text', 'bullet-item': 'text',
                   'head-field': 'caption', 'head-line': 'caption',
                   'story-line': 'accent' };

// The containers. A list is a marker gutter and a set of leaves hung off it; a
// story is a narrower measure, looser leading and its own ground. Both are
// expressed as shares of what the surface gave, so they hold at any size.
var LIST_MARKER = { checklist: 'checkbox', 'ordered-list': 'number', 'bullet-list': 'bullet' };

// `editionRtl` is the edition's reading direction. It is a FALLBACK, not a
// setting: each block's direction comes from the script of its own text, so a
// mirrored edition cannot reorder her sentence and an unmirrored one cannot
// straighten an Arabic one. The collage still mirrors surface-wide - that is a
// physical arrangement and belongs to the reader, not to her words.
function flowBlocks(capsule, fonts, sz, colX, colW, top, placements, page, measure, editionRtl, titleMeasure) {
  var items = [], blockY = {}, y = top;
  var blocks = capsule.blocks || [];

  function shapeFor(x0, w, indent) {
    return function (yy, hh) {
      if (page) {
        var rel = yy - page.top, mod = ((rel % page.stride) + page.stride) % page.stride;
        if (mod + hh > page.h) return [];
      }
      var blockers = [];
      for (var i = 0; i < placements.length; i++) {
        var p = placements[i];
        if (p.y > yy + hh || p.y + p.h < yy) continue;
        var sp = G.bandSpan(p.poly, yy, hh);
        if (sp) blockers.push(sp);
      }
      return G.freeIntervals(x0 + indent, x0 + w, blockers);
    };
  }
  function advancePastBreak(yy, hh) {
    if (!page) return yy;
    var rel = yy - page.top, mod = ((rel % page.stride) + page.stride) % page.stride;
    return (mod + hh > page.h) ? yy + (page.stride - mod) : yy;
  }

  // --- keeps -----------------------------------------------------------------
  //
  // Everything below exists for one reader: the one who hits Ctrl+P. A screen
  // scrolls, so a break in the wrong place costs nothing and the engine can be
  // indifferent to where a line falls. Paper cannot be scrolled past: a heading
  // at the foot of a sheet is a heading for nothing, a single line at the top of
  // one is a line with no paragraph, and a numbered step cut in half is an
  // instruction the cook has to turn the sheet to finish. None of that is
  // visible on the surface the page was composed for, which is exactly why it
  // has to be handled here rather than left to the browser's default breaks.
  function sheetOf(yy) { return page ? Math.floor((yy - page.top) / page.stride) : 0; }
  function nextSheetTop(yy) { return page.top + (sheetOf(yy) + 1) * page.stride; }
  function usableSheet() { return page.h - page.top * 0.5; }

  // How many of a block's last lines are alone on the sheet they landed on.
  // Zero when the block did not cross a break at all.
  function strandedTail(lines) {
    if (!page || !lines.length) return 0;
    var last = sheetOf(lines[lines.length - 1].y);
    if (last === sheetOf(lines[0].y)) return 0;
    var n = 0;
    for (var i = lines.length - 1; i >= 0 && sheetOf(lines[i].y) === last; i--) n++;
    return n;
  }

  // A container is moved whole, which means moving text that has already been
  // wrapped round the photographs where it was. So the move is only allowed into
  // space no scattered piece is occupying - otherwise a keep would win the break
  // and lose the collage, and the page would print her words over a photograph.
  function clearToShift(from, dy) {
    var pad = sz.body * 0.5;
    for (var i = from; i < items.length; i++) {
      var b = items[i].box;
      if (!b || b.h <= 0) continue;
      for (var j = 0; j < placements.length; j++) {
        var p = placements[j];
        if (p.x < b.x + b.w + pad && p.x + p.w > b.x - pad &&
            p.y < b.y + dy + b.h && p.y + p.h > b.y + dy) return false;
      }
    }
    return true;
  }
  function shiftFrom(from, dy) {
    for (var i = from; i < items.length; i++) {
      var it = items[i];
      if (it.box) it.box.y += dy;
      if (it.marker) it.marker.y += dy;
      if (it.lines) it.lines.forEach(function (ln) { ln.y += dy; });
      if (it.blockId && blockY[it.blockId] != null) blockY[it.blockId] += dy;
    }
    y += dy;
  }
  // Keep a whole container on one sheet when one sheet can hold it. A list or a
  // story that is simply taller than the paper is not a keep failure, it is a
  // long list, and it breaks where the line rules say it may.
  function keepTogether(from, box, holeShare) {
    if (!page || box.h <= 0 || box.h > usableSheet()) return false;
    if (sheetOf(box.y) === sheetOf(box.y + box.h - 1)) return false;
    var dy = nextSheetTop(box.y) - box.y;
    // A keep leaves a hole the size of what it moved past, and a keep is only
    // worth having if that hole is smaller than the break it prevented. Past
    // roughly a quarter of the sheet the cook is turning a mostly-blank page,
    // which is worse than a list that carries on overleaf.
    //
    // The index is the one container that is worth a bigger hole. It is a way in
    // rather than part of the recipe, it lands on the first sheet directly under
    // a banner that has already taken most of it, and an index the reader has to
    // turn the sheet to finish reading is the one thing it exists not to be. So
    // its caller asks for a larger allowance, and the rule stays a rule.
    if (dy > page.h * (holeShare != null ? holeShare : 0.28)) return false;
    if (!clearToShift(from, dy)) return false;
    shiftFrom(from, dy);
    return true;
  }

  function emit(block, depth, ctx) {
    ctx = ctx || {};
    var indent = depth * sz.body * 1.6 + (ctx.inset || 0);
    var role = TEXT_TYPES[block.type] || 'text';
    var kind = block.type;
    blockY[block.blockId] = y;

    if (kind === 'divider') {
      y = advancePastBreak(y, sz.gap * 1.4);
      items.push({ blockId: block.blockId, type: kind, kind: 'rule', depth: depth,
                   box: { x: colX + indent, y: y + sz.gap * 0.5, w: colW - indent, h: 2 } });
      blockY[block.blockId] = y; y += sz.gap * 1.6; return;
    }

    // A list: one marker gutter, one leaf per item, and a container rectangle
    // round the lot so it can be moved and selected as the one thing it is.
    //
    // THE GUTTER IS THE CONTAINER'S, NOT THE ITEM'S. Its x is computed once here,
    // from the container's own left edge, and handed to every child. Letting each
    // numeral follow its item's first line looks correct until a cutout pushes
    // one line inward: the numeral is dragged 200-odd pixels with it, a single
    // sequence ends up with its numbers in two columns, and the ones that moved
    // are drawn on top of the photograph they were moved to avoid. A relative
    // filling a cookbook by hand keeps a list's numbers in one gutter for the
    // whole list.
    if (LIST_MARKER[kind]) {
      var marker = LIST_MARKER[kind];
      y += sz.gap * (kind === 'checklist' ? 1.05 : 0.85);
      var listTop = y, gutter = sz.body * (marker === 'number' ? 1.9 : 1.6);
      var gutterX = colX + indent;
      var container = { blockId: block.blockId, type: kind, kind: 'container', containerOf: 'list',
                       // `markerKind`, not `marker`: an item's `marker` is an
                       // object with a position, and one field name meaning two
                       // shapes is how a reader of this model gets `undefined.x`.
                       markerKind: marker, depth: depth, block: block,
                       gutter: { x: gutterX, w: gutter },
                       box: { x: gutterX, y: listTop, w: colW - indent, h: 0 } };
      items.push(container);
      (block.children || []).forEach(function (c, ci) {
        emit(c, depth, { gutter: gutter, gutterX: gutterX, inset: ctx.inset || 0,
                         marker: { kind: marker, index: ci + 1 },
                         itemGap: sz.body * (kind === 'checklist' ? 0.5 : 0.42),
                         measure: colW - indent - gutter });
      });
      container.box.h = Math.max(0, y - listTop);
      // A sequence the cook is meant to follow is one object: eight steps split
      // 7/1 across a break is worse than eight steps starting overleaf.
      if (keepTogether(items.indexOf(container), container.box)) listTop = container.box.y;
      blockY[block.blockId] = listTop;
      y += sz.gap * 0.9;
      return;
    }

    // The index at the head of the recipe. It is a container for the same reason
    // a story is: it moves as one thing, it is set on its own ground, and it
    // carries no text of its own. Its children are set to its measure, and the
    // gap before a register label is larger than the gap between the lines under
    // it, so three registers read as three registers rather than as a list of
    // fifteen things.
    if (kind === 'recipe-head') {
      y += sz.gap * 1.2;
      var headTop = y, hpad = sz.body * 0.95;
      y += hpad;
      var hc = { blockId: block.blockId, type: kind, kind: 'container', containerOf: 'head',
                 depth: depth, block: block, ground: 0.032,
                 box: { x: colX + indent, y: headTop, w: colW - indent, h: 0 } };
      items.push(hc);
      var innerW = colW - indent - hpad * 2, colGap = sz.body * 1.1;
      // A register is set in columns, because twelve two-word measures down one
      // full measure is a column of ragged holes and, on A4, an index 36px taller
      // than the paper. How many columns is read off the TEXT and the layout
      // field, never off the surface: how many of the register's own longest line
      // fit across the measure pretext() gave, capped at three because a fourth
      // column of a spoken recipe's measures is a column of one.
      var kids = block.children || [], ki = 0, firstReg = true;
      var regFrom = items.length, regTop = y;
      while (ki < kids.length) {
        if (kids[ki].type !== 'head-line') {
          regFrom = items.length; regTop = y;
          emit(kids[ki], depth, { inset: (ctx.inset || 0) + hpad, measure: innerW,
                                  itemGap: sz.body * (firstReg ? 0.1 : 1.05) });
          firstReg = false; ki++; continue;
        }
        var group = [];
        while (ki < kids.length && kids[ki].type === 'head-line') { group.push(kids[ki]); ki++; }
        var longest = 1;
        group.forEach(function (c) { longest = Math.max(longest, (c.text || '').length); });
        var across = (sz.field && sz.field.targetChars) ? sz.field.targetChars * (sz.body / sz.caption) : longest;
        var cols = Math.max(1, Math.min(3, Math.floor(across / (longest * 1.15))));
        cols = Math.min(cols, group.length);
        // And a column may not be narrower than a line of type needs to exist in.
        // T.layout refuses a line under six characters of its own size, so three
        // columns of two-word measures on a phone produced four blocks with no
        // lines at all rather than a three-column index.
        var minCol = sz.caption * 7;
        while (cols > 1 && (innerW - colGap * (cols - 1)) / cols < minCol) cols--;
        var subW = (innerW - colGap * (cols - 1)) / cols;
        var groupTop = y, maxY = y, per = Math.ceil(group.length / cols);
        for (var cc = 0; cc < cols; cc++) {
          var slice = group.slice(cc * per, (cc + 1) * per);
          if (!slice.length) continue;
          y = groupTop;
          slice.forEach(function (c) {
            emit(c, depth, { inset: (ctx.inset || 0) + hpad + cc * (subW + colGap),
                             measure: subW, itemGap: sz.caption * 0.34,
                             leadingScale: 0.96 });
          });
          maxY = Math.max(maxY, y);
        }
        y = maxY;
        // A REGISTER is the thing that is kept whole, not the whole index. On a
        // first sheet whose banner has already taken most of the paper, an index
        // and a banner cannot both fit, and moving the index whole leaves a sheet
        // with a title on it and nothing else. A register travelling with its own
        // label is how a printed index behaves: it breaks between its parts, never
        // through one.
        if (keepTogether(regFrom, { y: regTop, h: y - regTop })) { }
      }
      y += hpad;
      hc.box.h = Math.max(0, y - headTop);
      // The index breaks between registers and never through one, which the
      // per-register keeps above have already seen to. The container itself is
      // moved whole only when that costs the reader little: past about a third of
      // a sheet the hole is worse than the break.
      if (keepTogether(items.indexOf(hc), hc.box, 0.3)) headTop = hc.box.y;
      blockY[block.blockId] = headTop;
      y += sz.gap * 1.4;
      return;
    }

    // A story: her own paper inside the page. The shares come from the skill's
    // presentation intent, which is why a story looks the same on a phone and on
    // a sheet without either being a special case.
    if (kind === 'story') {
      var pr = block.presentation || {};
      var inset = (colW - indent) * (pr.indentShare != null ? pr.indentShare : 0.06);
      var storyMeasure = (colW - indent - inset) * (pr.measureShare != null ? pr.measureShare : 0.84);
      y += sz.gap * 1.5;
      var storyTop = y;
      var storyPad = sz.body * 0.85;
      y += storyPad;
      var sc = { blockId: block.blockId, type: kind, kind: 'container', containerOf: 'story',
                 storyKind: block.storyKind || null, depth: depth, block: block,
                 ground: pr.groundTint != null ? pr.groundTint : 0.042,
                 openingRule: pr.openingRule !== false,
                 box: { x: colX + indent + inset, y: storyTop, w: colW - indent - inset, h: 0 } };
      items.push(sc);
      (block.children || []).forEach(function (c, ci) {
        emit(c, depth, { inset: inset + storyPad, measure: storyMeasure - storyPad * 2,
                         leadingScale: pr.leadingScale != null ? pr.leadingScale : 1.16,
                         itemGap: sz.body * 0.35, story: true, first: ci === 0 });
      });
      y += storyPad;
      sc.box.h = Math.max(0, y - storyTop);
      // A story is set on its own paper. Half a sheet of paper at the foot of a
      // page is a printing accident, not an aside.
      if (keepTogether(items.indexOf(sc), sc.box)) storyTop = sc.box.y;
      blockY[block.blockId] = storyTop;
      y += sz.gap * 1.5;
      return;
    }

    if (kind === 'media' || kind === 'voice-chapter' || kind === 'clarification-note' ||
        kind === 'artifact-figure' || kind === 'addition') {
      var h = block.reservedHeight != null ? block.reservedHeight
            : mediaHeight(block, kind, fonts, sz, colW - indent, measure);
      // A reserved block is a single object - a player with its transcript, a
      // figure with its caption - and it is never cut. If it is taller than the
      // paper it starts at a sheet top and overruns, which the audit reports.
      y = advancePastBreak(y, Math.min(h + sz.gap, page ? usableSheet() : h + sz.gap));
      blockY[block.blockId] = y;
      items.push({ blockId: block.blockId, type: kind, kind: 'reserved', depth: depth, block: block,
                   box: { x: colX + indent, y: y, w: colW - indent, h: h } });
      y += h + sz.gap * 1.2;
      (block.children || []).forEach(function (c) { emit(c, depth + 1); });
      return;
    }

    var size = role === 'display' ? sz.display : role === 'section' ? sz.section
             : role === 'caption' ? sz.caption : sz.body;
    var roleSpec = fonts[role === 'display' ? 'display' : role === 'section' ? 'display'
                       : role === 'accent' ? 'accent' : role === 'caption' ? 'caption' : 'text'] || fonts.text;
    var spec = specFor(roleSpec, block.text);
    var leading = size * (role === 'display' ? 1.06 : role === 'section' ? 1.2 : sz.lead / sz.body)
                * (ctx.leadingScale || 1);
    var before = ctx.itemGap != null ? ctx.itemGap
               : kind === 'step-group' || kind === 'ingredient-group' ? sz.gap * 1.5
               : kind === 'title' ? 0 : kind === 'family-aside' ? sz.gap * 1.1 : sz.gap * 0.42;
    y += before;
    // Keep-with-next. A section heading asks for its own line plus the first two
    // lines of what it introduces; if that does not fit, the heading goes over
    // with them. On a screen this reads as an ordinary gap and costs nothing.
    var keepAhead = (page && (role === 'display' || role === 'section'))
      ? leading + sz.lead * KEEP_LINES : leading;
    y = advancePastBreak(y, Math.min(keepAhead, page ? usableSheet() : keepAhead));
    blockY[block.blockId] = y;
    var prepared = T.prepare(block.text || '', spec, measure);
    // A typographic opening sets the title to its own measure, so it rags into a
    // shape rather than filling the column edge to edge. A list item and a story
    // line are set to the measure their container gave them.
    var gut = ctx.gutter || 0;
    var x0 = colX + indent + gut;
    var ownW = ctx.measure != null ? ctx.measure
             : (kind === 'title' && titleMeasure) ? Math.min(titleMeasure, colW - indent) : colW - indent;
    var blockRtl = T.directionOf(block.text, editionRtl ? 'rtl' : 'ltr') === 'rtl';
    function layoutAt(yy) {
      return T.layout(prepared, { size: size, leading: leading / size, y: yy,
                                    shapeFor: shapeFor(x0, ownW, 0),
                                    // What counts as a usable line depends on how
                                    // big the type is. Six characters of body text
                                    // is a line; six characters of display type is
                                    // most of a column, and demanding it is how a
                                    // one-word title set to its own measure ends up
                                    // producing no lines at all. The banner measures
                                    // the title at two, so the flow does too.
                                    minLine: size * (role === 'display' ? 2 : 6), rtl: blockRtl });
    }
    var laid = layoutAt(y);
    // Orphan control. A paragraph that leaves one line at the foot of a sheet
    // and continues overleaf is worse than a paragraph that starts overleaf, so
    // it goes over whole - and it is re-laid there, for the same reason the
    // widow fix is.
    if (page && laid.lines.length > KEEP_LINES) {
      var headLines = 0, s0 = sheetOf(laid.lines[0].y);
      for (var q = 0; q < laid.lines.length && sheetOf(laid.lines[q].y) === s0; q++) headLines++;
      if (headLines < laid.lines.length && headLines < KEEP_LINES) {
        var over = nextSheetTop(laid.lines[0].y);
        var altO = layoutAt(over);
        if (altO.lines.length) { y = over; laid = altO; }
      }
    }
    // Widow control. The paragraph is dealt one line lower until its tail has a
    // companion overleaf - and it is RE-LAID at the new position rather than
    // nudged down, so it wraps round the photographs that are actually there
    // instead of carrying its old wrap onto a sheet where the contours differ.
    if (page && laid.lines.length > KEEP_LINES) {
      for (var t = 0; t < 3; t++) {
        var tail = strandedTail(laid.lines);
        if (!tail || tail >= KEEP_LINES) break;
        var yy = advancePastBreak(y + (KEEP_LINES - tail) * leading, leading);
        var alt = layoutAt(yy);
        if (!alt.lines.length) break;
        y = yy; laid = alt;
      }
    }
    // A marker sits in its LIST'S gutter, at its item's first baseline. The
    // vertical follows the line - a wrapped first line still starts where the
    // numeral should sit - but the horizontal is the container's, so the column
    // holds for the whole list however the text round it moves.
    var firstLine = laid.lines[0];
    var markerX = (ctx.gutterX != null ? ctx.gutterX : x0 - gut);
    var markerY = firstLine ? firstLine.y : y;
    items.push({ blockId: block.blockId, type: kind, kind: 'text', role: role, depth: depth,
                 size: size, spec: spec, lines: laid.lines, block: block, rtl: blockRtl,
                 story: !!ctx.story, firstOfStory: !!ctx.first,
                 marker: ctx.marker ? { kind: ctx.marker.kind, index: ctx.marker.index,
                                        x: markerX, w: gut, y: markerY, h: leading } : null,
                 box: { x: x0, y: y, w: ownW, h: laid.bottom - y } });
    y = laid.bottom;
    (block.children || []).forEach(function (c) { emit(c, depth + 1); });
  }

  blocks.forEach(function (b) { emit(b, 0); });
  return { items: items, blockY: blockY, bottom: y };
}

function buildMarks(pass, tok, seed) {
  var out = [];
  var accents = (tok.palette.accents || []);
  pass.items.forEach(function (it) {
    if (it.kind !== 'text' || !it.block.marks) return;
    var laid = { lines: it.lines };
    it.block.marks.forEach(function (mk, mi) {
      var boxes = T.spanBoxes(laid, mk.start, mk.end, it.size);
      // Marks that are ONE gesture have to survive a line break as one gesture.
      //
      // A rule is a single stroke for the whole block: the span covers the
      // block's text, so it crosses every line it occupies, and drawing per box
      // puts a line through the middle of her sentence.
      if ((mk.type === 'rule-above' || mk.type === 'rule-below') && boxes.length > 1) {
        boxes = [mk.type === 'rule-above' ? boxes[0] : boxes[boxes.length - 1]];
      }
      // A circle is one loop, on one line, round one quantity.
      //
      // A wrapped span cannot be enclosed. Its boxes are the tail of one line and
      // the head of the next, so anything that encloses both spans nearly the
      // whole measure and reads as circling the paragraph - which is a worse lie
      // than two bubbles. The loop therefore goes round the box that holds most of
      // the span, and the rest of it goes unmarked. An unwrapped span has one box
      // and is unaffected.
      if (mk.type === 'circle' && boxes.length > 1) {
        boxes = [boxes.slice().sort(function (a, b) { return b.w - a.w; })[0]];
      }
      // A gap is one bracket in the margin beside the sentence, so it takes the
      // first line and not one bracket per line.
      if (mk.type === 'gap' && boxes.length > 1) boxes = [boxes[0]];
      // highlight, colour-over and strike stay per line, because that is how a
      // highlighter and a struck line actually behave across a line break.
      var role = mk.note && mk.note.indexOf('role:') === 0 ? mk.note.slice(5) : 'accent-0';
      var colour = role === 'ink' ? tok.palette.ink
                 : accents[parseInt(role.split('-')[1] || '0', 10) % Math.max(1, accents.length)] || tok.palette.ink;
      boxes.forEach(function (bx, bi) {
        var s = seed + '/' + it.blockId + '/' + mi + '/' + bi;
        var builder = M.BUILDERS[mk.type];
        if (!builder) return;
        var shape = mk.type === 'underline' ? builder(bx, s, mk.style || 'solid')
                  : mk.type === 'rule-above' ? builder({ x: bx.x, y: it.box.y - it.size * 0.42, w: it.box.w, h: 2 }, s)
                  : mk.type === 'rule-below' ? builder({ x: bx.x, y: bx.y + bx.h * 1.02, w: it.box.w, h: 2 }, s)
                  : mk.type === 'numbered' || mk.type === 'bulleted'
                    ? builder(bx.x - it.size * 1.15, bx.y + bx.h * 0.5, it.size, s)
                    : builder(bx, s);
        out.push({ blockId: it.blockId, type: mk.type, note: mk.note, shape: shape,
                   colour: colour, box: bx, label: mk.label || null });
      });
    });
  });
  return out;
}

var API = { composeSurface: composeSurface, LEGIBILITY_FLOOR_PX: LEGIBILITY_FLOOR_PX };

export { composeSurface, LEGIBILITY_FLOOR_PX };
