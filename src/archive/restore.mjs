import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { join, dirname } from "node:path";
import { verifyArchive } from "./index.mjs";

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
