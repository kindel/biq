# biq

A behavioral interview question bank with hire / no-hire example sheets at Junior, Senior, and Exec.

Live site: [https://kindel.com/biq/](https://kindel.com/biq/).

## Run

Needs a static file server because the bank is loaded with `fetch`.

```
python3 -m http.server
```

Open http://127.0.0.1:8000/

## Host configuration

The default URLs are root-relative, which assumes the site is served from `/`. A host that mounts biq
somewhere else can override them by setting `window.BIQ` in an inline script *before* `js/biq.js` or
`js/biq-examples.js` loads:

```html
<script>
  window.BIQ = {
    questions: "/biq/data/questions.json",   // question bank
    examplesData: "/biq/data/examples/",     // per-question example packs
    examplesFallback: "/biq/data/biq-examples.json", // optional legacy single-file bank
    examplesPage: "examples.html"            // resolved against the current page
  };
</script>
```

## Question bank

`data/questions.json` holds the 14 leadership principles. Two separate fields feed the search box, and
both are matched the same way:

- `aliases` — how the principle is written at Amazon: abbreviations and short forms (`bfa`, `d&c`, `high bar`).
- `synonyms` — how everyone else says it (`move fast`, `strive for excellence`, `do more with less`), so
  someone who doesn't know the LP names can still find the questions.

Search tolerates near misses, so entries only need one form of a word: a different ending
(`originality` finds `original thinking`, `mentors` finds `mentoring`) or a single typo
(`frugalty`, `integrety`) still matches. Queries shorter than four characters are treated as
abbreviations and anchored to the start of a word, which is what keeps `co` and `et` meaningful.

## Regenerate examples

Needs `XAI_API_KEY`. Resume-safe. Writes `data/examples/{slug}.json` for any question that does not already have a valid junior / senior / exec pack.

```
python3 scripts/generate.py
```

The slug is an 8-character FNV-1a of `norm(principle)|norm(question)`. The generator reads `prompt.md` and calls xAI `grok-4.3`.
