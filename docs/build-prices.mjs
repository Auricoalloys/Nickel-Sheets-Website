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

// How long a published price stays claimable. A monthly update that slips a few
// weeks then expires quietly, rather than going on asserting a figure from six
// months ago - which is the failure that makes Google stop believing the field.
const VALID_DAYS = 45;
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

function priceCell(r) {
  const usd = r.lowUsd && r.highUsd
    ? ` Indicative USD ${r.lowUsd} &ndash; ${r.highUsd} per ${r.unit};`
    : '';
  return `INR ${inr(r.lowInr)} &ndash; ${inr(r.highInr)} per ${r.unit}.${usd}` +
    ` quoted against grade, form, size and quantity.`;
}

// ---- apply ------------------------------------------------------------------
let priced = 0, stripped = 0, drift = [], noAnchor = [];

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
    let shown = false;
    if (/<th[^>]*>Price<\/th><td>/.test(s)) {
      s = s.replace(/<th([^>]*)>Price<\/th><td>[\s\S]*?<\/td>/, `<th$1>Price</th><td>${cell}</td>`);
      shown = true;
    } else {
      let start = s.indexOf('spec-table');
      if (start < 0) {
        const cap = s.match(/<caption>[^<]*key specification<\/caption>/i);
        if (cap) start = s.indexOf(cap[0]);
      }
      const end = start > -1 ? s.indexOf('</tbody>', start) : -1;
      if (end > -1) {
        s = s.slice(0, end) + `<tr><th scope="row">Price</th><td>${cell}</td></tr>\n` + s.slice(end);
        shown = true;
      }
    }

    // The schema only when the reader can see the figure. Marking up a price
    // that is not on the page is the policy breach this whole pipeline exists
    // to avoid, so a page with nowhere to show it gets no markup either - and
    // says so, rather than failing quietly.
    if (!shown) { noAnchor.push(rel); continue; }

    s = s.replace(/"@type":\s*"Offer",\n(\s*)/g,
      `"@type": "AggregateOffer",\n$1"lowPrice": "${row.lowInr}",\n$1"highPrice": "${row.highInr}",\n$1"priceValidUntil": "${validUntil}",\n$1`);
    s = s.replace(/("@type":\s*"AggregateOffer",\n)(\s*)(?:"lowPrice":[^\n]*\n\s*"highPrice":[^\n]*\n\s*"priceValidUntil":[^\n]*\n\s*)?/g,
      `$1$2"lowPrice": "${row.lowInr}",\n$2"highPrice": "${row.highInr}",\n$2"priceValidUntil": "${validUntil}",\n$2`);

    // A page priced for the first time - or priced again after a spell with no
    // row - has no offers block to convert, because a page without a row has
    // its offers removed. Put one into the Product node so the schema can come
    // back rather than the figure showing with no markup behind it.
    if (/"@type":\s*"Product"/.test(s) && !/"offers"/.test(s)) {
      s = s.replace(/(\n(\s*)"manufacturer":\s*\{(?:[^{}]|\{[^{}]*\})*\})/,
        `$1,\n$2"offers": {\n$2  "@type": "AggregateOffer",\n$2  "lowPrice": "${row.lowInr}",\n` +
        `$2  "highPrice": "${row.highInr}",\n$2  "priceValidUntil": "${validUntil}",\n` +
        `$2  "url": "${SITE}${url}",\n$2  "availability": "https://schema.org/InStock",\n` +
        `$2  "priceCurrency": "INR",\n$2  "seller": {\n$2    "@type": "Organization",\n` +
        `$2    "name": "Aurico Alloys LLP"\n$2  }\n$2}`);
    }
    priced++;
  } else {
    // no row: an offers block with no price is invalid, so remove it entirely
    const had = /"offers":\s*\{/.test(s);
    if (had) {
      s = s.replace(/,?\n\s*"offers":\s*\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/g, '');
      stripped++;
    }
    if (/<th[^>]*>Price<\/th><td>/.test(s)) s = s.replace(/\s*<tr><th[^>]*>Price<\/th><td>[\s\S]*?<\/td><\/tr>/g, '');
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
