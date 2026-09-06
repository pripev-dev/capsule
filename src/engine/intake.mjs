// engine/intake.js - the handoff contract, read.
//
// This adapts the Visual Pipeline V2 bundle shape into the shapes the skills and
// the engine consume. It is format adaptation and nothing else: it reads no
// label, makes no decision, and contains nothing about any particular capsule.
//
// If the handoff shape changes, this is the only file that changes.

function fragments(manifest, contours) {
  return (manifest.items || manifest.fragments || [])
    .filter(function (it) { return it.reviewDecision === 'approved' || it.reviewDecision == null; })
    .map(function (it) {
      var lab = it.label || {};
      var box = (it.sourceTransform && it.sourceTransform.normalizedBox) || [0, 0, 1, 1];
      var wPx = (box[2] - box[0]) * ((it.sourceTransform && it.sourceTransform.sourceWidth) || 1);
      var hPx = (box[3] - box[1]) * ((it.sourceTransform && it.sourceTransform.sourceHeight) || 1);
      var c = contours[it.id];
      return {
        fragmentId: it.id,
        label: lab.display || '', subjectHint: lab.object || '',
        tags: [lab.material || ''].concat(lab.eligibleRoles || []),
        compositionWeight: lab.visualWeight || 'medium',
        eligibleRoles: lab.eligibleRoles || ['free'],
        blendMode: it.outputMode === 'sticker' ? 'normal' : 'multiply',
        edgeTreatment: (it.paperTreatment && it.paperTreatment.treatment) || '',
        quality: it.quality || null,
        sourceImageId: it.sourceImageId,
        boundingBox: { width: Math.max(1, wPx), height: Math.max(1, hPx) },
        assets: { alphaPng: it.paperRenderPath || it.alphaPngPath, mask: it.maskPath },
        contour: (c && (c.contour || c.normalized || c.points)) || null,
        approved: it.reviewDecision === 'approved'
      };
    });
}

// Palettes arrive per source image. A fragment names its source image, so the
// colours that reach a page are the colours of the photographs that page's own
// fragments came out of.
function palettesForFragments(bundle, frags) {
  var ids = {}; frags.forEach(function (f) { ids[f.sourceImageId] = true; });
  var out = [];
  (bundle.palettes || []).forEach(function (p) {
    if (!ids[p.sourceImageId]) return;
    var owner = frags.filter(function (f) { return f.sourceImageId === p.sourceImageId; })[0];
    out.push({ fragmentId: owner ? owner.fragmentId : null, sourceImageId: p.sourceImageId,
               provenance: p.provenance, swatches: p.colours || [] });
  });
  return out;
}

// Every palette in the bundle, for a job whose pages have no fragments at all -
// the family photographed their kitchen even if nothing was cut out of it.
function allPalettes(bundle) {
  return (bundle.palettes || []).map(function (p) {
    return { fragmentId: null, sourceImageId: p.sourceImageId, provenance: p.provenance, swatches: p.colours || [] };
  });
}

function recordings(bundle, texts, audio) {
  var byKey = {};
  ((audio && audio.recordings) || []).forEach(function (r) { byKey[r.recordingKey] = r; });
  return (bundle.transcripts || []).map(function (t, i) {
    var key = (t.path || '').replace(/^.*\//, '').replace(/\.txt$/, '');
    var a = byKey[key] || {};
    return {
      recordingId: 'rec_' + key, recordingKey: key, path: t.path,
      text: (texts[t.path] || '').trim(),
      durationSeconds: a.durationSeconds || 0,
      waveformPeaks: a.waveformPeaks || null,
      audioPath: a.path || null,
      familyCorrected: !!t.familyCorrected, approvedAt: t.approvedAt,
      isAddition: !!t.isAddition, order: i
    };
  });
}

function approvedFragmentIds(manifest) {
  return (manifest.items || []).filter(function (i) { return i.reviewDecision === 'approved'; })
                               .map(function (i) { return i.id; });
}

var API = { fragments: fragments, palettesForFragments: palettesForFragments,
            allPalettes: allPalettes, recordings: recordings, approvedFragmentIds: approvedFragmentIds };

export { fragments, palettesForFragments, allPalettes, recordings, approvedFragmentIds };
