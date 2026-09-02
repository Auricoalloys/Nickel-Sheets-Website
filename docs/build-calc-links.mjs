#!/usr/bin/env node
/*
 * build-calc-links.mjs - writes a contextual "calculate the weight" call to
 * action into the product form pages, deep-linked to /tools/weight-calculator/
 * with the page's own material and shape pre-selected.
 *
 * The footer already links every page to the calculator, so this is not about
 * reach - it is about conversion: an in-content CTA right under the Specification
 * Overview, where a buyer is already thinking about size, that lands them on the
 * calculator with the right material and form chosen, one field from a weight
 * and one click from an enquiry.
 *
 * WHY A GENERATOR AND NOT 300 HAND-EDITS. The value is only there if the deep
 * link is right: sending a buyer on the Inconel 625 sheet page to the calculator
 * pre-set to a different grade is the wrong-material error this repo's CSVs exist
 * to prevent, one tool over. So the material id is never guessed - it is a slug
 * of the URL that is then CHECKED against the real material list the calculator
 * ships (javascript/weight-data.js). A page whose grade is not in that list gets
 * no CTA rather than a wrong one; the footer link still covers it.
 *
 *   node docs/build-calc-links.mjs          # write the CTAs
 *   node docs/build-calc-links.mjs --check  # report drift + coverage, write nothing
 *
 * Like every byte-comparing generator here it does its work in LF space and
 * restores the CRLF it found, or --check reports drift on a tree whose content
 * is perfect. See CLAUDE.md.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { MATERIALS } from "../javascript/weight-data.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const CHECK = process.argv.includes("--check");
const LIST = process.argv.includes("--list");

/* ------------------------------------------------------------------ *
 * Mapping
 * ------------------------------------------------------------------ */

// URL form segment -> calculator shape key (the `key` field in SHAPES in
// javascript/weight-calculator.js) and the noun to use in the CTA copy. A form
// segment absent from this map - fittings, powder, busbar - is not a shape the
// calculator computes, so those pages are skipped rather than linked to a shape
// that does not fit them.
const FORM = {
  sheets: { shape: "sheet", noun: "sheet" },
  plates: { shape: "sheet", noun: "plate" },
  coil: { shape: "coil-strip", noun: "coil" },
  strip: { shape: "coil-strip", noun: "strip" },
  foil: { shape: "sheet", noun: "foil" },
  "round-bar": { shape: "round-bar", noun: "round bar" },
  "hex-bar": { shape: "hex-bar", noun: "hex bar" },
  "flat-bar": { shape: "flat-bar", noun: "flat bar" },
  "square-bar": { shape: "square-bar", noun: "square bar" },
  wire: { shape: "wire", noun: "wire" },
  pipe: { shape: "pipe", noun: "pipe" },
  pipes: { shape: "pipe", noun: "pipe" },
  tube: { shape: "pipe", noun: "tube" },
  tubes: { shape: "pipe", noun: "tube" },
  "hollow-bar": { shape: "hollow-bar", noun: "hollow bar" },
};

const idToName = new Map(MATERIALS.map((m) => [m.id, m.name]));

// A URL writes a grade more tersely than the calculator's display name does -
// /hastelloy/C276/ against the id hastelloy-c-276, /duplex-steel/2205/ against
// duplex-2205. Comparing on the letters and digits alone, punctuation stripped,
// closes that gap: "hastelloyc276" matches "hastelloyc276". Built once, with a
// guard so that if two ids ever collapse to the same key the compressed match is
// refused for them rather than picking one silently.
function compress(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
}

const compressedId = new Map();
const compressedClash = new Set();
for (const m of MATERIALS) {
  const c = compress(m.id);
  if (compressedId.has(c)) compressedClash.add(c);
  else compressedId.set(c, m.id);
}

// Families whose URL segment differs from the prefix the material id carries.
// The grade number is the same; only the family word disagrees, so aliasing the
// segment before matching is enough.
const FAMILY_ALIAS = {
  "duplex-steel": "duplex",
  nicr: "nichrome",
};

// The few grades whose URL and material id share no derivable relationship, keyed
// on slug(family)/slug(grade). Stated explicitly, the way build-grades.mjs states
// its irregular URL maps, because a rule that reconstructed these would be more
// likely to mis-map a grade than to save the two lines:
//   /incoloy/660/ is Incoloy 660, the A-286 grade the id spells out in full;
//   /stainless/SMO-254/ writes the tokens in the opposite order to id 254-smo.
const GRADE_ALIAS = {
  "incoloy/660": "incoloy-660-a286",
  "stainless/smo-254": "254-smo",
};

function slug(s) {
  return String(s)
    .toLowerCase()
    .replace(/[®™]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// The material id the calculator knows this grade by, or null if it does not
// know it. Never returns an id that is not in weight-data.js, so the CTA can
// only ever pre-select a real, matching material. Tries, in order: family+grade
// (Inconel 625 -> inconel-625), the aliased family+grade (duplex-steel/2205 ->
// duplex-2205), and the grade segment alone, which is how grades whose display
// name carries no family read (904L -> 904l, Kovar, Alloy 20). Each is tried as
// an exact id first, then on the compressed key so C276 reaches c-276. A bare
// grade number like "625" compresses to "625", which is in no id, so it cannot
// collide.
function materialIdFor(segments) {
  const grade = segments[segments.length - 2] || "";
  const family = segments[0] || "";

  const aliasKey = `${slug(family)}/${slug(grade)}`;
  if (GRADE_ALIAS[aliasKey]) return GRADE_ALIAS[aliasKey];

  const aliasedFamily = FAMILY_ALIAS[slug(family)] || family;

  const candidates = [
    `${family} ${grade}`,
    `${aliasedFamily} ${grade}`,
    grade,
  ];

  for (const c of candidates) {
    if (idToName.has(slug(c))) return slug(c);
    const comp = compress(c);
    if (comp && compressedId.has(comp) && !compressedClash.has(comp)) {
      return compressedId.get(comp);
    }
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * CTA block
 * ------------------------------------------------------------------ */

const START = "<!-- calc-cta:start  generated by docs/build-calc-links.mjs -->";
const END = "<!-- calc-cta:end -->";

// Rebuilt identically every run so a re-run is a no-op and --check is stable.
function ctaBlock({ name, noun, shape, id }) {
  const href = `/tools/weight-calculator/?material=${id}&amp;shape=${shape}`;
  const Noun = noun.charAt(0).toUpperCase() + noun.slice(1);
  return (
    `${START}\n` +
    `        <aside class="calc-cta" aria-label="Weight calculator">\n` +
    `          <p class="calc-cta-text"><strong>Need the weight for a specific size?</strong> ` +
    `Use our free calculator to get the theoretical weight of ${name} ${noun} for your ` +
    `dimensions, then send the figure to us for a firm quote.</p>\n` +
    `          <a class="calc-cta-link" href="${href}">Calculate ${name} ${noun} weight &rarr;</a>\n` +
    `        </aside>\n` +
    `        ${END}`
  );
}

/* ------------------------------------------------------------------ *
 * Pages
 * ------------------------------------------------------------------ */

const pages = execSync('git ls-files "*.html"', { cwd: ROOT, encoding: "utf8" })
  .split("\n")
  .map((p) => p.trim())
  .filter(Boolean)
  .filter((p) => !p.startsWith(".claude/"));

const skipped = [];
const linked = [];
let changed = 0;

for (const rel of pages) {
  const fp = join(ROOT, rel);
  const raw = readFileSync(fp, "utf8");
  const crlf = raw.includes("\r\n");
  const s = raw.replace(/\r\n/g, "\n");

  const fm = s.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) continue;
  if (/\bpublished:\s*false\b/.test(fm[1])) continue;
  const permMatch = fm[1].match(/^permalink:\s*"?([^"\n]+?)"?\s*$/m);
  if (!permMatch) continue;

  const segments = permMatch[1].split("/").filter(Boolean);
  const formSeg = segments[segments.length - 1];
  const form = FORM[formSeg];
  const hasMarkers = s.includes(START);

  // Only grade form pages are candidates: at least a grade segment plus a form
  // segment this calculator computes. A page already carrying the markers is
  // always reprocessed (so a retired mapping is cleaned up).
  if (!form && !hasMarkers) continue;
  if (!form && hasMarkers) {
    // The form is no longer one we link - strip the stale block.
    const stripped = s.replace(
      new RegExp(`\\n?\\s*${escapeRe(START)}[\\s\\S]*?${escapeRe(END)}`),
      ""
    );
    writeOut(fp, stripped, crlf, s);
    skipped.push(`${rel} - form '${formSeg}' not calculable; stale CTA removed`);
    continue;
  }

  const id = materialIdFor(segments);
  if (!id) {
    if (hasMarkers) {
      const stripped = s.replace(
        new RegExp(`\\n?\\s*${escapeRe(START)}[\\s\\S]*?${escapeRe(END)}`),
        ""
      );
      writeOut(fp, stripped, crlf, s);
      skipped.push(`${rel} - grade not in weight-data.js; stale CTA removed`);
    } else {
      skipped.push(`${rel} - grade not in weight-data.js (no CTA)`);
    }
    continue;
  }

  const name = idToName.get(id);
  const block = ctaBlock({ name, noun: form.noun, shape: form.shape, id });

  let next;
  if (hasMarkers) {
    next = s.replace(
      new RegExp(`${escapeRe(START)}[\\s\\S]*?${escapeRe(END)}`),
      block
    );
  } else {
    // Anchor: right after the Specification Overview section, where thickness,
    // width and form already sit, so a weight CTA belongs directly under it.
    // Pages built on the older template have no such section but do carry an
    // introduction section - fall back to that rather than skip a grade page the
    // footer would then be the only link from. A page with neither is reported,
    // not guessed at.
    const anchor =
      s.match(/(<section[^>]*id="specification"[\s\S]*?<\/section>)/) ||
      s.match(/(<section[^>]*id="introduction"[\s\S]*?<\/section>)/);
    if (!anchor) {
      skipped.push(`${rel} - no #specification or #introduction anchor (no CTA)`);
      continue;
    }
    next = s.replace(anchor[1], `${anchor[1]}\n        ${block}`);
  }

  linked.push(`${rel} -> ${id} / ${form.shape}`);
  if (writeOut(fp, next, crlf, s)) changed += 1;
}

function escapeRe(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Writes only when the LF-space content actually changed. Returns whether it
// differs, so --check can count drift without writing.
function writeOut(fp, nextLf, crlf, prevLf) {
  if (nextLf === prevLf) return false;
  if (!CHECK) writeFileSync(fp, crlf ? nextLf.replace(/\n/g, "\r\n") : nextLf);
  return true;
}

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

console.log(`Calculator CTAs: ${linked.length} pages linked.`);
if (LIST) for (const line of linked) console.log(`  ${line}`);
if (skipped.length) {
  console.log(`\n${skipped.length} page(s) skipped or cleaned:`);
  for (const line of skipped) console.log(`  - ${line}`);
}

if (CHECK) {
  if (changed) {
    console.error(
      `\n${changed} page(s) would change. Run: node docs/build-calc-links.mjs`
    );
    process.exit(1);
  }
  console.log("\nAll calculator CTAs up to date.");
  process.exit(0);
}

console.log(`\n${changed} page(s) written.`);
