// Tells the IndexNow search engines which URLs on this site changed, so they
// recrawl those pages now rather than whenever they next happen to pass by.
//
//     node tools/indexnow.mjs --range <from>..<to>   pages whose HTML changed between two commits
//     node tools/indexnow.mjs --all                  every <loc> in sitemap.xml at HEAD (a one-off seeding run)
//     ... --dry-run                                  print the request body and the reasons, send nothing
//
// Why it exists: ChatGPT search and Microsoft Copilot answer from Bing's index,
// and Bing only learned about a change on this site when it happened to recrawl.
// This repo publishes changes in batches that matter the day they land - a
// re-quote pass, a corrected specification, a new grade page - so waiting weeks
// for a crawler is waiting weeks for the answer an assistant gives a buyer.
// IndexNow is one POST that Bing, Yandex, Seznam, Naver and Yep all share.
// Google does not read it; sitemap.xml and its <lastmod> are how Google hears.
//
// .github/workflows/indexnow.yml runs this after GitHub Pages has deployed a push
// to main. It is plain Node with no dependencies, like the generators in docs/.
// tools/ is excluded from the build, so none of this is published.
//
// What --range submits, and what it deliberately does not:
//
//   added / changed   a published page whose HTML changed - but only if its URL
//                     is in sitemap.xml at <to>. The sitemap already encodes
//                     every reason a page is withheld (published: false,
//                     sitemap: false, robots.txt, /html/ fragments), so this
//                     reuses that judgement instead of re-deriving it.
//   retired / moved   the OLD URL of a page that was deleted, unpublished or
//                     given a new permalink, so the engine sees the 404 or the
//                     redirect instead of serving the dead page from its index.
//   redirect          a redirect_from entry that is new in the range (or now
//                     points somewhere else) - that URL is now a redirect.
//   redirect-removed  a redirect_from entry that is gone: the URL now 404s, or
//                     a real page has taken it over (/haynes/242/ in f0997d1a).
//   new-in-sitemap    a <loc> in sitemap.xml at <to> that was not there at
//                     <from>. A new page pushed before its sitemap entry is
//                     otherwise never submitted, because the push that finally
//                     adds it to the sitemap changes no HTML.
//
//   NOT submitted, and said so in the output rather than done silently:
//   - _includes/, CSS/, javascript/, html/ fragments and _config.yml. They render
//     into every page, and resubmitting ~800 URLs because the footer changed
//     tells the engines nothing worth recrawling for. Pages whose own HTML
//     changed in the same range are still submitted.
//   - a page whose only change is its redirect_from list, a front-matter comment
//     or its line endings. The page it renders is byte-for-byte the same.
//
//   A sitewide sweep that edited the pages themselves IS submitted, page by page,
//   even when its SHA is in BOILERPLATE in docs/build-sitemap.mjs. That set is
//   Google's <lastmod> discipline, and it holds sweeps that rewrote exactly what
//   Bing shows and an assistant quotes: d3624386 finished 86 truncated <title>s,
//   c710232f put a breadcrumb and meta description on every page, 7f9ce97c
//   parked the Product node on 258 pages. Honouring the set here would have sent
//   0 of those 86 titles. IndexNow carries no date to inflate, and even a sweep
//   of every page is ~800 URLs, far inside the 10,000 cap.
//
// INDEXNOW_ENDPOINT overrides the endpoint. It exists for TESTS ONLY - pointing
// the script at a local stub server - and nothing in CI sets it.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOST = 'www.nickelsheets.com';
const ORIGIN = `https://${HOST}`;
const ENDPOINT = process.env.INDEXNOW_ENDPOINT || 'https://api.indexnow.org/indexnow';
// The protocol caps one request at 10,000 URLs; more are sent as several POSTs.
const MAX_PER_REQUEST = 10000;

// ---- arguments ---------------------------------------------------------------
const argv = process.argv.slice(2);
const USAGE = 'usage: node tools/indexnow.mjs (--range <from>..<to> | --all) [--dry-run]';
const DRY = argv.includes('--dry-run');
const ALL = argv.includes('--all');
let RANGE;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--range') RANGE = argv[++i];
  else if (a.startsWith('--range=')) RANGE = a.slice('--range='.length);
  else if (a === '--help' || a === '-h') { console.log(USAGE); process.exit(0); }
  else if (a !== '--dry-run' && a !== '--all') fail(`unknown argument "${a}"\n${USAGE}`);
}
if (ALL === (RANGE !== undefined)) fail(`give exactly one of --range or --all\n${USAGE}`);

function fail(msg) {
  console.error(`indexnow: ${msg}`);
  summary(`### IndexNow: failed\n\n${msg}\n`);
  process.exit(1);
}

function summary(md) {
  const f = process.env.GITHUB_STEP_SUMMARY;
  if (f) fs.appendFileSync(f, md + '\n');
}

// ---- git -----------------------------------------------------------------------
function git(args) {
  return execFileSync('git', args, {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function commit(ref) {
  try { return git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).trim(); }
  catch {
    fail(`cannot resolve "${ref}" to a commit. In CI this means the checkout is shallow - ` +
      'actions/checkout needs fetch-depth: 0, or the range is computed against history it does not have.');
  }
}

// Many files at once through one `git cat-file --batch`, rather than a process
// per file: a sweep range reads ~1,600 blobs. Returns spec -> text, or null for
// a path that does not exist at that revision.
function readBlobs(specs) {
  const out = new Map();
  if (!specs.length) return out;
  const r = spawnSync('git', ['cat-file', '--batch'], {
    cwd: ROOT, input: specs.join('\n') + '\n', maxBuffer: 1 << 30,
  });
  if (r.status !== 0) fail(`git cat-file failed: ${r.stderr}`);
  const buf = r.stdout;
  let pos = 0;
  for (const spec of specs) {
    const nl = buf.indexOf(0x0a, pos);
    const header = buf.toString('utf8', pos, nl);
    pos = nl + 1;
    if (/ (missing|ambiguous)$/.test(header)) { out.set(spec, null); continue; }
    const [, type, size] = header.split(' ');
    const n = Number(size);
    out.set(spec, type === 'blob' ? buf.toString('utf8', pos, pos + n) : null);
    pos += n + 1;                                   // content is followed by one LF
  }
  return out;
}
const readBlob = (rev, file) => readBlobs([`${rev}:${file}`]).get(`${rev}:${file}`);

// ---- the key -------------------------------------------------------------------
// Read from the one key file at the repo root - the same file the engines fetch
// from https://www.nickelsheets.com/<key>.txt - never from a second copy, so the
// key posted and the key served cannot disagree. It is found by what it is: a
// .txt whose name is its own content. robots.txt and llms.txt are not.
function findKey() {
  const found = [];
  for (const name of fs.readdirSync(ROOT)) {
    const m = name.match(/^([A-Za-z0-9-]{8,128})\.txt$/);
    if (!m) continue;
    const content = fs.readFileSync(path.join(ROOT, name), 'utf8');
    if (content.trim() === m[1]) found.push({ key: m[1], file: name, exact: content === m[1] });
  }
  if (!found.length) fail('no IndexNow key file at the repo root - expected <key>.txt containing exactly <key>.');
  if (found.length > 1) fail(`${found.length} key files at the repo root (${found.map(f => f.file).join(', ')}); keep one.`);
  const k = found[0];
  if (!k.exact) console.warn(`warning: ${k.file} has whitespace around the key; the file should hold the key and nothing else.`);
  return k;
}

// ---- robots.txt and sitemap.xml at a revision ------------------------------------
function disallowRules(rev) {
  const txt = readBlob(rev, 'robots.txt') || '';
  return txt.split(/\r?\n/).map(l => l.match(/^[ \t]*Disallow:[ \t]*(\S+)/i)).filter(Boolean).map(m => m[1]);
}

const unescapeXml = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&amp;/g, '&');

// Paths (not absolute URLs) of every <loc>, or null if the file does not exist
// at that revision. <image:loc> is not matched: the tag name differs.
function sitemapPaths(rev) {
  const xml = readBlob(rev, 'sitemap.xml');
  if (xml == null) return null;
  const paths = [], foreign = [];
  for (const m of xml.matchAll(/<loc>([^<]*)<\/loc>/g)) {
    const loc = unescapeXml(m[1].trim());
    if (loc.startsWith(ORIGIN + '/')) paths.push(loc.slice(ORIGIN.length));
    else foreign.push(loc);
  }
  return { paths, foreign };
}

// ---- front matter ---------------------------------------------------------------
// Only the four keys this script needs, parsed without a YAML dependency. Per
// CLAUDE.md, every pattern uses [ \t]* and never \s*: \s matches the newline,
// and /^redirect_from:\s*(.*)$/m once swallowed it and captured the FIRST LIST
// ITEM as the value, silently losing one redirect on exactly the pages that had
// any. Line endings are normalised first, since the pages arrive CRLF on the
// machine this repo is maintained from.
const KEY_LINE = /^([A-Za-z_][\w-]*):[ \t]*(.*)$/;
const FALSE = /^(?:false|False|FALSE|no|No|NO|off|Off|OFF)$/;

function scalar(v) {
  v = v.trim();
  if (v.startsWith('#')) return '';
  const q = v.match(/^(["'])(.*?)\1/);
  if (q) return q[2];
  return v.replace(/[ \t]+#.*$/, '').trim();
}

function parsePage(raw) {
  if (raw == null) return null;
  const s = raw.replace(/\r\n/g, '\n').replace(/^\uFEFF/, '');
  const m = s.match(/^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);
  if (!m) return { fm: false, signature: s };
  const lines = m[1].split('\n');
  const body = s.slice(m[0].length);
  const keys = {};
  const kept = [];                  // front-matter lines that can change what renders
  for (let i = 0; i < lines.length; i++) {
    const km = lines[i].match(KEY_LINE);
    if (!km) {
      if (!/^[ \t]*(#.*)?$/.test(lines[i])) kept.push(lines[i]);   // comments and blanks never render
      continue;
    }
    const [, key, rest] = km;
    const block = [];
    while (i + 1 < lines.length && !/^[A-Za-z_]/.test(lines[i + 1])) block.push(lines[++i]);
    if (key !== 'redirect_from') kept.push(lines[i - block.length], ...block.filter(l => !/^[ \t]*(#.*)?$/.test(l)));
    const inline = rest.trim();
    if (inline && !inline.startsWith('#')) {
      keys[key] = { raw: inline.replace(/[ \t]+#.*$/, ''), value: inline.startsWith('[')
        ? inline.replace(/^\[|\][ \t]*(#.*)?$/g, '').split(',').map(scalar).filter(Boolean)
        : scalar(inline) };
    } else {
      keys[key] = { raw: '', value: block.map(l => l.match(/^[ \t]*-[ \t]+(.*)$/)).filter(Boolean)
        .map(x => scalar(x[1])).filter(Boolean) };
    }
  }
  const isFalse = k => !!keys[k] && FALSE.test(keys[k].raw);
  const url = p => (typeof p === 'string' && p ? (p.startsWith('/') ? p : '/' + p) : null);
  const rf = keys.redirect_from ? keys.redirect_from.value : [];
  return {
    fm: true,
    published: !isFalse('published'),
    sitemapFalse: isFalse('sitemap'),
    permalink: keys.permalink ? url(keys.permalink.value) : null,
    redirects: (Array.isArray(rf) ? rf : [rf]).map(url).filter(Boolean),
    // What the page renders from: the front matter minus redirect_from, comments
    // and blank lines, plus the body. Two versions with the same signature serve
    // the same page, whatever else differs between the files.
    signature: kept.join('\n') + '\n---\n' + body,
  };
}

// ---- collect ----------------------------------------------------------------------
const submit = new Map();           // path -> { reason, detail }
const skipped = new Map();          // bucket -> [detail]
const notes = [];
const noteSkip = (bucket, detail) => { if (!skipped.has(bucket)) skipped.set(bucket, []); skipped.get(bucket).push(detail); };

let disallowed = [];
const isDisallowed = p => disallowed.some(d => p.startsWith(d));
function add(p, reason, detail) {
  if (!p) return;
  if (isDisallowed(p)) { noteSkip('robots', `${p} (${detail})`); return; }
  if (!submit.has(p)) submit.set(p, { reason, detail });
}

const SKIP_TEXT = {
  shared: 'shared chrome: renders into every page, so it is not expanded into ~800 URLs',
  unchanged: 'renders the same page: only redirect_from, front-matter comments or line endings changed',
  'not-in-sitemap': 'not in sitemap.xml at <to>, so not submitted',
  'not-a-page': 'no front matter: not a Jekyll page',
  robots: 'disallowed in robots.txt: the engine may not fetch it anyway',
  'bad-url': 'does not resolve to a URL on ' + HOST,
};
const SHARED = f => /^(_includes|_layouts|_data|CSS|javascript|html)\//.test(f) || f === '_config.yml';

let header;
let pagesChanged = 0;
if (ALL) {
  const head = commit('HEAD');
  disallowed = disallowRules(head);
  const sm = sitemapPaths(head);
  if (!sm) fail('sitemap.xml does not exist at HEAD.');
  for (const loc of sm.foreign) noteSkip('bad-url', loc);
  for (const p of sm.paths) add(p, 'sitemap', 'every <loc> in sitemap.xml');
  header = `--all: every <loc> in sitemap.xml at ${head.slice(0, 8)} (${sm.paths.length + sm.foreign.length} <loc>)`;
} else {
  const parts = RANGE.split('..');
  // A side opening with "-" would reach git as an option; "a...b" splits into a
  // second part opening with ".".
  if (parts.length !== 2 || parts.some(p => !p || /^[-.]/.test(p))) fail(`--range must be <from>..<to>, got "${RANGE}"`);
  const from = commit(parts[0]);
  const to = commit(parts[1]);
  disallowed = disallowRules(to);

  // Everything that changed, for the shared-chrome report.
  const allChanged = git(['-c', 'core.quotePath=false', 'diff', '-z', '--name-only', from, to]).split('\0').filter(Boolean);
  for (const f of allChanged) if (SHARED(f)) noteSkip('shared', f);

  // The page diff, with renames detected so a moved file is one entry, not a
  // delete and an add. -z keeps paths with spaces or non-ASCII intact.
  const tok = git(['diff', '-z', '--name-status', '-M', from, to, '--', ':(icase)*.html', ':(icase)*.htm']).split('\0');
  const entries = [];
  for (let i = 0; i + 1 < tok.length;) {
    const status = tok[i];
    if (!status) { i++; continue; }
    if (/^[RC]/.test(status)) { entries.push({ status: status[0], old: tok[i + 1], neu: tok[i + 2] }); i += 3; }
    else { entries.push({ status: status[0], old: status === 'A' ? null : tok[i + 1], neu: status === 'D' ? null : tok[i + 1] }); i += 2; }
  }
  const pageEntries = entries.filter(e => !SHARED(e.old || e.neu));

  const blobs = readBlobs(pageEntries.flatMap(e => [e.old && `${from}:${e.old}`, e.neu && `${to}:${e.neu}`]).filter(Boolean));
  const smTo = sitemapPaths(to);
  const smFrom = sitemapPaths(from);
  if (!smTo) fail(`sitemap.xml does not exist at ${to.slice(0, 8)}.`);
  const inSitemap = new Set(smTo.paths);

  const fromRedirects = new Map(), toRedirects = new Map();   // redirect URL -> target permalink
  for (const e of pageEntries) {
    const F = e.old ? parsePage(blobs.get(`${from}:${e.old}`)) : null;
    const T = e.neu ? parsePage(blobs.get(`${to}:${e.neu}`)) : null;
    const file = e.neu || e.old;
    const wasLive = F && F.fm && F.published && F.permalink;
    const isLive = T && T.fm && T.published && T.permalink;
    // jekyll-redirect-from only generates stubs for pages that are built.
    if (wasLive) for (const r of F.redirects) fromRedirects.set(r, F.permalink);
    if (isLive) for (const r of T.redirects) toRedirects.set(r, T.permalink);

    // The old URL, when this range took it away from this file.
    if (wasLive) {
      if (!T) add(F.permalink, 'retired', `${e.old} deleted`);
      else if (!T.fm || !T.published) add(F.permalink, 'retired', `${file} unpublished`);
      else if (T.permalink !== F.permalink) add(F.permalink, 'moved', `${file} moved to ${T.permalink || 'its source path'}`);
    }

    // The URL the file serves now.
    if (!T) continue;
    if (!T.fm) { noteSkip('not-a-page', file); continue; }
    if (!isLive || !inSitemap.has(T.permalink)) {
      const why = !T.published ? 'published: false' : !T.permalink ? 'no permalink'
        : T.sitemapFalse ? 'sitemap: false' : isDisallowed(T.permalink) ? 'robots.txt'
        : 'NOT IN sitemap.xml - regenerate it: node docs/build-sitemap.mjs';
      noteSkip('not-in-sitemap', `${T.permalink || file} (${why})`);
      continue;
    }
    if (!wasLive || F.permalink !== T.permalink) { add(T.permalink, 'added', `${file} ${e.status === 'A' ? 'added' : 'now serves this URL'}`); continue; }
    if (F.signature === T.signature) { noteSkip('unchanged', T.permalink); continue; }
    add(T.permalink, 'changed', file);
  }

  // A redirect is news when it is new, or points somewhere else than it did.
  for (const [r, target] of toRedirects) {
    if (fromRedirects.get(r) !== target) add(r, 'redirect', `now redirects to ${target}`);
  }
  for (const [r, target] of fromRedirects) {
    if (!toRedirects.has(r)) add(r, 'redirect-removed', `no longer redirects to ${target}`);
  }

  if (smFrom) {
    const before = new Set(smFrom.paths);
    for (const p of smTo.paths) if (!before.has(p)) add(p, 'new-in-sitemap', 'in sitemap.xml at <to>, not at <from>');
  } else notes.push('sitemap.xml did not exist at <from>, so newly listed URLs were not compared.');

  const commits = Number(git(['rev-list', '--count', `${from}..${to}`]).trim());
  pagesChanged = pageEntries.length;
  header = `--range ${from.slice(0, 8)}..${to.slice(0, 8)}: ${commits} commit(s), ${pagesChanged} page file(s) changed`;
}

// ---- absolute URLs -------------------------------------------------------------------
const urlList = [];
const reasonOf = new Map();
for (const [p, { reason }] of submit) {
  let u;
  try { u = new URL(p, ORIGIN); } catch { noteSkip('bad-url', p); continue; }
  // A permalink opening with // would parse as another host, and one foreign URL
  // makes the engine reject the whole request with 422.
  if (u.host !== HOST || u.protocol !== 'https:') { noteSkip('bad-url', p); continue; }
  if (reasonOf.has(u.href)) continue;
  reasonOf.set(u.href, reason);
  urlList.push(u.href);
}

const counts = {};
for (const r of reasonOf.values()) counts[r] = (counts[r] || 0) + 1;
const ORDER = ['added', 'changed', 'new-in-sitemap', 'moved', 'retired', 'redirect', 'redirect-removed', 'sitemap'];
const countLines = ORDER.filter(r => counts[r]).map(r => `  ${r.padEnd(18)} ${counts[r]}`);

// ---- report ----------------------------------------------------------------------------
const keyInfo = findKey();
const keyLocation = `${ORIGIN}/${keyInfo.file}`;

console.log(`IndexNow ${header}`);
console.log(`\nsubmitting ${urlList.length} URL(s)${urlList.length ? ':' : ''}`);
for (const l of countLines) console.log(l);
if (skipped.size) {
  console.log('\nnot submitted:');
  for (const [bucket, items] of skipped) {
    console.log(`  ${bucket.padEnd(18)} ${String(items.length).padStart(4)}  ${SKIP_TEXT[bucket]}`);
    const show = bucket === 'not-in-sitemap' || bucket === 'robots' || bucket === 'bad-url' ? items : items.slice(0, 5);
    for (const it of show) console.log(`  ${''.padEnd(24)}${it}`);
    if (show.length < items.length) console.log(`  ${''.padEnd(24)}... and ${items.length - show.length} more`);
  }
}
if (skipped.has('shared') && !pagesChanged && !urlList.length) {
  console.log('\nOnly shared chrome changed in this range. It reaches every page, but no page\'s own');
  console.log('HTML changed, so there is nothing to tell the engines - the next crawl picks it up.');
}
for (const n of notes) console.log(`\nnote: ${n}`);

const chunks = [];
for (let i = 0; i < urlList.length; i += MAX_PER_REQUEST) {
  chunks.push({ host: HOST, key: keyInfo.key, keyLocation, urlList: urlList.slice(i, i + MAX_PER_REQUEST) });
}

// state: 'dry', 'empty', 'sent' or 'failed' - the heading says which, so a red
// run's summary does not open by announcing a number as if it had been sent.
function summaryTable(state, result = '') {
  const title = { dry: 'IndexNow (dry run)', empty: 'IndexNow: nothing to submit', sent: 'IndexNow: submitted',
    failed: 'IndexNow: submission FAILED' }[state];
  const lead = { dry: `${urlList.length} URL(s) would be submitted.`, empty: '0 URLs - no request was sent.',
    sent: `${urlList.length} URL(s) submitted.`, failed: `${urlList.length} URL(s) were to be submitted.` }[state];
  const lines = [`### ${title}`, '', `\`${header}\``, '', `**${lead}**${result ? ' ' + result : ''}`, ''];
  if (urlList.length) {
    lines.push('| reason | URLs |', '|---|---:|', ...ORDER.filter(r => counts[r]).map(r => `| ${r} | ${counts[r]} |`), '');
    lines.push('<details><summary>URLs</summary>', '', ...urlList.map(u => `- ${reasonOf.get(u)}: ${u}`), '', '</details>', '');
  }
  if (skipped.size) {
    lines.push('Not submitted:', '', '| | count | why |', '|---|---:|---|',
      ...[...skipped].map(([b, items]) => `| ${b} | ${items.length} | ${SKIP_TEXT[b]} |`), '');
    const loud = skipped.get('not-in-sitemap')?.filter(x => x.includes('NOT IN sitemap.xml')) || [];
    if (loud.length) lines.push(`**${loud.length} changed page(s) are missing from sitemap.xml** - regenerate it and they are submitted by the push that commits it.`, '');
  }
  for (const n of notes) lines.push(`> ${n}`, '');
  return lines.join('\n');
}

if (DRY) {
  // Which reason put each URL in the list. --all has only one, so it is omitted.
  if (!ALL && urlList.length) {
    console.log('\nby URL:');
    for (const u of urlList) console.log(`  ${reasonOf.get(u).padEnd(18)} ${u}`);
  }
  console.log(chunks.length ? `\ndry run - ${chunks.length} request(s) would be sent to ${ENDPOINT}:`
    : '\ndry run - nothing to submit, so no request would be sent.');
  for (const c of chunks) console.log(JSON.stringify(c, null, 2));
  summary(summaryTable('dry'));
  process.exit(0);
}

if (!urlList.length) {
  console.log('\nnothing to submit.');
  summary(summaryTable('empty'));
  process.exit(0);
}

// A key file that is not in HEAD is not on the live site either, and the engine
// would answer 403. Worth a warning; the POST says so definitively.
if (readBlob(commit('HEAD'), keyInfo.file) == null) {
  console.warn(`warning: ${keyInfo.file} is not committed at HEAD, so ${keyLocation} is probably not live.`);
}

const STATUS = {
  400: 'bad request - the body is not valid IndexNow JSON',
  403: `forbidden - the key is not valid: the engine could not fetch ${keyLocation}, or it does not contain the key. Is the key file deployed?`,
  422: `unprocessable - a URL is not on ${HOST}, or the key does not match the protocol's format`,
  429: 'too many requests - the engine is throttling this host (it treats this as potential spam); wait before resubmitting',
};

let failed = 0;
const results = [];
for (const [i, body] of chunks.entries()) {
  const label = chunks.length > 1 ? `request ${i + 1}/${chunks.length} ` : '';
  let res, text = '';
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    text = (await res.text().catch(() => '')).trim().slice(0, 500);
  } catch (e) {
    failed++;
    const msg = `${label}failed before a response: ${e.cause?.code || e.name}: ${e.cause?.message || e.message}`;
    console.error(`\n${msg}`);
    results.push(msg);
    continue;
  }
  if (res.status === 200 || res.status === 202) {
    const msg = `${label}HTTP ${res.status}: ${res.status === 200 ? 'received' : 'accepted - the key is still being validated'} (${body.urlList.length} URLs)`;
    console.log(`\n${msg}`);
    results.push(msg);
  } else {
    failed++;
    const msg = `${label}HTTP ${res.status}: ${STATUS[res.status] || 'unexpected response'}${text ? ` - response: ${text}` : ''}`;
    console.error(`\n${msg}`);
    results.push(msg);
  }
}

summary(summaryTable(failed ? 'failed' : 'sent', results.join('; ')));
process.exit(failed ? 1 : 0);
