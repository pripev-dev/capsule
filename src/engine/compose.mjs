// PORT NOTE - the one module in this engine that is not a mechanical conversion.
//
// In the prototype this file required its seventeen skill modules directly. Here it
// cannot: the skills live in `cookbook-agent`, and `cookbook-agent` depends on
// this package, so importing them would make `capsule` depend on its own
// dependent. The skills are therefore injected once, by the caller, rather than
// imported.
//
// `SK` keeps its name and its shape, so every `SK.x` call in the body below is
// byte-identical to the prototype's. Nothing else about the run changed: the
// order, the work record and the outputs are the prototype's.
//
// A composer with no skills would compose an empty page instead of failing, so
// `run()` and `composeAndValidate()` refuse rather than proceed.
import * as RNG from "./rng.mjs";
import * as INTAKE from "./intake.mjs";
import * as LAY from "./layout.mjs";
import * as VAL from "./validate.mjs";

// engine/compose.js - the whole run, end to end.
//
// This is not a skill. It is the wiring: it calls the skills in the order
// assembling-the-sandbox gives, and writes everything each one decided into a
// work record. Nothing here makes a design decision, and nothing here knows
// what any capsule is about.


// Fragment geometry, in the shape the engine wants. No label is read here; that
// is composing-cookbook-pages' job.
function readFragments(intakeFragments) {
  return intakeFragments.map(function (f) {
    var box = f.boundingBox || { width: 1, height: 1 };
    return {
      id: f.fragmentId, fragmentId: f.fragmentId,
      src: f.assets && (f.assets.alphaPng || f.assets.paperPng),
      label: f.label, subjectHint: f.subjectHint, tags: f.tags || [],
      weight: f.compositionWeight || f.weight || 'medium',
      mode: f.blendMode || 'normal', treatment: f.edgeTreatment || f.treatment || '',
      quality: f.quality || null,
      aspect: box.width / Math.max(1, box.height),
      area: box.width * box.height,
      contour: f.contour || defaultContour()
    };
  });
}
function defaultContour() {
  // A fragment with no contour still wraps text: its own rectangle, softened, is
  // a better obstacle than no obstacle.
  var p = [], n = 24;
  for (var i = 0; i < n; i++) {
    var t = i / n * Math.PI * 2;
    p.push([0.5 + Math.cos(t) * 0.5, 0.5 + Math.sin(t) * 0.5]);
  }
  return p;
}

function colourInput(palettes) {
  var out = [], from = [];
  (palettes || []).forEach(function (p) {
    (p.swatches || p.colours || []).forEach(function (s) {
      out.push({ hex: s.hex, coverage: s.coverage != null ? s.coverage : 1 / Math.max(1, (p.swatches || []).length), from: p.fragmentId || null });
    });
    if (p.fragmentId) from.push(p.fragmentId);
  });
  return { colours: out, sampledFromFragmentIds: from };
}

function run(job) {
  requireSkills("run");
  var work = { steps: [], startedAt: job.now };
  var lex = job.lexicon, stem = SK.structure.makeStemmer(lex);
  // The language pack decision, if the caller made one. It is the caller's to
  // make - loading files is plumbing - but it is this run's to record, because
  // readiness is where a reviewer looks and it must carry the degrade.
  var pack = job.languagePack || null;

  // 1. the mount
  var mount = SK.assemble.assemble({
    recordings: job.recordings, mayHaveGaps: true, locales: job.locales || [],
    hasVisualAssets: (job.fragments || []).length > 0
  });
  work.steps.push({ skill: 'assembling-the-sandbox', out: mount });

  // 2. the page plan - the first act
  var plan = SK.structure.planPages({
    transcripts: job.recordings.filter(function (r) { return !r.isAddition; })
      .map(function (r) { return { recordingId: r.recordingId, text: r.text }; }),
    lexicon: lex, templates: job.questionTemplates
  });
  work.steps.push({ skill: 'structuring-spoken-recipes', out: plan });

  // 3. which fragments serve which page - by label, never by arrival order, and
  //    never one that already carries a page in this cookbook.
  var frags = readFragments(job.fragments);
  var gloss = SK.page.makeGloss(job.gloss);
  var assign = SK.page.assignFragments({ pages: plan.pages, fragments: job.fragments, stem: stem,
                                         gloss: gloss, ledger: job.cookbookLedger || {} });
  work.steps.push({ skill: 'composing-cookbook-pages/assignFragments', out: assign });
  var fragById = {}; frags.forEach(function (f) { fragById[f.fragmentId] = f; });

  // The ground a page with no photographs of its own may borrow. Filled by the
  // first page in this job that grounds on a sampled colour, or handed in by the
  // caller from elsewhere in the cookbook.
  var siblingGround = job.cookbookGround || null;

  var capsules = plan.pages.map(function (page, pi) {
    var rec = job.recordings.filter(function (r) { return r.recordingId === page.sourceRecordingId; })[0];
    var key = rec.recordingKey + (plan.pages.length > 1 ? '_p' + (pi + 1) : '');
    var seed = job.capsuleId + '/' + key;
    var mine = (assign.assignments[pi] || []).map(function (id) { return fragById[id]; }).filter(Boolean);
    var sentences = [];
    page.sections.forEach(function (s) { sentences = sentences.concat(s.sentences); });
    var w = { pageIndex: pi, key: key, seed: seed, steps: [] };

    // 4. readiness
    // The colours that reach this page are the colours of the photographs this
    // page's own fragments came out of. A page with no fragments falls back to
    // every palette the family sent, and to none if they sent none.
    var myPalettes = mine.length
      ? (job.palettes || []).filter(function (p) { return mine.some(function (f) { return f.fragmentId === p.fragmentId; }); })
      : (job.palettesForPagesWithoutFragments || []);
    // Where this page's colour comes from, decided from the material before
    // either skill runs, so readiness and the palette record cannot disagree.
    var colourSource = myPalettes.length ? 'sampled'
                     : (siblingGround ? 'borrowed-from-sibling-page' : 'none-achromatic');
    var ready = SK.readiness.assess({
      sentences: sentences, eligibleFragments: mine, durationSeconds: rec.durationSeconds,
      palettes: myPalettes, colourSource: colourSource, languagePack: pack,
      cookbookScoped: !!job.cookbookId,
      cookbookFreeStock: (assign.ledgerApplied || {}).free,
      cookbookLedgerCarried: (assign.ledgerApplied || {}).carried || 0
    });
    w.steps.push({ skill: 'assessing-capsule-readiness', out: ready });

    // 5. claims
    var cl = SK.claims.markClaims({ lexicon: lex, stem: stem, sections: page.sections,
                                    recordingKey: key, recordingId: rec.recordingId });
    w.steps.push({ skill: 'marking-claim-states', out: cl });

    // 6. clarifications
    var clarify = SK.clarify.build({ gaps: cl.gaps, lexicon: lex, recordingKey: key,
                                     templates: job.questionTemplates });
    // A question with no wording has not been asked, so the claim does not move
    // to 'clarification-requested'. It stays unresolved, which is true.
    if (clarify.ask && clarify.ask.sendable) {
      var target = cl.claims.filter(function (c) { return c.claimId === clarify.ask.claimId; })[0];
      if (target) SK.clarify.applyAnswer({ clarification: clarify.ask, claim: target });
    }
    w.steps.push({ skill: 'requesting-clarifications', out: clarify });

    // 7. what her sentences are, before they are blocks
    //
    // A story is looked for first and holds the sentences it takes, so a run of
    // instructions cannot be numbered through the middle of a memory. Then the
    // remaining runs are grouped: things to have ready, actions in order, sets
    // with no order. Both skills answer with verbatim spans; neither writes a
    // block.
    // The title's own sentence is spoken for, where the title came from her first
    // utterance: it is already the heading. Both skills are given the same map -
    // a story block that opens by repeating the heading is the same duplicate as
    // a numbered step that does.
    var titleOwned = SK.blocks.titleOwnedSentences(page);
    var told = SK.story.findStories({ sections: page.sections, lexicon: lex,
                                      reservedSentences: titleOwned });
    w.steps.push({ skill: 'setting-aside-a-story', out: told });
    var grouped = SK.grouping.groupRuns({ sections: page.sections, lexicon: lex,
                                          reservedSentences: Object.assign({}, told.reservedSentences, titleOwned) });
    w.steps.push({ skill: 'grouping-spoken-runs', out: grouped });

    // 7b. the index at the head of the recipe
    //
    // Runs after the claims and after both grouping skills, and before anything
    // is typed: it decides which spans are lifted, not what they become. It
    // reorders nothing - the recipe underneath is her order, and every line up
    // here is a span that is still down there where she said it.
    var head = SK.head.lift({ page: page, claims: cl.claims, lexicon: lex,
                              chrome: (job.chrome && job.chrome.strings) || {} });
    w.steps.push({ skill: 'lifting-a-recipe-head', out: Object.assign({ limits: SK.head.limits() }, head) });

    // 8. blocks
    var bp = SK.blocks.plan({ page: page, readiness: ready, claims: cl.claims,
                              stories: told.stories, groups: grouped.groups, head: head,
                              recordingKey: key, recordingId: rec.recordingId });
    w.steps.push({ skill: 'planning-capsule-blocks', out: { notes: bp.notes, count: bp.blocks.length,
                                                            containers: bp.containers,
                                                            policy: SK.blocks.movabilityPolicy() } });

    // 9. voice
    var voice = SK.voice.plan({ recording: rec, page: page, transcriptLength: rec.text.length,
                                chrome: (job.chrome && job.chrome.strings) || {},
                                transcriptText: rec.text.slice(page.span.start, page.span.end),
                                pageCarriesTranscript: true });
    var mediaBlock = bp.blocks.filter(function (b) { return b.type === 'media'; })[0];
    Object.assign(mediaBlock, voice.mediaBlock);
    w.steps.push({ skill: 'placing-the-voice', out: voice });

    // 10. type and palette
    var ci = colourInput(myPalettes);
    var tp = SK.type.choose({
      text: rec.text.slice(page.span.start, page.span.end), registry: job.registry,
      fragments: mine, colours: ci.colours, sampledFromFragmentIds: ci.sampledFromFragmentIds,
      sentences: sentences, seed: seed,
      siblingPalette: myPalettes.length ? null : siblingGround
    });
    if (tp.colourSource === 'sampled' && !siblingGround) {
      siblingGround = Object.assign({ capsuleId: job.capsuleId + (plan.pages.length > 1 ? '_p' + (pi + 1) : ''),
                                      pageTitle: page.title }, tp.tokens.palette);
    }
    w.steps.push({ skill: 'choosing-type-and-palette', out: tp });

    // 11. composition intent
    var intent = SK.page.composeIntent({ page: page, fragments: mine, readiness: ready,
                                         blocks: bp.blocks, seed: seed, stem: stem, gloss: gloss });
    w.steps.push({ skill: 'composing-cookbook-pages/composeIntent', out: intent });

    // 12. marks - mutates the blocks, which is where marks live
    var mk = SK.marks.planMarks({ blocks: bp.blocks, claims: cl.claims, signals: cl.signals,
                                  accentCount: tp.tokens.palette.accents.length });
    w.steps.push({ skill: 'writing-cookbook-marks', out: mk });

    var capsule = {
      schemaVersion: 2, capsuleId: job.capsuleId + (plan.pages.length > 1 ? '_p' + (pi + 1) : ''),
      title: page.title, locale: lex.locale,
      sourceRecordings: [{ recordingId: rec.recordingId, recordingKey: rec.recordingKey,
                           durationSeconds: rec.durationSeconds }],
      blocks: bp.blocks, claims: cl.claims,
      clarifications: clarify.ask ? [clarify.ask].concat(clarify.queued) : [],
      fonts: tp.fonts,
      compositions: [{ compositionId: intent.compositionId, surfaceClass: 'any',
                       intent: Object.assign({ tokens: tp.tokens }, intent) }],
      legend: mk.legend,
      provenance: { jobId: job.jobId, composedAt: job.now,
                    fragmentsUsed: mine.map(function (f) { return f.fragmentId; }) }
    };
    return { capsule: capsule, work: w, page: page, fragments: mine, readiness: ready,
             marks: mk, typePalette: tp, intent: intent, clarify: clarify, claims: cl,
             told: told, grouped: grouped };
  });

  // The cookbook ledger this job produced: what each page actually placed, which
  // is what the next job in this cookbook must not place again. The caller writes
  // it back beside the fragment manifest; a skill does not own a file.
  var ledgerOut = SK.page.ledgerFrom(capsules.map(function (c) {
    return { capsuleId: c.capsule.capsuleId, pageTitle: c.capsule.title,
             placed: c.intent.placedInThisCookbook || [] };
  }));

  return { mount: mount, plan: plan, assign: assign, capsules: capsules,
           fragmentsById: fragById, work: work, languagePack: pack,
           cookbookLedgerProduced: ledgerOut,
           cookbookGround: siblingGround };
}

// One surface, validated, repaired once if it has to be, and then stopped.
//
// The stop is the point of the skill and it used to be unreachable: a report that
// survived one revision was returned as "not published" without anyone deciding
// that. Now the second reading goes back to repairing-a-failed-validation, which
// answers `failed-closed`, and the fail-closed decision is on the record with the
// findings that caused it.
function composeAndValidate(input) {
  requireSkills("composeAndValidate");
  var model = LAY.composeSurface(input);
  var report = VAL.validate({ capsule: input.capsule, model: model,
                              approvedFragmentIds: input.approvedFragmentIds, scripts: input.scripts });
  if (report.ok) return { model: model, report: report, repair: null, published: true };
  var rep = SK.repair.repair({ report: report, capsule: input.capsule, attempt: 1 });
  if (rep.outcome === 'failed-closed') return { model: model, report: report, repair: rep, published: false };
  var model2 = LAY.composeSurface(input);
  var report2 = VAL.validate({ capsule: input.capsule, model: model2,
                               approvedFragmentIds: input.approvedFragmentIds, scripts: input.scripts });
  if (report2.ok) return { model: model2, report: report2, repair: rep, published: true };
  var stop = SK.repair.repair({ report: report2, capsule: input.capsule, attempt: 2 });
  return { model: model2, report: report2, repair: rep, stop: stop, published: false };
}
/**
 * The seventeen skill modules a run calls, by the short names it uses.
 *
 * Nineteen skills exist. `preserving-source-fidelity` has no JavaScript - it is
 * required background rather than a step - and `preparing-a-printable-sheet` is
 * mounted by the renderer, not by the run. That leaves seventeen here.
 *
 * Keys, in the prototype's own order:
 *   assemble, structure, story, grouping
 *   readiness, claims, clarify, blocks
 *   head, voice, type, page
 *   marks, additions, locales, langpack
 *   repair
 *
 * Printing is a recomposition of a finished surface, not a step in composing
 * one, which is why the print skill belongs to the renderer's side of the seam.
 */
var SK = null;

export function useSkills(skills) {
  var missing = SKILL_KEYS.filter(function (k) { return !skills || !skills[k]; });
  if (missing.length) {
    throw new Error("useSkills is missing: " + missing.join(", "));
  }
  SK = skills;
  return SK;
}

export function skillsInUse() { return SK; }

export const SKILL_KEYS = ["assemble", "structure", "story", "grouping", "readiness", "claims", "clarify", "blocks", "head", "voice", "type", "page", "marks", "additions", "locales", "langpack", "repair"];

function requireSkills(who) {
  if (!SK) {
    throw new Error(
      who + " needs the skills. Call useSkills({ ... }) with the seventeen " +
      "cookbook-agent modules before composing - this package deliberately does " +
      "not import them, because they depend on it."
    );
  }
}

export { run, composeAndValidate, readFragments };
