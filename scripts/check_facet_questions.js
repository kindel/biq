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

(function selfTestFacetMap() {
  const donorQ = { id: "abcd1234", text: "Tell me a time?" };
  const extraQ = { id: "extra001", text: "Existing fit?" };
  const list = [
    { id: "first", principles: [{ name: "Donor", facets: ["shared"], questions: [donorQ, extraQ] }] },
    { id: "later", principles: [{ name: "Heir", facets: ["only-map"], questions: [] }] },
    { id: "keeps", principles: [{ name: "Own", facets: ["shared"], questions: [{ id: "ownown01", text: "Own question?" }] }] }
  ];
  attachFacetQuestions(list, {
    "only-map": {
      ids: ["extra001"],
      authored: [{ text: "Written for the facet?", manager: false }]
    }
  });
  const heir = list[1].principles[0].questions;
  if (heir.length !== 2 || heir[0].id !== "extra001" || heir[1].text !== "Written for the facet?") {
    fail.push("self-test: facetQuestions did not attach the existing id and then the authored question");
  }
  if (list[0].principles[0].questions.length !== 2 || list[0].principles[0].questions[1].text !== "Existing fit?") {
    fail.push("self-test: facetQuestions mutated the donor principle");
  }
  if (list[2].principles[0].questions.length !== 1 || list[2].principles[0].questions[0].id !== "ownown01") {
    fail.push("self-test: facetQuestions overwrote a principle that already has questions");
  }
})();

const bank = JSON.parse(fs.readFileSync(BANK_PATH, "utf8"));
const original = JSON.parse(JSON.stringify(bank.companies || []));

function normText(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

const byId = new Map();
const seenText = new Set();
for (const c of original) {
  for (const p of c.principles || []) {
    for (const q of p.questions || []) {
      if (q.id) byId.set(q.id, q);
      if (q.text) seenText.add(normText(q.text));
    }
  }
}

const facetQuestions = bank.facetQuestions || {};
for (const [facet, spec] of Object.entries(facetQuestions)) {
  const ids = Array.isArray(spec) ? spec : (spec.ids || []);
  const authored = Array.isArray(spec) ? [] : (spec.authored || []);
  if (!ids.length) {
    fail.push("facetQuestions." + facet + " maps no existing question ids");
  }
  const seenIds = new Set();
  for (const id of ids) {
    if (seenIds.has(id)) fail.push("facetQuestions." + facet + " repeats id " + id);
    seenIds.add(id);
    if (!byId.has(id)) fail.push("facetQuestions." + facet + " id " + id + " is not in the bank");
  }
  for (const q of authored) {
    const text = (q && q.text) || "";
    if (!text.endsWith("?")) {
      fail.push("authored question for " + facet + " does not end with a question mark");
    }
    if (text.includes("\u2014") || text.includes("\u2013") || text.includes(" -- ")) {
      fail.push("authored question for " + facet + " has an em dash");
    }
    if (typeof q.manager !== "boolean") {
      fail.push("authored question for " + facet + " is missing a manager boolean");
    }
    const n = normText(text);
    if (!n) fail.push("authored question for " + facet + " is empty");
    else if (seenText.has(n)) fail.push("authored question duplicates existing text: " + text.slice(0, 80));
    else seenText.add(n);
  }
}

attachFacetQuestions(bank.companies || [], facetQuestions);

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
// or hire-and-develop-the-best. Their questions come from facetQuestions.
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
// Intentional About Culture is filled from facetQuestions, not from Amazon.
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
  "intentional-about-culture": "facetQuestions"
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
    const spec = facetQuestions[facet] || {};
    const wantIds = spec.ids || [];
    const gotIds = (p.questions || []).map((q) => q.id).filter(Boolean);
    for (const id of wantIds) {
      if (!gotIds.includes(id)) {
        fail.push("toyota/" + slug + " is missing mapped question " + id);
      }
    }
    for (const q of spec.authored || []) {
      if (!(p.questions || []).some((x) => x.text === q.text)) {
        fail.push("toyota/" + slug + " is missing an authored question");
      }
    }
    if (!(p.questions || []).length) {
      fail.push("toyota/" + slug + " resolved to no questions");
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
    const got = (p.questions || []).map((q) => q.id).filter(Boolean).join(",");
    if (wantSlug === "facetQuestions") {
      const facs = (p.facets || []).join(",");
      if (facs !== "intentional-about-culture") {
        fail.push("generic/" + p.slug + " facets should be intentional-about-culture, got " + facs);
      }
      const spec = facetQuestions["intentional-about-culture"] || {};
      for (const id of spec.ids || []) {
        if (!got.split(",").includes(id)) {
          fail.push("generic/" + p.slug + " is missing mapped question " + id);
        }
      }
      for (const q of spec.authored || []) {
        if (!(p.questions || []).some((x) => x.text === q.text)) {
          fail.push("generic/" + p.slug + " is missing an authored question");
        }
      }
      if (!(p.questions || []).length) {
        fail.push("generic/" + p.slug + " resolved to no questions");
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

// Every principle in every set must show questions, and at least one of
// those questions must have an example pack at Junior, Senior, and Exec.
// The examples page switches levels inside that one question. Splitting
// the three levels across different questions does not count. A question
// with no pack does not count for a level.
const LEVELS = ["junior", "senior", "exec"];
const LEVEL_NAME = { junior: "Junior", senior: "Senior", exec: "Exec" };

function hasCompleteQuestion(levelSets) {
  return levelSets.some((levels) => LEVELS.every((lv) => levels.includes(lv)));
}

(function selfTestCompleteQuestion() {
  if (hasCompleteQuestion([["junior"], ["senior"], ["exec"]])) {
    fail.push("splitting Junior, Senior, and Exec across questions must not count");
  }
  if (!hasCompleteQuestion([["junior", "senior", "exec"]])) {
    fail.push("one question with all three levels should count");
  }
  if (hasCompleteQuestion([["junior", "senior"]])) {
    fail.push("a question missing Exec must not count as complete");
  }
})();

// A level counts only when the examples page can render it. showCurrent
// treats a falsy sheet as missing. An empty object would pass that check
// and then render nothing, so this also requires the transcripts and
// feedback generate.py requires of a level sheet.
function usableLevel(sheet) {
  return !!(
    sheet &&
    Array.isArray(sheet.raiseTranscript) && sheet.raiseTranscript.length &&
    Array.isArray(sheet.lowerTranscript) && sheet.lowerTranscript.length &&
    sheet.raiseFeedback &&
    sheet.lowerFeedback
  );
}

(function selfTestUsableLevel() {
  if (usableLevel(null) || usableLevel(undefined) || usableLevel({})) {
    fail.push("a null or empty level sheet must not count as coverage");
  }
  const ok = {
    raiseTranscript: [{ role: "candidate", text: "t" }],
    lowerTranscript: [{ role: "candidate", text: "t" }],
    raiseFeedback: "f",
    lowerFeedback: "f"
  };
  if (!usableLevel(ok)) fail.push("a complete level sheet should count as coverage");
  if (usableLevel({ raiseTranscript: [], lowerTranscript: [{ text: "t" }], raiseFeedback: "f", lowerFeedback: "f" })) {
    fail.push("a level sheet with an empty transcript must not count");
  }
})();

function packLevels(q) {
  if (!q || !q.id) return [];
  const packPath = path.join(EXAMPLES_DIR, q.id + ".json");
  if (!fs.existsSync(packPath)) return [];
  try {
    const pack = JSON.parse(fs.readFileSync(packPath, "utf8"));
    const levels = (pack && pack.levels) || {};
    return Object.keys(levels).filter((k) => usableLevel(levels[k]));
  } catch (e) {
    return [];
  }
}

let principlesChecked = 0;
for (const c of bank.companies || []) {
  for (const p of c.principles || []) {
    principlesChecked++;
    const where = c.id + "/" + (p.slug || p.name);
    const qs = p.questions || [];
    if (!qs.length) {
      fail.push(where + " has no questions");
      continue;
    }
    const covered = {};
    const levelSets = [];
    for (const q of qs) {
      const levels = packLevels(q);
      levelSets.push(levels);
      for (const lv of levels) covered[lv] = true;
    }
    if (!hasCompleteQuestion(levelSets)) {
      fail.push(where + " has no question with Junior, Senior, and Exec examples");
    }
    for (const lv of LEVELS) {
      if (!covered[lv]) {
        fail.push(where + " has no question with a " + LEVEL_NAME[lv] + " example");
      }
    }
    for (const facet of p.facets || []) {
      const spec = facetQuestions[facet];
      if (!spec) continue;
      const ids = Array.isArray(spec) ? spec : (spec.ids || []);
      const authored = Array.isArray(spec) ? [] : (spec.authored || []);
      const got = new Set(qs.map((q) => q.id).filter(Boolean));
      for (const id of ids) {
        if (!got.has(id)) fail.push(where + " is missing mapped id " + id + " from facet " + facet);
      }
      for (const q of authored) {
        if (!qs.some((x) => x.text === q.text)) {
          fail.push(where + " is missing an authored question for facet " + facet);
        }
      }
    }
  }
}
if (principlesChecked < 1) fail.push("no principles were checked");

const pickLift = lift(path.join(ROOT, "js", "biq-examples.js"), ["pickable"]);
if (pickLift.missing) {
  fail.push("could not lift pickable from js/biq-examples.js");
} else {
  const pickable = pickLift.fns.pickable;
  for (const c of original) {
    const picked = pickable(original, c, facetQuestions);
    const resolved = (bank.companies || []).find((x) => x.id === c.id);
    for (const p of (resolved && resolved.principles) || []) {
      const want = (p.questions || []).map((q) => q.id).filter(Boolean).join(",");
      const row = picked.find((x) => x.name === p.name);
      const got = row ? row.questions.map((q) => q.id).join(",") : "";
      if (want !== got) {
        fail.push("pickable ids for " + c.id + "/" + (p.slug || p.name) +
                  " differ from attachFacetQuestions");
      }
    }
  }
}

if (fail.length) {
  console.log("FAIL (" + fail.length + ")");
  fail.forEach((f) => console.log("  " + f));
  process.exit(1);
}
console.log("OK: every principle has one question with Junior, Senior, and Exec examples; facet map matches the page");
