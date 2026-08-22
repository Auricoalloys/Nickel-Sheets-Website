// Writes the particle size cut lists onto the powder pages, from cuts.csv.
//
//   node docs/build-cuts.mjs           write the cut lists into the pages
//   node docs/build-cuts.mjs --check   report drift, write nothing, exit 1
//
// Run it after editing docs/powder-datasheets/cuts.csv and commit the result,
// exactly like docs/build-specs.mjs. This script is excluded from the published
// site in _config.yml; the pages it edits are not.
//
// Why this exists: which cuts a grade is sold in lives in cuts.csv, and it is
// NOT uniform - that is the entire reason the file exists. But every family and
// grade powder page had the same five cuts typed into it by hand, taken from
// DEFAULT_CUTS, which is the flyer's placeholder list rather than a stock
// record. So the pages all recited the same answer whether or not it was true:
//
//   - /aluminium/alsi10mg/powder/ carried "20-63 µm" in its <title> and the
//     five default cuts in its body, which do not include 20-63. The page
//     contradicted itself.
//   - /cobalt-alloys/cocrmo/powder/ recited 5-25 µm, which CoCrMo is not sold
//     in; its fine cut is 10-30.
//
// Same failure as prices before prices.csv and specs before specs.csv: one
// fact, retyped onto fifteen pages, drifting. Generating it means a cut list
// can only ever say what the stock record says.
//
// No marker comments here, unlike build-specs.mjs. The list appears up to seven
// times per page - JSON-LD description, additionalProperty, FAQ answer text,
// meta description, lead paragraph, spec table row, accordion body - and three
// of those are inside JSON string literals where an HTML comment would be
// invalid. So the script recognises a cut list by its shape and rewrites it in
// place, wherever it sits.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CUT_SPECS, DEFAULT_CUTS } from './powder-datasheets/data.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSV = path.join(ROOT, 'docs', 'powder-datasheets', 'cuts.csv');
const CHECK = process.argv.includes('--check');

// Pages use plain hyphens ("15-53 µm"); CUT_SPECS is keyed by en-dash.
const plain = k => k.replace(/–/g, '-');
const ORDER = Object.keys(CUT_SPECS);

// Which grade slugs each page speaks for. A family hub sells every grade under
// it, so its list is the union - a cut offered in any one of them is offered on
// that page. Stated here rather than derived from the path, because the mapping
// is not regular: /tool-steel/maraging/ is the grade whose slug is maraging-ms1,
// and Grade 5 and Grade 23 are two pages backed by one data sheet.
const PAGES = {
  'inconel/718/powder.html': ['inconel-718'],
  'inconel/625/powder.html': ['inconel-625'],
  'stainless/316l/powder.html': ['ss316l'],
  'stainless/17-4-ph/powder.html': ['17-4ph'],
  'tool-steel/h13/powder.html': ['h13'],
  'tool-steel/maraging/powder.html': ['maraging-ms1'],
  'cobalt-alloys/cocrmo/powder.html': ['cocrmo'],
  'titanium/grade-5/powder.html': ['ti6al4v'],
  'titanium/grade-23/powder.html': ['ti6al4v'],
  'aluminium/alsi10mg/powder.html': ['alsi10mg'],
  'inconel/powder.html': ['inconel-625', 'inconel-718'],
  'stainless/powder.html': ['ss316l', '17-4ph'],
  'titanium/powder.html': ['ti6al4v', 'cp-titanium-grade-2'],
  'tool-steel/powder.html': ['h13', 'maraging-ms1'],
};

// ---- read the CSV -----------------------------------------------------------
if (!fs.existsSync(CSV)) { console.error('cuts.csv not found'); process.exit(1); }

const marks = {};
{
  const lines = fs.readFileSync(CSV, 'utf8')
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter(l => l.trim() && !l.startsWith('#'));
  const head = lines[0].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
  const cols = head.slice(2).map(c => c.replace(/-/g, '–'));
  for (const line of lines.slice(1)) {
    // Grade names are quoted and may contain commas.
    const cells = line.match(/("([^"]*)"|[^,]*)(,|$)/g).map(c =>
      c.replace(/,$/, '').replace(/^"|"$/g, '').trim());
    const slug = cells[0];
    if (!slug) continue;
    const picked = cols.filter((c, i) => /^(y|yes|x|✓|1)$/i.test((cells[i + 2] || '').trim()));
    if (picked.length) marks[slug] = picked;
  }
}

// A grade with no marks falls back the same way the data sheets do, so a page
// and its sheet can never disagree about what "unconfirmed" means.
const cutsFor = slug => marks[slug] || DEFAULT_CUTS;

function listFor(slugs) {
  const set = new Set();
  for (const s of slugs) for (const c of cutsFor(s)) set.add(c);
  const keys = ORDER.filter(k => set.has(k));
  return keys.length ? keys : null;
}

// ---- recognise a cut list ---------------------------------------------------
// Two or more "<n>-<n> µm" joined by ", " or " &middot; ". Requiring two is what
// keeps it off a single mention - "45-105 µm (EBM and DED) is the most commonly
// ordered" is a different claim and is left alone, as is the "20-63 µm" in the
// AlSi10Mg <title>.
const ITEM = '\\d+-\\d+\\s*µm';
const LIST = new RegExp(`${ITEM}(?:(,\\s*|\\s*&middot;\\s*)${ITEM})+`, 'g');

// ---- apply ------------------------------------------------------------------
let wrote = 0;
const drift = [];
const missing = [];
const untouched = [];

for (const [rel, slugs] of Object.entries(PAGES)) {
  const fp = path.join(ROOT, rel.split('/').join(path.sep));
  if (!fs.existsSync(fp)) { missing.push(rel); continue; }

  const keys = listFor(slugs);
  if (!keys) { missing.push(`${rel}  (no cuts for ${slugs.join(', ')})`); continue; }

  const raw = fs.readFileSync(fp, 'utf8');
  const crlf = raw.includes('\r\n');
  const before = raw.replace(/\r\n/g, '\n');

  let hits = 0;
  const after = before.replace(LIST, (match, sep) => {
    hits++;
    // Keep whichever separator the surrounding copy already used - the spec
    // table reads with &middot;, the prose reads with commas.
    const joiner = sep.includes('&middot;') ? ' &middot; ' : ', ';
    return keys.map(k => `${plain(k)} µm`).join(joiner);
  });

  if (!hits) { untouched.push(rel); continue; }
  if (after === before) continue;

  if (CHECK) { drift.push(`${rel}  (${hits} list${hits === 1 ? '' : 's'})`); continue; }
  fs.writeFileSync(fp, crlf ? after.replace(/\n/g, '\r\n') : after);
  wrote++;
  console.log(`  ${rel}  ${hits} list${hits === 1 ? '' : 's'} -> ${keys.map(plain).join(', ')}`);
}

// ---- report -----------------------------------------------------------------
// A page the script could not find a list in is reported, never guessed at -
// same rule as build-specs.mjs. Silence there would mean a page quietly kept
// whatever it already said.
if (untouched.length) {
  console.error(`\n  No cut list found in ${untouched.length} page(s) - check by hand:`);
  for (const r of untouched) console.error(`    ${r}`);
}
if (missing.length) {
  console.error(`\n  ${missing.length} page(s) not found or with no cuts:`);
  for (const r of missing) console.error(`    ${r}`);
}

if (CHECK) {
  if (drift.length) {
    console.error(`\ncuts drift in ${drift.length} page(s) - run: node docs/build-cuts.mjs`);
    for (const r of drift) console.error(`    ${r}`);
    process.exit(1);
  }
  console.log('\nCut lists are up to date.');
} else {
  console.log(`\nWrote cut lists into ${wrote} page(s).`);
}

// /pages/products/powder/ is deliberately not in PAGES. Its grades table gives
// each grade its own cell with a per-process gloss rather than a flat list, so
// it is hand-maintained - but it makes the same claims. Change a row in
// cuts.csv and check that page too.
