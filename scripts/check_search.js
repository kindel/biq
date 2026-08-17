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
                              .map((p) => p.company + "/" + p.id);

const fail = [];

// Every name and every alias finds its own principle. This is the one that
// matters: a precision fix that loses a real lookup is not a fix.
let checked = 0;
for (const p of principles) {
  for (const s of [p.name].concat(p.aliases || [])) {
    checked++;
    if (!m.matches(p, m.norm(s))) fail.push(`${p.company}/${p.id} does not match its own ${JSON.stringify(s)}`);
  }
}

// Junk and stop words match nothing.
for (const q of ["zzzz", "banana", "xyzzy plugh", "the", "and"]) {
  const h = hits(q);
  if (h.length) fail.push(`${JSON.stringify(q)} should match nothing, matched ${h.length}: ${h.join(", ")}`);
}

// An abbreviation resolves to the one principle it abbreviates.
const ABBREV = {
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
for (const [q, want] of Object.entries(ABBREV)) {
  const h = hits(q);
  if (h.length !== 1 || h[0] !== want) {
    fail.push(`${JSON.stringify(q)} should resolve to ${want} alone, got ${JSON.stringify(h)}`);
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
            `${Object.keys(ABBREV).length} abbreviations, junk and near-miss probes`);
