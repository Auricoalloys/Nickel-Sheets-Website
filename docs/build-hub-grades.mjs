#!/usr/bin/env node
// Writes the "Grades Supplied" table onto each alloy family hub from
// docs/hub-grades.csv (grade order, label, link, Type, "Chosen for") joined to
// docs/grades.csv for the UNS number - so the hub table's UNS can never drift
// from the grade database. Membership is every grade docs/hub-grades.csv lists
// for the family, which is seeded to every grade in that family in grades.csv.
//
// WHY: the family hubs listed grades in a hand-typed table alongside a plain
// "Available Grades" list; the two duplicated each other and the UNS numbers
// were typed by hand (one hub showed CoCrMo as R31538 while grades.csv says
// R31537). This makes the table generated and the UNS single-sourced.
//
//   node docs/build-hub-grades.mjs          write the tables
//   node docs/build-hub-grades.mjs --check  report drift, write nothing, exit 1
//
// The UNS comes from grades.csv even for grades held `pending` there (the UNS is
// verified; the rest of the row is not). A grade in hub-grades.csv with no
// grades.csv row is an error - the UNS has nowhere to come from.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

// hub file -> { family key in grades.csv, table caption }
const HUBS = {
  'inconel.html':       ['inconel', 'Inconel grades supplied'],
  'hastelloy.html':     ['hastelloy', 'Hastelloy grades supplied'],
  'haynes.html':        ['haynes', 'Haynes alloy grades supplied'],
  'incoloy.html':       ['incoloy', 'Incoloy grades supplied'],
  'nichrome.html':      ['nichrome', 'Nichrome grades supplied'],
  'cobalt-alloys.html': ['cobalt-alloy', 'Cobalt alloy grades supplied'],
  'duplex-steel.html':  ['duplex-steel', 'Duplex steel grades supplied'],
  'monel.html':         ['monel', 'Monel grades supplied'],
  'nimonic.html':       ['nimonic', 'Nimonic grades supplied'],
  'stainless.html':     ['special-stainless-steel', 'Stainless grades supplied'],
  'titanium.html':      ['titanium', 'Titanium grades supplied'],
};

function parseCsvLine(line) {
  const out = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

// grades.csv -> (family|grade) -> uns
const unsByKey = new Map();
for (const line of readFileSync(join(ROOT, 'docs/grades.csv'), 'utf8').split(/\r?\n/)) {
  if (!line.trim() || line.trim().startsWith('#')) continue;
  const [family, grade, uns] = line.split(',');
  if (family === 'family') continue;
  unsByKey.set(`${family}|${grade.trim()}`, (uns || '').trim());
}

// hub-grades.csv -> family -> [{grade,label,url,type,chosen}] in file order
const byFamily = {};
{
  const lines = readFileSync(join(ROOT, 'docs/hub-grades.csv'), 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const f = parseCsvLine(line);
    if (f[0] === 'family') continue;
    const [family, grade, label, url, type, chosen] = f.map(x => x.trim());
    (byFamily[family] ??= []).push({ grade, label, url, type, chosen });
  }
}

const esc = s => s.replace(/&(?![a-zA-Z]+;|#)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function buildTable(family, caption, rows) {
  const body = rows.map(r => {
    const key = `${family}|${r.grade}`;
    if (!unsByKey.has(key)) throw new Error(`no grades.csv row for ${key} (UNS has nowhere to come from)`);
    let uns = unsByKey.get(key);
    if (!uns || uns === '-') uns = '&mdash;';
    const gradeCell = r.url
      ? `<a href="${r.url}">${esc(r.label)}</a>`
      : esc(r.label);
    return `              <tr>
                <th scope="row">${gradeCell}</th>
                <td>${uns}</td>
                <td>${esc(r.type)}</td>
                <td>${esc(r.chosen)}</td>
              </tr>`;
  }).join('\n');
  return `<table class="table table-bordered">
            <caption>${esc(caption)}</caption>
            <thead>
              <tr>
                <th scope="col">Grade</th>
                <th scope="col">UNS</th>
                <th scope="col">Type</th>
                <th scope="col">Chosen for</th>
              </tr>
            </thead>
            <tbody>
${body}
            </tbody>
          </table>`;
}

let drift = 0, wrote = 0;
for (const [file, [family, caption]] of Object.entries(HUBS)) {
  const path = join(ROOT, file);
  const html = readFileSync(path, 'utf8');
  const gi = html.indexOf('id="grades"');
  if (gi === -1) { console.error(`SKIP ${file}: no #grades section`); continue; }
  let end = html.indexOf('id="forms"', gi);
  if (end === -1) end = html.indexOf('id="applications"', gi);
  if (end === -1) { console.error(`SKIP ${file}: no section after #grades`); continue; }
  const region = html.slice(gi, end);
  const m = region.match(/<table\b[\s\S]*?<\/table>/);
  if (!m) { console.error(`SKIP ${file}: no table in #grades`); continue; }

  const rows = byFamily[family] || [];
  if (!rows.length) { console.error(`SKIP ${file}: no hub-grades.csv rows for ${family}`); continue; }
  const table = buildTable(family, caption, rows);
  if (m[0] === table) continue; // already current
  drift++;
  if (CHECK) {
    console.error(`DRIFT ${file} (${rows.length} grades)`);
  } else {
    const next = html.slice(0, gi) + region.replace(m[0], table) + html.slice(end);
    writeFileSync(path, next);
    console.log(`wrote ${file} (${rows.length} grades)`);
    wrote++;
  }
}

if (CHECK) {
  if (drift) { console.error(`\nhub grade tables are STALE in ${drift} hub(s) - run: node docs/build-hub-grades.mjs`); process.exit(1); }
  console.log('hub grade tables are current');
} else {
  console.log(`\ndone: ${wrote} hub(s) written`);
}
