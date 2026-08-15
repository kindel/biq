# Leadership Principles JSON (kindel/biq data/lps)

User's manual: Under / Just Right / Over for each classic leadership principle.
One file per principle. The /lps/ pages, the /biq/ site, and agents consume these files.

## Files

- `data/lps/index.json` catalog
- `data/lps/{id}.json` one principle

Ids match `data/questions.json` (classic 14 only; no competency-cut files).

## Cross-refs

When prose mentions another principle, write a token `{lp:<id>}` inline.

Example: `That is {lp:ownership}, not heroics.`

Renderers replace the token with a link. Agents treat tokens as hard links.

Every `{lp:id}` token in `definition`, `why`, `calibrationIntro`, `rows`, `examples`, `looksLike`, or `deepen` MUST also appear in `related`. Navigation built from `related` has to see the same IDs the prose links. `related` may include extra principles that are not tokenized in prose.

Never write the raw company name or product names. Principle names stay.

## Principle object

```json
{
  "id": "customer-obsession",
  "name": "Customer Obsession",
  "sort": 1,
  "aliases": ["customer", "co"],
  "definition": "Official short definition, company-agnostic, Kindel voice if tightened.",
  "why": ["Short paragraph.", "Another paragraph."],
  "calibrationIntro": "How to use the rows below.",
  "rows": [
    {
      "id": "decision-making",
      "situation": "In decision making",
      "under": "Too little of the principle.",
      "justRight": "Calibrated.",
      "over": "Too much of the principle."
    }
  ],
  "examples": [
    {"title": "Short title", "body": "Teaching example, company-agnostic."}
  ],
  "looksLike": {
    "individual": "What it looks like for an IC.",
    "manager": "What it looks like for a manager."
  },
  "deepen": [
    "Diagnostic question you ask yourself, a teammate, or anyone you are reviewing."
  ],
  "related": [
    {"id": "ownership", "note": "Why they connect, one sentence."}
  ],
  "blog": [
    {"title": "Post title", "url": "https://blog.kindel.com/...", "note": "Why this post belongs here."}
  ]
}
```

Rules:

- `id` kebab-case, matches filename without `.json`.
- `sort` 1-14 in teaching order (Customer Obsession first, Deliver Results last).
- `aliases` copied from questions.json for that id.
- `why` is 3-6 short paragraphs. Each array item is one paragraph.
- `rows` 5-12 real situations. Drop header-only rows (Under/Over/Just right as values). Invent a short `situation` label when the source left it blank. Give each row a kebab `id`.
- `examples` 2-4 teaching cases. Generalize retail/ops specifics. Drop named-exec anecdotes you cannot restate without the company.
- `deepen` 6-12 questions. Each is a full sentence ending with `?`.
- `related` is the union of every `{lp:id}` token in the prose fields plus any extra curated links. Ids must exist. Two is a floor, not a cap.
- `blog` is published tig.log posts that amplify this principle. Same shape on every file. Empty is allowed when there is no real post. `index.json` may have a `blog` list for the set.
- Every string: no em dash, no `---`, Oxford commas, numbers under 10 spelled out.
- No source-company names, products, executives, internal tools, or wiki chrome.
