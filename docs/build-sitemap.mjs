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

// ---- refuse a shallow clone -------------------------------------------------
// Every <lastmod> below comes from git history, so a clone that holds only part
// of it dates pages wrongly - and not at random. The oldest commit a shallow
// clone has, the shallow boundary, has no parent to diff against, so
// `git log --name-only` lists every file in the tree under it, as though that
// one commit had written the whole site. Each page nobody has edited since then
// takes the boundary's date.
//
// That is what happened on 2026-09-14. A cloud session - they clone 50 commits
// deep by default - found the generator disagreeing with the committed sitemap
// on hundreds of dates, took it for the documented one-commit-behind state, and
// regenerated (b060d0f7, "lastmod dates were stale on hundreds of URLs"). 589 of
// 801 URLs came out dated 2026-09-10, the date of the clone's shallow boundary.
// Full history puts 63 of them there; the other 526 were last edited between
// 2026-08-12 and 2026-09-09, and each claimed an update that never happened.
// (The boundary is the oldest of the 50 commits a clone holds, so it moves with
// whichever tip was cloned: the date is the evidence, not a SHA. This comment
// once named df0ceec3, which a clone of b060d0f7's parent holds as its 40th
// commit, not its 50th - that clone ends on cc09f52f, also of 2026-09-10.)
// It is the inflated-lastmod failure BOILERPLATE exists to prevent, arriving
// from the other side, and nothing in the output looked wrong: the drift was
// the bug, and writing the file was the "fix" that published it.
//
// So both modes stop here. A --check that ran would call a correct sitemap
// stale and send the reader to the write mode, which would then publish the
// wrong dates - refusing only the write would leave the misleading half. Exit 2,
// not 1, as check-tags.mjs does for the same distinction: 1 means "looked and
// found drift", 2 means "could not look".
const shallow = execSync('git rev-parse --is-shallow-repository',
  { cwd: ROOT, encoding: 'utf8' }).trim();
if (shallow === 'true') {
  console.error(
    'build-sitemap: refusing to run in a shallow clone - nothing was written.\n' +
    '\n' +
    'Every <lastmod> is read from git history. In a shallow clone the oldest\n' +
    'commit present appears to have touched every file, so each page not edited\n' +
    'since then would be dated to that commit: on 2026-09-14 this dated 526 URLs\n' +
    '2026-09-10 whose last edit was up to four weeks earlier. For the same\n' +
    'reason --check would report drift that is not there.\n' +
    '\n' +
    'Fetch the full history, then run this again:\n' +
    '\n' +
    '    git fetch --unshallow\n');
  process.exit(2);
}

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
  'e6dec1f0', // banner caption became the <h1>, body heading became the <h2>; same words, same place
  'ecd86713', // and back: the body heading is the <h1>, the caption the <h2>. Same words again
  'ac499d12', // last five captions became headings; four render identically, none changed a word
  '0c9fc678', // repointed cross-links at the renamed 602 CA and 660 pages; label and href only
  'b89f7477', // repointed cross-links at the moved Elgiloy and 254 SMO pages; href only
  'f3f50ded', // added the GA4 tag to two wire pages; an analytics script, no word a reader sees
  'd1880f51', // settled the page width at 1100px; the six hubs put their h1 first, same words
  'fdfe1532', // wrapped 975 tables in .table-responsive so they scroll; markup only
  '533ec89e', // re-wrapped 34 tables the NiCr and Stellite merge had reverted; markup only
  'a655d001', // dropped the data source from the generated captions; 385 pages, no material claim moved
  '5d4c5dd2', // took dead table classes and one page's own table styling off ten pages; presentation only
  'e879e31f', // cloned the marquee cards at runtime; index.html gained only a comment
  '0bc3438b', // added the weight-calculator CTA to 305 form pages; a sitewide element, no product copy moved
  '53a88b80', // repaired rel="stylesheet" and a stray "ggt" on one page; nothing it says about Grade 2 moved
  'f1a46388', // Available Forms became a grid of link cards; presentation only, no word a reader sees moved
  'c13cdb9c', // added the grade-hub crumb to 199 form pages; a navigation element, no product copy moved
  '024f5bee', // closed the container div left open on 8 service pages; the DOM signature is unchanged
  'cb217126', // closed the tags 89 more pages left open; DOM signature identical on every one
  '5b8630fd', // added the grade-hub crumb to 53 more form pages; navigation only, same as c13cdb9c
  '1f12f136', // the last 18 grade-hub crumbs; navigation only, same as c13cdb9c and 5b8630fd
  'f0997d1a', // redirected 53 retired URLs; the targets gained only a redirect_from line
  'e050e4b6', // linked the orphaned titanium plates pages; a neighbour's link, no grade copy moved
  'd3624386', // finished 86 truncated <title> tags; metadata only, no page's subject matter moved
  '6e57c6b0', // added the generated quote block to 626 product pages; a sitewide element, no product copy moved
  'af2fd408', // GA4 tag on the calculator, privacy and terms, and sitemap: false on the last two
  'f3fe24fc', // retired two duplicate pages into their keepers; redirect_from lines and repointed hrefs only
  '2aeb8346', // linked Haynes 556, HR-160 and nickel foil from their siblings' lists; links only, no grade copy moved
  '062da47d', // pointed the Nichrome grades table at the six NiCr grade hubs; link targets only
  '9aed1379', // finished three cut-off <title> tags; metadata only, same as d3624386
  'a32931f0', // 32140 page's crumb and Product name off a blog hook, plus its quote block; no product copy moved
  '587a4a1e', // the grade in 15 breadcrumbs, and the quote block on those pages; navigation only, same as c13cdb9c
  '48840764', // the form in 33 more breadcrumbs, "Premium" and "Reliable" out of them; navigation only, same as 587a4a1e
  '3ed989c8', // regenerated the quote block on 640 pages to keep the phone number whole; a sitewide element
  'cbe27794', // retired the second duplex wire page; the keeper gained a redirect_from line, a neighbour a link target
  'b509d890', // took /inconel/X-750/ and its foil URL out of the Inconel hub's redirect_from; it renders the same
  '98a84349', // the X-750 hub as the form pages' third crumb, and two neighbours' links; navigation only, same as c13cdb9c
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
  // Log full SHAs (%H), not abbreviated (%h): BOILERPLATE holds 8-char SHAs, but
  // git abbreviates %h to 7 here, so `BOILERPLATE.has(shortSha)` never matched and
  // every sweep silently leaked into the dates - the "signal rots" failure this set
  // exists to prevent. Match the full SHA against each entry as a prefix, so the
  // guard keeps working whatever length either side is.
  const log = execSync('git log --no-merges --date=short --format="@@@%H %ad" --name-only',
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
  const boilerplate = [...BOILERPLATE];
  const map = new Map();
  let date = null, skip = false;
  for (const line of log.split('\n')) {
    if (line.startsWith('@@@')) {
      const [sha, d] = line.slice(3).split(' ');
      date = d; skip = boilerplate.some(b => sha.startsWith(b));
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
// Restore the line endings the file already had, the same way build-specs,
// build-prices, build-cuts, build-grades and build-hub-grades do. `--check`
// above compares in LF space but this wrote bare LF, so on a checkout where
// `core.autocrlf` gives CRLF every run rewrote all 6,625 line endings and left
// sitemap.xml permanently "modified" in git status while `git diff` showed
// nothing - drift that looks real and is not.
const crlf = prev.includes('\r\n');
fs.writeFileSync(OUT, crlf ? xml.replace(/\n/g, '\r\n') : xml);
console.log(`\nwrote sitemap.xml (${(xml.length / 1024).toFixed(0)} KB)`);
