/**
 * The private fidelity layer: the ported engine against the prototype's own runs.
 *
 * The public golden beside this file proves the engine reproduces one synthetic
 * page. This proves it reproduces the four real runs and both cold starts, which
 * is a far harder target - multi-page cookbooks, a later recording pinned to an
 * earlier page, two scripts, a language with no pack at all.
 *
 * Those runs are the family's material, so nothing they contain is committed.
 * Only this logic is. The material is located at run time and the suite skips -
 * cleanly, exit 0 - when it is absent, so a public clone stays green.
 *
 *   PRIPEV_DESIGN_EXPORT=/path/to/design    explicit
 *   ../../.port-staging/design              the umbrella fallback
 *
 * The skills come from the same export, because they have not been ported yet;
 * `compose.mjs` takes them injected, which is exactly what that seam is for.
 * Once `cookbook-agent` ships them as ESM this file loads those instead, and the
 * expectation does not move.
 *
 * The expectations are the prototype's own `work/capsule.json`, captured in
 * Stage 1 while it still ran. If a comparison fails, the port is wrong.
 * **Never regenerate an expectation to fit the output.**
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import * as compose from "../src/engine/compose.mjs";
import * as textlayout from "../src/engine/textlayout.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Where the private export is, or null. */
function findExport() {
  const candidates = [
    process.env.PRIPEV_DESIGN_EXPORT,
    path.resolve(HERE, "../../.port-staging/design"),
  ].filter(Boolean);
  for (const dir of candidates) {
    if (existsSync(path.join(dir, "00-sandbox", "engine", "compose.js"))) return dir;
  }
  return null;
}

const EXPORT = findExport();
const SKIP = {
  skip: EXPORT
    ? false
    : "the private Design export is not present. Set PRIPEV_DESIGN_EXPORT, or " +
      "check out the umbrella with .port-staging/design/ in place. This is the " +
      "expected state on a public clone and is not a failure.",
};

// Everything below only runs with the material present.
const SANDBOX = EXPORT ? path.join(EXPORT, "00-sandbox") : null;
const require_ = createRequire(import.meta.url);

/** The seventeen skill modules the run calls, by the keys compose.mjs declares. */
const SKILL_PATHS = {
  assemble: "assembling-the-sandbox/assemble.js",
  structure: "structuring-spoken-recipes/structure.js",
  story: "setting-aside-a-story/story.js",
  grouping: "grouping-spoken-runs/grouping.js",
  readiness: "assessing-capsule-readiness/readiness.js",
  claims: "marking-claim-states/claims.js",
  clarify: "requesting-clarifications/clarifications.js",
  blocks: "planning-capsule-blocks/blocks.js",
  head: "lifting-a-recipe-head/head.js",
  voice: "placing-the-voice/voice.js",
  type: "choosing-type-and-palette/type-and-palette.js",
  page: "composing-cookbook-pages/compose-page.js",
  marks: "writing-cookbook-marks/marks-plan.js",
  additions: "slipping-in-additions/additions.js",
  locales: "producing-locale-editions/locales.js",
  langpack: "selecting-a-language-pack/langpack.js",
  repair: "repairing-a-failed-validation/repair.js",
};

function loadSkills() {
  const skills = {};
  for (const [key, rel] of Object.entries(SKILL_PATHS)) {
    skills[key] = require_(path.join(SANDBOX, "skills", rel));
  }
  assert.deepEqual([...compose.SKILL_KEYS].sort(), Object.keys(skills).sort(),
    "the skill keys compose.mjs declares and the modules loaded here disagree");
  return skills;
}

/**
 * `load-job.js` reads a job folder over `fetch`, which Node does not implement
 * for local paths. Rather than modify an archived file, the shim gives it one
 * that reads from disk - the same bytes it would have received in the browser.
 */
function withFileFetch(base, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const file = path.resolve(base, String(url));
    if (!existsSync(file)) {
      return { ok: false, status: 404, json: async () => { throw new Error("404"); },
               text: async () => { throw new Error("404"); } };
    }
    const raw = readFileSync(file);
    return {
      ok: true, status: 200,
      json: async () => JSON.parse(raw.toString("utf8")),
      text: async () => raw.toString("utf8"),
    };
  };
  return Promise.resolve()
    .then(fn)
    .finally(() => { globalThis.fetch = original; });
}

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));

/** The prototype composed every run at this instant; reproducing it needs the same one. */
const NOW = "2026-09-01T00:00:00.000Z";

// Run 01 must precede 02: 02 reads the cookbook ledger 01 writes, so a page
// already carrying a photograph does not take it again.
const RUNS = [
  { dir: "01-sloyony-pirog", pages: ["capsule.json"] },
  { dir: "02-botvinniki-beze", pages: ["capsule-p1.json", "capsule-p2.json"] },
  { dir: "03-dobavlenie", pages: ["capsule.json"] },
  { dir: "04-bolo-de-laranja", pages: ["capsule.json"] },
];

async function replay(runDir) {
  const skills = loadSkills();
  compose.useSkills(skills);
  const loadJob = require_(path.join(SANDBOX, "engine", "load-job.js"));
  const base = path.join(EXPORT, runDir);
  return withFileFetch(base, async () => {
    const job = await loadJob.loadJob(
      { in: "in/", sandbox: path.relative(base, SANDBOX).replaceAll("\\", "/") + "/" },
      { now: NOW },
    );
    return compose.run(job);
  });
}

// --- the four runs -----------------------------------------------------------

for (const run of RUNS) {
  test(`${run.dir} replays byte-identically`, SKIP, async () => {
    const result = await replay(run.dir);
    assert.equal(result.capsules.length, run.pages.length,
      `${run.dir} composed ${result.capsules.length} page(s), expected ${run.pages.length}`);

    run.pages.forEach((file, index) => {
      const expected = readJson(path.join(EXPORT, run.dir, "work", file));
      const got = result.capsules[index].capsule;
      // Byte-identical. A port has no licence to move a character.
      assert.equal(JSON.stringify(got), JSON.stringify(expected),
        `${run.dir}/${file} differs`);
    });
  });
}

test("the runs are replayed in the order the cookbook ledger requires", SKIP, () => {
  assert.equal(RUNS[0].dir, "01-sloyony-pirog");
  assert.equal(RUNS[1].dir, "02-botvinniki-beze");
});

// --- both cold starts --------------------------------------------------------

const COLD = [
  { dir: "01-ru-cyrillic-undeclared", declaredLocale: null },
  { dir: "02-pt-latin-nopack", declaredLocale: "pt" },
];

async function replayColdStart(entry) {
  const skills = loadSkills();
  compose.useSkills(skills);
  const dir = path.join(EXPORT, "cold-start", entry.dir);
  const invocation = readJson(path.join(dir, "invocation.json"));
  const ctx = invocation.ctx;

  const rel = (p) => path.join(EXPORT, p.replace(/^prototype\//, ""));
  const sandboxJson = (p) => readJson(path.join(SANDBOX, p));
  const text = readFileSync(rel(ctx.transcriptPath), "utf8").trim();

  const packs = sandboxJson("skills/selecting-a-language-pack/packs.json");
  const stopwords = {};
  for (const pk of packs.packs || []) {
    if (!(pk.has || []).includes("lexicon")) continue;
    const p = path.join(SANDBOX, `skills/structuring-spoken-recipes/lexicon.${pk.locale}.json`);
    if (existsSync(p)) stopwords[pk.locale] = readJson(p).stopwords || [];
  }
  const detected = skills.langpack.detect({
    declaredLocale: ctx.declaredLocale || null, text, packs,
    stopwordsFor: (loc) => stopwords[loc],
  });
  const pack = skills.langpack.select({ detected, packs });
  const R = pack.resolved;

  const job = {
    jobId: "job_coldstart", capsuleId: ctx.capsuleId, now: NOW,
    recordings: [{ recordingId: "rec_cold", recordingKey: "cold", text,
                   durationSeconds: ctx.durationSeconds || 0, audioPath: null,
                   approvedAt: NOW, isAddition: false }],
    fragments: [], palettes: [], palettesForPagesWithoutFragments: [],
    languagePack: pack,
    lexicon: sandboxJson(R.lexicon.path),
    gloss: R.gloss ? sandboxJson(R.gloss.path) : { map: {} },
    registry: sandboxJson("skills/choosing-type-and-palette/font-registry.json"),
    questionTemplates: R.questionTemplates ? sandboxJson(R.questionTemplates.path).templates : null,
    chrome: sandboxJson(R.chrome.path),
    approvedFragmentIds: [], locales: [],
  };
  return { result: compose.run(job), pack, dir };
}

for (const entry of COLD) {
  test(`cold start ${entry.dir} replays byte-identically`, SKIP, async () => {
    const { result, dir } = await replayColdStart(entry);
    const expected = readJson(path.join(dir, "capsule.json"));
    assert.equal(JSON.stringify(result.capsules[0].capsule), JSON.stringify(expected));
  });
}

test("the cold starts still decide language the way they were recorded", SKIP, async () => {
  const ru = await replayColdStart(COLD[0]);
  const pt = await replayColdStart(COLD[1]);
  for (const { pack, dir } of [ru, pt]) {
    const expected = readJson(path.join(dir, "language-pack.json"));
    assert.equal(JSON.stringify(pack), JSON.stringify(expected), `${dir} chose a different pack`);
  }
  // The point of the second one: a declared locale with no pack behind it must
  // come back unpublishable rather than quietly borrowing another language's
  // rules.
  const readiness = readJson(path.join(pt.dir, "readiness.json"));
  assert.equal(readiness.publishable, false);
});

// --- what the sheets came out like ------------------------------------------

test("every recorded print run kept its widows, orphans and oversize at zero", SKIP, () => {
  // Sheet counts are not asserted: these records were composed with the
  // synthetic measurer and a browser wraps differently, so run 01 audits at five
  // sheets and prints at six. The keeps agree either way, which is what the
  // records are for.
  const records = [
    ["01-sloyony-pirog", "15-print.json"],
    ["02-botvinniki-beze", "15-print-p1.json"],
    ["02-botvinniki-beze", "15-print-p2.json"],
    ["03-dobavlenie", "15-print.json"],
    ["04-bolo-de-laranja", "15-print.json"],
  ];
  for (const [dir, file] of records) {
    const print = readJson(path.join(EXPORT, dir, "work", file));
    const pg = print.pagination ?? {};
    assert.equal(pg.keepLines, 2, `${dir}/${file}`);
    assert.deepEqual(pg.strays ?? [], [], `${dir}/${file} left a stray line`);
    assert.deepEqual(pg.oversize ?? [], [], `${dir}/${file} left an oversize block`);
    assert.deepEqual(pg.splits ?? [], [], `${dir}/${file} recorded a split`);
    assert.ok((pg.sheets ?? []).length >= 1);

    // The one refusal every run does carry, and the reason it is a refusal
    // rather than a failure: the paper was inferred, so the sheet prints but is
    // not certified.
    assert.equal(print.certified, false, `${dir}/${file}`);
    const surface = (print.refusals ?? []).filter((r) => r.subject === "surface");
    assert.equal(surface.length, 1, `${dir}/${file} refusals: ${JSON.stringify(print.refusals)}`);
    assert.match(surface[0].because, /paper was inferred, not declared/);
  }
});
