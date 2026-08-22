#!/usr/bin/env python3
"""Daily SEO audit for nickelsheets.com.

Reports regressions; it does not change anything. Every check here corresponds
to a real bug found on this site, so a non-zero count means something that was
fixed has come back.

    python tools/seo_audit.py                 # human-readable report
    python tools/seo_audit.py --json          # machine-readable
    python tools/seo_audit.py --live          # also check live URLs (slow)
    python tools/seo_audit.py --fail-on-new   # exit 1 if worse than the baseline

Baseline lives in tools/seo_baseline.json. Counts at or below baseline pass, so
the known-acceptable items (include fragments with no <title>) do not produce
daily noise. Deliberate canonical consolidations used to be parked there too;
they are now excluded by the checks themselves, because a count cannot tell one
of them from a real finding that replaced it.
"""
import os, re, sys, json, html, collections, subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASELINE = os.path.join(ROOT, "tools", "seo_baseline.json")
SKIP_DIRS = {".git", ".vscode", ".claude", "node_modules", "_site", "vendor", "tools",
             # Powder data sheets. Generated print documents, excluded from the
             # Jekyll build and served at no URL, so a canonical tag would point
             # nowhere and title length is a print concern rather than an SEO one.
             # Without this they read as 16 pages missing every piece of metadata.
             # If they are ever published - the exclusion in _config.yml is the
             # only thing stopping that - take this entry out again, because from
             # that moment they are real pages and every check here applies.
             "powder-datasheets"}

# Fragments injected into other pages; they are not pages and have no metadata.
FRAGMENTS = {"_includes/header.html", "_includes/footer.html",
             "html/header.html", "html/footer.html",
             "html/product_detailed_page.html"}


# robots.txt is the site's own statement of which routes it withholds.
# docs/build-sitemap.mjs already reads it for the same reason - a route must
# never be both blocked and advertised - so the two agree on what "not
# advertised" means instead of each keeping its own list.
def _disallowed_prefixes():
    fp = os.path.join(ROOT, "robots.txt")
    if not os.path.exists(fp):
        return []
    lines = open(fp, encoding="utf-8", errors="replace").read().splitlines()
    return [m.group(1) for m in
            (re.match(r"\s*Disallow:\s*(\S+)", l, re.I) for l in lines) if m]


DISALLOWED = _disallowed_prefixes()


def is_disallowed(url):
    return any(url.startswith(d) for d in DISALLOWED)


def collect():
    pages = {}
    for dp, dn, fn in os.walk(ROOT):
        dn[:] = [d for d in dn if d not in SKIP_DIRS]
        for f in fn:
            if not f.lower().endswith((".html", ".htm")):
                continue
            p = os.path.relpath(os.path.join(dp, f), ROOT).replace("\\", "/")
            raw = open(os.path.join(dp, f), encoding="utf-8", errors="replace").read()
            fm = re.match(r"^﻿?---\s*\r?\n(.*?)\r?\n---\s*\r?\n", raw, re.S)
            block = fm.group(1) if fm else ""
            pm = re.search(r"^permalink\s*:\s*(.+)$", block, re.M)
            permalink = None
            if pm:
                permalink = pm.group(1).strip().strip("\"'")
                if not permalink.startswith("/"):
                    permalink = "/" + permalink
            redirects = [m.group(1) for m in
                         (re.match(r"\s*-\s*(/\S*)\s*$", l) for l in block.splitlines()) if m]
            t = re.search(r"<title[^>]*>(.*?)</title>", raw, re.S | re.I)
            d = re.search(r'<meta\s+name=["\']description["\']\s+content=["\'](.*?)["\']', raw, re.S | re.I)
            og = re.search(r'<meta\s+property=["\']og:description["\']\s+content=["\'](.*?)["\']', raw, re.S | re.I)
            tw = re.search(r'<meta\s+name=["\']twitter:description["\']\s+content=["\'](.*?)["\']', raw, re.S | re.I)
            c = re.search(r'rel=["\']canonical["\']\s+href=["\']([^"\']+)["\']', raw, re.I)
            # published: false never reaches the built site, so it must not be
            # counted as a duplicate of the page that actually serves the URL.
            if re.search(r"^published\s*:\s*false", block, re.M):
                continue
            pages[p] = {
                "raw": raw, "fm": block, "permalink": permalink, "redirects": redirects,
                "title": html.unescape(re.sub(r"\s+", " ", t.group(1)).strip()) if t else None,
                # unescaped, like the title above: "&amp;" is five characters in
                # the source and one in the rendered snippet, so measuring the
                # raw attribute would call a page over-length that is not - and
                # escaping a bare & correctly would then look like a regression.
                "desc": html.unescape(re.sub(r"\s+", " ", d.group(1)).strip()) if d else None,
                # the raw forms, to compare the three copies of the same sentence
                "desc_raw": re.sub(r"\s+", " ", d.group(1)).strip() if d else None,
                "og_desc": re.sub(r"\s+", " ", og.group(1)).strip() if og else None,
                "tw_desc": re.sub(r"\s+", " ", tw.group(1)).strip() if tw else None,
                "canonical": c.group(1) if c else None,
                "n_title": len(re.findall(r"<title[^>]*>", raw, re.I)),
                "n_desc": len(re.findall(r'<meta\s+name=["\']description["\']', raw, re.I)),
                "n_canon": len(re.findall(r'rel=["\']canonical["\']', raw, re.I)),
                "n_h1": len(re.findall(r"<h1[\s>]", raw, re.I)),
                "imgs": re.findall(r"<img\b[^>]*>", raw, re.I),
                # the two ways a page declares it is not advertised
                "sitemap_false": bool(re.search(r"^sitemap\s*:\s*false", block, re.M)),
                "robots_blocked": bool(permalink) and is_disallowed(permalink),
            }
    return pages


def audit(pages):
    findings = collections.OrderedDict()
    real = {p: d for p, d in pages.items() if p not in FRAGMENTS}

    served = collections.defaultdict(list)
    for p, d in pages.items():
        if d["permalink"]:
            served[(d["permalink"].rstrip("/") or "/")].append(p)

    findings["duplicate_permalinks"] = [
        {"url": u, "files": v} for u, v in sorted(served.items()) if len(v) > 1]

    findings["case_variant_urls"] = []
    low = collections.defaultdict(list)
    for u in served:
        low[u.lower()].append(u)
    for k, v in sorted(low.items()):
        if len(v) > 1:
            findings["case_variant_urls"].append({"urls": sorted(v)})

    findings["missing_title"] = sorted(p for p, d in real.items() if not d["title"])
    findings["missing_description"] = sorted(p for p, d in real.items() if not d["desc"])
    findings["missing_canonical"] = sorted(p for p, d in real.items() if not d["canonical"])

    findings["truncated_description"] = sorted(
        p for p, d in real.items() if d["desc"] and d["desc"].rstrip().endswith("..."))
    findings["empty_description"] = sorted(
        p for p, d in real.items() if d["desc"] is not None and not d["desc"].strip())

    findings["duplicate_tags_same_page"] = sorted(
        p for p, d in real.items()
        if d["n_title"] > 1 or d["n_desc"] > 1 or d["n_canon"] > 1)

    # A route blocked in robots.txt has no standalone content to head: the one
    # such page renders its heading from Supabase at runtime, and says in its
    # own front matter not to "fix" it with static markup. Only robots-blocked
    # pages are exempt, not every unadvertised one - the canonical twins below
    # are pages a visitor still lands on from Google's existing index, so they
    # keep being checked.
    findings["no_h1"] = sorted(
        p for p, d in real.items() if d["n_h1"] == 0 and not d["robots_blocked"])
    findings["multiple_h1"] = sorted(p for p, d in real.items() if d["n_h1"] > 1)

    findings["title_too_long"] = sorted(
        {"file": p, "len": len(d["title"]), "title": d["title"]}.__repr__()
        for p, d in real.items() if d["title"] and len(d["title"]) > 70)

    # Length was untracked, and 268 descriptions had grown to a median of 210
    # characters and a maximum of 259 - the tail of each one cut off in the
    # result and wasted. truncated_description does not catch this: it only
    # matches text that literally ends in "...", which none of them did.
    findings["description_too_long"] = sorted(
        {"file": p, "len": len(d["desc"]), "desc": d["desc"]}.__repr__()
        for p, d in real.items() if d["desc"] and len(d["desc"]) > 160)

    # The same sentence is written three times per page. They drifted apart on
    # 182 pages, always the same way - a bare & in one and &amp; in the others -
    # and on three the social copies held a paragraph of body prose cut off
    # mid-word. Whatever the meta says, the other two have to say.
    findings["social_description_drift"] = sorted(
        p for p, d in real.items()
        if d["desc_raw"] and ((d["og_desc"] is not None and d["og_desc"] != d["desc_raw"])
                              or (d["tw_desc"] is not None and d["tw_desc"] != d["desc_raw"])))

    # canonical must resolve to something the site actually serves
    all_urls = set(served) | {r.rstrip("/") or "/" for d in pages.values() for r in d["redirects"]}
    bad_canon = []
    for p, d in real.items():
        if not d["canonical"]:
            continue
        key = html.unescape(re.sub(r"^https?://[^/]+", "", d["canonical"])).rstrip("/") or "/"
        if key not in all_urls:
            bad_canon.append({"file": p, "canonical": d["canonical"]})
    findings["canonical_to_nowhere"] = bad_canon

    # canonical loops: A -> B and B -> A
    canon_of = {}
    for p, d in real.items():
        if d["permalink"] and d["canonical"]:
            canon_of[d["permalink"].rstrip("/") or "/"] = (
                html.unescape(re.sub(r"^https?://[^/]+", "", d["canonical"])).rstrip("/") or "/")
    loops = []
    for a, b in canon_of.items():
        if a != b and canon_of.get(b) == a:
            loops.append(sorted([a, b]))
    findings["canonical_loops"] = [list(x) for x in {tuple(l) for l in loops}]

    findings["img_missing_alt"] = sorted(
        p for p, d in real.items()
        if any(not re.search(r"\balt\s*=", t, re.I) for t in d["imgs"]))

    # Alt text that describes nothing. "Flat Banner Image" was on 31 pages.
    GENERIC_ALT = re.compile(r"^\s*(image|photo|picture|banner|img|flat banner|logo)\b", re.I)
    generic, dupe_alt = [], []
    for p, d in real.items():
        alts = []
        for t in d["imgs"]:
            m = re.search(r'alt="([^"]*)"', t)
            if not m:
                continue
            a = m.group(1).strip()
            if a and GENERIC_ALT.match(a):
                generic.append({"file": p, "alt": a[:60]})
            if a:
                alts.append(a)
        # the same alt repeated across different images on one page tells a
        # screen reader and a crawler nothing about either
        for a, n in collections.Counter(alts).items():
            if n > 2:
                dupe_alt.append({"file": p, "alt": a[:50], "count": n})
    findings["generic_alt"] = generic
    findings["duplicate_alt_on_page"] = dupe_alt

    # Unbalanced anchors. pure-nickel-strips.html had five <a> opened inside an
    # <h2> and never closed, which browsers paper over but parsers do not.
    findings["unclosed_anchors"] = sorted(
        {"file": p, "open": len(re.findall(r"<a[\s>]", d["raw"], re.I)),
         "close": d["raw"].lower().count("</a>")}.__repr__()
        for p, d in real.items()
        if len(re.findall(r"<a[\s>]", d["raw"], re.I)) != d["raw"].lower().count("</a>"))

    # image alt naming a different alloy/grade than the page's own H1
    mismatch = []
    for p, d in real.items():
        m = re.search(r'<div class="flat-banner".*?</div>', d["raw"], re.S)
        if not m:
            continue
        a = re.search(r'alt="([^"]*)"', m.group(0))
        h = re.search(r"<h1[^>]*>(.*?)</h1>", m.group(0), re.S)
        if not (a and h):
            continue
        h1 = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", h.group(1))).strip()
        ga = set(re.findall(r"\b\d{3,4}[A-Z]?\b|\bGrade \d+\b", a.group(1)))
        gh = set(re.findall(r"\b\d{3,4}[A-Z]?\b|\bGrade \d+\b", h1))
        if ga and gh and not (ga & gh):
            mismatch.append({"file": p, "alt": a.group(1)[:60], "h1": h1[:60]})
    findings["alt_alloy_mismatch"] = mismatch

    # orphans: nothing links to them
    shared = ""
    for inc in ("_includes/header.html", "_includes/footer.html"):
        fp = os.path.join(ROOT, inc)
        if os.path.exists(fp):
            shared += open(fp, encoding="utf-8", errors="replace").read()
    linked = set()
    for h_ in re.findall(r'href\s*=\s*["\']([^"\']+)["\']', shared, re.I):
        h_ = h_.split("#")[0].split("?")[0]
        if h_.startswith("/"):
            linked.add(h_.rstrip("/") or "/")
    for p, d in pages.items():
        body = re.sub(r"\{%\s*include\s+\S+\s*%\}", "", d["raw"])
        for h_ in re.findall(r'href\s*=\s*["\']([^"\']+)["\']', body, re.I):
            h_ = h_.split("#")[0].split("?")[0].strip()
            if h_.startswith("http"):
                mm = re.match(r"https?://(?:www\.)?nickelsheets\.com(/[^\s]*)", h_)
                if not mm:
                    continue
                h_ = mm.group(1).split("#")[0]
            if not h_.startswith("/"):
                continue
            key = h_.rstrip("/") or "/"
            if key in served and p not in served[key]:
                linked.add(key)
    # A URL the site deliberately withholds is not an orphan. Ten sat here for
    # months: nine legacy flat permalinks that carry sitemap: false and a
    # canonical pointing at the modern URL, plus the blocked template route.
    # Neither ending the report wanted is right for them - linking one would
    # send internal links to a page that disclaims itself, and retiring one
    # would 404 a URL Google still has indexed. They are the consolidation
    # working, so the check should not call them defects.
    #
    # They were absorbed by the baseline instead, which counts rather than
    # names: retiring one twin while gaining a genuine orphan left the total at
    # ten and the regression silent. Excluding them lets the baseline sit at 0,
    # where any orphan at all fails.
    unadvertised = {(d["permalink"].rstrip("/") or "/")
                    for d in pages.values()
                    if d["permalink"] and (d["sitemap_false"] or d["robots_blocked"])}
    findings["orphan_pages"] = sorted(
        u for u, files in served.items()
        if u not in linked and u not in unadvertised
        and not any(f in FRAGMENTS for f in files))

    # links pointing at a URL nothing serves
    broken = collections.Counter()
    for p, d in pages.items():
        for h_ in re.findall(r'href\s*=\s*["\']([^"\']+)["\']', d["raw"], re.I):
            h_ = html.unescape(h_.split("#")[0].split("?")[0].strip())
            if not h_.startswith("/") or h_.startswith("//"):
                continue
            if re.search(r"\.(png|jpe?g|webp|svg|css|js|pdf|mp4|xml|ico)$", h_, re.I):
                continue
            key = h_.rstrip("/") or "/"
            if key not in all_urls:
                broken[h_] += 1
    findings["broken_internal_links"] = [
        {"url": u, "count": n} for u, n in broken.most_common()]

    return findings



# --------------------------------------------------------------------------
# Live checks. Off by default so the file-based audit stays fast and offline;
# the scheduled run passes --live.
#
# The apex is here because it is the only failure that stops a visitor before
# they reach any page, and nothing else watches it. It has broken twice: once
# when a Vercel A record held the domain with no certificate for it, and again
# when that record came back after being removed.
# --------------------------------------------------------------------------
GITHUB_PAGES_IPS = {"185.199.108.153", "185.199.109.153",
                    "185.199.110.153", "185.199.111.153"}


def live_checks(site="nickelsheets.com"):
    import socket, ssl, urllib.request, urllib.error
    out = {}

    # every A record the apex resolves to
    try:
        ips = {ai[4][0] for ai in socket.getaddrinfo(site, 80, socket.AF_INET)}
    except OSError as e:
        ips = set()
        out["apex_dns_error"] = [str(e)]
    foreign = sorted(ips - GITHUB_PAGES_IPS)
    missing = sorted(GITHUB_PAGES_IPS - ips)
    out["apex_foreign_a_records"] = [{"ip": i} for i in foreign]
    out["apex_missing_a_records"] = [{"ip": i} for i in missing]

    # the certificate presented on the apex must name the apex
    def cert_names(host):
        # verify_mode has to be CERT_REQUIRED. Under CERT_NONE, Python never
        # parses the peer certificate and getpeercert() returns {}, so this
        # fell through to the DER branch and answered "<opaque>" for every
        # host. "<opaque>" matches no hostname, so the check reported a wrong
        # certificate unconditionally - including against the live apex, whose
        # SAN does list nickelsheets.com. It failed every pull request that
        # ran it, for a fault that was never there.
        #
        # check_hostname stays off on purpose: a certificate that genuinely
        # does not name the apex must still finish the handshake so its real
        # names can be reported, rather than raising and hiding them.
        try:
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_REQUIRED
            with socket.create_connection((host, 443), timeout=15) as sock:
                with ctx.wrap_socket(sock, server_hostname=host) as ss:
                    c = ss.getpeercert() or {}
                    return [v for k, v in c.get("subjectAltName", ()) if k == "DNS"]
        except Exception as e:
            return ["<error: %s>" % e]

    names = cert_names(site)
    ok = any(n == site or (n.startswith("*.") and site.endswith(n[1:])) for n in names)
    out["apex_cert_wrong_host"] = [] if ok else [{"host": site, "cert_names": names[:4]}]

    # the apex must redirect to the canonical www host
    def head(url):
        req = urllib.request.Request(url, method="HEAD")
        try:
            class NoRedirect(urllib.request.HTTPRedirectHandler):
                def redirect_request(self, *a, **k):
                    return None
            op = urllib.request.build_opener(NoRedirect)
            r = op.open(req, timeout=15)
            return r.status, r.headers.get("Location")
        except urllib.error.HTTPError as e:
            return e.code, e.headers.get("Location")
        except Exception as e:
            return 0, str(e)

    code, loc = head("https://%s/" % site)
    out["apex_https_not_redirecting"] = ([] if code in (301, 308) and loc and "www." in loc
                                         else [{"status": code, "location": loc}])
    code, _ = head("https://www.%s/" % site)
    out["www_not_200"] = [] if code == 200 else [{"status": code}]
    return out


def main():
    pages = collect()
    f = audit(pages)
    if "--live" in sys.argv:
        f.update(live_checks())
    counts = {k: len(v) for k, v in f.items()}

    if "--json" in sys.argv:
        print(json.dumps({"counts": counts, "findings": f}, indent=1))
        return 0

    base = {}
    if os.path.exists(BASELINE):
        base = json.load(open(BASELINE, encoding="utf-8")).get("counts", {})

    if "--update-baseline" in sys.argv:
        json.dump({"counts": counts}, open(BASELINE, "w", encoding="utf-8"), indent=1)
        print("baseline written:", BASELINE)
        return 0

    print(f"SEO audit - {len(pages)} files\n")
    worse = []
    for k, n in counts.items():
        b = base.get(k)
        if b is None:
            flag = ""
        elif n > b:
            flag = f"  <-- WORSE (was {b})"
            worse.append(k)
        elif n < b:
            flag = f"  improved (was {b})"
        else:
            flag = ""
        print(f"  {n:>5}  {k}{flag}")

    for k in worse:
        print(f"\n--- new in {k} ---")
        for item in f[k][:10]:
            print("   ", item)

    if worse and "--fail-on-new" in sys.argv:
        print("\nFAIL: regressions in", ", ".join(worse))
        return 1
    print("\nOK" if not worse else "\nregressions found")
    return 0


if __name__ == "__main__":
    sys.exit(main())
