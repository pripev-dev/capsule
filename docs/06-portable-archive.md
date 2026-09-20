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
