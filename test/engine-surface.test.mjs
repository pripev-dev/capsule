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

test("modern secondary heaps reach contour flow on screen and stay together on paper", () => {
  const c=capsule(blocks(3)); c.schemaRevision=3;
  const byId={a:{id:'a',aspect:1,contour:[[0,0],[1,0],[0.25,1],[0,1]],weight:'medium'},
    b:{id:'b',aspect:1.4,contour:[[0,0],[1,0],[1,1],[0,1]],weight:'light'}};
  c.compositions[0].intent.clusters=[{clusterId:'heap',role:'side-spacer',
    anchor:{blockId:'blk_body_0',relation:'beside'},memberFragmentIds:['a','b'],density:0.75}];
  for(const surface of [{kind:'screen',w:390,h:844},{kind:'screen',w:1200,h:900},A4]) {
    const m=layout.composeSurface({capsule:c,surface,measure,fragmentsById:byId});
    assert.equal(m.placements.length,2);
    assert.ok(m.placements.every(p=>p.clusterId==='heap'&&p.poly.length===4));
    const plain=structuredClone(c); plain.compositions[0].intent.clusters=[];
    const baseline=layout.composeSurface({capsule:plain,surface,measure,fragmentsById:byId});
    assert.notDeepEqual(m.flow,baseline.flow,'actual silhouettes must change reading flow');
    if(m.page) {
      const sheet=p=>Math.floor((p.y-m.page.top)/m.page.stride);
      assert.equal(sheet(m.placements[0]),sheet(m.placements[1]));
    }
    const legacy=structuredClone(c); delete legacy.schemaRevision;
    assert.equal(layout.composeSurface({capsule:legacy,surface,measure,fragmentsById:byId}).placements.length,0);
  }
});

test("modern editorial print uses physical reading type rather than enlarged screen type", () => {
  const c = capsule(blocks(2)); c.schemaRevision = 3;
  for (const surface of [A4, LETTER]) {
    const model = layout.composeSurface({ capsule: c, surface, measure });
    const points = model.sizes.body / model.sizes.point.pxPerPt;
    assert.ok(points >= 12 && points <= 13.01, `body size ${points}pt`);
    assert.equal(validate.validate({ capsule: c, model, approvedFragmentIds: [] }).ok, true);
  }
});

test("modern collapsed voice area reserves controls without an empty heading row", () => {
  const c = capsule([{ blockId: "blk_title", type: "title", text: "Synthetic recipe" },
    { blockId: "blk_voice", type: "media", transcript: { expandedByDefault: false } },
    { blockId: "blk_body", type: "paragraph", text: PARAGRAPH }]);
  c.schemaRevision = 3;
  const model = layout.composeSurface({ capsule: c, surface: { kind: "screen", w: 390, h: 844 }, measure });
  const voice = model.flow.find(i => i.blockId === "blk_voice");
  assert.ok(voice.box.h <= model.sizes.body * 7.5, "collapsed controls should not reserve a large blank panel");
  const expanded = structuredClone(c); expanded.blocks[1].transcript.expandedByDefault = true;
  expanded.blocks[1].transcriptText = PARAGRAPH.repeat(4);
  const open = layout.composeSurface({ capsule: expanded, surface: { kind: "screen", w: 390, h: 844 }, measure });
  assert.ok(open.flow.find(i => i.blockId === "blk_voice").box.h > voice.box.h * 2);
});
const SCREEN = { kind: "screen", w: 1180, h: 860 };

test("modern body sizing follows nested reading words rather than title or hidden transcript", () => {
  const c = capsule([{blockId:"blk_title",type:"title",text:"WWWWWW"},
    {blockId:"blk_voice",type:"media",transcriptText:"WWWWWW",transcript:{expandedByDefault:false}},
    {blockId:"blk_group",type:"editorial-group",editorial:{treatment:"panel",fontRole:"text",emphasis:"normal",spacing:"regular"},
      children:[{blockId:"blk_body",type:"paragraph",text:"mmmm mmmm mmmm"}]}]);
  c.schemaRevision = 3;
  const glyphMeasure = text => [...text].reduce((sum,ch)=>sum+(ch==="W"?90:ch==="i"?20:ch===" "?25:50),0);
  const surface = {kind:"screen",w:390,h:844};
  const first = layout.composeSurface({capsule:c,surface,measure:glyphMeasure});
  const retitled = structuredClone(c); retitled.blocks[0].text="iiiiii";
  retitled.blocks[1].transcriptText="iiiiii";
  assert.equal(layout.composeSurface({capsule:retitled,surface,measure:glyphMeasure}).sizes.body,first.sizes.body);
  retitled.blocks[2].children[0].text="iiii iiii iiii";
  assert.notEqual(layout.composeSurface({capsule:retitled,surface,measure:glyphMeasure}).sizes.body,first.sizes.body);
});

test("modern voice and first recipe group do not accumulate two section gaps", () => {
  const c = capsule([{blockId:"blk_title",type:"title",text:"Synthetic recipe"},
    {blockId:"blk_voice",type:"media",transcript:{expandedByDefault:false}},
    {blockId:"blk_group",type:"editorial-group",editorial:{treatment:"panel",fontRole:"text",emphasis:"normal",spacing:"regular"},
      children:[{blockId:"blk_body",type:"paragraph",text:PARAGRAPH}]}]);
  c.schemaRevision = 3;
  for (const surface of [{kind:"screen",w:390,h:844},SCREEN]) {
    const model = layout.composeSurface({capsule:c,surface,measure});
    const voice = model.flow.find(i=>i.blockId==="blk_voice");
    const body = model.flow.find(i=>i.blockId==="blk_body");
    assert.ok(body.box.y-(voice.box.y+voice.box.h) < model.sizes.lead*2,
      "first recipe passage should follow within two lines of reading rhythm");
    const expanded = structuredClone(c); expanded.blocks[1].transcript.expandedByDefault=true;
    expanded.blocks[1].transcriptText=PARAGRAPH.repeat(3);
    const open=layout.composeSurface({capsule:expanded,surface,measure});
    assert.ok(open.flow.find(i=>i.blockId==="blk_body").box.y>body.box.y,
      "expanded original transcript must retain its required space");
  }
});

test("modern small collages leave space for voice and preserve unique source proportions", () => {
  const cap = capsule(); cap.schemaRevision = 3;
  cap.compositions[0].intent.clusters = [{role:"opening-banner",memberFragmentIds:["frg_a","frg_b"],density:0.72}];
  const fragmentsById = Object.fromEntries([1.5,0.8].map((aspect,i)=> {
    const id = i ? "frg_b" : "frg_a";
    return [id,{id,aspect,src:"",weight:"medium",mode:"normal"}];
  }));
  const before = JSON.stringify(cap);
  for (const surface of [{kind:"screen",w:390,h:844},{kind:"screen",w:834,h:1112},SCREEN,A4,LETTER]) {
    const model = layout.composeSurface({capsule:cap,surface,measure,fragmentsById});
    assert.ok(model.banner.box.h <= model.sizes.lead * 6.5 + 0.01);
    assert.equal(new Set(model.banner.items.map(i=>i.fragmentId)).size,2);
    for(const item of model.banner.items) assert.ok(Math.abs(item.w/item.h-fragmentsById[item.fragmentId].aspect)<1e-9);
    assert.deepEqual(model.banner,layout.composeSurface({capsule:cap,surface,measure,fragmentsById}).banner);
    const legacy = structuredClone(cap); legacy.schemaRevision = 2;
    const old = layout.composeSurface({capsule:legacy,surface,measure,fragmentsById});
    assert.ok(model.banner.box.h <= old.banner.box.h);
  }
  assert.equal(JSON.stringify(cap),before);
});

test("modern nested editorial groups do not stack section gaps before the first step", () => {
  const ed=(treatment,spacing="regular")=>({treatment,spacing,fontRole:"text",emphasis:"normal"});
  const cap=capsule([
    {blockId:"blk_intro",type:"editorial-group",editorial:ed("set"),children:[
      {blockId:"blk_intro_text",type:"paragraph",text:"Separate the eggs and keep the whites aside."}]},
    {blockId:"blk_panel",type:"editorial-group",editorial:ed("panel","roomy"),children:[
      {blockId:"blk_sequence",type:"editorial-group",editorial:ed("sequence"),children:[
        {blockId:"blk_first_step",type:"paragraph",text:"Mix the yolks with flour and sugar."}]}]}
  ]); cap.schemaRevision=3;
  for(const surface of [SCREEN,A4,LETTER]) {
    const model=layout.composeSurface({capsule:cap,surface,measure});
    const intro=model.flow.find(it=>it.blockId==="blk_intro_text").box;
    const first=model.flow.find(it=>it.blockId==="blk_first_step").box;
    assert.ok(first.y-(intro.y+intro.h)<model.sizes.lead*3,
      "one section transition and panel padding should fit within three reading lines");
  }
});

test('wide modern openings compose the title and recording beside the approved heap', () => {
  const c=capsule([{blockId:'title',type:'title',text:'Family preparation'},
    {blockId:'voice',type:'media',transcript:{expandedByDefault:false}},
    {blockId:'body',type:'paragraph',text:PARAGRAPH}]); c.schemaRevision=3;
  c.compositions[0].intent.clusters=[{role:'opening-banner',memberFragmentIds:['a','b'],density:0.72}];
  const byId={a:{id:'a',aspect:1,weight:'medium'},b:{id:'b',aspect:1.5,weight:'light'}};
  const before=JSON.stringify(c);
  const m=layout.composeSurface({capsule:c,surface:SCREEN,measure,fragmentsById:byId});
  const title=m.flow.find(b=>b.blockId==='title'),voice=m.flow.find(b=>b.blockId==='voice');
  assert.ok(title.box.y<m.banner.box.y+m.banner.box.h);
  assert.ok(voice.box.x+voice.box.w<=m.banner.box.x);
  assert.ok(m.flow.find(b=>b.blockId==='body').box.y>=m.banner.box.y+m.banner.box.h);
  assert.equal(JSON.stringify(c),before);
  const phone=layout.composeSurface({capsule:c,surface:{kind:'screen',w:390,h:844},measure,fragmentsById:byId});
  assert.ok(phone.flow.find(b=>b.blockId==='title').box.y>=phone.banner.box.y+phone.banner.box.h);
  const expanded=structuredClone(c); expanded.blocks[1].transcript.expandedByDefault=true;
  expanded.blocks[1].transcriptText=PARAGRAPH.repeat(3);
  const open=layout.composeSurface({capsule:expanded,surface:SCREEN,measure,fragmentsById:byId});
  const openVoice=open.flow.find(b=>b.blockId==='voice');
  assert.ok(openVoice.box.h>voice.box.h);
  assert.ok(open.flow.find(b=>b.blockId==='body').box.y>=openVoice.box.y+openVoice.box.h);
  const long=structuredClone(c); long.blocks[0].text='A'.repeat(100);
  const fallback=layout.composeSurface({capsule:long,surface:SCREEN,measure,fragmentsById:byId});
  assert.equal(fallback.banner.readingMeasure,undefined);
});

test('modern opening preserves all rotated source envelopes without rectangular clipping', () => {
  const c=capsule(); c.schemaRevision=3;
  const byId=Object.fromEntries([0.45,1.7,3.5].map((aspect,i)=>['frg_'+i,{id:'frg_'+i,aspect,weight:'medium'}]));
  c.compositions[0].intent.clusters=[{role:'opening-banner',memberFragmentIds:Object.keys(byId),density:0.94}];
  for(const surface of [{kind:'screen',w:390,h:844},SCREEN,A4,LETTER]) {
    const m=layout.composeSurface({capsule:c,surface,measure,fragmentsById:byId});
    for(const p of m.banner.items) {
      const angle=Math.abs(p.rot)*Math.PI/180;
      const w=p.w*Math.cos(angle)+p.h*Math.sin(angle),h=p.h*Math.cos(angle)+p.w*Math.sin(angle);
      assert.ok(p.x+p.w/2-w/2>=m.banner.box.x-0.01);
      assert.ok(p.x+p.w/2+w/2<=m.banner.box.x+m.banner.box.w+0.01);
      assert.ok(p.y+p.h/2-h/2>=m.banner.box.y-0.01);
      assert.ok(p.y+p.h/2+h/2<=m.banner.box.y+m.banner.box.h+0.01);
      assert.ok(Math.abs(p.w/p.h-byId[p.fragmentId].aspect)<1e-9);
    }
  }
});

test("modern sparse opening balances the selected heap across the paper", () => {
  const cap=capsule(); cap.schemaRevision=3;
  cap.compositions[0].intent.clusters=[{role:"opening-banner",memberFragmentIds:["frg_a","frg_b"],density:0.72}];
  const fragmentsById=Object.fromEntries([1.5,1.7].map((aspect,i)=>{
    const id=i?"frg_b":"frg_a"; return [id,{id,aspect,src:"",weight:"medium",mode:"normal"}];
  }));
  for(const surface of [SCREEN,A4,LETTER]) {
    const model=layout.composeSurface({capsule:cap,surface,measure,fragmentsById});
    const edges=model.banner.items.map(it=>{
      const angle=Math.abs(it.rot)*Math.PI/180;
      const width=it.w*Math.cos(angle)+it.h*Math.sin(angle);
      return [it.x+it.w/2-width/2,it.x+it.w/2+width/2];
    });
    const centre=(Math.min(...edges.map(e=>e[0]))+Math.max(...edges.map(e=>e[1])))/2;
    assert.ok(Math.abs(centre-(model.banner.box.x+model.banner.box.w/2))<0.01,
      "rotated heap should leave balanced horizontal paper margins");
  }
});

test("a single-piece opening is compact and keeps the rotated source whole on every surface", () => {
  const cap = capsule();
  cap.compositions[0].intent.clusters = [{ role: "opening-banner", memberFragmentIds: ["frg_only"], density: 0.94 }];
  const before = JSON.stringify(cap);
  for (const aspect of [0.45, 1.5, 3.5]) for (const surface of [
    { kind: "screen", w: 390, h: 844 }, { kind: "screen", w: 768, h: 1024 }, SCREEN, A4, LETTER,
  ]) {
    const fragmentsById = { frg_only: { id: "frg_only", aspect, src: "", weight: "heavy", mode: "normal" } };
    const model = layout.composeSurface({ capsule: cap, surface, measure, fragmentsById });
    assert.ok(model.banner.box.h <= model.sizes.lead * 5.5, "one fragment must not reserve a full collage opening");
    assert.equal(model.banner.items.length, 1);
    const it = model.banner.items[0], box = model.banner.box;
    assert.ok(Math.abs(it.w / it.h - aspect) < 1e-9, "preserve source proportions");
    const angle = Math.abs(it.rot) * Math.PI / 180;
    const halfW = (it.w * Math.cos(angle) + it.h * Math.sin(angle)) / 2;
    const halfH = (it.h * Math.cos(angle) + it.w * Math.sin(angle)) / 2;
    const cx = it.x + it.w / 2, cy = it.y + it.h / 2;
    assert.ok(cx - halfW >= box.x && cx + halfW <= box.x + box.w, "no source edge clipped horizontally");
    assert.ok(cy - halfH >= box.y && cy + halfH <= box.y + box.h, "no source edge clipped vertically");
    assert.deepEqual(model.banner, layout.composeSurface({ capsule: cap, surface, measure, fragmentsById }).banner);
  }
  assert.equal(JSON.stringify(cap), before);
});

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

test("a long Cyrillic title keeps whole words inside a phone measure", () => {
  const title = "\u043a\u043b\u0430\u0441\u0441\u0438\u0447\u0435\u0441\u043a\u0430\u044f " +
    "\u0448\u0430\u0440\u043b\u043e\u0442\u043a\u0430";
  const cap = capsule([{ blockId: "blk_title", type: "title", text: title }]);
  const { model, report: r } = report({ kind: "screen", w: 390, h: 844 }, cap);
  const titleItem = model.flow.find((item) => item.blockId === "blk_title");
  assert.ok(titleItem?.lines?.length > 0);
  assert.deepEqual(r.findings.filter((f) => f.code === "overflow"), []);
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

// --- sections, as the cookbook agent writes them ----------------------------
//
// The agent's pages are editorial groups: a section heading, then a numbered
// sequence of steps inside it. The first printed page the owner tried broke in
// three ways none of the tests above could see, because none of them composed
// a group: a heading left alone at the foot of a sheet, a quarter-sheet hole
// between two steps, and a two-line step split one line per sheet.

// A break lands wherever the sheet puts it, so one sheet size proves little: a
// rule that holds on A4 can fail on a sheet 30px shorter. These run on a sweep
// of heights, which is how the faults below were made to show on purpose.
const SWEEP = Array.from({ length: 36 }, (_, i) => {
  const h = 900 + i * 12;
  return { kind: "print", w: 794, h, pageH: h, widthInches: 8.27 };
});

const STEP = "Turn the mixture out onto the board and work it with the heel of your hand.";
const LONG_STEP = `${STEP} ${STEP}`;

function sections(count) {
  const blocks = [{ blockId: "blk_title", type: "title", text: "A Test Preparation" }];
  const treatments = [];
  for (let i = 0; i < count; i += 1) {
    const steps = Array.from({ length: 3 + (i % 3) }, (_, j) => ({
      blockId: `blk_step_${i}_${j}`, type: "instruction-line", text: j % 2 ? STEP : LONG_STEP,
    }));
    blocks.push({ blockId: `blk_part_${i}`, type: "step-group", children: [
      { blockId: `blk_head_${i}`, type: "prose", text: `Part ${i + 1}.` },
      { blockId: `blk_seq_${i}`, type: "step-group", children: steps },
    ] });
    treatments.push(
      { blockId: `blk_part_${i}`, treatment: "panel", fontRole: "text", emphasis: "normal", spacing: "regular" },
      { blockId: `blk_head_${i}`, treatment: "section", fontRole: "display", emphasis: "normal", spacing: "regular" },
      { blockId: `blk_seq_${i}`, treatment: "sequence", fontRole: "text", emphasis: "normal", spacing: "regular" },
      ...steps.map((s) => ({ blockId: s.blockId, treatment: "body", fontRole: "text", emphasis: "normal", spacing: "regular" })),
    );
  }
  const cap = capsule(blocks);
  cap.compositions[0].intent.blockTreatments = treatments;
  return cap;
}

test("a section heading is never the last thing on its sheet", () => {
  for (const surface of SWEEP) {
    const model = compose(surface, sections(12));
    const flow = model.flow;
    let checked = 0;
    for (let i = 0; i < flow.length; i += 1) {
      if (!String(flow[i].blockId).startsWith("blk_head_")) continue;
      const next = flow.slice(i + 1).find((it) => it.lines?.length);
      checked += 1;
      assert.equal(sheetOf(model, next.lines[0].y), sheetOf(model, flow[i].lines.at(-1).y),
        `${flow[i].blockId} ends sheet ${sheetOf(model, flow[i].box.y)} and its steps start overleaf`);
    }
    assert.equal(checked, 12);
  }
});

test("a sequence carries no hole from where it was first set", () => {
  // Kept whole or broken, the steps follow each other: the next step is either
  // a normal gap below the last one or at the head of the next sheet. A hole
  // is what moving a sequence as it was first laid used to leave behind.
  let pairs = 0;
  for (const surface of SWEEP) {
  const model = compose(surface, sections(12));
  const page = model.page;
  for (const seq of model.flow.filter((it) => String(it.blockId).startsWith("blk_seq_"))) {
    const steps = model.flow.filter((it) => String(it.blockId).startsWith(`${seq.blockId.replace("seq", "step")}_`));
    for (let j = 1; j < steps.length; j += 1) {
      pairs += 1;
      const top = steps[j].lines[0].y;
      const sameSheet = sheetOf(model, top) === sheetOf(model, steps[j - 1].lines.at(-1).y);
      const gap = sameSheet
        ? steps[j].box.y - (steps[j - 1].box.y + steps[j - 1].box.h)
        : top - (page.top + sheetOf(model, top) * page.stride);
      assert.ok(gap < model.sizes.lead * 2, `${surface.h}: ${steps[j].blockId} sits ${gap.toFixed(0)}px below where it should`);
    }
  }
  }
  assert.ok(pairs >= 30, `only ${pairs} pairs of steps were checked`);
});

test("no step short enough to keep whole is split across a sheet", () => {
  for (const surface of SWEEP) {
    const model = compose(surface, sections(12));
    const keep = model.pagination.keepLines;
    for (const it of model.flow) {
      if (!it.lines?.length || it.lines.length >= keep * 2) continue;
      const sheets = new Set(it.lines.map((ln) => sheetOf(model, ln.y)));
      assert.equal(sheets.size, 1, `${surface.h}: ${it.blockId}: ${it.lines.length} lines on ${sheets.size} sheets`);
    }
  }
});

test("no photograph is cut by a sheet break", () => {
  const cap = sections(12);
  const square = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const fragmentsById = {};
  cap.compositions[0].intent.freeFragments = Array.from({ length: 12 }, (_, i) => {
    fragmentsById[`frg_${i}`] = { id: `frg_${i}`, aspect: 0.8, contour: square, src: "", weight: "medium", mode: "sticker" };
    return { placementId: `plc_${i}`, fragmentId: `frg_${i}`, anchor: { blockId: `blk_seq_${i}` },
             scaleRange: { min: 0.22, max: 0.3 }, band: { sentences: 6 }, wrapPriority: "contour" };
  });
  for (const surface of SWEEP) {
    const model = layout.composeSurface({ capsule: cap, surface, measure, fragmentsById });
    assert.ok(model.placements.length >= 6, `only ${model.placements.length} photographs were placed`);
    const page = model.page;
    for (const p of model.placements) {
      const sheet = sheetOf(model, p.y);
      const bandTop = page.top + sheet * page.stride;
      assert.ok(p.y >= bandTop - 0.01 && p.y + p.h <= bandTop + page.h + 0.01,
        `${surface.h}: ${p.placementId} runs from ${(p.y - bandTop).toFixed(0)} to ${(p.y + p.h - bandTop).toFixed(0)} on a ${page.h.toFixed(0)}px sheet`);
    }
  }
});

test("the words after a typographic title start below its torn ground and rule", () => {
  // 30 September: on paper the player is left off, and the rule under the
  // title ran through the first sentence of the introduction.
  const cap = capsule([
    { blockId: "blk_title", type: "title", text: "Blackberry pudding cake" },
    { blockId: "blk_intro", type: "prose", text: LONG_STEP },
  ]);
  for (const surface of [A4, LETTER, SCREEN]) {
    const model = compose(surface, cap);
    assert.equal(model.banner.typographic, true);
    const intro = model.flow.find((item) => item.blockId === "blk_intro");
    const ground = model.banner.box.y + model.banner.box.h;
    assert.ok(intro.lines[0].y >= ground, `${surface.kind}-${surface.w}: first line at ${intro.lines[0].y}, ground ends ${ground}`);
    assert.ok(intro.lines[0].y > model.banner.rule.y, "the rule sits above the first line");
  }
});
