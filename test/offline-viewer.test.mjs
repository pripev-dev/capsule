import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { offlineHtml } from "../src/archive/viewer.mjs";
const capsule = () => JSON.parse(readFileSync(new URL("../fixtures/minimal-valid/capsule.json", import.meta.url)));
const font = { family: "Example Text", path: "fonts/text.woff2", licencePath: "fonts/OFL.txt" };
const paths = [font.path, font.licencePath, "media/playback/rec_kitchen_call.mp3"];

test("offline reader preserves text order and escapes untrusted words without network or autoplay", () => {
  const doc = capsule();
  doc.blocks[0].text = '<script src="https://invalid.example">& family';
  const html = offlineHtml({ capsule: doc, font, paths });
  assert.ok(html.includes('&lt;script src=&quot;https://invalid.example&quot;&gt;&amp; family'));
  assert.ok(html.indexOf("The batter") < html.indexOf("Rest the batter"));
  assert.ok(html.includes('src="../media/playback/rec_kitchen_call.mp3"'));
  assert.equal(/<script src|autoplay|<link|fetch\(/.test(html), false);
  assert.ok(html.includes("default-src 'none'"));
  assert.equal(html.includes('src="../media/originals/'), false);
});

test("an omitted recording produces no media URL and missing font or licence refuses rendering", () => {
  const doc = capsule();
  const html = offlineHtml({ capsule: doc, font, paths: [font.path, font.licencePath] });
  assert.equal(html.includes("<audio"), false);
  assert.ok(html.includes("not included"));
  assert.throws(() => offlineHtml({ capsule: doc, font, paths: [font.path] }), /licensed/);
  doc.fonts[1].redistributable = false;
  assert.throws(() => offlineHtml({ capsule: doc, font, paths }), /licensed/);
});


test("offline reader includes distinct Latin and Cyrillic faces and refuses missing coverage", () => {
  const doc = capsule();
  doc.blocks[0].text = "Family recipe – Рецепт";
  const multi = { family: font.family, licencePath: font.licencePath, faces: [
    { path: "fonts/latin.woff2", style: "normal", weight: "400", unicodeRange: "U+0-024F,U+2000-206F" },
    { path: "fonts/cyrillic.woff2", style: "normal", weight: "400", unicodeRange: "U+0400-052F" },
  ] };
  const entries = [font.licencePath, ...multi.faces.map(f => f.path)];
  const html = offlineHtml({ capsule: doc, font: multi, paths: entries });
  assert.ok(html.includes("unicode-range:U+0400-052F"));
  assert.ok(html.includes("../fonts/latin.woff2"));
  assert.ok(html.includes("../fonts/cyrillic.woff2"));
  assert.ok(html.includes("document.querySelector('#transcripts').textContent"));
  assert.throws(() => offlineHtml({ capsule: doc, font: { ...multi, faces: multi.faces.slice(0, 1) }, paths: entries }), /cover/);
  assert.throws(() => offlineHtml({ capsule: doc, font: multi, paths: entries.slice(0, 2) }), /licensed/);
  const malicious = { ...multi, faces: [{ ...multi.faces[0], unicodeRange: "U+0-024F;}body{display:none" }] };
  assert.throws(() => offlineHtml({ capsule: doc, font: malicious, paths: entries }), /licensed/);
});


test("offline visuals use only approved included paths and escape family captions", () => {
  const doc = capsule();
  const manifest = JSON.parse(readFileSync(new URL("../fixtures/minimal-valid/visual-fragments.json", import.meta.url)));
  manifest.items[0].label.display = '<img onerror="unsafe">';
  const path = manifest.items[0].alphaPngPath;
  const html = offlineHtml({ capsule: doc, font, paths: [...paths, path], fragmentManifest: manifest });
  assert.ok(html.includes(`src="../${path}"`));
  assert.ok(html.includes("Direct cutout from family material"));
  assert.ok(html.includes("&lt;img onerror=&quot;unsafe&quot;&gt;"));
  assert.equal(html.includes(`src="../${manifest.items[1].alphaPngPath}"`), false);
  const omitted = offlineHtml({ capsule: doc, font, paths, fragmentManifest: manifest });
  assert.equal(omitted.includes("<img src="), false);
  manifest.items[0].reviewDecision = "rejected";
  assert.throws(() => offlineHtml({ capsule: doc, font, paths, fragmentManifest: manifest }), /approval/);
});
