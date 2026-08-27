# Capsule – Development Guide

> Canonical agent guide for this repository. Read by Codex, Claude Code (via
> `@AGENTS.md` in `CLAUDE.md`), Cursor, and anything else that loads
> `AGENTS.md`. Edit **this** file – `CLAUDE.md` is a pointer.

## Project overview

**Status: Phase A contract implemented.** The schema set, validators, reference
fixture and visual-fragment manifest V2 pass 29 tests. The composition engine
and offline viewer remain later work. Nothing in this repository may be
described as working until its test is green.

Two things depend on this repository and neither may own it: the cookbook
agent writes `capsule.json`, and the application renders it. The schema is
therefore the seam, and it is versioned, migrated and tested on its own.

It is private today and **goes public before launch**. The promise in the
proposal - that a family can reconstruct their capsule without us - is only
checkable if the schema and the viewer are readable by anyone.

Pripev is a voice-first family recipe time capsule. The product is defined in
the [handbook](https://github.com/pripev-dev/handbook); the org-wide rules,
repo architecture and phase gates live in the `dotPrivate` umbrella at
`PROJECTS/19-Pripev/`. **Read the proposal before building anything here.** A
previous implementation was deleted on 2026-08-26 for not following it.

## Documentation map

| Doc | Read it when |
|---|---|
| [handbook](https://github.com/pripev-dev/handbook) | **before any code** – the product definition |
| umbrella `AGENTS.md` | you need the hard rules, repo split, or skill roster |
| umbrella `ROADMAP.md` | you need to know what phase this is and what gates it |

## Guardrails

- **Never let a rendered output become the truth.** HTML, PDF and screenshots are disposable derivatives. `canonical` is `false` by construction.
- **Never put a pixel coordinate or a CSS string in composition intent.** The agent declares roles, density and seeds; the engine computes geometry.
- **Never mix direct cutouts with generated derivatives.** Different types, different directories, different manifests. A generated interpretation is never described as a piece of the original.
- **Never commit family material.** The redacted fixture exists so the schema can be judged without the recording. Real material stays in `dotPrivate`.

## Conventions

- Documents are zero-padded and kebab-cased in `docs/`, with `# NN – Title`
  headings using an en dash.
- Prose hard-wraps at about 78 columns. British spelling. En dashes, never em
  dashes.
- Comments in configuration files state the *reason* for a rule, naming the
  failure that motivated it where there was one.
- No secret, token, `.env` file, or paid API response enters git. Credentials
  arrive through the process environment only.
