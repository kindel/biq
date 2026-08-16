# Migration: lift core LP data into kindel/principles

This directory is temporary scaffolding. Delete it when step six is done.

It exists so somebody else can finish this migration without the session that started it. Everything
needed is here: the extraction is a script rather than a description, and the target repository's
schema, validator, and docs are in `template/`.

## Status

| Step | What | Where | State |
| --- | --- | --- | --- |
| 1 | Seed `kindel/principles` with the 14 records | principles | Built and verified, **not pushed** |
| 2 | Fold aliases and synonyms into typed terms | principles | Done, part of the seed |
| 3 | Give questions ids, rekey the example packs | biq | Not started |
| 4 | Point biq and lps at core, delete local copies | biq, lps | Not started |
| 5 | Tag questions with facet terms | biq | Not started |
| 6 | Thread the selected term through the UI | biq, lps | Not started |

Steps three and five are independent of the repository split and can start at any time.

## What is blocking step one

The seed is complete and passes its own validator. It cannot be pushed from the session that built
it, because that session can clone `kindel/principles` but cannot push to it:

```
remote: access denied by the git proxy: kindel/principles is not in this session's
authorized repository set, so the proxy will not inject a credential for it.
To fix, add the repository to the session's sources.
```

Granting the GitHub App access to the repository is not sufficient on its own, and is probably
already done, since the clone succeeds. The session also needs the repository added to its own
sources, which is a separate approval. Any agent whose session has push access to
`kindel/principles` can finish step one with the commands below.

## Finish step one

From this repository's root, with a checkout of `kindel/principles` somewhere:

```
git clone https://github.com/kindel/principles.git /tmp/principles
python3 migration/extract_principles.py /tmp/principles
cd /tmp/principles && python3 scripts/validate.py
```

The validator must print:

```
OK: 14 principles, 127 rows, 152 terms (alias 98, equivalent 11, facet 43)
```

The script is deterministic. Running it twice on a clean checkout produces the same tree, so the
seed does not depend on the session that authored it. It also prints two dropped duplicate terms,
which is expected and explained below.

Then commit on a branch and open a pull request:

```
git checkout -b seed/core-data
git add -A
git commit -F - <<'EOF'
Seed the core leadership principle records

Identity, vocabulary, and the calibration rows for the classic 14, lifted
out of kindel/biq where they were stored inside an application. Fourteen
records, 127 rows, and 152 terms.

Aliases and synonyms become one typed list. An alias is the Amazon short
form. An equivalent means the whole principle. A facet means one slice of
it and names the rows it covers, so a tool can narrow its results to what
was actually asked for instead of handing back the whole principle.

Term ids are unique across every principle, not just within one, because a
consumer addresses a term by id alone with no principle in the URL. Two
aliases were dropped as duplicates: "d and c" and "think big" already
normalised to the same ids as "d&c" and "think-big".

scripts/validate.py enforces every rule SCHEMA.md states, including that
the generated manifest is not stale. The rules this repository replaces
were enforced by a comment asking a human to copy fields between files,
and they had already drifted.
EOF
git push -u origin seed/core-data
```

## Why this migration exists

Core LP data lives inside `kindel/biq`, which is an interviewing application. `kindel/lps` therefore
depends on an interviewing application to learn what a principle is called. Worse, the shared fields
are copied rather than referenced, and `data/lps/SCHEMA.md` asks a human to keep the copies in step.
That rule had already drifted before this work started.

Measured in this repository at the time of writing:

| Fact | Written in | Copies |
| --- | --- | --- |
| Principle `name`, `aliases`, `synonyms` | `data/questions.json` and each `data/lps/<id>.json` | two by 14 |
| Principle `id`, `name`, `sort` | `data/lps/index.json` and each `data/lps/<id>.json` | two by 14 |
| Question text | `data/questions.json` and every example pack | two by 135 |
| Principle name, as `principle` and `competency` | every example pack | two by 135 |
| The FNV-1a slug algorithm | `scripts/generate.py`, `js/biq-examples.js`, and a prose comment | three |

Six example packs already hold question text that differs from the bank.

## The boundary

A fact belongs in `principles` if a second application would need it and there is exactly one right
answer. It belongs to the application if it is that product's content, voice, or opinion.

| Field | Home | Why |
| --- | --- | --- |
| `id`, `name`, `sort`, `definition` | principles | Identity. Every consumer needs it and none may disagree. |
| `terms` | principles | How a person names the principle, independent of any tool. |
| `rows`, with under, justRight, and over | principles | The calibration taxonomy, and the anchor a facet points at. |
| `questions`, example packs | biq | An interviewing product's content. |
| `why`, `looksLike`, `examples`, `deepen` | lps | Teaching prose, in a voice, for an audience. |
| `related`, `blog` | lps | Links into one site's writing. Not a property of the principle. |

Putting the calibration prose in core rather than in lps was a judgement call, made so that a review
tool and a coaching tool cannot disagree about where the bar is. It is the most reversible decision
here. Moving the three prose fields back to lps means deleting them from the records and leaving the
row ids behind, because facets reference row ids and nothing else.

The record schema is `template/SCHEMA.md`. Read it before changing any record.

## Terms, and why they are typed

`aliases` and `synonyms` collapse into one `terms` list with a `kind`:

- `alias`, how it is written at Amazon: `bfa`, `d&c`, `high bar`.
- `equivalent`, how everyone else says it, meaning the whole principle: `move fast`.
- `facet`, how everyone else says it, meaning one slice of it: `user empathy`, which carries the
  row ids it covers.

The distinction is the entire point. Selecting a facet and being handed the whole principle back is
the failure this is meant to prevent. Someone who asks for `user empathy` should not be shown
Customer Obsession questions about complaint handling and CX metrics.

The facet to row mapping is the `FACETS` table at the top of `extract_principles.py`. It is the
judgement work in this migration, it is under review, and it is the thing to edit if the owner wants
different calls. Editing it and rerunning the script is the supported way to revise the seed.

Two aliases are dropped by the script because they were always dead. `"d and c"` and `"d&c"` both
normalise to `d and c`, and `"think big"` and `"think-big"` both normalise to `think big`, so in each
pair one entry could never match anything the other did not already match.

## Remaining steps

### Step three, question ids

`data/questions.json` has 135 questions and none has an `id`. A question is addressed by an
eight character FNV-1a hash of `norm(principle) + "|" + norm(question)`, so editing a question's
wording silently orphans its generated example pack in `data/examples/` and costs a regeneration to
restore.

Assign each question a stable `id`, never derived from its text. Rename the packs from
`<slug>.json` to `<question-id>.json`. Delete the slug function from `scripts/generate.py`,
`js/biq-examples.js`, and the prose comment above it.

Acceptance: every pack in `data/examples/` resolves to a live question id, and no code computes a
hash of question text.

### Step four, consume core

Give biq a script that vendors a pinned copy of the principle records into `data/`, and a check that
fails when the vendored copy no longer matches the pinned tag. Then delete `name`, `aliases`,
`synonyms`, and `rows` from `data/questions.json` and `data/lps/*.json`, leaving a `principle` id
reference.

A copy is acceptable when it is generated and verified. A copy kept in step by a human reading a
schema document is not, which is the mistake being corrected. Do not reintroduce it.

The Hugo site consumes `kindel/principles` as a Go module, the same mechanism it already uses for
`kindel/biq`. A host embedding biq needs nothing new, because `window.BIQ` already lets it point
the fetch wherever it serves core.

Acceptance: no principle name, alias, synonym, or row appears in more than one repository, and the
staleness check fails when the vendored copy is edited by hand.

### Step five, tag questions

Add a `terms` array to each question naming the facets it tests. This is 135 judgement calls and is
the real remaining work. Do it after step three so the tags attach to stable ids.

While doing it, one question ends with `(Structured problem solving / Invent and Simplify)` inside
the string. That is a tag written as prose. Move it into `terms` and out of the text.

Acceptance: every facet term is referenced by at least one question, and every question tagged with
a facet belongs to that facet's principle.

### Step six, thread the term through

`js/biq.js` computes which term matched inside `matches()` and discards it on the same line.
`examplesHref()` has no slot for a term. `js/biq-examples.js` prints the principle name verbatim.
The selected term is lost at all three points.

Return the matched term from `matches()`, carry it as `?t=<term-id>`, show it in the results
heading, and narrow the result set when the term is a facet. Equivalents and aliases keep showing
the whole principle.

Acceptance: selecting `user empathy` shows only the Customer Obsession questions tagged with it, and
the page says so.

## Known and deliberately out of scope

- `js/biq-examples.js` hardcodes "Raises the bar" and "Lowers the bar" as headings, and `prompt.md`
  instructs the model to open every scorecard with that verdict. Someone who arrives through plain
  English still reads Amazon jargon in the result. Fixing it means neutral keys in the data with
  consumer-chosen labels, a rename across 135 packs, and a regeneration, so it belongs in its own
  change.
- `learn-and-be-curious` has five rows that are specific incidents rather than recurring situations,
  so its vocabulary barely decomposes: three equivalents and one facet, where every other principle
  has eight or more situation-shaped rows. Worth a pass on that one file, but it is a content
  rewrite, not a migration task.
- Search matches near misses by shared stem or single typo. That behavior lives in `js/biq.js` and
  is not affected by any of this, but step six touches the same function, so read it first.

## Open questions for the owner

1. Should the calibration prose stay in core, or move back to lps with only row ids in core?
2. Are the facet to row mappings right? See the `FACETS` table. Flagged as least certain:
   `customer advocacy` typed as an equivalent, `takes responsibility` typed as an equivalent, and
   `detail oriented` pointing at `drivers-not-minutiae`, which is that row's over-index warning.
3. Question ids: readable slugs, or opaque and stable? Readable is easier to review, opaque removes
   the temptation to renumber when a question is reworded.
