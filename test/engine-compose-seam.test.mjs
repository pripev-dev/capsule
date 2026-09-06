/**
 * The one seam the port had to open, tested because it is the one thing that is
 * not the prototype's own behaviour.
 *
 * `engine/compose.js` required its seventeen skill modules directly. Here it
 * cannot: the skills live in `cookbook-agent`, which depends on this package, so
 * importing them would make `capsule` depend on its own dependent. They are
 * injected instead.
 *
 * What that must not do is let a run proceed without them. A composer with no
 * skills does not fail loudly - it composes an empty page, which looks like a
 * result. So the guard is the thing under test.
 */
import test from "node:test";
import assert from "node:assert/strict";

import * as compose from "../src/engine/compose.mjs";

test("the skill keys are the seventeen the run calls, by their own names", () => {
  assert.equal(compose.SKILL_KEYS.length, 17);
  assert.deepEqual([...compose.SKILL_KEYS].sort(), [
    "additions", "assemble", "blocks", "claims", "clarify", "grouping", "head",
    "langpack", "locales", "marks", "page", "readiness", "repair", "story",
    "structure", "type", "voice",
  ]);
  // Nineteen skills exist. preserving-source-fidelity has no JavaScript, and
  // preparing-a-printable-sheet belongs to the renderer, because printing is a
  // recomposition of a finished surface rather than a step in composing one.
});

test("composing without skills refuses instead of producing an empty page", () => {
  assert.equal(compose.skillsInUse(), null);
  assert.throws(() => compose.run({ now: "2026-09-05T00:00:00Z" }), /needs the skills/);
  assert.throws(() => compose.composeAndValidate({}), /needs the skills/);
});

test("useSkills names what is missing rather than accepting a partial set", () => {
  assert.throws(() => compose.useSkills({}), /useSkills is missing/);
  assert.throws(() => compose.useSkills(null), /useSkills is missing/);

  const partial = Object.fromEntries(compose.SKILL_KEYS.slice(0, 16).map((k) => [k, {}]));
  assert.throws(
    () => compose.useSkills(partial),
    new RegExp(compose.SKILL_KEYS[16]),
    "the one missing skill is named",
  );
  // A rejected set must not have been half-installed.
  assert.equal(compose.skillsInUse(), null);
});

test("a complete set installs, and is what the run then uses", () => {
  const stub = Object.fromEntries(compose.SKILL_KEYS.map((k) => [k, { name: k }]));
  const installed = compose.useSkills(stub);
  assert.equal(installed, stub);
  assert.equal(compose.skillsInUse(), stub);
  // The guard is satisfied now, so the failure that follows is the stub's, not
  // the seam's - which is the proof that the seam is out of the way.
  assert.throws(() => compose.run({ now: "x", recordings: [], lexicon: {} }), (error) => {
    assert.doesNotMatch(error.message, /needs the skills/);
    return true;
  });
});
