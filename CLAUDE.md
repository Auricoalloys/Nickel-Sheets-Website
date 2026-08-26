# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The Aurico Alloys LLP marketing site (www.nickelsheets.com) — a Jekyll site of ~750 hand-written
HTML pages for a nickel/titanium/duplex/cobalt alloy stockist. GitHub Pages builds and deploys it
straight from `main`; there is no bundler and no unit tests. Pushing to `main` publishes.

There is one CI workflow, `.github/workflows/seo-audit.yml`, and it only reports — it never edits or
publishes. See **The SEO audit** below.

## Commands

```bash
bundle install
```

```bash
bash docs/build-local.sh
```

Use that rather than `bundle exec jekyll build` directly: it marks `_site` case-sensitive first, so
the local build matches what GitHub Pages serves. See the case note under Architecture for why that
matters. For a live-reloading preview:

```bash
bundle exec jekyll serve
```

`serve` does not get the case-sensitivity treatment, so treat anything it shows about the two
case-variant URLs with suspicion.

`.bundle/config` pins `BUNDLE_PATH` to `vendor/bundle`, which is gitignored. The `github-pages` gem
is used so a local build reproduces production rather than approximating it.

`_config.local.yml` is a local-only overlay that is currently redundant — build with plain
`_config.yml` unless you have local-only overrides to add, in which case:

```bash
bundle exec jekyll build --config _config.yml,_config.local.yml
```

There is no lint, test, or bundler step, and nothing runs at deploy time — GitHub Pages only runs
Jekyll. Eight generators exist and must be run **by hand**, then committed like any other source:

```bash
node docs/build-sitemap.mjs            # after adding/removing/renaming/editing a page
node docs/build-search-index.mjs       # after adding/removing/renaming/retitling a page
node docs/build-prices.mjs             # after editing prices.csv
node docs/build-price-worklist.mjs     # after adding/removing a page, or to queue up pricing work
node docs/build-specs.mjs              # after editing docs/specs.csv
node docs/build-grades.mjs             # after editing grades.csv, chemistry.csv or properties.csv
node docs/build-cuts.mjs               # after editing docs/powder-datasheets/cuts.csv
node docs/purge-bootstrap.mjs          # after using a Bootstrap component the site did not use before
node docs/powder-datasheets/build.mjs  # after editing docs/powder-datasheets/data.mjs
```

`build-sitemap`, `build-search-index`, `build-prices`, `build-price-worklist`, `build-specs`,
`build-grades`, `build-cuts` and `powder-datasheets/build` all take `--check`, which reports drift
and exits non-zero without writing. CI runs the price, specification and
grade-data checks on every pull request, because a price the HTML no longer matches is worse than
no price at all, a specification cited for the wrong product form tells a buyer the material is
certified to something it is not, and a wrong UNS number tells them it is a different material
altogether.

Both live in `docs/` and are excluded from the build in `_config.yml`. Only the purge script needs
npm (`purgecss@7`); the sitemap script is plain Node.

### The SEO audit

`tools/seo_audit.py` checks the source tree for the mistakes this site has actually made — pages
with no `<h1>`, canonicals pointing nowhere, orphans nothing links to, duplicate permalinks,
case-variant URLs, truncated descriptions, missing alt text, broken internal links:

```bash
python tools/seo_audit.py                  # report
python tools/seo_audit.py --fail-on-new    # exit 1 only if worse than the baseline
python tools/seo_audit.py --live           # adds the apex/www DNS and certificate checks
```

It is **counts against a baseline**, not pass/fail: `tools/seo_baseline.json` records what was
already broken when each check was added, and a count at or below its baseline passes. So fixing a
class of bug does not tighten the guard by itself — **after clearing findings, re-run with
`--update-baseline` and commit**, or the same number of them can silently come back.

**Every count in the baseline is now 0**, so any finding at all is a regression. Keeping it there
means never parking a false positive in the baseline again: a count cannot tell a known-acceptable
item from a real finding that replaced it, which is how ten "orphans" sat for months while a
genuine one could have arrived unnoticed. When a check fires on something deliberate, teach the
check, don't raise the number.

Two classes are excluded by the checks themselves rather than by the baseline. A URL carrying
`sitemap: false` or disallowed in `robots.txt` is **not an orphan** — the site withholds it on
purpose, so requiring an inbound link is incoherent, and adding one would point internal links at a
page that disclaims itself. And a robots-disallowed route is **not a missing-`<h1>`**: the one such
page, `/pure-nickel-strip/product/`, renders its heading from Supabase at runtime and says in its
own front matter not to "fix" it with static markup. Only robots-blocked pages get the `<h1>`
exemption — the `sitemap: false` twins are pages a visitor still lands on from Google's index, so
they stay checked.

CI runs it on every pull request touching HTML, `_includes/`, `prices.csv` or `docs/specs.csv`,
fails the PR on a regression, and on the daily 08:00 IST schedule opens an issue instead.

Two things it cannot see, both learned the hard way. It reads the **source tree**, so a `href="#main"`
that only resolves because the shared header supplies the id looks fine to it and is dead in the
built page — check anchors in `_site`, not in the sources. And `python` may not exist on a Windows
checkout even when `python3` resolves, because that is the Microsoft Store alias stub; if it will not
run locally, read the CI log.

## Architecture

### Pages are standalone documents, not layouts

There is no `_layouts/`. Every page is a complete `<!DOCTYPE html>` document that opens with Jekyll
front matter carrying `permalink:` and `title:`, and pulls shared chrome in with
`{% include header.html %}` / `{% include footer.html %}`. Adding a page means writing the whole
document — head, SEO block, body — and there is no template to inherit from. Copy the closest
existing sibling page.

Each page's `<head>` carries its own canonical URL, Open Graph and Twitter tags, and a JSON-LD
`Product`/`Organization` block. These are per-page literals, not generated; changing site-wide
metadata means editing pages, not one template.

The banner caption is a heading, inside the `<figure>` in `.flat-banner`, and **which level it takes
depends on whether the page has its own content heading**:

- The page has a main heading in the body (usually `<div class="title" id="title">`) — that heading
  is the `<h1>` and the banner caption is `<h2 id="banner-title" class="banner-title">`. This is the
  common case, 377 pages. The body heading is the page's real subject line and generally the richer
  text ("Inconel Coil Supplier, Stockist and Exporter" against the banner's "Inconel® Coil"), so it
  gets the `<h1>`.
- The banner is the only heading the page has — it takes `<h1 id="banner-title">`. 231 pages, mostly
  the newer template that has no `div.title` at all.

Either way there is exactly **one `<h1>` per page**, and the caption is **always a heading element**
— never a `<figcaption>`, never a `<div>`. Both render the same and neither is a heading, so the
largest text on the page drops out of the outline while nothing looks broken. 412 pages carried the
`<figcaption>` form until 2026-08-25 and five carried `<div class="banner-title">` until 2026-08-26;
one of those five had no wrapper at all, just loose text after the `<img>`, so it never picked up
`.banner-title` and rendered as body text. `tools/seo_audit.py` guards this as
`banner_caption_not_heading`, which asks whether the caption is a heading rather than naming the one
wrong element it happens to know about — the narrower `banner_figcaption` it replaced was blind to
the `<div>` form.

`.banner-title` carries `margin: 0` in all three stylesheets that define it precisely because it is a
heading either way — do not remove that.

Anything reading the banner caption must match **`h1` or `h2`** (and `figcaption` if it also reads
history), never one of them alone. `alt_alloy_mismatch` looked for `<h1>` by itself and so evaluated
37% of its pages while reporting a clean 0; when the `<h1>` moved to the body heading the same bug
would have put it at 42%, still reporting 0. **Measure a check's coverage by running its own regex
over the tree — a count of 0 cannot tell you what it never looked at.**

A `Product` node needs **one of `offers`, `review` or `aggregateRating`**, and an `offers` block
needs a price. Google reports a node missing either as an *invalid item*, ineligible for rich
results, so there are two ways to fail and only one of them is obvious.

The site has been through both. ~547 pages once carried `offers` with no `price`; the `prices.csv`
pipeline stripped those, and Search Console promptly raised the other error on what was left —
because **stripping `offers` leaves a bare `Product` node, which is equally invalid**. Removing
`offers` is a way out of one error and into the other, not a resting state.

So a page with a `Product` node has exactly two honest endings: **publish a real price** on the page
and mark up what is shown, or **publish no `Product` node at all** until it is priced. Never invent
a price — marking up a figure the reader cannot see violates Google's structured data policy and
risks a manual action — and never reach for `review` or `aggregateRating`, which would mean
fabricating reviews, a worse breach than the invalid item it papers over.

`build-prices.mjs` now takes the second ending automatically. A page with no row in `prices.csv`
has its `offers` stripped **and its `Product` node parked** — wrapped in an HTML comment between
`product-unpriced:start` and `product-unpriced:end`, so Google never sees it. Add a row and the next
run unwraps the node and writes the offer into it.

Parked, not deleted, because these pages are a **backlog and not a verdict**: `prices-todo.csv`
exists to list pages that are going to be priced. Deleting would throw away the `name`, `sku`,
`material` and `image` no row in `prices.csv` could put back, and would silently break the two
things that make the backlog work — `build-prices.mjs` hangs a new `offers` block off the
`manufacturer`/`brand` key **inside** the `Product` node, so with the node gone a newly priced page
takes the visible figure and no markup (and says nothing, because that warning lives inside the
branch a missing node skips); and `build-price-worklist.mjs` selects pages by matching
`"@type": "Product"` in the raw page, so the queue would empty out on the run that fixed it.

Both of those depend on the parked node staying **findable as text**. Do not switch either script to
a JSON-LD parse for that particular test.

Count the invalid-item state with a JSON-LD **parse**, not a regex — and strip HTML comments first,
or the parked nodes read as still-broken. Priced pages use `lowPrice`/`highPrice` on an
`AggregateOffer`, so grepping for `"price"` reports every correctly priced page as broken.

`permalink: pretty` is set globally. URLs follow alloy → grade → form:
`/inconel/` (family hub), `/inconel/600/` (grade), `/inconel/600/coil/` (form factor). A minority of
older pages use flat SEO permalinks instead (e.g. `/inconel-600-601-617-foil-supplier-...`); leave
those alone — they are indexed.

#### A grade hub is an overview, not a copy of one of its forms

The grade tier exists to introduce the grade and route to every form it is stocked in. Eleven of
them were instead near-copies of a single child page — `/kovar/` was 100% identical to
`/kovar/foil/`, `/stainless/904L/` 96% identical to `/904L/sheets/`, `/monel/400/` 92% identical to
`/monel/400/round-bar/`. Both pages then declared themselves canonical, so Google had two pages
claiming to be the original and no signal to choose between them, which is the
*Duplicate without user-selected canonical* state in Search Console.

The giveaway is the heading. A hub whose `<h1>` reads "904L **Sheets** Supplier in India" is a form
page sitting at a grade URL. `/kovar/` had gone one step further and carried
"**Invar** Foil Supplier" — the wrong alloy entirely, copied from the Invar page.

Copy `inconel/625.html`. A hub carries a breadcrumb, an `<h1>` naming the **grade**, a paragraph on
what the grade is for, an `<h2>Available Forms</h2>` list linking every form page, and the generated
specs block if the grade has a row in `docs/specs.csv`. Chemistry, mechanical properties and size
ranges belong on the form pages — repeating them is what made these hubs duplicates.

Which schema depends on whether the hub is priced, and both endings from the `Product` rule above
are in use:

- **Priced hub** (a row in `prices.csv`) keeps `Product` + `AggregateOffer` and a visible `Price`
  row inside a `spec-table-section`. `build-prices.mjs` needs that row to exist — strip the table
  and the next run has nowhere to print the figure and removes the offers, leaving a bare `Product`.
- **Unpriced hub** drops the `Product` node entirely for `CollectionPage` + `hasPart`, one entry per
  form. That is how `/kovar/` and `/invar/` are built.

Do not put a form-specific standard in a hub's spec table. `alloy-31.html` and `AM-350.html` had a
row headed "Main Plate Standards" — accurate for plates, wrong as the grade's specification. State
the UNS/Werkstoff identifiers and point at the form pages for the rest.

Never put a colon in a permalink. Colons build on the Linux runners GitHub Pages uses but are
illegal in Windows filenames, so the local build breaks. This already bit the NiCr pages once.

**Build locally with `bash docs/build-local.sh`, not plain `jekyll build`.**

Two URLs on this site differ only by case: `/Hastelloy/foil/` is a real page and `/hastelloy/foil/` is
a redirect stub aimed at it, and `/monel/K-500/sheets/` has the same shape. GitHub Pages builds on
Linux, where those are distinct paths. Windows is case-insensitive by default, so it collapses each
pair into one directory and whichever file Jekyll writes last silently wins — the local `_site` then
disagrees with production, and a link checker reading it reports hundreds of 404s that do not exist.

`docs/build-local.sh` marks `_site` case-sensitive before building, which Windows 10 1803+ supports
per-directory, and subdirectories inherit it. The flag can only be set on an *empty* directory, which
is why the script recreates `_site` rather than reusing it — and why `rm -rf _site && bundle exec
jekyll build` silently loses the protection. The script prints which mode you got, and warns loudly if
it could not enable it (it needs the WSL optional component present). If you see that warning, do not
conclude a page is missing or a link 404s from that build — check the source `permalink:` or the live
site.

The script also handles the other Windows limit: **colons**. Several pages carry `redirect_from`
entries for the old NiCr URLs (`/NiCr/20:25/plates/`), which Search Console reports as 404s.
`jekyll-redirect-from` writes a directory per redirect URL, and Windows cannot create a directory
with a colon in its name — so a plain `bundle exec jekyll build` dies outright here, exit 1, after
about 830 files. Those redirects are correct and must stay: the Linux runner that publishes the site
builds them fine. When it detects the limitation the script builds from a throwaway copy with just
those entries stripped, leaves the working tree alone, and says how many it skipped.

The colon check probes with **Ruby**, not the shell — Git Bash will cheerfully `mkdir` a path with a
colon in it while Ruby, which is what Jekyll actually writes with, fails with `ENOTDIR`. Probing with
the shell silently reports success and the build then dies anyway.

Note that uppercase in a URL is not itself a problem: 142 URLs contain uppercase (`/NiCr/…`,
`/stainless/904L/`) and none of them collide. Only two URLs differing *only* by case cause this.

**Never run `git add --renormalize .` in this repo.** Some directories under
`detailed_product_page/nickel-alloy/` are recorded in the index in lowercase (`incoloy/`, `invar/`,
`monel/`, `nichrome/`, `nimonic/`) while the directory on this Windows checkout is actually named
with a capital (`Incoloy/`). `core.ignorecase` is true, so git normally matches the two and reports a
clean tree. `--renormalize` walks the real on-disk names instead, fails to find them in the index, and
stages six files as new.

Committing those would have put six extra files at the capitalised paths into the index, each
declaring a permalink its lowercase twin already owns — six permalink conflicts the moment Linux
built it, since there the two paths are different directories. It looks like recovered work. It is
not: normalise the line endings and the content is byte-identical to what is already committed.

The same case-sensitivity applies to filenames. `titanium/Grade-2/plates.HTML` once built to
`plates/index.HTML`, which no server serves for a directory request, so the page 404ed in production
while working locally. Uppercase extensions are also invisible to `grep --include="*.html"`, so the
file skipped every audit the repo had. Keep filenames and extensions lowercase.

### The header exists twice, on purpose

`_includes/header.html` is rendered into every page at build time, so navigation is in the served
HTML rather than appearing after JavaScript. The same include is *also* published standalone at
`/html/header.html` by the three-line wrapper files in `html/`, because the runtime-rendered product
route fetches it. Same for the footer and the product page shell.

This is why `_config.yml` excludes a lot but deliberately does **not** exclude `html/`, and why
`robots.txt` deliberately does **not** block `/html/` — Googlebot has to fetch those fragments or it
renders the dynamic pages with no navigation. Edit the include, not the wrapper.

### Two rendering models coexist

Most pages are fully static. One route is data-driven:

`/pure-nickel-strip/product/?product=<slug>` — `javascript/product-page-runtime.js` fetches the
header/footer/page-shell fragments, then reads a row from the Supabase `busbarproduct` table and
drops each column's HTML into the matching element id. The slug comes from `?product=` or from
`<body data-product-slug="...">`, which is how a static wrapper page can get an SEO-friendly URL
while still being data-driven. `docs/product-page-migration.md` lists the required columns.

Because that shell is injected with `innerHTML`, script tags inside the fetched footer never
execute — `/pure-nickel-strip/product.html` therefore loads `floating-form.js` itself.

### The enquiry form and lead pipeline

`javascript/floating-form.js` (ES module) renders the site-wide enquiry form in two modes — floating
launcher, or inline into `#rfq-form` on the contact page. It is loaded once from the shared footer
include, so every page gets it; module scripts dedupe by URL, so pages carrying their own tag are
unaffected.

`javascript/lead-config.js` is the single place to change where leads go. Submissions land in one of
three honest states (verified / unverified / failed); a failure hands the visitor a pre-filled
WhatsApp link so a broken pipe still yields a lead. The transport deliberately avoids `no-cors` as
its primary path, since opaque responses previously reported success for leads that never arrived.

The destination is a Google Apps Script web app whose source lives at
`docs/apps-script/lead-capture.gs` (versioned here, excluded from the build). Its header comments
carry the deploy procedure — the important part is that updating means "Manage deployments → edit →
New version", not "New deployment", which would mint a different `/exec` URL. Apps Script cannot set
HTTP status codes, so the site reads `{ok: …}` out of the body; keep that contract.

`supabase/migrations/` holds the `leads` table. RLS is on with **no** policies, so the public anon
key gets no access — do not add an anon policy, the table holds customer contact details.

### Secrets

The repo backs a public GitHub Pages site: everything under `javascript/` is served verbatim. The
Supabase anon key and the Apps Script `/exec` URL are public by design. The CRM bearer token is not,
and must never be committed anywhere in this repo — the CRM webhook cannot be called from a browser
at all (401 on preflight, no CORS headers) and needs a server-side hop that does not exist yet.

### Prices come from prices.csv — do not edit them in the pages

`prices.csv` is the single source of truth for every published price. `docs/build-prices.mjs` writes
both the visible `Price` row and the `AggregateOffer` in the JSON-LD from the same row, so the figure
a reader sees and the figure Google reads cannot drift apart. Marking up a price that is not visible
on the page breaches Google's structured data policy, which is why the two are written together and
never separately.

**A page absent from the CSV has its `offers` block removed.** That is deliberate. `offers` without a
`price` is invalid markup: it earns no rich result and reports as an error in Search Console, and 477
pages were in exactly that state. To retire a price, delete its row and re-run — the markup cleans
itself up.

The strip alone does **not** make the page valid — it leaves a bare `Product` node, which Google
reports under *"Either offers, review, or aggregateRating should be specified"*. So the same run also
**parks** that node in an HTML comment; see the rule under Architecture for why it is parked rather
than deleted, and what depends on it staying findable as text. Between them the two steps leave an
unpriced page asserting no price and publishing no invalid item.

Treat the count in `prices-todo.csv` as a **pricing backlog**, not as a list of broken pages. Those
258 pages are valid as they stand — they keep their `BreadcrumbList`, and 67 keep their `FAQPage`.
What they do not have is a product rich result, and only a real price earns that.

**Prices are re-quoted quarterly.** `priceValidUntil` is derived from the `# updated:` line plus
`VALID_DAYS`, which is 100 — a little over a quarter, so a pass that slips a few weeks still has a
valid price on the page, and a pass that never happens expires quietly instead of going on asserting
a stale figure. Google uses a price only while it trusts it, the same way it treats `<lastmod>` — and
loses trust the same way.

The window and the cadence have to move together, and `VALID_DAYS` lives in **two** files that must
agree: `docs/build-prices.mjs` and `docs/build-price-worklist.mjs`. Set it shorter than the gap
between passes and every price spends the tail of each cycle expired, which drops it from the rich
result — the 268 rich results this site has are only worth having while the date is in the future.
Set it much longer and a pass nobody ran keeps asserting a figure nobody checked.

What makes a quarter honest is the width of the ranges: the median row spans 2× low to high, so
ordinary movement stays inside the figure already published. Roughly 37 rows are tighter than 1.5×
— `/nimonic/115/plates/` is 1.17×, the Incoloy 825 rows are 1.25× — and those are the ones to widen
or re-quote first. Stretching the window without widening them is how a wrong price gets published,
and a wrong price is worse than no price.

Re-quoting a single row off-cycle is fine and always has been: change it, bump `# updated:`, re-run.
What cannot be ad-hoc is the window, because the expiry is derived from that one date.

INR drives the schema. USD appears on the page as indicative only: two currencies in the markup means
two prices that drift apart when the rate moves, and Google picks between them unpredictably. Update
both columns together.

#### prices-todo.csv is the queue in front of it

Pricing a page used to start with the tedious half: find the permalink, copy it into `prices.csv`,
*then* decide the number. `docs/build-price-worklist.mjs` writes the url column for you.

```bash
node docs/build-price-worklist.mjs          # refresh the queue
node docs/build-price-worklist.mjs --adopt  # move filled rows into prices.csv
node docs/build-price-worklist.mjs --check  # reports drift, writes nothing, exits non-zero
```

It lists every page that is **both** unpriced and off the schema — a `Product` node in its JSON-LD
but no `offers` block, which is exactly what `build-prices.mjs` leaves behind for a page with no
row. So each row is a page currently eligible for no rich result. Fill in `low_inr` and `high_inr`
(USD optional), run `--adopt`, then run `build-prices.mjs`.

**It is a queue, not a source of truth.** Nothing reads it at build time and it is excluded from
the build; `prices.csv` still sets every published price. `--adopt` appends rather than inserting
in sorted position, matching how rows have always been added, and it never touches the
`# updated:` line — bumping that would extend `priceValidUntil` on 80-odd pages nobody re-checked,
which is the trust-erosion failure that field already taught this repo once. It warns instead when
the date is close to expiry.

Three things it refuses rather than guesses at:

- A page with **nowhere to print the figure** — no spec table, no `Price` row — is listed as a
  comment, not a fillable row. `build-prices.mjs` writes no schema for those, and a marked-up
  price the reader cannot see is the policy breach the pipeline exists to avoid.
- A cell that is not a plain number. `2400-3900` typed into one cell strips to `24003900` and
  would adopt without complaint, so anything but digits (with an optional INR, Rs, rupee or dollar
  prefix and thousands separators) is named and skipped.
- A row with **seven columns**, which means an unquoted comma inside a number. `2,400` splits into
  two fields and shifts every value right, so `2,400`–`3,900` would adopt as INR 2–400/kg. Quoted
  `"2,400"` — what a spreadsheet writes — parses correctly; the bare form is refused and the line
  is handed back verbatim on the next refresh instead of being rewritten into the row it parsed
  as.

### Specifications come from docs/specs.csv — do not edit hub tables by hand

A standard is written for a **product form**. ASTM B443 covers plate, sheet and strip; B446 covers
rod, bar and wire; B444 covers pipe and tube. They are not interchangeable, and citing one for the
wrong form tells a buyer the material is certified to something it is not.

That went wrong at scale. `/inconel/625/wire/` cited B443 — a plate spec — in seven places
including its meta description and JSON-LD. An audit of every published page found **80 pages citing
a standard written for a different form**: Monel 400 plates on B164 (the bar spec), Incoloy 800H
round bar on B407 (the pipe spec), Nimonic 90 plates on B637 (a bar spec for an alloy with no ASTM
at all), Haynes 214 on B435 (whose scope is four UNS numbers, none of them N07214).

`docs/specs.csv` is one row per grade with a column per form. `docs/build-specs.mjs` writes the
grade × spec table onto every hub from it, so the same number can no longer be typed onto a product
page, a form hub and a grade hub and drift between them:

```bash
node docs/build-specs.mjs          # after editing docs/specs.csv
node docs/build-specs.mjs --check  # reports drift, writes nothing, exits non-zero
```

Form hubs (`/inconel-wire-supplier…/`, `/hollow-bars/…`) get rows of grades with the spec **for
that form only** — that is what stops a plate spec reappearing on a wire page. Grade hubs
(`/inconel/625/`) get rows of forms. The table is written between `<!-- specs:start -->` and
`<!-- specs:end -->` markers, so re-running replaces only the generated block and never touches
hand-written copy around it. A hub with nowhere to put it is reported, not guessed at.

**Fill a cell only from a mill technical bulletin.** Special Metals publishes INCONEL, INCOLOY,
MONEL and NIMONIC; Haynes International publishes HAYNES. Where a mill publishes no standard the
cell reads `mill`; where the grade is not made in that form it reads `-`. Distributor listings are
not a source — that is where AMS 5542, an Inconel X-750 *sheet* spec, came to be cited for Haynes
214 *round bar*.

Two things the mills' own groupings settle, which the ASTM title alone gets wrong: B637 covers
"Rod, Bar, **Wire** and Forging Stock" for alloy 718 and Nimonic 80A, and B425 covers "Rod, Bar,
**Wire** and Forging Stock" for Incoloy 825. Reading only the standard's title flags those as errors
when they are correct.

**`--check` is not enough on its own.** It catches drift — `specs.csv` edited without re-running the
generator — and CI already does that on every pull request. It cannot catch the other failure: mill
bulletins get revised and ASTM retitles and rescopes standards, so a row is only as good as the day
it was checked against its source. A recurring review covers that, on the 1st and 22nd of each month
(cron cannot express "every 21 days"). Each run re-verifies **one family** against its mill's current
bulletin, rotating so the whole file is covered roughly every four months, and proposes edits rather
than committing them. The task lives in
`~/.claude/scheduled-tasks/nickelsheets-spec-review/SKILL.md`; `README.md` has the summary and the
bulletin URLs.

### Grade identity and chemistry come from grades.csv — do not type them onto pages

A UNS number is the strongest claim a page makes: it tells a buyer exactly which material they are
being offered. An audit of all 778 published pages on 2026-08-22 found the site contradicting
itself at scale — **4 grades publishing conflicting UNS numbers, 24 conflicting Werkstoff numbers,
51 grades whose sibling pages disagreed on chemistry and 61 density/melting disagreements**. The
same failure as the prices and the specs before their CSVs existed: one figure typed onto a form
page, a form hub and a grade hub, with nothing keeping the three in step.

The errors cluster in one place. **The round-bar pages are a separately-written batch** and carry
most of them: `incoloy/800/round-bar` cited 2.4952, which is Nimonic 80A's number; `hastelloy/C2000/round-bar`
cited 2.4605, which is alloy 59's.

Three verified examples of the kind of disagreement this fixes, each confirmed by reading the pages:

- `inconel/600` nickel reads `72.0 – 80.0` on sheets, `72.0`–`76.0` on round bar and `≈72.0 min` on
  plates. The mill says **72.0 min** — both upper bounds were invented.
- `monel/K-500` density is `8.8` on sheets and `8.44` on round bar. 8.80 is **Monel 400's** density,
  carried over with the template; K-500 is 8.44.
- `NiCr 20/25` density is `7.8` on plates and `8.9` on round bar — a 14% disagreement about the same
  material, which is a weight-calculation error as much as a documentation one.

A caution learned while writing that audit: when a scanner strips HTML tags, two adjacent `<td>`
cells concatenate, so `<td>19.0</td><td>23.0</td>` reads as `19.023.0` and looks like a dropped
dash. Several "typo cells" reported in the first pass were artifacts of exactly that and were not
real. **Compare cell by cell, and normalise numbers before calling two pages different** — otherwise
`8.80 g/cm³` and `8.8` count as a conflict.

Three files, joined to `docs/specs.csv` on `(family, grade)` — all four must use identical keys:

- **`docs/grades.csv`** — one row per grade: `uns`, `wnr`, `en_name`, `density_g_cm3`, `melting_c`,
  plus `source` and `checked`.
- **`docs/chemistry.csv`** — long format, one row per element limit, plus an optional `note` for a
  qualifier the bulletin itself prints (`if determined` against cobalt in the INCONEL 625 sheet).
  Rows print in file order, so keep each grade's rows in the order its bulletin prints them.
- **`docs/properties.csv`** — long format, one row per physical property: `property`, `value`,
  `unit`, `condition`, `note`. Appended to the identity table after density and melting range.

`properties.csv` is long format for a reason a wide table cannot solve: the values are **sparse and
conditional**. Thermal conductivity and expansion coefficient are published for Inconel 751 and
almost nothing else, INCONEL 718 has one density annealed and another annealed-and-aged, and X-750
publishes Curie temperature, permeability, emissivity and linear contraction at two or three
conditions each. A column can hold one number per grade; it cannot say "this value, under these
conditions", so it would have to pick one and drop the rest silently.

**The unit is a column so that no figure is ever a conversion.** The mills print most constants in
both imperial and SI, but not all — X-750's Curie temperature is published in °F only, and 718's
annealed-and-aged density in lb/in³ only. Record the bulletin's number in the bulletin's unit;
prefer SI where it gives both. `density_g_cm3` and `melting_c` stay in `grades.csv` because every
grade has them and `grades.json` feeds them to a weight calculator as bare numbers.

None of the three CSVs may contain a comma inside a field — `readCsv` splits on it, and a stray
comma shifts every value right.

```bash
node docs/build-grades.mjs          # write the tables into the pages
node docs/build-grades.mjs --check  # drift + cross-file disagreement, exits non-zero
node docs/build-grades.mjs --lint   # only the contradiction report
```

**The publication gate is what makes this safe to adopt gradually.** The writer only touches a grade
whose row carries a `checked` date *and* a `source` that is not `pending`. Every other grade keeps
its hand-written tables. So the CSV can be filled in one sitting and adopted family by family, and
seeding it changes no page until a human has verified the row. Rows currently seeded as `pending`
are a starting point for verification, **not** verified data — do not clear `pending` without
reading the bulletin.

**The lint runs on every page regardless of verification state**, and that is the half that paid off
first: reporting a wrong UNS does not require the replacement to be ready. It checks only the
*identity zone* — title, meta description, og/twitter, JSON-LD `name` — because a UNS in the body is
usually a legitimate mention of a sibling grade in a cross-link list. A page whose identity zone
names more than one grade of its family (the combined foil pages) is skipped rather than judged
against one of them.

CI runs `--check --strict`, which fails on drift, on the files disagreeing with `specs.csv` about
what a grade *is*, **and on lint findings**. The `--strict` half was added on 2026-08-26, the day
the backlog reached 0; until then a finding was reported but tolerated, because failing on a
backlog would have blocked every unrelated PR. The guard is now closed: a new contradiction fails
the PR that introduces it.

**The backlog is now 0** — the last seven were Nichrome, cleared on 2026-08-26, and `--strict`
can go on the CI step now. Nichrome is not a Special Metals or Haynes grade, which is why it sat
unclearable: no bulletin already read publishes it. **VDM Metals does**, as VDM Alloy HT 80 /
HT 70 / HT 60, and those three Basic Information sheets now source the whole family.

That family is also the case study for **why a distributor is never a source**. Two of the three
UNS numbers on the site were wrong, and wrong the same way: the trade circulates `N0600x` where
the mill prints `N0602x`. 80/20 is **N06023** and not N06003, 60/15 is **N06024** and not N06004
or N06060. 70/30 genuinely is **N06003** — so the two 80/20 pages carrying N06003 were publishing
70/30's identity.

Two of the seven findings were the lint being wrong about a page that was right, both caused by
this file rather than by the page. `/NiCr/70-30/plates/` cited N06003 and was reported, because
`grades.csv` read `-` — and `-` claims the mill publishes no such designation, which is exactly
what it must never be used to mean. The 60/15 round bar's `2.4867` was reported against a CSV
reading `1.4867`, a steel prefix on a nickel alloy. **When the lint fires, check the CSV cell
before you touch the page.**

The Nimonic 75/80A/901 Werkstoff findings, the Nimonic 86/115 UNS numbers and the Incoloy 800H hub
were cleared on 2026-08-25.

The form hubs are outside the lint's reach and carried the same errors — `gradeForUrl` needs a
`/family/grade/` URL and `/wire/nichrome/` has no grade segment, so 59 wrong UNS numbers across
eleven hub pages were invisible to it. After changing a grade's identity, grep the whole tree for
the old number; do not trust a clean lint to mean the site is clean.

Careful with what "cleared" means for the Nimonic pages: the numbers were removed because Special
Metals publishes none, not because none exist. `N07081`, `N07105` and `N06081` still sit on ~14
other pages inside a cloned "Nimonic 81" comparison row whose *standard* column was re-typed from
whatever page it was pasted onto — AMS 5599 on the Haynes 242 page, AMS 5951 on Haynes 282, AMS
5872 on Nimonic 263. Fixing the UNS cell alone would leave a fabricated standard behind, so that
row needs deleting or rebuilding from `specs.csv`, not patching.

Details worth keeping:

- A grade may carry **more than one UNS** where the mills publish more than one — duplex 2205 is
  `S32205 / S31803`, the modern higher-nitrogen version and the original. Most current first.
- **`wnr` takes a list on the same terms**, and the lint splits it the same way. Special Metals
  prints two Werkstoff numbers for Monel 400 (`2.4360 / 2.4361`), Nimonic 75, Nimonic 80A, Nickel
  200 and Nickel 201, and a page may cite either. Recording only the first is what made those pages
  lint as contradictions — a check punishing the CSV for getting more complete.
- An **empty cell and `-` are different claims.** Empty means "not verified yet" and drops its row
  from the table; `-` means "the mill publishes no such designation" and prints a dash. Never write
  `-` to mean "I could not find it". Which one a silent bulletin earns depends on whether it is
  silent *selectively*: MONEL R-405's sheet heads the grade `(UNS N04405)` while its companion 400
  sheet prints two Werkstoff numbers, so that omission is a statement and reads `-`. The NIMONIC
  sheets print no symbolic EN designation for any grade, so `en_name` there is empty.
- **A nominal figure is not a limit** and never goes in `min` or `max`. Some sheets publish only a
  nominal composition — NIMONIC 86 and 81, INCOLOY 890 — and NIMONIC 901's table is headed
  "Nominal Chemical Composition, % (not for specification purposes)" with four bare figures and
  seven maxima. Leave min and max empty and put the figure in `note` as `42.5 nominal`; `--check`
  rejects a row with none of the three. The caption follows the table: all-nominal tables are
  introduced as nominal, mixed ones say which figures are limits, and only a table of real limits
  is called "specification limits". `bal` counts as neither.
- `density_g_cm3` is a **bare number** on purpose. `build-grades.mjs` emits `docs/grades.json` from
  it so a weight calculator can consume it directly; a range or a `≈` breaks that.

**`docs/` is not excluded wholesale — `_config.yml` names every file individually**, because the
folder also holds the images, videos and certificates the site links to. A new working file added
under `docs/` therefore **publishes by default**, at a URL nothing links to. That is how
`build-grades.mjs`, `grades.csv`, `chemistry.csv` and `grades.json` came to be served: they were
added without `exclude:` entries, right beside a `docs/specs.csv` line that had one. Add the
exclusion in the same commit that adds the file, and check `_site/docs/` after a local build.

Form pages get the specification **for the form they sell**, read from `specs.csv` via the URL's
form segment. `build-specs.mjs` only ever wrote to hubs, so until now nothing generated the standard
on the ~300 form pages — which is how `/inconel/625/wire/` came to cite B443, a plate spec, in seven
places.

#### Which tables a page gets, and why silence was the bug

Not every page carries both tables, and the rule is **taught to the generator** rather than left to
whoever edits a page:

- **Form page** (`/inconel/600/coil/`) — identity table *and* chemistry table.
- **Grade hub** (`/hastelloy/C276/`) — **identity only**. Chemistry belongs on the form pages; see
  the hub rule above for what repeating it cost eleven hubs.
- **Powder page** (`/titanium/grade-5/powder/`) — **neither**. SB-265 is a strip/sheet/plate
  specification and the Special Metals bulletins are wrought; powder is a different production
  route with its own oxygen limits and its own standards. Writing a wrought composition onto a
  powder page is the wrong-form error `docs/specs.csv` exists to prevent, one column over.

A page opts in by carrying the section with any `<table>` inside it — an empty `<table></table>` is
enough, and the next run replaces it.

**The bug this fixed was silence.** `build-grades.mjs` reported a page whose section existed but
held no table, and said *nothing at all* about a page with no section — it just `continue`d. So a
verified grade whose page lacked the section appeared nowhere: not written, not skipped, not
counted. **112 pages were in that state**, including grade hubs like `/titanium/grade-1/` and every
Nimonic hub, straight through a whole family's migration. Now a missing section is reported like
any other, which is what dropped the skip list from 65 entries to 0.

The lesson generalises: a check may report a finding or exclude it deliberately, but it may never
be quiet about a case it does not handle. A count of zero has to mean zero.

#### Combined pages: one form, every grade in the family

A page like `/nichrome/sheets/` sells the whole family in one form, so a buyer can compare grades
without opening three tabs. `gradeForUrl` cannot reach these — the segment where a grade would be
says `sheets` — so they were **neither written nor linted**. That blind spot is how
`/nichrome/sheets/` came to publish `UNS N06020`, which is not an assigned UNS number at all, over
a composition matching none of the three grades it claimed to cover, plus AMS 5603 and ISO 15156
(a sour-service standard, on a heating alloy).

The `COMBINED` map at the top of `build-grades.mjs` names them: URL → the grades it covers, in the
order the tables should print. The writer emits one identity table and one chemistry table **per
grade**, each under an `<h3>` and each keeping its own provenance caption, by calling the same
`identityTable()`/`chemTable()` the single-grade path uses. So a combined page is not a new table
format to maintain — it is the same tables, stacked.

Two rules the map enforces:

- **The lint checks the union.** A combined page may print all three UNS numbers, but nothing
  outside the set — which is exactly what catches a number belonging to no grade on the page.
- **Every grade must be verified before any is written.** Publishing two mill-checked tables beside
  one hand-written one would read as three equally sourced tables, which is the claim the
  `checked`/`pending` gate exists to prevent.

The map is explicit rather than derived from the path, for the reason `build-cuts.mjs` states its
own page → slug map explicitly: the mapping is not regular, and guessing it puts the wrong grade's
data on a page.

#### A generated constant gets one home per page

**Do not repeat a generated constant in a hand-written table on the same page.** `/nichrome/sheets/`
also carried density and melting point in its `#mechanical-properties` table, so once the identity
tables were generated the page gave two different answers — 8.4 g/cm³ against 8.3/8.1/8.2.

That was not one page's problem. Measured on 2026-08-26: of the **273 pages carrying a generated
identity table, 146 also stated density or melting by hand and 63 of those disagreed with it** —
`monel/K-500/sheets` printing 8.8, which is Monel 400's density, one table under the generated 8.44;
`NiCr/70-30/round-bar` disagreeing with itself by 10% on density and 200 °C on melting.

`build-grades.mjs` now **deletes those rows as it writes**, leaving a comment where each one was, and
`--check` fails on a re-added one because the strip makes the page differ from the source — the same
drift path that catches a stale table. The rows are deleted rather than corrected: correcting leaves
two copies to drift apart again.

Four rules the strip enforces, each of which was a way to get it wrong:

- **The sweep is the whole page, not `#mechanical-properties`.** Scoping it to that section is the
  obvious move and it misses nine rows sitting in the Specification Overview tables instead, three of
  them wrong — `detailed_product_page/NiCr/70-30/sheets` said 8.55 g/cm³ against the generated 8.1.
- **An empty CSV cell means the page holds the only copy.** Every titanium grade has an empty
  `density_g_cm3` (ASME SB-265 publishes neither constant), so a strip that ignored the gate would
  delete the only density figure on every titanium page. 48 rows on 33 pages are kept for this
  reason, and they are a lead for `grades.csv`, not a fault.
- **A row with more than two cells is not a duplicate.** `incoloy/DS/DS.html` sets Alloy 330 against
  INCOLOY DS with a column each, so its density row is a comparison between two grades.
- **A row naming the other constant makes two claims.** `hastelloy/B2/plates` read "9.2 g/cm³ with
  melting point around 1370 °C" and `grades.csv` has no `melting_c` for B-2, so cutting the row would
  have deleted the page's only melting figure.

What it will not cut, it **reports** — 18 findings, 16 of them pages restating a constant in prose
rather than in a row. Prose is a real second home and a real backlog; it is named rather than passed
over, because a check may exclude a case by rule but may never be silent about one it does not
handle.

Reviewed **quarterly, like prices** — see the review task below.

### Particle size cuts come from cuts.csv — do not type them onto powder pages

Which cuts a grade is sold in is **not uniform** — that is the whole reason
`docs/powder-datasheets/cuts.csv` exists. But every family and grade powder page had the same five
cuts typed into it by hand, taken from `DEFAULT_CUTS`, which is the flyer's placeholder list rather
than a stock record. So fifteen pages recited one answer whether or not it was true:

- `/aluminium/alsi10mg/powder/` carried `20-63 µm` in its `<title>` and the five default cuts in its
  body — which do not include 20–63. The page contradicted itself.
- `/cobalt-alloys/cocrmo/powder/` recited 5–25 µm, which CoCrMo is not sold in. Its fine cut is 10–30.

`docs/build-cuts.mjs` writes the list onto all fourteen family and grade powder pages from the CSV:

```bash
node docs/build-cuts.mjs          # after editing docs/powder-datasheets/cuts.csv
node docs/build-cuts.mjs --check  # reports drift, writes nothing, exits non-zero
```

**It uses no marker comments**, unlike `build-specs.mjs`. The list appears up to seven times per page
— JSON-LD `description`, `additionalProperty`, FAQ answer text, meta description, lead paragraph,
spec table row, accordion body — and three of those sit inside JSON string literals where an HTML
comment would be invalid. So it recognises a cut list **by its shape**: two or more `<n>-<n> µm`
joined by `, ` or ` &middot; `. Requiring two is what keeps it off a single mention — `45-105 µm (EBM
and DED) is the most commonly ordered` is a different claim, and so is the `20-63 µm` in the
AlSi10Mg `<title>`. It preserves whichever separator the surrounding copy used.

A family hub gets the **union** of its grades' cuts. The page → slug map is stated explicitly at the
top of the script rather than derived from the path, because the mapping is not regular:
`/tool-steel/maraging/` is backed by slug `maraging-ms1`, and Grade 5 and Grade 23 are two pages
sharing one data sheet.

**`/pages/products/powder/` is deliberately not generated.** Its grades table gives each grade its
own cell with a per-process gloss rather than a flat list, so it is hand-maintained — but it makes
the same claims. Change a row in `cuts.csv` and check that page too.

### Powder data sheets are generated, and are not Certificates of Analysis

`docs/powder-datasheets/` holds seventeen metal powder grade data sheets generated from
`data.mjs`. Output is standalone HTML in `sheets/`, printed to PDF from a browser. The folder is
excluded in `_config.yml`, so nothing publishes until that line is removed deliberately.

The distinction the folder enforces: **a data sheet states specification limits for a grade, a
Certificate of Analysis states measured values for one lot.** A data sheet promises a range, so
every conforming lot satisfies it and it never goes stale. A lot report handed out as a data sheet
is a representation about material that may already be gone — which is what the five PDFs this
replaces were doing, still quoting February 2024 lots in 2026.

Because each of those was hand-maintained they drifted: the CP-Ti oxygen limit reads `0.015 %` on
one and `0.15 %` on another for the same material, and the 15–53 µm plasma-atomised and 45–105 µm
gas-atomised CP-Ti sheets carry byte-identical chemistry, which two atomisation routes cannot
produce. Same failure mode as the prices before `prices.csv`. Edit `data.mjs`, never `sheets/`, and
bump `REVISION` on any content change.

Never put a Certificate of Analysis in this folder. It is a shipment document, not a web page.

### sitemap.xml is generated — do not edit it by hand

`docs/build-sitemap.mjs` writes it from the source tree. Run it after adding, removing, renaming or
meaningfully editing a page:

```bash
node docs/build-sitemap.mjs
```

`--check` reports drift and exits non-zero without writing. CI does not run this one — it runs only
the price and specification checks — so run it yourself before committing page changes.

Dates come from git history, so a generation cannot know about the commit it is about to be part of:
after committing page edits, the pages in that commit are one commit behind. Run the generator again
and commit the result. That second commit touches only `sitemap.xml`, which is not a page, so no
dates change and it converges — you never need a third. `--check` tells you when you are in that
state.

Pages are excluded when they are `published: false`, marked `sitemap: false`, are a `/html/` runtime
fragment, or are disallowed in `robots.txt` — the last is read from `robots.txt` itself, so a route
can never be both blocked and advertised. `<priority>` and `<changefreq>` are deliberately not
emitted; Google's documentation says it ignores both.

**`<lastmod>` is only as good as the discipline behind it.** Google uses the value *only* while it is
"consistently and verifiably accurate", comparing it against the page it actually fetched. Get it
wrong often enough and it stops trusting the field — which is the state this site was in, when every
URL claimed the same stale date.

The generator dates each page from the last commit that touched it, **skipping the commit SHAs in the
`BOILERPLATE` set** at the top of the script. That set exists because sitewide sweeps — swapping a
CDN, inlining icons, a CSS refactor — change every file without changing what any page *says*.
Dating pages from those commits would claim content updates that never happened.

So: **after any sitewide sweep, add its commit SHA to `BOILERPLATE` and regenerate.** Skipping that
step is how the dates silently inflate and the signal rots again.

#### Split the commit so a SHA can be boilerplate or not, never both

`BOILERPLATE` keys on a **whole commit**, so a commit that mixes a sitewide sweep with real content
edits cannot be classified. List it and the genuine edits lose their date; leave it out and every
swept page claims an update it did not have. Either way the signal rots.

**Before every commit, sort the changed files into the two kinds, and commit them separately when
both are present.** The test is what a reader sees on *that* page: a page whose own subject matter
changed is content; a page that only had a neighbour's link label or href rewritten is boilerplate.
Then add the sweep commit's SHA to `BOILERPLATE`, regenerate, and commit `sitemap.xml` on its own.

Worked example — the N08330 rename (2026-08-24) touched 49 files as one change:

- `f2a2c4f4` — 26 pages whose only edit was `/incoloy/330/` → `/incoloy/DS/` and the label
  "Incoloy 330" → "Alloy 330" in a cross-link list. Boilerplate: Kovar round bars and Haynes 188
  sheets say nothing new about Kovar or Haynes 188.
- `f2c28422` — the renamed pages themselves, the corrected grade data, and the seven `incoloy` form
  hubs, whose generated spec tables now print a different grade name. Content, all of it.

The mechanical way to sort them is to diff each file and ask whether *every* changed line is
explained by the sweep. Anything else in the diff makes it content.

### JavaScript inventory

`floating-form.js` (every page, via footer) and `detailed.js` (~650 pages — TOC toggles, smooth
anchor scroll, scroll-up button) are the live ones. `script.js` (mobile nav, language switcher,
homepage marquee) is loaded only by `index.html`. `google-auth.js` and `detailed_database_page.js` were referenced by no page and have both been
deleted; the latter also pulled Supabase from unpkg, which this site otherwise avoids. `javascript/translations/translations.js` is empty and no `<lang>.json`
files exist, so the language switcher's fetch always no-ops — it fails silently by design.

### CSS

Plain stylesheets in `CSS/`, no preprocessor. `header.css` and `footer.css` are on every page;
`pages.css` is the workhorse for content pages, `tables.css` for the spec/chemistry tables.
Stylesheets belong in each page's `<head>`, not in the shared includes.

The site loads **no third-party origins**. Bootstrap 5.3.3 is vendored at `CSS/bootstrap.min.css` and
`javascript/bootstrap.bundle.min.js` (deferred). Font Awesome is gone entirely — its icons are inline
SVG carrying `class="icon"`, sized in `em` and painted with `currentColor` by a rule in `header.css`.
Keep it that way: a CDN `<link>` reintroduces a DNS + TLS handshake on the critical path for no gain,
since browsers partition their HTTP cache by site and cross-site CDN reuse no longer happens.

**`CSS/bootstrap.min.css` is a PurgeCSS subset, not stock Bootstrap.** Only the rules the site already
uses are present. A component the site does not currently use — a modal, toast, offcanvas, nav-tabs —
will render completely unstyled. After adding markup that uses one, regenerate:

```bash
npm install purgecss@7 && node docs/purge-bootstrap.mjs
```

It re-fetches pristine upstream each run rather than purging the already-purged file, which would
compound. The banner at the top of the CSS says the same thing.

## Conventions

Commit messages are short, imperative, and describe the user-visible outcome rather than the edit
("Name the mills the material comes from", "Stop the enquiry form dropping fields"). Comments in this
codebase explain *why* a thing is the way it is, usually recording a bug that motivated it — match
that when adding them.

Images are WebP under `docs/images/`; camera originals live in `docs/images/source/`, which is both
gitignored and excluded from the build.
