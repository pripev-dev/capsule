/**
 * The public fixture, composed as the application composes it.
 *
 * Every other engine test builds its own capsule. This one takes the schema's
 * own minimal-valid document, which names its sticker turn the way the contract
 * does (`rotationRangeDegrees`), and lays it out on a phone and a desktop. The
 * engine used to read the prototype's in-memory name and crashed on any real
 * capsule with a free fragment.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as layout from "../src/engine/layout.mjs";
import * as textlayout from "../src/engine/textlayout.mjs";
import { readFragments } from "../src/engine/compose.mjs";

const read = (f) => JSON.parse(readFileSync(new URL(`../fixtures/minimal-valid/${f}`, import.meta.url)));

test("the fixture page lays out with a full banner heap and its free sticker", () => {
  const capsule = read("capsule.json");
  const fragments = readFragments(read("visual-fragments.json").items.map((i) => ({
    fragmentId: i.id, assets: { alphaPng: `${i.id}.png` }, boundingBox: { width: 300, height: 220 } })));
  const byId = Object.fromEntries(fragments.map((f) => [f.id, f]));
  for (const w of [360, 1280]) {
    const page = layout.composeSurface({ capsule, surface: { kind: "screen", w, h: 800 },
      measure: textlayout.makeMetricMeasurer(), fragmentsById: byId });
    // Two cutouts fill the banner by repetition rather than leaving it bare.
    assert.ok(page.banner.items.length > 10, `${w}: ${page.banner.items.length} pieces`);
    const turn = capsule.compositions[0].intent.freeFragments[0].rotationRangeDegrees;
    assert.equal(page.placements.length, 1);
    assert.ok(page.placements[0].rot >= turn.min && page.placements[0].rot <= turn.max);
  }
});
