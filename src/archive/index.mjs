import { createHash } from "node:crypto";
import { zipSync, unzipSync } from "fflate";

// Packaging is deliberately downstream of permission filtering. This module
// never accepts a directory to crawl, credentials, or an object-store handle.
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
export const ARCHIVE_LIMITS = Object.freeze({ files: 4096, fileBytes: 64 * 1024 * 1024, totalBytes: 256 * 1024 * 1024 });
const INDEX = "archive.json";
const CHECKSUMS = "checksums.sha256";

export function archivePath(path) {
  if (typeof path !== "string" || path.length > 240 ||
      !/^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/.test(path)) throw new Error("Unsafe archive path");
  for (const part of path.split("/")) {
    if (part === "." || part === ".." || part.endsWith(".") ||
        /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part)) throw new Error("Unsafe archive path");
  }
  return path;
}

function inventory(limits) {
  const names = new Set();
  let total = 0;
  return (path, size) => {
    archivePath(path);
    const lower = path.toLowerCase();
    if (names.has(lower)) throw new Error("Duplicate archive path");
    for (const existing of names) {
      if (lower.startsWith(existing + "/") || existing.startsWith(lower + "/")) throw new Error("Archive path collision");
    }
    names.add(lower);
    total += size;
    if (!Number.isSafeInteger(size) || size < 0 || size > limits.fileBytes ||
        total > limits.totalBytes || names.size > limits.files) throw new Error("Archive exceeds limits");
  };
}

/** Deterministic ZIP containing only explicitly supplied, already authorised bytes. */
export function createArchive(entries, limits = ARCHIVE_LIMITS) {
  const check = inventory(limits);
  const files = Object.create(null);
  const records = [];
  for (const { path, bytes } of [...entries].sort((a, b) => a.path.localeCompare(b.path, "en"))) {
    if (!(bytes instanceof Uint8Array)) throw new Error("Archive bytes are required");
    if ([INDEX, CHECKSUMS].includes(path.toLowerCase())) throw new Error("Reserved archive path");
    check(path, bytes.length);
    files[path] = new Uint8Array(bytes);
    records.push({ path, bytes: bytes.length, sha256: hash(bytes) });
  }
  files[INDEX] = Buffer.from(JSON.stringify({ format: "pripev-archive", version: 1, files: records }, null, 2) + "\n");
  files[CHECKSUMS] = Buffer.from([...records, { path: INDEX, sha256: hash(files[INDEX]) }]
    .map(row => `${row.sha256}  ${row.path}\n`).join(""));
  check(INDEX, files[INDEX].length);
  check(CHECKSUMS, files[CHECKSUMS].length);
  return Buffer.from(zipSync(files, { level: 0, mtime: new Date(1980, 0, 1) }));
}

/** Verify everything before a caller writes any restored bytes. No partial success. */
export function verifyArchive(zip, limits = ARCHIVE_LIMITS) {
  if (!(zip instanceof Uint8Array) || zip.length > limits.totalBytes + limits.files * 1024) throw new Error("Archive exceeds limits");
  const check = inventory(limits);
  // fflate calls filter for each central-directory entry before allocating its
  // output. Reject duplicates and inflated sizes before decompressing anything.
  const files = unzipSync(zip, { filter: entry => { check(entry.name, entry.originalSize); return true; } });
  return verifyContents(files, limits);
}

/** Verify an extracted inventory without recompressing it. */
export function verifyEntries(entries, limits = ARCHIVE_LIMITS) {
  const check = inventory(limits);
  const files = Object.create(null);
  for (const { path, bytes } of entries) {
    if (!(bytes instanceof Uint8Array)) throw new Error("Archive bytes are required");
    check(path, bytes.length);
    files[path] = bytes;
  }
  return verifyContents(files, limits);
}

function verifyContents(files, limits) {
  if (!files[INDEX] || !files[CHECKSUMS]) throw new Error("Archive index is missing");
  const index = JSON.parse(Buffer.from(files[INDEX]).toString("utf8"));
  if (index.format !== "pripev-archive" || index.version !== 1 || !Array.isArray(index.files)) throw new Error("Unsupported archive format");
  const declared = inventory(limits);
  const result = [];
  for (const row of index.files) {
    if (!row || [INDEX, CHECKSUMS].includes(row.path?.toLowerCase())) throw new Error("Invalid archive index");
    declared(row.path, row.bytes);
    const bytes = files[row.path];
    if (!bytes || bytes.length !== row.bytes || hash(bytes) !== row.sha256) throw new Error(`Archive integrity failure: ${row.path}`);
    result.push({ path: row.path, bytes: Buffer.from(bytes) });
  }
  if (Object.keys(files).length !== result.length + 2) throw new Error("Unlisted archive content");
  const expected = [...index.files, { path: INDEX, sha256: hash(files[INDEX]) }]
    .map(row => `${row.sha256}  ${row.path}\n`).join("");
  if (Buffer.from(files[CHECKSUMS]).toString("utf8") !== expected) throw new Error("Checksum list mismatch");
  return [...result, { path: INDEX, bytes: Buffer.from(files[INDEX]) }, { path: CHECKSUMS, bytes: Buffer.from(files[CHECKSUMS]) }];
}
