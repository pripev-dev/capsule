// NOTE ON THE NAME, because two files in this package are called validate.
//
//   src/engine/validate.mjs  - this file. Deterministic *layout* refusals:
//                              contrast floors, legibility, collisions,
//                              overflow, undeclared print surfaces. It answers
//                              with a code, a subject and a sentence, because
//                              repairing-a-failed-validation cannot repair a
//                              boolean.
//   src/validate/index.mjs   - the capsule *contract* validator: JSON Schema
//                              plus the cross-field checks (closure, evidence
//                              quotes, approved fragments, no pixels, visual
//                              run bindings).
//
// Both names are right in their own directory. Neither imports the other, and
// nothing is wrong here - but the collision reads as a mistake unless it is
// written down, so it is.
import * as COL from "./colour.mjs";
import * as GEO from "./geometry.mjs";

// engine/validate.js - the deterministic refusals.
//
// Runs outside the model and without a browser. repairing-a-failed-validation
// reads exactly this structure. Every check answers with a code, a subject and
// a sentence, because an agent cannot repair a boolean.


function fail(code, subject, message, hint) {
  return { ok: false, code: code, subject: subject, message: message, hint: hint || null };
}

function validate(ctx) {
  var findings = [];
  var capsule = ctx.capsule, model = ctx.model, allow = ctx.approvedFragmentIds || [];

  // 1. schema-shaped essentials
  if (!capsule.blocks || !capsule.blocks.length) findings.push(fail('schema', 'blocks', 'The capsule has no blocks.'));
  if (!capsule.compositions || !capsule.compositions.length) findings.push(fail('schema', 'compositions', 'The capsule has no composition.'));
  (capsule.claims || []).forEach(function (c) {
    if (c.truth === 'interpreted' && c.presentationOnly !== true)
      findings.push(fail('schema', c.claimId, 'An interpreted claim must be presentationOnly.'));
    if (c.truth === 'contradicted' && !(c.conflictsWith || []).length)
      findings.push(fail('schema', c.claimId, 'A contradicted claim must name what it conflicts with.'));
    if (c.truth === 'unresolved' && c.text != null)
      findings.push(fail('schema', c.claimId, 'An unresolved claim carries no text.'));
  });

  // 2. every factual block is evidenced
  //
  // The list-item and story-line types are here for the same reason as the rest:
  // a leaf that came out of a container is still one of her sentences, or a
  // verbatim slice of one, and a page may not carry a line nobody can trace.
  var FACTUAL = ['ingredient-line', 'instruction-line', 'household-measure', 'sensory-cue',
                 'warning', 'storage-note', 'transcript-quote', 'voice-chapter',
                 'checklist-item', 'ordered-item', 'bullet-item', 'story-line',
                 // A head line is a re-quote of one of her spans, so it is held
                 // to the same standard as the span it re-quotes.
                 'head-line'];
  // A container carries no text of its own, so it is not factual - but it must
  // not be empty, because an empty bracket is a bracket round nothing.
  var CONTAINERS = ['checklist', 'ordered-list', 'bullet-list', 'story', 'recipe-head'];
  (function walk(bs) {
    (bs || []).forEach(function (b) {
      if (FACTUAL.indexOf(b.type) >= 0 && !(b.evidence || []).length)
        findings.push(fail('unsupported-claim', b.blockId, 'A factual block with no evidence link.'));
      if (CONTAINERS.indexOf(b.type) >= 0 && !(b.children || []).length)
        findings.push(fail('schema', b.blockId, 'A ' + b.type + ' with no items in it.'));
      if (CONTAINERS.indexOf(b.type) >= 0 && b.text)
        findings.push(fail('schema', b.blockId, 'A container carries text of its own, which is a sentence nobody said.'));
      // The index may only re-quote. A head line that is not marked as a
      // re-quote is a line somebody wrote at the top of her recipe, and a
      // head-field that is not chrome is a label pretending to be her words.
      if (b.type === 'head-line' && b.requote !== true)
        findings.push(fail('unsupported-claim', b.blockId, 'A line in the index that is not a re-quote of a span in the body.'));
      if (b.type === 'head-field' && b.origin !== 'chrome')
        findings.push(fail('schema', b.blockId, 'An index label that is not chrome. Every string on the page that is not hers comes from the locale file.'));
      walk(b.children);
    });
  })(capsule.blocks);

  // 3. approved assets only
  var used = [];
  (capsule.compositions || []).forEach(function (c) {
    (c.intent.clusters || []).forEach(function (cl) { used = used.concat(cl.memberFragmentIds); });
    (c.intent.freeFragments || []).forEach(function (f) { used.push(f.fragmentId); });
  });
  used.forEach(function (id) {
    if (allow.indexOf(id) < 0) findings.push(fail('approved-asset', id, 'A fragment outside the approved allowlist reached a composition.'));
  });

  // 4. font coverage - a missing script is a failed render, never a fallback.
  //
  // The question is whether every script on the page is covered by SOME chosen
  // face, not whether every face covers every script. A Cyrillic transcript with
  // Arabic chrome is set in two families, and that is correct typography rather
  // than a defect.
  (ctx.scripts || []).forEach(function (s) {
    var covered = (capsule.fonts || []).some(function (f) { return f.scriptsCovered.indexOf(s) >= 0; });
    if (!covered) findings.push(fail('font-coverage', s,
      'No chosen face covers ' + s + ', so text in that script cannot be set.', 'reselect'));
  });
  // And every role has to reach every script it is actually asked to set.
  (capsule.compositions || []).forEach(function (c) {
    var byRole = {};
    (c.intent.tokens.typeStack || []).forEach(function (t) { (byRole[t.role] = byRole[t.role] || []).push(t); });
    Object.keys(byRole).forEach(function (role) {
      var faces = byRole[role].map(function (t) {
        return (capsule.fonts || []).filter(function (f) { return f.fontId === t.fontId; })[0];
      }).filter(Boolean);
      (ctx.scripts || []).forEach(function (s) {
        if (!faces.some(function (f) { return f.scriptsCovered.indexOf(s) >= 0; }))
          findings.push(fail('font-coverage', role + '/' + s,
            'The ' + role + ' role has no face covering ' + s + '.', 'reselect'));
      });
    });
  });
  if (model) {
    Object.keys(model.fonts).forEach(function (role) {
      if (model.fonts[role].missing) findings.push(fail('font-coverage', role, 'No registry entry resolved for the ' + role + ' role.', 'reselect'));
    });
  }

  // 5. contrast
  if (model) {
    var pal = model.tokens.palette;
    var cInk = COL.contrast(pal.ink, pal.paperTint);
    if (cInk < 7) findings.push(fail('contrast', 'ink', 'Ink on paper is ' + cInk.toFixed(2) + ':1, below 7:1.', 'retune'));
    (pal.accents || []).forEach(function (a, i) {
      if (COL.contrast(a, pal.paperTint) < 2.2)
        findings.push(fail('contrast', 'accent-' + i, 'Accent ' + i + ' is invisible on this paper.', 'drop'));
    });
  }

  // 6. overflow and collision
  if (model) {
    model.flow.forEach(function (it) {
      if (it.kind !== 'text') return;
      it.lines.forEach(function (ln) {
        if (ln.used > ln.w + 0.75) findings.push(fail('overflow', it.blockId, 'A line exceeds its measure.', 'reflow'));
        if (ln.x < -1 || ln.x + ln.used > model.surface.w + 1)
          findings.push(fail('overflow', it.blockId, 'A line leaves the sheet.', 'reflow'));
      });
      if (!it.lines.length && (it.block.text || '').trim())
        findings.push(fail('overflow', it.blockId, 'A block with text produced no lines.', 'reflow'));
    });
    for (var i = 0; i < model.placements.length; i++) {
      for (var j = i + 1; j < model.placements.length; j++) {
        var a = model.placements[i], b = model.placements[j];
        var ov = GEO.rectsOverlapArea(a, b);
        if (ov / Math.min(a.w * a.h, b.w * b.h) > 0.55)
          findings.push(fail('collision', a.placementId + '+' + b.placementId, 'Two scattered fragments sit on top of each other.', 'respace'));
      }
    }
    // 7. print
    if (model.surface.kind === 'print') {
      var m = model.sizes.pad;
      model.placements.concat(model.banner.items).forEach(function (p) {
        if (p.x < m * 0.2 || p.x + p.w > model.surface.w - m * 0.2)
          findings.push(fail('print', p.placementId || p.fragmentId, 'A fragment is cut off by the sheet edge.', 'inset'));
      });
      // Compared in points, because that is what the rule is written in. The
      // surface's own paper size gives the conversion; a print surface that did
      // not declare one is itself a finding, since the check would otherwise be
      // guessing at the density.
      var pt = model.sizes.point;
      if (pt && pt.assumed) {
        findings.push(fail('print', 'surface', 'This print surface declared no paper size, so the type check assumed ' +
          pt.dpi + ' dots per inch. A sheet whose density is guessed cannot be certified for print.', 'declare'));
      }
      if (!pt) {
        findings.push(fail('print', 'surface', 'A print surface produced no point scale, so type cannot be checked in points.', 'declare'));
      } else {
        [['body', model.sizes.body], ['caption', model.sizes.caption],
         ['section', model.sizes.section], ['display', model.sizes.display]].forEach(function (r) {
          var points = r[1] / pt.pxPerPt;
          if (points < 12) findings.push(fail('print', 'type/' + r[0],
            'The ' + r[0] + ' role sets at ' + points.toFixed(1) + 'pt on this sheet, below the 12pt minimum.', 'enlarge'));
        });
      }
      // 7b. pagination. The engine's keeps run before this, so anything left
      // here is a break the composition could not fix by moving something -
      // which makes it a decision about the material, not a layout retry.
      var pg = model.pagination;
      if (pg) {
        pg.oversize.forEach(function (o) {
          findings.push(fail('pagination', o.blockId, o.because + ' It overruns by ' + o.overrunPx +
            'px on this paper.', 'repaginate'));
        });
        pg.strays.forEach(function (s) {
          findings.push(fail('pagination', s.blockId, s.because, 'repaginate'));
        });
      }
    }
  }

  return { ok: findings.length === 0, findings: findings,
           counts: findings.reduce(function (a, f) { a[f.code] = (a[f.code] || 0) + 1; return a; }, {}) };
}

var API = { validate: validate };

export { validate };
