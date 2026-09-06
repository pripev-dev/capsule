/**
 * What must never reach a public Pripev repository, as executable rules.
 *
 * This file is the rule table only - no filesystem, no git, no process. That
 * separation is what makes the rules testable against synthetic file lists as
 * well as against a real checkout, and it is why the same table can be reused
 * by `kitchen` and `cookbook-agent` rather than re-written slightly differently
 * in each one. Three near-identical guards drifting apart is exactly how the
 * first version came to reject five audio extensions and no images at all while
 * its own comment claimed it kept the family's photographs out.
 *
 * Every rule is a refusal, not a warning. There is no severity axis: either the
 * material is publishable or the build fails.
 *
 * ---------------------------------------------------------------------------
 * On the limits of this file, stated plainly because overstating them is the
 * failure mode that matters:
 *
 * These rules catch material by SHAPE - by extension, by path, by byte
 * pattern. Shape is a tripwire. It cannot read a paragraph and decide whether a
 * grandmother said it. An English transcript of a family recording, pasted into
 * a Markdown file, passes every rule below. So does a person's name, a street,
 * a date of birth, a hospital. The rules narrow the ways private material can
 * arrive by accident; they do not decide what is private.
 *
 * And a check that runs in CI runs AFTER the push. On a public branch that is
 * detection, not prevention: by the time the job is red, the blob is on GitHub
 * and in its API, and removing it needs a history rewrite and a credential
 * rotation rather than a commit. `npm run check:privacy` before pushing is the
 * control that actually prevents; the CI job exists to catch the time somebody
 * forgets to run it.
 * ---------------------------------------------------------------------------
 */

/** Extensions that carry recorded sound. */
const AUDIO = [
  "aac", "aif", "aiff", "amr", "ape", "au", "caf", "flac", "m4a", "m4b", "mka",
  "mp2", "mp3", "oga", "ogg", "opus", "ra", "wav", "wma", "wv",
];

/** Extensions that carry moving pictures, most of which also carry sound. */
const VIDEO = [
  "3gp", "asf", "avi", "flv", "m2ts", "m4v", "mkv", "mov", "mp4", "mpeg",
  "mpg", "mts", "ogv", "rm", "vob", "webm", "wmv",
];

/**
 * Extensions that carry still pictures.
 *
 * `svg` is here despite being text. A scan of a handwritten recipe card,
 * traced or simply wrapped around a base64 `<image>`, is an SVG - and being
 * text makes it likelier to slip past a reviewer's eye, not less.
 */
const IMAGE = [
  "avif", "bmp", "cr2", "dng", "gif", "heic", "heif", "ico", "j2k", "jfif",
  "jp2", "jpeg", "jpg", "nef", "orf", "png", "psd", "raf", "raw", "svg",
  "tif", "tiff", "webp",
];

/**
 * Archives.
 *
 * An archive defeats every other rule in this file at once: the extensions are
 * inside it, the paths are inside it, the byte patterns are inside it, and
 * `git grep` sees a single opaque blob. Refusing the container is the only
 * check that works without unpacking it.
 */
const ARCHIVE = [
  "7z", "br", "bz2", "cab", "dmg", "gz", "iso", "jar", "lz", "lz4", "lzma",
  "rar", "tar", "tbz2", "tgz", "txz", "war", "xz", "z", "zip", "zst",
];

/** Fonts and other licensed binaries: legitimate, but declared rather than assumed. */
const BINARY_ASSET = ["eot", "otf", "ttf", "woff", "woff2"];

/**
 * Directory names that hold the private side of the pipeline.
 *
 * Matched as a whole path segment anywhere in the path, so `test/fixtures/x`
 * and `fixtures/x` are both caught while `src/fixtures-readme.md` is not.
 *
 * `fixtures` is on this list even though this repository publishes two fixture
 * directories on purpose. That is not a contradiction, it is the design: the
 * default for a fixture tree is refusal, and a fixture becomes publishable by
 * being named in the allowlist at an exact path, which is a review step with a
 * name attached to it. A rule that exempted every directory called `fixtures`
 * would exempt the one place private material is most likely to be staged.
 */
const PRIVATE_SEGMENTS = [
  "bundle", "bundles", "fixture", "fixtures", "handoff", "handoffs",
  "recordings", "runtime", "transcript", "transcripts", "visual-run",
  "visual-runs", "voices", "images-and-voices",
];

/** Filenames that are credentials by convention. */
const CREDENTIAL_NAMES = [
  /^\.env(\..+)?$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)$/,
  /^\.netrc$/i,
  /^\.npmrc$/i,
  /^\.pgpass$/i,
  /^credentials(\.json)?$/i,
  /^service-account.*\.json$/i,
];

/** Extensions that are private keys or key stores. */
const CREDENTIAL_EXTENSIONS = [
  "asc", "gpg", "jks", "key", "keystore", "p12", "pem", "pfx", "ppk",
];

/**
 * Byte patterns that are credentials wherever they appear.
 *
 * Deliberately anchored on issuer-specific prefixes rather than on entropy. An
 * entropy heuristic flags every content hash in this repository, and a rule
 * that fires constantly is a rule that gets switched off.
 */
const CREDENTIAL_CONTENT = [
  [/-----BEGIN (RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/, "a PEM private key block"],
  [/\bsk-[A-Za-z0-9_-]{20,}/, "an OpenAI-style secret key"],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/, "a GitHub token"],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/, "a GitHub fine-grained token"],
  [/\bAKIA[0-9A-Z]{16}\b/, "an AWS access key id"],
  [/\bASIA[0-9A-Z]{16}\b/, "an AWS temporary access key id"],
  [/\bhf_[A-Za-z0-9]{30,}/, "a Hugging Face token"],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/, "a Slack token"],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, "a Google API key"],
  [/\bsk_live_[A-Za-z0-9]{20,}/, "a Stripe live key"],
  [/\bglpat-[A-Za-z0-9_-]{20,}/, "a GitLab personal access token"],
  [/\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\./, "a JSON Web Token"],
];

/**
 * Filenames that would be a fingerprint database of the family's own files.
 *
 * A list of SHA-256 digests of her recordings is not the recordings, and it is
 * tempting to file it under harmless metadata. It is not: published, it lets
 * anyone already holding a candidate file confirm that it is one of hers. The
 * digests are a private-side artefact and they stay private-side.
 *
 * A digest of a SYNTHETIC fixture is a different object entirely and is
 * publishable, because there is nothing for it to confirm. Those are named in
 * the allowlist at an exact path.
 */
const FINGERPRINT_NAMES = [
  /source-hash/i, /forbidden-hash/i, /fingerprints?\b/i, /-hashes\./i,
  /^hashes\./i, /audio-digest/i,
];

/** Extensions whose contents are text by contract and must not contain a NUL. */
const TEXT_EXTENSIONS = new Set([
  "cjs", "css", "csv", "html", "js", "json", "jsonc", "lock", "map", "md",
  "mjs", "mts", "sh", "toml", "ts", "tsx", "txt", "xml", "yaml", "yml",
]);

const extensionOf = (file) => {
  const base = file.slice(file.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? "" : base.slice(dot + 1).toLowerCase();
};

const basenameOf = (file) => file.slice(file.lastIndexOf("/") + 1);

const byExtension = (list) => (file) => list.includes(extensionOf(file));

/**
 * The rule table.
 *
 * `id` is the allowlist key. An allowlist entry exempts a path from ONE rule,
 * never from the file as a whole, so allowlisting a synthetic recording under
 * `media-audio` does not also exempt it from `credential-content`.
 *
 * `path` rules see only the path. `content` rules also receive the bytes, and
 * are asked only about files no `path` rule has already refused.
 *
 * A `match` returns false, true, or a string. The string is a detail line and
 * is how a finding says *where* rather than only *that*.
 */
export const RULES = [
  {
    id: "media-audio",
    kind: "path",
    title: "audio",
    why: "A recording of the family is the single most sensitive artefact in this project.",
    match: byExtension(AUDIO),
  },
  {
    id: "media-video",
    kind: "path",
    title: "video",
    why: "Video carries faces and sound at once.",
    match: byExtension(VIDEO),
  },
  {
    id: "media-image",
    kind: "path",
    title: "images",
    why: "Photographs of people, kitchens and handwritten cards are family material. SVG counts: a traced or embedded scan is an SVG.",
    match: byExtension(IMAGE),
  },
  {
    id: "archive",
    kind: "path",
    title: "archives",
    why: "An archive hides every other category from every other rule at once.",
    match: byExtension(ARCHIVE),
  },
  {
    id: "binary-asset",
    kind: "path",
    title: "fonts and binary assets",
    why: "Legitimate, but licensed and opaque, so it is declared by exact path rather than assumed.",
    match: byExtension(BINARY_ASSET),
  },
  {
    id: "private-path",
    kind: "path",
    title: "private pipeline directories",
    why: "Fixture, handoff, runtime, transcript, bundle, recording and visual-run trees are where private material is staged. Publishable ones are named individually.",
    match: (file) =>
      file.split("/").some((seg) => PRIVATE_SEGMENTS.includes(seg.toLowerCase())),
  },
  {
    id: "credential-name",
    kind: "path",
    title: "credential files",
    why: "A key committed once is a key rotated forever.",
    match: (file) =>
      CREDENTIAL_NAMES.some((re) => re.test(basenameOf(file))) ||
      CREDENTIAL_EXTENSIONS.includes(extensionOf(file)),
  },
  {
    id: "fingerprint-list",
    kind: "path",
    title: "family-source fingerprint lists",
    why: "A digest list of the family's own files lets a holder confirm a match. Synthetic-fixture digests are a different object and are allowlisted.",
    match: (file) => FINGERPRINT_NAMES.some((re) => re.test(basenameOf(file))),
  },
  {
    id: "credential-content",
    kind: "content",
    title: "credential-shaped contents",
    why: "A key does not become safe by being pasted into a source file.",
    match: (file, bytes) => {
      const text = bytes.toString("latin1");
      const hit = CREDENTIAL_CONTENT.find(([re]) => re.test(text));
      return hit ? `contains ${hit[1]}` : false;
    },
  },
  {
    id: "nul-byte",
    kind: "content",
    title: "NUL bytes in tracked text",
    why:
      "A single NUL makes git classify the blob as binary. It then vanishes from `git grep -I`, shows as `-\t-` in --numstat, and cannot be rendered as a review diff - so the file silently stops being reviewable while every test still passes. Not hypothetical: test/public-golden.test.mjs carried one, and so did the guard first written to catch it.",
    match: (file, bytes) => {
      if (!TEXT_EXTENSIONS.has(extensionOf(file))) return false;
      const at = bytes.indexOf(0);
      return at < 0
        ? false
        : `first NUL at byte ${at}; write \\u0000 in source rather than the character`;
    },
  },
  {
    id: "cyrillic-prose",
    kind: "content",
    title: "Cyrillic prose",
    why:
      "A tripwire for a pasted transcript, not a privacy boundary: it misses every English or German one, every name and every photograph. Twelve or more Cyrillic CHARACTERS in a row, counted with a character-aware regex. `git grep -E` applies {n,} to BYTES, and Cyrillic costs two bytes each in UTF-8, so a byte-counted rule quietly means half what it says.",
    match: (file, bytes) => {
      const text = bytes.toString("utf8");
      const m = text.match(/[Ѐ-ӿ][Ѐ-ӿ ’'-]{10,}[Ѐ-ӿ]/);
      return m ? `a run of Cyrillic prose at index ${m.index}` : false;
    },
  },
];

export const RULE_IDS = RULES.map((r) => r.id);
