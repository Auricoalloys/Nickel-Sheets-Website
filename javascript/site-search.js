// Header site search.
//
// The catalogue is ~750 pages deep and the only way through it was the
// Materials dropdown, which needs you to already know which family a grade sits
// under. This filters a static index built by docs/build-search-index.mjs.
//
// The index is ~200 KB of JSON, so it is fetched on the first real interaction
// rather than at page load: a visitor who never searches never downloads it, and
// one who does pays once because the browser caches it for the rest of the
// session.
//
// Loaded from the shared footer include, like floating-form.js, because the
// header is injected with innerHTML on the runtime product route and scripts
// inside injected markup never execute.
const INDEX_URL = '/search-index.json';
const MAX_RESULTS = 8;

const input = document.getElementById('site-search-input');
const list = document.getElementById('site-search-results');
const status = document.querySelector('.site-search__status');
if (input && list) init();

function init() {
  let index = null;      // null = not loaded, [] = load failed
  let loading = null;
  let active = -1;       // highlighted result, for arrow keys

  const load = () => {
    if (index || loading) return loading || Promise.resolve();
    loading = fetch(INDEX_URL)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(r.status)))
      .then(rows => { index = rows; })
      .catch(() => {
        // A search box that silently does nothing is worse than one that admits
        // it is broken and points at the sitemap.
        index = [];
        say('Search is unavailable. Browse the menu or the sitemap instead.');
      });
    return loading;
  };

  // load as soon as intent is shown, so the first keystroke has data ready
  input.addEventListener('focus', load, { once: true });
  input.addEventListener('input', () => { load().then(run); });
  input.addEventListener('keydown', onKey);
  document.addEventListener('click', e => { if (!e.target.closest('.site-search')) close(); });

  // Grades are written inconsistently across the catalogue and by the people
  // searching for them: K-500 / K500, C276 / C-276, "grade 2" / "grade-2".
  // Comparing a separator-stripped copy as well as the literal text means
  // "monel k500" finds /monel/K-500/ instead of nothing.
  const flat = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const prep = row => {
    if (!row._t) {
      row._t = row.t.toLowerCase();
      row._u = row.u.toLowerCase();
      row._k = (row.k || '').toLowerCase();
      row._d = (row.d || '').toLowerCase();
      row._ft = flat(row.t); row._fu = flat(row.u);
      row._fk = flat(row.k || ''); row._fd = flat(row.d || '');
      row._depth = row.u.split('/').filter(Boolean).length;
    }
    return row;
  };

  // Points for one term, 0 when the term appears nowhere in the record.
  function termScore(row, term) {
    const f = flat(term);
    const inT = row._t.includes(term) || (f && row._ft.includes(f));
    const inK = row._k.includes(term) || (f && row._fk.includes(f));
    const inU = row._u.includes(term) || (f && row._fu.includes(f));
    const inD = row._d.includes(term) || (f && row._fd.includes(f));
    if (!(inT || inK || inU || inD)) return 0;
    let s = 0;
    if (row._t.startsWith(term)) s += 12;
    if (inT) s += 8;
    if (inK) s += 6;          // a UNS or ASTM number is a precise, deliberate query
    if (inU) s += 3;
    if (inD) s += 1;
    return s;
  }

  function rank(terms, requireAll) {
    const out = [];
    for (const raw of index) {
      const row = prep(raw);
      let s = 0, matched = 0;
      for (const term of terms) {
        const ts = termScore(row, term);
        if (ts) { matched++; s += ts; }
        else if (requireAll) { s = 0; break; }
      }
      if (!s || !matched) continue;
      // prefer the shorter, higher-level page when scores tie
      out.push({ row: raw, s: s + matched * 5 + Math.max(0, 4 - row._depth) });
    }
    return out.sort((a, b) => b.s - a.s);
  }

  function run() {
    const q = input.value.trim().toLowerCase();
    if (q.length < 2) return close();
    if (!index || !index.length) return;
    const terms = q.split(/\s+/).filter(Boolean);
    // Every term first. Falling back to "any term" keeps an over-specific query
    // like "hastelloy c276 tube" from returning nothing at all.
    let hits = rank(terms, true);
    if (!hits.length) hits = rank(terms, false);
    render(hits.slice(0, MAX_RESULTS).map(x => x.row), q);
  }

  function render(rows, q) {
    list.innerHTML = '';
    active = -1;
    if (!rows.length) {
      list.innerHTML = `<li class="site-search__empty">No match for &ldquo;${esc(q)}&rdquo;</li>`;
      open();
      say('No results');
      return;
    }
    for (const r of rows) {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', 'false');
      li.innerHTML = `<a href="${esc(r.u)}"><span class="site-search__title">${esc(r.t)}</span>` +
        `<span class="site-search__url">${esc(r.u)}</span></a>`;
      list.appendChild(li);
    }
    open();
    say(`${rows.length} result${rows.length === 1 ? '' : 's'}`);
  }

  function onKey(e) {
    const items = [...list.querySelectorAll('li[role="option"]')];
    if (e.key === 'Escape') return close();
    if (!items.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = e.key === 'ArrowDown'
        ? (active + 1) % items.length
        : (active - 1 + items.length) % items.length;
      items.forEach((li, i) => {
        li.classList.toggle('is-active', i === active);
        li.setAttribute('aria-selected', i === active ? 'true' : 'false');
      });
      items[active].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      items[active].querySelector('a').click();
    }
  }

  const open = () => { list.hidden = false; input.setAttribute('aria-expanded', 'true'); };
  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; };
  const say = m => { if (status) status.textContent = m; };
  const esc = s => String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
