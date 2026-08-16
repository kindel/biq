# principles

Core data for the classic 14 leadership principles. Identity, the vocabulary people use to name
each principle, and the under / just right / over calibration rows.

This repository holds data and schema only. No user interface, no site tooling. An application
depends on it without inheriting anything it did not ask for.

## Layout

```
data/index.json          manifest, generated
data/<id>.json           one principle
scripts/validate.py      enforces SCHEMA.md
SCHEMA.md                the contract
```

## Use it

Hugo sites mount it as a module:

```
module github.com/kindel/principles
```

An application that serves JSON to a browser from its own origin vendors a pinned copy into its
own tree and checks that the copy still matches the tag it pinned.

## Check it

```
python3 scripts/validate.py
```

Run this before committing. It fails on a stale manifest, a duplicate term id, a facet pointing
at a row that does not exist, and every other rule SCHEMA.md states.

## Consumers

- `kindel/biq`, behavioral interview questions per principle.
- `kindel/lps`, the leadership principles user's manual.
