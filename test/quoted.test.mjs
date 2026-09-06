import test from "node:test";
import assert from "node:assert/strict";
import { checkBlockTextIsQuoted, checkAll } from "../src/validate/index.mjs";
import { readFileSync } from "node:fs";

const evidence = { records: [{ evidenceId: "ev_source", quote: "Add 2 pears. Then stir gently." }] };
const block = (text, refs = ["ev_source"]) => ({ blockId: "blk_line", text, evidence: refs });
test("a quoted slice allows only case and whitespace presentation changes", () => {
  assert.deepEqual(checkBlockTextIsQuoted({ blocks: [block("then  stir gently")] }, evidence), []);
  assert.equal(checkBlockTextIsQuoted({ blocks: [block("Add 3 pears")] }, evidence).length, 1);
});
test("nested text and single-character quantities need backing", () => {
  assert.equal(checkBlockTextIsQuoted({ blocks: [{ children: [block("9")] }] }, evidence).length, 1);
  assert.equal(checkBlockTextIsQuoted({ blocks: [block("pears", [])] }, evidence).length, 1);
  assert.equal(checkBlockTextIsQuoted({ blocks: [block("pears")] }, null).length, 1);
});
test("the public checkAll catches changed block text with unchanged evidence", () => {
  const read = (file) => JSON.parse(readFileSync(new URL(`../fixtures/minimal-valid/${file}`, import.meta.url)));
  const doc = read("capsule.json");
  doc.blocks[0].text = "A different invented recipe";
  const failures = checkAll(doc, { evidenceMap: read("evidence-map.json") });
  assert.ok(failures.some((f) => f.startsWith("block text blk_title:")));
});
