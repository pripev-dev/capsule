/**
 * The engine composing a whole surface, and refusing one.
 *
 * engine-arithmetic.test.mjs tests the parts. This composes a real surface with
 * the real measurer, which is the only way to reach the behaviour that matters
 * on paper: the keeps, the pagination record, and the refusals the deterministic
 * validator raises when a sheet cannot be certified.
 *
 * The capsule below is invented. It is not a family's, not derived from one, and
 * its text is deliberately dull - this file goes to a public repository.
 */
import test from "node:test";
import assert from "node:assert/strict";

import * as layout from "../src/engine/layout.mjs";
import * as textlayout from "../src/engine/textlayout.mjs";
import * as validate from "../src/engine/validate.mjs";

const measure = textlayout.makeMetricMeasurer();

const FONTS = [
  { fontId: "fnt_a", family: "Alpha", version: "test", licenceId: "OFL-1.1",
    redistributable: true, scriptsCovered: ["Latin"], isSystemFont: false },
  { fontId: "fnt_b", family: "Beta", version: "test", licenceId: "OFL-1.1",
    redistributable: true, scriptsCovered: ["Latin"], isSystemFont: false },
];

const TOKENS = {
  typeStack: [
    { role: "display", fontId: "fnt_a" },
    { role: "text", fontId: "fnt_b" },
    { role: "accent", fontId: "fnt_b" },
    { role: "caption", fontId: "fnt_b" },
  ],
  palette: { paperTint: "#f2f0ec", ink: "#1b1b1b", accents: ["#1b1b1b"], sampledFromFragmentIds: [] },
  rhythm: { measureRange: [35, 61], leadingScale: 1.5, sectionSpacing: "even" },
};

// Enough prose that a letter sheet has to break somewhere, in blocks the keeps
// have opinions about: a heading followed by a run, and a long list.
const PARAGRAPH =
  "Stir the mixture slowly and keep the heat low until the surface begins to " +
  "thicken, then set it aside on the counter to rest for a quarter of an hour " +
  "before the next step is started, because the resting is what makes it hold.";

function blocks(count) {
  const out = [
    { blockId: "blk_title", type: "title", text: "A Test Preparation" },
  ];
  for (let i = 0; i < count; i += 1) {
    out.push({ blockId: `blk_head_${i}`, type: "section", text: `Part ${i + 1}` });
    out.push({ blockId: `blk_body_${i}`, type: "paragraph", text: PARAGRAPH });
    out.push({ blockId: `blk_body_${i}b`, type: "paragraph", text: PARAGRAPH });
  }
  return out;
}

function capsule(blockList = blocks(9)) {
  return {
    schemaVersion: 1,
    capsuleId: "cap_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    title: "A Test Preparation",
    locale: "en",
    blocks: blockList,
    claims: [],
    clarifications: [],
    fonts: FONTS,
    compositions: [{
      compositionId: "cmp_test",
      intent: {
        compositionId: "cmp_test",
        tokens: TOKENS,
        scatterSeed: "test-seed",
        clusters: [],
        freeFragments: [],
        bannerMode: "none",
        placedInThisCookbook: [],
        reasons: [],
      },
    }],
  };
}

const LETTER = { kind: "print", w: 816, h: 1056, pageH: 1056, widthInches: 8.5 };
const A4 = { kind: "print", w: 794, h: 1123, pageH: 1123, widthInches: 8.27 };
const SCREEN = { kind: "screen", w: 1180, h: 860 };

function compose(surface, cap = capsule()) {
  return layout.composeSurface({ capsule: cap, surface, measure, fragmentsById: {} });
}

function report(surface, cap = capsule()) {
  const model = compose(surface, cap);
  return { model, report: validate.validate({ capsule: cap, model, approvedFragmentIds: [] }) };
}

// --- refusals ----------------------------------------------------------------

test("a print surface that declares no paper size is refused, not guessed at", () => {
  // The 12pt floor is a physical rule, so it needs a real density. A sheet whose
  // dots per inch had to be assumed cannot be certified, and saying so is the
  // whole point - a guessed sheet that passes is worse than one that refuses.
  const undeclared = { kind: "print", w: 816, h: 1056, pageH: 1056 };
  const { report: r } = report(undeclared);
  const print = r.findings.filter((f) => f.code === "print");
  assert.ok(print.length > 0, "an undeclared print surface produced no finding");
  const surfaceFinding = print.find((f) => f.subject === "surface");
  assert.ok(surfaceFinding, `no surface-level print finding: ${JSON.stringify(print)}`);
  assert.match(surfaceFinding.message, /declared no paper size|no point scale/);
  assert.equal(surfaceFinding.hint, "declare");
  assert.equal(r.ok, false);

  // The same sheet with its width declared does not raise that finding.
  const declared = report(LETTER).report.findings
    .filter((f) => f.code === "print" && f.subject === "surface");
  assert.deepEqual(declared, []);
});

test("a screen surface is never held to the print rules", () => {
  const { report: r } = report(SCREEN);
  assert.deepEqual(r.findings.filter((f) => f.code === "print"), []);
  assert.deepEqual(r.findings.filter((f) => f.code === "pagination"), []);
});

// --- pagination --------------------------------------------------------------

test("a print surface reports what the sheets actually came out like", () => {
  const { model } = report(LETTER);
  const pg = model.pagination;
  assert.ok(pg, "a print surface produced no pagination record");
  assert.ok(pg.sheets.length > 1, `only ${pg.sheets.length} sheet(s) for nine parts`);
  assert.equal(Array.isArray(pg.strays), true);
  assert.equal(Array.isArray(pg.oversize), true);

  // Every sheet says what it opens with, which is what a running foot needs and
  // what nobody can see by looking at a screen.
  for (const sheet of pg.sheets) {
    assert.equal(typeof sheet.index, "number");
    assert.ok(Object.prototype.hasOwnProperty.call(sheet, "opensWith"));
  }

  // Anything left in strays or oversize is a decision about the material, not a
  // layout retry, so the validator turns each into a finding with a repaginate
  // hint rather than swallowing it.
  const paginationFindings = report(LETTER).report.findings.filter((f) => f.code === "pagination");
  assert.equal(paginationFindings.length, pg.strays.length + pg.oversize.length);
  for (const f of paginationFindings) assert.equal(f.hint, "repaginate");
});

test("composition is deterministic: the same capsule and sheet compose identically", () => {
  const once = compose(A4);
  const twice = compose(A4);
  assert.deepEqual(once.pagination, twice.pagination);
  assert.equal(once.height, twice.height);
  assert.deepEqual(once.sizes, twice.sizes);
});

// --- the keeps ---------------------------------------------------------------

/** Which sheet a y coordinate lands on, by the page's own stride. */
function sheetOf(model, y) {
  const page = model.page;
  return Math.max(0, Math.floor((y - page.top) / page.stride));
}

/** Laid-out lines per block. They live on `flow`, one entry per emitted block. */
function linesByBlock(model) {
  const out = new Map();
  for (const item of model.flow ?? []) {
    const ys = (item.lines ?? []).map((line) => line.y);
    if (ys.length) out.set(item.blockId, ys);
  }
  return out;
}

test("the sheet model declares the keep it enforces", () => {
  const model = compose(LETTER);
  assert.equal(model.pagination.keepLines, 2,
    "the widow and orphan rule is two lines; the record must say so");
});

test("no paragraph leaves fewer than two lines on either side of a break", () => {
  // Ordinary prose is kept whole, so a capsule of normal paragraphs never
  // exercises the rule - it exercises keepTogether instead. To reach the widow
  // control, a block has to be longer than a sheet, which is the case the keeps
  // explicitly refuse to fix: "a list that is simply taller than the paper is
  // not a keep failure, it is a long list, and it breaks where the line rules
  // say it may."
  const long = Array.from({ length: 8 }, () => PARAGRAPH).join(" ");
  const cap = capsule([
    { blockId: "blk_title", type: "title", text: "A Test Preparation" },
    { blockId: "blk_long_a", type: "paragraph", text: long },
    { blockId: "blk_long_b", type: "paragraph", text: long },
    { blockId: "blk_long_c", type: "paragraph", text: long },
  ]);
  const model = compose(LETTER, cap);
  const keep = model.pagination.keepLines;

  let spanning = 0;
  const offences = [];
  for (const [blockId, ys] of linesByBlock(model)) {
    const sheets = ys.map((y) => sheetOf(model, y));
    const distinct = [...new Set(sheets)];
    if (distinct.length < 2) continue;
    spanning += 1;
    for (const sheet of distinct) {
      const n = sheets.filter((s) => s === sheet).length;
      // The first and last sheet of a split block are the widow and orphan
      // cases; a middle sheet is full of it by definition.
      if (n < keep) offences.push(`${blockId}: ${n} line(s) alone on sheet ${sheet}`);
    }
  }
  assert.ok(spanning > 0, "no block spanned a break, so the rule was never tested");
  assert.deepEqual(offences, [], offences.join("; "));
});

test("a heading travels with the first two lines of what it introduces", () => {
  const model = compose(LETTER);
  const flow = model.flow ?? [];
  const offences = [];
  let checked = 0;

  for (let i = 0; i < flow.length; i += 1) {
    const head = flow[i];
    if (!String(head.blockId ?? "").startsWith("blk_head_")) continue;
    const headY = head.box ? head.box.y : head.lines?.[0]?.y;
    if (headY == null) continue;

    // The block it introduces is the next one carrying lines.
    const body = flow.slice(i + 1).find((it) => (it.lines ?? []).length >= 2);
    if (!body) continue;
    checked += 1;

    const headSheet = sheetOf(model, headY);
    const first = body.lines.slice(0, model.pagination.keepLines)
      .map((line) => sheetOf(model, line.y));
    if (first.some((s) => s !== headSheet)) {
      offences.push(`${head.blockId} on sheet ${headSheet}, its opening lines on ${first.join("/")}`);
    }
  }
  assert.ok(checked >= 5, `only ${checked} heading/body pairs were reachable`);
  assert.deepEqual(offences, [], offences.join("; "));
});

test("the 12pt floor is measured in points, and a legible sheet clears it", () => {
  const { model, report: r } = report(LETTER);
  const pt = model.sizes.point;
  assert.ok(pt && !pt.assumed, "a declared sheet still produced an assumed point scale");
  for (const role of ["body", "caption", "section", "display"]) {
    assert.ok(model.sizes[role] / pt.pxPerPt >= 12,
      `${role} sets at ${(model.sizes[role] / pt.pxPerPt).toFixed(1)}pt`);
  }
  assert.deepEqual(r.findings.filter((f) => f.subject?.startsWith("type/")), []);
});
