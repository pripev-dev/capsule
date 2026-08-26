/**
 * Schema compilation plus the four checks JSON Schema cannot express.
 *
 * A schema can say a field is a number between 0 and 1. It cannot say that
 * every identifier in the document resolves, that no CSS hides in a string,
 * that a quote still matches its transcript, or that a composition only cites
 * approved fragments. Those are the promises worth keeping, so they are code.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SCHEMA_DIR = path.resolve(HERE, "../../schemas");

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

for (const file of readdirSync(SCHEMA_DIR).filter((f) => f.endsWith(".json"))) {
  const schema = JSON.parse(readFileSync(path.join(SCHEMA_DIR, file), "utf8"));
  // Registered under the bare filename so that `$ref: "common.schema.json#/..."`
  // resolves without every schema needing an absolute base URI.
  ajv.addSchema(schema, file);
}

const compiled = new Map();

/** Compile (once) and return a validator for one schema file. */
export function validator(schemaFile) {
  if (!compiled.has(schemaFile)) {
    compiled.set(schemaFile, ajv.getSchema(schemaFile));
  }
  const fn = compiled.get(schemaFile);
  if (!fn) throw new Error(`No schema registered as ${schemaFile}`);
  return fn;
}

/** Validate a document, returning `{ valid, errors }` with readable paths. */
export function validate(schemaFile, document) {
  const fn = validator(schemaFile);
  const valid = fn(document);
  return {
    valid,
    errors: (fn.errors ?? []).map((e) => ({
      path: e.instancePath || "/",
      keyword: e.keyword,
      message: e.message,
      params: e.params,
    })),
  };
}

const ID_PREFIXES = [
  "cap", "fam", "per", "rec", "art", "tr", "seg", "ev", "clm",
  "blk", "frg", "gen", "clu", "plc", "ed", "cmp", "ver", "fnt", "clr",
];
const ID_RE = new RegExp(`^(${ID_PREFIXES.join("|")})_[0-9A-Za-z_-]{1,40}$`);

// A unit after a number, CSS punctuation, or a CSS declaration. Matching the
// bare word would reject the legitimate zone name "margin-outer", so property
// names are only an offence when followed by their colon.
const CSS_RE = new RegExp(
  [
    String.raw`\d\s*(px|rem|em|vh|vw|pt|%)(\b|$)`,
    String.raw`[{};]`,
    String.raw`\bcalc\(`,
    String.raw`\b(grid|flex|margin|padding|font-family|position|display|top|left|right|bottom|width|height)\s*:`,
  ].join("|"),
  "i",
);

function walk(node, visit, pointer = "") {
  visit(node, pointer);
  if (Array.isArray(node)) {
    node.forEach((child, i) => walk(child, visit, `${pointer}/${i}`));
  } else if (node && typeof node === "object") {
    for (const [key, child] of Object.entries(node)) {
      walk(child, visit, `${pointer}/${key}`);
    }
  }
}

/**
 * Every prefixed identifier used anywhere must be declared somewhere.
 *
 * This is what makes offline reconstruction verifiable: a viewer with no
 * database can prove that nothing in the document points into thin air.
 */
export function checkClosure(capsule, { evidenceMap, fragmentManifest } = {}) {
  const declared = new Set();
  const declare = (id) => { if (typeof id === "string") declared.add(id); };

  declare(capsule.capsuleId);
  declare(capsule.familySpaceId);
  for (const p of capsule.people ?? []) declare(p.personId);
  for (const r of capsule.recordings ?? []) declare(r.recordingId);
  for (const a of capsule.artifacts ?? []) declare(a.artifactId);
  for (const t of capsule.transcripts ?? []) {
    declare(t.transcriptId);
    for (const s of t.segments ?? []) declare(s.segmentId);
  }
  for (const c of capsule.claims ?? []) declare(c.claimId);
  for (const c of capsule.clarifications ?? []) declare(c.clarificationId);
  for (const e of capsule.editions ?? []) declare(e.editionId);
  for (const f of capsule.fonts ?? []) declare(f.fontId);
  declare(capsule.version?.versionId);
  for (const v of capsule.versionGraph ?? []) declare(v.versionId);
  for (const c of capsule.compositions ?? []) {
    declare(c.compositionId);
    for (const cl of c.intent?.clusters ?? []) declare(cl.clusterId);
    for (const fp of c.intent?.freeFragments ?? []) declare(fp.placementId);
  }
  const declareBlocks = (blocks) => {
    for (const b of blocks ?? []) {
      declare(b.blockId);
      declareBlocks(b.children);
    }
  };
  declareBlocks(capsule.blocks);
  for (const id of capsule.visualPack?.approvedFragmentIds ?? []) declare(id);
  for (const r of evidenceMap?.records ?? []) declare(r.evidenceId);
  for (const i of fragmentManifest?.items ?? []) declare(i.id);

  const dangling = [];
  walk(capsule, (node, pointer) => {
    if (typeof node === "string" && ID_RE.test(node) && !declared.has(node)) {
      dangling.push({ pointer, id: node });
    }
  });
  return dangling;
}

/**
 * No pixel coordinates and no CSS anywhere in the artifact plane.
 *
 * The agent declares roles, density and seeds. The engine computes geometry.
 * Without this the boundary is a convention, and conventions erode.
 */
export function checkNoPixels(capsule) {
  const offences = [];
  for (const [i, composition] of (capsule.compositions ?? []).entries()) {
    const scope = {
      clusters: composition.intent?.clusters,
      freeFragments: composition.intent?.freeFragments,
      userAdjustments: composition.intent?.userAdjustments,
      realized: composition.realized,
    };
    walk(scope, (node, pointer) => {
      if (typeof node === "string" && CSS_RE.test(node)) {
        offences.push({ pointer: `/compositions/${i}${pointer}`, value: node });
      }
    });
  }
  return offences;
}

/**
 * A composition may only cite fragments the family approved.
 *
 * Unapproved material cannot reach a page by construction rather than by
 * anyone remembering to check.
 */
export function checkApprovedFragmentsOnly(capsule) {
  const approved = new Set(capsule.visualPack?.approvedFragmentIds ?? []);
  const used = [];
  for (const [i, composition] of (capsule.compositions ?? []).entries()) {
    for (const cluster of composition.intent?.clusters ?? []) {
      for (const id of cluster.memberFragmentIds ?? []) {
        used.push({ pointer: `/compositions/${i}/intent/clusters`, id });
      }
    }
    for (const fp of composition.intent?.freeFragments ?? []) {
      used.push({ pointer: `/compositions/${i}/intent/freeFragments`, id: fp.fragmentId });
    }
    for (const id of composition.intent?.tokens?.palette?.sampledFromFragmentIds ?? []) {
      used.push({ pointer: `/compositions/${i}/intent/tokens/palette`, id });
    }
  }
  return used.filter(({ id }) => !approved.has(id));
}

/**
 * Every evidence quote must still be the exact substring it claims to be.
 *
 * An evidence link that silently drifted is worse than a missing one: it
 * produces a plausible sentence with nothing behind it.
 */
export function checkEvidenceQuotes(capsule, evidenceMap) {
  const segments = new Map();
  for (const t of capsule.transcripts ?? []) {
    for (const s of t.segments ?? []) {
      segments.set(`${t.transcriptId}:${s.segmentId}`, s.text);
    }
  }
  const broken = [];
  for (const record of evidenceMap?.records ?? []) {
    const text = segments.get(`${record.transcriptId}:${record.segmentId}`);
    if (text === undefined) {
      broken.push({ evidenceId: record.evidenceId, reason: "segment not found" });
      continue;
    }
    const slice = text.slice(record.charStart, record.charEnd);
    if (slice !== record.quote) {
      broken.push({
        evidenceId: record.evidenceId,
        reason: "quote does not match the transcript span",
        expected: record.quote,
        found: slice,
      });
    }
  }
  return broken;
}

/** Everything, in one call. Returns a list of human-readable failures. */
export function checkAll(capsule, { evidenceMap, fragmentManifest } = {}) {
  const failures = [];
  const schema = validate("capsule.schema.json", capsule);
  for (const e of schema.errors) {
    failures.push(`schema ${e.path}: ${e.message}`);
  }
  for (const d of checkClosure(capsule, { evidenceMap, fragmentManifest })) {
    failures.push(`dangling identifier ${d.id} at ${d.pointer}`);
  }
  for (const o of checkNoPixels(capsule)) {
    failures.push(`geometry or CSS leaked into composition intent at ${o.pointer}: ${o.value}`);
  }
  for (const u of checkApprovedFragmentsOnly(capsule)) {
    failures.push(`unapproved fragment ${u.id} used at ${u.pointer}`);
  }
  if (evidenceMap) {
    for (const b of checkEvidenceQuotes(capsule, evidenceMap)) {
      failures.push(`evidence ${b.evidenceId}: ${b.reason}`);
    }
  }
  return failures;
}
