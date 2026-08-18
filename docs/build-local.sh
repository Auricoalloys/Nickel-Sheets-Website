#!/usr/bin/env bash
#
# Builds the site the way GitHub Pages does, including URL case sensitivity.
#
#     bash docs/build-local.sh          # add any jekyll build flags after
#
# Why this exists rather than plain `bundle exec jekyll build`:
#
# A few URLs here differ only by case. /Hastelloy/foil/ is a real page and
# /hastelloy/foil/ is a redirect stub pointing at it; same shape for
# /monel/K-500/sheets/. GitHub Pages builds on Linux, where those are two
# distinct paths. Windows is case-insensitive by default, so it collapses each
# pair into a single directory and whichever file Jekyll writes last silently
# wins. The local _site then disagrees with production: a real page can appear
# to be a redirect stub, and a link checker reading _site reports hundreds of
# 404s that do not exist. That cost real time before this script existed.
#
# Windows 10 1803+ can mark one directory case-sensitive, and directories
# created inside it inherit the flag - so marking an empty _site before the
# build is enough to cover the whole tree. The flag can only be set on an EMPTY
# directory, which is why _site is recreated rather than reused, and it cannot
# be turned off again once colliding entries exist.
#
# This script is excluded from the published site in _config.yml.
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf _site
mkdir _site

# Windows only; on Linux the filesystem is already case-sensitive and fsutil
# does not exist. macOS is usually case-INsensitive, which the probe below
# catches.
if command -v fsutil.exe >/dev/null 2>&1; then
  fsutil.exe file setCaseSensitiveInfo _site enable >/dev/null 2>&1 || true
fi

# Verify the outcome rather than trusting the attempt: create one name, look for
# the other casing. This works on every platform.
touch _site/.CaseProbe
if [ -e _site/.caseprobe ]; then
  cat >&2 <<'WARN'
WARNING: _site is case-insensitive on this machine.

  URLs that differ only by case will collapse into one file, so the build does
  NOT match what GitHub Pages serves. Do not conclude a page is missing, or
  that a link 404s, from this build - check the source permalink or the live
  site instead.

  On Windows this needs 10 1803+ with the WSL optional component installed.
WARN
else
  echo "_site is case-sensitive - this build matches GitHub Pages"
fi
rm -f _site/.CaseProbe

bundle exec jekyll build "$@"
