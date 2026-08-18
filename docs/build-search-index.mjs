// Builds search-index.json, which powers the header search box.
//
// The site has ~750 pages and no way to search them: a visitor who wants
// "Hastelloy C276 tube" has to walk the Materials dropdown three levels deep and
// guess which family it sits under. This emits one small record per page so the
// lookup can happen in the browser with no third-party origin and no runtime
// dependency, the way everything else on this site works.
//
//   node docs/build-search-index.mjs           write search-index.json
//   node docs/build-search-index.mjs --check   report drift, write nothing, exit 1
//
// Run it after adding, removing, renaming or retitling a page, and commit the
// result - exactly like docs/build-sitemap.mjs. This script is excluded from the
// published site in _config.yml; the JSON it writes is not.
//
// Indexability follows the same rules as the sitemap, read from the same
// sources, so a page can never be blocked from crawlers yet offered in search.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'search-index.json');
const CHECK = process.argv.includes('--check');
const read = f => fs.readFileSync(f, 'utf8');

const SKIP_DIRS = new Set(['.git', '.vscode', '.claude', 'node_modules', '_site', 'vendor', 'tools', '.bundle', '.github', 'docs']);

// robots.txt is the authority on what may be advertised, same as the sitemap
const disallowed = read(path.join(ROOT, 'robots.txt'))
  .split('\n')
  .map(l => l.match(/^\s*Disallow:\s*(\S+)/i))
  .filter(Boolean).map(m => m[1]);
const isDisallowed = u => disallowed.some(d => u.startsWith(d));

function walk(d, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const fp = path.join(d, e.name);
    if (e.isDirectory()) walk(fp, out);
    else if (/\.html?$/i.test(e.name)) out.push(fp);
  }
  return out;
}

const dec = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&nbsp;/g, ' ').replace(/&reg;/g, '®').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

const records = [];
for (const fp of walk(ROOT)) {
  const rel = path.relative(ROOT, fp).split(path.sep).join('/');
  const raw = read(fp);
  const fm = raw.match(/^﻿?---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n/);
  if (!fm) continue;
  const front = fm[1];
  if (/^published:\s*false/m.test(front)) continue;
  if (/^sitemap:\s*false/m.test(front)) continue;
  if (rel.startsWith('html/')) continue;               // runtime fragment, not a page
  let url = (front.match(/^permalink:\s*(.+)$/m) || [, ''])[1].trim().replace(/^["']|["']$/g, '');
  if (!url) continue;
  if (!url.startsWith('/')) url = '/' + url;
  if (!url.endsWith('/') && !/\.\w+$/.test(url)) url += '/';
  if (isDisallowed(url)) continue;

  const title = dec(((raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, ''])[1]).replace(/\s+/g, ' ').trim());
  const desc = dec(((raw.match(/<meta\s+name=["']description["']\s+content=["']([\s\S]*?)["']\s*\/?>/i) || [, ''])[1]).replace(/\s+/g, ' ').trim());
  const h1 = dec(((raw.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [, ''])[1]).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());

  // Extra search keys the visible text does not always spell out: the UNS,
  // Werkstoff and ASTM designations buyers actually type.
  const specs = [...new Set(
    (raw.match(/\b(?:UNS\s+)?[NRSK]\d{5}\b|\b2\.4[0-9]{3}\b|\b1\.4[0-9]{3}\b|\bASTM\s+[AB]\d{2,4}\b/gi) || [])
      .map(s => s.replace(/\s+/g, ' ').toUpperCase())
  )].slice(0, 12);

  records.push({
    u: url,
    t: title.split('|')[0].trim() || h1,
    d: desc.slice(0, 150),
    k: specs.join(' '),
  });
}

records.sort((a, b) => a.u.localeCompare(b.u));
const json = JSON.stringify(records);

if (CHECK) {
  const current = fs.existsSync(OUT) ? read(OUT) : '';
  if (current.trim() === json.trim()) { console.log(`search-index.json is current (${records.length} pages)`); process.exit(0); }
  console.error(`search-index.json is STALE - run: node docs/build-search-index.mjs`);
  process.exit(1);
}

fs.writeFileSync(OUT, json);
const kb = Math.round(Buffer.byteLength(json) / 1024);
console.log(`search-index.json written: ${records.length} pages, ${kb} KB`);
console.log(`  with specs indexed: ${records.filter(r => r.k).length}`);
console.log(`  missing a title   : ${records.filter(r => !r.t).length}`);
