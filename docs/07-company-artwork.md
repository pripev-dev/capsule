# 07 – Optional company artwork in a family document

The owner authorised selected existing illustrations for the grandmother's
cookbooks on 1 October 2026. This is explicit use in these documents, not
permission to apply company art automatically to every family or to restyle
saved pages by season.

`companyArtworkPack` is an optional Capsule revision 2 field. Older documents
remain valid and retain their existing rendering. The pack references a
separate `company-artwork-manifest.schema.json` document and an exact allowlist
of `ill_` identifiers. Its manifest is stored in `visual/company-artwork/`.
Serialise the manifest as sorted-key canonical JSON when recording its hash.

Each illustration records its output hash, generated origin and prompt,
available model identity, creation time, approval attribution and reviewed
output hash. An unavailable model identity is null rather than invented.
Public-use permission is retained separately from private document approval.
The adapter must verify actual file bytes before exposing the image; contract
validation alone cannot inspect a PNG.

Company illustrations can enter opening clusters or free placements. They
cannot enter the family fragment allowlist, transcript evidence or the
sampled-family-colour references. Family direct cutouts and optional
source-derived stickers keep their existing separate manifests and types.
The agent chooses which approved objects serve the recording; the geometry
engine remains unaware of their editorial meaning.

Acceptance requires the separate manifest, matching canonical manifest hash,
unique identifiers, exact approval allowlist and reviewed output hashes.
Pending or rejected assets fail. Public documents also require public-use
approval for every selected piece. The offline reading copy preserves the
manifest and artwork bytes, checks included images against their references,
and labels the images as generated company decoration rather than family
source. Omitted images are described as omitted.

This contract and offline support do not complete application integration.
The composition adapter, application asset delivery, permission-filtered
exports and publication check must carry the separate pack before company
illustrations are enabled in hosted family pages. Public publication must
check each selected illustration's public-use permission; private approval
alone does not grant it. No family document or image study is changed by
adding this schema.
