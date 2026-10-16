#!/usr/bin/env node
/*
 * build-page-images.mjs - names each page's own product photo as the image a
 * search result should show beside it.
 *
 * WHY IT EXISTS. Google shows a thumbnail beside a result when it can find a
 * good image for the page, and it says where it looks first: schema.org
 * primaryImageOfPage, the image of the page's main entity, and og:image
 * (developers.google.com/search/docs/appearance/google-images). The same page
 * says to avoid a generic image such as the site logo. On 2026-10-15, 569 of
 * the 804 published pages named /docs/images/aurico-logo.webp as their
 * og:image, 538 had no image in their live structured data, and where they had
 * one it was usually a banner shared by dozens of pages (plates-banner.webp
 * leads 122). Competitors' results carried a photo; ours carried nothing.
 *
 * WHAT IT WRITES, for every row of docs/page-images.csv that names an image:
 *
 *   og:image, twitter:image   the photo's absolute URL (and og:image:alt, if
 *                             the page has one, from the photo's own alt text)
 *   primaryImageOfPage        an ImageObject on the page's own top-level
 *                             WebPage-type node: WebPage, CollectionPage and the
 *                             rest of PAGE_TYPES, preferring any of them to a
 *                             FAQPage, which is a WebPage too and is used only
 *                             when it is the page's sole one. A page with none
 *                             gets a WebPage block of its own, between
 *                             page-image:start / page-image:end markers, before
 *                             </head>.
 *   image                     on the page's live top-level Product node, so the
 *                             main entity does not name a different picture. On
 *                             the powder pages it named inconel-sheets.webp.
 *
 * The JSON-LD is edited in place, one property at a time, by offset - never
 * re-serialised - because these blocks are hand-written and other generators
 * read them as text (build-prices.mjs hangs offers off the brand key,
 * build-breadcrumbs.mjs brace-scans the crumbs, build-price-worklist.mjs greps
 * for the Product type). Parked Product nodes inside HTML comments are not
 * touched: Google never sees them.
 *
 * primaryImageOfPage belongs to this generator on every page. On a page with no
 * row, or on a node that is not the chosen one, it is removed, so a deleted row
 * cannot leave a stale image behind. og:image and Product.image are only ever
 * written, never reverted: there is no earlier value to go back to, so a page
 * that leaves the CSV keeps its photo there until someone sets it by hand.
 *
 * WHAT A ROW MUST BE, failed in both modes:
 *   - a published, indexable page (no noindex, not disallowed in robots.txt);
 *   - an image file that exists, is not a logo, and is shown on the page itself
 *     in an <img> of its own markup - the preferred image must be one the reader
 *     sees, the same rule as a marked-up price.
 * And reported but not failed:
 *   - the photo is also shown on another page, other than as a catalogue card
 *     linking here. It is then no longer this page's own photo;
 *   - it is wider or taller than 2:1. Google asks for no extreme aspect ratio.
 *
 * A row whose image is "-" records a page that was looked at and has no usable
 * photo, with the reason in its third column. Nothing is written to that page;
 * it goes to the backlog with its reason.
 *
 * THE BACKLOG. docs/page-images-todo.csv lists every indexable page with no
 * adopted row, grouped by the image the page leads with now (its banner, else
 * its first <img>), largest group first, so the owner can see which one photo
 * would cover the most pages. A page that already shows a photo no other page
 * shows is marked as a candidate: look at it, then add a row. Nothing reads the
 * backlog; --check only says whether it is current.
 *
 * SEEDING. The first 54 rows (2026-10-16) are every page whose banner or
 * product photo is shown on that page alone - or elsewhere only as a catalogue
 * card linking to it - and that a person looked at and found to be a single
 * product, not a collage, not an industry scene, not the wrong form and not
 * the same photograph as another page's under a different filename. Four
 * filename pairs turned out to be one photo (coil.webp is duplex-steel-coil.webp,
 * Fittings.webp is incoloy-fittings.webp, tool-steel-powder.webp is
 * metal-am-powder.webp, 32140-nickel-strips.webp is
 * nickel-zigzag-busbar-cylindrical-cells.webp), and three 18650 strip files are
 * crops of one shot. Uniqueness by filename is not uniqueness by photograph.
 *
 *   node docs/build-page-images.mjs          # write the pages and the backlog
 *   node docs/build-page-images.mjs --check  # report drift, write nothing
 *
 * Works in LF space and restores the CRLF it found; see CLAUDE.md.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const ORIGIN = 'https://www.nickelsheets.com';
const CSV = 'docs/page-images.csv';
const TODO = 'docs/page-images-todo.csv';
const START = '<!-- page-image:start  generated by docs/build-page-images.mjs from docs/page-images.csv -->';
const END = '<!-- page-image:end -->';

// schema.org WebPage and its subtypes: a node of any of these describes the page.
const PAGE_TYPES = new Set(['WebPage', 'AboutPage', 'CheckoutPage', 'CollectionPage', 'ContactPage',
  'FAQPage', 'ItemPage', 'MedicalWebPage', 'ProfilePage', 'QAPage', 'RealEstateListing',
  'SearchResultsPage', 'ImageGallery', 'MediaGallery', 'VideoGallery']);

// What a person saw in the shared lead images, for the backlog's group headings.
// By eye, 2026-10-16. A note here changes nothing on any page.
const IMAGE_NOTES = {
  '/docs/media/plates-banner.webp': 'collage of four plate photos, 1200x280 (over 4:1)',
  '/docs/media/Foil-New-Banner.webp': 'collage of four foil photos',
  '/docs/media/hex-bar-flat-banner.webp': 'collage of four hex bar photos',
  '/docs/media/busbar-1.webp': 'collage of eight strip and busbar photos',
  '/docs/media/busbar-photos.webp': 'collage of four strip photos',
  '/docs/media/Haynes-2.webp': 'collage of nine bar photos',
  '/docs/images/chemical-manufacturing.webp': 'an industry scene, not the product',
  '/docs/images/oil-and-gas-industry.webp': 'an industry scene, not the product',
  '/docs/images/aerospace.webp': 'an industry scene (a jet engine), not the product',
  '/docs/images/h-type-nickel-busbar-18650.webp': 'carries a RAMANI STEEL HOUSE watermark: another company\'s photograph',
  '/docs/images/inconel-wire.webp': 'renders copper-coloured wire',
};

const problems = [];   // fail the run
const notices = [];    // reported only

// ---- the CSV ----------------------------------------------------------------
// url,image[,note]. The note may contain commas: only the first two split.
const rows = new Map();
{
  const lines = readFileSync(join(ROOT, CSV), 'utf8').replace(/\r\n/g, '\n').split('\n');
  let header = false;
  lines.forEach((line, n) => {
    if (!line.trim() || line.startsWith('#')) return;
    if (!header) { header = true; if (!/^url,image(,note)?$/.test(line.trim())) problems.push(`${CSV}: header must be url,image,note`); return; }
    const a = line.indexOf(','), b = a < 0 ? -1 : line.indexOf(',', a + 1);
    const url = (a < 0 ? line : line.slice(0, a)).trim();
    const image = (a < 0 ? '' : b < 0 ? line.slice(a + 1) : line.slice(a + 1, b)).trim();
    const note = b < 0 ? '' : line.slice(b + 1).trim();
    if (!url || !image) { problems.push(`${CSV} line ${n + 1}: needs a url and an image (or "-")`); return; }
    if (rows.has(url)) { problems.push(`${CSV} line ${n + 1}: ${url} has two rows`); return; }
    if (image === '-' && !note) problems.push(`${CSV} line ${n + 1}: ${url} is "-" with no reason`);
    rows.set(url, { image, note, line: n + 1 });
  });
}

// ---- the pages ----------------------------------------------------------------
const disallowed = readFileSync(join(ROOT, 'robots.txt'), 'utf8').split('\n')
  .map((l) => l.match(/^\s*Disallow:\s*(\S+)/i)).filter(Boolean).map((m) => m[1]);
const files = execSync('git ls-files "*.html"', { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 })
  .split('\n').filter(Boolean);

const pages = [];
for (const file of files) {
  if (file.startsWith('html/') || !existsSync(join(ROOT, file))) continue;
  const raw = readFileSync(join(ROOT, file), 'utf8');
  const s = raw.replace(/\r\n/g, '\n');
  const fm = s.match(/^---[ \t]*\n([\s\S]*?)\n---/);
  if (!fm || /^published:[ \t]*false/m.test(fm[1])) continue;
  const pm = fm[1].match(/^permalink:[ \t]*(\S+)/m);
  if (!pm) continue;
  const url = pm[1].replace(/^["']|["']$/g, '');
  const noindex = /<meta\s+name=["'](?:robots|googlebot)["'][^>]*noindex/i.test(s);
  const indexable = !noindex && !disallowed.some((d) => url.startsWith(d));
  pages.push({ file, url, raw, s, crlf: raw.includes('\r\n'), indexable });
}
const byUrl = new Map(pages.map((p) => [p.url, p]));

// Every <img> on every published page, with the page a catalogue card links to
// when the image sits in one: inside an <a>, or followed by the card heading's
// link before the next image. A page's own banner is never a card.
const normHref = (h) => {
  if (!h) return null;
  h = h.replace(/^https?:\/\/(www\.)?nickelsheets\.com/, '').split('#')[0].split('?')[0];
  if (!h.startsWith('/')) return null;
  return h.endsWith('/') || /\.\w+$/.test(h) ? h : h + '/';
};
const attr = (tag, name) => (tag.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, 'i')) || [])[1];
for (const p of pages) {
  const s = p.s;
  const bannerAt = s.search(/class=["'][^"']*flat-banner/);
  p.imgs = [];
  for (const m of s.matchAll(/<img\b[\s\S]*?>/gi)) {
    const src = attr(m[0], 'src');
    if (!src) continue;
    p.imgs.push({ src, alt: attr(m[0], 'alt') || '', at: m.index, tag: m[0] });
  }
  const figEnd = bannerAt < 0 ? -1 : s.indexOf('</figure>', bannerAt);
  const b = bannerAt < 0 ? null : p.imgs.find((i) => i.at > bannerAt);
  p.banner = b && (figEnd < 0 || b.at < figEnd) ? b.src : null;
  for (const i of p.imgs) {
    i.card = null;
    if (i.src === p.banner) continue;
    const before = s.slice(0, i.at);
    const open = before.lastIndexOf('<a '), close = before.lastIndexOf('</a>');
    if (open > close) { i.card = normHref(attr(s.slice(open, s.indexOf('>', open) + 1), 'href')); continue; }
    const after = s.slice(i.at + i.tag.length);
    const next = after.search(/<img\b/i);
    const h = after.slice(0, Math.min(next < 0 ? 800 : next, 800)).match(/<a\b[^>]*href\s*=\s*["']([^"']+)["']/i);
    if (h) i.card = normHref(h[1]);
  }
}
const shownOn = new Map();   // src -> [{url, card}]
for (const p of pages) for (const i of p.imgs) {
  if (!shownOn.has(i.src)) shownOn.set(i.src, []);
  shownOn.get(i.src).push({ url: p.url, card: i.card });
}
// Pages other than `url` that show `src`, not counting cards that link to `url`.
const elsewhere = (src, url) =>
  [...new Set((shownOn.get(src) || []).filter((o) => o.url !== url && o.card !== url).map((o) => o.url))];

// ---- image files ------------------------------------------------------------------
// Width and height from the file header, so the ImageObject states the real size.
function imageSize(file) {
  const b = readFileSync(file);
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const kind = b.toString('ascii', 12, 16);
    if (kind === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
    if (kind === 'VP8L') { const n = b.readUInt32LE(21); return [(n & 0x3fff) + 1, ((n >>> 14) & 0x3fff) + 1]; }
    if (kind === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  }
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return [b.readUInt32BE(16), b.readUInt32BE(20)];
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i + 9 < b.length;) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return null;
}

// ---- JSON-LD, read with offsets -------------------------------------------------
// A small JSON reader that remembers where every value starts and ends, so a
// single property can be replaced without re-serialising the block around it.
function readJson(t) {
  let i = 0;
  const ws = () => { while (i < t.length && /\s/.test(t[i])) i++; };
  const str = () => {
    const start = i++;
    while (t[i] !== '"') { if (i >= t.length) throw new Error('unterminated string'); if (t[i] === '\\') i++; i++; }
    i++;
    return { kind: 'str', start, end: i };
  };
  const val = () => {
    ws();
    const start = i;
    if (t[i] === '{') {
      i++; const props = []; ws();
      if (t[i] === '}') { i++; return { kind: 'obj', start, end: i, props }; }
      for (;;) {
        ws();
        if (t[i] !== '"') throw new Error(`expected a key at ${i}`);
        const k = str(); ws();
        if (t[i] !== ':') throw new Error(`expected ':' at ${i}`);
        i++;
        props.push({ key: JSON.parse(t.slice(k.start, k.end)), keyStart: k.start, value: val() });
        ws();
        if (t[i] === ',') { i++; continue; }
        if (t[i] === '}') { i++; return { kind: 'obj', start, end: i, props }; }
        throw new Error(`expected ',' or '}' at ${i}`);
      }
    }
    if (t[i] === '[') {
      i++; const items = []; ws();
      if (t[i] === ']') { i++; return { kind: 'arr', start, end: i, items }; }
      for (;;) {
        items.push(val()); ws();
        if (t[i] === ',') { i++; continue; }
        if (t[i] === ']') { i++; return { kind: 'arr', start, end: i, items }; }
        throw new Error(`expected ',' or ']' at ${i}`);
      }
    }
    if (t[i] === '"') return str();
    const m = /^(?:-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(t.slice(i, i + 40));
    if (!m) throw new Error(`unexpected '${t[i]}' at ${i}`);
    i += m[0].length;
    return { kind: 'lit', start, end: i };
  };
  const root = val(); ws();
  if (i !== t.length) throw new Error('content after the JSON value');
  return root;
}

// The live ld+json blocks of a page (not inside an HTML comment), each with its
// top-level nodes: the root object, the members of its @graph, or the objects
// of a root array.
function liveNodes(s) {
  const comments = [...s.matchAll(/<!--[\s\S]*?-->/g)].map((m) => [m.index, m.index + m[0].length]);
  const out = [];
  for (const m of s.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/ld\+json/i.test(m[1])) continue;
    if (comments.some(([a, b]) => m.index > a && m.index < b)) continue;
    const base = m.index + m[0].indexOf('>') + 1;
    const t = m[2];
    let root;
    try { JSON.parse(t); root = readJson(t); } catch (e) { out.push({ base, t, error: e.message }); continue; }
    let nodes = [];
    if (root.kind === 'arr') nodes = root.items.filter((v) => v.kind === 'obj');
    else if (root.kind === 'obj') {
      const g = root.props.find((p) => p.key === '@graph');
      nodes = g && g.value.kind === 'arr' ? g.value.items.filter((v) => v.kind === 'obj') : [];
      if (!g || root.props.some((p) => p.key === '@type')) nodes.unshift(root);
    }
    for (const node of nodes) {
      const tp = node.props.find((p) => p.key === '@type');
      const types = tp ? [].concat(JSON.parse(t.slice(tp.value.start, tp.value.end))) : [];
      out.push({ base, t, node, types });
    }
  }
  return out;
}

// Set `key` on a node to `value` (JSON text): replace it where it stands, or
// insert it after the node's "@type" in the layout the block already uses.
function setProp(s, n, key, value) {
  const { base, t, node } = n;
  const have = node.props.find((p) => p.key === key);
  if (have) {
    if (t.slice(have.value.start, have.value.end) === value) return s;
    return s.slice(0, base + have.value.start) + value + s.slice(base + have.value.end);
  }
  const tp = node.props.find((p) => p.key === '@type');
  const lineStart = t.lastIndexOf('\n', tp.keyStart) + 1;
  const indent = /^[ \t]*$/.test(t.slice(lineStart, tp.keyStart)) ? t.slice(lineStart, tp.keyStart) : null;
  let j = tp.value.end;
  while (t[j] === ' ' || t[j] === '\t') j++;
  let at, text;
  if (t[j] === ',') {
    let k = j + 1;
    while (t[k] === ' ' || t[k] === '\t') k++;
    at = j + 1;
    text = indent !== null && t[k] === '\n' ? `\n${indent}"${key}": ${value},` : ` "${key}": ${value},`;
  } else {
    at = tp.value.end;
    text = indent !== null && t[j] === '\n' ? `,\n${indent}"${key}": ${value}` : `, "${key}": ${value}`;
  }
  return s.slice(0, base + at) + text + s.slice(base + at);
}

// Remove a property with its own line and exactly one comma - the exact inverse
// of setProp's insertion.
function removeProp(s, n, prop) {
  const { base, t } = n;
  let a = prop.keyStart;
  while (a > 0 && /\s/.test(t[a - 1])) a--;
  let j = prop.value.end;
  while (t[j] === ' ' || t[j] === '\t') j++;
  if (t[j] === ',') return s.slice(0, base + a) + s.slice(base + j + 1);
  if (t[a - 1] === ',') return s.slice(0, base + a - 1) + s.slice(base + prop.value.end);
  return s.slice(0, base + a) + s.slice(base + prop.value.end);
}

// ---- one page ---------------------------------------------------------------------
const esc = (v) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
function canonicalOf(p) {
  const m = p.s.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i);
  return m ? m[1] : ORIGIN + encodeURI(p.url);
}
function setMeta(s, p, kind, name, value, afterNames) {
  const re = new RegExp(`(<meta\\s+${kind}=["']${name}["']\\s+content=["'])([^"']*)(["'])`, 'i');
  if (re.test(s)) return s.replace(re, (_, a, _v, c) => a + value + c);
  // missing: add it after the first of afterNames found, on its own line
  for (const after of afterNames) {
    const m = s.match(new RegExp(`^([ \\t]*)<meta\\s+${kind}=["']${after}["'][^>]*>[ \\t]*$`, 'mi'));
    if (m) {
      const end = m.index + m[0].length;
      return s.slice(0, end) + `\n${m[1]}<meta ${kind}="${name}" content="${value}">` + s.slice(end);
    }
  }
  problems.push(`${p.file}: no ${kind}="${afterNames[0]}" meta to place ${name} after`);
  return s;
}

function build(p, row) {
  let s = p.s;
  const markers = (s.match(/<!-- page-image:start/g) || []).length;
  if (markers !== (s.match(/<!-- page-image:end -->/g) || []).length || markers > 1) {
    problems.push(`${p.file}: page-image markers do not pair up; fix the block by hand`);
    return s;
  }
  s = s.replace(/[ \t]*<!-- page-image:start[\s\S]*?<!-- page-image:end -->\n?/, '');
  for (const n of liveNodes(s)) if (n.error) {
    (row ? problems : notices).push(`${p.file}: a JSON-LD block does not parse (${n.error}); left alone`);
  }

  let url = null, value = null, own = null;
  if (row) {
    const [w, h] = imageSize(join(ROOT, row.image)) || [];
    url = ORIGIN + encodeURI(row.image);
    value = `{ "@type": "ImageObject", "url": ${JSON.stringify(url)}, "contentUrl": ${JSON.stringify(url)}` +
      (w ? `, "width": ${w}, "height": ${h}` : '') + ' }';
    own = p.imgs.find((i) => i.src === row.image);
  }

  // The page's own node: a WebPage-type node at the top level of a live block,
  // anything before FAQPage, the one naming this page's canonical before the rest.
  const canonical = canonicalOf(p);
  const pick = (nodes) => {
    const cands = nodes.filter((n) => !n.error && n.types.some((x) => PAGE_TYPES.has(x)));
    const names = (n) => ['url', '@id'].some((k) => {
      const q = n.node.props.find((x) => x.key === k);
      return q && q.value.kind === 'str' && JSON.parse(n.t.slice(q.value.start, q.value.end)) === canonical;
    });
    const rank = (n) => (n.types.every((x) => x === 'FAQPage') ? 2 : 0) + (names(n) ? 0 : 1);
    return cands.sort((a, b) => rank(a) - rank(b))[0] || null;   // sort is stable: document order breaks ties
  };

  // Drop primaryImageOfPage wherever it should not be, one property at a time.
  for (let guard = 0; guard < 50; guard++) {
    const nodes = liveNodes(s);
    const target = row ? pick(nodes) : null;
    const stray = nodes.find((n) => !n.error && n !== target && n.node.props.some((q) => q.key === 'primaryImageOfPage'));
    if (!stray) break;
    s = removeProp(s, stray, stray.node.props.find((q) => q.key === 'primaryImageOfPage'));
  }
  if (!row) return s;

  const target = pick(liveNodes(s));
  if (target) s = setProp(s, target, 'primaryImageOfPage', value);
  else {
    const at = s.search(/^[ \t]*<\/head>/m);
    if (at < 0) { problems.push(`${p.file}: no </head> to add a WebPage block before`); return p.s; }
    const block = [
      `  ${START}`,
      '  <script type="application/ld+json">',
      '{',
      '  "@context": "https://schema.org",',
      '  "@type": "WebPage",',
      `  "url": ${JSON.stringify(canonical)},`,
      `  "primaryImageOfPage": ${value}`,
      '}',
      '  </script>',
      `  ${END}`,
      '',
    ].join('\n');
    s = s.slice(0, at) + block + s.slice(at);
  }

  // The main entity's image, on every live top-level Product node.
  for (let guard = 0; guard < 20; guard++) {
    const prod = liveNodes(s).find((n) => !n.error && n.types.includes('Product') &&
      (() => { const q = n.node.props.find((x) => x.key === 'image'); return !q || n.t.slice(q.value.start, q.value.end) !== JSON.stringify(url); })());
    if (!prod) break;
    s = setProp(s, prod, 'image', JSON.stringify(url));
  }

  s = setMeta(s, p, 'property', 'og:image', esc(url), ['og:url', 'og:description', 'og:title']);
  s = setMeta(s, p, 'name', 'twitter:image', esc(url), ['twitter:description', 'twitter:title', 'twitter:card']);
  if (/<meta\s+property=["']og:image:alt["']/i.test(s) && own && own.alt) {
    s = setMeta(s, p, 'property', 'og:image:alt', own.alt, ['og:image']);
  }
  return s;
}

// ---- validate the rows -------------------------------------------------------------
// A row that fails is left out, and so is its page: stripping what an earlier run
// wrote there because a file went missing would be the wrong repair.
const adopted = new Set(), failed = new Set();
function checkRow(url, row, p, where) {
  if (!p) return problems.push(`${where} is not a published page`);
  if (!p.indexable) return problems.push(`${where} is noindex or disallowed; no search result to show a photo beside`);
  if (row.image === '-') return;
  if (!/^\/docs\/[^\s"'<>]+\.(webp|jpe?g|png)$/i.test(row.image)) return problems.push(`${where}: image must be a /docs/ path to a .webp, .jpg or .png`);
  if (/logo/i.test(row.image)) return problems.push(`${where}: ${row.image} is a logo; Google asks for an image of the page's subject, not a generic one`);
  if (!existsSync(join(ROOT, row.image))) return problems.push(`${where}: ${row.image} does not exist`);
  if (!p.imgs.some((i) => i.src === row.image)) return problems.push(`${where}: ${row.image} is not shown on the page; the preferred image must be one the reader sees`);
  const others = elsewhere(row.image, url);
  if (others.length) notices.push(`${url}: ${row.image} is also shown on ${others.join(', ')} - it is no longer this page's own photo`);
  const size = imageSize(join(ROOT, row.image));
  if (!size) notices.push(`${url}: could not read the size of ${row.image}; width and height left out`);
  else if (Math.max(...size) / Math.min(...size) > 2) notices.push(`${url}: ${row.image} is ${size.join('x')}, beyond 2:1`);
}
for (const [url, row] of rows) {
  const before = problems.length;
  checkRow(url, row, byUrl.get(url), `${CSV} line ${row.line}: ${url}`);
  if (problems.length > before) failed.add(url);
  else if (row.image !== '-') adopted.add(url);
}

// ---- write or check the pages -----------------------------------------------------------
let drift = 0, written = 0;
for (const p of pages) {
  if (failed.has(p.url)) continue;
  const row = adopted.has(p.url) ? rows.get(p.url) : null;
  const before = problems.length;
  const s = build(p, row);
  if (problems.length > before || s === p.s) continue;
  if (!row) notices.push(`${p.file}: removed a primaryImageOfPage with no row in ${CSV}; set its og:image by hand if the photo is gone`);
  drift++;
  if (CHECK) { console.log(`stale: ${p.file}`); continue; }
  for (const n of liveNodes(s)) if (n.error) problems.push(`${p.file}: the edit left a JSON-LD block that does not parse (${n.error}); not written`);
  if (problems.length > before) continue;
  writeFileSync(join(ROOT, p.file), p.crlf ? s.replace(/\n/g, '\r\n') : s);
  written++;
}

// ---- the backlog ---------------------------------------------------------------------
const lead = (p) => p.banner || (p.imgs[0] && p.imgs[0].src) || '';
const backlog = pages.filter((p) => p.indexable && !adopted.has(p.url));
const groups = new Map();
for (const p of backlog) {
  const img = lead(p);
  if (!groups.has(img)) groups.set(img, []);
  groups.get(img).push(p);
}
const order = [...groups.keys()].sort((a, b) => groups.get(b).length - groups.get(a).length || (a || '~').localeCompare(b || '~'));
const todo = [
  '# Pages that do not yet name a photo of their own as their preferred image.',
  '#',
  '# Generated by docs/build-page-images.mjs from the source tree and docs/page-images.csv.',
  '# Do not edit it; it is rewritten on every run. Nothing reads it.',
  '#',
  '# Each page is listed under the image it leads with now: its banner, else its first',
  '# photo. Google asks for an image of the page\'s own subject, not a generic one, so a',
  '# banner shared by many pages, a collage or an industry scene does not stand for any',
  '# one of them. The biggest groups come first: one new photo per group would cover them.',
  '#',
  '# To adopt a photo: show it on the page, add "url,image" to docs/page-images.csv, and',
  '# run node docs/build-page-images.mjs. A row "url,-,reason" records a page looked at',
  '# and found to have no usable photo; its reason is the note below.',
  '#',
  `# ${backlog.length} page(s) in ${order.length} group(s); ${adopted.size} page(s) adopted.`,
  '',
  'lead_image,url,note',
];
for (const img of order) {
  const list = groups.get(img).sort((a, b) => a.url.localeCompare(b.url));
  const shown = new Set((shownOn.get(img) || []).map((o) => o.url)).size;
  todo.push('', `# ${img || '(no image on the page)'}  -  leads ${list.length} page(s), shown on ${shown}` +
    (IMAGE_NOTES[img] ? `  -  ${IMAGE_NOTES[img]}` : ''));
  for (const p of list) {
    const row = rows.get(p.url);
    let note = row && row.image === '-' ? row.note : '';
    if (!note) {
      const cand = [...new Set(p.imgs.map((i) => i.src))].filter((src) => !elsewhere(src, p.url).length && !/logo/i.test(src));
      if (cand.length) note = `candidate: ${cand[0]} is shown on this page alone - look at it then add a row`;
    }
    todo.push(`${img},${p.url},${note}`);
  }
}
const todoText = todo.join('\n') + '\n';
const todoPath = join(ROOT, TODO);
const todoPrev = existsSync(todoPath) ? readFileSync(todoPath, 'utf8') : '';
const todoStale = todoPrev.replace(/\r\n/g, '\n') !== todoText;
if (!CHECK && todoStale) writeFileSync(todoPath, todoPrev.includes('\r\n') ? todoText.replace(/\n/g, '\r\n') : todoText);

// ---- report ----------------------------------------------------------------------------
for (const n of notices) console.log('note:', n);
for (const e of problems) console.log('PROBLEM:', e);
console.log(`${rows.size} row(s) in ${CSV}: ${adopted.size} adopted, ` +
  `${[...rows.values()].filter((r) => r.image === '-').length} reviewed with no usable photo.`);
console.log(`backlog: ${backlog.length} indexable page(s) in ${order.length} group(s); largest:`);
for (const img of order.slice(0, 8)) console.log(`   ${String(groups.get(img).length).padStart(4)}  ${img || '(no image)'}`);
if (CHECK) {
  if (todoStale) console.log(`${TODO} is out of date (not a failure). Run: node docs/build-page-images.mjs`);
  if (drift || problems.length) {
    console.log(`${drift} page(s) out of date, ${problems.length} problem(s). Run: node docs/build-page-images.mjs`);
    process.exit(1);
  }
  console.log('All page images up to date.');
} else {
  console.log(`${written} page(s) written${todoStale ? `, ${TODO} refreshed` : ''}.`);
  if (problems.length) process.exit(1);
}
