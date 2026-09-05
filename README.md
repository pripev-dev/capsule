# Capsule

**The contract that lets a family rebuild their capsule without us.**

`capsule.json` and its sibling manifests, the deterministic composition
engine, and a minimal offline viewer. Everything needed to open a
preserved family recipe with no database, no account, and no company.

> **Status: Phase A contract implemented, and the deterministic composition
> engine is here.** The schemas, validators, reference fixture, cross-manifest
> checks and the ported engine run in **81 tests**. On a clean public clone 71
> pass and 10 skip - those 10 replay the private Design export and say so rather
> than failing. The offline viewer and the renderer remain later work.

## Visual fragment contract

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

---

Part of [Pripev](https://github.com/pripev-dev) – a voice-first family recipe
time capsule. A family recipe, in their own voice.
