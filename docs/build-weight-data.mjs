#!/usr/bin/env node
/*
 * build-weight-data.mjs - writes javascript/weight-data.js, the material list
 * behind /tools/weight-calculator/.
 *
 * Two sources, and keeping them apart is the whole point of this script:
 *
 *   docs/grades.json    - emitted by build-grades.mjs from grades.csv, behind
 *                         the checked/pending gate. Every density here was read
 *                         off a named mill bulletin, and the bulletin travels
 *                         with the number into the calculator so a visitor can
 *                         see where 8.44 came from. This is the reason
 *                         density_g_cm3 is a bare number rather than a range:
 *                         "so a weight calculator can consume it directly".
 *
 *   docs/materials.csv  - nominal handbook densities for generic materials this
 *                         business does not stock and no bulletin in this repo
 *                         covers. Mild steel; SS 304; aluminium 6061.
 *
 * The two are tagged `mill` and `handbook` and the page labels them
 * differently. Merging them into one undifferentiated list would let a nominal
 * 7.85 read as though it carried the same authority as a figure taken from a
 * Special Metals bulletin, which is the claim-inflation this repo's CSVs exist
 * to prevent.
 *
 * A grade whose bulletin publishes no density is carried through with
 * density null rather than dropped. Dropping it would make the grade silently
 * absent from a picker that lists its siblings - the visitor would conclude the
 * site does not supply it. The page instead offers it and asks for the density,
 * which is the honest answer: we do not have one to give.
 *
 *   node docs/build-weight-data.mjs
 *   node docs/build-weight-data.mjs --check   # drift only, writes nothing
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const GRADES_JSON = join(ROOT, "docs", "grades.json");
const MATERIALS_CSV = join(ROOT, "docs", "materials.csv");
const OUT = join(ROOT, "javascript", "weight-data.js");

const CHECK = process.argv.includes("--check");

/* ------------------------------------------------------------------ *
 * Families
 * ------------------------------------------------------------------ */

// Display name and picker order. Nickel Alloys and Cobalt Alloys sit last in
// DEDUPE_PRIORITY, not because they matter less but because they are the
// catch-all families: grades.csv files Inconel 625 under both `inconel` and
// `nickel-alloy` where specs.csv forced a second row, and the specific family
// is the better label to show a buyer.
const FAMILIES = [
  ["inconel", "Inconel"],
  ["incoloy", "Incoloy"],
  ["hastelloy", "Hastelloy"],
  ["monel", "Monel"],
  ["nimonic", "Nimonic"],
  ["haynes", "Haynes"],
  ["nichrome", "Nichrome"],
  ["titanium", "Titanium"],
  ["duplex-steel", "Duplex & Super Duplex"],
  ["special-stainless-steel", "Special Stainless Steel"],
  ["stellite", "Stellite"],
  ["cobalt-alloy", "Cobalt Alloys"],
  ["nickel-alloy", "Nickel Alloys"],
];

const FAMILY_LABEL = new Map(FAMILIES);
const DEDUPE_PRIORITY = new Map(FAMILIES.map(([key], i) => [key, i]));

// Handbook groups, in the order the picker shows them. Stated here rather than
// derived from the CSV so a typo in a category cell is reported instead of
// quietly creating a fourteenth group of one.
const MATERIAL_GROUPS = [
  "Stainless Steel",
  "Carbon & Alloy Steel",
  "Aluminium",
  "Copper Alloys",
  "Refractory & Reactive",
  "Pure Metals",
  "Precious Metals",
];

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function slug(s) {
  return String(s)
    .toLowerCase()
    .replace(/[®™]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Same shape as readCsv in build-grades.mjs: split on comma, no quoting. Which
// is why materials.csv says in its own header that no field may contain one.
function readCsv(path) {
  const text = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  const lines = text
    .split("\n")
    .filter((l) => l.trim() !== "" && !l.startsWith("#"));
  const header = lines.shift().split(",").map((h) => h.trim());
  return lines.map((line, i) => {
    const cells = line.split(",");
    if (cells.length !== header.length) {
      throw new Error(
        `materials.csv line ${i + 2}: ${cells.length} fields, expected ` +
          `${header.length}. An unquoted comma inside a field shifts every ` +
          `value right - see the header note.\n  ${line}`
      );
    }
    return Object.fromEntries(header.map((h, j) => [h, cells[j].trim()]));
  });
}

const problems = [];

/* ------------------------------------------------------------------ *
 * Mill-verified grades
 * ------------------------------------------------------------------ */

if (!existsSync(GRADES_JSON)) {
  console.error(
    `${GRADES_JSON} is missing. Run 'node docs/build-grades.mjs' first - it ` +
      `emits grades.json from grades.csv.`
  );
  process.exit(1);
}

const gradeRows = JSON.parse(readFileSync(GRADES_JSON, "utf8")).grades;

// Collapse the duplicate rows. They are duplicates of presentation, not of
// data, so the densities must agree - if they ever stop agreeing that is a
// contradiction in grades.csv and the calculator is the wrong place to
// silently pick a winner.
const byName = new Map();
for (const row of gradeRows) {
  if (!FAMILY_LABEL.has(row.family)) {
    problems.push(
      `grades.json: unknown family '${row.family}' on ${row.name}. Add it to ` +
        `FAMILIES or the grade will not appear in the picker.`
    );
    continue;
  }
  const seen = byName.get(row.name);
  if (!seen) {
    byName.set(row.name, row);
    continue;
  }
  if (seen.density_g_cm3 !== row.density_g_cm3) {
    problems.push(
      `${row.name}: density disagrees between families - ` +
        `${seen.family}=${seen.density_g_cm3} vs ${row.family}=${row.density_g_cm3}. ` +
        `Fix grades.csv; this script will not choose.`
    );
  }
  // Keep the more specific family for the label.
  if (DEDUPE_PRIORITY.get(row.family) < DEDUPE_PRIORITY.get(seen.family)) {
    byName.set(row.name, row);
  }
}

const materials = [];
const ids = new Map();

function push(entry) {
  const clash = ids.get(entry.id);
  if (clash) {
    problems.push(
      `id collision '${entry.id}': "${clash}" and "${entry.name}". Ids are ` +
        `slugs of the display name and are used in ?material= links.`
    );
    return;
  }
  ids.set(entry.id, entry.name);
  materials.push(entry);
}

let noDensity = 0;
for (const row of [...byName.values()].sort(
  (a, b) =>
    DEDUPE_PRIORITY.get(a.family) - DEDUPE_PRIORITY.get(b.family) ||
    a.name.localeCompare(b.name, "en", { numeric: true })
)) {
  const density =
    row.density_g_cm3 === null || row.density_g_cm3 === ""
      ? null
      : Number(row.density_g_cm3);
  if (density === null) noDensity += 1;
  push({
    id: slug(row.name),
    name: row.name,
    group: FAMILY_LABEL.get(row.family),
    tier: "mill",
    density,
    // The bulletin, carried through so the page can show it under the figure.
    source: row.source || "",
    note: [row.uns, row.wnr].filter((v) => v && v !== "-").join(" / "),
  });
}

/* ------------------------------------------------------------------ *
 * Handbook materials
 * ------------------------------------------------------------------ */

for (const row of readCsv(MATERIALS_CSV)) {
  if (!MATERIAL_GROUPS.includes(row.category)) {
    problems.push(
      `materials.csv: ${row.key} has category '${row.category}', which is not ` +
        `in MATERIAL_GROUPS. Fix the cell or add the group.`
    );
    continue;
  }
  const density = Number(row.density_g_cm3);
  if (!Number.isFinite(density) || density <= 0) {
    problems.push(
      `materials.csv: ${row.key} has density '${row.density_g_cm3}', which is ` +
        `not a positive number.`
    );
    continue;
  }
  push({
    id: slug(row.name),
    name: row.name,
    group: row.category,
    tier: "handbook",
    density,
    source: row.source,
    note: row.note || "",
  });
}

/* ------------------------------------------------------------------ *
 * Emit
 * ------------------------------------------------------------------ */

const groupOrder = [
  ...FAMILIES.map(([, label]) => label),
  ...MATERIAL_GROUPS,
];

const body = `// GENERATED by docs/build-weight-data.mjs - do not edit by hand.
//
// Two tiers, and the difference is the point:
//
//   tier: "mill"     - density read off the named mill bulletin in \`source\`,
//                      via docs/grades.csv and its checked/pending gate.
//   tier: "handbook" - nominal density for a generic material, from
//                      docs/materials.csv. Real tempers and heats vary ~1%.
//
// A null density means the bulletin publishes none. The calculator keeps the
// grade in the list and asks for the figure rather than dropping it, so a
// visitor is never told by omission that we do not supply it.
//
// Re-run after editing docs/materials.csv or docs/grades.csv:
//   node docs/build-grades.mjs && node docs/build-weight-data.mjs

export const GROUP_ORDER = ${JSON.stringify(groupOrder, null, 2)};

export const MATERIALS = [
${materials
  .map((m) => "  " + JSON.stringify(m))
  .join(",\n")}
];
`;

// The CRLF dance every generator in this repo does. .gitattributes sets
// `* text=auto` and core.autocrlf is true on the machine this is maintained
// from, so the file on disk is CRLF while the index holds LF. Build in LF space
// and restore what was found, or --check reports drift on every line of a tree
// whose content is perfect.
const existing = existsSync(OUT) ? readFileSync(OUT, "utf8") : null;
const crlf = existing ? existing.includes("\r\n") : false;
const current = existing === null ? null : existing.replace(/\r\n/g, "\n");

for (const p of problems) console.error(`  ! ${p}`);

if (CHECK) {
  if (problems.length) {
    console.error(`${problems.length} problem(s) - see above.`);
    process.exit(1);
  }
  if (current !== body) {
    console.error(
      "javascript/weight-data.js is stale. Run: node docs/build-weight-data.mjs"
    );
    process.exit(1);
  }
  console.log(
    `weight-data.js up to date - ${materials.length} materials ` +
      `(${materials.filter((m) => m.tier === "mill").length} mill-sourced, ` +
      `${materials.filter((m) => m.tier === "handbook").length} handbook).`
  );
  process.exit(0);
}

if (problems.length) {
  console.error(`${problems.length} problem(s) - nothing written.`);
  process.exit(1);
}

writeFileSync(OUT, crlf ? body.replace(/\n/g, "\r\n") : body);

console.log(
  `javascript/weight-data.js: ${materials.length} materials ` +
    `(${materials.filter((m) => m.tier === "mill").length} mill-sourced, ` +
    `${materials.filter((m) => m.tier === "handbook").length} handbook).`
);
if (noDensity) {
  console.log(
    `  ${noDensity} grade(s) carried with no published density - the page ` +
      `asks the visitor for the figure rather than omitting the grade.`
  );
}
