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

test("the fixture page lays out with a distinct banner heap and its free sticker", () => {
  const capsule = read("capsule.json");
  const fragments = readFragments(read("visual-fragments.json").items.map((i) => ({
    fragmentId: i.id, assets: { alphaPng: `${i.id}.png` }, boundingBox: { width: 300, height: 220 } })));
  const byId = Object.fromEntries(fragments.map((f) => [f.id, f]));
  for (const w of [360, 1280]) {
    const page = layout.composeSurface({ capsule, surface: { kind: "screen", w, h: 800 },
      measure: textlayout.makeMetricMeasurer(), fragmentsById: byId });
    assert.equal(page.banner.items.length, 2, `${w}: ${page.banner.items.length} pieces`);
    assert.equal(new Set(page.banner.items.map((it) => it.fragmentId)).size, 2);
    const turn = capsule.compositions[0].intent.freeFragments[0].rotationRangeDegrees;
    assert.equal(page.placements.length, 1);
    assert.ok(page.placements[0].rot >= turn.min && page.placements[0].rot <= turn.max);
  }
});

test("sparse cutouts are scaled up without being repeated", async () => {
  const { packBanner } = await import("../src/engine/collage.mjs");
  const frag = (id, fill) => ({ id, fragmentId: id, src: `${id}.png`, weight: "medium", aspect: 1.2, fill,
    contour: [[0, 0], [1, 0], [1, 1], [0, 1]] });
  const box = { x: 0, y: 0, w: 360, h: 220 };
  const solid = packBanner({ fragments: [frag("a"), frag("b")], box, density: 0.72, seed: "0x1" });
  const sparse = packBanner({ fragments: [frag("a", 0.35), frag("b", 0.35)], box, density: 0.72, seed: "0x1" });
  assert.equal(solid.items.length, 2);
  assert.equal(sparse.items.length, 2);
  const area = (items) => items.reduce((sum, item) => sum + item.w * item.h, 0);
  // A transparent string of sweets needs a larger box than a solid photograph,
  // but it remains one string rather than becoming wallpaper.
  assert.ok(area(sparse.items) > area(solid.items), `${area(sparse.items)} vs ${area(solid.items)}`);
});
