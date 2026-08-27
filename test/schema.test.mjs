/**
 * The negative cases matter more than the positive one.
 *
 * Each takes the valid fixture, changes exactly one thing that the product has
 * promised never to do, and asserts it now fails. A rule nobody can break is
 * not a rule, it is a comment.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  validate,
  checkAll,
  checkNoPixels,
  checkClosure,
  checkApprovedFragmentsOnly,
  checkEvidenceQuotes,
  checkVisualRunBindings,
  visualCandidateIdentity,
} from "../src/validate/index.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(HERE, "../fixtures/minimal-valid");

const load = (name) =>
  JSON.parse(readFileSync(path.join(FIXTURES, name), "utf8"));

const capsule = () => load("capsule.json");
const evidenceMap = () => load("evidence-map.json");
const fragments = () => load("visual-fragments.json");

function v2Fragments() {
  const manifest = fragments();
  manifest.schemaVersion = 2;
  manifest.visualRunId = "vrun_01JQ8XZ4M7N2P5R8T0V3W6Y9AB";
  manifest.pipelineVersion = "visual-v2.0.0";
  manifest.selectionPolicyVersion = "direct-pack-v1";
  manifest.sourceSetSha256 = "b".repeat(64);
  manifest.contextSha256 = "c".repeat(64);
  manifest.budget = {
    currency: "USD",
    cap: 0.25,
    estimated: 0.19,
    actual: 0.18,
    stageCaps: { scout: 0.03, segment: 0.12, curate: 0.08, reserve: 0.02 },
  };
  manifest.modelReceipts = [
    {
      provider: "openai",
      model: "gpt-5.6-luna",
      purpose: "scout",
      promptVersion: "capsule-scout-v1",
      inputUnits: 1200,
      outputUnits: 300,
      currency: "USD",
      amount: 0.001,
    },
  ];
  manifest.items = manifest.items.map((item) => {
    const bound = {
      ...item,
      visualRunId: manifest.visualRunId,
      selectionOrigin: "automatic-recommended",
      reviewedCanonicalAlphaSha256: item.alphaPngSha256,
      reviewedRenderSha256: item.alphaPngSha256,
    };
    const identity = visualCandidateIdentity(manifest, bound);
    return {
      ...bound,
      id: identity.candidateId,
      candidateId: identity.candidateId,
      candidateIdentitySha256: identity.sha256,
    };
  });
  return manifest;
}

/** Mutate a clone, then report the failures it produces. */
function broken(mutate, extras = {}) {
  const doc = capsule();
  mutate(doc);
  return checkAll(doc, {
    evidenceMap: evidenceMap(),
    fragmentManifest: fragments(),
    ...extras,
  });
}

test("the reference capsule passes every check", () => {
  const failures = checkAll(capsule(), {
    evidenceMap: evidenceMap(),
    fragmentManifest: fragments(),
  });
  assert.deepEqual(failures, []);
});

test("the sibling manifests validate", () => {
  for (const [file, schema] of [
    ["evidence-map.json", "evidence-map.schema.json"],
    ["visual-fragments.json", "visual-fragment-manifest.schema.json"],
  ]) {
    const result = validate(schema, load(file));
    assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
  }
});

test("a V2 fragment manifest binds every reviewed asset to an immutable visual run", () => {
  const manifest = v2Fragments();
  const result = validate("visual-fragment-manifest.schema.json", manifest);
  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
  assert.deepEqual(checkVisualRunBindings(manifest), []);
});

test("a V2 fragment cannot omit the reviewed artifact hashes", () => {
  const manifest = v2Fragments();
  delete manifest.items[0].reviewedRenderSha256;
  const result = validate("visual-fragment-manifest.schema.json", manifest);
  assert.equal(result.valid, false, "a decision detached from its reviewed render was accepted");
});

test("a V2 generated manifest records safe references and a similarity result", () => {
  const manifest = {
    schemaVersion: 2,
    assetType: "generated-source-derived-sticker",
    status: "approved",
    capsuleId: "cap_01JQ8XZ4M7N2P5R8T0V3W6Y9AB",
    generatedAt: "2026-08-27T10:40:00Z",
    visualRunId: "vrun_01JQ8XZ4M7N2P5R8T0V3W6Y9AB",
    pipelineVersion: "visual-v2.0.0",
    selectionPolicyVersion: "generated-pack-v1",
    sourceSetSha256: "d".repeat(64),
    contextSha256: "e".repeat(64),
    budget: {
      currency: "USD",
      cap: 1,
      estimated: 0.5,
      actual: 0.5,
      stageCaps: { scout: 0, segment: 0.04, curate: 0, reserve: 0.02 },
    },
    modelReceipts: [],
    items: [
      {
        id: "gen_placeholder",
        assetType: "generated-source-derived-sticker",
        sourceImageIds: ["art_family_plate"],
        prompt: "Four source-derived floral accents on a removable field",
        promptVersion: "generated-accents-v1",
        model: "gpt-image-2",
        modelSnapshotWhenAvailable: "gpt-image-2-2026-04-21",
        generatedAt: "2026-08-27T10:40:00Z",
        outputPath: "visuals/generated-derivatives/gen_tile_flower.png",
        outputSha256: "f".repeat(64),
        usageReceipt: {
          units: "images",
          inputUnits: 1,
          outputUnits: 1,
          currency: "USD",
          amount: 0.5,
        },
        derivationLabel: "generated-source-derived — not a piece of the original",
        reviewDecision: "approved",
        publicUseApproved: false,
        visualRunId: "vrun_01JQ8XZ4M7N2P5R8T0V3W6Y9AB",
        candidateId: "gen_placeholder",
        candidateIdentitySha256: "1".repeat(64),
        selectionOrigin: "automatic-recommended",
        reviewedOutputSha256: "f".repeat(64),
        referenceProvenance: [
          {
            imageId: "art_tile_reference",
            sha256: "2".repeat(64),
            kind: "tile",
            containsPrivateScene: false,
            confirmedByPersonId: "per_creator",
            confirmedAt: "2026-08-27T10:39:00Z",
          },
        ],
        similarityCheck: { passed: true, maxSimilarity: 0.21, reasons: [] },
      },
    ],
  };
  const identity = visualCandidateIdentity(manifest, manifest.items[0]);
  manifest.items[0].id = identity.candidateId;
  manifest.items[0].candidateId = identity.candidateId;
  manifest.items[0].candidateIdentitySha256 = identity.sha256;
  const result = validate("visual-fragment-manifest.schema.json", manifest);
  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
  assert.deepEqual(checkVisualRunBindings(manifest), []);
});

test("changing a reviewed pixel hash invalidates a V2 candidate", () => {
  const manifest = v2Fragments();
  manifest.items[0].alphaPngSha256 = "7".repeat(64);
  assert.ok(checkVisualRunBindings(manifest).some((failure) => /identity|reviewed alpha/.test(failure)));
});

test("a private scene cannot be declared as a generated visual reference", () => {
  const manifest = {
    ...v2Fragments(),
    assetType: "generated-source-derived-sticker",
    items: [],
  };
  // The generated-item fixture above proves the positive shape; the schema's
  // `false` constant is what makes this policy non-negotiable.
  const schema = JSON.parse(readFileSync(path.resolve(FIXTURES, "../../schemas/visual-fragment-manifest.schema.json"), "utf8"));
  assert.equal(
    schema.$defs.generatedSticker.properties.referenceProvenance.items.properties.containsPrivateScene.const,
    false,
  );
});

test("a factual block cannot exist without evidence", () => {
  const failures = broken((d) => {
    d.blocks.find((b) => b.blockId === "blk_rest").evidence = [];
  });
  assert.ok(failures.some((f) => f.includes("/blocks/4/evidence")), failures.join("\n"));
});

test("a normalised estimate cannot stand alone", () => {
  const failures = broken((d) => {
    d.claims.push({
      claimId: "clm_orphan",
      kind: "household-measure",
      truth: "interpreted",
      text: "250 ml",
      evidence: ["ev_0001"],
    });
  });
  assert.ok(
    failures.some((f) => f.includes("derivedFrom") || f.includes("presentationOnly")),
    failures.join("\n"),
  );
});

test("an unresolved claim cannot carry text", () => {
  const failures = broken((d) => {
    d.claims.find((c) => c.claimId === "clm_pan_temp").text = "medium heat";
  });
  assert.ok(failures.some((f) => f.includes("schema")), failures.join("\n"));
});

test("a contradiction must name what it contradicts", () => {
  const failures = broken((d) => {
    d.claims.find((c) => c.claimId === "clm_buttermilk").truth = "contradicted";
  });
  assert.ok(failures.some((f) => f.includes("conflictsWith")), failures.join("\n"));
});

test("pixels cannot enter composition intent", () => {
  const doc = capsule();
  doc.compositions[0].intent.clusters[0].eligibleZones = ["margin: 12px"];
  // eligibleZones is not on clusters, so put it where it would really be tried:
  doc.compositions[0].intent.freeFragments[0].eligibleZones = ["margin-outer", "left: 240px"];
  const offences = checkNoPixels(doc);
  assert.ok(offences.length > 0, "a px value in an eligible zone was accepted");
});

test("a font family string cannot replace a font identifier", () => {
  const doc = capsule();
  doc.compositions[0].intent.freeFragments[0].eligibleZones = ["font-family: Georgia"];
  assert.ok(checkNoPixels(doc).length > 0);
});

test("rendered output cannot be marked canonical", () => {
  const failures = broken((d) => {
    d.renderings[0].canonical = true;
  });
  assert.ok(failures.some((f) => f.includes("/renderings/0/canonical")), failures.join("\n"));
});

test("a composition cannot use an unapproved fragment", () => {
  const doc = capsule();
  doc.compositions[0].intent.clusters[0].memberFragmentIds.push("frg_never_reviewed");
  const offences = checkApprovedFragmentsOnly(doc);
  assert.equal(offences.length, 1);
  assert.equal(offences[0].id, "frg_never_reviewed");
});

test("every identifier must resolve", () => {
  const doc = capsule();
  doc.blocks[0].evidence = ["ev_does_not_exist"];
  const dangling = checkClosure(doc, {
    evidenceMap: evidenceMap(),
    fragmentManifest: fragments(),
  });
  assert.ok(dangling.some((d) => d.id === "ev_does_not_exist"), JSON.stringify(dangling));
});

test("an evidence quote that drifted is a hard error", () => {
  const doc = capsule();
  const map = evidenceMap();
  map.records[0].quote = "a generous splash of buttermilk";
  const broken = checkEvidenceQuotes(doc, map);
  assert.equal(broken.length, 1);
  assert.match(broken[0].reason, /does not match/);
});

test("a public capsule needs its second confirmation", () => {
  const failures = broken((d) => {
    d.access.visibility = "public";
  });
  assert.ok(failures.some((f) => f.includes("publicConsent")), failures.join("\n"));
});

test("there is no third visibility state", () => {
  const failures = broken((d) => {
    d.access.visibility = "unlisted";
  });
  assert.ok(failures.some((f) => f.includes("/access/visibility")), failures.join("\n"));
});

test("a capsule needs at least one recording", () => {
  const failures = broken((d) => {
    d.recordings = [];
  });
  assert.ok(failures.some((f) => f.includes("/recordings")), failures.join("\n"));
});

test("a capsule before composition may not carry blocks", () => {
  const failures = broken((d) => {
    d.stage = "transcript-review";
  });
  assert.ok(failures.length > 0, "an incomplete capsule was allowed to carry a composed page");
});

test("a family correction never replaces its parent transcript", () => {
  const doc = capsule();
  const result = validate("capsule.schema.json", doc);
  assert.equal(result.valid, true);
  const corrected = doc.transcripts.find((t) => t.kind === "family-corrected");
  assert.ok(doc.transcripts.some((t) => t.transcriptId === corrected.parentTranscriptId),
    "the parent transcript was not retained alongside the correction");
});

test("a machine transcript cannot carry corrections", () => {
  const failures = broken((d) => {
    d.transcripts[0].corrections = [];
  });
  assert.ok(failures.some((f) => f.includes("schema")), failures.join("\n"));
});

// --- Paper physicality, added in Phase B ------------------------------------
// A cutout has to look torn out of a magazine rather than cut by a machine.
// The risk that creates is that the tearing gets baked into the preserved
// alpha, which cannot be undone when the treatment vocabulary changes.

test("a paper treatment is parameters, not pixels", () => {
  const manifest = fragments();
  const item = manifest.items[0];
  item.paperTreatment = { treatment: "torn", seed: 4211, borderRetentionPx: 12, appliedTo: "derivative" };
  assert.equal(validate("visual-fragment-manifest.schema.json", manifest).valid, true);
});

test("a treatment cannot claim to have been applied to the canonical alpha", () => {
  const manifest = fragments();
  manifest.items[0].paperTreatment = { treatment: "torn", seed: 1, appliedTo: "canonical" };
  const result = validate("visual-fragment-manifest.schema.json", manifest);
  assert.equal(result.valid, false, "the canonical matte must survive the treatment");
});

test("an unknown treatment is refused rather than passed through", () => {
  const manifest = fragments();
  manifest.items[0].paperTreatment = { treatment: "artistic-vibe", seed: 1 };
  assert.equal(validate("visual-fragment-manifest.schema.json", manifest).valid, false);
});

test("the treated render lives with the approved cutouts, not loose", () => {
  const manifest = fragments();
  manifest.items[0].paperRenderPath = "tmp/scratch/render.png";
  assert.equal(validate("visual-fragment-manifest.schema.json", manifest).valid, false);
});

test("fragment quality is measured, and its verdict is a closed set", () => {
  const manifest = fragments();
  manifest.items[0].quality = {
    components: 5,
    coverage: 0.004,
    holeShare: 0,
    largestShare: 0.6,
    edgeContact: 0,
    verdict: "unusable",
  };
  assert.equal(validate("visual-fragment-manifest.schema.json", manifest).valid, true);

  manifest.items[0].quality.verdict = "probably fine";
  assert.equal(validate("visual-fragment-manifest.schema.json", manifest).valid, false);
});
