import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipSync, unzipSync } from "fflate";
import { createArchive, verifyArchive } from "../src/archive/index.mjs";
import { restoreArchive } from "../src/archive/restore.mjs";

const entries = () => [
  { path: "capsule.json", bytes: Buffer.from('{"synthetic":true}') },
  { path: "media/originals/voice.ogg", bytes: Buffer.from("synthetic source bytes") },
];

test("deterministic archive restores byte-identical originals into a new copy twice", () => {
  const parent = mkdtempSync(join(tmpdir(), "pripev-archive-test-"));
  try {
    const zip = createArchive(entries());
    assert.deepEqual(zip, createArchive(entries().reverse()));
    const source = join(parent, "source.zip");
    writeFileSync(source, zip);
    const first = restoreArchive(zip, parent);
    const second = restoreArchive(zip, parent);
    assert.notEqual(first, second);
    for (const row of entries()) {
      assert.deepEqual(readFileSync(join(first, row.path)), row.bytes);
      assert.deepEqual(readFileSync(join(second, row.path)), row.bytes);
    }
    assert.deepEqual(readFileSync(source), zip);
    assert.equal(verifyArchive(zip).length, 4);
  } finally { rmSync(parent, { recursive: true, force: true }); }
});

test("corruption, extra or missing files and altered checksums produce no restore", () => {
  const parent = mkdtempSync(join(tmpdir(), "pripev-archive-test-"));
  try {
    for (const alter of [
      files => { files["media/originals/voice.ogg"][0] ^= 1; },
      files => { files["unlisted.txt"] = Buffer.from("unlisted"); },
      files => { delete files["capsule.json"]; },
      files => { files["checksums.sha256"][0] ^= 1; },
    ]) {
      const files = unzipSync(createArchive(entries()));
      alter(files);
      assert.throws(() => restoreArchive(zipSync(files), parent));
      assert.deepEqual(readdirSync(parent), []);
    }
  } finally { rmSync(parent, { recursive: true, force: true }); }
});

test("paths cannot traverse, address devices, alias by case or collide with directories", () => {
  for (const path of ["../escape", "/absolute", "C:/escape", "a\\b", "a/../b", "con.txt", "a/nul", "a.", "a:b", "a%2fb"]) {
    assert.throws(() => createArchive([{ path, bytes: Buffer.from("x") }]));
    assert.throws(() => verifyArchive(zipSync({ [path]: Buffer.from("x") })));
  }
  for (const names of [["same", "SAME"], ["file", "file/child"], ["archive.json"], ["CHECKSUMS.SHA256"]]) {
    assert.throws(() => createArchive(names.map(path => ({ path, bytes: Buffer.from("x") }))));
  }
});

test("central-directory duplicates are refused rather than silently overwritten", () => {
  const zip = Buffer.from(zipSync({ one: Buffer.from("1"), two: Buffer.from("2") }, { level: 0 }));
  // Equal-length substitution preserves the ZIP structure while duplicating
  // both local and central names. Many unzip APIs silently keep the last one.
  for (let i = 0; i < zip.length - 2; i++) {
    if (zip.subarray(i, i + 3).toString() === "two") zip.write("one", i);
  }
  assert.throws(() => verifyArchive(zip), /Duplicate/);
});

test("compressed oversized entries are refused before decompression", () => {
  const zip = zipSync({ large: Buffer.alloc(1024 * 1024) });
  assert.throws(() => verifyArchive(zip, { files: 10, fileBytes: 1024, totalBytes: 4096 }), /limits/);
});
