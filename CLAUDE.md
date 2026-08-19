# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The Aurico Alloys LLP marketing site (www.nickelsheets.com) — a Jekyll site of ~750 hand-written
HTML pages for a nickel/titanium/duplex/cobalt alloy stockist. GitHub Pages builds and deploys it
straight from `main`; there is no CI workflow, no bundler, and no test suite. Pushing to `main`
publishes.

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
Jekyll. Five generators exist and must be run **by hand**, then committed like any other source:

```bash
node docs/build-sitemap.mjs            # after adding/removing/renaming/editing a page
node docs/build-search-index.mjs       # after adding/removing/renaming/retitling a page
node docs/build-prices.mjs             # after editing prices.csv
node docs/purge-bootstrap.mjs          # after using a Bootstrap component the site did not use before
node docs/powder-datasheets/build.mjs  # after editing docs/powder-datasheets/data.mjs
```

`build-sitemap`, `build-search-index`, `build-prices` and `powder-datasheets/build` all take
`--check`, which reports drift and exits non-zero without writing. CI runs the price check on every
pull request, because a price the HTML no longer matches is worse than no price at all.

Both live in `docs/` and are excluded from the build in `_config.yml`. Only the purge script needs
npm (`purgecss@7`); the sitemap script is plain Node.

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

The banner heading is the page's `<h1>`: `<h1 id="banner-title" class="banner-title">` inside the
`<figure>` in `.flat-banner`. It used to be a `<figcaption>`, which left 205 pages with no `<h1>` at
all. Copy the `<h1>` form. `.banner-title` carries `margin: 0` in all three stylesheets that define
it precisely because it is now a heading — do not remove that.

The JSON-LD on ~547 product pages contains an `offers` block with **no `price`**, which is invalid:
Google requires `price` or `priceSpecification` whenever `offers` is present, so none of those pages
are eligible for product rich results. Do not "fix" it by inventing a price — marking up a price that
is not visible on the page violates Google's structured data policy and risks a manual action. Either
remove `offers`, or publish a real price on the page and mark up what is shown.

`permalink: pretty` is set globally. URLs follow alloy → grade → form:
`/inconel/` (family hub), `/inconel/600/` (grade), `/inconel/600/coil/` (form factor). A minority of
older pages use flat SEO permalinks instead (e.g. `/inconel-600-601-617-foil-supplier-...`); leave
those alone — they are indexed.

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

`priceValidUntil` is derived from the `# updated:` line plus 45 days, so a monthly update that slips
expires quietly instead of going on asserting a stale figure. Google uses a price only while it
trusts it, the same way it treats `<lastmod>` — and loses trust the same way.

INR drives the schema. USD appears on the page as indicative only: two currencies in the markup means
two prices that drift apart when the rate moves, and Google picks between them unpredictably. Update
both columns together.

### Powder data sheets are generated, and are not Certificates of Analysis

`docs/powder-datasheets/` holds sixteen metal powder grade data sheets generated from
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

`--check` reports drift and exits non-zero without writing, for whenever this repo gets CI.

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

### JavaScript inventory

`floating-form.js` (every page, via footer) and `detailed.js` (~650 pages — TOC toggles, smooth
anchor scroll, scroll-up button) are the live ones. `script.js` (mobile nav, language switcher,
homepage marquee) is loaded only by `index.html`. `google-auth.js` and `detailed_database_page.js`
are referenced by no page. `javascript/translations/translations.js` is empty and no `<lang>.json`
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
