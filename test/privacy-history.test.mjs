import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { runOnCheckout, runOnHistory } from "../src/privacy/cli.mjs";

test("history catches a removed unreviewed blob even when the checkout passes", (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "pripev-history-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", ["-C", dir, ...args], { stdio: "pipe" });
  git("init"); git("config", "user.name", "Synthetic"); git("config", "user.email", "synthetic@example.invalid");
  writeFileSync(path.join(dir, "removed.wav"), "synthetic test bytes, not real audio");
  git("add", "."); git("commit", "-m", "Synthetic negative control");
  git("rm", "removed.wav");
  writeFileSync(path.join(dir, "safe.txt"), "safe");
  writeFileSync(path.join(dir, "privacy-allowlist.json"), "{}");
  git("add", "."); git("commit", "-m", "Remove test blob");
  const list = path.join(dir, "privacy-allowlist.json");
  assert.equal(runOnCheckout(dir, list).findings.length, 0);
  assert.ok(runOnHistory(dir, list).findings.some((f) => f.file === "removed.wav"));
});
test("an exact-path exemption does not authorize changed content", async () => {
  const { checkPrivacy } = await import("../src/privacy/check.mjs");
  const safe = Buffer.from("approved synthetic audio placeholder");
  const allowlist = { "media-audio": ["sample.wav"], $sha256: {
    "sample.wav": [createHash("sha256").update(safe).digest("hex")] } };
  const check = (bytes) => checkPrivacy({ files: ["sample.wav"], read: () => bytes, allowlist });
  assert.equal(check(safe).findings.length, 0);
  assert.ok(check(Buffer.from("different bytes")).findings.length > 0);
});
