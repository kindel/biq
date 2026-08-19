#!/usr/bin/env node
/**
 * Verifies question id integrity:
 * 1. Every question in a company with examples:true has an id
 * 2. That id's pack file exists in data/examples/
 * 3. Ids are eight hex chars and globally unique across the bank
 *
 * The id is minted once (scripts/mint_question_ids.py) and is deliberately
 * never recomputed from the current text: the whole point of storing it is
 * that editing a question's wording does not orphan its pack. So this check
 * must not compare the id against a hash of today's text; a check that did
 * would fail every legitimate edit and push editors to re-mint, which is
 * exactly the orphaning the id exists to prevent.
 *
 *   node scripts/check_question_ids.js
 *
 * Exits non-zero on any failure.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.dirname(__dirname);
const BANK_PATH = path.join(ROOT, "data", "questions.json");
const EXAMPLES_DIR = path.join(ROOT, "data", "examples");

const HEX_ID = /^[0-9a-f]{8}$/;

// Returns the problems with one question, as strings without the
// company/principle prefix. seenIds maps already-seen id -> where it was
// seen, and is updated as a side effect so the caller detects reuse.
function questionProblems(hasExamples, q, seenIds, where) {
  const problems = [];
  if (!q.id) {
    if (hasExamples) {
      problems.push(`question missing id: "${(q.text || "").slice(0, 50)}..."`);
    }
    return problems;
  }
  if (!HEX_ID.test(q.id)) {
    problems.push(`id ${q.id} is not eight hex chars`);
    return problems;
  }
  if (seenIds.has(q.id)) {
    problems.push(`id ${q.id} already used by ${seenIds.get(q.id)}: packs are keyed by id, so a reused id serves another question's pack`);
  } else {
    seenIds.set(q.id, where);
  }
  if (hasExamples && !fs.existsSync(path.join(EXAMPLES_DIR, q.id + ".json"))) {
    problems.push(`pack file missing for id ${q.id}: "${(q.text || "").slice(0, 50)}..."`);
  }
  return problems;
}

const bank = JSON.parse(fs.readFileSync(BANK_PATH, "utf8"));
const companies = bank.companies || [];
const fail = [];
const seenIds = new Map();
let checked = 0;
let packsVerified = 0;

for (const company of companies) {
  const hasExamples = company.examples !== false;
  for (const principle of company.principles || []) {
    if (typeof principle.id !== "number") {
      fail.push(`${company.id}/${principle.name}: principle id is not a number`);
      continue;
    }
    const where = `${company.id}/${principle.slug}`;
    for (const q of principle.questions || []) {
      checked++;
      const before = seenIds.size;
      const problems = questionProblems(hasExamples, q, seenIds, where);
      if (hasExamples && q.id && seenIds.size > before && !problems.length) {
        packsVerified++;
      }
      problems.forEach((p) => fail.push(`${where}: ${p}`));
    }
  }
}

// Self-tests of the checker's own teeth, run against a real question so the
// guarantees cannot silently rot.
const sampleCompany = companies.find((c) => c.examples !== false);
const sampleQ = sampleCompany?.principles?.flatMap((p) => p.questions || []).find((q) => q.id);
if (!sampleQ) {
  fail.push("self-test: no examples-bearing question with an id to test against");
} else {
  // Stability: a wording edit keeps the stored id, and the check must accept
  // that. This is the guarantee a recompute-from-text check would break.
  const edited = { id: sampleQ.id, text: (sampleQ.text || "") + " (edited for the stability self-test)" };
  const stability = questionProblems(true, edited, new Map(), "self-test");
  if (stability.length) {
    fail.push("self-test: a wording edit failed the check: " + stability.join("; "));
  }
  // Reuse: the same id appearing twice must fail.
  const dup = questionProblems(true, sampleQ, new Map([[sampleQ.id, "self-test/elsewhere"]]), "self-test");
  if (!dup.some((p) => p.includes("already used"))) {
    fail.push("self-test: a reused id passed the check");
  }
}

if (fail.length) {
  console.log(`FAIL (${fail.length})`);
  fail.forEach((f) => console.log("  " + f));
  process.exit(1);
}

console.log(`OK: ${checked} questions checked, ${packsVerified} pack files verified, ids unique, edit-stability self-test passed`);
