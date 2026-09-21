import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync, readdirSync, lstatSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { verifyArchive, verifyEntries, ARCHIVE_LIMITS } from "./index.mjs";

/** Restore into a newly allocated sibling. Never merge into or replace a copy. */
export function restoreArchive(zip, parentDirectory, limits) {
  const entries = verifyArchive(zip, limits);
  const parent = realpathSync(parentDirectory);
  const destination = mkdtempSync(join(parent, "pripev-restored-"));
  try {
    for (const { path, bytes } of entries) {
      const target = join(destination, ...path.split("/"));
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, bytes, { flag: "wx" });
    }
    return destination;
  } catch (error) {
    // Only our freshly allocated directory is removed; neither source nor a
    // pre-existing destination can ever enter this cleanup path.
    rmSync(destination, { recursive: true, force: true });
    throw error;
  }
}


/** Verify an extracted copy without following symlinks or executing its viewer. */
export function verifyDirectory(directory, limits = ARCHIVE_LIMITS) {
  const root = realpathSync(directory);
  const entries = [];
  let total = 0;
  let visited = 0;
  const walk = (relative = "") => {
    for (const item of readdirSync(join(root, relative), { withFileTypes: true })) {
      if (++visited > limits.files * 2) throw new Error("Archive exceeds limits");
      const path = relative ? `${relative}/${item.name}` : item.name;
      const file = join(root, path);
      const stat = lstatSync(file);
      if (stat.isSymbolicLink()) throw new Error("Archive contains a symbolic link");
      if (stat.isDirectory()) { walk(path); continue; }
      if (!stat.isFile()) throw new Error("Archive contains a non-file entry");
      total += stat.size;
      if (stat.size > limits.fileBytes || total > limits.totalBytes || entries.length >= limits.files) throw new Error("Archive exceeds limits");
      entries.push({ path, bytes: readFileSync(file) });
    }
  };
  walk();
  return verifyEntries(entries, limits);
}
