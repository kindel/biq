#!/usr/bin/env python3
"""Validate the principle records. Exits non-zero on any problem.

Checks the invariants SCHEMA.md states, so the rules are enforced by this
script rather than by a human remembering to read the document.
"""

import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
KINDS = ("alias", "equivalent", "facet")
SLUG = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")


def slug(s):
    s = s.lower().replace("&", " and ")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def main():
    errs = []
    files = sorted(f for f in os.listdir(DATA)
                   if f.endswith(".json") and f != "index.json")
    records = []

    for f in files:
        path = os.path.join(DATA, f)
        try:
            rec = json.load(open(path))
        except ValueError as e:
            errs.append("%s: not valid JSON, %s" % (f, e))
            continue
        records.append(rec)
        where = rec.get("id", f)

        if rec.get("id") != f[:-5]:
            errs.append("%s: id %r does not match the filename" % (f, rec.get("id")))
        for key in ("id", "name", "sort", "definition", "terms", "rows"):
            if key not in rec:
                errs.append("%s: missing %r" % (where, key))
        if not SLUG.match(rec.get("id", "")):
            errs.append("%s: id is not kebab-case" % where)

        row_ids = set()
        for r in rec.get("rows", []):
            if not SLUG.match(r.get("id", "")):
                errs.append("%s: row id %r is not kebab-case" % (where, r.get("id")))
            if r["id"] in row_ids:
                errs.append("%s: duplicate row id %r" % (where, r["id"]))
            row_ids.add(r["id"])
            for key in ("situation", "under", "justRight", "over"):
                if not r.get(key):
                    errs.append("%s: row %r missing %r" % (where, r["id"], key))
        if not 5 <= len(rec.get("rows", [])) <= 12:
            errs.append("%s: has %d rows, expected five to 12"
                        % (where, len(rec.get("rows", []))))

        local = set()
        for t in rec.get("terms", []):
            tid = t.get("id", "")
            if not SLUG.match(tid):
                errs.append("%s: term id %r is not kebab-case" % (where, tid))
            if slug(t.get("label", "")) != tid:
                errs.append("%s: term id %r is not the slug of label %r"
                            % (where, tid, t.get("label")))
            if tid in local:
                errs.append("%s: duplicate term id %r" % (where, tid))
            local.add(tid)
            if t.get("kind") not in KINDS:
                errs.append("%s: term %r has kind %r, expected one of %s"
                            % (where, tid, t.get("kind"), ", ".join(KINDS)))
            if t.get("kind") == "facet":
                if not t.get("rows"):
                    errs.append("%s: facet %r carries no rows" % (where, tid))
                for r in t.get("rows", []):
                    if r not in row_ids:
                        errs.append("%s: facet %r points at unknown row %r"
                                    % (where, tid, r))
            elif "rows" in t:
                errs.append("%s: term %r is %s but carries rows"
                            % (where, tid, t.get("kind")))

    # A consumer addresses a term by id alone, with no principle in the URL.
    seen = {}
    for rec in records:
        for t in rec.get("terms", []):
            tid = t.get("id")
            if tid in seen:
                errs.append("term id %r used by both %s and %s"
                            % (tid, seen[tid], rec.get("id")))
            seen[tid] = rec.get("id")

    sorts = [r.get("sort") for r in records]
    if sorted(sorts) != list(range(1, len(records) + 1)):
        errs.append("sort must be one through %d with no gaps or repeats, got %s"
                    % (len(records), sorted(sorts)))

    # index.json is generated, so it must still match the records.
    index_path = os.path.join(DATA, "index.json")
    if not os.path.exists(index_path):
        errs.append("data/index.json is missing")
    else:
        index = json.load(open(index_path))
        want = [{"id": r["id"], "name": r["name"], "sort": r["sort"],
                 "file": "data/%s.json" % r["id"]}
                for r in sorted(records, key=lambda r: r.get("sort", 0))]
        if index.get("principles") != want:
            errs.append("data/index.json is stale, rebuild it")

    if errs:
        print("FAIL (%d)" % len(errs))
        for e in errs:
            print("  " + e)
        return 1

    kinds = {}
    for rec in records:
        for t in rec["terms"]:
            kinds[t["kind"]] = kinds.get(t["kind"], 0) + 1
    print("OK: %d principles, %d rows, %d terms (%s)"
          % (len(records),
             sum(len(r["rows"]) for r in records),
             sum(kinds.values()),
             ", ".join("%s %d" % kv for kv in sorted(kinds.items()))))
    return 0


if __name__ == "__main__":
    sys.exit(main())
