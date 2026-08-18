#!/usr/bin/env python3
"""One-time migration: add numeric id and slug to existing BIQ principles.

Run once before sync_from_principles.py after upstream moves to v3.

Matches existing principles by their kebab id (which becomes slug) against
the upstream index to get the numeric id. Preserves all existing questions,
aliases, kind, group, and examples flags.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BANK = ROOT / "data" / "questions.json"
EXAMPLES_DIR = ROOT / "data" / "examples"
INDEX_URL = os.environ.get(
    "PRINCIPLES_INDEX_URL",
    "https://raw.githubusercontent.com/kindel/principles/main/data/index.json",
)


def norm(s: str) -> str:
    return " ".join("".join(ch.lower() if ch.isalnum() else " " for ch in (s or "")).split())


def fnv1a(key: str) -> str:
    h = 2166136261
    for c in key.encode("ascii"):
        h ^= c
        h = (h * 16777619) & 0xFFFFFFFF
    return f"{h:08x}"


def old_slug_for(principle_name: str, question_text: str) -> str:
    """Old pack key: norm(name) + "|" + norm(question)."""
    return fnv1a(norm(principle_name) + "|" + norm(question_text))


def new_slug_for(principle_id: int, question_text: str) -> str:
    """New pack key: str(id) + "|" + norm(question)."""
    return fnv1a(str(principle_id) + "|" + norm(question_text))


def load_index() -> dict:
    with urllib.request.urlopen(INDEX_URL, timeout=30) as r:
        return json.load(r)


def main() -> int:
    idx = load_index()
    bank = json.loads(BANK.read_text())

    upstream_by_company_slug: dict[tuple[str, str], dict] = {}
    for c in idx.get("companies", []):
        cid = c["id"]
        for p in c.get("principles", []):
            slug = p.get("slug", "")
            if slug:
                upstream_by_company_slug[(cid, slug)] = p

    migrated = []
    missing = []
    already_numeric = []
    pack_renames = []

    for company in bank.get("companies", []):
        cid = company["id"]
        for principle in company.get("principles", []):
            current_id = principle.get("id")
            if isinstance(current_id, int):
                already_numeric.append(f"{cid}/{principle.get('slug', current_id)}")
                continue

            old_slug = current_id
            key = (cid, old_slug)
            if key not in upstream_by_company_slug:
                missing.append(f"{cid}/{old_slug}")
                continue

            upstream = upstream_by_company_slug[key]
            new_id = upstream["id"]
            new_slug = upstream.get("slug", old_slug)

            for q in principle.get("questions", []):
                qtext = q.get("text", "")
                if not qtext:
                    continue
                old_pack_slug = old_slug_for(principle["name"], qtext)
                new_pack_slug = new_slug_for(new_id, qtext)
                if old_pack_slug != new_pack_slug:
                    pack_renames.append({
                        "principle": principle["name"],
                        "question": qtext[:60] + ("..." if len(qtext) > 60 else ""),
                        "old_slug": old_pack_slug,
                        "new_slug": new_pack_slug,
                    })

            principle["id"] = new_id
            principle["slug"] = new_slug
            migrated.append(f"{cid}/{new_slug} -> {new_id}")

    print(f"migrated: {len(migrated)}")
    print(f"already numeric: {len(already_numeric)}")
    print(f"missing from upstream: {len(missing)}")
    print(f"pack renames needed: {len(pack_renames)}")

    if missing:
        print("\nWARNING: These principles were not found in upstream:")
        for m in missing:
            print(f"  {m}")
        print("\nProceeding anyway, but these will have string ids until upstream adds them.")

    BANK.write_text(json.dumps(bank, indent=2, ensure_ascii=False) + "\n")
    print(f"\nWrote {BANK}")

    renamed = 0
    rename_failed = []
    for rename in pack_renames:
        old_path = EXAMPLES_DIR / f"{rename['old_slug']}.json"
        new_path = EXAMPLES_DIR / f"{rename['new_slug']}.json"
        if new_path.exists():
            rename_failed.append({
                **rename,
                "reason": "destination already exists",
            })
            continue
        if not old_path.exists():
            continue
        os.rename(old_path, new_path)
        renamed += 1

    print(f"pack files renamed: {renamed}")
    if rename_failed:
        print(f"\nWARNING: {len(rename_failed)} pack renames failed:")
        for f in rename_failed[:5]:
            print(f"  {f['old_slug']} -> {f['new_slug']}: {f['reason']}")
        if len(rename_failed) > 5:
            print(f"  ... and {len(rename_failed) - 5} more")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
