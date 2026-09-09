#!/usr/bin/env node
// Guards the nesting of every page's <main>.
//
// This site's worst markup bugs have all been invisible ones. A <div> that is
// never closed does not break the page - the browser closes it for you at
// </main>, the layout still looks right, and the sections below it quietly
// become children of a layout column instead of siblings of it. That is how
// `div.details` came to swallow #grades, #applications, #quality and #cta on
// seven hub pages, and how `div.container.my-5` swallowed the body of eight
// service pages. Both were found by counting tags, never by looking.
//
// So this counts tags. For each page it walks <main>...</main> with a stack,
// applying the implicit-close rules a browser applies, and reports:
//
//   unclosed   elements still open when </main> arrives - the browser closed
//              these for you, and everything after them is nested a level
//              deeper than the author meant
//   stray      a closing tag matching nothing open - the browser drops it, so
//              a missing OPEN tag shows up here (an orphan </p> means the
//              paragraph above it never opened)
//   crossed    a closing tag that had to close other elements to reach its own
//              match, e.g. </section> closing an open <div>. The tags are
//              interleaved rather than nested, and the DOM is not what the
//              indentation says it is
//
// It also prints each page's DOM signature on request:
//
//   node docs/check-tags.mjs --sig <file>     depth + tag#id.class, in order
//
// The signature is what makes a repair reviewable. Closing a div immediately
// before </main> only writes down the close the browser was already doing, so
// the signature does not move and nothing a reader sees changes - that is a
// boilerplate commit, and its SHA belongs in the BOILERPLATE set at the top of
// build-sitemap.mjs. A repair that CHANGES the signature has genuinely
// re-nested content and is a content commit. The two must not share a commit,
// because BOILERPLATE keys on a whole one. Diff the signatures to tell which
// you are holding:
//
//   node docs/check-tags.mjs --sig path/page.html > /tmp/before
//   ...edit...
//   node docs/check-tags.mjs --sig path/page.html | diff /tmp/before -
//
// Reports and exits non-zero; it never writes. Run:
//
//   node docs/check-tags.mjs            check every page
//   node docs/check-tags.mjs <file>...  check just these
//
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// _site is a build output, docs/ holds generators and the standalone powder
// sheets, and html/ holds the header and footer fragments - which are half a
// document each and never balance on their own.
const SKIP_DIRS = new Set(['.git', '.vscode', '.claude', 'node_modules', '_site',
  'vendor', '.bundle', '.github', 'docs', 'tools', 'html']);

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr']);

// A start tag in this set closes an open <p>. Without this rule a perfectly
// ordinary `<p>text<div>` reports a stray </p> later, and the report drowns.
const CLOSES_P = new Set(['address', 'article', 'aside', 'blockquote', 'details',
  'div', 'dl', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2',
  'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'main', 'nav', 'ol', 'p', 'pre',
  'section', 'table', 'ul']);

// tag -> the open tags it implicitly closes when it appears.
const IMPLICIT = {
  li: new Set(['li', 'p']),
  dt: new Set(['dt', 'dd', 'p']),
  dd: new Set(['dt', 'dd', 'p']),
  tr: new Set(['tr', 'td', 'th', 'p']),
  td: new Set(['td', 'th', 'p']),
  th: new Set(['td', 'th', 'p']),
  tbody: new Set(['thead', 'tbody', 'tr', 'td', 'th', 'p']),
  tfoot: new Set(['thead', 'tbody', 'tr', 'td', 'th', 'p']),
  thead: new Set(['p']),
  option: new Set(['option', 'p']),
};

// </br> is not a real end tag - browsers treat it as <br> - so authors write it
// harmlessly and it is not worth a finding. </p> very much is: the browser turns
// an orphan one into an empty paragraph, and it means the paragraph above it
// never opened. There are four on the whole site, and one of them was a service
// page whose intro text sat outside any <p> at all.
const IGNORE_STRAY = new Set(['br']);

// Blank out anything that is not markup but can contain '<'. Replacing each
// run with spaces of the same length keeps every byte offset, so line numbers
// stay true.
const blank = m => ' '.repeat(m.length);
function scrub(s) {
  return s
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi, (m, a, b, c) => a + blank(b) + c)
    .replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (m, a, b, c) => a + blank(b) + c)
    // Jekyll expands these at build time; they are not this page's markup.
    .replace(/\{%[\s\S]*?%\}/g, blank)
    .replace(/\{\{[\s\S]*?\}\}/g, blank);
}

// Walk tags honouring quoted attribute values, so alt="a > b" does not end the
// tag early. A regex cannot do this: /<[^>]*>/ stops at that quoted '>'.
//
// An unbalanced quote is the trap here. Three busbar pages carried a stray '"'
// alone on the line after an alt="...", and a scanner that trusts quotes then
// swallows the entire rest of the document looking for the partner - silently,
// reporting whatever happened to be open at that point and never seeing the
// 150 elements that followed. The checker under-reported and looked confident.
//
// Two signals say the scan lost sync, and neither is the tag's length: this
// site has a legitimate 2,966-character <path> whose `d` holds a whole icon,
// so a length cap only fires on the innocent. What is true of every well-formed
// tag is that it contains exactly one '<', at its start. So a scan is malformed
// when it reaches the end without a '>', or when what it swallowed contains a
// '<' of its own. Either way, resync on the first '>' after the tag name.
function* tags(s) {
  let i = 0;
  while (i < s.length) {
    const lt = s.indexOf('<', i);
    if (lt === -1) return;
    const c = s[lt + 1];
    if (!c || !/[a-zA-Z/!?]/.test(c)) { i = lt + 1; continue; }
    if (c === '!' || c === '?') {                 // doctype, CDATA, stray
      const gt = s.indexOf('>', lt);
      i = gt === -1 ? s.length : gt + 1;
      continue;
    }
    let j = lt + 1;
    const closing = s[j] === '/';
    if (closing) j++;
    const from = j;
    while (j < s.length && /[a-zA-Z0-9-]/.test(s[j])) j++;
    const name = s.slice(from, j).toLowerCase();
    if (!name) { i = lt + 1; continue; }
    const attrsFrom = j;
    let quote = null, malformed = false;
    while (j < s.length) {
      const ch = s[j];
      if (quote) { if (ch === quote) quote = null; }
      else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '>') break;
      j++;
    }
    if (j >= s.length || s.lastIndexOf('<', j) !== lt) {   // lost sync: recover
      const gt = s.indexOf('>', attrsFrom);
      if (gt === -1) return;                      // genuinely no '>' left
      j = gt;
      malformed = true;
    }
    yield { name, closing, raw: s.slice(lt, j + 1), pos: lt, malformed };
    i = j + 1;
  }
}

const attr = (raw, key) => {
  const m = raw.match(new RegExp(`\\b${key}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? (m[2] ?? m[3] ?? m[4]) : null;
};

// tag#id.class.class - enough to find the element in the source by eye, and
// stable across everything except a real change of nesting or of attributes.
const label = t => {
  const id = attr(t.raw, 'id');
  const cls = attr(t.raw, 'class');
  return t.name + (id ? `#${id}` : '') +
    (cls ? '.' + cls.trim().split(/\s+/).join('.') : '');
};

export function analyse(file) {
  // Every page in the working tree is CRLF while the index holds LF. Do all
  // the work in LF space so offsets, line numbers and signatures are identical
  // either way - the same guard every generator in docs/ carries.
  const src = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const body = scrub(src);

  const open = body.search(/<main\b/i);
  const shut = body.search(/<\/main\s*>/i);
  if (open === -1 || shut === -1) return null;      // no <main>: nothing to check

  const region = body.slice(open, shut);
  const lineOf = pos => src.slice(0, open + pos).split('\n').length;

  const stack = [];
  const sig = [];
  const stray = [];
  const crossed = [];
  const malformed = [];
  let divOpen = 0, divClose = 0;

  for (const t of tags(region)) {
    if (t.malformed) {
      malformed.push({
        tag: t.name, line: lineOf(t.pos), pos: open + t.pos,
        text: t.raw.replace(/\s+/g, ' ').slice(0, 70),
      });
    }
    if (t.name === 'main' && !t.closing) continue;
    if (t.name === 'div') t.closing ? divClose++ : divOpen++;

    if (t.closing) {
      const at = stack.map(e => e.name).lastIndexOf(t.name);
      if (at === -1) {
        if (!IGNORE_STRAY.has(t.name))
          stray.push({ tag: t.name, line: lineOf(t.pos), pos: open + t.pos, raw: t.raw });
        continue;
      }
      // Anything above the match is closed by reaching it: the tags interleave.
      for (const victim of stack.slice(at + 1)) {
        crossed.push({
          closed: victim.label, name: victim.name, openedAt: victim.line,
          openedPos: victim.pos, by: t.name, line: lineOf(t.pos), pos: open + t.pos,
        });
      }
      stack.length = at;
      continue;
    }

    if (VOID.has(t.name) || /\/\s*>$/.test(t.raw)) {
      sig.push(`${stack.length}:${label(t)}`);
      continue;
    }
    if (CLOSES_P.has(t.name) && stack.length && stack[stack.length - 1].name === 'p') stack.pop();
    const kills = IMPLICIT[t.name];
    while (kills && stack.length && kills.has(stack[stack.length - 1].name)) stack.pop();

    sig.push(`${stack.length}:${label(t)}`);
    stack.push({ name: t.name, label: label(t), line: lineOf(t.pos), pos: open + t.pos });
  }

  return {
    file,
    divOpen, divClose, divDelta: divOpen - divClose,
    unclosed: stack, stray, crossed, malformed,
    mainClosePos: shut,
    signature: sig.join('\n'),
    clean: stack.length === 0 && stray.length === 0 && crossed.length === 0 &&
      malformed.length === 0,
  };
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) walk(fp, out);
    else if (/\.html?$/i.test(e.name)) out.push(fp);
  }
  return out;
}

const rel = fp => path.relative(ROOT, fp).replace(/\\/g, '/');

// ---- run ---------------------------------------------------------------------
// Only when invoked directly. `analyse` is exported so a one-off repair script
// can diff a page's signature before and after its edit; importing this file
// must not run a sitewide check as a side effect.
const invokedDirectly = process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (!invokedDirectly) { /* imported for analyse() */ }
else runCli();

function runCli() {
const argv = process.argv.slice(2);

if (argv[0] === '--sig') {
  const target = argv[1];
  if (!target) { console.error('--sig needs a file'); process.exit(2); }
  const r = analyse(path.resolve(ROOT, target));
  if (!r) { console.error(`${target}: no <main> region`); process.exit(2); }
  console.log(r.signature);
  process.exit(0);
}

const files = argv.length ? argv.map(f => path.resolve(ROOT, f)) : walk(ROOT);
const bad = [];
let checked = 0, noMain = 0;

for (const fp of files.sort()) {
  const r = analyse(fp);
  if (!r) { noMain++; continue; }
  checked++;
  if (!r.clean) bad.push(r);
}

if (!bad.length) {
  console.log('tags: every <main> is balanced');
  console.log(`  pages checked      : ${checked}`);
  console.log(`  skipped, no <main> : ${noMain}`);
  process.exit(0);
}

const n = { unclosed: 0, stray: 0, crossed: 0, malformed: 0 };
for (const r of bad) {
  n.unclosed += r.unclosed.length;
  n.stray += r.stray.length;
  n.crossed += r.crossed.length;
  n.malformed += r.malformed.length;
}

console.error(`tags: ${bad.length} of ${checked} pages do not balance`);
console.error(`      ${n.unclosed} unclosed, ${n.stray} stray close, ${n.crossed} crossed,` +
  ` ${n.malformed} malformed\n`);

for (const r of bad) {
  const d = r.divDelta;
  console.error(`  ${rel(r.file)}${d ? `   div ${d > 0 ? '+' : ''}${d}` : ''}`);
  for (const m of r.malformed)
    console.error(`      malformed tag       <${m.tag}>  line ${m.line}  (unbalanced quote: ${m.text})`);
  for (const u of r.unclosed)
    console.error(`      unclosed at </main>  <${u.label}>  opened line ${u.line}`);
  for (const s of r.stray)
    console.error(`      stray close         </${s.tag}>  line ${s.line}  (its opening tag is missing)`);
  for (const c of r.crossed)
    console.error(`      crossed             </${c.by}> at line ${c.line} closes <${c.closed}> from line ${c.openedAt}`);
}

console.error('\nNone of this breaks a page - the browser repairs it and the layout still');
console.error('looks right, which is why it goes unnoticed. It does change what nests');
console.error('inside what. Close the element where the author meant it to close, then');
console.error('prove nothing else moved with --sig (see the header of this file).');
process.exit(1);
}
