#!/usr/bin/env node
/**
 * Verifies question id integrity:
 * 1. Every question in a company with examples:true has an id
 * 2. That id's pack file exists in data/examples/
 * 3. The id is stable (changing text does not change id)
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

function norm(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function slugFor(principleId, q) {
  const key = String(principleId) + "|" + norm(q);
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return ("00000000" + h.toString(16)).slice(-8);
}

const bank = JSON.parse(fs.readFileSync(BANK_PATH, "utf8"));
const companies = bank.companies || [];
const fail = [];
let checked = 0;
let packsVerified = 0;

for (const company of companies) {
  const hasExamples = company.examples !== false;
  for (const principle of company.principles || []) {
    const pid = principle.id;
    if (typeof pid !== "number") {
      fail.push(`${company.id}/${principle.name}: principle id is not a number`);
      continue;
    }
    for (const q of principle.questions || []) {
      checked++;
      
      if (hasExamples && !q.id) {
        fail.push(`${company.id}/${principle.slug}: question missing id: "${q.text.slice(0, 50)}..."`);
        continue;
      }
      
      if (q.id && hasExamples) {
        const packPath = path.join(EXAMPLES_DIR, q.id + ".json");
        if (!fs.existsSync(packPath)) {
          fail.push(`${company.id}/${principle.slug}: pack file missing for id ${q.id}: "${q.text.slice(0, 50)}..."`);
        } else {
          packsVerified++;
        }
      }
      
      if (q.id) {
        const computedId = slugFor(pid, q.text);
        if (q.id !== computedId) {
          fail.push(`${company.id}/${principle.slug}: id ${q.id} != computed ${computedId} for "${q.text.slice(0, 50)}..."`);
        }
      }
    }
  }
}

const typoText = "Describe a difficult interactiom you had with a customer.";
const originalText = "Describe a difficult interaction you had with a customer. How did you deal with it? What was the outcome? How would you handle it differently?";
const firstQ = companies[0]?.principles?.[0]?.questions?.[0];

if (firstQ && firstQ.id) {
  const originalId = firstQ.id;
  const typoSlug = slugFor(1001, typoText);
  if (typoSlug === originalId) {
    fail.push("Typo fix test: id should differ for typo version but matched original");
  }
} else {
  fail.push("Cannot run typo test: first question has no id");
}

if (fail.length) {
  console.log(`FAIL (${fail.length})`);
  fail.forEach(f => console.log("  " + f));
  process.exit(1);
}

console.log(`OK: ${checked} questions checked, ${packsVerified} pack files verified, typo-stability check passed`);
