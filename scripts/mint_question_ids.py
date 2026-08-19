#!/usr/bin/env python3
"""Mint stable question ids from existing pack filenames.

For each question, computes the FNV-1a hash that generate.py uses to name pack
files, then stores that hash as the question's id. The hash is the current pack
filename stem, so editing question text no longer orphans its examples.

Run once:
    python scripts/mint_question_ids.py

This writes data/questions.json in place. Commit the result before any text edits.
"""

import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BANK = os.path.join(ROOT, "data", "questions.json")
EXAMPLES_DIR = os.path.join(ROOT, "data", "examples")


# One hash, one owner. Importing from generate.py is what keeps a minted id
# identical to the filename generate.py writes; a copy here drifted once.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from generate import norm, slug_for  # noqa: E402


def main():
    bank = json.load(open(BANK, encoding="utf-8"))
    companies = bank.get("companies") or []
    if not companies:
        sys.exit("No companies in bank")

    minted = 0
    already = 0
    missing_packs = []
    
    for company in companies:
        has_examples = company.get("examples") is not False
        for principle in company.get("principles") or []:
            pid = principle.get("id")
            if not isinstance(pid, int):
                sys.exit(f"Principle {principle.get('name')!r} has non-integer id {pid!r}")
            
            for question in principle.get("questions") or []:
                text = question.get("text") or ""
                qid = slug_for(pid, text)
                
                if question.get("id"):
                    if question["id"] != qid:
                        print(f"WARNING: existing id {question['id']} != computed {qid} for {text[:50]}...")
                    already += 1
                else:
                    question["id"] = qid
                    minted += 1
                
                pack_path = os.path.join(EXAMPLES_DIR, qid + ".json")
                if has_examples and not os.path.exists(pack_path):
                    missing_packs.append({
                        "company": company.get("id"),
                        "principle": principle.get("name"),
                        "question": text[:60],
                        "id": qid,
                    })

    with open(BANK, "w", encoding="utf-8") as f:
        json.dump(bank, f, indent=2, ensure_ascii=False)
        f.write("\n")
    
    print(f"Minted {minted} question ids, {already} already had ids.")
    if missing_packs:
        print(f"\nWARNING: {len(missing_packs)} questions have no pack file:")
        for m in missing_packs[:10]:
            print(f"  {m['company']}/{m['principle']}: {m['question']}")
        if len(missing_packs) > 10:
            print(f"  ... and {len(missing_packs) - 10} more")
    else:
        print("All pack files present for companies with examples.")


if __name__ == "__main__":
    main()
