// Keeps prices-todo.csv: every page that could carry a price but has none yet.
//
//   node docs/build-price-worklist.mjs           refresh the worklist
//   node docs/build-price-worklist.mjs --adopt   move filled rows into prices.csv
//   node docs/build-price-worklist.mjs --check   report drift, write nothing, exit 1
//
// Why this exists: pricing a page used to mean finding its permalink first and
// copying it into prices.csv by hand, so the tedious half of the job came before
// the half that needs judgement. This writes the url column for you. Fill in the
// numbers on the rows you know, run --adopt, and those rows move into prices.csv
// - the single source of truth stays the single source of truth, and this file
// is only ever the queue in front of it.
//
// What lands here is a page that is BOTH unpriced and off the schema: it has a
// Product node in its JSON-LD but no offers block, because docs/build-prices.mjs
// strips offers from any page with no row in prices.csv. So a row here is a page
// currently eligible for no rich result, and filling it in is what wins one back.
//
// A page with nowhere visible to print the figure is listed as a comment, not as
// a fillable row. build-prices.mjs would refuse to write schema for it, and
// marking up a price a reader cannot see is the policy breach that pipeline
// exists to avoid - so this will not hand you a row that cannot be honoured.
//
// This script is excluded from the published site in _config.yml, as is the
// worklist it writes: it is an internal queue, not a page.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRICES = path.join(ROOT, 'prices.csv');
const TODO = path.join(ROOT, 'prices-todo.csv');
const CHECK = process.argv.includes('--check');
// --check writes nothing, ever, including when --adopt is passed alongside it.
// CI runs the other --check generators; one that could edit prices.csv from a
// workflow would publish a price nobody reviewed.
const ADOPT = process.argv.includes('--adopt') && !CHECK;

// Kept in step with docs/build-prices.mjs - see the note there on why a quarter.
// A price adopted from here is only claimable for this long after prices.csv's
// "# updated:" line, so adopting into a stale file mints a price that is already
// expired - warned about at the end.
const VALID_DAYS = 100;

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

const norm = u => {
  let s = String(u || '').trim().replace(/^["']|["']$/g, '');
  if (!s) return '';
  if (!s.startsWith('/')) s = '/' + s;
  if (!s.endsWith('/')) s += '/';
  return s;
};
const inr = n => Number(n).toLocaleString('en-IN');

// Quote-aware, because this file is filled in by hand and a spreadsheet is the
// obvious tool for that. Excel writes a thousands-separated cell as "2,400", and
// a plain split on commas turns that one price into two fields - shifting every
// column after it, so 2,400 to 3,900 adopts as INR 2 to 400 per kg. A wrong
// price published is worse than no price, which is the premise of this whole
// pipeline, so the rows this file collects get a parser that can see quotes.
function splitCsv(line) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

// A price cell is digits, and may carry the separators a person types around
// them. Anything else - "2400-3900" in one cell, "~2400", "n/a" - is refused by
// name rather than coerced, because stripping the non-digits out of "2400-3900"
// yields 24,003,900 and adopts without complaint.
function cell(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return { value: null };
  if (!/^(?:INR|Rs\.?|USD|[₹$])?[\s]*\d[\d,\s]*$/i.test(s)) return { error: `"${s}" is not a plain number` };
  return { value: Number(s.replace(/[^0-9]/g, '')) };
}
const num = v => cell(v).value ?? null;

// The URL segments that name a product form rather than a grade. Used only to
// group the worklist for reading: /haynes/plates/ is a form hub belonging under
// /haynes/, while /inconel/600/ is a grade that owns the forms beneath it.
// Getting one wrong costs nothing but a row filed under the wrong heading.
const FORMS = new Set(['plates', 'sheets', 'coil', 'foil', 'strip', 'round-bar', 'hex-bar',
  'hollow-bars', 'wire', 'pipe', 'pipes', 'tube', 'tubes', 'fittings', 'flanges',
  'forged-fittings', 'powder', 'rod', 'bar', 'washers', 'fasteners', 'billet', 'forgings']);

function familyOf(url) {
  const seg = url.split('/').filter(Boolean);
  if (!seg.length) return '';
  return (seg.length > 1 ? seg[0] : seg[0].split('-')[0]).toLowerCase();
}
function groupOf(url) {
  const seg = url.split('/').filter(Boolean);
  if (seg.length >= 2) {
    return FORMS.has(seg[1].toLowerCase()) ? `/${seg[0]}/` : `/${seg[0]}/${seg[1]}/`;
  }
  return `/${familyOf(url)}-...`;   // flat SEO permalink, no hierarchy to read
}

// ---- what is already priced -------------------------------------------------
if (!fs.existsSync(PRICES)) { console.error('prices.csv not found'); process.exit(1); }
const pricesRaw = fs.readFileSync(PRICES, 'utf8');
const crlf = pricesRaw.includes('\r\n');
const eol = crlf ? '\r\n' : '\n';
const priced = new Map();
let updated = null;
for (const raw of pricesRaw.split(/\r?\n/)) {
  const line = raw.trim();
  if (!line) continue;
  if (line.startsWith('#')) {
    const m = line.match(/^#\s*updated\s*:\s*(\d{4}-\d{2}-\d{2})/i);
    if (m) updated = m[1];
    continue;
  }
  const c = line.split(',').map(x => x.trim());
  if (c[0].toLowerCase() === 'url') continue;
  const u = norm(c[0]);
  if (!u || !c[1] || !c[2]) continue;
  priced.set(u, { lowInr: num(c[1]), highInr: num(c[2]), unit: c[5] || 'kg' });
}

// ---- what could be priced ---------------------------------------------------
const candidates = [];      // Product node, somewhere to show the figure, own canonical
const unshowable = [];      // Product node, nowhere to show it
const twins = [];           // Product node, but canonical points at another page
for (const fp of walk(ROOT)) {
  const rel = path.relative(ROOT, fp).split(path.sep).join('/');
  const s = fs.readFileSync(fp, 'utf8').replace(/\r\n/g, '\n');
  const fm = s.match(/^﻿?---\s*\n([\s\S]*?)\n---/);
  if (!fm || /^published:\s*false/m.test(fm[1])) continue;
  const url = norm((fm[1].match(/^permalink:\s*(.+)$/m) || [, ''])[1]);
  if (!url || priced.has(url)) continue;

  // Only a Product node can carry offers, so only a Product page can be "off the
  // schema" in the sense that matters here. Country landing pages and family
  // hubs have spec tables but no Product node, and are deliberately left out.
  //
  // Deliberately a text match on the raw page rather than a JSON-LD parse. An
  // unpriced page has its Product node parked inside an HTML comment by
  // build-prices.mjs, because a Product with no offers is an invalid item - and
  // a parse would not see it, so every page in this queue would drop out of the
  // queue the moment it was parked. That is the whole backlog disappearing on
  // the run that fixes the markup. Keep this matching parked nodes too.
  if (!/"@type":\s*"Product"/.test(s)) continue;

  // The same three anchors docs/build-prices.mjs looks for, in the same order.
  const showable = /<th[^>]*>Price<\/th><td>/.test(s)
    || s.includes('spec-table')
    || /<caption>[^<]*key specification<\/caption>/i.test(s);
  // A page whose canonical names a different URL is a deprecated twin: it tells
  // Google the other page is the real one, so an offers block here is markup on
  // the URL that will not be indexed, and the price does not reach the page that
  // is. Two batches ran aground on this - twelve rows priced on twins whose
  // canonical target sat unpriced beside them - so the queue no longer offers
  // them and names the page to price instead.
  const canon = (s.match(/rel="canonical"\s+href="([^"]*)"/) || [, ''])[1].replace(/^https?:\/\/[^/]+/, '');
  if (canon && norm(canon) !== url) { twins.push({ url, rel, canon: norm(canon) }); continue; }

  (showable ? candidates : unshowable).push({ url, rel });
}
const candidateUrls = new Set(candidates.map(c => c.url));

// ---- what the last worklist collected ---------------------------------------
// Everything wrong with a typed row is collected rather than thrown, so one
// mistyped cell reports itself alongside the rest instead of hiding them.
const problems = [];
const typed = new Map();
const malformed = [];
if (fs.existsSync(TODO)) {
  for (const raw of fs.readFileSync(TODO, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const c = splitCsv(line);
    if (c[0].toLowerCase() === 'url') continue;
    const u = norm(c[0]);
    if (!u) continue;
    // Six columns, no more. An extra one means an unquoted comma inside a
    // number, which has shifted every value one column to the right. Keeping
    // the line verbatim lets the next refresh hand it back to be corrected,
    // rather than rewriting it into the wrong-but-plausible row it parsed as.
    if (c.length > 6) { malformed.push({ url: u, line }); continue; }
    typed.set(u, { lowInr: c[1] || '', highInr: c[2] || '', lowUsd: c[3] || '', highUsd: c[4] || '', unit: c[5] || 'kg' });
  }
}
const malformedUrls = new Map(malformed.map(m => [m.url, m.line]));
for (const m of malformed) {
  problems.push(`${m.url}  ${splitCsv(m.line).length} columns, expected 6 - an unquoted comma inside a number (write 2400, or "2,400")`);
}

// A row counts as filled once both INR figures are there. USD is shown on the
// page as indicative only and build-prices.mjs treats it as optional, so a
// missing pair never blocks adoption - but half a pair is a slip, not a choice.
function ready(u, t) {
  const bad = m => { problems.push(`${u}  ${m}`); return null; };
  const cells = { low_inr: cell(t.lowInr), high_inr: cell(t.highInr), low_usd: cell(t.lowUsd), high_usd: cell(t.highUsd) };
  for (const [name, c] of Object.entries(cells)) if (c.error) return bad(`${name}: ${c.error}`);

  const lo = cells.low_inr.value, hi = cells.high_inr.value;
  if (lo === null && hi === null) return null;
  if (lo === null || hi === null) return bad('only one of low_inr/high_inr filled in');
  if (lo <= 0 || hi <= 0) return bad('price must be above zero');
  if (lo > hi) return bad(`low_inr ${lo} is above high_inr ${hi}`);

  const ulo = cells.low_usd.value, uhi = cells.high_usd.value;
  if ((ulo === null) !== (uhi === null)) return bad('only one of low_usd/high_usd filled in');
  if (ulo !== null && (ulo <= 0 || uhi <= 0)) return bad('price must be above zero');
  if (ulo !== null && ulo > uhi) return bad(`low_usd ${ulo} is above high_usd ${uhi}`);

  // Say which kind of "cannot adopt this" it is. A row can end up here because
  // the price is already published, because the page is a canonical twin, or
  // because there is nowhere to print the figure - and "no such page" sent the
  // last investigation down the wrong path for all three.
  if (!candidateUrls.has(u)) {
    const p = priced.get(u);
    if (p) return bad(`already published at INR ${inr(p.lowInr)}-${inr(p.highInr)} per ${p.unit} - change a published price in prices.csv, not here`);
    const t = twins.find(x => x.url === u);
    if (t) return bad(`canonical points at ${t.canon} - price that page instead`);
    if (unshowable.some(x => x.url === u)) return bad('no spec table or Price row on the page to print the figure on');
    return bad('no page has that permalink - typo, or the page moved');
  }
  return { lowInr: lo, highInr: hi, lowUsd: ulo, highUsd: uhi, unit: t.unit || 'kg' };
}

const filled = [];
for (const [u, t] of typed) {
  const r = ready(u, t);
  if (r) filled.push({ url: u, ...r });
}
filled.sort((a, b) => a.url.localeCompare(b.url));

// Rows the tree no longer backs: the page was renamed, unpublished, or lost its
// Product node. Reported rather than dropped in silence - an empty row vanishing
// is invisible, but a typed one vanishing is lost work.
// Twins and pages with nowhere to print a figure are excluded on purpose and say
// so in the refusal list above; counting them here as well reported them twice,
// the second time under a heading that blamed a missing page.
const excluded = new Set([...twins.map(t => t.url), ...unshowable.map(x => x.url)]);
const orphaned = [...typed.keys()].filter(u => !candidateUrls.has(u) && !priced.has(u) && !excluded.has(u));

// ---- adopt ------------------------------------------------------------------
// Appended, never inserted in sorted position: prices.csv is roughly alphabetical
// with later additions at the end, and reordering it would bury a two-line change
// in a several-hundred-line diff.
let adopted = [];
if (ADOPT && filled.length) {
  const rows = filled.map(r =>
    `${r.url},${r.lowInr},${r.highInr},${r.lowUsd == null ? '' : r.lowUsd},${r.highUsd == null ? '' : r.highUsd},${r.unit}`);
  fs.writeFileSync(PRICES, pricesRaw.replace(/[\r\n]+$/, '') + eol + rows.join(eol) + eol);
  adopted = filled.map(r => r.url);
  for (const r of filled) {
    priced.set(r.url, { lowInr: r.lowInr, highInr: r.highInr, unit: r.unit });
    typed.delete(r.url);
  }
}

// ---- write the worklist -----------------------------------------------------
const pending = candidates.filter(c => !priced.has(c.url)).map(c => c.url).sort((a, b) => a.localeCompare(b));

// What the rest of a family already sells for. Most of these pages are one form
// of a grade already priced in another form, so the figure to start from is
// usually in prices.csv already - showing it here saves opening that file.
const familyRange = new Map();
for (const [u, p] of priced) {
  const f = familyOf(u);
  const cur = familyRange.get(f) || { lo: Infinity, hi: 0, n: 0, unit: p.unit };
  cur.lo = Math.min(cur.lo, p.lowInr);
  cur.hi = Math.max(cur.hi, p.highInr);
  cur.n++;
  familyRange.set(f, cur);
}

const groups = new Map();
for (const u of pending) {
  const g = groupOf(u);
  if (!groups.has(g)) groups.set(g, []);
  groups.get(g).push(u);
}
const famOfGroup = g => familyOf(g.replace(/-\.\.\.$/, '/'));
const ordered = [...groups.keys()].sort((a, b) => famOfGroup(a).localeCompare(famOfGroup(b)) || a.localeCompare(b));

const today = new Date().toISOString().slice(0, 10);
const out = [
  '# Pages that could carry a price and do not have one yet.',
  '#',
  '# Every row here is a page with a Product node in its JSON-LD but no offers',
  '# block, because docs/build-prices.mjs strips offers from any page absent from',
  '# prices.csv. So each row is a page currently eligible for no rich result.',
  '#',
  '# THIS FILE IS A QUEUE, NOT A SOURCE OF TRUTH. Nothing reads it at build time.',
  '# prices.csv is still the only file that sets a published price.',
  '#',
  '# To price a page, fill in low_inr and high_inr on its row - and low_usd and',
  '# high_usd, which the page shows as indicative only and are optional - then:',
  '#',
  '#   node docs/build-price-worklist.mjs --adopt   moves filled rows to prices.csv',
  '#   node docs/build-prices.mjs                   writes them into the pages',
  '#',
  '# Adopted rows leave this file on the next refresh; rows left empty stay. Do not',
  '# edit the url column: it is regenerated from the source tree, and a URL that',
  '# matches no page is refused rather than adopted.',
  '#',
  '# Update the "# updated:" date in prices.csv when you finish a pricing pass.',
  '# priceValidUntil is derived from it, so a price adopted into a stale file is',
  '# published already expired.',
  '#',
  `# generated: ${today} by docs/build-price-worklist.mjs`,
  `# pending: ${pending.length} page(s)`,
  '',
  'url,low_inr,high_inr,low_usd,high_usd,unit',
];

for (const g of ordered) {
  const urls = groups.get(g);
  const r = familyRange.get(famOfGroup(g));
  const hint = r ? `  |  ${famOfGroup(g)} priced on ${r.n} page(s) at INR ${inr(r.lo)}-${inr(r.hi)} per ${r.unit}` : '';
  out.push('');
  out.push(`# ${g}  (${urls.length})${hint}`);
  for (const u of urls) {
    if (malformedUrls.has(u)) { out.push(malformedUrls.get(u)); continue; }
    const t = typed.get(u);
    out.push(`${u},${t?.lowInr || ''},${t?.highInr || ''},${t?.lowUsd || ''},${t?.highUsd || ''},${t?.unit || 'kg'}`);
  }
}

if (unshowable.length) {
  out.push('');
  out.push('# ---------------------------------------------------------------------------');
  out.push('# Product pages with nowhere to print the figure: no spec table, no Price row.');
  out.push('# Left as comments on purpose. build-prices.mjs writes no schema for these, and');
  out.push('# a price in the markup that the reader cannot see on the page breaches');
  out.push("# Google's structured data policy. Give the page a spec table first, re-run");
  out.push('# this script, and it appears above as a fillable row.');
  for (const c of unshowable.sort((a, b) => a.url.localeCompare(b.url))) {
    out.push(`# ${c.url}   (${c.rel})`);
  }
}

if (twins.length) {
  out.push('');
  out.push('# ---------------------------------------------------------------------------');
  out.push('# Deprecated twins: their canonical names a different URL, so Google indexes');
  out.push('# the other page and an offers block here reaches nobody. Price the canonical');
  out.push('# instead - it is a fillable row above unless it is already in prices.csv.');
  const unpriced = twins.filter(t => !priced.has(t.canon) && !pending.includes(t.canon));
  for (const t of twins.sort((a, b) => a.url.localeCompare(b.url))) {
    out.push(`# ${t.url}   ->   ${t.canon}`);
  }
  if (unpriced.length) {
    out.push('#');
    out.push(`# ${unpriced.length} of those canonical targets are neither priced nor in the queue:`);
    for (const t of unpriced) out.push(`#   ${t.canon}`);
  }
}
out.push('');

const todoText = out.join(eol);

// ---- report -----------------------------------------------------------------
if (CHECK) {
  // Compare everything except the generated date. It changes daily, so including
  // it would report drift every morning on a file nobody had touched.
  const bare = t => t.split(/\r?\n/).filter(l => !/^#\s*(generated|pending):/.test(l)).join('\n');
  if (!fs.existsSync(TODO) || bare(fs.readFileSync(TODO, 'utf8')) !== bare(todoText)) {
    console.error('prices-todo.csv is STALE - run: node docs/build-price-worklist.mjs');
    process.exit(1);
  }
  if (filled.length) {
    console.error(`${filled.length} filled row(s) waiting - run: node docs/build-price-worklist.mjs --adopt`);
    process.exit(1);
  }
  console.log(`prices-todo.csv is current (${pending.length} page(s) still unpriced)`);
  process.exit(0);
}

fs.writeFileSync(TODO, todoText);

console.log(`prices-todo.csv written (${today})`);
console.log(`  priced already         : ${priced.size}`);
console.log(`  unpriced, fillable     : ${pending.length}`);
if (unshowable.length) console.log(`  unpriced, no anchor    : ${unshowable.length}  (listed as comments, not rows)`);
if (adopted.length) {
  console.log(`  adopted into prices.csv: ${adopted.length}`);
  adopted.forEach(u => console.log('     ' + u));
  console.log('  now run: node docs/build-prices.mjs');
} else if (filled.length) {
  console.log(`  filled and ready       : ${filled.length}  - run with --adopt to move them into prices.csv`);
}
if (orphaned.length) {
  console.log(`  rows with no page (${orphaned.length}) - dropped from the worklist:`);
  orphaned.forEach(u => console.log('     ' + u));
}
if (problems.length) {
  console.log(`  rows not adopted (${problems.length}):`);
  problems.forEach(p => console.log('     ' + p));
}
if (updated) {
  const expires = new Date(updated + 'T00:00:00Z');
  expires.setUTCDate(expires.getUTCDate() + VALID_DAYS);
  const when = expires.toISOString().slice(0, 10);
  const days = Math.round((expires - new Date(today + 'T00:00:00Z')) / 86400000);
  // Three weeks' notice, not ten days: on a quarterly cadence the warning has to
  // arrive with enough time left to actually run a pricing pass, or it only ever
  // tells you the prices have already lapsed.
  if (days <= 0) console.log(`  WARNING: prices.csv is dated ${updated}, so every price expired on ${when}. Update that line before adopting.`);
  else if (days <= 21) console.log(`  note: prices.csv is dated ${updated}; prices expire ${when} (${days} day(s) left) - time to start the next pass.`);
}
