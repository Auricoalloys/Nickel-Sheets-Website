# nickelsheets.com

The Aurico Alloys LLP marketing site — a Jekyll site of ~750 hand-written HTML pages for a
nickel, titanium, duplex and cobalt alloy stockist. GitHub Pages builds and deploys straight from
`main`, so **pushing to `main` publishes**.

`CLAUDE.md` is the full architecture guide: page structure, the Windows case-sensitivity trap, the
enquiry form and lead pipeline, and why each generator exists. Read it before changing anything.
This file is the short version — how to build, and what has to be re-run by hand.

## Build

```bash
bundle install
```

```bash
bash docs/build-local.sh
```

Use that rather than `bundle exec jekyll build`. It marks `_site` case-sensitive first, so the local
build matches what GitHub Pages serves, and it works around Windows' refusal to create directories
with colons in the name. Both are explained in `CLAUDE.md`; skipping the script gives you a `_site`
that silently disagrees with production.

For a live-reloading preview:

```bash
bundle exec jekyll serve
```

## Generators — run by hand, commit the result

Nothing runs at deploy time. GitHub Pages only runs Jekyll, so every generated file is committed
source. Re-run the relevant one and commit what it writes:

| Command | Run it after |
| --- | --- |
| `node docs/build-sitemap.mjs` | adding, removing, renaming or editing a page |
| `node docs/build-search-index.mjs` | adding, removing, renaming or retitling a page |
| `node docs/build-prices.mjs` | editing `prices.csv` |
| `node docs/build-specs.mjs` | editing `docs/specs.csv` |
| `node docs/purge-bootstrap.mjs` | using a Bootstrap component the site did not use before |
| `node docs/powder-datasheets/build.mjs` | editing `docs/powder-datasheets/data.mjs` |

All except `purge-bootstrap` take `--check`, which reports drift and exits non-zero without writing.

## Single sources of truth

Two files are authoritative. Editing the pages they write is how those pages drift apart.

**`prices.csv`** — every published price. `build-prices.mjs` writes the visible figure and the
JSON-LD `AggregateOffer` from the same row, so a reader and Google can never see different numbers.
A page absent from the CSV has its `offers` block removed, deliberately: `offers` without a `price`
is invalid markup. `priceValidUntil` is the `# updated:` date plus 45 days, so a monthly update that
slips expires quietly instead of asserting a stale figure.

**`docs/specs.csv`** — every ASTM, AMS, BS and DIN designation, one row per grade with a column per
product form. `build-specs.mjs` writes the grade × specification tables onto the family hubs and
grade hubs.

A specification is written for a **product form**. ASTM B443 covers plate, sheet and strip; B446
covers rod, bar and wire; B444 covers pipe and tube. They are not interchangeable, and citing one
for the wrong form tells a buyer the material is certified to something it is not. Fill a cell only
from a mill technical bulletin (Special Metals for INCONEL, INCOLOY, MONEL and NIMONIC; Haynes
International for HAYNES) or an ASTM scope statement — never from a distributor listing. Where a
mill publishes no standard the cell reads `mill`; where the grade is not made in that form it reads
`-`. Both are correct answers, and neither may be replaced with a plausible-looking number.

## Checks

`.github/workflows/seo-audit.yml` runs on every pull request, on push to `main`, and daily at 08:00
IST. It fails a pull request on regression and opens an issue on the scheduled run. It covers:

- `node docs/build-prices.mjs --check` — prices match `prices.csv`
- `node docs/build-specs.mjs --check` — hub tables match `docs/specs.csv`
- `tools/seo_audit.py --live --fail-on-new` — every check corresponds to a bug that has actually
  happened on this site; the baseline is `tools/seo_baseline.json`

### The three-weekly specification review

CI catches *drift* — a source file edited without re-running its generator. It cannot catch the
other failure: **mill bulletins get revised, and ASTM retitles and rescopes standards**, so
`docs/specs.csv` is only as good as the day each row was checked against its source.

A recurring review covers that, on the 1st and 22nd of each month (cron cannot express "every 21
days"; this is the closest standard approximation). Each run re-verifies one alloy family against
its mill's current bulletin, rotating so the whole file is covered roughly every four months, and
reports proposed edits rather than committing them.

Run it by hand any time with the checks above plus a read of the current bulletins:

- https://www.specialmetals.com/documents/technical-bulletins/inconel/
- https://www.specialmetals.com/documents/technical-bulletins/incoloy/
- https://www.specialmetals.com/documents/technical-bulletins/nimonic/

## Conventions

Commit messages are short, imperative, and describe the user-visible outcome rather than the edit —
"Name the mills the material comes from", not "Update specs.csv". Comments explain *why* a thing is
the way it is, usually recording the bug that motivated it.

Images are WebP under `docs/images/`; camera originals live in `docs/images/source/`, which is both
gitignored and excluded from the build.

**Never run `git add --renormalize .` in this repo.** `CLAUDE.md` explains what it stages and why
those files look like recovered work but are not.
