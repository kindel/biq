#!/usr/bin/env python3
"""Regenerate data/index.json from the principle records.

The manifest exists so a browser can discover the set without globbing a
directory. It is never hand edited: run this, and scripts/validate.py fails
if the committed manifest no longer matches the records.
"""

import collections
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")


def main():
    records = []
    for f in sorted(os.listdir(DATA)):
        if not f.endswith(".json") or f == "index.json":
            continue
        records.append(json.load(open(os.path.join(DATA, f))))
    records.sort(key=lambda r: r["sort"])

    index = collections.OrderedDict([
        ("version", 1),
        ("generated", "scripts/build_index.py"),
        ("principles", [collections.OrderedDict([
            ("id", r["id"]),
            ("name", r["name"]),
            ("sort", r["sort"]),
            ("file", "data/%s.json" % r["id"]),
        ]) for r in records]),
    ])

    path = os.path.join(DATA, "index.json")
    open(path, "w").write(json.dumps(index, indent=2, ensure_ascii=False) + "\n")
    print("wrote data/index.json with %d principles" % len(records))
    return 0


if __name__ == "__main__":
    sys.exit(main())
