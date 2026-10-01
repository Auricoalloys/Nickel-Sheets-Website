# Content enrichment plan: Inconel, Titanium, Hastelloy, Incoloy, Duplex, nickel strips

**Status, 2026-10-01: the parts that need no outside source are done and published. The
rest still waits on network access to the mills' sites and on facts from the business;
see Progress below.** Parked on 2026-09-27.
The owner asked for these six families to be made the site's strongest search and
AI-answer pages, with applications added and the overview pages made substantive.

Decisions the owner made on 2026-09-27:

- **Scope:** the family and grade overview pages, plus 3-4 new application guides.
  Product (sheet/plate/bar) pages are out of scope for this pass.
- **Sources:** mill documents only, per CLAUDE.md's "Application guides select a
  grade, and every claim names the producer". The owner will allow the mill domains
  in the environment's network settings. Web-search summaries are not a source.

## Progress (2026-10-01)

Done and published to `main`:

- **Step 3, the misplaced overviews.**
  - `/nickel-200-201/` is the Nickel 200 / 201 overview: one identity table per grade
    (`COMBINED` in `build-grades.mjs`) and one specification table with a column per
    grade (`PAIR_HUBS` in `build-specs.mjs`).
  - `/duplex-steel/duplex/` was a second duplex wire page. It is retired into
    `/wire/duplex-steel/`, which carries it as `redirect_from`, and the header's "All
    Duplex Grades" goes to `/duplex-steel/`.
  - `/inconel/X-750/` is built. The plates page moved to `/inconel/X-750/plates/`, and
    the plate and coil pages no longer cite ASTM B637, a bar standard, for flat product.
- **Step 2, the quotable openings.** 51 grade hubs open with who supplies the grade, in
  which forms and from where, built from each page's own closing sentence and forms
  list, with no new claim:
  - Inconel 600, 601, 617, 625, 686, 690, 693, 718, 725, 783 and the new X-750
  - Titanium Grades 1-7, 9, 11, 12, 16, 23 and the five alloy hubs
  - Hastelloy B-2, B-3, C-2000, C-22, C-276, C-4, G-30, N, X
  - Incoloy 660, 800, 800H, 800HT, 825, 890, 903, 909, 925, 945, Alloy 330 / DS
  - Duplex 2205, 32750, 32760
  - Headings that carried a UNS or ASTM number now name the grade.
  - `/titanium/grade-1/` moved onto the layout its siblings use.
  - 62 pages that a template had lowercased ("inconel 740h") have their capitals back.
- **Inconel 625 LCF, 740H and 751** already opened with the sentence. Each says "from
  stock in Mumbai", which waits on the owner (see below).

Still blocked:

- **Step 1 and the rest of step 2** (sourced applications, "which grade to choose") and
  **step 4** (the guides) need the mills' sites. On 2026-10-01 every mill domain still
  failed with `CONNECT tunnel failed, response 403`.
- **The nickel-strip hub and guide** need the business's strip facts, under
  Prerequisites 2.

Found on the way, waiting on a source or the owner:

- **Ti-6-2-4-2 states two service temperatures.** The overview, from ATI's data sheet,
  says long-term stability "up to 425 °C (800 °F)". The Key Properties line says "Used
  to around 540 °C, the upper end for titanium in engine service", with no source. Read
  ATI's sheet: one of them goes or is qualified.
- **Stock claims to confirm.**
  - "Ex-stock" is on 240 pages: in the metadata of 237, in visible text on 19. 92 of the
    240 are in these five directories.
  - "From ready stock in Mumbai" is on 58 pages, most of them form hubs.
  - The three Inconel hubs above say "from stock in Mumbai".
  - Ask which grades are held, not whether the sentence reads well. "Supplied from
    Mumbai" is the wording where the answer is no (CLAUDE.md, the Waspaloy note).
- **Titanium Grade 1's sheet range** (0.5-100 mm thick, 1000-3000 x 2000-6000 mm) left
  the hub, which nested it under the sheet link. The sheet page itself says 0.2-10 mm.
  If the business's real range differs, the sheet page is where it belongs.

## Prerequisites (check all three before starting)

1. **Network access to the mills.** Allow these in the cloud environment's settings
   (environment menu in the session title bar, then Edit, then Network access):
   `specialmetals.com`, `haynesintl.com`, `atimaterials.com`, `timet.com`,
   `outokumpu.com`, `alleima.com`, `vdm-metals.com`.
   - Test: `curl -sS -o /dev/null -w "%{http_code}\n" https://www.specialmetals.com/`
     must print a real status. `000` means it is still blocked.
   - A settings change may only reach sessions started after it.
2. **Facts only the business can supply.** Do not infer these; CLAUDE.md's
   "Commercial figures are the business's to state" applies.
   - Nickel strip: thicknesses and widths supplied, the Ni 200 / Ni 201 / N6 purity
     options, plated or bare, minimum order and dispatch time.
   - For every grade in these families: held in stock, or sourced to order. The pages
     must not say "ex-stock" where it isn't true (see the Waspaloy note in CLAUDE.md).
3. **The 2026-09-27 enquiry/search batch is merged first.** Done: it reached `main` on
   2026-10-01, quote block and all.

## What the survey found (2026-09-27)

Visible words inside `<main>` per overview page; `*` marks a page with FAQPage markup.

- **duplex-steel**: 2205 373, 32750 338, 32760 257, duplex 652
- **hastelloy**: B2 341, B3 307, C2000 340, C22 360, C276 431, C4 334, G30 321, N 278, X 344
- **incoloy**: 660 306, 800 357, 800H 345, 800HT 321, 825 364, 890 304, 903 268, 909 262, 925 266, 945 252, DS 451
- **inconel**: 600 359, 601 311, 617 292, 625 355, 625LCF 529*, 686 331, 690 339, 693 259, 718 355, 725 235, 740H 375*, 751 440*, 783 227
- **titanium**: grade-1 339, grade-2 361, grade-3 242, grade-4 245, grade-5 283, grade-6 184, grade-7 352, grade-9 283, grade-11 389, grade-12 365, grade-16 302, grade-23 263, ti-5-2-4-4 263, ti-6-2-4-2 289, ti-6-6-2 253, ti-6al-7nb 287, ti-8-1-1 269
- **pure-nickel-strip**:
  - 18650 1912, 18650-H-type 2088, 18650-honeycomb 1301, 18650-zigzag 1295
  - 21700 878, 21700-H-type 965, 21700-honeycomb 925, 21700-zigzag 844
  - 26650 833, 26650-H-type 1069, 26650-honeycomb 831, 26650-zigzag 1071
  - 32140-H-type 996, 32140-honeycomb 907, 32140-zigzag 1062
  - 32650 1030, 32650-H-type 1041, 32650-honeycomb 1049, 32650-zigzag 1099
  - 4680 491*
  - 1P-6P 577* each
- **family hubs**: /inconel/ 552, /hastelloy/ 492, /incoloy/ 522, /titanium/ 801, /duplex-steel/ (see above), /nickel-200-201/ 1394

What those numbers mean:

- **The grade overview pages are thin.** Sitewide, 50 of 97 grade hubs are under 300
  words. Their "Applications" sections are a few generic lines with no source.
- **The openings are not quotable.**
  - Only 13 of 93 grade hubs open with who supplies what, from where.
  - 29 open with a single product form. `/inconel/625/` opens on plates and ASTM B443,
    a plate standard.
  - The right sentence ("Aurico Alloys LLP supplies Inconel 625 across all the forms
    above") exists, but it closes 52 hubs instead of opening them.
- **Three overview URLs carry a different page:**
  - `/nickel-200-201/` is headed "Premium Nickel 200 / 201 Round Bars Supplier in India".
  - `/duplex-steel/duplex/`, the header's "All Duplex Grades" link, is a duplex wire page.
  - `/pure-nickel-strips/` has 227 words and no heading.
- **Inconel X-750 has no overview.** Its file, `inconel/X-750.html`, is published at
  `/inconel/x-750/plates/`, and its form pages mix `/X-750/` and `/x-750/`.
- **Near-duplicates:**
  - `/pure-nickel-strip/1P/` to `/6P/` are 577 words each, with 15 pairs at
    0.71-0.76 Jaccard (5-word shingles).
  - The Ti-6-2-4-2 form siblings are 0.84-0.88.

## The plan

### 1. Sourced application data: `docs/applications.csv` and `docs/build-applications.mjs`

This is the same pattern as `prices.csv`, `specs.csv` and `grades.csv`: one file of
truth, a generator, and a CI `--check`. Nothing gets typed onto pages by hand.

- **Columns:** `family, grade, industry, application, why, source, quote, checked`.
  - `why` is the property the mill says drives the use.
  - `source` is the document title, publisher and URL.
  - `quote` is the verbatim sentence the row rests on.
- **Keys:** identical to `grades.csv` and `specs.csv`, keyed on `(family, grade)`.
- **Publication gate:** a row publishes only with a `checked` date and a real `source`,
  the same gate as `grades.csv`.
- **What the generator writes, between markers:**
  - an "Applications" section on each grade hub, grouped by industry, with a source
    caption
  - an "Applications by industry" matrix on each family hub: industry to grades,
    linked to the grade hubs
- **CLAUDE.md conventions:**
  - the CRLF idiom
  - `--check` writes nothing and fails on drift
  - every skip reported by reason
  - `_config.yml` exclusions in the same commit
  - a CI step, with the script in both path lists
- **Where to read:**
  - Start from the document `grades.csv`'s `source` column already names for each grade.
  - Read the mill's label for each use, not the heading the list sits under.
  - A bulletin's silence is not a denial. Find the document that does say it (e.g. the
    Special Metals aqueous-corrosion handbook for Monel 400 and alkalis).

### 2. Overview pages (about 65 grade hubs and 6 family hubs)

Keep CLAUDE.md's hub rule: an overview is not a copy of one of its forms. Chemistry,
mechanical properties and size ranges stay on the form pages.

Each grade hub gets:

- **A quotable opening:** who supplies the grade, in which forms, from where. Build it
  from the page's own closing sentence and forms list; no new claims.
- **Applications by industry** (generated, from step 1).
- **"Which grade to choose":** against its siblings, and only where the producer
  published the comparison or ranking. See the acid/alkali guide's notes on Haynes and
  Special Metals rankings.
- **The forms available**, and the generated specs and identity tables, which already
  exist.
- **3-5 FAQs with FAQPage markup.** Answers come from the same sources and from facts
  the site already states (EN 10204 3.1 certificates, export).

Family hubs get the generated industry matrix and a short "choosing a grade" section,
linked to the new guides.

### 3. Fix the misplaced overviews

- **`/nickel-200-201/`:** make it the Nickel 200/201 overview. Move the round-bar
  content to `/nickel-200-201/round-bar/`, checking the `published: false` twin that
  also claims that permalink.
- **`/duplex-steel/duplex/`:** make it the duplex family overview the header promises,
  and move the wire content to a wire URL with a redirect.
- **`/pure-nickel-strips/`:** give it a heading and real content as the nickel-strip
  hub, or retire it into
  `/pure-nickel-strips-&-busbar-manufacturer-supplier-exporter-in-mumbai-india/` with a
  redirect.
- **Build `/inconel/X-750/`.**
  - Move the plates page to `/inconel/X-750/plates/`, with `redirect_from` covering
    the lowercase URL.
  - Rerun `build-breadcrumbs.mjs`.
- **Before creating any URL**, run the three cheap tests in CLAUDE.md's "A 'missing'
  form page may be a retired one".

### 4. New application guides (3-4)

Model them on `acid-alkali-service.html` (`/alloys-for-acid-and-alkali-service/`).

- **Every claim names its producer.** Never put two producers' numbers in one table.
- **Inbound links:** each hub a guide names links to it with one sentence of that
  grade's own fact, not the same line repeated N times.

The guides:

- **Nickel strip for battery packs** (18650 / 21700 / 26650 / 32140 / 32650 / 4680):
  - what pure nickel strip does in a pack
  - the strip shapes: H-type, zig-zag, honeycomb, 1P-6P
  - choosing a strip, using only the business's figures
  - Decide whether the near-duplicate 1P-6P pages fold into this guide or into one
    configuration page, with redirects.
- **Alloys for seawater, offshore and desalination:** duplex 2205, super duplex
  2507/32760, Inconel 625, Hastelloy C-276, Titanium Grade 2. Only producer-published
  data and rankings.
- **High-temperature and furnace alloys:** Inconel 600/601/617, Incoloy 800H/800HT,
  Alloy 330 / Incoloy DS, Hastelloy X.
- **Optional fourth:** titanium for chemical-plant heat exchangers, or aerospace
  alloys. Only if the sources support a page that is not a thinner copy of the hubs.

### 5. Verification before anything publishes

- **Fact check:** an independent agent re-opens each source and confirms every row's
  quote and every claim in the prose. Unconfirmed claims come out rather than being
  softened.
- **Automated checks:**
  - every `--check`
  - `python3 tools/seo_audit.py --fail-on-new`
  - `node docs/check-tags.mjs` and `node docs/check-tables.mjs`
  - a local build with `bash docs/build-local.sh`
- **Duplication check:** a 5-word-shingle similarity check on the new text, so no two
  hubs share boilerplate paragraphs. That near-duplicate pattern is what put 132 pages
  in "Crawled - currently not indexed".
- **Commits:** content commits per family. They are content, so the sitemap dates them.
  Regenerate `sitemap.xml` only from a full clone (`git fetch --unshallow` first).
- **`llms.txt`:** update it for the new guides, and run `node docs/check-llms-txt.mjs`.

## Other items parked from the same audit (need the owner's input)

- **Prices.** Re-quote before they expire on 2026-11-27. 279 pages are still unpriced
  (`prices-todo.csv`).
- **Buyer facts.**
  - Minimum order is on 5 of 495 product pages, and no page states a lead time.
  - 100 pages promise a reply the "same working day"; the form says "within one
    working day".
- **Contact details disagree.**
  - The footer, structured data and `llms.txt` read "Aman Grih, Carpenter 1st Street,
    C.P. Tank".
  - The contact page reads "Aman Griha, 1st Carpenter St, Charni Road East".
  - Every footer lists two Gmail addresses.
  - The owner decides the single address string and email.
- **"Manufacturer" claims.**
  - About 270 pages' JSON-LD, about 230 spec-table rows and `llms.txt` line 3 call
    Aurico the manufacturer.
  - The footer says "independent stockist, not affiliated".
  - `build-prices.mjs` hangs offers off the `manufacturer`/`brand` keys, so re-anchor
    it before removing them.
- **Location pages.** The 97 location pages repeat one sentence fragment in every row
  of their "Grades specified in X" table.
- **Specifications.** 15 grades have no specification table.
- **Image branch.** `claude/vigilant-swanson-20d0f4`, which fixes images that name the
  wrong alloy, was merged in `01b6cdd1`.
