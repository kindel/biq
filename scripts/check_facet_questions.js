#!/usr/bin/env node
// Checks facet inheritance against the real bank. Lifts attachFacetQuestions
// out of js/biq.js rather than restating it, so this cannot drift from what
// the page actually runs. Also lifts examplesNote from js/biq-examples.js:
// a shared pack must name the donor principle when the selected one differs.
//
//   node scripts/check_facet_questions.js
//
// Exits non-zero on any failure.
const fs = require("fs");
const path = require("path");

const ROOT = path.dirname(__dirname);
const BANK_PATH = path.join(ROOT, "data", "questions.json");
const EXAMPLES_DIR = path.join(ROOT, "data", "examples");

function grabFunction(body, name) {
  const i = body.indexOf("function " + name + "(");
  if (i < 0) return "";
  let depth = 0;
  for (let k = body.indexOf("{", i); k < body.length; k++) {
    if (body[k] === "{") depth++;
    else if (body[k] === "}") {
      depth--;
      if (!depth) return body.slice(i, k + 1);
    }
  }
  return "";
}

function lift(src, names) {
  const body = fs.readFileSync(src, "utf8");
  const parts = names.map((n) => grabFunction(body, n));
  for (let i = 0; i < names.length; i++) {
    if (!parts[i]) return { missing: names[i] };
  }
  return {
    fns: new Function(parts.join("\n") + "\nreturn { " + names.join(", ") + " };")()
  };
}

const fail = [];

const attachLift = lift(path.join(ROOT, "js", "biq.js"), ["attachFacetQuestions"]);
if (attachLift.missing) {
  fail.push("could not lift " + attachLift.missing + " from js/biq.js");
  console.log("FAIL (" + fail.length + ")");
  fail.forEach((f) => console.log("  " + f));
  process.exit(1);
}
const attachFacetQuestions = attachLift.fns.attachFacetQuestions;

const noteLift = lift(path.join(ROOT, "js", "biq-examples.js"), ["examplesNote"]);
if (noteLift.missing) {
  fail.push("examplesNote is missing from js/biq-examples.js: a shared pack must name the donor principle when the selected principle differs");
} else {
  const examplesNote = noteLift.fns.examplesNote;
  const same = examplesNote("Think Big", "Think Big");
  if (same !== "") {
    fail.push('examplesNote("Think Big", "Think Big") should be empty, got ' + JSON.stringify(same));
  }
  const folded = examplesNote("think big", "Think Big");
  if (folded !== "") {
    fail.push('examplesNote should treat "think big" and "Think Big" as the same, got ' + JSON.stringify(folded));
  }
  const want = "These examples were written for Think Big. The question is shared through a common facet.";
  const inherited = examplesNote("Challenge", "Think Big");
  if (inherited !== want) {
    fail.push("examplesNote(Challenge, Think Big) should be " + JSON.stringify(want) + ", got " + JSON.stringify(inherited));
  }
  const kaizen = examplesNote("Kaizen", "Insist on the Highest Standards");
  if (!kaizen.includes("Insist on the Highest Standards")) {
    fail.push("examplesNote for Kaizen should name Insist on the Highest Standards, got " + JSON.stringify(kaizen));
  }
  if (examplesNote("Challenge", "") !== "") {
    fail.push("examplesNote with an empty pack principle should be empty");
  }
  if (examplesNote("", "Think Big") !== "") {
    fail.push("examplesNote with an empty selected principle should be empty");
  }
}

// Self-test of the lifted resolver on a tiny bank, so a missing donor, a
// wrong first-donor choice, or a skip of a principle that already has
// questions cannot silently rot.
(function selfTestAttach() {
  const donorQ = { id: "abcd1234", text: "Tell me a time?" };
  const laterQ = { id: "ownown01", text: "Own question?" };
  const list = [
    { id: "first", principles: [{ name: "Donor", facets: ["shared"], questions: [donorQ] }] },
    { id: "later", principles: [{ name: "Heir", facets: ["shared"], questions: [] }] },
    { id: "empty-facet", principles: [{ name: "None", facets: ["missing"], questions: [] }] },
    { id: "has-own", principles: [{ name: "Own", facets: ["shared"], questions: [laterQ] }] },
    { id: "second-donor", principles: [{ name: "TooLate", facets: ["shared"], questions: [{ id: "toolate1", text: "Later donor?" }] }] }
  ];
  attachFacetQuestions(list);
  const heir = list[1].principles[0].questions;
  if (heir.length !== 1 || heir[0].id !== "abcd1234") {
    fail.push("self-test: empty principle did not inherit the first donor's question id");
  }
  if (list[2].principles[0].questions.length !== 0) {
    fail.push("self-test: a principle with no donor should stay empty");
  }
  if (list[3].principles[0].questions[0].id !== "ownown01") {
    fail.push("self-test: a principle that already has questions was overwritten");
  }
  if (heir[0] && heir[0].id === "toolate1") {
    fail.push("self-test: inherited from a later donor instead of the first");
  }
})();

const bank = JSON.parse(fs.readFileSync(BANK_PATH, "utf8"));
const original = JSON.parse(JSON.stringify(bank.companies || []));
attachFacetQuestions(bank.companies || []);

function firstDonor(facet) {
  for (const c of original) {
    for (const p of c.principles || []) {
      if ((p.facets || []).includes(facet) && (p.questions || []).length) {
        return { company: c.id, slug: p.slug, questions: p.questions };
      }
    }
  }
  return null;
}

// Respect and Teamwork have their own facets. They do not sit on earn-trust
// or hire-and-develop-the-best, and neither facet has a question donor.
const TOYOTA_MAPPINGS = {
  challenge: "think-big",
  kaizen: "better-every-day",
  "genchi-genbutsu": "dive-deep"
};
const TOYOTA_OWN_FACET = {
  respect: "mutual-respect",
  teamwork: "grow-the-team"
};

// Any Company reuses the Amazon question list for the shared facet.
// Are Right, A Lot shares are-right-a-lot, so it inherits Amazon's questions.
// Intentional About Culture has no Amazon twin. It gets its questions through its
// shared facets (team-for-the-outcome), since every principle must have BIQ questions.
const GENERIC_FROM_AMAZON = {
  "customer-obsession": "customer-obsession",
  "earn-trust": "earn-trust",
  ownership: "ownership",
  "are-right-a-lot": "are-right-a-lot",
  "learn-and-be-curious": "learn-and-be-curious",
  "invent-and-simplify": "invent-and-simplify",
  "insist-on-high-standards": "insist-on-the-highest-standards",
  "hire-and-develop-the-best": "hire-and-develop-the-best",
  "think-big": "think-big",
  "bias-for-action": "bias-for-action",
  frugality: "frugality",
  "dive-deep": "dive-deep",
  "have-backbone-disagree-and-commit": "have-backbone-disagree-and-commit",
  "deliver-results": "deliver-results",
  "intentional-about-culture": null
};

const toyota = (bank.companies || []).find((c) => c.id === "toyota");
if (!toyota) {
  fail.push("toyota is missing from the bank");
} else {
  let mapped = 0;
  let packs = 0;
  for (const [slug, facet] of Object.entries(TOYOTA_MAPPINGS)) {
    mapped++;
    const p = (toyota.principles || []).find((x) => x.slug === slug);
    if (!p) {
      fail.push("toyota/" + slug + " is missing");
      continue;
    }
    const qs = p.questions || [];
    if (!qs.length) {
      fail.push("toyota/" + slug + " resolved to no questions for facet " + facet);
      continue;
    }
    const donor = firstDonor(facet);
    if (!donor) {
      fail.push("no donor in the bank for facet " + facet);
    } else {
      const gotIds = qs.map((q) => q.id).join(",");
      const wantIds = donor.questions.map((q) => q.id).join(",");
      if (gotIds !== wantIds) {
        fail.push("toyota/" + slug + " inherited [" + gotIds + "] from facet " + facet +
                  ", expected first donor " + donor.company + "/" + donor.slug + " [" + wantIds + "]");
      }
    }
    for (const q of qs) {
      if (!q.id) {
        fail.push("toyota/" + slug + " inherited a question with no id");
        continue;
      }
      const packPath = path.join(EXAMPLES_DIR, q.id + ".json");
      if (!fs.existsSync(packPath)) {
        fail.push("toyota/" + slug + " inherited id " + q.id + " with no pack file");
        continue;
      }
      packs++;
      let pack = null;
      try {
        pack = JSON.parse(fs.readFileSync(packPath, "utf8"));
      } catch (e) {
        fail.push("pack for inherited id " + q.id + " is not valid JSON");
        continue;
      }
      if (noteLift.fns && pack.principle && p.name &&
          noteLift.fns.examplesNote(p.name, pack.principle) === "" &&
          p.name !== pack.principle) {
        fail.push("examplesNote hid a donor mismatch for toyota/" + slug +
                  ": selected " + JSON.stringify(p.name) +
                  " pack " + JSON.stringify(pack.principle));
      }
    }
  }
  if (mapped !== 3) {
    fail.push("expected three Toyota mappings, checked " + mapped);
  }
  for (const [slug, facet] of Object.entries(TOYOTA_OWN_FACET)) {
    const p = (toyota.principles || []).find((x) => x.slug === slug);
    if (!p) {
      fail.push("toyota/" + slug + " is missing");
      continue;
    }
    const facs = p.facets || [];
    if (facs.join(",") !== facet) {
      fail.push("toyota/" + slug + " facets should be " + facet + ", got " + facs.join(","));
    }
    if (facs.includes("earn-trust") || facs.includes("hire-and-develop-the-best")) {
      fail.push("toyota/" + slug + " inherited the wrong facet");
    }
    if ((p.questions || []).length) {
      fail.push("toyota/" + slug + " should stay empty (no question donor)");
    }
  }
}

const generic = (bank.companies || []).find((c) => c.id === "generic");
const amazonOriginal = original.find((c) => c.id === "amazon");
if (!generic) {
  fail.push("generic is missing from the bank");
} else if (!amazonOriginal) {
  fail.push("amazon is missing from the bank");
} else {
  const seen = {};
  for (const p of generic.principles || []) {
    seen[p.slug] = true;
    const wantSlug = GENERIC_FROM_AMAZON[p.slug];
    if (wantSlug === undefined) {
      fail.push("generic/" + p.slug + " is not in the Amazon inheritance map");
      continue;
    }
    const got = (p.questions || []).map((q) => q.id).join(",");
    if (wantSlug === null) {
      if (!got) {
        fail.push("generic/" + p.slug + " has no questions; every principle needs BIQ questions");
      }
      const facs = p.facets || [];
      if (!facs.includes(p.slug)) {
        fail.push("generic/" + p.slug + " facets should include " + p.slug + ", got " + facs.join(","));
      }
      continue;
    }
    const donor = (amazonOriginal.principles || []).find((x) => x.slug === wantSlug);
    if (!donor) {
      fail.push("amazon/" + wantSlug + " is missing");
      continue;
    }
    const want = (donor.questions || []).map((q) => q.id).join(",");
    if (!want) {
      fail.push("amazon/" + wantSlug + " has no questions to donate");
    } else if (got !== want) {
      fail.push("generic/" + p.slug + " inherited [" + got + "], expected amazon/" +
                wantSlug + " [" + want + "]");
    }
  }
  Object.keys(GENERIC_FROM_AMAZON).forEach((slug) => {
    if (!seen[slug]) fail.push("generic/" + slug + " is missing from the bank");
  });
}

if (fail.length) {
  console.log("FAIL (" + fail.length + ")");
  fail.forEach((f) => console.log("  " + f));
  process.exit(1);
}
console.log("OK: attachFacetQuestions self-test passed, Toyota and Any Company inheritance resolved, examplesNote names the donor");
