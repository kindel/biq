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

const TOYOTA_MAPPINGS = {
  challenge: "think-big",
  kaizen: "better-every-day",
  "genchi-genbutsu": "dive-deep",
  respect: "earn-trust",
  teamwork: "hire-and-develop-the-best"
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
  if (mapped !== 5) {
    fail.push("expected five Toyota mappings, checked " + mapped);
  }
}

if (fail.length) {
  console.log("FAIL (" + fail.length + ")");
  fail.forEach((f) => console.log("  " + f));
  process.exit(1);
}
console.log("OK: attachFacetQuestions self-test passed, five Toyota mappings resolved to pack-backed questions, examplesNote names the donor");
