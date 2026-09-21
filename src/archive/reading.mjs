import { createHash } from "node:crypto";
import { createArchive, checkArchiveEntries } from "./index.mjs";
import { offlineHtml } from "./viewer.mjs";
import { validate, checkAll } from "../validate/index.mjs";

/** Assemble a reading fallback from an already permission-filtered payload.
 * No filesystem reads, hosted credentials, URL fetching or authority decisions.
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
  return createArchive([...entries, { path: "viewer/index.html", bytes: Buffer.from(html) }], limits);
}
