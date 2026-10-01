#!/usr/bin/env node
/*
 * build-quote-cta.mjs - writes a compact "request a quote" block into the
 * product pages, directly under the page's lead heading block, so a buyer who
 * lands from search can ask for a price without hunting for the form.
 *
 * WHY IT EXISTS. A headless audit of the grade-and-form pages found 298 of 382
 * with no quote, call or WhatsApp link anywhere in their content. The only
 * routes to an enquiry were the floating launcher - an unlabelled circle on a
 * phone - and the header's "Get a Quote", which on a phone sits inside the
 * collapsed menu. On a 390px screen 6 of 382 pages showed any enquiry link on
 * the first screen, and the Price row sat a median 4,407px down the page. A
 * visitor who arrived knowing what they wanted had to scroll past the whole
 * datasheet to find out how to ask for it.
 *
 * WHAT IT WRITES. Between <!-- quote-cta:start --> / <!-- quote-cta:end -->
 * markers, an <aside class="quote-cta"> holding three links:
 *
 *   Get a quote   <a class="quote-cta-btn" href="/pages/contact/"
 *                    data-enquiry="Enquiry: <subject>" data-placement="in_page">
 *   WhatsApp      the business's one WhatsApp number (floating-form.js seeds
 *                 the message at runtime, as it does the header rail's)
 *   Call          tel: to the same number
 *
 * Both are counted as contact_click by the form module's document-level
 * listener, which already classifies every WhatsApp and tel: link on a page.
 *
 * The quote button's href is deliberately the BARE contact URL. Writing
 * ?enquiry=... into it would publish several hundred parameterised
 * /pages/contact/?enquiry=... URLs for crawlers to fetch, every one of them
 * canonicalising to /pages/contact/ - pure crawl waste and Search Console noise.
 * javascript/floating-form.js reads data-enquiry at click time instead: it opens
 * the floating panel in place with that text, or on a modified click or a page
 * with no floating form navigates to /pages/contact/?enquiry=, adding the query
 * only at interaction time. With no JavaScript at all the link still lands on
 * the contact page, which is an honest fallback.
 *
 * THE SUBJECT IS THE PAGE'S OWN LAST BREADCRUMB, tidied exactly as
 * tidySubject() in floating-form.js tidies it, so the in-page button and the
 * floating launcher never disagree about what a page sells. The breadcrumb is
 * the one hand-written noun phrase on every page ("Inconel 625 Sheets") - the
 * <title> and <h1> carry marketing tails - which is the same reason the form
 * reads it. A crumb that is only a product form ("Sheet", "Round Bar") tells the
 * sales desk nothing about the grade, so that page is reported, not written:
 * the breadcrumb is the bug, and fixing it brings the page in on the next run.
 *
 * THE NUMBER IS READ FROM javascript/lead-config.js (FALLBACK_CONTACT.whatsapp)
 * at generation time and never typed here. The site has one WhatsApp number and
 * it lives in the markup and that config, nowhere else - the same rule the
 * weight calculator follows.
 *
 * WHERE IT GOES. As high in the main content as is safe: directly after the lead
 * heading block, so on a phone it lands on the first or second screen. Each
 * template's lead block is a named shape, tried in order and restricted to the
 * page types it belongs to (see ANCHORS). Every insertion point is then walked
 * with a tag stack and refused unless it sits inside <main> with only <div>,
 * <section> or <article> open - so the block can never land inside a <p>, a
 * table, a list, a heading or a JSON-LD script. A page with no such anchor is
 * reported by name, never guessed at.
 *
 *   node docs/build-quote-cta.mjs          # write the blocks
 *   node docs/build-quote-cta.mjs --check  # report drift + coverage, write nothing
 *   node docs/build-quote-cta.mjs --list   # also name every page that carries one
 *
 * --check exits non-zero when any page would change, including a stale block on
 * a page that no longer qualifies (the next write run removes it).
 *
 * Like every byte-comparing generator here it does its work in LF space and
 * restores the CRLF it found, or --check reports drift on a tree whose content
 * is perfect. See CLAUDE.md.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { FALLBACK_CONTACT } from "../javascript/lead-config.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHECK = process.argv.includes("--check");
const LIST = process.argv.includes("--list");

/* ------------------------------------------------------------------ *
 * The number
 * ------------------------------------------------------------------ */

const DIGITS = String(FALLBACK_CONTACT?.whatsapp ?? "");
if (!/^\d{8,15}$/.test(DIGITS)) {
  // Refuse rather than write a broken tel: link onto 400 pages.
  console.error(
    `FALLBACK_CONTACT.whatsapp in javascript/lead-config.js is "${DIGITS}", ` +
      `not a bare international number (digits only, country code first). Nothing written.`
  );
  process.exit(2);
}
// Indian mobile numbers are read in two groups of five after the country code,
// "+91 79778 86611". Anything else is printed as it is stored rather than
// grouped by a rule written for a different numbering plan.
const DISPLAY = /^91\d{10}$/.test(DIGITS)
  ? `+91 ${DIGITS.slice(2, 7)} ${DIGITS.slice(7)}`
  : `+${DIGITS}`;

/* ------------------------------------------------------------------ *
 * The subject - mirrors floating-form.js
 * ------------------------------------------------------------------ */

// The routes floating-form.js seeds no subject for (NO_SUBJECT_PREFIXES there).
// Kept in step by hand: a location page's crumb is a bare place name, so a
// block here would read "Need a price for Mumbai?", which is the exact failure
// that list exists to prevent.
const NO_SUBJECT_PREFIXES = [
  "/nickel-alloy-supplier-in-",
  "/supply-locations/",
  "/export-markets/",
  "/pages/contact/",
  "/privacy/",
  "/terms/",
  "/tools/",
];

// Byte-for-byte the rule in floating-form.js: collapse whitespace, cap at 120,
// and title-case only a crumb that is capital letters and spaces. A digit or
// any punctuation means a grade designation (904L, AM 350), which is upper-case
// by nature and must survive untouched.
function tidySubject(name) {
  const collapsed = name.replace(/\s+/g, " ").trim().slice(0, 120);
  if (!/^[A-Z][A-Z ]*$/.test(collapsed)) return collapsed;
  return collapsed.replace(/\S+/g, (word) => word.charAt(0) + word.slice(1).toLowerCase());
}

// The last crumb of the first BreadcrumbList, read the way the browser reads it:
// HTML comments stripped first (a parked, unpriced Product node is commented out
// at the element level and never reaches the DOM), each JSON-LD block parsed on
// its own, and an unparseable block skipped rather than allowed to cost the
// others. Parsing rather than matching is what copes with ListItems written
// both pretty-printed and on one line (see build-breadcrumbs.mjs).
function breadcrumbSubject(s) {
  const live = s.replace(/<!--[\s\S]*?-->/g, "");
  const re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of live.matchAll(re)) {
    let parsed;
    try {
      parsed = JSON.parse(m[1]);
    } catch {
      continue;
    }
    const nodes = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.["@graph"])
        ? parsed["@graph"]
        : [parsed];
    for (const node of nodes) {
      if (node?.["@type"] !== "BreadcrumbList") continue;
      const items = (node.itemListElement || [])
        .slice()
        .sort((a, b) => (a?.position || 0) - (b?.position || 0));
      const last = items[items.length - 1];
      const name = (last?.name || last?.item?.name || "").toString().trim();
      if (name) return name;
    }
  }
  return "";
}

// A crumb that is nothing but a product form - "Sheet", "Round Bar", "Strip",
// "Sheets and Plates" - says what shape the page sells but not which alloy, so
// "Enquiry: Sheet" reaches the sales desk as a question they cannot price. The
// stellite form pages carry exactly that (Home > Stellite > Stellite 12 >
// Sheet); their breadcrumb is what needs the grade name, not this script.
const FORM_NOUNS = new Set([
  "sheet", "plate", "coil", "strip", "foil", "bar", "rod", "round bar", "hex bar",
  "hexagonal bar", "flat bar", "square bar", "hollow bar", "wire", "pipe", "tube",
  "fitting", "billet", "powder",
]);
function namesOnlyAForm(subject) {
  const parts = subject
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/ and /);
  return parts.every((p) =>
    FORM_NOUNS.has(p.split(" ").map((w) => w.replace(/s$/, "")).join(" "))
  );
}

// Crumbs that are not a product name at all, keyed on the crumb TEXT rather than
// the URL: fix the breadcrumb and the text changes, so the page is picked up on
// the next run without this list having to be edited.
const REFUSED_SUBJECTS = {
  "Your 32140 Packs Overheat at 32A Because…":
    "last crumb is a headline, not a product name",
  "Monel® foil® Foil": "last crumb is garbled",
};

/* ------------------------------------------------------------------ *
 * Page types
 * ------------------------------------------------------------------ */

// First URL segments that name an alloy family. Stated, not inferred, for the
// reason build-grades.mjs states its URL maps: the site's URLs are not regular
// enough to guess from.
const FAMILY_SEGMENTS = new Set([
  "inconel", "incoloy", "hastelloy", "haynes", "nimonic", "monel", "stellite",
  "titanium", "nichrome", "nicr", "stainless", "duplex-steel", "cobalt-alloys",
  "nickel-alloy", "pure-nickel", "tool-steel", "aluminium",
]);

// Family hubs. The newer template opens with a #family-intro section, which is
// as clean an anchor as a form page's div#title; the older ones do not and are
// reported by name.
const FAMILY_HUBS = new Set([
  "/inconel/", "/incoloy/", "/hastelloy/", "/haynes/", "/nimonic/", "/monel/",
  "/stellite/", "/titanium/", "/nichrome/", "/stainless/", "/duplex-steel/",
  "/cobalt-alloys/", "/nitinol/", "/nickel-alloys-supplier-exporter-and-stockist-in-india/",
]);

// Grade hubs whose URL has no family segment above them.
const SINGLE_SEGMENT_GRADE_HUBS = new Set([
  "/kovar/", "/invar/", "/waspaloy/", "/mu-metal/", "/nickel-200-201/",
]);

// The flat family x form hubs (/inconel-coil-supplier-exporter-mumbai-india/)
// live in one directory per form; the URL alone cannot tell them from a flat
// grade page such as /inconel-600-601-617-foil-supplier-.../.
const FORM_HUB_DIRS = new Set([
  "coil", "fittings", "hex-bar", "hollow-bars", "pipes", "tube", "wire",
  "round-bar", "sheets",
]);

// Routes that are not a product anyone prices: services, company pages, the
// product index and the two application guides, which select a grade rather
// than sell one.
const NOT_PRODUCT = [
  "/pages/services/", "/pages/about/", "/pages/quality/", "/laser-cutting/",
  "/alloys-for-",
];

const FORM_TOKENS = new Set([
  "sheet", "sheets", "plate", "plates", "coil", "strip", "strips", "foil",
  "wire", "pipe", "pipes", "tube", "tubes", "fittings", "billets", "bar",
  "bars",
]);
function hasFormToken(segment) {
  return segment.toLowerCase().split("-").some((t) => FORM_TOKENS.has(t));
}
function isFormSegment(segment) {
  return /^(sheets?|plates?|coil|strips?|foil|round-bars?|hex-bars?|flat-bars?|square-bars?|wire|pipes?|tubes?|hollow-bars?|fittings|billets)$/i.test(
    segment
  );
}

// -> { type } for a page this script covers, or { skip, list } for one it does
// not. `list: false` marks the large by-design classes (location pages,
// services) that are counted rather than named on every run; --list names them.
function classify(rel, url) {
  const segs = url.split("/").filter(Boolean);
  if (!segs.length) return { skip: "home page: no breadcrumb subject", list: false };
  if (NO_SUBJECT_PREFIXES.some((p) => url.startsWith(p)))
    return { skip: "route floating-form.js seeds no subject for (NO_SUBJECT_PREFIXES)", list: false };
  if (NOT_PRODUCT.some((p) => url.startsWith(p)) || url === "/pages/products/")
    return { skip: "not a product page (service, company page, product index or application guide)", list: false };
  if (segs.some((s) => s.toLowerCase().split("-").includes("powder")))
    return { type: "powder" };
  if (url.startsWith("/pages/products/"))
    return {
      skip:
        "catalogue form hub: sells every family in one form, and its last crumb is the bare form",
      list: true,
    };
  if (rel.startsWith("pure-nickel-strip/") || url.startsWith("/pure-nickel-strip"))
    return { type: "battery-strip" };
  if (FORM_HUB_DIRS.has(rel.split("/")[0])) return { type: "form-hub" };
  if (segs.length === 2 && FAMILY_SEGMENTS.has(segs[0].toLowerCase()) && isFormSegment(segs[1]))
    return { type: "family-form" };
  if (hasFormToken(segs[segs.length - 1])) return { type: "grade-form" };
  if (FAMILY_HUBS.has(url)) return { type: "family-hub" };
  if (SINGLE_SEGMENT_GRADE_HUBS.has(url)) return { type: "grade-hub" };
  if (segs.length === 2 && FAMILY_SEGMENTS.has(segs[0].toLowerCase()))
    return { type: "grade-hub" };
  return { skip: "unclassified URL shape - add it to a map in this script", list: true };
}

/* ------------------------------------------------------------------ *
 * Markup walking
 * ------------------------------------------------------------------ */

// Blank anything that is not markup but can contain '<' - comments, script and
// style bodies, Liquid - with spaces of the same length, so offsets into the
// scrubbed copy are offsets into the page. The same scrub check-tags.mjs uses.
const blank = (m) => " ".repeat(m.length);
function scrub(s) {
  return s
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi, (m, a, b, c) => a + blank(b) + c)
    .replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (m, a, b, c) => a + blank(b) + c)
    .replace(/\{%[\s\S]*?%\}/g, blank)
    .replace(/\{\{[\s\S]*?\}\}/g, blank);
}

// Tags in order, honouring quoted attribute values so alt="a > b" does not end
// a tag early.
function* tags(s, from = 0) {
  let i = from;
  while (i < s.length) {
    const lt = s.indexOf("<", i);
    if (lt === -1) return;
    const c = s[lt + 1];
    if (!c || !/[a-zA-Z/!?]/.test(c)) { i = lt + 1; continue; }
    if (c === "!" || c === "?") {
      const gt = s.indexOf(">", lt);
      i = gt === -1 ? s.length : gt + 1;
      continue;
    }
    let j = lt + 1;
    const closing = s[j] === "/";
    if (closing) j++;
    const nameFrom = j;
    while (j < s.length && /[a-zA-Z0-9-]/.test(s[j])) j++;
    const name = s.slice(nameFrom, j).toLowerCase();
    if (!name) { i = lt + 1; continue; }
    let quote = null;
    while (j < s.length) {
      const ch = s[j];
      if (quote) { if (ch === quote) quote = null; }
      else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === ">") break;
      j++;
    }
    if (j >= s.length) return;
    yield { name, closing, raw: s.slice(lt, j + 1), pos: lt, end: j + 1 };
    i = j + 1;
  }
}

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr"]);
// A start tag in this set closes an open <p>, as the browser does it.
const CLOSES_P = new Set(["address", "article", "aside", "blockquote", "details",
  "div", "dl", "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2",
  "h3", "h4", "h5", "h6", "header", "hr", "main", "nav", "ol", "p", "pre",
  "section", "table", "ul"]);
const IMPLICIT = {
  li: new Set(["li", "p"]), dt: new Set(["dt", "dd", "p"]), dd: new Set(["dt", "dd", "p"]),
  tr: new Set(["tr", "td", "th", "p"]), td: new Set(["td", "th", "p"]), th: new Set(["td", "th", "p"]),
  tbody: new Set(["thead", "tbody", "tr", "td", "th", "p"]),
  tfoot: new Set(["thead", "tbody", "tr", "td", "th", "p"]),
  thead: new Set(["p"]), option: new Set(["option", "p"]),
};

// The elements open at `pos`, walking from the <main> start tag with the
// browser's implicit-close rules - the same walk check-tags.mjs does. Returns
// null when `pos` is not inside <main>.
function openAt(scrubbed, pos) {
  const mainOpen = /<main\b[^>]*>/i.exec(scrubbed);
  const mainClose = scrubbed.search(/<\/main\s*>/i);
  if (!mainOpen || mainClose === -1) return null;
  const from = mainOpen.index + mainOpen[0].length;
  if (pos < from || pos > mainClose) return null;
  const stack = [];
  for (const t of tags(scrubbed, from)) {
    if (t.pos >= pos) break;
    if (t.closing) {
      const at = stack.lastIndexOf(t.name);
      if (at !== -1) stack.length = at;
      continue;
    }
    if (VOID.has(t.name) || /\/\s*>$/.test(t.raw)) continue;
    if (CLOSES_P.has(t.name) && stack[stack.length - 1] === "p") stack.pop();
    const kills = IMPLICIT[t.name];
    while (kills && stack.length && kills.has(stack[stack.length - 1])) stack.pop();
    stack.push(t.name);
  }
  return stack;
}

// The offset just past the end tag matching the start tag at `openPos`, or -1.
// For a <p>, whose end tag is optional, a block-level start tag before the
// </p> means the browser closed it earlier than the source says - so the
// "matching" </p> would be somebody else's, and the anchor is refused.
function closeOf(scrubbed, openPos, name) {
  let depth = 0;
  for (const t of tags(scrubbed, openPos)) {
    if (name === "p" && depth === 1 && !t.closing && CLOSES_P.has(t.name)) return -1;
    if (t.name !== name) continue;
    if (VOID.has(t.name) || /\/\s*>$/.test(t.raw)) continue;
    if (t.closing) { if (--depth === 0) return t.end; }
    else depth++;
  }
  return -1;
}

// The first start tag at or after `from`, skipping only whitespace (comments
// are already blanked). Anything else first - text, an end tag - means the
// shape is not the one we are looking for.
function firstElement(scrubbed, from) {
  const m = /^\s*<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>/.exec(scrubbed.slice(from));
  if (!m) return null;
  return { name: m[1].toLowerCase(), raw: m[0].trim(), pos: from + m[0].indexOf("<") };
}

function indentAt(s, pos) {
  const lineStart = s.lastIndexOf("\n", pos) + 1;
  return s.slice(lineStart, pos).match(/^[ \t]*/)[0];
}

// The breadcrumb <nav>'s end, which is where the newer templates' lead block
// starts.
function afterBreadcrumb(scrubbed) {
  const nav = /<nav\b[^>]*aria-label="Breadcrumb"[^>]*>/i.exec(scrubbed);
  if (!nav) return -1;
  return closeOf(scrubbed, nav.index, "nav");
}

/* ------------------------------------------------------------------ *
 * Anchors - the lead heading block of each template, in the order tried
 * ------------------------------------------------------------------ */

const FORM_TYPES = new Set(["grade-form", "family-form", "form-hub", "battery-strip"]);

const ANCHORS = [
  {
    // The older template, on most form pages, form hubs and the busbar pages:
    // <div class="title" id="title"> holding the <h1> (or, under a banner h1,
    // the lead paragraph). The block goes straight after it and before the
    // table of contents.
    kind: "div#title",
    types: null,
    find(s, sc) {
      const at = sc.indexOf('<div class="title" id="title">');
      if (at === -1) return null;
      return { open: at, end: closeOf(sc, at, "div") };
    },
  },
  {
    // The newer titanium template: the h1 is the banner caption above <main>,
    // and <main> opens with a single lead paragraph before the TOC.
    kind: "main > p (lead)",
    types: FORM_TYPES,
    find(s, sc) {
      const main = /<main\b[^>]*>/i.exec(sc);
      if (!main) return null;
      const first = firstElement(sc, main.index + main[0].length);
      if (!first || first.name !== "p") return null;
      return { open: first.pos, end: closeOf(sc, first.pos, "p") };
    },
  },
  {
    // The stellite form pages: banner h1, breadcrumb, then the lead paragraph
    // in its own <section class="container" id="introduction">. The block goes
    // inside that section, before its end tag: the section is the page's
    // container, and after it the block would run full-bleed into the
    // calc-cta aside that build-calc-links.mjs writes straight after it.
    kind: "section#introduction (lead)",
    types: FORM_TYPES,
    find(s, sc) {
      const from = afterBreadcrumb(sc);
      if (from === -1) return null;
      const first = firstElement(sc, from);
      if (!first || first.name !== "section" || !/\bid="introduction"/.test(first.raw)) return null;
      const end = closeOf(sc, first.pos, "section");
      if (end === -1) return { open: first.pos, end };
      // The newline in front of the end tag's line, so the block lands on its
      // own lines between the last child and </section>.
      const insert = sc.lastIndexOf("\n", sc.lastIndexOf("</section", end));
      if (insert <= first.pos) return { open: first.pos, end: -1 };
      return { open: first.pos, end, insert, indentExtra: "  " };
    },
  },
  {
    // Family hubs on the newer template: <h1> in .product-header, then the
    // #family-intro prose.
    kind: "section#family-intro",
    types: new Set(["family-hub"]),
    find(s, sc) {
      const at = sc.indexOf('<section id="family-intro">');
      if (at === -1) return null;
      return { open: at, end: closeOf(sc, at, "section") };
    },
  },
  {
    // Grade hubs built from inconel/625.html: breadcrumb, then the <h1> naming
    // the grade and one paragraph on what it is for.
    kind: "h1 + p (hub lead)",
    types: new Set(["grade-hub"]),
    find(s, sc) {
      const from = afterBreadcrumb(sc);
      if (from === -1) return null;
      const h1 = firstElement(sc, from);
      if (!h1 || h1.name !== "h1") return null;
      const h1End = closeOf(sc, h1.pos, "h1");
      if (h1End === -1) return null;
      const p = firstElement(sc, h1End);
      if (!p || p.name !== "p") return null;
      return { open: p.pos, end: closeOf(sc, p.pos, "p") };
    },
  },
];

const ALLOWED_PARENTS = new Set(["div", "section", "article"]);

// -> { kind, pos, indent } or { refused: reason }
function findAnchor(s, sc, type) {
  for (const a of ANCHORS) {
    if (a.types && !a.types.has(type)) continue;
    const hit = a.find(s, sc);
    if (!hit) continue;
    if (hit.end === -1) return { refused: `${a.kind} anchor has no matching end tag` };
    // Most anchors insert after the element; one inserts inside it.
    const pos = hit.insert ?? hit.end;
    const open = openAt(sc, pos);
    if (!open) return { refused: `${a.kind} anchor is outside <main>` };
    const bad = open.filter((n) => !ALLOWED_PARENTS.has(n));
    if (bad.length) return { refused: `${a.kind} anchor sits inside <${bad[bad.length - 1]}>` };
    return { kind: a.kind, pos, indent: indentAt(s, hit.open) + (hit.indentExtra || "") };
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * The block
 * ------------------------------------------------------------------ */

const START = "<!-- quote-cta:start  generated by docs/build-quote-cta.mjs -->";
const END = "<!-- quote-cta:end -->";
// Takes the newline and indent the writer put in front of the block with it, so
// removing a block restores the page byte for byte.
const BLOCK_RE = /\n?[ \t]*<!-- quote-cta:start[^\n]*?-->[\s\S]*?<!-- quote-cta:end -->/g;

// Subjects carry ®, & and the odd quote ("Duplex 2205 & 31803 Plates"), so every
// interpolation is escaped, in text and in attributes alike.
const esc = (v) =>
  String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Rebuilt identically every run, so a re-run is a no-op and --check is stable.
function block(subject, i) {
  const enquiry = `Enquiry: ${subject}`;
  // No &text= here, on purpose. seedWhatsAppLinks() in floating-form.js fills
  // every WhatsApp link that has none at runtime - "I would like a quote for:
  // <the same subject>" plus the page URL - and it deliberately leaves alone a
  // link that already carries a message. A static text= would therefore
  // suppress the richer seed the header rail gets on the same page.
  const wa = `https://api.whatsapp.com/send?phone=${DIGITS}`;
  return [
    `${i}${START}`,
    `${i}<aside class="quote-cta" aria-label="Request a quote">`,
    `${i}  <p class="quote-cta-text"><strong>Need a price for ${esc(subject)}?</strong> ` +
      `Send the grade, size and quantity and we reply within one working day.</p>`,
    `${i}  <div class="quote-cta-actions">`,
    `${i}    <a class="quote-cta-btn" href="/pages/contact/" data-enquiry="${esc(enquiry)}" data-placement="in_page">Get a quote</a>`,
    `${i}    <a class="quote-cta-wa" href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a>`,
    `${i}    <a class="quote-cta-call" href="tel:+${DIGITS}">Call ${esc(DISPLAY)}</a>`,
    `${i}  </div>`,
    `${i}</aside>`,
    `${i}${END}`,
  ].join("\n");
}

/* ------------------------------------------------------------------ *
 * Pages
 * ------------------------------------------------------------------ */

const disallowed = readFileSync(join(ROOT, "robots.txt"), "utf8")
  .split("\n")
  .map((l) => l.match(/^\s*Disallow:\s*(\S+)/i))
  .filter(Boolean)
  .map((m) => m[1]);

const files = execSync('git ls-files "*.html" "*.HTML"', { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 })
  .split("\n")
  .map((p) => p.trim())
  .filter(Boolean)
  .filter((p) => !p.startsWith(".claude/"));

const written = [];          // { rel, url, type, kind, subject }
const broken = [];
const skipped = new Map();   // reason -> { list, items: [] }
const changed = [];
const skip = (reason, item, list = true) => {
  if (!skipped.has(reason)) skipped.set(reason, { list, items: [] });
  skipped.get(reason).items.push(item);
};

for (const rel of files) {
  const fp = join(ROOT, rel);
  let raw;
  try {
    raw = readFileSync(fp, "utf8");
  } catch {
    continue; // listed in the index but absent from the working tree
  }
  const crlf = raw.includes("\r\n");
  const s0 = raw.replace(/\r\n/g, "\n"); // do all the work in LF space

  // Take any existing block out first. What is left is the page as it would be
  // without this script, and inserting into that - rather than patching a block
  // in place - means a page whose anchor moved gets its block moved with it.
  const starts = (s0.match(/<!-- quote-cta:start/g) || []).length;
  const ends = (s0.match(/<!-- quote-cta:end -->/g) || []).length;
  // A damaged block is a failure, not a skip. It used to be listed among the
  // skips and nothing else, so --check printed "All quote CTAs up to date" and
  // exited 0 over a page whose block had stopped being maintained.
  if (starts !== ends) {
    skip(`unbalanced quote-cta markers (${starts} start, ${ends} end) - repair by hand`, rel);
    broken.push(rel);
    continue;
  }
  const base = s0.replace(BLOCK_RE, "");
  if (/quote-cta:(start|end)/.test(base)) {
    skip("quote-cta marker left over after removing the blocks - repair by hand", rel);
    broken.push(rel);
    continue;
  }
  const had = starts > 0;

  // A page that stops qualifying loses its block: every `continue` below goes
  // through here, so a stale block can never survive a skip.
  const leave = (reason, item, list = true) => {
    if (had) {
      changed.push(rel);
      if (!CHECK) writeFileSync(fp, crlf ? base.replace(/\n/g, "\r\n") : base);
      reason += CHECK ? " - stale block to remove" : " - stale block removed";
      list = true;
    }
    skip(reason, item, list);
  };

  const fm = s0.match(/^---[ \t]*\n([\s\S]*?)\n---/);
  if (!fm) { leave("no front matter (an include or a standalone sheet)", rel, false); continue; }
  const front = fm[1];
  if (/^published:[ \t]*false/m.test(front)) { leave("published: false", rel, false); continue; }
  if (/^sitemap:[ \t]*false/m.test(front)) { leave("sitemap: false", rel, false); continue; }
  if (rel.startsWith("html/")) { leave("runtime fragment, not a page", rel, false); continue; }
  const pm = front.match(/^permalink:[ \t]*(\S+)/m);
  if (!pm) { leave("no permalink", rel, false); continue; }
  const url = pm[1].replace(/^["']|["']$/g, "");
  if (disallowed.some((d) => url.startsWith(d))) { leave("disallowed in robots.txt", url, false); continue; }

  const cls = classify(rel, url);
  if (cls.skip) { leave(cls.skip, url, cls.list); continue; }
  if (cls.type === "powder") {
    if (/[?&]enquiry=/.test(base.slice(fm[0].length)))
      leave("powder page: carries its own \"Request a sample\" enquiry CTA", url, false);
    else
      // Powder is a different production route with its own enquiry (a sample
      // request), so these are not given a wrought-product quote block - but
      // they lack the sample CTA too, which is worth seeing on every run.
      leave("powder page with no \"Request a sample\" CTA of its own - out of scope here, give it the powder pages' one", url);
    continue;
  }

  const crumb = breadcrumbSubject(base);
  if (!crumb) { leave("no BreadcrumbList to take a subject from", url); continue; }
  const subject = tidySubject(crumb);
  if (REFUSED_SUBJECTS[subject]) {
    leave(`${REFUSED_SUBJECTS[subject]} - fix the breadcrumb`, `${url}  "${subject}"`);
    continue;
  }
  if (namesOnlyAForm(subject)) {
    leave("last crumb names only a product form, not the grade - fix the breadcrumb", `${url}  "${subject}"`);
    continue;
  }

  const sc = scrub(base);
  const anchor = findAnchor(base, sc, cls.type);
  if (!anchor) { leave(`no safe anchor after the lead heading block (${cls.type})`, url); continue; }
  if (anchor.refused) { leave(`${anchor.refused} (${cls.type})`, url); continue; }

  const next =
    base.slice(0, anchor.pos) + "\n" + block(subject, anchor.indent) + base.slice(anchor.pos);
  written.push({ rel, url, type: cls.type, kind: anchor.kind, subject });
  if (next !== s0) {
    changed.push(rel);
    if (!CHECK) writeFileSync(fp, crlf ? next.replace(/\n/g, "\r\n") : next);
  }
}

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

const tally = (key) =>
  Object.entries(
    written.reduce((acc, w) => ((acc[w[key]] = (acc[w[key]] || 0) + 1), acc), {})
  ).sort((a, b) => b[1] - a[1]);

console.log(`Quote CTAs: ${written.length} pages carry the block.`);
console.log(`  by page type : ${tally("type").map(([k, n]) => `${k} ${n}`).join(", ")}`);
console.log(`  by anchor    : ${tally("kind").map(([k, n]) => `${k} ${n}`).join(", ")}`);
console.log(`  number       : ${DISPLAY} (FALLBACK_CONTACT.whatsapp in javascript/lead-config.js)`);
if (LIST) for (const w of written) console.log(`    ${w.url}  [${w.type}; ${w.kind}]  "${w.subject}"`);

const skippedTotal = [...skipped.values()].reduce((n, r) => n + r.items.length, 0);
console.log(`\n${skippedTotal} page(s) skipped, by reason - every page is either covered above or named here:`);
for (const [reason, { list, items }] of [...skipped].sort((a, b) => b[1].items.length - a[1].items.length)) {
  console.log(`\n  ${items.length}  ${reason}`);
  const show = list || LIST ? items : items.slice(0, 3);
  for (const it of show) console.log(`       ${it}`);
  if (show.length < items.length) console.log(`       ... +${items.length - show.length} more (--list names them)`);
}

if (broken.length) {
  console.error(`\n${broken.length} page(s) have damaged quote-cta markers and were left alone - repair by hand, then re-run:`);
  for (const r of broken) console.error(`   ${r}`);
}

if (CHECK) {
  if (changed.length || broken.length) {
    console.error(`\n${changed.length} page(s) would change:`);
    for (const r of changed.slice(0, 30)) console.error(`   ${r}`);
    if (changed.length > 30) console.error(`   ... +${changed.length - 30} more`);
    console.error("\nRun: node docs/build-quote-cta.mjs");
    process.exit(1);
  }
  console.log("\nAll quote CTAs up to date.");
  process.exit(0);
}

console.log(`\n${changed.length} page(s) written.`);
if (broken.length) process.exit(1);
