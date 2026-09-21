# 06 – Portable archive integrity

The archive module packages explicitly supplied, authorised bytes into a ZIP.
It does not crawl directories, decide permission or claim a complete export.
The application must supply the filtered capsule, media, schemas, licensed
fonts and rendered fallbacks. No missing source can be invented.

`archive.json` version 1 lists each payload path, length and SHA-256.
`checksums.sha256` covers every payload plus that index. Hashes detect accidental
corruption, not authenticity against replacement of the entire ZIP. This is
packaging metadata, not a replacement for capsule.json or its preservation
manifest. ZIP uses stored entries because media is already compressed.
[fflate](https://github.com/101arrowz/fflate) 0.8.3 is pinned.

Verification rejects missing, unlisted, duplicate, case-aliased or overlapping
paths, unsafe portable filenames, mismatched hashes and excess size. Defaults
are 4096 entries, 64 MiB per entry and 256 MiB total. These implementation
bounds are not an advertised allowance. Larger exports need streaming and
approved resource limits. No file is written until verification succeeds.

`restoreArchive` creates a new directory beneath a caller-chosen existing
parent. It never merges with an earlier restore, replaces originals, runs
archive code or imports access grants. Failed writes remove only the new
folder. A same-disk drill is not proof of independent preservation.

Five integration tests cover byte-identical repeated restores, unchanged
source ZIPs, corruption, extra/missing content, checksum changes, unsafe paths,
central-directory duplicates and compressed oversized entries.

Hosted permission filtering, offline rendering, font licensing, PDF and the
export sheet remain required work. This module alone does not complete M13.


## Offline reading fallback

`offlineHtml` generates a file-openable reader with escaped family text,
original block order, text marks, transcript versions and explicit native audio
controls. Media links resolve only to supplied archive paths. It has no remote
scripts, fetch calls, account requirement or autoplay. A CSP restricts resources
to local files and the one hashed font-check script. A missing licensed capsule
font refuses generation; a failed browser font load leaves the recipe hidden
with a visible explanation instead of silently declaring a successful render.

The reader is a minimal fallback, not the approved composed scrapbook layout.
Visual fragment placement and PDF remain separate work. The capsule document
is still canonical. No inferred layout or replacement recipe text is stored.

Seven focused archive/reader tests pass. A synthetic extracted copy was opened
in Chromium from a file URL with network disabled, at 320px. The bundled
Alegreya font loaded, the recipe was visible, no horizontal overflow occurred,
and the console had no errors or warnings. The browser was closed afterwards.
This check does not establish full media playback or human acceptance.


## Checking a copy without the hosted application

With Node 22 or later and this package's dependencies installed:

```sh
npm run archive -- verify /path/to/family-capsule.zip
npm run archive -- restore /path/to/family-capsule.zip /existing/parent
npm run archive -- verify-directory /path/to/extracted-copy
```

Verification prints a short result and exits nonzero on damage. Restoration
prints the new directory it allocated. The directory verifier rejects symlinks
and non-file entries, applies size/count bounds before reading, and verifies
all extracted files against the index and checksums without recompressing.
It does not execute the viewer or contact Pripev. Empty directories carry no
canonical content; only the indexed files participate in integrity checking.

Eight focused tests pass, including the real command's successful verify and
restore paths, failed extracted-copy verification and unchanged source bytes.


The reader accepts `font.faces` with local WOFF2 paths, styles, weights and
Unicode ranges. A legacy single `font.path` still means one normal 400 face.
All files and the licence must be included. Normal text coverage is checked
against block text, marginal notes and every transcript version before HTML is
written; invalid CSS descriptors and missing subsets refuse rendering.
The browser loads faces using the actual page and transcript characters before
revealing the main reading content. Declared ranges do not prove glyph quality;
font files still need verified provenance and browser acceptance.

A synthetic Latin/Cyrillic reader was checked offline in Chromium at 320px:
both subsets loaded, no horizontal overflow and no console errors. This remains
a semantic fallback, not acceptance of the composed layout or PDF export.


An optional validated fragment manifest adds an attachment gallery for approved
included raster images. Captions are escaped and included in font coverage.
Direct cutouts and generated images have distinct labels. Source lineage and
approval are checked; omitted files have no image URL. The gallery does not
reconstruct composition placement, and media permission filtering remains the
caller's responsibility before packaging.
