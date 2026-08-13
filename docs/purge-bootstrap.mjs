// Regenerates CSS/bootstrap.min.css as a subset containing only the Bootstrap
// rules this site actually uses.
//
// Run it after a `bundle exec jekyll build`, because it reads the BUILT site to
// decide what is in use:
//
//     npm install purgecss@7
//     node docs/purge-bootstrap.mjs
//
// Re-run it whenever you start using a Bootstrap component the site did not use
// before (a modal, toast, offcanvas, nav-tabs...). Until you do, that component
// renders unstyled: the rules for it are not in the file.
//
// This script is excluded from the published site in _config.yml.
import { PurgeCSS } from 'purgecss';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STOCK = 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css';
const TARGET = path.join(ROOT, 'CSS/bootstrap.min.css');

if (!fs.existsSync(path.join(ROOT, '_site'))) {
  console.error('No _site/ found. Run `bundle exec jekyll build` first.');
  process.exit(1);
}

// Always purge from pristine upstream, never from the already-purged file --
// purging a subset again would compound and silently strip more each run.
const stock = await (await fetch(STOCK)).text();
const tmp = path.join(ROOT, 'CSS/.bootstrap.stock.css');
fs.writeFileSync(tmp, stock);

const res = await new PurgeCSS().purge({
  // The JS is scanned too: floating-form.js and the product page runtime build
  // markup at runtime, so classes living only inside a JS string still count.
  content: [`${ROOT}/_site/**/*.html`, `${ROOT}/javascript/**/*.js`],
  css: [tmp],
  safelist: {
    // Bootstrap's own JS adds and removes these; they never appear in the
    // served HTML, so PurgeCSS cannot see them.
    standard: [
      'show', 'showing', 'hiding', 'collapse', 'collapsing', 'collapsed',
      'fade', 'active', 'disabled', 'modal-open', 'modal-backdrop', 'modal-static',
      'offcanvas-backdrop', 'dropup', 'dropend', 'dropstart',
      'carousel-item-start', 'carousel-item-end', 'carousel-item-next', 'carousel-item-prev',
    ],
    deep: [
      /^carousel/, /^dropdown/, /^collapse/, /^accordion/, /^navbar/, /^modal/,
      /^offcanvas/, /^tooltip/, /^popover/, /^bs-/,
    ],
    variables: true,
    keyframes: true,
  },
});
fs.unlinkSync(tmp);

const banner = `/*! SUBSET BUILD - not stock Bootstrap.
 * Bootstrap 5.3.3 with the rules this site never uses removed by PurgeCSS.
 *
 * Consequence: a Bootstrap class that is not already used somewhere on the
 * site will have NO styling here even though it is valid Bootstrap. If you
 * add markup using a new component (modal, toast, nav-tabs, offcanvas...),
 * regenerate this file or it will silently render unstyled.
 *
 * Regenerate:  node docs/purge-bootstrap.mjs   (after a jekyll build)
 */
`;
const out = res[0].css.replace(/^@charset "UTF-8";/, '@charset "UTF-8";\n' + banner);
fs.writeFileSync(TARGET, out);

const kb = n => (n / 1024).toFixed(1) + ' KB';
console.log(`${kb(stock.length)} -> ${kb(out.length)}  (${((1 - out.length / stock.length) * 100).toFixed(1)}% removed)`);
