# Powder technical data sheets

Sixteen grade data sheets, generated from one source file.

```bash
node docs/powder-datasheets/build.mjs
```

Writes `sheets/<grade>.html`. Open one in a browser and print to PDF — **A4, margins
"Default", background graphics ON** — to get the customer-facing document. The CSS is
inlined, so a sheet can be emailed or zipped on its own and still render.

```bash
node docs/powder-datasheets/build.mjs --check
```

Reports drift and exits non-zero without writing, matching the other generators in `docs/`.

## A data sheet is not a Certificate of Analysis

This is the distinction the whole folder exists to enforce.

|                | Technical Data Sheet          | Certificate of Analysis        |
| -------------- | ----------------------------- | ------------------------------ |
| Scope          | a grade and size cut          | one lot                        |
| Chemistry      | specification limits          | measured values                |
| Lot number     | absent, deliberately          | mandatory                      |
| Signed         | revision number and date      | chemist and approver           |
| Where it goes  | website, enquiries, catalogue | with the shipment, that lot    |
| Lifespan       | until the specification changes | that lot, forever            |

A data sheet promises a range, so every conforming lot satisfies it and it cannot go stale.
A lot report handed out as a data sheet is a representation about material you may no longer
hold — the CP-Ti and Ti64 sheets in `D:\SHARING AURICO\Metal Powder Data\Data Sheets\` carry
lot codes from February and April 2024 and were still being sent out as current in 2026.

**Never publish a Certificate of Analysis here.** It is a shipment document.

## Editing

Everything lives in `data.mjs`. Nothing in `sheets/` is hand-editable — it is overwritten on
every run.

- **A specification limit changed** → edit that grade's `chemistry.rows`, re-run.
- **A new size cut** → add it to `CUTS`. It appears on all sixteen sheets at once.
- **A new grade** → append to `GRADES` and add its code to `ORDER_CODES`. The build refuses
  to run if a grade has no order code, because a sheet without one is not orderable.
- **Contact details, packaging, storage, safety** → `COMPANY`, `HANDLING`, `SAFETY_*`.
- **Any content change** → bump `REVISION`. The date is what a reader checks the sheet's age
  against, and a revision that does not move is worse than no revision at all.

Apparent and tap density are derived from each alloy's solid density rather than typed per
grade, so the two can never contradict each other. Order codes replace the `SMN/54/...` stock
numbers on the old sheets, which are the supplying mill's internal codes and named the source
to every customer who read one.

## Why generated rather than hand-written

The five PDFs this replaces were each maintained by hand, and drifted exactly as you would
expect:

- The CP-Ti oxygen limit reads `0.015 %` on the Aurico sheet and `0.15 %` on the RSH sheet,
  for the same material. The first is a typo that leaves the sheet failing its own
  specification by a factor of 6.6 against its own measured value.
- The CP-Ti 15–53 µm plasma-atomised sheet and the CP-Ti 45–105 µm gas-atomised sheet carry
  byte-identical chemistry — the same six figures. Two lots from two atomisation routes
  cannot do that.
- The Ti64 sheet claims Grade 23 / ELI conformance while listing Grade 5 limits for aluminium,
  iron and hydrogen.
- Three different document titles across five documents.

None of those are possible here: each fact is written once.

## Not published

`docs/powder-datasheets` is excluded in `_config.yml`. The sheets carry no Jekyll front matter,
so `build-sitemap.mjs` already skips them, but without the exclusion Jekyll would still copy
them into `_site` and serve them at a URL nothing links to. Removing that one line is all it
takes to put them on the site — do it deliberately, and regenerate the sitemap and search index
afterwards.
