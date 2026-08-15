# biq

A behavioral interview question bank with hire / no-hire example sheets at Junior, Senior, and Exec.

Live site: [https://kindel.com/biq/](https://kindel.com/biq/).

## Run

Needs a static file server because the bank is loaded with `fetch`.

```
python3 -m http.server
```

Open http://127.0.0.1:8000/

## Regenerate examples

Needs `XAI_API_KEY`. Resume-safe. Writes `data/examples/{slug}.json` for any question that does not already have a valid junior / senior / exec pack.

```
python3 scripts/generate.py
```

The slug is an 8-character FNV-1a of `norm(principle)|norm(question)`. The generator reads `prompt.md` and calls xAI `grok-4.3`.
