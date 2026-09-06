#!/usr/bin/env node
/**
 * `npm run check:privacy` - refuse to publish family material.
 *
 * Run this BEFORE you push. The identical check runs in CI, but a CI check on
 * a public branch is detection after publication: by the time the job turns
 * red the blob is already on GitHub, already in its API, and already in
 * whatever fetched it in between. Removing it then needs a history rewrite,
 * not a commit. The CI job exists to catch the push where somebody forgot to
 * run this one - it is the second line, not the first.
 *
 * Cross-platform: Node and git only. No bash, no `grep -P`, no GNU userland,
 * so the same command runs on the Windows development machine and on
 * ubuntu-latest and cannot pass in one place while failing in the other.
 *
 *   node src/privacy/cli.mjs [--root <dir>] [--allowlist <file>] [--json]
 *
 * `--root` lets the checker be pointed at any git checkout, which is how the
 * negative-control tests scan a purpose-built temporary repository rather than
 * asserting against a mock.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";
import { checkPrivacy, formatReport } from "./check.mjs";

/** Everything git tracks, as forward-slash relative paths. */
export function trackedFiles(root) {
  const out = execFileSync("git", ["-C", root, "ls-files", "-z"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.split("\u0000").filter(Boolean).map((f) => f.replace(/\\/g, "/"));
}

export function runOnCheckout(root, allowlistPath) {
  const files = trackedFiles(root);
  const allowlist = existsSync(allowlistPath)
    ? JSON.parse(readFileSync(allowlistPath, "utf8"))
    : {};
  const read = (file) => {
    try {
      return readFileSync(path.join(root, file));
    } catch {
      return null;                                 // staged-deleted; not our business
    }
  };
  const result = checkPrivacy({ files, read, allowlist });
  return { ...result, files };
}

function main(argv) {
  const arg = (name, fallback) => {
    const i = argv.indexOf(name);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
  };
  const root = path.resolve(arg("--root", process.cwd()));
  const allowlistPath = path.resolve(arg("--allowlist", path.join(root, "privacy-allowlist.json")));

  const result = runOnCheckout(root, allowlistPath);
  const failed = result.findings.length + result.stale.length + result.problems.length > 0;

  if (argv.includes("--json")) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    process.stdout.write(formatReport(result, { files: result.files }) + "\n");
  }
  return failed ? 1 : 0;
}

// Run when invoked directly; stay quiet when imported by a test.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
