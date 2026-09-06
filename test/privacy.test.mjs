/**
 * The privacy guard, proved by making it fail.
 *
 * A guard that has only ever been run against a clean repository is a guard
 * nobody has tested. Its predecessor is the reason this file exists: it
 * announced in its own comment that it kept the family's photographs out of a
 * public repository, and it matched five audio extensions and nothing else. It
 * had been green on every build, which told us nothing at all.
 *
 * So each category below builds a real temporary git repository, commits a file
 * that ought to be refused, runs the real command against it, and asserts the
 * refusal names the right rule. Not a mock: `git ls-files` enumerates it, the
 * CLI reads it, the rule table judges it. The one test that runs against THIS
 * repository asserts the opposite - that a checkout everybody is expected to
 * publish comes back clean.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { checkPrivacy, normaliseAllowlist } from "../src/privacy/check.mjs";
import { RULE_IDS } from "../src/privacy/rules.mjs";
import { runOnCheckout } from "../src/privacy/cli.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

/** Is git usable at all? Everything here is git-mediated on purpose. */
const HAS_GIT = (() => {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();
const NEEDS_GIT = { skip: HAS_GIT ? false : "git is not available" };

/**
 * A throwaway repository containing exactly the files given.
 *
 * `files` maps a relative path to a string or a Buffer. Directories are made as
 * needed. The repository is committed because the guard reads the index, and an
 * uncommitted-but-added file is enough for `git ls-files` - but committing is
 * what the real case looks like, so that is what is exercised.
 */
function repoWith(files, allowlist) {
  const dir = mkdtempSync(path.join(tmpdir(), "pripev-privacy-"));
  execFileSync("git", ["-C", dir, "init", "-q", "-b", "main"]);
  execFileSync("git", ["-C", dir, "config", "user.email", "test@example.invalid"]);
  execFileSync("git", ["-C", dir, "config", "user.name", "Privacy Test"]);
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  if (allowlist) writeFileSync(path.join(dir, "privacy-allowlist.json"), JSON.stringify(allowlist, null, 2));
  execFileSync("git", ["-C", dir, "add", "-A"]);
  execFileSync("git", ["-C", dir, "commit", "-q", "-m", "fixture"]);
  return dir;
}

/** Run the real checker over a throwaway repository and return its findings. */
function scan(files, allowlist) {
  const dir = repoWith(files, allowlist);
  try {
    return runOnCheckout(dir, path.join(dir, "privacy-allowlist.json"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const rulesHit = (result) => [...new Set(result.findings.map((f) => f.rule))].sort();

// --- the negative controls -------------------------------------------------
//
// One per category the guard claims to cover. A category with no failing case
// here is a category nobody has evidence for.

const CASES = [
  ["media-audio", { "notes/grandma.ogg": "RIFF" }],
  ["media-audio", { "clip.m4a": "x" }],
  ["media-video", { "kitchen.mov": "x" }],
  ["media-image", { "docs/cake.jpg": "x" }],
  // SVG is text, which is exactly why it is easy to miss: a traced recipe card
  // is an image no reviewer's eye registers as one in a diff.
  ["media-image", { "assets/card.svg": "<svg xmlns='http://www.w3.org/2000/svg'/>" }],
  ["archive", { "export.zip": "PK" }],
  ["archive", { "design-export.tar.gz": "x" }],
  ["binary-asset", { "fonts/Playfair.woff2": "x" }],
  ["private-path", { "fixtures/layered-cake/notes.json": "{}" }],
  ["private-path", { "test/fixtures/a.json": "{}" }],
  ["private-path", { "handoff/bundle.json": "{}" }],
  ["private-path", { "runtime/jobs/j1/state.json": "{}" }],
  ["private-path", { "transcripts/rec1.json": "{}" }],
  ["private-path", { "visual-runs/vrun_x/manifest.json": "{}" }],
  ["credential-name", { ".env": "OPENAI_API_KEY=x" }],
  ["credential-name", { "deploy/id_ed25519": "x" }],
  ["credential-name", { "certs/server.pem": "x" }],
  ["fingerprint-list", { "source-hashes.txt": "abc" }],
  ["fingerprint-list", { "docs/audio-digests.json": "{}" }],
  // Every credential fixture below is BUILT by concatenation rather than
  // written out. A literal one would be a genuine match inside a tracked
  // file, so this repository's own privacy check would refuse the very test
  // that proves the check works - leaving a permanent exemption or a deleted
  // test as the only ways out. The bytes the temporary repository receives
  // are identical; only this file's own bytes differ.
  ["credential-content", { "src/config.mjs": `const k = "${"sk" + "-"}${"a".repeat(32)}";` }],
  ["credential-content", { "README.md": `token: ${"ghp" + "_"}${"b".repeat(28)}` }],
  ["credential-content", { "src/aws.mjs": `const id = "${"AK" + "IA"}${"C".repeat(16)}";` }],
  ["credential-content", { "key.txt.md": `${"-----BEGIN"} OPENSSH PRIVATE ${"KEY" + "-----"}` }],
  // Built with an explicit byte rather than an escaped literal, so this file
  // cannot itself acquire the very defect it is testing for. It did, once,
  // when the escape was written into the source: see tracked-files.test.mjs.
  ["nul-byte", { "src/tool.mjs": Buffer.concat([
    Buffer.from('const separator = "', "utf8"),
    Buffer.from([0]),
    Buffer.from('";' + String.fromCharCode(10), "utf8"),
  ]) }],
  // Same reasoning: a sentence long enough to trip the rule, assembled from
  // words that individually are not. The fixture is invented, not quoted.
  ["cyrillic-prose", { "docs/notes.md":
    ["она", "говорила", "что", "тесто", "должно", "постоять"].join(" ") }],
];

for (const [expected, files] of CASES) {
  const name = Object.keys(files)[0];
  test(`refuses ${name} under ${expected}`, NEEDS_GIT, () => {
    const result = scan(files);
    assert.ok(rulesHit(result).includes(expected),
      `expected rule ${expected}; got ${JSON.stringify(rulesHit(result))} for ${name}`);
  });
}

test("every rule has at least one negative control", NEEDS_GIT, () => {
  const covered = new Set(CASES.map(([rule]) => rule));
  assert.deepEqual(RULE_IDS.filter((id) => !covered.has(id)), [],
    "a rule with no failing case is a rule with no evidence");
});

// --- the positive control --------------------------------------------------

test("an ordinary source file is not refused", NEEDS_GIT, () => {
  const result = scan({
    "src/index.mjs": "export const two = 1 + 1;\n",
    "README.md": "# Title\n\nProse.\n",
    "package.json": '{"name":"x"}\n',
  });
  assert.deepEqual(result.findings, []);
});

test("short generic Cyrillic code literals are not prose and are not refused", NEEDS_GIT, () => {
  // This repository really does contain Cyrillic, and saying it does not would
  // be false. `textlayout.mjs` carries 'mwшщжю' as a glyph-width bucket and
  // engine-arithmetic asserts directionOf("торт") is ltr. Six characters and
  // four: general vocabulary in a width table, not anybody's transcript. The
  // threshold is set at twelve consecutive characters so the distinction is a
  // property of the rule rather than a standing exemption.
  const result = scan({
    "src/textlayout.mjs": "if ('mwшщжю'.indexOf(c) >= 0) w += 82;\n",
    "test/a.test.mjs": 'assert.equal(directionOf("торт"), "ltr");\n',
  });
  assert.deepEqual(result.findings, []);
});

// --- the allowlist ---------------------------------------------------------

test("an allowlisted exact path is exempt from that rule only", NEEDS_GIT, () => {
  const files = {
    "fixtures/public/narration.wav": "RIFF",
    "fixtures/public/other.wav": "RIFF",
  };
  const allowlist = {
    "media-audio": ["fixtures/public/narration.wav"],
    "private-path": ["fixtures/public/narration.wav", "fixtures/public/other.wav"],
  };
  const result = scan(files, allowlist);

  // The allowlisted file is clear; its neighbour is still refused as audio.
  assert.deepEqual(result.findings.map((f) => `${f.rule} ${f.file}`),
    ["media-audio fixtures/public/other.wav"]);
});

test("an allowlist entry exempts one rule, not the file", () => {
  // Directly on the pure checker, because the point is the seam rather than
  // the plumbing: allowlisting a synthetic recording as audio must not also
  // stop it being read for credentials.
  const result = checkPrivacy({
    files: ["fixtures/public/narration.wav"],
    read: () => Buffer.from(`${"ghp" + "_"}${"b".repeat(28)}`),
    allowlist: { "media-audio": ["fixtures/public/narration.wav"],
                 "private-path": ["fixtures/public/narration.wav"] },
  });
  assert.deepEqual(result.findings.map((f) => f.rule), ["credential-content"]);
});

test("a stale allowlist entry is reported", NEEDS_GIT, () => {
  const result = scan({ "src/a.mjs": "export const a = 1;\n" },
    { "media-audio": ["fixtures/gone.wav"] });
  assert.deepEqual(result.stale, ["media-audio -> fixtures/gone.wav"]);
});

test("a glob in the allowlist is a problem, not a pattern", () => {
  const { problems } = normaliseAllowlist({ "media-audio": ["fixtures/public/**"] });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /exact paths only/);
});

test("an allowlist naming an unknown rule is a problem", () => {
  const { problems } = normaliseAllowlist({ "media-audios": ["x"] });
  assert.match(problems[0], /unknown rule/);
});

// --- this repository -------------------------------------------------------

test("this checkout is publishable", NEEDS_GIT, () => {
  const result = runOnCheckout(ROOT, path.join(ROOT, "privacy-allowlist.json"));
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.stale, []);
  assert.deepEqual(result.findings.map((f) => `${f.rule} ${f.file}`), []);
  assert.ok(result.files.length > 20, "git listed suspiciously few files");
});
