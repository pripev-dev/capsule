import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createArchive, checkArchiveEntries } from "./index.mjs";
import { offlineHtml } from "./viewer.mjs";
import { validate, checkAll, SCHEMA_DIR } from "../validate/index.mjs";

/** Assemble a reading fallback from an already permission-filtered payload.
 * Reads only fixed package-owned schemas, never caller paths or hosted state.
 */
export function createReadingArchive(entries, font, limits) {
  // Validate names, collisions and bounds before parsing any document.
  checkArchiveEntries(entries, limits);
  const files = new Map(entries.map(entry => [entry.path, entry.bytes]));
  const read = ref => {
    const bytes = files.get(ref?.archivePath);
    if (!bytes || createHash("sha256").update(bytes).digest("hex") !== ref.sha256 ||
        (ref.bytes !== undefined && ref.bytes !== bytes.length)) throw new Error("Reading document reference failed integrity");
    return JSON.parse(Buffer.from(bytes).toString("utf8"));
  };
  const capsuleBytes = files.get("capsule.json");
  if (!capsuleBytes) throw new Error("Reading archive requires capsule.json");
  const capsule = JSON.parse(Buffer.from(capsuleBytes).toString("utf8"));
  if (!validate("capsule.schema.json", capsule).valid) throw new Error("Reading capsule is invalid");
  const evidenceMap = capsule.evidenceMap ? read(capsule.evidenceMap) : undefined;
  const fragmentManifest = capsule.visualPack ? read(capsule.visualPack.manifestRef) : undefined;
  const preservation = read(capsule.preservation.manifestRef);
  if (!validate("preservation-manifest.schema.json", preservation).valid || preservation.capsuleId !== capsule.capsuleId ||
      checkAll(capsule, { evidenceMap, fragmentManifest }).length) throw new Error("Reading documents fail the capsule contract");
  // The ZIP inventory proves bytes survived packaging; these checks also bind
  // included bytes to the canonical source and approved visual references.
  const checkPresent = ref => {
    const bytes = files.get(ref.archivePath);
    if (bytes && (createHash("sha256").update(bytes).digest("hex") !== ref.sha256 ||
        (ref.bytes !== undefined && ref.bytes !== bytes.length))) throw new Error("Reading media reference failed integrity");
  };
  const walk = value => {
    if (!value || typeof value !== "object") return;
    if (typeof value.archivePath === "string" && typeof value.sha256 === "string") checkPresent(value);
    Object.values(value).forEach(walk);
  };
  [capsule, evidenceMap, preservation].forEach(walk);
  for (const item of fragmentManifest?.items ?? []) {
    for (const stem of ["mask", "alphaPng", "contour", "paperRender", "output"]) {
      if (item[`${stem}Path`]) checkPresent({ archivePath: item[`${stem}Path`], sha256: item[`${stem}Sha256`] });
    }
  }
  const html = offlineHtml({ capsule, fragmentManifest, font, paths: [...files.keys()] });
  const schemas = ["capsule", "common", "evidence-map", "preservation-manifest", "visual-fragment-manifest"].map(name => ({
    path: `schemas/${name}.schema.json`, bytes: readFileSync(join(SCHEMA_DIR, `${name}.schema.json`)),
  }));
  const instructions = Buffer.from(`Pripev offline reading copy

Extract the entire archive and keep its folders together. Open viewer/index.html
in a browser. No hosted account or network connection is required for reading.
A font warning means the reading copy has not rendered correctly.

capsule.json retains the canonical words, source references and composition
intent. Schemas are in schemas/. The reader is a plain reading fallback;
it does not reproduce the composed layout or supply a finished PDF.
Media deliberately omitted from this copy is described in capsule.json.
Direct cutouts and generated images remain distinct in the visual manifest.

checksums.sha256 covers each payload and archive.json. Verify every listed
file before relying on a restored copy. Checksums detect corruption; they do
not authenticate an archive whose contents and checksums were both replaced.
The Capsule archive verifier also checks for extra files and unsafe paths.
Restore into a new empty location. Never overwrite your source copy.

This copy contains the material its requester was permitted to export at the
time of preparation. It does not grant publication rights or hosted access.
Keep private family material private. Local copies are not remotely revocable.
The archive is plaintext; protect it as you would the original recordings.
A download does not replace the hosted preservation and backup obligations.
`);
  return createArchive([...entries, ...schemas,
    { path: "README.txt", bytes: instructions },
    { path: "viewer/index.html", bytes: Buffer.from(html) }], limits);
}
