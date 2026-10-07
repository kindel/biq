# biq

A behavioral interview question bank with hire / no-hire example sheets at Junior, Senior, and Exec.

## App card

This repo ships `card.json` and `icon.png` as the listing for any host (kindel.com, iOS, Android).

Live site: [https://kindel.com/kld/apps/biq/](https://kindel.com/kld/apps/biq/). The bare URL is the generic set (id `generic`), principles that work for any company. `defaultCompany` in `data/questions.json` is that id. Sync sets it from the first company in the principles manifest. A company view is `?c=amazon`. Amazon is [https://kindel.com/kld/apps/biq/?c=amazon](https://kindel.com/kld/apps/biq/?c=amazon). Arm is [https://kindel.com/kld/apps/biq/?c=arm](https://kindel.com/kld/apps/biq/?c=arm).

The bank is company-scoped. `data/questions.json` has a `companies` array. Each company has its own principles and questions. The picker writes `?c=arm` (or drops the param for the default company) so a link without `c` stays on that default. A principle with no questions and no shared facet shows no questions.

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

## Check the search

```
node scripts/check_search.js
```

Lifts `norm` and `matches` out of `js/biq.js` rather than restating them, so
the check cannot drift from what the page runs. It asserts that every name and
alias finds its own principle, that junk and stop words match nothing, that
each abbreviation resolves to the one principle it abbreviates, and that near
misses land.

## Regenerate examples

Run the **Generate example packs** action. It is manual only, because every
real run spends xAI credits. Pick a company, leave `dry_run` on for the first
pass to see how many calls it would make, then run it again with `dry_run` off.
The packs arrive as a pull request rather than on the default branch, because
they are model-written interview content and a human should read a few first.

The key lives in the `XAI_API_KEY` repository secret. There is no reason to
hold it locally.

Resume-safe. It writes `data/examples/{slug}.json` only for a question that
does not already have a valid junior / senior / exec pack, so re-running after
a partial failure costs only what is still missing.

Locally, for a count without a key:

```
BIQ_DRY_RUN=1 python3 scripts/generate.py
BIQ_DRY_RUN=1 BIQ_COMPANY=gitlab python3 scripts/generate.py
```

`BIQ_COMPANY` scopes a run to one company. Generating does not turn the
buttons on: `"examples": true` in `data/questions.json` is a separate,
deliberate edit.

The slug is an 8-character FNV-1a of `str(principle_id)|norm(question)`. The numeric
principle id is unique across all companies (Amazon 1000s, Arm 2000s, Coupang 3000s,
Delivery Hero 4000s, GitLab 5000s, Dawn 6000s), so pack filenames cannot collide
even when two companies share a principle name. The generator reads `prompt.md`
and calls xAI `grok-4.3`.

## License

MIT. Copyright (c) 2026 Kindel, LLC. Keep the copyright notice and permission notice in all copies.
