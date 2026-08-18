#!/usr/bin/env python3
"""Add missing BIQ company and principle shells from kindel/principles."""

from __future__ import annotations

import json
import os
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BANK = ROOT / "data" / "questions.json"
INDEX_URL = os.environ.get(
    "PRINCIPLES_INDEX_URL",
    "https://raw.githubusercontent.com/kindel/principles/main/data/index.json",
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
    name = p["name"]
    pid = p["id"]
    aliases = [name.lower()]
    if pid.replace("-", " ") not in aliases:
        aliases.append(pid.replace("-", " "))
    shell = {
        "id": pid,
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
        have = {p["id"] for p in existing.get("principles", [])}
        item = existing.get("item") or item_for(c["set"])
        for p in c.get("principles", []):
            if p["id"] in have:
                continue
            existing.setdefault("principles", []).append(principle_shell(p, item))
            added_principles.append(f"{cid}/{p['id']}")

    lines = [f"principles {sha}", ""]
    if added_companies:
        lines.append("new companies (examples: false, empty questions):")
        lines.extend(f"  {x}" for x in added_companies)
        lines.append("")
        lines.append("Write the bank, run Generate example packs, then flip examples to true by hand.")
    if added_principles:
        lines.append("new principles (empty questions):")
        lines.extend(f"  {x}" for x in added_principles)
    if not added_companies and not added_principles:
        lines.append("no missing companies or principles")
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
