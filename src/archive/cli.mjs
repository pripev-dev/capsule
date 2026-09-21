#!/usr/bin/env node
import { readFileSync, statSync } from "node:fs";
import { verifyArchive, ARCHIVE_LIMITS } from "./index.mjs";
import { restoreArchive, verifyDirectory } from "./restore.mjs";

const [command, source, parent, ...extra] = process.argv.slice(2);
try {
  if (!source || extra.length || !["verify", "verify-directory", "restore"].includes(command) ||
      (command === "restore" ? !parent : parent)) {
    throw new Error("Usage: node src/archive/cli.mjs verify <archive.zip> | verify-directory <folder> | restore <archive.zip> <existing-parent>");
  }
  if (command === "verify-directory") {
    const files = verifyDirectory(source);
    console.log(JSON.stringify({ verified: true, files: files.length }));
  } else {
    if (statSync(source).size > ARCHIVE_LIMITS.totalBytes + ARCHIVE_LIMITS.files * 1024) throw new Error("Archive exceeds limits");
    const bytes = readFileSync(source);
    if (command === "restore") console.log(JSON.stringify({ restored: restoreArchive(bytes, parent) }));
    else console.log(JSON.stringify({ verified: true, files: verifyArchive(bytes).length }));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Archive verification failed");
  process.exitCode = 1;
}
