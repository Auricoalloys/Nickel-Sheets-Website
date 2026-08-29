# Powder technical data sheets

Seventeen grade data sheets, generated from one source file.

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
- **Which cuts a grade is sold in** → add `cuts: ['15–53', '45–105']` to that grade. Without
  it the grade falls back to `DEFAULT_CUTS`. See below.
- **A cut that does not exist yet** → add it to `CUT_SPECS` with its typical D10/D50/D90 and
  flow, then name it in whichever grades offer it.
- **A new grade** → append to `GRADES` and add its code to `ORDER_CODES`. The build refuses
  to run if a grade has no order code, because a sheet without one is not orderable.
- **Contact details, packaging, storage, safety** → `COMPANY`, `HANDLING`, `SAFETY_*`.
- **Any content change** → bump `REVISION`. The date is what a reader checks the sheet's age
  against, and a revision that does not move is worse than no revision at all.

## Size cuts are per grade

The distribution a cut yields is nearly grade-independent — a 15–53 µm cut of In625 and of
SS316L land within a micron or two — so `CUT_SPECS` defines D10/D50/D90 and flow once per cut.

**Which** cuts a grade is offered in is a different question, and it is not uniform. It is also
the one thing here that cannot be derived from a standard: it lives in the stock records.

That answer goes in **`cuts.csv`** — open it in Excel, put `Y` where a grade is offered in a
cut, save as CSV, regenerate. The build reads it straight through, so the answer is given once
and never retyped into `data.mjs`, which is where transcription errors come from.

```bash
node docs/powder-datasheets/build.mjs --matrix
```

prints the grade × cut grid and marks every grade still on the placeholder with
`← PLACEHOLDER`. The marks in `cuts.csv` ship **deliberately blank**: a grade with no marks
falls back to `DEFAULT_CUTS` and reports as unconfirmed, which is honest. Prefilling it would
have dressed a guess as a stock record.

Cut columns in the CSV use plain hyphens (`15-53`); they map to the en-dash keys of
`CUT_SPECS` on the way in, because a spreadsheet round-trip is no place to depend on an
en-dash surviving. A column heading that is not a known cut stops the build and says so.

`DEFAULT_CUTS` is the flyer's five. The brochure lists eight — it adds 15–45, 20–63 and 53–105 —
and the two documents disagree with each other. The brochure also contains three typos: titanium
reads `23–63` and repeats `53–150` where every other family reads `53–105`, and nickel reads
`15–63`. The smaller list is the deliberate default, because listing a cut that turns out not to
exist costs more than omitting one that does, and the sheet already says other cuts can be
classified to order.

Cuts are written with an **en-dash** (`15–53`), not a hyphen. They look nearly identical and a
hyphen would silently render an empty row, so the build rejects an unrecognised cut rather than
producing one.

## Other notes

Apparent and tap density are derived from each alloy's solid density rather than typed per
grade, so the two can never contradict each other. Order codes replace the stock numbers on
the old sheets, which are the supplying mill's internal codes and named the source to every
customer who read one. Neither the mill's name nor its stock-number prefix belongs anywhere in
this repository — it is public, so writing either one publishes it.

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
