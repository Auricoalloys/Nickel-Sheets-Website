#!/usr/bin/env node
// Guards the one table look.
//
// The site had three table systems - .grade-table at 15px/12px cells,
// .spec-table at 16px/15px cells with a 30% label column, and bare Bootstrap
// .table at 8px - so two tables stating the same kind of data one above the
// other on a grade hub shared no measurement. Worse, the colour of a <th> was
// decided by the order of two <link> tags: `.table th` and Bootstrap's
// `.table > :not(caption) > * > *` are both specificity (0,1,1), a tie broken
// by source order, and 391 pages list pages.css first while 336 list bootstrap
// first. 8,349 row-header cells rendered one of two ways with nobody choosing
// either, and on six of the bootstrap-first pages a navy link landed on a navy
// cell - the three grade links on the Monel family hub were invisible.
//
// The system now lives in one block, qualified with `body` so it outranks
// Bootstrap in either order. These four checks keep it that way. Each one is a
// route by which a table went its own way before:
//
//   1. the two copies of the block drift apart
//   2. a <table> carries a class no stylesheet defines
//   3. a <table> carries an inline style or a presentational attribute
//   4. a page styles tables in its own <style> block
//
// Reports and exits non-zero; it never writes. Run:
//
//   node docs/check-tables.mjs
//
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const START = '/* ===== table system : start';
const END = '/* ===== table system : end';

// docs/powder-datasheets holds standalone generated sheets that are excluded
// from the build in _config.yml and carry their own self-contained styling.
const SKIP_DIRS = new Set(['.git', '.vscode', '.claude', 'node_modules', '_site',
  'vendor', '.bundle', '.github', 'docs', 'tools']);

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
const stripComments = css => css.replace(/\/\*[\s\S]*?\*\//g, ' ');

// Every class name any stylesheet defines a rule for. Read from the selector
// half of each rule so a class named only inside a content string or a comment
// does not count as defined.
function definedClasses(css) {
  const found = new Set();
  for (const chunk of stripComments(css).split('}')) {
    const sel = chunk.split('{')[0];
    if (!sel || chunk.indexOf('{') < 0) continue;
    for (const m of sel.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) found.add(m[1]);
  }
  return found;
}

const findings = [];
const note = (check, detail) => findings.push({ check, detail });

// A count of 0 cannot tell you what a check never looked at - the reason
// alt_alloy_mismatch reported a clean 0 while evaluating 37% of its pages. So
// the clean report prints its own coverage.
const seen = { pages: 0, tables: 0, cells: 0, styleBlocks: 0, classTokens: 0 };

// ---- 1. the two copies of the block are identical ---------------------------
// tables.css exists for pages that do not load pages.css. Every page linking it
// also links pages.css today, so the copies are redundant - but while both are
// served, a page loading only one of them must render the same table.
function blockOf(file) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const a = src.indexOf(START), b = src.indexOf(END);
  if (a < 0 || b < 0) return null;
  return src.slice(src.lastIndexOf('\n', a) + 1, src.indexOf('\n', b));
}
const pagesBlock = blockOf('CSS/pages.css');
const tablesBlock = blockOf('CSS/tables.css');
if (pagesBlock === null) note('block_missing', 'CSS/pages.css has no "table system" block');
if (tablesBlock === null) note('block_missing', 'CSS/tables.css has no "table system" block');
if (pagesBlock && tablesBlock && pagesBlock !== tablesBlock) {
  const a = pagesBlock.split('\n'), b = tablesBlock.split('\n');
  const at = a.findIndex((l, i) => l !== b[i]);
  note('block_drift',
    `CSS/pages.css and CSS/tables.css differ from line ${at + 1} of the block\n` +
    `        pages.css : ${(a[at] ?? '(end of block)').trim().slice(0, 90)}\n` +
    `        tables.css: ${(b[at] ?? '(end of block)').trim().slice(0, 90)}`);
}

// ---- collect what the stylesheets define ------------------------------------
const cssDir = path.join(ROOT, 'CSS');
const defined = new Set();
for (const f of fs.readdirSync(cssDir)) {
  if (!f.endsWith('.css')) continue;
  for (const c of definedClasses(fs.readFileSync(path.join(cssDir, f), 'utf8'))) defined.add(c);
}

// ---- 2-4. walk the pages -----------------------------------------------------
const PRESENTATIONAL = /\b(border|cellpadding|cellspacing|bgcolor|width|height|align|valign|frame|rules)\s*=/i;

for (const fp of walk(ROOT)) {
  const src = fs.readFileSync(fp, 'utf8');
  const name = rel(fp);
  seen.pages++;

  for (const m of src.matchAll(/<table\b([^>]*)>/gi)) {
    const attrs = m[1];
    seen.tables++;

    // 2. a class no stylesheet defines. .tech-table was styled at 0.9em by one
    //    page's own <style>, making three tables a tenth smaller than the rest;
    //    four more classes were on tables while styled nowhere at all.
    const cm = attrs.match(/class="([^"]*)"/i);
    const classes = cm ? cm[1].trim().split(/\s+/).filter(Boolean) : [];
    if (!classes.length) note('table_without_class', `${name}  <table> carries no class`);
    for (const c of classes) {
      seen.classTokens++;
      if (!defined.has(c)) note('undefined_table_class', `${name}  .${c}`);
    }

    // 3. an inline style or a presentational attribute, either of which lets one
    //    table diverge from the system no matter what the stylesheets say.
    if (/\bstyle\s*=/i.test(attrs)) note('inline_style_on_table', `${name}  ${m[0].slice(0, 90)}`);
    const pres = attrs.match(PRESENTATIONAL);
    if (pres) note('presentational_attribute', `${name}  ${pres[1]}= on <table>`);
  }

  for (const m of src.matchAll(/<(td|th|tr|thead|tbody|tfoot)\b[^>]*>/gi)) {
    seen.cells++;
    if (/\bstyle\s*=/i.test(m[0])) note('inline_style_on_cell', `${name}  <${m[1].toLowerCase()} style=...>`);
  }

  // 4. a page-level <style> block with a rule for a table. This is how the
  //    0.9em above got in - it is invisible to a grep over CSS/.
  for (const m of src.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    seen.styleBlocks++;
    for (const chunk of stripComments(m[1]).split('}')) {
      const sel = chunk.split('{')[0];
      if (!sel || chunk.indexOf('{') < 0) continue;
      if (/(^|[\s,>+~])(table|thead|tbody|tfoot|tr|th|td)([\s,>+~:.\[]|$)/i.test(sel) ||
          /\.[\w-]*table[\w-]*/i.test(sel))
        note('table_styled_in_page', `${name}  ${sel.trim().replace(/\s+/g, ' ').slice(0, 80)}`);
    }
  }
}

// ---- report ------------------------------------------------------------------
const byCheck = {};
for (const f of findings) (byCheck[f.check] ||= []).push(f.detail);

if (!findings.length) {
  console.log('tables: one system, no divergence');
  console.log(`  pages read              : ${seen.pages}`);
  console.log(`  <table> tags checked    : ${seen.tables}`);
  console.log(`  class tokens resolved   : ${seen.classTokens} against ${defined.size} defined in CSS/`);
  console.log(`  cells and rows checked  : ${seen.cells}`);
  console.log(`  page <style> blocks read: ${seen.styleBlocks}`);
  console.log(`  block mirrored in CSS/tables.css: ${pagesBlock.split('\n').length} lines, identical`);
  process.exit(0);
}

console.error(`tables: ${findings.length} finding(s) across ${Object.keys(byCheck).length} check(s)\n`);
for (const [check, list] of Object.entries(byCheck).sort((a, b) => b[1].length - a[1].length)) {
  console.error(`  ${check}  (${list.length})`);
  for (const d of list.slice(0, 12)) console.error(`      ${d}`);
  if (list.length > 12) console.error(`      ... and ${list.length - 12} more`);
  console.error('');
}
console.error('Every table on this site uses one system - see the "table system" block');
console.error('in CSS/pages.css. Style a new kind of table by teaching that block, not by');
console.error('adding a class beside it: that is how three systems became four.');
process.exit(1);
