/**
 * The engine's arithmetic, tested where it has no opinions.
 *
 * These are the properties the composer relies on and cannot see failing: the
 * same seed producing the same page, colour round-tripping through OKLCH, a
 * scanline finding the gaps a photograph leaves, a heap that fills whether it is
 * given one piece or thirty-two. None of it knows what a recipe is.
 *
 * The surface-level behaviour - keeps, refusals, pagination - is exercised in
 * engine-surface.test.mjs, which has to compose a real surface to reach it.
 */
import test from "node:test";
import assert from "node:assert/strict";

import * as rng from "../src/engine/rng.mjs";
import * as colour from "../src/engine/colour.mjs";
import * as geometry from "../src/engine/geometry.mjs";
import * as textlayout from "../src/engine/textlayout.mjs";
import * as paper from "../src/engine/paper.mjs";
import * as collage from "../src/engine/collage.mjs";
import * as marks from "../src/engine/marks.mjs";

// --- rng ---------------------------------------------------------------------

test("a seed determines the whole stream, and two seeds do not collide", () => {
  const a = rng.rngFrom("layered-cake");
  const b = rng.rngFrom("layered-cake");
  const first = Array.from({ length: 24 }, () => a());
  const second = Array.from({ length: 24 }, () => b());
  assert.deepEqual(first, second);
  assert.equal(first.every((n) => n >= 0 && n < 1), true);

  const other = rng.rngFrom("layered-cakf");
  assert.notDeepEqual(first, Array.from({ length: 24 }, () => other()));

  // Named streams from one seed are independent, which is what lets the banner
  // and the scatter both be reproducible without sharing a sequence.
  const banner = rng.stream("job", "banner");
  const scatter = rng.stream("job", "scatter");
  assert.notDeepEqual(
    Array.from({ length: 8 }, () => banner()),
    Array.from({ length: 8 }, () => scatter()),
  );
  assert.deepEqual(
    Array.from({ length: 8 }, () => rng.stream("job", "banner")()),
    Array.from({ length: 8 }, () => rng.stream("job", "banner")()),
  );
});

test("shuffle and pick are seeded, and shuffle keeps every element", () => {
  const items = [1, 2, 3, 4, 5, 6, 7, 8];
  const once = rng.shuffle(rng.rngFrom(7), items);
  const twice = rng.shuffle(rng.rngFrom(7), items);
  assert.deepEqual(once, twice);
  assert.deepEqual([...once].sort((x, y) => x - y), items);
  assert.deepEqual(items, [1, 2, 3, 4, 5, 6, 7, 8], "the input is not mutated");
  assert.equal(rng.seedHex("cake"), rng.seedHex("cake"));
});

// --- colour ------------------------------------------------------------------

test("colour round-trips through OKLCH within a rounding step", () => {
  // Sampled-looking values only: this engine never invents a colour, and no
  // colour literal in it means anything about a family's page.
  for (const hex of ["#000000", "#ffffff", "#7f5a3c", "#2b4c6f", "#c8a24a", "#94b8a1"]) {
    const back = colour.fromOklch(colour.toOklch(hex));
    const [a, b] = [colour.hexToRgb(hex), colour.hexToRgb(back)];
    for (let i = 0; i < 3; i += 1) {
      assert.ok(Math.abs(a[i] - b[i]) <= 1 / 255 + 1e-9, `${hex} -> ${back} channel ${i}`);
    }
  }
});

test("contrast is symmetric, bounded, and reports the floors the page is held to", () => {
  assert.equal(Math.round(colour.contrast("#000000", "#ffffff") * 100) / 100, 21);
  assert.equal(colour.contrast("#333333", "#333333"), 1);
  assert.equal(
    colour.contrast("#7f5a3c", "#ffffff").toFixed(6),
    colour.contrast("#ffffff", "#7f5a3c").toFixed(6),
  );
  // retune moves a colour to a target lightness so a sampled hue can clear a
  // floor without being replaced by one the family never had.
  const lifted = colour.retune("#2b4c6f", 0.96, 0.04);
  assert.ok(colour.contrast(lifted, "#000000") > colour.contrast("#2b4c6f", "#000000"));
  assert.ok(colour.toOklch(lifted).L > colour.toOklch("#2b4c6f").L);
  // Chroma clamping must land in gamut, or the value cannot be rendered at all.
  const clamped = colour.clampChroma({ L: 0.7, C: 0.4, H: 140 });
  assert.ok(clamped.C <= 0.4);
  assert.match(colour.fromOklch(clamped), /^#[0-9a-f]{6}$/);
});

// --- geometry ----------------------------------------------------------------

test("a scanline reports the free intervals a row of obstacles leaves", () => {
  assert.deepEqual(geometry.freeIntervals(0, 100, []), [[0, 100]]);
  assert.deepEqual(geometry.freeIntervals(0, 100, [[20, 40]]), [[0, 20], [40, 100]]);
  assert.deepEqual(geometry.freeIntervals(0, 100, [[20, 40], [60, 80]]),
    [[0, 20], [40, 60], [80, 100]]);
  // Overlapping obstacles are one hole, not two.
  assert.deepEqual(geometry.freeIntervals(0, 100, [[20, 50], [40, 70]]), [[0, 20], [70, 100]]);
  // A blocker covering the row leaves nothing, and slivers are dropped rather
  // than offered as somewhere a word could go.
  assert.deepEqual(geometry.freeIntervals(0, 100, [[-10, 110]]), []);
  assert.deepEqual(geometry.freeIntervals(0, 100, [[0, 99.7]]), []);
});

test("bbox and overlap area measure what the scatter has to avoid", () => {
  const box = geometry.bbox([[10, 20], [50, 20], [50, 80], [10, 80]]);
  assert.deepEqual(box, { x: 10, y: 20, w: 40, h: 60 });
  assert.equal(geometry.rectsOverlapArea({ x: 0, y: 0, w: 10, h: 10 },
                                         { x: 5, y: 5, w: 10, h: 10 }), 25);
  assert.equal(geometry.rectsOverlapArea({ x: 0, y: 0, w: 10, h: 10 },
                                         { x: 20, y: 0, w: 10, h: 10 }), 0);
});

// --- textlayout --------------------------------------------------------------

test("direction is read off the script, and a mixed string follows its letters", () => {
  assert.equal(textlayout.directionOf("layered cake"), "ltr");
  // Short by design: this repository refuses runs of six or more Cyrillic
  // letters outside documentation, and a direction test does not need one.
  assert.equal(textlayout.directionOf("торт"), "ltr");
  assert.equal(textlayout.directionOf("bolo de laranja"), "ltr");
  assert.equal(textlayout.directionOf("עוגה"), "rtl");
  assert.equal(textlayout.directionOf("كعكة"), "rtl");
  // A right-to-left string carrying a Latin word is not right-to-left-only.
  assert.equal(textlayout.directionOf("كعكة cake"), "ltr");
  // Digits and punctuation carry no direction, so the caller's fallback stands.
  // ("180 °C" would not: the C is a Latin letter and decides the string.)
  assert.equal(textlayout.directionOf("180", "rtl"), "rtl");
  assert.equal(textlayout.directionOf("", "rtl"), "rtl");
  assert.equal(textlayout.directionOf(""), "ltr");
});

test("text is prepared once and broken against a shape without re-measuring", () => {
  const measure = textlayout.makeMetricMeasurer();
  const spec = { key: "body", stack: "serif" };
  const prepared = textlayout.prepare("a spoon of thick sour cream and a little vinegar", spec, measure);
  assert.ok(prepared.atoms.length > 8);
  // Every atom keeps its span into the source string, so nothing on the page can
  // point at words she did not say.
  const joined = prepared.atoms.map((a) => a.text).join("");
  assert.equal(joined, "a spoon of thick sour cream and a little vinegar");

  const opts = (width) => ({
    size: 16, leading: 1.5, y: 0, minLine: 40,
    shapeFor: () => [[0, width]],
  });
  const narrow = textlayout.layout(prepared, opts(90));
  const roomy = textlayout.layout(prepared, opts(600));
  assert.ok(narrow.lines.length > roomy.lines.length,
    `narrow ${narrow.lines.length} vs roomy ${roomy.lines.length}`);
  // A cutout in the middle of the column narrows the usable run, and the widest
  // interval wins - a sliver beside a photograph is not a line of text.
  const split = textlayout.layout(prepared, {
    size: 16, leading: 1.5, y: 0, minLine: 40,
    shapeFor: () => [[0, 30], [140, 600]],
  });
  assert.ok(split.lines.every((ln) => ln.x >= 140 - 1e-9), "a sliver was used as a line");
});

// --- paper -------------------------------------------------------------------

test("a torn edge is generated from its seed and repeats exactly", () => {
  const box = { x: 0, y: 0, w: 320, h: 200 };
  const once = paper.tornRect(box, "sheet-1");
  const twice = paper.tornRect(box, "sheet-1");
  assert.deepEqual(once, twice);
  assert.notDeepEqual(once, paper.tornRect(box, "sheet-2"));
  assert.ok(once.length > 8);
  // The edge is a tear, not a rectangle, but it stays near its own box.
  for (const [x, y] of once) {
    assert.ok(x > box.x - 40 && x < box.x + box.w + 40);
    assert.ok(y > box.y - 40 && y < box.y + box.h + 40);
  }
  assert.match(paper.toPath(once), /^M.*Z$/s);
  assert.match(paper.toClipPercent(once, box), /^polygon\(/);
});

// --- collage -----------------------------------------------------------------

function pieces(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `frg_${i}`, fragmentId: `frg_${i}`,
    aspect: 0.7 + (i % 5) * 0.22, weight: ["light", "medium", "heavy"][i % 3],
  }));
}

test("the banner fills with thirty-two pieces and with exactly one", () => {
  const box = { x: 0, y: 0, w: 900, h: 320 };
  const many = collage.packBanner({ fragments: pieces(32), box, density: 0.6, seed: "banner" });
  assert.ok(many.items.length > 4, `only ${many.items.length} items`);
  assert.ok(many.coverage > 0.5, `coverage ${many.coverage}`);

  // One fragment must still fill the rectangle - it repeats rather than leaving
  // a heap that is one photograph and a lot of nothing.
  const one = collage.packBanner({ fragments: pieces(1), box, density: 0.6, seed: "banner" });
  assert.ok(one.items.length > 1, `one fragment produced ${one.items.length} items`);
  assert.equal(one.items.every((it) => it.fragmentId === "frg_0"), true);
  assert.ok(one.coverage > 0.5, `coverage ${one.coverage}`);

  // No fragments is empty rather than an error.
  assert.deepEqual(collage.packBanner({ fragments: [], box, density: 0.6, seed: "b" }).items, []);
});

test("the heap draws by use, so one piece cannot take the biggest hole twice", () => {
  const box = { x: 0, y: 0, w: 900, h: 320 };
  const packed = collage.packBanner({ fragments: pieces(8), box, density: 0.7, seed: "banner" });
  const used = new Map();
  for (const item of packed.items) used.set(item.fragmentId, (used.get(item.fragmentId) ?? 0) + 1);
  // Every piece is used, and none dominates: if the heap simply aimed each piece
  // at the emptiest cell without tracking use, the first fragment would win the
  // largest hole every round and the banner would be one photograph repeated.
  assert.equal(used.size, 8, `only ${used.size} of 8 fragments were placed`);
  const counts = [...used.values()];
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 2,
    `use spread too wide: ${counts.join(",")}`);
});

test("the banner is seeded, so the same heap comes back", () => {
  const box = { x: 0, y: 0, w: 900, h: 320 };
  const a = collage.packBanner({ fragments: pieces(11), box, density: 0.6, seed: "same" });
  const b = collage.packBanner({ fragments: pieces(11), box, density: 0.6, seed: "same" });
  assert.deepEqual(a.items, b.items);
  const c = collage.packBanner({ fragments: pieces(11), box, density: 0.6, seed: "other" });
  assert.notDeepEqual(a.items, c.items);
});

// --- marks -------------------------------------------------------------------

test("a mark is one gesture or one per line, and every kind is drawable", () => {
  const seed = "mark";
  // A one-gesture mark - a circle round a phrase - is a single path however many
  // lines it spans. A per-line mark - a highlight - is one stroke per line.
  const oneLine = [{ x: 10, y: 10, w: 200, h: 20 }];
  const threeLines = [
    { x: 10, y: 10, w: 200, h: 20 },
    { x: 10, y: 34, w: 200, h: 20 },
    { x: 10, y: 58, w: 200, h: 20 },
  ];

  // A one-gesture mark spans whatever box it is given as a single path: a
  // circle round three lines is one loop, not three.
  const circleOne = marks.BUILDERS.circle(oneLine[0], seed);
  const circleThree = marks.BUILDERS.circle({ x: 10, y: 10, w: 200, h: 68 }, seed);
  assert.equal(typeof circleOne.d, "string");
  assert.equal(typeof circleThree.d, "string");
  assert.equal(circleThree.d.split("M").length, circleOne.d.split("M").length,
    "a circle over three lines is still one gesture");

  // Box marks build from a box and a seed alone, and repeat for that seed.
  for (const kind of ["circle", "underline", "highlight", "strike",
                      "colour-over", "rule-above", "rule-below", "gap"]) {
    const builder = marks.BUILDERS[kind];
    assert.equal(typeof builder, "function", `${kind} has no builder`);
    const out = builder(oneLine[0], seed);
    assert.equal(typeof out.d, "string", `${kind} drew no path`);
    assert.deepEqual(builder(oneLine[0], seed), out, `${kind} is not seeded`);
  }

  // The two list markers are a different kind of thing: they are drawn in the
  // gutter from a point and a size, not over a run of text, which is why they
  // take (x, y, size, seed) rather than a box.
  for (const kind of ["bulleted", "numbered"]) {
    const out = marks.BUILDERS[kind](12, 40, 16, seed);
    assert.equal(typeof out.d, "string", `${kind} drew no path`);
    assert.deepEqual(marks.BUILDERS[kind](12, 40, 16, seed), out, `${kind} is not seeded`);
  }

  // rule-above and rule-below are the same stroke used at two heights; the
  // builder map is allowed to share it and the port must keep that.
  assert.equal(marks.BUILDERS["rule-above"], marks.BUILDERS["rule-below"]);

  // Per-line marks differ line by line rather than repeating one stroke, because
  // a highlighter drawn by hand does not land twice in the same place.
  const first = marks.BUILDERS.highlight(threeLines[0], seed);
  const second = marks.BUILDERS.highlight(threeLines[1], seed);
  assert.notDeepEqual(first, second);
});
