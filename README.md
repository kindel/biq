# biq

A behavioral interview question bank with hire / no-hire example sheets at Junior, Senior, and Exec.

Live site: [https://kindel.com/biq/](https://kindel.com/biq/). Amazon is the default. Arm is [https://kindel.com/biq/?c=arm](https://kindel.com/biq/?c=arm).

The bank is company-scoped. `data/questions.json` has a `companies` array. Each company has its own principles and questions. The picker writes `?c=arm` (or drops the param for Amazon) so a link without `c` stays Amazon.

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

## Regenerate examples

Needs `XAI_API_KEY`. Resume-safe. Writes `data/examples/{slug}.json` for any question that does not already have a valid junior / senior / exec pack.

```
python3 scripts/generate.py
```

The slug is an 8-character FNV-1a of `norm(principle)|norm(question)`. The generator reads `prompt.md` and calls xAI `grok-4.3`.
