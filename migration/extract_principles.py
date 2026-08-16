#!/usr/bin/env python3
"""Build the kindel/principles seed from this repository's LP data.

Run from the biq repository root:

    python3 migration/extract_principles.py <path-to-principles-checkout>

Reads data/lps/*.json, emits the principle records and the generated
manifest, and copies migration/template/ over the top. The output is the
complete content of kindel/principles, so running this twice produces the
same tree and the seed can be reproduced without this session.

Delete migration/ once the migration is finished. See migration/README.md.
"""

import collections
import json
import os
import re
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data", "lps")
TEMPLATE = os.path.join(ROOT, "migration", "template")

# label -> rows it covers. A label absent from here is an equivalent, meaning
# the whole principle. Row ids are checked against the real taxonomy below.
FACETS = {
    "customer-obsession": {
        "voice of the customer": ["collecting-and-responding-to-feedback", "responding-to-customer-comments"],
        "user empathy": ["product-design", "responding-to-a-complaint"],
        "working backwards from the customer": ["decision-making", "product-design"],
    },
    "ownership": {
        "end to end responsibility": ["knowing-what-you-own", "owning-dependencies", "problems-outside-your-area"],
    },
    "invent-and-simplify": {
        "creates simple solutions": ["product-simplicity", "maintainable-features", "simplifying-a-process"],
        "thinks different": ["complexity-vs-novelty", "bureaucracy-vs-novelty"],
        "reduces complexity": ["simplifying-a-process", "product-simplicity", "scalability-thinking"],
        "original thinking": ["purpose-of-innovation", "complexity-vs-novelty"],
    },
    "are-right-a-lot": {
        "good instincts": ["committing-under-uncertainty", "calculated-risks"],
        "seeks diverse perspectives": ["listening-then-deciding", "seeking-dissent", "letting-others-be-right"],
        "seeks disconfirming evidence": ["seeking-dissent", "always-right-trap"],
        "sound judgment under uncertainty": ["committing-under-uncertainty", "recommending-under-ambiguity", "calculated-risks"],
    },
    "learn-and-be-curious": {
        "self improvement": ["new-process-missed-deadline", "teammate-causes-an-outage"],
    },
    "hire-and-develop-the-best": {
        "grows people": ["mentoring-beyond-your-team", "exporting-talent", "coaching-follow-up"],
        "talent development": ["goal-setting-with-employees", "coaching-follow-up", "underperformers-and-stretch"],
    },
    "insist-on-the-highest-standards": {
        "better every day": ["tracking-goals", "confronting-issues"],
        "continuous improvement": ["tracking-goals", "confronting-issues", "diving-into-problems"],
        "high expectations": ["setting-goals", "holding-accountable", "underachievers"],
    },
    "think-big": {
        "bold vision": ["strategy-direction", "growth-goals", "stretch-goals"],
        "strategic thinking": ["strategy-direction", "landscape", "time-horizon"],
        "long term bets": ["time-horizon", "delivery-vs-opportunity"],
    },
    "bias-for-action": {
        "sense of urgency": ["customer-pain", "step-up", "follow-through"],
        "calculated risk taking": ["input-and-reversibility", "fear-of-wrong", "prototype"],
        "decisiveness": ["input-and-reversibility", "fear-of-wrong"],
    },
    "frugality": {
        "resourcefulness": ["invent-around-spend", "budget-as-input"],
        "scrappy": ["invent-around-spend", "travel"],
        "cost consciousness": ["near-vs-long", "budget-as-input", "owner-mindset"],
    },
    "earn-trust": {
        "listens openly": ["listen-and-candor", "feedback-both-ways"],
        "speaks candidly": ["call-it-like-it-is", "feedback-both-ways", "no-politics"],
        "acts with integrity": ["hard-promises", "no-politics", "respect-for-peers"],
        "builds relationships": ["respect-for-peers", "no-politics"],
        "bad news travels fast": ["hiding-vs-dwelling", "upward-and-the-team", "call-it-like-it-is"],
    },
    "dive-deep": {
        "data driven": ["metrics-review", "facts-not-i-think", "unit-economics"],
        "hands on": ["sleeves", "all-levels"],
        "audits the details": ["unusual-metric", "good-results", "business-case"],
        "detail oriented": ["drivers-not-minutiae", "unusual-metric"],
    },
    "have-backbone-disagree-and-commit": {
        "respectfully challenge": ["speak-with-an-alternative", "issue-not-person", "style-in-the-room"],
        "push back": ["speak-with-an-alternative", "data-then-commit", "escalate-then-commit"],
        "speak up": ["speak-with-an-alternative", "social-cohesion"],
        "commit once decided": ["after-the-decision", "manager-translation", "conviction-and-commit"],
    },
    "deliver-results": {
        "focus on outcomes": ["right-metrics", "metrics-cadence", "goal-tradeoffs"],
        "honors commitments": ["quality-and-date", "schedules", "plan-vs-reality"],
        "rise to the occasion": ["obstacles", "sustainable-pace"],
    },
}


def slug(s):
    s = s.lower().replace("&", " and ")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


def main():
    if len(sys.argv) != 2:
        print(__doc__.strip())
        return 2
    out = os.path.abspath(sys.argv[1])
    if not os.path.isdir(os.path.join(out, ".git")):
        print("not a git checkout: %s" % out)
        return 2

    errors = []
    dropped = []
    records = []

    for f in sorted(os.listdir(SRC)):
        if not f.endswith(".json") or f == "index.json":
            continue
        src_rec = json.load(open(os.path.join(SRC, f)))
        pid = src_rec["id"]
        rows = src_rec["rows"]
        row_ids = {r["id"] for r in rows}
        facets = FACETS.get(pid, {})

        for label, refs in facets.items():
            if label not in src_rec["synonyms"]:
                errors.append("%s: facet %r is not a synonym" % (pid, label))
            for r in refs:
                if r not in row_ids:
                    errors.append("%s: facet %r points at unknown row %r"
                                  % (pid, label, r))

        terms = []
        taken = {}

        def add(t):
            # Spelling variants that slug identically are the same term.
            # "think-big" and "think big" already normalise the same way in
            # search, so one of them has never done anything.
            if t["id"] in taken:
                dropped.append("%s: %r is a duplicate of %r"
                               % (pid, t["label"], taken[t["id"]]))
                return
            taken[t["id"]] = t["label"]
            terms.append(t)

        for a in src_rec["aliases"]:
            add(collections.OrderedDict(
                [("id", slug(a)), ("label", a), ("kind", "alias")]))
        for s in src_rec["synonyms"]:
            t = collections.OrderedDict([("id", slug(s)), ("label", s)])
            if s in facets:
                t["kind"] = "facet"
                t["rows"] = facets[s]
            else:
                t["kind"] = "equivalent"
            add(t)

        records.append(collections.OrderedDict([
            ("id", pid),
            ("name", src_rec["name"]),
            ("sort", src_rec["sort"]),
            ("definition", src_rec["definition"]),
            ("terms", terms),
            ("rows", rows),
        ]))

    records.sort(key=lambda r: r["sort"])

    # Term ids must be unique across every principle: a consumer addresses a
    # term by id alone, with no principle in the URL.
    seen = {}
    for rec in records:
        for t in rec["terms"]:
            if t["id"] in seen:
                errors.append("term id %r used by both %s and %s"
                              % (t["id"], seen[t["id"]], rec["id"]))
            seen[t["id"]] = rec["id"]

    if errors:
        print("FAILED")
        for e in errors:
            print("  " + e)
        return 1

    data_out = os.path.join(out, "data")
    os.makedirs(data_out, exist_ok=True)
    for rec in records:
        open(os.path.join(data_out, rec["id"] + ".json"), "w").write(
            json.dumps(rec, indent=2, ensure_ascii=False) + "\n")

    for name in os.listdir(TEMPLATE):
        s = os.path.join(TEMPLATE, name)
        d = os.path.join(out, name)
        if os.path.isdir(s):
            shutil.copytree(s, d, dirs_exist_ok=True)
        else:
            shutil.copy2(s, d)

    rc = os.system("python3 %s" % os.path.join(out, "scripts", "build_index.py"))
    if rc:
        return 1

    for d in dropped:
        print("dropped duplicate term: %s" % d)
    print("wrote %d records to %s" % (len(records), data_out))
    print("now run: python3 scripts/validate.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
