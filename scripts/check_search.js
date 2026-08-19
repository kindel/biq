#!/usr/bin/env node
// Checks the search matcher against the real bank. Lifts norm() and matches()
// out of js/biq.js rather than restating them, so this cannot drift from what
// the page actually runs.
//
//   node scripts/check_search.js
//
// Exits non-zero on any failure.
const fs = require("fs");
const path = require("path");

const ROOT = path.dirname(__dirname);

function lift(src) {
  const body = fs.readFileSync(src, "utf8");
  const grab = (name) => {
    const i = body.indexOf("function " + name + "(");
    if (i < 0) return "";
    let depth = 0;
    for (let k = body.indexOf("{", i); k < body.length; k++) {
      if (body[k] === "{") depth++;
      else if (body[k] === "}") { depth--; if (!depth) return body.slice(i, k + 1); }
    }
    return "";
  };
  const stop = body.includes("var STOP =") ? "var STOP = { and: true, the: true };" : "";
  const helpers = ["words", "oneEditApart", "nearWord"].map(grab).join("\n");
  return new Function(
    stop + "\n" + grab("norm") + "\n" + helpers + "\n" + grab("matches") +
    "\nreturn { norm: norm, matches: matches };"
  )();
}

const m = lift(path.join(ROOT, "js", "biq.js"));
const bank = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "questions.json"), "utf8"));
const principles = bank.companies.flatMap((c) =>
  c.principles.map((p) => Object.assign({}, p, { company: c.id })));
const hits = (q) => principles.filter((p) => m.matches(p, m.norm(q)))
                              .map((p) => p.company + "/" + p.slug);

const fail = [];

// Every name and every alias finds its own principle. This is the one that
// matters: a precision fix that loses a real lookup is not a fix.
let checked = 0;
for (const p of principles) {
  for (const s of [p.name].concat(p.aliases || [])) {
    checked++;
    if (!m.matches(p, m.norm(s))) fail.push(`${p.company}/${p.slug} does not match its own ${JSON.stringify(s)}`);
  }
}

// Junk and stop words match nothing.
for (const q of ["zzzz", "banana", "xyzzy plugh", "the", "and"]) {
  const h = hits(q);
  if (h.length) fail.push(`${JSON.stringify(q)} should match nothing, matched ${h.length}: ${h.join(", ")}`);
}

// Amazon abbreviations must include their own principle. Some abbreviations
// (like bfa) are now shared with other companies that have added them upstream.
const AMAZON_ABBREV = {
  "i&s": "amazon/invent-and-simplify",
  "d&c": "amazon/have-backbone-disagree-and-commit",
  "et": "amazon/earn-trust",
  "tb": "amazon/think-big",
  "bfa": "amazon/bias-for-action",
  "dd": "amazon/dive-deep",
  "aral": "amazon/are-right-a-lot",
  "hdtb": "amazon/hire-and-develop-the-best",
  "ihs": "amazon/insist-on-the-highest-standards",
};
for (const [q, want] of Object.entries(AMAZON_ABBREV)) {
  const h = hits(q);
  if (!h.includes(want)) {
    fail.push(`${JSON.stringify(q)} should include ${want}, got ${JSON.stringify(h)}`);
  }
}

// Arm shorts that were biq-only must still work after alias union.
const ARM_SHORTS = {
  "passion": "arm/passion-for-the-mission",
  "mission": "arm/passion-for-the-mission",
  "decisive": "arm/be-decisive-in-ambiguity-and-change",
  "ambiguity": "arm/be-decisive-in-ambiguity-and-change",
  "challenge": "arm/challenge-skillfully",
  "energy": "arm/optimize-for-endurance-and-resilience",
  "accountable": "arm/own-it",
};
for (const [q, want] of Object.entries(ARM_SHORTS)) {
  const h = hits(q);
  if (!h.includes(want)) {
    fail.push(`Arm short ${JSON.stringify(q)} should include ${want}, got ${JSON.stringify(h)}`);
  }
}

// Amazon equivalents from principles must now work.
const AMAZON_EQUIV = {
  "acts like an owner": "amazon/ownership",
  "takes responsibility": "amazon/ownership",
  "move fast": "amazon/bias-for-action",
  "customer advocacy": "amazon/customer-obsession",
  "makes wise decisions": "amazon/are-right-a-lot",
};
for (const [q, want] of Object.entries(AMAZON_EQUIV)) {
  const h = hits(q);
  if (!h.includes(want)) {
    fail.push(`Amazon equivalent ${JSON.stringify(q)} should include ${want}, got ${JSON.stringify(h)}`);
  }
}

// Facet labels from facets.json must hit all principles mapped to that facet.
// Search is company-scoped at runtime, but these tests verify the alias exists.
const FACET_LABELS = [
  { label: "acts like an owner", want: ["amazon/ownership", "dawn/ownership"] },
  { label: "customer obsession", want: ["amazon/customer-obsession", "dawn/customer-success-is-our-success"] },
  { label: "bias for action", want: ["amazon/bias-for-action", "dawn/bias-for-action"] },
  { label: "invent and simplify", want: ["amazon/invent-and-simplify", "dawn/invent-and-simplify"] },
  { label: "earn trust", want: ["amazon/earn-trust", "dawn/earn-trust", "toyota/respect"] },
  { label: "hire and develop the best", want: ["amazon/hire-and-develop-the-best", "dawn/hire-and-develop-the-best", "toyota/teamwork"] },
  { label: "dive deep", want: ["amazon/dive-deep", "toyota/genchi-genbutsu"] },
  { label: "better every day", want: ["dawn/better-than-yesterday", "toyota/kaizen"] },
  { label: "think big", want: ["amazon/think-big", "toyota/challenge"] },
];
let facetChecked = 0;
for (const { label, want } of FACET_LABELS) {
  const h = hits(label);
  for (const w of want) {
    facetChecked++;
    if (!h.includes(w)) {
      fail.push(`Facet label ${JSON.stringify(label)} should include ${w}, got ${JSON.stringify(h)}`);
    }
  }
}

// Near misses reach the right principle.
for (const [q, want] of [["frugalty", "amazon/frugality"], ["works backwards", "coupang/aim-high-and-find-a-way"]]) {
  if (!hits(q).includes(want)) fail.push(`${JSON.stringify(q)} should reach ${want}, got ${JSON.stringify(hits(q))}`);
}

if (fail.length) {
  console.log(`FAIL (${fail.length})`);
  fail.forEach((f) => console.log("  " + f));
  process.exit(1);
}
console.log(`OK: ${principles.length} principles, ${checked} name and alias lookups, ` +
            `${Object.keys(AMAZON_ABBREV).length} Amazon abbreviations, ` +
            `${Object.keys(ARM_SHORTS).length} Arm shorts, ` +
            `${Object.keys(AMAZON_EQUIV).length} Amazon equivalents, ` +
            `${facetChecked} facet label lookups, junk and near-miss probes`);
