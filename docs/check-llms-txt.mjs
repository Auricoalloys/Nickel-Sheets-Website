#!/usr/bin/env node
// Guards llms.txt against the drift documented under "llms.txt is
// hand-maintained and nothing checks it" in CLAUDE.md.
//
// llms.txt mixes hand-written business prose (which mills we sell, how
// pricing works) with grade lists that mirror docs/grades.csv - and only the
// second half is checkable. This script does not write llms.txt: the prose
// is a human's word choice, not derived data, so this only reports.
//
// What it catches: a grade that (a) has a live page, per its own token
// appearing somewhere in sitemap.xml, and (b) is not mentioned anywhere in
// llms.txt at all. That is exactly the bug this script was written after -
// Alloy 59 had four live pages and zero mentions.
//
// The matcher has to understand one piece of English grammar or it floods
// itself with false positives: a qualifier stated once and reused across a
// comma list ("Grades 1, 2, 3...23", "Alloy 20, 28, 31, 926") does not repeat
// the qualifier next to every number. A plain squash-and-substring check
// requires "GRADE23" to sit together in the text, which it never does past
// the first item in such a list - every grade after the first would read as
// missing. So a "Qualifier Code" grade (grades.csv "Grade 23", "Alloy 28",
// or a cross-reference row like "Monel 400") is accepted if the qualifier
// appears anywhere in the candidate text AND the code appears as its own
// comma-delimited list item somewhere in that same text - which is what the
// prose actually does.
//
// Three more shapes get the same treatment for the same reason: a grade
// whose CSV spelling and URL disagree on word order (254 SMO / SMO-254 -
// aliased the same way docs/build-grades.mjs already resolves the URL, see
// GRADE_ALIAS below), a grade carrying a parenthetical alternate name
// (660 (A286), Haynes 25 (L-605)) where only the leading code, never the
// alternate name, appears in a URL or in running prose, and a grade named
// by its UNS number instead of grades.csv's own bare code ("2507 (S32750)"
// in llms.txt against grades.csv's key "32750" - the UNS is a complete,
// unambiguous name for the grade in its own right, so it is tried too).
//
// Matching needs two different tokenisers, not one, because '/' means
// opposite things in the two documents this reads. In llms.txt prose it
// sits *inside* a grade mention ("80/20") and must not be split on. In a
// sitemap.xml <loc> it is the path separator: not splitting on it was a
// real bug caught by testing against the actual sitemap rather than
// assumed correct - it merged a whole URL into one token, so an exact
// match against a bare grade code like "600" always failed.
//
// What it cannot catch, on purpose rather than by oversight:
//   - which of a grade's several legitimate names llms.txt should use. A
//     grade can carry both a mill's own trade designation (ATI calls one
//     grade "Ti-17" in its own bulletin) and a page's own hand-written name
//     ("Ti-5-2-4-4") - preferring one over the other needs the source
//     document, not just the page, so this is left to a human, the same
//     reason build-grades.mjs's own lint only catches contradictions, not
//     which of several correct names to prefer.
//   - a grade verified in grades.csv with no page built yet - that is a
//     publishing backlog, not an llms.txt bug, so it is deliberately not
//     flagged as missing. (Haynes 556, HR-160 and MP35N were the example
//     that motivated this exemption; all three now have pages, so the
//     backlog this catches is empty as of this writing - watch for the
//     next one rather than expecting this list to name anybody current.)
//   - single- and two-character grade codes with no qualifier word in front
//     of them (Hastelloy N, X; Incoloy DS) - too short to search for as a
//     bare substring without false positives, so they are named and skipped
//     rather than silently "passing".
//
// Reports and exits non-zero; it never writes. Run:
//
//   node docs/check-llms-txt.mjs
//
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LLMS_TXT = path.join(ROOT, 'llms.txt');
const GRADES_CSV = path.join(ROOT, 'docs/grades.csv');
const SITEMAP = path.join(ROOT, 'sitemap.xml');

function readCsv(file, expected) {
  if (!fs.existsSync(file)) { console.error(`${path.relative(ROOT, file)} not found`); process.exit(1); }
  const out = [];
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const c = line.split(',').map(x => x.trim());
    if (c[0] === 'family') continue;                         // header
    const row = {};
    expected.forEach((k, i) => { row[k] = c[i] ?? ''; });
    if (!row.family || !row.grade) continue;
    out.push(row);
  }
  return out;
}

// Letters and digits only, uppercased - the same coarse normaliser
// build-calc-links.mjs uses to match a grade across differently-punctuated
// spellings ("625 LCF" vs "625-LCF") without hand-listing every variant.
const squash = s => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const MIN_TOKEN_LEN = 3; // shorter than this and a bare substring search is noise

// "Qualifier Code" shape: a leading word (or two) then a code with no
// internal space - "Grade 23", "Alloy 28", "Monel 400", "Hastelloy C-276".
// A code containing its own space ("Haynes 25 (L-605)") does not match this
// and falls back to the plain whole-token check below.
function splitQualifier(grade) {
  const m = grade.match(/^([A-Za-z][A-Za-z ]*?)\s+([\w/-]+)$/);
  return m ? { qualifier: m[1], code: m[2] } : null;
}

// Does `code` appear as its own delimited item in `text` - a comma/
// semicolon-separated list entry, not merely a substring of a longer number?
function hasListItem(text, code) {
  const items = text.split(/[,;]/);
  if (/^\d+$/.test(code)) {
    return items.some(item => (item.match(/\d+/g) || []).includes(code));
  }
  const squashedCode = squash(code);
  return items.some(item => squash(item).includes(squashedCode));
}

// Two tokenizers, not one, because '/' means opposite things in the two
// documents this script reads. In llms.txt prose it is *inside* a grade
// mention ("80/20", "625 LCF" written as "625-LCF" elsewhere) and must not
// split it apart. In a sitemap.xml <loc> it is the path separator, and not
// splitting on it was a real bug: it merged an entire URL into one token
// ("wwwnickelsheetscominconel600coil"), so an exact-match check against
// "600" alone always failed and every grade fell into "no live page
// detected" - caught by testing against the actual sitemap, not assumed.
//
// Both split on whitespace and the punctuation that separates distinct
// items (commas, semicolons, brackets, parens, quotes); tokenizeUrls also
// splits on '/' and '.' for path segments and the domain. Squashing the
// WHOLE document into one blob and doing a substring search, as this used
// to, let a short numeric code "match" inside an unrelated longer number -
// "601" was found inside "60/15" (squashed "6015") once Inconel 601 wasn't
// in the text at all.
function tokenizeProse(text) {
  return text.split(/[\s,;:()[\]"'–—]+/).map(squash).filter(Boolean);
}

function tokenizeUrls(text) {
  return text.split(/[\s,;:()[\]"'–—/.]+/).map(squash).filter(Boolean);
}

// Exact match against one token, or against 2-3 consecutive tokens
// concatenated (for a grade written as separate words, "625 LCF" -> tokens
// "625","LCF"). Exact, not substring - that is the fix.
function tokensContain(tokens, target) {
  for (let i = 0; i < tokens.length; i++) {
    let acc = '';
    for (let j = i; j < Math.min(i + 3, tokens.length); j++) {
      acc += tokens[j];
      if (acc === target) return true;
      if (acc.length > target.length) break;
    }
  }
  return false;
}

function checkOneForm(tokenize, text, grade) {
  const target = squash(grade);
  if (target.length >= MIN_TOKEN_LEN && tokensContain(tokenize(text), target)) return true;
  const parts = splitQualifier(grade);
  return !!(parts && squash(text).includes(squash(parts.qualifier)) && hasListItem(text, parts.code));
}

// Kept in sync with the identical map in docs/build-grades.mjs and
// docs/build-specs.mjs, for the reason those files give: a grade aliased in
// one and not the others gets checked against text that will never match.
// The trade writes 254 SMO both ways round; grades.csv keeps Outokumpu's own
// order (renaming it would print the mark backwards in every generated
// table), while this site's URL and llms.txt's prose both put the letters
// first.
const GRADE_ALIAS = {
  'special-stainless-steel': { '254SMO': 'SMO254' },
};

// "660 (A286)", "Haynes 25 (L-605)" - a leading code with a parenthetical
// alternate name, where only the leading code ever appears in a URL or in
// running prose. Try the part before the "(" as its own candidate.
function leadingCode(grade) {
  const m = grade.match(/^(.*?)\s*\(/);
  return m ? m[1] : null;
}

// A UNS number is a complete, unambiguous way to name a grade on its own -
// "2507 (S32750)" mentions the grade by writing S32750, even though
// grades.csv's own key for it is the bare "32750" ASTM drops the letter
// prefix from. Try each UNS grades.csv records (it can be a list, "S32205 /
// S31803") as its own candidate alongside the grade name.
function unsCandidates(uns) {
  if (!uns || uns === '-') return [];
  return uns.split('/').map(s => s.trim()).filter(Boolean);
}

function gradeMentioned(tokenize, text, grade, family, uns) {
  if (checkOneForm(tokenize, text, grade)) return true;
  const alias = GRADE_ALIAS[family]?.[squash(grade)];
  if (alias && tokensContain(tokenize(text), alias)) return true;
  const lead = leadingCode(grade);
  if (lead && checkOneForm(tokenize, text, lead)) return true;
  const tokens = tokenize(text);
  return unsCandidates(uns).some(u => tokensContain(tokens, squash(u)));
}

const grades = readCsv(GRADES_CSV,
  ['family', 'grade', 'uns', 'wnr', 'en_name', 'density_g_cm3', 'melting_c', 'source', 'checked']);

const llmsText = fs.readFileSync(LLMS_TXT, 'utf8');

const sitemapText = fs.existsSync(SITEMAP) ? fs.readFileSync(SITEMAP, 'utf8') : '';
if (!sitemapText) { console.error('sitemap.xml not found - run node docs/build-sitemap.mjs first'); process.exit(1); }
const liveUrlsText = Array.from(sitemapText.matchAll(/<loc>([^<]*)<\/loc>/g)).map(m => m[1]).join('\n');

const skipped = [];
const noLivePage = [];
const missing = [];
let checked = 0;

for (const row of grades) {
  if (squash(row.grade).length < MIN_TOKEN_LEN && !splitQualifier(row.grade)) {
    skipped.push(`${row.family}/${row.grade} - too short to search for reliably`);
    continue;
  }

  if (!gradeMentioned(tokenizeUrls, liveUrlsText, row.grade, row.family, row.uns)) {
    noLivePage.push(`${row.family}/${row.grade}`);
    continue; // verified in the CSV but no page built - a backlog, not an llms.txt bug
  }

  checked++;
  if (!gradeMentioned(tokenizeProse, llmsText, row.grade, row.family, row.uns)) {
    missing.push(`${row.family}/${row.grade}${row.uns && row.uns !== '-' ? ` (${row.uns})` : ''}`);
  }
}

console.log(`llms.txt check - ${grades.length} grades.csv rows, ${checked} have a live page and were checked, ` +
  `${skipped.length} skipped, ${noLivePage.length} have no detected live page`);
for (const s of skipped) console.log(`   skipped: ${s}`);
if (noLivePage.length) {
  console.log(`   no live page detected (not flagged - may just be a publishing backlog, or this script's own page-detection gap):`);
  for (const n of noLivePage) console.log(`      ${n}`);
}

if (missing.length) {
  console.log(`\n${missing.length} grade(s) have a live page but are not mentioned anywhere in llms.txt:`);
  for (const m of missing) console.log(`   ${m}`);
  console.log('\nAdd a mention (existing family line, or a new standalone line) and re-run.');
  process.exit(1);
}

console.log('llms.txt is up to date');
