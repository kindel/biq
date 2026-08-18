#!/usr/bin/env python3
"""Add missing BIQ company and principle shells from kindel/principles.

Supports principles index v3, where a principle's id is a number and the
kebab name lives in slug. A company's id is still its directory name.

Also syncs aliases from upstream term labels (kind: alias or equivalent)
as a union with existing aliases so search cannot get worse.
"""

from __future__ import annotations

import json
import os
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BANK = ROOT / "data" / "questions.json"
INDEX_URL = os.environ.get(
    "PRINCIPLES_INDEX_URL",
    "https://raw.githubusercontent.com/kindel/principles/main/data/index.json",
)
PRINCIPLE_URL_TEMPLATE = os.environ.get(
    "PRINCIPLES_DATA_URL",
    "https://raw.githubusercontent.com/kindel/principles/main/data/{company}/{slug}.json",
)
SHA_URL = os.environ.get(
    "PRINCIPLES_SHA_URL",
    "https://api.github.com/repos/kindel/principles/commits/main",
)

HOWTO = [
    "Pick two or three questions per assigned {item}.",
    "Prefer tell-me-about-a-time over opinion questions.",
    "Probe with STAR: Situation, Task, Action (what you did), Result (measure it).",
    "Items marked Manager are aimed at people-manager candidates.",
]


def normalize_for_uniqueness(s: str) -> str:
    """Normalize a string the same way search does in js/biq.js.

    Casefold, treat hyphen/space/& consistently. Used to dedupe aliases.
    """
    s = s.lower()
    s = s.replace("&", " and ")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def fetch_principle_detail(company: str, slug: str) -> dict | None:
    """Fetch a single principle's full record from kindel/principles."""
    url = PRINCIPLE_URL_TEMPLATE.format(company=company, slug=slug)
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            return json.load(r)
    except Exception:
        return None


def extract_alias_labels(principle_detail: dict) -> list[str]:
    """Extract labels from terms with kind alias or equivalent (not facet)."""
    labels = []
    for term in principle_detail.get("terms", []):
        kind = term.get("kind", "")
        if kind in ("alias", "equivalent"):
            label = term.get("label", "")
            if label:
                labels.append(label)
    return labels


def union_aliases(existing: list[str], upstream: list[str]) -> list[str]:
    """Union existing aliases with upstream, preserving existing casing.

    When normalized forms match, keep the existing version. Add new ones
    from upstream using upstream's casing.
    """
    # Build lookup from normalized form to existing alias
    existing_by_norm = {}
    for a in existing:
        n = normalize_for_uniqueness(a)
        if n and n not in existing_by_norm:
            existing_by_norm[n] = a

    result = list(existing)
    for u in upstream:
        n = normalize_for_uniqueness(u)
        if not n:
            continue
        if n not in existing_by_norm:
            result.append(u)
            existing_by_norm[n] = u

    return result


def sync_aliases(bank: dict, dry_run: bool = False) -> list[str]:
    """Sync aliases from kindel/principles for all companies.

    For each principle, fetches the full record from upstream and unions
    alias/equivalent term labels with existing aliases. Only modifies the
    aliases array; questions and other fields are untouched.

    Returns a list of changes made (or that would be made in dry_run mode).
    """
    changes = []
    for company in bank.get("companies", []):
        cid = company.get("id", "")
        for principle in company.get("principles", []):
            slug = principle.get("slug", "")
            if not slug:
                continue

            detail = fetch_principle_detail(cid, slug)
            if not detail:
                continue

            upstream_labels = extract_alias_labels(detail)
            if not upstream_labels:
                continue

            existing = principle.get("aliases", [])
            merged = union_aliases(existing, upstream_labels)

            if merged != existing:
                added = [a for a in merged if a not in existing]
                if added:
                    changes.append(f"{cid}/{slug}: +{added}")
                if not dry_run:
                    principle["aliases"] = merged

    return changes


def load_index() -> dict:
    with urllib.request.urlopen(INDEX_URL, timeout=30) as r:
        return json.load(r)


def principles_sha() -> str:
    req = urllib.request.Request(
        SHA_URL, headers={"Accept": "application/vnd.github+json", "User-Agent": "kindel-cascade"}
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r).get("sha", "unknown")
    except Exception:
        return "unknown"


def item_for(set_name: str) -> str:
    if set_name == "10x Mindset":
        return "10x factor"
    words = set_name.split()
    last = words[-1]
    if last.endswith("s") and not last.endswith("ss"):
        last = last[:-1]
    if last.lower() in ("principle", "value", "factor"):
        last = last.lower()
    return " ".join(words[:-1] + [last])


def kind_for(item: str) -> str:
    low = item.lower()
    if "factor" in low:
        return "factor"
    if "value" in low:
        return "value"
    return "lp"


def principle_shell(p: dict, item: str) -> dict:
    """Build a new principle shell from upstream v3 data.

    In v3, p["id"] is a number and p["slug"] is the kebab name. Aliases derive
    from name and slug, never from the numeric id.
    """
    name = p["name"]
    pid = p["id"]
    slug = p.get("slug", "")
    aliases = [name.lower()]
    slug_as_words = slug.replace("-", " ")
    if slug_as_words and slug_as_words not in aliases:
        aliases.append(slug_as_words)
    shell = {
        "id": pid,
        "slug": slug,
        "name": name,
        "aliases": aliases,
        "kind": kind_for(item),
        "questions": [],
    }
    if p.get("group"):
        shell["group"] = p["group"]
    return shell


def company_shell(c: dict) -> dict:
    item = item_for(c["set"])
    return {
        "id": c["id"],
        "name": c["name"],
        "set": c["set"],
        "source": c.get("source", ""),
        "howTo": [line.format(item=item) for line in HOWTO],
        "examples": False,
        "item": item,
        "principles": [principle_shell(p, item) for p in c.get("principles", [])],
    }


def main() -> int:
    idx = load_index()
    sha = principles_sha()
    bank = json.loads(BANK.read_text())
    by_id = {c["id"]: c for c in bank.get("companies", [])}
    added_companies = []
    added_principles = []

    for c in idx.get("companies", []):
        cid = c["id"]
        if cid not in by_id:
            shell = company_shell(c)
            bank["companies"].append(shell)
            by_id[cid] = shell
            added_companies.append(cid)
            continue
        existing = by_id[cid]
        item = existing.get("item") or item_for(c["set"])

        have_by_id = {}
        have_by_slug = {}
        for ep in existing.get("principles", []):
            if isinstance(ep.get("id"), int):
                have_by_id[ep["id"]] = ep
            if ep.get("slug"):
                have_by_slug[ep["slug"]] = ep
            elif isinstance(ep.get("id"), str):
                have_by_slug[ep["id"]] = ep

        for p in c.get("principles", []):
            pid = p["id"]
            slug = p.get("slug", "")
            if pid in have_by_id:
                continue
            if slug in have_by_slug:
                continue
            existing.setdefault("principles", []).append(principle_shell(p, item))
            added_principles.append(f"{cid}/{slug or pid}")

    # Sync aliases from upstream term labels (alias + equivalent kinds)
    alias_changes = sync_aliases(bank)

    lines = [f"principles {sha}", ""]
    if added_companies:
        lines.append("new companies (examples: false, empty questions):")
        lines.extend(f"  {x}" for x in added_companies)
        lines.append("")
        lines.append("Write the bank, run Generate example packs, then flip examples to true by hand.")
    if added_principles:
        lines.append("new principles (empty questions):")
        lines.extend(f"  {x}" for x in added_principles)
    if alias_changes:
        lines.append("alias updates from upstream terms:")
        lines.extend(f"  {x}" for x in alias_changes)
    if not added_companies and not added_principles and not alias_changes:
        lines.append("no missing companies or principles, aliases up to date")
        print("\n".join(lines))
        return 0

    BANK.write_text(json.dumps(bank, indent=2, ensure_ascii=False) + "\n")
    report = ROOT / ".kindel" / "last-sync.txt"
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text("\n".join(lines) + "\n")
    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
