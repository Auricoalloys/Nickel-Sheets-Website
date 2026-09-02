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

#### A family hub is the newer template — the `div.details` block underneath it is an older layer

The family tier (`/inconel/`, `/hastelloy/`, `/nichrome/`) sits above the grade hubs and introduces
the whole family. **Copy a recently-fixed one — `inconel.html` is the cleanest — not an arbitrary
sibling**, because two layers coexist on these pages and only the top one is good.

The newer layer is a `#family-intro` of real per-family prose plus `#grades`, `#applications`,
`#quality` and `#cta` sections. Underneath it, older hubs kept a `<div class="details">` block
holding a **pasted paragraph** that called the family "a family of austenitic nickel-chromium-based
superalloys … in environments that exceed 1,000°F", a generic Key Properties list (High Temperature
Strength, Resistance to Scaling and Sulfidation) and a four-item Applications list. It was
byte-identical across the **seven hubs** that had it, bar the family name, and it did real damage:

- On **Elgiloy** and **Nitinol** it named the wrong material class outright — Elgiloy is a
  cobalt-chromium-nickel spring alloy, Nitinol a nickel-titanium shape-memory alloy with no chromium
  — so each page asserted the opposite of the mill-sourced identity table directly below it.
- On **Hastelloy** it contradicted the page's own `#family-intro`, which correctly called the grades
  "nickel-molybdenum and nickel-chromium-molybdenum alloys for wet corrosion".
- On **Inconel, Incoloy, Haynes and Nichrome** the sentence was broadly true but pure filler,
  duplicating the `#applications` section already present.

So when a `div.details` block duplicates the newer sections, **delete the duplication rather than
rewrite it** — the generic Applications list is a worse second copy of `#applications`, and the
argument only needs making once. Keep only a Key Properties list *specific* to the family, drawn from
the page's own intro and chemistry the repo already holds (Haynes 214 is Al 4.5, which is what makes
its scale alumina not chromia); a family with no such list gets none rather than an invented one.

Two mechanical traps rode along on all seven:

- **The `<div class="details">` was never closed**, silently swallowing `#grades`, `#applications`,
  `#quality` and `#cta` into a layout column. Close it before `#grades`, and verify with a
  tag-balance / DOM-signature check, not by eye — the page still *rendered*. (`div.details` itself is
  fine: `stellite.html` and `waspalloy.html` use it closed and correctly, with no pasted paragraph.)
- The keyword `<meta>` and the JSON-LD `description` read "Nickel Alloy Strips … Busbars" regardless
  of family. Both are per-page literals — rewrite them to the family, like every other hub metadata.

The paragraph is now gone tree-wide (grep is 0), so any reappearance is a regression.

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

The script's first act is `rm -rf _site`, so it fails outright with **`rm: cannot remove '_site':
Device or resource busy`** whenever something else holds that directory — a `jekyll serve`, or
another Claude session building at the same time. Do not work around it by deleting the lock or by
running plain `jekyll build`, which loses the case-sensitivity flag *and* dies on the colons. Build
somewhere else instead: `tar` the tree to a scratch directory excluding `.git`, `_site`, `vendor`,
`.jekyll-cache`, `node_modules` and `.claude`, strip the `redirect_from` lines whose URL contains a
colon from the copy, and run `bundle exec jekyll build --source <copy> --destination <scratch>`.
That is what the script does anyway, minus the case-sensitivity flag — which costs you nothing
unless you are checking one of the two case-variant URLs.

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

#### Trademark attribution keys on the URL, and some pages have to opt in

The footer names the owner of each mark **the page is about**, not every mark on the site — the old
block attributed twenty owners on all 746 pages, so a reader on an Inconel page was told who owns
SANICRO and PYROMET. It decides by matching `page.url`, which carries the alloy name on all but a
handful of pages. Those set `trademarks:` in their front matter instead, and the match runs against
the URL and that field together.

**A page whose URL uses the generic name of a trademarked grade gets no attribution unless it opts
in.** The four Alloy 28 pages are the case: they sell Sanicro 28, name it in the title and the
Specification Overview, and sit at `/stainless/alloy-28/` and `/alloy-28/sheets/` — no "sanicro" in
the URL, so the SANICRO line never printed. They now carry `trademarks: sanicro`. The test is
whether the page is *about* the marked grade, not whether it mentions it: `alloy-31.html` names
Sanicro 28 in one comparison row and correctly stays silent, the same way the cross-link lists do.

Verify it in the **built** page, not the source — the attribution comes from the include, so it
does not exist until Jekyll runs.

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

#### The enquiry field is seeded from the page's own breadcrumb

The textarea opens carrying `Enquiry: <subject>`, so a visitor who wants a price on Inconel 625
sheets does not start at a blank box. An explicit `?enquiry=` on the URL always wins — that is what
the powder pages' "Request a sample" CTAs send, and it says what the visitor *clicked*, which is
more specific than what the page is *about*.

The derived subject is the **last crumb of the page's `BreadcrumbList`**, not the `<title>` and not
the `<h1>`. Those two carry marketing tails ("| Premium Corrosion & High-Temperature Alloy"), HTML
entities, and on a couple of pages mojibake (`MonelÂ®`); the breadcrumb is hand-written, one clean
noun phrase, and present on 740 of 774 pages. 638 pages seed a subject and ~103 routes are
suppressed by name. The 8 with no breadcrumb to read are **every one of them `published: false`**,
so on the live site a page either seeds a subject or is suppressed on purpose — there is no third
case to worry about. If a page ever does turn up seeding nothing, the missing `BreadcrumbList` is
the bug, not the form.

**The suppression list is the point, not an afterthought.** The ~130 location pages
(`/nickel-alloy-supplier-in-mumbai/`) end their breadcrumb on a bare place name, so deriving from
them seeds "Enquiry: Mumbai" — which tells the sales desk nothing and reads to the visitor as a
bug. `NO_SUBJECT_PREFIXES` also covers `/privacy/`, `/terms/`, `/supply-locations/`,
`/export-markets/` and the contact page. Home has no breadcrumb and needs no entry.

Title-casing an all-caps crumb is guarded by **letters and spaces only**, deliberately narrower
than "has no lowercase". The form hubs shout ("SHEETS", "HOLLOW BARS") and are worth softening, but
a grade designation is upper-case *by nature*: the looser rule turned 904L into "904l", AM 350 into
"Am 350" and 254 SMO into "254 Smo", publishing grade names this site does not sell. Any digit or
punctuation in the crumb means it is an identifier — leave it exactly as the page wrote it.

Because a seeded textarea hides its own placeholder, the "add the dimensions you need" guidance
moved into a visible `.floating-form-hint` under the field. Do not put it back in the placeholder.

#### Country and company are optional, and are being measured

As of **2026-08-29** the form asks for five required fields, not seven: name, phone, email and the
privacy checkbox stay required, country and company do not. Neither is needed to answer an enquiry —
`lead-capture.gs` only insists on an email *or* a phone number, and the desk can ask for the rest in
the reply. Both fields are still sent and still get their Sheet column; an unfilled one arrives
empty, which `notify()` already renders as `-`.

That change is a **test with an open window**, not a settled preference. `form_start` fires on first
input and `generate_lead` on a confirmed submission, so the gap between them is the completion rate,
and that is the number this is meant to move. The monthly review task
`~/.claude/scheduled-tasks/nickelsheets-lead-review/SKILL.md` reads it, along with `generate_lead` by
landing page and the Search Console rich-result count.

Two things that review has to keep straight, both easy to get wrong:

- **There is no clean before/after baseline.** Nobody was reading these events before the change, so
  the first two or three runs cannot prove anything and should say so rather than reporting noise as
  a result.
- **GA4 cannot tell you whether the optional fields were used** — the leads Sheet can, directly, by
  the proportion of rows arriving with `company` or `country` blank. A near-zero blank rate means
  visitors fill them anyway and the requirement can come back if sales want it.

The prefill and the optional fields shipped together, which does confound them slightly. They are
mostly separable because a pre-filled textarea fires no `input` event and so does not itself move
`form_start`. Field **order** was deliberately left alone for the same reason — moving the optional
fields down the form is the obvious next test, and running it now would make the month unreadable.

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

**One re-quote pass per 100-day validity window.** `priceValidUntil` is derived from the
`# updated:` line plus `VALID_DAYS`, which is 100, and a pass that never happens expires quietly
instead of going on asserting a stale figure. Google uses a price only while it trusts it, the same
way it treats `<lastmod>` — and loses trust the same way.

The cadence is enforced by `~/.claude/scheduled-tasks/nickelsheets-price-review/SKILL.md`, which
fires monthly on the 10th and decides from `# updated:` whether anything is due, rather than from
the calendar. Cron cannot express "every 100 days", and a fixed date drifts out of step with the
file the moment a pass lands early or late.

**It acts at 35 days remaining, and that threshold must always exceed the gap between runs.**
Monthly runs are up to 31 days apart, so a shorter threshold lets a whole window slip between two
runs — one run sees 32 days left and stays silent, the next is 31 days later and the prices lapsed
a day ago. That is not hypothetical: the lead-review task's two-week warning could not fire at all
for the window expiring 2026-11-27, because runs land on the 3rd and Nov 3 was 24 days out while
Dec 3 was 6 days past expiry. Both thresholds were widened to 35 on 2026-08-31.

**In practice that lands a pass every 89–92 days, not every 100, and that is accepted.** A pass
always lands on a run day, so the next one falls on the same day of the month three months later —
which is 89–92 days, whatever the threshold. Simulating four years gives exactly one pass per
window, acting with 8–17 days spare, and no gap above 100. Chasing a true 100 would mean acting
with 0–3 days spare on a daily cron, trading the whole safety margin for eight days.

The window and the cadence have to move together, and `VALID_DAYS` lives in **two** files that must
agree: `docs/build-prices.mjs` and `docs/build-price-worklist.mjs`. Set it shorter than the gap
between passes and every price spends the tail of each cycle expired, which drops it from the rich
result — the 268 rich results this site has are only worth having while the date is in the future.
Set it much longer and a pass nobody ran keeps asserting a figure nobody checked.

What makes the window honest is the width of the ranges: the median row spans 2× low to high, so
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

**The right form is not enough — the grade has to be inside the standard's scope.** An ASTM
specification names the UNS numbers it covers, and a bar standard cited for a grade it does not list
is exactly as wrong as a plate standard cited for wire. It just does not look wrong, because the
form matches.

ASTM's own abstract for **B649-21** scopes it to N08925, N08031, N08354, N08926, R20033 and N08936.
Alloy 28 is **N08028** and Alloy 31 is **N08031** — so the same `ASTM B649` sat in the bar and wire
cells of both rows, correct on one and out of scope on the other. **904L is N08904 and was not in
that list either** — its row cited B649 for both bar and wire, and was deliberately left wrong for
months under a comment saying why: no bulletin read so far stated what 904L's bar standard actually
was, and guessing a replacement is how AMS 5542 reached a Haynes 214 bar page. A wrong citation left
in place under a comment is recoverable; a plausible invented one is not.

**That wait ended on 2026-09-01.** voestalpine BÖHLER's A962RC datasheet (Alloy 904L, N08904; long
products — rolled bar 12.5–130 mm, forged to 254 mm, wire rod 5.00–13.50 mm) names ASTM A479/A479M
and A182/A182M with EN ISO 10088-3, over a composition table headed "Refers to ASTM A479 - 904L".
So bar is now `ASTM A479 / EN 10088-3`. The grade was in the wrong ASTM *series* all along: 904L is
a stainless and A479 is a stainless bar standard, while B649 is a nickel-alloy standard.

**Wire took EN 10088-3, not A479.** A479 is titled "Bars and Shapes" and does not cover wire, so
carrying it into the wire cell would have repeated in one column the scope error just removed from
the next — the failure this file exists to prevent, committed while fixing itself. EN 10088-3
covers "bars, rods, wire, sections and bright products" and is on the same mill panel.

The same datasheet corrected a second figure. `chemistry.csv` had 904L **nitrogen at 0.01**, taken
from Aperam's "Typical values" panel and argued into a limit because it was printed with a `≤`.
BÖHLER prints `max. 0.10`, which is also the A240 limit the row's other nine cells already came
from — and those nine match BÖHLER exactly, so the sheet corroborates the source and contradicts
only the imported cell. A conforming BÖHLER bar at N 0.06 would have failed the table this site
published. **A bounded figure is not a specification limit; what makes it one is the document being
a specification.** Prefer the standard the rest of the row was read from over a tighter number from
a different producer.

The same failure one alloy over: `/alloy-28-round-bar/` cited **ASTM B473** in six places including
its meta description and JSON-LD. B473 covers N08020, N08024 and N08026 — **Alloy 20's** bar spec,
copied from the neighbouring page, on a grade that is not in it. Both were fixed on 2026-08-26.

**EN standards belong in a cell when that is what the mill publishes.** Alleima's Sanicro 28
datasheet lists product standards by form and names *no ASTM bar standard at all*: bar steel is
EN 10088-3 and EN 10272. Those are the first EN numbers in this file and they are here on the same
terms as every ASTM number — read off a mill bulletin. That is the distinction the EN 10095 note
above turns on: what was deleted from the pages was the unsourced citation, not the idea of an EN
standard.

**A row may be sourced from two mills where two mills make it.** Sanicro 35 splits along the line
the producers do: Alleima owns the mark and makes seamless tube and pipe, so `pipe_tube` is
`ASTM B163 / B677` from Alleima's datasheet; Outokumpu rolls the plate and sheet under a licence
agreement Alleima names, so `flat` is `ASTM B625` from Outokumpu's product page. `bar` reads `mill`
— Alleima sells Sanicro 35 Bar as a product line and publishes no bar standard for it, which is
precisely what that cell means and is not the same claim as `-`.

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
Metals publishes none, not because none exist. `grades.csv` records `-` for Nimonic 81, 86, 105 and
115, so **every `N07081`, `N07105` and `N06081` on this site was fabricated** — not a typo of a real
number, an invention of one.

**Cleared tree-wide on 2026-09-01; grep is now 0, so any reappearance is a regression.** It turned
out not to be a comparison row at all. It was mostly **`<meta name="keywords">`**, where a cloned
"Nimonic 81" run had been pasted onto the end of seven pages' keyword lists, each carrying the
fabricated UNS *and a standard belonging to the host page*: AMS 5599 on Haynes 242, AMS 5951 on
Haynes 282, AMS 5872 on Nimonic 263, AMS 5660/5661 on Nimonic 901, BS HR 3 on Nimonic 105, AECMA
PrEN 2298 on Nimonic 90 — and on Haynes 214 the self-refuting *"Haynes International mill
specification for UNS N07214 Nimonic 81 sheet"*. The whole run was deleted rather than corrected:
on a Haynes 242 page it is a different alloy's keywords, so there is nothing there to correct.

Three other shapes, none of them a comparison row either:

- Cross-link labels reading `81 (N07081)` on four pages. The siblings in the same label — 75
  (N06075), 80A (N07080), 90 (N07090) — are all genuine, so only the parenthetical came out.
- One real table row, on `nimonic_round_bar.html`, rebuilt from source rather than patched:
  `Nimonic 105 | - | BS HR 3 | - | 2.4634`, the BS number from `specs.csv` and the Werkstoff from
  `grades.csv`. Its `BS HR501` was Nimonic 90's, copied from the row directly above it.
- One prose sentence on the same page naming "Nimonic 105 (UNS N07105)".

**The search lesson: grep the numbers, not the story.** This was recorded here as a comparison-row
problem, and looking for comparison rows would have found one instance and missed eleven. The
number is the invariant; the markup it sits in is not.

That page is `published: false` — an abandoned half-converted draft that says so in its own front
matter — and two of its other rows still carry form-mismatched standards (`BS HR201` and `AMS 5580`
against Nimonic 75, whose `specs.csv` bar cell reads `BS HR 5 / HR 504 / DIN 17752`). Left alone
deliberately: nothing publishes it, and rebuilding a whole table on a dead page is not the same
task as removing an invented identifier.

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
  Sanicro 35 is the cleanest case of the selective kind: Alleima's Standards panel prints EN Number,
  EN Name, W.Nr., DIN, SS and AFNOR for Sanicro 28 and **prints none of them** for Sanicro 35 — same
  publisher, same panel, one grade filled in and the other not. So `wnr` and `en_name` read `-`.
  It is a young grade and no EN number has been assigned to it.
- **A physical constant the source does not publish leaves the cell empty**, which is different from
  the page being wrong. Neither the Sanicro 28 nor the Sanicro 35 datasheet gives a melting range —
  both publish density, conductivity, specific heat, resistivity, expansion and modulus and stop
  there — so `melting_c` is empty on both, exactly as it is on 254 SMO. Empty also means the
  constant-strip leaves the pages' own melting figures alone rather than replacing them with an
  unsourced one. The seeded values it displaced (1350-1370 for Alloy 28) had nothing behind them.
- **A nominal figure is not a limit** and never goes in `min` or `max`. Some sheets publish only a
  nominal composition — NIMONIC 86 and 81, INCOLOY 890 — and NIMONIC 901's table is headed
  "Nominal Chemical Composition, % (not for specification purposes)" with four bare figures and
  seven maxima. Leave min and max empty and put the figure in `note` as `42.5 nominal`; `--check`
  rejects a row with none of the three. The caption follows the table: all-nominal tables are
  introduced as nominal, mixed ones say which figures are limits, and only a table of real limits
  is called "specification limits". `bal` counts as neither.
- **In a mixed table, read the symbol per cell — the split moves between grades.** Alleima heads
  both Sanicro tables "Chemical composition (nominal) %" and writes some figures with a `≤` and some
  bare. On **Sanicro 28** the bare ones are Cr 27, Ni 31, Mo 3.5 and Cu 1.0, with Mn and N carrying
  `≤`. On **Sanicro 35** manganese and nitrogen are bare too — 0.8 and 0.3 are nominal there and
  limits on its sibling. Copying the shape across from the neighbouring grade publishes four
  nominal figures as acceptance limits. Neither table has an iron row, and none was added: iron is
  the balance of both alloys but the mill does not print it.
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

**Which means the generator owns whatever table is in `#equivalent-grades`, and will eat
hand-written content parked there.** `alloy-31.html` kept a genuine comparison table in that
section — Alloy 31 against 316L, 904L and Alloy 28, four rows of real differentiation — and the
first run that reached the page replaced it with the identity table. It was restored as its own
`<section id="grade-comparison">` next door, which the generator never touches. A comparison,
an application table or any other hand-written table goes in **its own section**; only the
generated one belongs in `#equivalent-grades` and `#chemical`.

**The special-stainless form pages were out of `gradeForUrl`'s reach until 2026-09-01**, for the
same reason the combined pages were. It resolves `/family/grade/…`, and `/alloy-28/sheets/` puts the
grade in the first segment with no family segment at all, so those pages were never written and
never linted while the `/stainless/<grade>/` hubs above them resolved and looked fine. The cost was
the sibling contradiction the CSV exists to end: the three Alloy 28 form pages disagreed on sulphur
(`≤0.01` on sheets against `≤0.03` on plates and round bar).

They are wired up through **two** maps, because there are two URL shapes:

- `SINGLE_GRADE` — the Kovar shape, grade first and form second. Five entries added: `904l`,
  `al-6xn`, `alloy-20`, `alloy-28`, `alloy-926`.
- `FLAT_FORM_PAGES` — the flat SEO permalinks `/alloy-28-round-bar/` and `/alloy-20-round-bar/`,
  which **fuse the grade and the form into one segment** so neither is readable from the path. They
  need the form stated in the map, and they need exempting from the `isHub` test, which counts
  segments and would otherwise call a one-segment URL a grade hub and write identifiers only. That
  page was the last one still publishing `≤0.03`. The permalinks stay as they are — they are
  indexed, and this repo does not rename a flat SEO URL to suit a generator.

**The map grew by six on 2026-09-02, and the sweep that found them is the reusable part.** Listing
every published permalink whose segment *ends* in a form word without having one of its own turns up
39 URLs, and three groups fall out of it: `/alloy-31-round-bar/`, the third of three sibling round
bars, missed when the other two were mapped; the five `/titanium/grade-<n>-plates/` pages, whose
siblings under `/titanium/grade-23/plates/` resolved the whole time, which is what made the gap
look covered; and the `pure-nickel-strip/` battery-tab pages and the combined
`/haynes-…-foil/`, which are **not** the same case and are left alone — the tab pages sell a
product shape rather than a grade in a form, and the Haynes page needs `COMBINED`, which may not
write a grade until every grade on the page is verified.

What the six were publishing says why the sweep is worth repeating rather than the finding worth
memorising. `grade-5-plates` gave iron as `≤0.25`, which is **Grade 23's** limit — SB-265 allows
Grade 5 up to 0.40, so a conforming plate at 0.35 read as out of specification against this site's
own table. `alloy-31-round-bar` cited **EN 10028-7**, a flat-product standard, on a bar page, and
omitted phosphorus. The rest were hedges rather than errors — "in typical datasheets", "on the
order of", carbon as a `0.08–0.10` range — which is what a page writes when nothing generates it.

**All five titanium pages had a real comparison table parked in `#equivalent-grades`**, so
wiring them up would have eaten it exactly as it ate `alloy-31.html`'s. Each moved to its own
`<section id="grade-comparison">` first, with a TOC entry, and `#equivalent-grades` was left holding
a bare `<table></table>` — which is all it takes to opt in, and is the safe order: **move the
hand-written table out, then add the map entry.** Doing it the other way round means recovering the
table from git.

**Wiring Alloy 28 briefly cost something, and the debt is now paid.** Its pages' hand-written tables
carried acceptance limits (Ni 30.0–32.0, Cr 26.0–28.0, Mo 3.0–4.0, Cu 0.6–1.4), while
`chemistry.csv` held Alleima's table, in which those same four are **nominal figures**. So the three
pages finally agreed and were captioned honestly, but a buyer had lost four ranges and got four
single numbers — better sourced and less useful.

**Closed on 2026-09-02 from voestalpine BÖHLER A959**, whose composition table is headed *"Refers to
DIN EN 10088-3 1.4563"* and prints limits for all ten elements. The fix was never going to be B709,
which is what this note assumed: **EN 10088-3 is what Alleima itself names as the product standard
for Sanicro 28 bar**, and what BÖHLER certifies A959 to, so its limits bind the material whichever
of the two mills supplies it. Two cells moved — P 0.020 → 0.030 and Cu 1.0 nominal → 0.70–1.50 —
while C, S and N were unchanged, which is the corroboration that the two sheets describe one grade.

The general lesson: **when a nominal table is the only source, the missing limits are usually in the
product standard the mill names, not in the ASTM number a neighbouring page happens to cite.** The
debt sat open because it was written down as "read B709", which was a harder and wronger errand than
the real one.

New pages should still simply be built at `/stainless/<grade>/<form>/`, which resolves with no map
entry at all — that is why the Sanicro 35 pages are at `/stainless/sanicro-35/plates/`.

**`--lint` used to write.** Its branch sits at the end of `build-grades.mjs`, after the page loop
has already run, so a flag documented as "only the contradiction report" silently rewrote every
stale page on its way to reporting — 14 of them the day these pages were wired up. CI runs `--check`,
so nothing caught it, and the damage was invisible unless you diffed the tree after what you were
told was a read-only command. `writeBlocks` now returns early under `--lint` as well as `--check`,
kept separate so a lint run does not report pages as drift the caller never asked about.

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

**A brand-new page is invisible to this generator until git knows about it.** Pages are discovered
with `git ls-files "*.html"`, so an untracked file is not enumerated — no URL, no warning, and
`--check` still reports "up to date", because the page is missing from both sides of the
comparison. `build-search-index.mjs` walks the filesystem instead, so the two disagree and only the
sitemap is wrong. Adding the four Sanicro 35 pages on 2026-08-26 produced exactly that: 739 pages
in `search-index.json` against 735 URLs in `sitemap.xml`.

So after writing a new page, `git add -N` it **before** running the generator. It then appears with
no `<lastmod>`, which is correct — the date arrives on the regeneration after the commit, the same
two-step as above. Sanity-check with `grep -c "<loc>" sitemap.xml` against the page count
`build-search-index.mjs` prints; they should differ only by the exclusions below.

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

#### Tables are one system, and the link order used to decide how they looked

There is **one table look**, in the block marked `table system` in `CSS/pages.css`, mirrored
byte-for-byte in `CSS/tables.css` and driven by tokens in `header.css`. Style a new kind of table by
teaching that block. Do not add a class beside it — that is how three systems appeared.

The three were `.grade-table` (15px text, 12/15px cells), `.spec-table` (16px text, 15/20px cells, a
30% label column) and bare Bootstrap `.table` (8px cells, no navy), across 2,466 tables in seven
class × shape combinations. A grade hub stacked two tables of the same kind of data that shared no
measurement.

Underneath that was a worse problem. `.table th` and Bootstrap's `.table > :not(caption) > * > *` are
**both specificity (0,1,1)**, so they tied and the winner was whichever stylesheet the page linked
last. 391 pages list `pages.css` first and rendered a row header white; 336 list Bootstrap first and
rendered it navy — **8,349 `<th>` cells, and nobody chose either**. On six of the Bootstrap-first
pages it put a navy link on a navy cell, so the three grade links on `monel.html` were invisible —
the same bug the `.table th a` rule had been written to fix on the other half of the site.

**Every rule in the block is therefore qualified with `body`**, which outranks Bootstrap in both
orders. Same fix, and the same reason, as `body .container` — check that precedent before writing a
bare class selector that Bootstrap also defines.

Four things the block does that are easy to undo by accident:

- **Bootstrap's cell painting is cleared, not overridden.** Its rule sets a background-color *and* an
  inset box-shadow, and the shadow is the mechanism behind `.table-striped`. A background set without
  clearing the shadow gets painted over. `.table-striped` and `.table-hover` are inert as a result,
  deliberately — they were a fourth and fifth look on 109 and 38 tables.
- **The zebra is painted on the `<tr>`, not the cell.** `.grade-table` striped `tbody td` only, so the
  first column of a key/value table — a `<th>` — stayed unstriped and the stripe ran at half width.
- **A `<th scope="row">` is a label, not a second header band.** Painting it navy draws an L round the
  data on the 1,454 tables carrying both a `<thead>` and row headers, and stops the zebra at the label
  column. Weight and colour say "label" at neither cost.
- **`.spec-table-section` and `.grade-table-section` carry no horizontal padding.** `build-specs.mjs`
  writes the same block bare into `<main>` on 50 pages, inside `.spec-table-section` on 86 and inside
  `.grade-table-section` on 1; the 40px/20px that section used to carry made the Specifications table
  40px narrower than the Equivalent Grades table directly above it. Zero padding means the placement
  no longer changes the width, so the generator did not have to learn a container.

`node docs/check-tables.mjs` guards all of it and runs in CI: the two copies of the block staying
identical, no undefined class on a table, no inline style or presentational attribute, and no page
styling tables in its own `<style>` block — which is how `.tech-table { font-size: 0.9em }` set three
tables a tenth smaller than the rest while being invisible to any search of `CSS/`. It prints its own
coverage, because a count of zero cannot otherwise say what it never looked at.

`tables.css` is currently redundant: all 119 pages linking it also link `pages.css`, and the one page
that links neither has a single table styled by `.pmi-table` in `proof.css`. It is kept as an exact
mirror so that removing 119 `<link>` tags can be its own reviewable change.

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

**Commercial figures are the business's to state, not ours to infer.** Prices already have a whole
pipeline built on that; size and stock ranges are the same claim in a less obvious place. Copying
"14 mm to 300 mm" off the neighbouring grade's page because a new page needs a Size Range row
publishes a supply commitment nobody made. Where neither mill publishes a range and the business
has not given one, the row says so — the three Sanicro 35 pages read "quoted against the mill
programme in force at the time of enquiry", which is true and answerable, and the real ranges
replace it when someone who knows them supplies them.
