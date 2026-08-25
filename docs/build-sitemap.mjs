// Regenerates sitemap.xml from the source tree.
//
//     node docs/build-sitemap.mjs            write sitemap.xml
//     node docs/build-sitemap.mjs --check    report drift, write nothing (exit 1 if drift)
//
// Run it after adding, removing, renaming or meaningfully editing a page. It
// reads the source files, not _site, so it does not need a build first.
//
// What it emits, and why:
//
//   <loc>      every published page, so a new page cannot be forgotten and a
//              retired one cannot linger. The old hand-maintained file had
//              already drifted: it was missing /privacy/, /terms/ and a product
//              page, which is what prompted this script.
//
//   <lastmod>  the date of the last commit that touched the page, skipping the
//              commits listed in BOILERPLATE below. Google uses lastmod only
//              while it is "consistently and verifiably accurate" and compares
//              it against the page it fetched, so a date that claims a content
//              update for a sitewide CSS sweep is worse than no date at all.
//
//   <image:*>  the images in the page's own markup. Source files do not contain
//              the header and footer, so this naturally excludes the logo and
//              other chrome that appears on every page.
//
// It deliberately emits no <priority> and no <changefreq>: Google's
// documentation states plainly that it ignores both.
//
// This script is excluded from the published site in _config.yml.
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://www.nickelsheets.com';
const OUT = path.join(ROOT, 'sitemap.xml');
const CHECK = process.argv.includes('--check');

// Commits that changed markup sitewide without changing what any page says.
// A page whose only recent commit is one of these keeps its earlier, truthful
// date. Add to this list when you land another sweep of the same kind.
const BOILERPLATE = new Set([
  '1e5afe80', // vendored Bootstrap, inlined the Font Awesome icons, dropped preconnect
  '96b3fc03', // rendered header and footer at build time via Jekyll includes
  '08abb624', // fixed duplicate element ids, repaired unreachable accordion panels
  '77da77ce', // Tier 1 and Tier 3 UI defect fixes
  '77ae0b2e', // Tier 2: layout stability and page weight
  'e3cbc752', // image width/height and alt attributes for discoverability
  '9e877c37', // gave the product pages the <h1> they were missing
  'c380188e', // spelling sweep: "Exporter" and "stockist"
  'c710232f', // breadcrumb, skip link and meta description on every page
  '2fe7b8e8', // marked each trademark once, sitewide
  'e32e8a32', // stripped the JSON-LD offers blocks that carried no price
  '41263991', // widened priceValidUntil to 100 days; no figure a reader sees moved
  '7f9ce97c', // parked the Product node on 258 unpriced pages; markup only, no copy changed
  'e20a13f4', // retired nine duplicate URLs; the targets gained only a redirect_from line
  'd506331b', // redirected five reported 404s; the targets gained only a redirect_from line
  'f2a2c4f4', // repointed cross-links at the renamed 330 pages; label and href only
  'd855b240', // reworded the generated identity caption; 3 more got a sidebar label
  '90457f3e', // relabelled one DS cross-link on the sheets index; label text only
]);

// A commit here is skipped for every page it touched, so a sweep that also carried a handful of
// genuine edits understates those pages' dates rather than overstating the rest. That is the
// trade to make: Google drops the field when dates are inflated, not when they lag. Where the
// genuine edits matter, land them as their own commit instead of folding them into a sweep.

const read = f => fs.readFileSync(f, 'utf8');
const xmlEscape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

// ---- which URLs are off limits, per robots.txt -----------------------------
// A URL that robots.txt disallows must not be advertised in the sitemap;
// Search Console reports that combination as an error.
const disallowed = read(path.join(ROOT, 'robots.txt'))
  .split('\n')
  .map(l => l.match(/^\s*Disallow:\s*(\S+)/i))
  .filter(Boolean).map(m => m[1]);
const isDisallowed = u => disallowed.some(d => u.startsWith(d));

// ---- last meaningful commit date per file ----------------------------------
// One pass over history rather than a git call per file.
function lastModifiedMap() {
  const log = execSync('git log --no-merges --date=short --format="@@@%h %ad" --name-only',
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
  const map = new Map();
  let date = null, skip = false;
  for (const line of log.split('\n')) {
    if (line.startsWith('@@@')) {
      const [sha, d] = line.slice(3).split(' ');
      date = d; skip = BOILERPLATE.has(sha);
      continue;
    }
    const f = line.trim();
    if (!f || skip) continue;
    if (!map.has(f)) map.set(f, date);   // log is newest first, so first wins
  }
  return map;
}

// ---- collect published pages ----------------------------------------------
const modified = lastModifiedMap();
const files = execSync('git ls-files "*.html"', { cwd: ROOT, encoding: 'utf8' })
  .split('\n').filter(Boolean);

const pages = [], skipped = [];
for (const rel of files) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) continue;
  const s = read(abs);
  const fm = s.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) { skipped.push([rel, 'no front matter']); continue; }
  const front = fm[1];

  if (/^published:\s*false/m.test(front)) { skipped.push([rel, 'published: false']); continue; }
  if (/^sitemap:\s*false/m.test(front)) { skipped.push([rel, 'sitemap: false']); continue; }
  if (rel.startsWith('html/')) { skipped.push([rel, 'runtime fragment, not a page']); continue; }

  const pm = front.match(/^permalink:\s*(\S+)/m);
  if (!pm) { skipped.push([rel, 'no permalink - would publish at its source path']); continue; }
  const url = pm[1].replace(/^["']|["']$/g, '');
  if (isDisallowed(url)) { skipped.push([rel, 'disallowed in robots.txt']); continue; }

  // page-specific images, in document order, deduped
  const imgs = [...new Set(
    [...s.matchAll(/<img\b[\s\S]*?>/gi)]
      .map(t => (t[0].match(/src\s*=\s*["']([^"']+)["']/i) || [])[1])
      .filter(u => u && u.startsWith('/'))
  )];

  pages.push({ url, file: rel, lastmod: modified.get(rel) || null, imgs });
}
pages.sort((a, b) => a.url.localeCompare(b.url));

// ---- render ----------------------------------------------------------------
const body = pages.map(p => {
  const lines = [`  <url>`, `    <loc>${xmlEscape(ORIGIN + p.url)}</loc>`];
  if (p.lastmod) lines.push(`    <lastmod>${p.lastmod}</lastmod>`);
  for (const i of p.imgs) {
    lines.push(`    <image:image>`);
    lines.push(`      <image:loc>${xmlEscape(ORIGIN + i)}</image:loc>`);
    lines.push(`    </image:image>`);
  }
  lines.push(`  </url>`);
  return lines.join('\n');
}).join('\n');

const xml = `---
permalink: /sitemap.xml
layout: null
sitemap: false
---
<?xml version="1.0" encoding="UTF-8"?>
<!-- Generated by docs/build-sitemap.mjs. Do not edit by hand. -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${body}
</urlset>
`;

const prev = fs.existsSync(OUT) ? read(OUT) : '';
const imgCount = pages.reduce((n, p) => n + p.imgs.length, 0);
const noDate = pages.filter(p => !p.lastmod).length;

console.log(`pages     : ${pages.length}`);
console.log(`images    : ${imgCount}`);
console.log(`no lastmod: ${noDate}`);
console.log(`skipped   : ${skipped.length}`);
for (const [f, why] of skipped) console.log(`   ${why.padEnd(42)} ${f}`);

if (CHECK) {
  if (prev.replace(/\r\n/g, '\n') === xml) { console.log('\nsitemap.xml is up to date'); process.exit(0); }
  console.log('\nsitemap.xml is STALE - run: node docs/build-sitemap.mjs');
  process.exit(1);
}
fs.writeFileSync(OUT, xml);
console.log(`\nwrote sitemap.xml (${(xml.length / 1024).toFixed(0)} KB)`);
