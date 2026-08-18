# Leadership Principles JSON (kindel/biq data/lps)

Amazon teaching prose only. Name, definition, and rows come from kindel/principles.

## Files

- `data/lps/index.json` catalog
- `data/lps/<slug>.json` one principle

Files are keyed by slug for Hugo: `resources.Get "data/lps/<slug>.json"`. Identity is `(company=amazon, numeric id)`.

## Cross-refs

When prose mentions another principle, write a token `{lp:<slug>}` inline.

Example: `That is {lp:ownership}, not heroics.`

Renderers replace the token with a link. Agents treat tokens as hard links.

Every `{lp:slug}` token in `why`, `calibrationIntro`, `examples`, `looksLike`, or `deepen` MUST also appear in `related`. Navigation built from `related` has to see the same slugs the prose links. `related` may include extra principles that are not tokenized in prose.

Never write raw company names or product names. Principle names stay.

## Principle object

```json
{
  "id": 1001,
  "slug": "customer-obsession",
  "why": ["Short paragraph.", "Another paragraph."],
  "calibrationIntro": "How to use the rows below.",
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

- `id` is the numeric principles id (1001 for Customer Obsession, etc.).
- `slug` is the kebab-case slug matching the filename without `.json`.
- `why` is 3-6 short paragraphs. Each array item is one paragraph.
- `examples` 2-4 teaching cases. Generalize retail/ops specifics. Drop named-exec anecdotes you cannot restate without the company.
- `deepen` 6-12 questions. Each is a full sentence ending with `?`.
- `related` is the union of every `{lp:slug}` token in the prose fields plus any extra curated links. Slugs must exist in kindel/principles. Two is a floor, not a cap.
- `blog` is published tig.log posts that amplify this principle. Same shape on every file. Empty is allowed when there is no real post.
- Every string: no em dash, no `---`, Oxford commas, numbers under 10 spelled out.
- No source-company names, products, executives, internal tools, or wiki chrome.

## Not in these files

Name, definition, rows, sort, and aliases now come from kindel/principles. This directory carries only the Amazon teaching prose that Porridge renders.
