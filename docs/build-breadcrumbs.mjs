#!/usr/bin/env node
// Write the grade-hub crumb into every /family/grade/form/ page's breadcrumb —
// both the visible <ol class="breadcrumb"> and the JSON-LD BreadcrumbList.
//
// Why this exists: 311 of 338 form pages breadcrumbed Home > Family > current page,
// skipping the grade hub entirely. So a grade hub's only inbound link was the one row
// in its family hub's grades table, and its own children — the five form pages that are
// the most relevant thing on the site pointing at it — linked past it to the family.
// Search Console had 232 URLs sitting in "Discovered - currently not indexed": known
// from the sitemap, never crawled, which is what a page with one inbound link looks
// like to a crawler deciding where to spend.
//
// The label is the grade hub's OWN final crumb, not a string built here. Breadcrumbs on
// this site are hand-written single noun phrases ("Inconel 625", "Hastelloy(R) C276",
// "904L") and are already trusted as such elsewhere -- floating-form.js seeds the
// enquiry subject from the last crumb for exactly that reason. Deriving the label from
// the URL instead would publish "625" or "C276" where the hub calls itself something a
// buyer would recognise.
//
//   node docs/build-breadcrumbs.mjs          # write
//   node docs/build-breadcrumbs.mjs --check  # report drift, write nothing, exit non-zero
//
// Run it after adding or renaming a form page, or after adding a grade hub — a form page
// whose hub does not exist yet is reported and skipped, never linked. Manufacturing a
// link to a page that is not there would trade 232 uncrawled URLs for 79 new 404s, which
// is the same mistake one direction over.

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

// ---------------------------------------------------------------- page inventory

function frontMatter(s) {
  if (!s.startsWith('---')) return {};
  const end = s.indexOf('\n---', 3);
  if (end < 0) return {};
  const fm = {};
  for (const line of s.slice(3, end).split('\n')) {
    const m = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (m) fm[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return fm;
}

const files = execSync('git ls-files "*.html" "*.HTML"', { cwd: ROOT, maxBuffer: 1 << 28 })
  .toString().trim().split('\n').filter(Boolean);

const pages = [];
for (const f of files) {
  const raw = readFileSync(join(ROOT, f), 'utf8');
  const fm = frontMatter(raw.replace(/\r\n/g, '\n'));
  if (fm.published === 'false' || !fm.permalink) continue;
  let url = fm.permalink.trim();
  if (!url.startsWith('/')) url = '/' + url;
  if (!url.endsWith('/')) url += '/';
  pages.push({ file: f, url });
}
const byUrl = new Map(pages.map((p) => [p.url, p]));

// ------------------------------------------------------------------ crumb helpers

const BREADCRUMB_OL = /<ol class="breadcrumb">([\s\S]*?)<\/ol>/;
// captures: indent, attributes, inner html
const LI = /([ \t]*)<li([^>]*)>([\s\S]*?)<\/li>/g;

// The site writes ListItem objects two ways — pretty-printed over six lines, and all on
// one line (the stellite pages). Brace-scan the itemListElement array rather than match a
// shape: a regex for one of the two formats reported the other as "0 items", which read
// as a broken page when it was a correct one written differently.
function listItems(json) {
  const at = json.search(/"itemListElement"\s*:\s*\[/);
  if (at < 0) return null;
  const open = json.indexOf('[', at);
  const out = [];
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = open; i < json.length; i++) {
    const c = json[i];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{') { if (depth === 0) start = i; depth++; }
    else if (c === '}') { if (--depth === 0) out.push({ raw: json.slice(start, i + 1), start, end: i + 1 }); }
    else if (c === ']' && depth === 0) break;
  }
  for (const o of out) {
    o.position = +(o.raw.match(/"position"\s*:\s*(\d+)/) || [, NaN])[1];
    o.item = (o.raw.match(/"item"\s*:\s*"((?:[^"\\]|\\.)*)"/) || [, null])[1];
    o.multiline = o.raw.includes('\n');
    // whitespace at the start of the line the object opens on
    const lineStart = json.lastIndexOf('\n', o.start) + 1;
    o.indent = json.slice(lineStart, o.start).match(/^[ \t]*/)[0];
  }
  return out;
}

// Build a ListItem in the same shape as the one it will sit beside.
function formatListItem(like, pos, name, item) {
  const n = JSON.stringify(name), it = JSON.stringify(item);
  if (!like.multiline) return `{ "@type": "ListItem", "position": ${pos}, "name": ${n}, "item": ${it} }`;
  const i = like.indent;
  return `{\n${i}  "@type": "ListItem",\n${i}  "position": ${pos},\n` +
         `${i}  "name": ${n},\n${i}  "item": ${it}\n${i}}`;
}

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  reg: '®', trade: '™', copy: '©', deg: '°',
  mdash: '—', ndash: '–', middot: '·', times: '×',
};
const decode = (s) => s
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);

// Product forms, taken from the form pages' own URLs rather than a list typed here, so a
// new form needs no edit. Used to refuse a hub label that names one.
const FORM_WORDS = new Set();

// A grade hub whose own last crumb ends in a product form is a form page sitting at a
// grade URL — the duplication CLAUDE.md describes, still visible in its breadcrumb.
// /hastelloy/C22/ calls itself "Hastelloy C22 Foil" and /incoloy/903/ "Incoloy 903
// Sheets", so adopting the label would publish "Hastelloy C22 Foil > Hastelloy C22
// Plates" on the plates page: a breadcrumb asserting that plates live under foil.
// Refused and reported rather than trimmed, because the hub's own page carries the same
// wrong crumb and fixing it there fixes every child at once.
function namesAForm(text) {
  const t = text.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  for (const w of FORM_WORDS) if (t === w || t.endsWith(' ' + w)) return w;
  return null;
}

// The hub's own final crumb, as raw HTML (for the <li>) and decoded text (for JSON-LD).
const labelCache = new Map();
function hubLabel(hubUrl) {
  if (labelCache.has(hubUrl)) return labelCache.get(hubUrl);
  const hp = byUrl.get(hubUrl);
  let out = null;
  if (hp) {
    const raw = readFileSync(join(ROOT, hp.file), 'utf8').replace(/\r\n/g, '\n');
    const ol = raw.match(BREADCRUMB_OL);
    if (ol) {
      const items = [...ol[1].matchAll(LI)];
      if (items.length) {
        const html = items[items.length - 1][3].trim();
        // the hub's last crumb is the active one and carries no link; if it somehow does,
        // take its text so we never nest an <a> inside an <a>.
        const inner = html.replace(/<a[^>]*>([\s\S]*?)<\/a>/g, '$1').trim();
        if (inner) out = { html: inner, text: decode(inner.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim() };
      }
    }
  }
  labelCache.set(hubUrl, out);
  return out;
}

// ------------------------------------------------------------------------- rewrite

const skipped = new Map();   // reason -> [url]
const skip = (reason, url) => {
  if (!skipped.has(reason)) skipped.set(reason, []);
  skipped.get(reason).push(url);
};

const changed = [];
let inserted = 0, updated = 0, alreadyOk = 0;

// Three URL segments is what a /family/grade/form/ page looks like, but it is also what
// /pages/products/coil/ looks like — and those are form hubs listing every family, with a
// two-crumb breadcrumb and no grade above them. Counting segments alone put eleven of them
// in the skip report as malformed grade pages, which is the check being wrong about a page
// that is right.
const NOT_GRADE_ROUTES = /^\/(pages|docs|html|tools|supply|export)\//;

const formPages = pages.filter((p) =>
  p.url.split('/').filter(Boolean).length === 3 && !NOT_GRADE_ROUTES.test(p.url));

for (const p of formPages) {
  FORM_WORDS.add(p.url.split('/').filter(Boolean)[2].replace(/-/g, ' ').toLowerCase());
}

for (const p of formPages) {
  const segs = p.url.split('/').filter(Boolean);
  const hubUrl = `/${segs[0]}/${segs[1]}/`;

  if (!byUrl.has(hubUrl)) { skip(`no grade hub page at ${'<family>/<grade>/'}`, `${p.url}  needs ${hubUrl}`); continue; }
  const label = hubLabel(hubUrl);
  if (!label) { skip('grade hub has no breadcrumb to take a label from', `${p.url}  hub ${hubUrl}`); continue; }
  const formWord = namesAForm(label.text);
  if (formWord) {
    skip(`grade hub's own last crumb names a product form — fix the hub, not this page`,
      `${p.url}  ${hubUrl} calls itself "${label.text}"`);
    continue;
  }

  const fp = join(ROOT, p.file);
  const raw = readFileSync(fp, 'utf8');
  const crlf = raw.includes('\r\n');
  const s0 = raw.replace(/\r\n/g, '\n');       // do all the work in LF space
  let s = s0;

  // ---- 1. visible <ol class="breadcrumb">
  const ol = s.match(BREADCRUMB_OL);
  if (!ol) { skip('no visible <ol class="breadcrumb">', p.url); continue; }
  const items = [...ol[1].matchAll(LI)];
  if (items.length < 3 || items.length > 4) {
    skip(`visible breadcrumb has ${items.length} crumbs, expected 3 or 4`, p.url); continue;
  }
  const last = items[items.length - 1];
  if (/href=/.test(last[3])) { skip('last visible crumb is a link, not the current page', p.url); continue; }

  const desiredLi = `${last[1]}<li class="breadcrumb-item"><a href="${hubUrl}">${label.html}</a></li>`;
  let visState;
  if (items.length === 4) {
    const third = items[2];
    if (!third[3].includes(`href="${hubUrl}"`)) {
      skip(`3rd crumb links elsewhere, not the grade hub`, `${p.url}  (${(third[3].match(/href="([^"]*)"/) || [, '?'])[1]})`);
      continue;
    }
    const cur = `${third[1]}<li${third[2]}>${third[3]}</li>`;
    visState = cur === desiredLi ? 'ok' : 'update';
    if (visState === 'update') {
      s = s.replace(BREADCRUMB_OL, (m, inner) => m.replace(cur, desiredLi));
    }
  } else {
    visState = 'insert';
    const lastFull = `${last[1]}<li${last[2]}>${last[3]}</li>`;
    s = s.replace(BREADCRUMB_OL, (m) => m.replace(lastFull, `${desiredLi}\n${lastFull}`));
  }

  // ---- 2. JSON-LD BreadcrumbList
  const blocks = [...s.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .filter((b) => /"BreadcrumbList"/.test(b[1]));
  if (blocks.length !== 1) { skip(`${blocks.length} BreadcrumbList blocks, expected 1`, p.url); continue; }
  const block = blocks[0];
  const li = listItems(block[1]);
  if (!li || li.length < 3 || li.length > 4) {
    skip(`JSON-LD BreadcrumbList has ${li ? li.length : 'no'} items, expected 3 or 4`, p.url); continue;
  }
  const tail = li[li.length - 1];
  if (!tail.item || !tail.item.endsWith(p.url)) {
    skip('JSON-LD last item is not this page', `${p.url}  (${tail.item})`); continue;
  }

  const origin = (li[0].item || '').replace(/\/$/, '');
  const hubItemUrl = `${origin}${hubUrl}`;
  let jsonState;

  if (li.length === 4) {
    const third = li[2];
    if (third.item !== hubItemUrl) {
      skip('JSON-LD 3rd item is not the grade hub', `${p.url}  (${third.item})`); continue;
    }
    // present and pointing at the hub — only the name is ours to keep in step
    const wantName = JSON.stringify(label.text);
    const haveName = (third.raw.match(/"name"\s*:\s*("(?:[^"\\]|\\.)*")/) || [, ''])[1];
    if (haveName === wantName) jsonState = 'ok';
    else {
      jsonState = 'update';
      s = s.replace(block[0], block[0].replace(third.raw,
        third.raw.replace(/"name"\s*:\s*"(?:[^"\\]|\\.)*"/, `"name": ${wantName}`)));
    }
  } else {
    jsonState = 'insert';
    const hubItem = formatListItem(tail, 3, label.text, hubItemUrl);
    // renumber the page's own item in place, so its formatting and key order survive
    const tailWanted = tail.raw.replace(/"position"\s*:\s*\d+/, '"position": 4');
    const sep = tail.multiline ? `,\n${tail.indent}` : ',\n' + tail.indent;
    s = s.replace(block[0], block[0].replace(tail.raw, `${hubItem}${sep}${tailWanted}`));
  }

  if (visState === 'ok' && jsonState === 'ok') { alreadyOk++; continue; }
  if (visState === 'insert' || jsonState === 'insert') inserted++; else updated++;

  if (s !== s0) {
    changed.push(p.url);
    if (!CHECK) writeFileSync(fp, crlf ? s.replace(/\n/g, '\r\n') : s);
  }
}

// -------------------------------------------------------------------------- report

console.log(`form pages (/family/grade/form/) : ${formPages.length}`);
console.log(`already correct                  : ${alreadyOk}`);
console.log(`crumb inserted                   : ${inserted}`);
console.log(`crumb updated                    : ${updated}`);
console.log(`skipped                          : ${[...skipped.values()].reduce((n, a) => n + a.length, 0)}`);

if (skipped.size) {
  console.log('\nskipped, by reason — every one of these is reported rather than guessed at:');
  for (const [reason, urls] of [...skipped].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n  ${urls.length}  ${reason}`);
    for (const u of urls.slice(0, 12)) console.log(`       ${u}`);
    if (urls.length > 12) console.log(`       ... +${urls.length - 12} more`);
  }
}

if (CHECK) {
  if (changed.length) {
    console.log(`\n${changed.length} page(s) would change:`);
    changed.slice(0, 30).forEach((u) => console.log('   ' + u));
    if (changed.length > 30) console.log(`   ... +${changed.length - 30} more`);
    console.log('\nRun: node docs/build-breadcrumbs.mjs');
    process.exit(1);
  }
  console.log('\nup to date');
} else if (changed.length) {
  console.log(`\nwrote ${changed.length} page(s)`);
} else {
  console.log('\nnothing to write');
}
