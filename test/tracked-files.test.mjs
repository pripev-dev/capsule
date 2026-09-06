/**
 * Tracked source and documents must be text, and git must agree.
 *
 * This exists because `test/public-golden.test.mjs` once carried a single
 * literal NUL, written as a separator inside a template string. Nothing failed:
 * the tests passed, the file looked normal in an editor, and the damage was
 * entirely in what git could no longer do with it. A NUL makes git classify a
 * blob as binary, and a binary blob is skipped by `git grep -I`, shows as
 * `-  -` in `--numstat`, and cannot be rendered as a review diff on GitHub - so
 * the file silently stopped being reviewable.
 *
 * A checker cannot rely on noticing that by eye, so it is a test.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Everything git tracks here, or null when git is unavailable. */
function trackedFiles() {
  try {
    return execFileSync("git", ["-C", ROOT, "ls-files", "-z"], { encoding: "utf8" })
      .split("\u0000").filter(Boolean);
  } catch {
    return null;
  }
}

// Extensions whose contents are text by contract. Anything else - were this
// repository ever to carry a font or an image - is deliberately not asserted.
const TEXT = new Set([
  ".mjs", ".js", ".cjs", ".json", ".md", ".yml", ".yaml", ".txt", ".html", ".css",
]);

const files = trackedFiles();

test("no tracked text file contains a NUL byte", { skip: files ? false : "git is not available" }, () => {
  const offenders = [];
  for (const rel of files) {
    if (!TEXT.has(path.extname(rel))) continue;
    const full = path.join(ROOT, rel);
    let raw;
    try {
      if (!statSync(full).isFile()) continue;
      raw = readFileSync(full);
    } catch {
      continue;                       // deleted in the working tree; not our business
    }
    const at = raw.indexOf(0);
    if (at >= 0) offenders.push(`${rel} (first NUL at byte ${at})`);
  }
  assert.deepEqual(offenders, [],
    "a NUL makes git treat the file as binary, which removes it from grep -I and " +
    "from every review diff. Write \\u0000 in source instead of the character.");
});

test("git classifies every tracked text file as text", { skip: files ? false : "git is not available" }, () => {
  // The property that actually matters, asserted through git rather than
  // inferred: `git grep -I` visits text files and skips binary ones, so a file
  // it cannot find its own first line in has been classified as binary - for a
  // NUL or for any other reason.
  const offenders = [];
  for (const rel of files) {
    if (path.extname(rel) !== ".mjs") continue;   // the source this repo is made of
    let raw;
    try { raw = readFileSync(path.join(ROOT, rel), "utf8"); } catch { continue; }
    const firstWord = (raw.match(/[A-Za-z]{6,}/) ?? [])[0];
    if (!firstWord) continue;
    const found = execFileSync(
      "git", ["-C", ROOT, "grep", "-lI", "-e", firstWord, "--", rel],
      { encoding: "utf8" },
    ).trim();
    if (found !== rel) offenders.push(rel);
  }
  assert.deepEqual(offenders, [], "git treats these tracked .mjs files as binary");
});
