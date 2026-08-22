// Writes published prices into the pages, from prices.csv.
//
//   node docs/build-prices.mjs           write prices into the HTML
//   node docs/build-prices.mjs --check   report drift, write nothing, exit 1
//
// Run it after editing prices.csv and commit the result, exactly like
// docs/build-sitemap.mjs. This script is excluded from the published site in
// _config.yml; the pages it edits are not.
//
// Why a file rather than editing pages by hand: a price on 500 pages that
// nobody can update in one place is a price that goes stale, and Google uses a
// price only while it trusts it - the same lesson the sitemap's lastmod taught
// this repo. One row here is the single source of truth for one page.
//
// Two rules matter more than the rest:
//
//   1. The visible figure and the schema must agree. Marking up a price a
//      reader cannot see breaches Google's structured data policy, so this
//      writes the table row and the AggregateOffer together, from one row, and
//      they cannot drift apart.
//
//   2. No row means no offer. A page absent from the CSV has its offers block
//      removed, not left price-less. An offers block without a price is invalid
//      markup that earns nothing and shows up as an error in Search Console, so
//      dropping a product from the CSV cleans its markup up on the next run.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSV = path.join(ROOT, 'prices.csv');
const CHECK = process.argv.includes('--check');

// How long a published price stays claimable. A quarterly update that slips a
// few weeks then expires quietly, rather than going on asserting a figure from
// six months ago - which is the failure that makes Google stop believing the
// field. Sized to the cadence deliberately: leave it shorter than the gap
// between passes and every price spends the tail of each quarter expired, which
// drops it from the rich result; stretch it well past the gap and a pass nobody
// ran keeps asserting a figure nobody checked.
//
// The published ranges are what make a quarter honest - the median row spans 2x
// low to high, so ordinary movement stays inside the figure already on the page.
// The ~37 rows tighter than 1.5x are the ones to widen or re-quote first; they
// have the least room to absorb a move. Lengthening this past a quarter without
// widening those is how a wrong price gets published.
//
// Kept in step with docs/build-price-worklist.mjs, which mints priceValidUntil
// for adopted rows from the same constant.
const VALID_DAYS = 100;
const SITE = 'https://www.nickelsheets.com';

const SKIP = new Set(['.git', '.vscode', '.claude', 'node_modules', '_site', 'vendor', 'tools', '.bundle', '.github', 'docs']);
function walk(d, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const fp = path.join(d, e.name);
    if (e.isDirectory()) walk(fp, out);
    else if (/\.html?$/i.test(e.name)) out.push(fp);
  }
  return out;
}

// ---- read the CSV -----------------------------------------------------------
if (!fs.existsSync(CSV)) { console.error('prices.csv not found'); process.exit(1); }
const lines = fs.readFileSync(CSV, 'utf8').split(/\r?\n/);
let updated = null;
const rows = new Map();
for (const raw of lines) {
  const line = raw.trim();
  if (!line) continue;
  if (line.startsWith('#')) {
    const m = line.match(/^#\s*updated\s*:\s*(\d{4}-\d{2}-\d{2})/i);
    if (m) updated = m[1];
    continue;
  }
  const c = line.split(',').map(x => x.trim());
  if (c[0].toLowerCase() === 'url') continue;              // header
  const [url, lowInr, highInr, lowUsd, highUsd, unit] = c;
  if (!url || !lowInr || !highInr) continue;
  let u = url;
  if (!u.startsWith('/')) u = '/' + u;
  if (!u.endsWith('/')) u += '/';
  rows.set(u, {
    lowInr: lowInr.replace(/[^0-9]/g, ''), highInr: highInr.replace(/[^0-9]/g, ''),
    lowUsd: (lowUsd || '').replace(/[^0-9]/g, ''), highUsd: (highUsd || '').replace(/[^0-9]/g, ''),
    unit: unit || 'kg',
  });
}
if (!updated) { console.error('prices.csv needs a "# updated: YYYY-MM-DD" line'); process.exit(1); }

const validUntil = (() => {
  const d = new Date(updated + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + VALID_DAYS);
  return d.toISOString().slice(0, 10);
})();

const inr = n => Number(n).toLocaleString('en-IN');

// The punctuation before "quoted" has to follow whether the USD clause is
// there. It ends in a semicolon, so it carries the join itself; without it the
// sentence used to run "per kg. quoted against", starting in lower case. That
// stayed invisible while every row carried USD, and appeared on 46 pages the
// day rows without it were first published.
function priceCell(r) {
  const usd = r.lowUsd && r.highUsd
    ? `. Indicative USD ${r.lowUsd} &ndash; ${r.highUsd} per ${r.unit};`
    : ',';
  return `INR ${inr(r.lowInr)} &ndash; ${inr(r.highInr)} per ${r.unit}${usd}` +
    ` quoted against grade, form, size and quantity.`;
}

// Take the price off a page entirely: the offers block and the visible row.
// Used both when a page has no row at all and when it has one it cannot show,
// because either way what must not remain is an offer the reader cannot see.
function stripOffers(s) {
  return s
    .replace(/,?\n\s*"offers":\s*\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/g, '')
    .replace(/\s*<tr><th[^>]*>Price<\/th><td>[\s\S]*?<\/td><\/tr>/g, '');
}

// ---- apply ------------------------------------------------------------------
let priced = 0, stripped = 0, drift = [], noAnchor = [], noSchemaAnchor = [];

for (const fp of walk(ROOT)) {
  const rel = path.relative(ROOT, fp).split(path.sep).join('/');
  const raw = fs.readFileSync(fp, 'utf8');
  const fm = raw.match(/^﻿?---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!fm || /^published:\s*false/m.test(fm[1])) continue;
  let url = ((fm[1].match(/^permalink:\s*(.+)$/m) || [, ''])[1] || '').trim().replace(/^["']|["']$/g, '');
  if (!url) continue;
  if (!url.endsWith('/')) url += '/';

  const crlf = raw.includes('\r\n');
  let s = raw.replace(/\r\n/g, '\n');
  const before = s;
  const row = rows.get(url);

  if (row) {
    const cell = priceCell(row);

    // The visible figure. Two table shapes carry it: the product pages use
    // class="spec-table", the powder pages a caption ending "key specification".
    // docs/build-specs.mjs owns everything between its markers and rewrites the
    // block wholesale, so a Price row placed in there survives only until the
    // next specs run and then disappears without a word. On the duplex hubs the
    // generated table is the only thing matching "spec-table", so the first
    // </tbody> after it is inside the block - which is exactly where four price
    // rows landed. Treat that as no anchor rather than as a place to write.
    const gs = s.indexOf('<!-- specs:start'), ge = s.indexOf('<!-- specs:end');
    const generated = i => gs > -1 && ge > gs && i > gs && i < ge;

    let shown = false;
    const existing = s.search(/<th[^>]*>Price<\/th><td>/);
    if (existing > -1 && !generated(existing)) {
      // Function replacement: the cell is data, and a bare $ in it would other-
      // wise be read as a backreference. See the same trap in build-price-worklist.
      s = s.replace(/<th([^>]*)>Price<\/th><td>[\s\S]*?<\/td>/, (_, attrs) => `<th${attrs}>Price</th><td>${cell}</td>`);
      shown = true;
    } else {
      let start = s.indexOf('spec-table');
      if (start < 0) {
        const cap = s.match(/<caption>[^<]*key specification<\/caption>/i);
        if (cap) start = s.indexOf(cap[0]);
      }
      let end = start > -1 ? s.indexOf('</tbody>', start) : -1;
      if (generated(end)) end = -1;
      if (end > -1) {
        s = s.slice(0, end) + `<tr><th scope="row">Price</th><td>${cell}</td></tr>\n` + s.slice(end);
        shown = true;
      }
    }

    // The schema only when the reader can see the figure. Marking up a price
    // that is not on the page is the policy breach this whole pipeline exists
    // to avoid, so a page with nowhere to show it gets no markup either - and
    // says so, rather than failing quietly.
    //
    // It has to REMOVE the markup, not merely decline to write it. This used to
    // `continue` straight to the next file, so a page that once had an anchor
    // and lost one kept its offers block and quietly became the invalid state
    // this guard exists to prevent - which is what the four duplex hubs did the
    // moment their price row moved inside the generated specs block.
    if (!shown) {
      noAnchor.push(rel);
      s = stripOffers(s);
    } else {

    s = s.replace(/"@type":\s*"Offer",\n(\s*)/g,
      `"@type": "AggregateOffer",\n$1"lowPrice": "${row.lowInr}",\n$1"highPrice": "${row.highInr}",\n$1"priceValidUntil": "${validUntil}",\n$1`);
    s = s.replace(/("@type":\s*"AggregateOffer",\n)(\s*)(?:"lowPrice":[^\n]*\n\s*"highPrice":[^\n]*\n\s*"priceValidUntil":[^\n]*\n\s*)?/g,
      `$1$2"lowPrice": "${row.lowInr}",\n$2"highPrice": "${row.highInr}",\n$2"priceValidUntil": "${validUntil}",\n$2`);

    // A page priced for the first time - or priced again after a spell with no
    // row - has no offers block to convert, because a page without a row has
    // its offers removed. Put one into the Product node so the schema can come
    // back rather than the figure showing with no markup behind it.
    //
    // The insertion needs a sibling key to hang off. "manufacturer" was the only
    // one it looked for, and nine pages - the nickel-strip busbars, 625LCF, the
    // 200/201 foil - carry "brand" instead, so they took the visible price and
    // no markup: priced on the page, invisible to the rich result the pricing is
    // for. Try each known sibling in turn.
    if (/"@type":\s*"Product"/.test(s) && !/"offers"/.test(s)) {
      const offers = (indent) =>
        `,\n${indent}"offers": {\n${indent}  "@type": "AggregateOffer",\n${indent}  "lowPrice": "${row.lowInr}",\n` +
        `${indent}  "highPrice": "${row.highInr}",\n${indent}  "priceValidUntil": "${validUntil}",\n` +
        `${indent}  "url": "${SITE}${url}",\n${indent}  "availability": "https://schema.org/InStock",\n` +
        `${indent}  "priceCurrency": "INR",\n${indent}  "seller": {\n${indent}    "@type": "Organization",\n` +
        `${indent}    "name": "Aurico Alloys LLP"\n${indent}  }\n${indent}}`;
      for (const key of ['manufacturer', 'brand']) {
        const re = new RegExp(`(\\n(\\s*)"${key}":\\s*\\{(?:[^{}]|\\{[^{}]*\\})*\\})`);
        if (!re.test(s)) continue;
        s = s.replace(re, (whole, _block, indent) => whole + offers(indent));
        break;
      }
      if (!/"offers"/.test(s)) noSchemaAnchor.push(rel);
    }
    priced++;
    }
  } else {
    // no row: an offers block with no price is invalid, so remove it entirely
    if (/"offers":\s*\{/.test(s)) stripped++;
    s = stripOffers(s);
  }

  if (s !== before) {
    if (CHECK) drift.push(rel);
    else fs.writeFileSync(fp, crlf ? s.replace(/\n/g, '\r\n') : s);
  }
}

if (CHECK) {
  if (drift.length) {
    console.error(`prices are STALE in ${drift.length} page(s) - run: node docs/build-prices.mjs`);
    drift.slice(0, 10).forEach(d => console.error('   ' + d));
    process.exit(1);
  }
  console.log(`prices are current (${rows.size} priced pages, valid until ${validUntil})`);
  process.exit(0);
}

console.log(`prices written from prices.csv (updated ${updated})`);
console.log(`  priced pages          : ${priced}`);
console.log(`  offers removed        : ${stripped}`);
console.log(`  priceValidUntil       : ${validUntil}  (${VALID_DAYS} days after the update)`);
if (noAnchor.length) {
  console.log(`  nowhere on the page to show the price (${noAnchor.length}) - skipped, no markup written:`);
  noAnchor.forEach(x => console.log('     ' + x));
}
// The reverse failure: the figure is on the page but no sibling key in the
// Product node to hang offers off, so it earns no rich result. Harmless to a
// reader and invisible without this line, which is how nine of them went unnoticed.
if (noSchemaAnchor.length) {
  console.log(`  price shown but no schema anchor (${noSchemaAnchor.length}) - Product node has no manufacturer or brand:`);
  noSchemaAnchor.forEach(x => console.log('     ' + x));
}
