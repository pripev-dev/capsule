import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { checkAll, validate, checkCompanyArtwork } from "../src/validate/index.mjs";
import { createReadingArchive } from "../src/archive/reading.mjs";
import { unzipSync } from "fflate";

const load = name => JSON.parse(readFileSync(new URL(`../fixtures/minimal-valid/${name}`, import.meta.url)));
const stable = v => Array.isArray(v) ? `[${v.map(stable).join(",")}]` : v && typeof v === "object"
  ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}` : JSON.stringify(v);
function example() {
  const artworkManifest = { schemaVersion: 1, assetType: "company-illustration", items: [{
    id: "ill_synthetic_leaf", label: "Invented leaf drawing", role: "decorative",
    outputRef: { archivePath: "visual/company-artwork/leaf.png", sha256: "a".repeat(64) },
    creation: { method: "generated", prompt: "Draw an invented leaf", model: null, createdAt: "2026-10-02T00:00:00Z" },
    review: { decision: "approved", recordedBy: "Synthetic reviewer", recordedAt: "2026-10-02T00:00:00Z", outputSha256: "a".repeat(64) },
    publicUseApproved: false,
  }] };
  const capsule = load("capsule.json");
  capsule.schemaRevision = 2;
  capsule.companyArtworkPack = {
    manifestRef: { archivePath: "visual/company-artwork/manifest.json", sha256: createHash("sha256").update(stable(artworkManifest)).digest("hex") },
    approvedArtworkIds: ["ill_synthetic_leaf"],
  };
  capsule.compositions[0].intent.clusters[0].memberFragmentIds.push("ill_synthetic_leaf");
  return { capsule, artworkManifest, evidenceMap: load("evidence-map.json"), fragmentManifest: load("visual-fragments.json") };
}
const check = x => checkAll(x.capsule, x);
const reseal = x => { x.capsule.companyArtworkPack.manifestRef.sha256 = createHash("sha256").update(stable(x.artworkManifest)).digest("hex"); return x; };

test("approved company artwork can accompany a collage through its own manifest", () => {
  const x = example();
  assert.equal(validate("company-artwork-manifest.schema.json", x.artworkManifest).valid, true);
  assert.deepEqual(check(x), []);
  assert.ok(!x.capsule.visualPack.approvedFragmentIds.includes("ill_synthetic_leaf"));
});

test("a missing, changed, rejected or unapproved artwork manifest fails acceptance", () => {
  let x = example(); delete x.artworkManifest; assert.ok(check(x).length);
  x = example(); x.artworkManifest.items[0].label = "Changed"; assert.ok(check(x).length);
  x = example(); x.artworkManifest.items[0].review.decision = "pending";
  assert.ok(check(reseal(x)).some(f => /was not approved/.test(f)));
  x = example(); x.capsule.companyArtworkPack.approvedArtworkIds = []; assert.ok(check(x).length);
  x = example(); x.artworkManifest.items[0].review.outputSha256 = "b".repeat(64);
  assert.ok(check(reseal(x)).some(f => /does not bind/.test(f)));
  x = example(); x.artworkManifest.items.push(structuredClone(x.artworkManifest.items[0]));
  assert.ok(check(reseal(x)).some(f => /Duplicate/.test(f)));
  x = example(); delete x.capsule.companyArtworkPack.manifestRef; assert.ok(check(x).length);
});

test("company drawings cannot become a sampled family colour or a direct family fragment", () => {
  let x = example(); x.capsule.compositions[0].intent.tokens.palette.sampledFromFragmentIds.push("ill_synthetic_leaf");
  assert.ok(check(x).length);
  x = example(); x.capsule.visualPack.approvedFragmentIds.push("ill_synthetic_leaf"); assert.ok(check(x).length);
  x = example(); x.artworkManifest.items[0].sourceImageId = "invented-family-source";
  assert.equal(validate("company-artwork-manifest.schema.json", x.artworkManifest).valid, false);
});

test("private document approval does not grant public-use permission", () => {
  const x = example();
  x.capsule.access.visibility = "public";
  assert.ok(checkCompanyArtwork(x.capsule, x.artworkManifest).some(f => /public-use approval/.test(f)));
  x.artworkManifest.items[0].publicUseApproved = true; reseal(x);
  assert.deepEqual(checkCompanyArtwork(x.capsule, x.artworkManifest), []);
});

test("an offline copy preserves company provenance and checks included artwork bytes", () => {
  const x = example(), entries = [];
  const add = (path, value) => {
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(stable(value));
    entries.push({ path, bytes });
    return { archivePath: path, sha256: createHash("sha256").update(bytes).digest("hex") };
  };
  const image = add("visual/company-artwork/leaf.png", Buffer.from("synthetic illustration byte fixture"));
  x.artworkManifest.items[0].outputRef = image;
  x.artworkManifest.items[0].review.outputSha256 = image.sha256;
  x.capsule.companyArtworkPack.manifestRef = add("visual/company-artwork/manifest.json", x.artworkManifest);
  x.capsule.visualPack.manifestRef = add("visual-fragments.json", x.fragmentManifest);
  x.capsule.evidenceMap = add("evidence-map.json", x.evidenceMap);
  x.capsule.preservation.manifestRef = add("preservation-manifest.json", {
    schemaVersion: 1, capsuleId: x.capsule.capsuleId, generatedAt: "2026-10-02T00:00:00Z",
    policy: { initialPreservationYears: 10, minimumIndependentCopies: 2, verificationIntervalDays: 30 }, objects: [], excluded: [],
  });
  add("capsule.json", x.capsule);
  const font = { family: "Example Text", path: "fonts/test.woff2", licencePath: "fonts/OFL.txt" };
  add(font.path, Buffer.from("synthetic font")); add(font.licencePath, Buffer.from("synthetic licence"));
  const files = unzipSync(createReadingArchive(entries, font));
  const html = Buffer.from(files["viewer/index.html"]).toString();
  assert.ok(html.includes("Generated company illustration; decorative, not family source"));
  assert.ok(html.includes('src="../visual/company-artwork/leaf.png"'));
  assert.deepEqual(Buffer.from(files[image.archivePath]), entries.find(e => e.path === image.archivePath).bytes);
  entries.find(e => e.path === image.archivePath).bytes = Buffer.from("substituted");
  assert.throws(() => createReadingArchive(entries, font), /media reference failed integrity/);
});
