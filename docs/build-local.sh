#!/usr/bin/env bash
#
# Builds the site the way GitHub Pages does, working around two things Windows
# cannot reproduce on its own.
#
#     bash docs/build-local.sh          # any extra jekyll build flags pass through
#
# 1. URL case. A few URLs here differ only by case: /Hastelloy/foil/ is a real
#    page and /hastelloy/foil/ is a redirect stub aimed at it, and
#    /monel/K-500/sheets/ has the same shape. GitHub Pages builds on Linux where
#    those are distinct paths; Windows collapses each pair into one directory and
#    whichever file Jekyll writes last silently wins. The local _site then
#    disagrees with production, and a link checker reading it reports hundreds of
#    404s that do not exist.
#
#    Windows 10 1803+ can mark one directory case-sensitive, and directories
#    created inside inherit it, so marking an empty _site covers the whole tree.
#    The flag only sets on an EMPTY directory, which is why _site is recreated
#    rather than reused - and why `rm -rf _site && bundle exec jekyll build`
#    quietly loses the protection.
#
# 2. Colons in URLs. Some pages carry redirect_from entries for the old NiCr
#    URLs (/NiCr/20:25/plates/ and friends), which Search Console reports as
#    404s. jekyll-redirect-from writes a directory per redirect URL, and Windows
#    cannot create a directory with a colon in its name, so the build dies
#    outright. Those redirects are correct and must stay in the repo: they work
#    on the Linux runner that actually publishes the site.
#
#    So when the filesystem rejects colons, this builds from a throwaway copy of
#    the source with just those redirect entries removed. The working tree is
#    never modified, production is unaffected, and the only difference from the
#    real site is that those few redirect stubs are missing locally.
#
# This script is excluded from the published site in _config.yml.
set -euo pipefail
cd "$(dirname "$0")/.."

win() { cygpath -m "$1" 2>/dev/null || echo "$1"; }   # path Ruby understands

rm -rf _site
mkdir _site

# --- 1. case sensitivity ------------------------------------------------------
if command -v fsutil.exe >/dev/null 2>&1; then
  fsutil.exe file setCaseSensitiveInfo _site enable >/dev/null 2>&1 || true
fi

# Verify the outcome rather than trusting the attempt.
touch _site/.CaseProbe
if [ -e _site/.caseprobe ]; then
  cat >&2 <<'WARN'
WARNING: _site is case-insensitive on this machine.

  URLs differing only by case collapse into one file, so this build does NOT
  match what GitHub Pages serves. Do not conclude a page is missing, or that a
  link 404s, from it - check the source permalink or the live site.

  On Windows this needs 10 1803+ with the NTFS case-sensitivity support present.
WARN
else
  echo "_site is case-sensitive - matches GitHub Pages"
fi
rm -f _site/.CaseProbe

# --- 2. colons in redirect URLs ----------------------------------------------
# Probe with Ruby, not the shell: Git Bash will happily "create" _site/probe:1
# while Ruby - which is what Jekyll actually writes with - fails with ENOTDIR.
if ruby -e 'require "fileutils"; FileUtils.mkdir_p("_site/probe:1")' 2>/dev/null; then
  rm -rf "_site/probe:1"
  exec bundle exec jekyll build "$@"          # filesystem is fine, build in place
fi
rm -rf "_site/probe:1"

COLONS=$(grep -rhE '^[[:space:]]*-[[:space:]]*/[^[:space:]]*:' --include='*.html' . \
  2>/dev/null | grep -v '^\./_site' | wc -l | tr -d ' ')

if [ "$COLONS" = "0" ]; then
  exec bundle exec jekyll build "$@"          # nothing to work around
fi

SRC=$(mktemp -d)
trap 'rm -rf "$SRC"' EXIT INT TERM
tar -cf - --exclude=./.git --exclude=./_site --exclude=./vendor \
          --exclude=./.jekyll-cache --exclude=./node_modules . | tar -xf - -C "$SRC"

cat > "$SRC/.strip.js" <<'STRIP'
// Drops redirect_from entries whose URL contains a colon, and the now-empty
// redirect_from key they leave behind. Operates on the throwaway copy only.
const fs = require('fs'), path = require('path');
let files = 0, entries = 0;
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!/\.html?$/i.test(e.name)) continue;
    const src = fs.readFileSync(p, 'utf8');
    if (!/redirect_from:/.test(src)) continue;
    const out = [];
    let dropped = 0;
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (/^\s*-\s*\/\S*:/.test(l)) { dropped++; entries++; continue; }
      // a redirect_from key with no list item after it is now dead
      if (/^redirect_from:\s*$/.test(l)) {
        let j = i + 1;
        while (j < lines.length && /^\s*#/.test(lines[j])) j++;
        if (j >= lines.length || !/^\s*-\s*\S/.test(lines[j])) continue;
      }
      out.push(l);
    }
    if (dropped) { fs.writeFileSync(p, out.join('\n')); files++; }
  }
})(process.argv[2]);
console.log(`  stripped ${entries} colon redirect(s) from ${files} file(s) in the copy`);
STRIP

echo "this filesystem rejects colons in filenames; building from a stripped copy"
node "$SRC/.strip.js" "$SRC"
rm -f "$SRC/.strip.js"

bundle exec jekyll build --source "$(win "$SRC")" --destination "$(win "$PWD")/_site" "$@"

cat >&2 <<WARN

NOTE: $COLONS redirect stub(s) whose URL contains a colon were left out of this
      build - Windows cannot create those directories. They are present in the
      repo and are published normally by GitHub Pages. Everything else matches.
WARN
