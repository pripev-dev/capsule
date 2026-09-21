import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createReadingArchive } from "../src/archive/reading.mjs";
import { verifyArchive } from "../src/archive/index.mjs";
import { unzipSync } from "fflate";
const font = { family: "Example Text", path: "fonts/test.woff2", licencePath: "fonts/OFL.txt" };
function payload() {
  const read = name => JSON.parse(readFileSync(new URL(`../fixtures/minimal-valid/${name}`, import.meta.url)));
  const capsule = read("capsule.json");
  const files = [];
  const add = (path, value) => {
    const bytes = Buffer.from(JSON.stringify(value));
    files.push({ path, bytes });
    return { archivePath: path, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length };
  };
  capsule.evidenceMap = add("evidence-map.json", read("evidence-map.json"));
  capsule.visualPack.manifestRef = add("visual-fragments.json", read("visual-fragments.json"));
  capsule.preservation.manifestRef = add("preservation-manifest.json", {
    schemaVersion: 1, capsuleId: capsule.capsuleId, generatedAt: "2026-09-21T00:00:00Z",
    policy: { initialPreservationYears: 10, minimumIndependentCopies: 2, verificationIntervalDays: 30 },
    objects: [], excluded: [],
  });
  add("capsule.json", capsule);
  // Byte fixtures test packaging, not usable font rendering.
  files.push({ path: font.path, bytes: Buffer.from("synthetic font") }, { path: font.licencePath, bytes: Buffer.from("synthetic licence") });
  return files;
}
test("reading archive validates documents and contains its independent offline reader", () => {
  const entries = payload();
  const zip = createReadingArchive(entries, font);
  assert.ok(verifyArchive(zip));
  const files = unzipSync(zip);
  assert.ok(Buffer.from(files["viewer/index.html"]).toString().includes("This is an offline reading copy"));
  for (const entry of entries) assert.deepEqual(Buffer.from(files[entry.path]), entry.bytes);
  assert.deepEqual(createReadingArchive(entries, font), zip);
});
test("reading archive refuses changed documents and competing reader files", () => {
  const entries = payload();
  entries.find(file => file.path === "evidence-map.json").bytes = Buffer.from("{}");
  assert.throws(() => createReadingArchive(entries, font), /integrity/);
  assert.throws(() => createReadingArchive([...payload(), { path: "viewer/index.html", bytes: Buffer.from("other") }], font), /Duplicate/);
});


test("reading archive checks included media against canonical references as well as ZIP checksums", () => {
  const entries = payload();
  const capsule = JSON.parse(entries.find(file => file.path === "capsule.json").bytes);
  entries.push({ path: capsule.recordings[0].original.ref.archivePath, bytes: Buffer.from("substituted recording") });
  assert.throws(() => createReadingArchive(entries, font), /media reference failed integrity/);
});
