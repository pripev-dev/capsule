# Capsule

**The contract that lets a family rebuild their capsule without us.**

`capsule.json` and its sibling manifests, the deterministic composition
engine, and the planned minimal offline viewer. The intended reconstruction set opens a
preserved family recipe with no database, no account, and no company.

> **Status: Phase A contract implemented, and the deterministic composition
> engine is here.** The schemas, validators, reference fixture, cross-manifest
> checks, the ported engine and the privacy guard have **124 tests**. On a
> clean public clone 114 are runnable and 10 skip - those 10 replay the private Design
> export and say so rather than failing. The offline viewer and the renderer
> remain later work.
>
> This repository holds a page composition contract, not an assembler. The
> composer's output is a *page*; turning one into a schema-valid durable
> `capsule.json` - consent, preservation, access, migration, edition metadata -
> is implemented by Gate 2's assembler in `cookbook-agent`. `test/public-golden.test.mjs`
> pins exactly how far short the page falls, on purpose.

## Visual fragment contract

Block text must be backed by a contiguous slice of a cited evidence quote,
with case and whitespace normalised. This includes nested and single-character
text blocks. `checkBlockTextIsQuoted` is exported from `./validate` and included
in `checkAll` when an evidence map is provided. It is a contract invariant,
not an agent-private validator.

All new visual writers emit manifest schema V2. A V2 direct fragment binds its
immutable visual run, source, semantic target, extraction and output modes,
mask, canonical alpha, reviewed paper render and treatment parameters into one
candidate identity. A review records the same hashes, so changing any reviewed
pixel or treatment invalidates approval.

Direct pixel cutouts and generated source-derived stickers remain separate
asset types, directories and provenance shapes. Generated items must record
their reference policy and similarity screening; people, pets and private homes
cannot be declared as generation references. V1 manifests remain readable for
historical capsules but cannot satisfy V2 review.

```powershell
npm install
npm test
```

## Before you push

```bash
npm run check:privacy
```

**Run it before `git push`, not instead of the CI job.**

This repository is public, and the same check runs in CI - but a CI check on a
public branch is *detection after publication*. By the time the job turns red,
the blob is on GitHub, it is in GitHub's API, and anything watching the
repository has had it. Taking it back then means rewriting history and
re-issuing anything that leaked, not making another commit. The local run is
the control that actually prevents; CI is there for the push where somebody
forgot.

It is Node and git only - no bash, no `grep -P`, no GNU userland - so it
behaves identically on Windows and on `ubuntu-latest`. Its predecessor was a
pile of shell pipelines that could not be run on the development machine at
all, which is why nobody ever ran it early.

What it refuses: unapproved audio, video and image files (SVG included - a
traced recipe card is an image); archives, which hide every other category at
once; fixture, handoff, runtime, transcript, recording, bundle and visual-run
paths; credential filenames and credential-shaped contents; family-source
fingerprint and hash lists; and NUL bytes in tracked text, which silently make
a file unreviewable while every test stays green.

Each of those has a failing case in `test/privacy.test.mjs`, which builds a real
temporary git repository per category and runs the real command against it. A
guard that has only ever been green tells you nothing.

**What it does not do.** It matches shape - extensions, paths, byte patterns.
It cannot read a paragraph and decide whether a grandmother said it. An English
transcript pasted into a Markdown file passes every rule, and so does a name, an
address or a date of birth. It narrows the ways private material arrives by
accident; it does not decide what is private.

Deliberate exceptions go in `privacy-allowlist.json` as **exact paths under a
named rule**. Never globs: a glob is an exemption later files can join without
anyone reviewing them. An entry exempts one path from one rule, so allowlisting
a synthetic recording as audio does not also stop it being scanned for
credentials, and an entry that no longer matches anything is reported as stale
so it gets deleted.

`runOnHistory` from `./privacy/cli` additionally scans every reachable commit's
path/blob pairs and refuses shallow clones. Its exemptions require reviewed
`$sha256` values; `$history` holds exact paths that existed only historically.
Cookbook Agent runs it before pushing and in CI. Hash-bound exceptions reject
changed bytes even at the same path. A clean reachable-history check cannot
purge GitHub caches, old clones, or unauthorised future prose that the shape
rules do not recognise. Those limits remain explicit.

Two Cyrillic literals live in this repository and are not family material:
`'mwшщжю'` is a glyph-width bucket in `src/engine/textlayout.mjs`, and
`directionOf("торт")` is a direction assertion in `test/engine-arithmetic.test.mjs`.
Six characters and four - general vocabulary in a width table. The prose rule
triggers at twelve consecutive Cyrillic characters, so the distinction is a
property of the rule rather than a standing exemption. The defensible claim is
that **no family-derived Cyrillic prose is present**, not that there is no
Cyrillic.

---

Part of [Pripev](https://github.com/pripev-dev) – a voice-first family recipe
time capsule. A family recipe, in their own voice.
