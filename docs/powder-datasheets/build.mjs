// Generates one technical data sheet per grade from data.mjs.
//
//   node docs/powder-datasheets/build.mjs
//   node docs/powder-datasheets/build.mjs --check    # report drift, write nothing
//
// Output is standalone HTML: open in a browser and print to PDF (A4, margins
// "Default", background graphics ON) to get the customer-facing document. The
// stylesheet is inlined so a sheet can be emailed or zipped and still render.
//
// Nothing in the output is hand-editable — edit data.mjs and re-run. The
// current PDFs drifted precisely because each was maintained by hand, which is
// how the CP-Ti oxygen limit ended up reading 0.015 % on one sheet and 0.15 %
// on another for the same material.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GRADES, CUTS, CUT_FOOTNOTES, PACKING, COMPANY, REVISION,
  HANDLING, SAFETY_GENERAL, SAFETY_REACTIVE, ORDER_CODES,
} from './data.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'sheets');
const CHECK = process.argv.includes('--check');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Apparent and tap density are derived from the alloy's solid density rather
// than typed per grade, so the two can never disagree with each other.
const band = (rho, [lo, hi]) => `${(rho * lo).toFixed(2)} – ${(rho * hi).toFixed(2)} g/cm³`;

const CSS = `
:root{
  --ink:#16202b; --muted:#5b6976; --line:#d4dbe2; --line-soft:#e8edf2;
  --bg:#fff; --band:#16202b; --band-ink:#fff; --accent:#b08432; --accent-soft:#fbf6ec;
  --warn:#8a4b12; --warn-bg:#fdf4e8;
}
*{box-sizing:border-box}
body{margin:0;background:#eef1f4;color:var(--ink);
  font:14px/1.55 "Segoe UI",-apple-system,Roboto,Helvetica,Arial,sans-serif;
  -webkit-print-color-adjust:exact;print-color-adjust:exact}
.sheet{max-width:210mm;margin:16px auto;background:var(--bg);padding:14mm 13mm 12mm}

/* ---- masthead ---- */
.mast{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;
  border-bottom:3px solid var(--band);padding-bottom:10px}
.mast img{height:44px;width:auto}
.mast .who{font-size:10.5px;color:var(--muted);margin-top:5px;line-height:1.45}
.mast .kind{text-align:right;flex-shrink:0}
.kind .lbl{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--accent);font-weight:700}
.kind .rev{font-size:10.5px;color:var(--muted);margin-top:3px}

h1{font-size:26px;line-height:1.15;margin:14px 0 2px;letter-spacing:-.01em}
.sub{font-size:13.5px;color:var(--muted);margin:0 0 10px}

/* ---- identity strip ---- */
.ident{display:flex;flex-wrap:wrap;gap:0;border:1px solid var(--line);
  border-radius:3px;overflow:hidden;margin-bottom:16px}
.ident div{flex:1 1 25%;min-width:110px;padding:7px 10px;border-right:1px solid var(--line-soft)}
.ident div:last-child{border-right:0}
.ident dt{font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin:0 0 2px}
.ident dd{margin:0;font-size:13px;font-weight:600}

h2{font-size:12px;letter-spacing:.13em;text-transform:uppercase;color:var(--band);
  margin:20px 0 8px;padding-bottom:4px;border-bottom:1.5px solid var(--band)}
p{margin:0 0 9px}

/* ---- tables ---- */
table{width:100%;border-collapse:collapse;font-size:12.5px;margin-bottom:6px}
th,td{text-align:left;padding:5px 8px;border-bottom:1px solid var(--line-soft)}
thead th{background:var(--band);color:var(--band-ink);font-weight:600;font-size:11px;
  letter-spacing:.05em;text-transform:uppercase;border-bottom:0}
tbody tr:nth-child(even){background:#f7f9fb}
td.sym{font-weight:700;width:64px}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
tbody tr.supp{background:var(--accent-soft)!important}
tbody tr.supp td.sym{color:var(--warn)}
caption{caption-side:bottom;text-align:left;font-size:10.5px;color:var(--muted);
  padding-top:6px;line-height:1.5}

.note{background:var(--accent-soft);border-left:3px solid var(--accent);
  padding:8px 11px;font-size:11.5px;line-height:1.55;margin:8px 0 0;border-radius:0 3px 3px 0}
.note strong{color:var(--warn)}

/* The size-cut table carries seven columns. On A4 it fits; on a phone it has to
   scroll inside its own box rather than pushing the whole page sideways. */
.tw{overflow-x:auto}
@media print{.tw{overflow-x:visible}}

/* ---- two-column blocks ---- */
.cols{display:flex;gap:22px;margin-bottom:4px}
.cols>div{flex:1}
ul{margin:0;padding-left:17px}
li{margin-bottom:4px;font-size:12.5px}

.std{font-size:12.5px;margin:0;padding:0;list-style:none}
.std li{padding:5px 0;border-bottom:1px solid var(--line-soft);display:flex;gap:10px}
.std li b{flex:0 0 148px;color:var(--band)}

/* ---- footer ---- */
.foot{margin-top:22px;padding-top:10px;border-top:2px solid var(--band);
  font-size:10.5px;color:var(--muted);line-height:1.6}
.foot .disc{background:#f7f9fb;border:1px solid var(--line);padding:9px 11px;
  border-radius:3px;margin-bottom:9px;color:var(--ink)}
.foot .contact{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}

/* ---- print ---- */
@page{size:A4;margin:12mm}
@media print{
  body{background:#fff}
  .sheet{margin:0;padding:0;max-width:none}
  h2,table,.note,.ident,.cols{break-inside:avoid;page-break-inside:avoid}
  tr{break-inside:avoid;page-break-inside:avoid}
  thead{display:table-header-group}
  .foot{break-inside:avoid;page-break-inside:avoid}
  h2{break-after:avoid;page-break-after:avoid}
}
@media(max-width:640px){
  .cols{flex-direction:column;gap:0}
  .sheet{padding:10mm 6mm}
  .ident div{flex:1 1 50%}
}`;

function chemistryTable(g) {
  const heads = g.chemistry.columnHeads;
  const row = (r, cls = '') =>
    `<tr${cls}><td class="sym">${esc(r.el)}</td><td>${esc(r.name)}</td>` +
    r.values.map((v) => `<td class="num">${esc(v)}</td>`).join('') + '</tr>';

  const supp = (g.chemistry.supplementary || []).map((r) => {
    // Pad a supplementary row out to the full column count so the grid holds
    // when a grade quotes two limit columns (Ti64 Grade 5 vs Grade 23).
    const v = [...r.values];
    while (v.length < heads.length) v.push('—');
    return row({ ...r, values: v }, ' class="supp"');
  }).join('');

  return `<table>
<thead><tr><th colspan="2">Element</th>${heads.map((h) => `<th class="num">${esc(h)}</th>`).join('')}</tr></thead>
<tbody>${g.chemistry.rows.map((r) => row(r)).join('')}${supp}</tbody>
<caption>Specified against ${esc(g.chemistry.basis)}. Chemical analysis by ICP-OES; carbon and sulphur by combustion (ASTM E1019); oxygen, nitrogen and hydrogen by inert gas fusion (ASTM E1409 / E1447).${
    supp ? ' Shaded rows are supplementary values reported per lot, not limits imposed by the grade standard.' : ''
  }</caption>
</table>${g.chemistry.note ? `<p class="note">${esc(g.chemistry.note)}</p>` : ''}`;
}

function cutsTable(g) {
  const code = ORDER_CODES[g.slug];
  return `<div class="tw"><table>
<thead><tr>
  <th>Particle size cut</th><th>Order code</th>
  <th class="num">D10 µm</th><th class="num">D50 µm</th><th class="num">D90 µm</th>
  <th class="num">Hall flow</th><th>Suitable process</th>
</tr></thead>
<tbody>${CUTS.map((c) => {
    const nums = c.range.match(/\d+/g).join('-');
    return `<tr>
  <td><b>${esc(c.range)}</b></td>
  <td>AAL-${esc(code)}-${nums}</td>
  <td class="num">${esc(c.d10)}</td><td class="num">${esc(c.d50)}</td><td class="num">${esc(c.d90)}</td>
  <td class="num">${esc(c.flow)}</td>
  <td>${esc(c.processes)}</td>
</tr>`;
  }).join('')}</tbody>
<caption>${CUT_FOOTNOTES.map(esc).join('<br>')}</caption>
</table></div>`;
}

function page(g) {
  const reactive = !!g.reactive;
  const safety = reactive ? [...SAFETY_REACTIVE, ...SAFETY_GENERAL] : SAFETY_GENERAL;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(g.name)} Powder — Technical Data Sheet | ${esc(COMPANY.name)}</title>
<meta name="description" content="${esc(g.name)} metal powder for additive manufacturing, specified to ${esc(g.chemistry.basis)}. Available 5–25, 15–53, 45–105, 45–150 and 53–150 µm.">
<style>${CSS}</style>
</head>
<body>
<article class="sheet">

  <header class="mast">
    <div>
      <img src="../../aurico-logo1.svg" alt="${esc(COMPANY.name)}">
      <div class="who">${esc(COMPANY.address)}<br>
        ${COMPANY.phones.map(esc).join(' &nbsp;·&nbsp; ')} &nbsp;·&nbsp; ${esc(COMPANY.emails[1])}</div>
    </div>
    <div class="kind">
      <div class="lbl">Technical Data Sheet</div>
      <div class="rev">Revision ${esc(REVISION.rev)} &nbsp;·&nbsp; ${esc(REVISION.date)}</div>
    </div>
  </header>

  <h1>${esc(g.name)} Powder</h1>
  <p class="sub">${esc(g.subtitle)}</p>

  <dl class="ident">
    <div><dt>Alloy family</dt><dd>${esc(g.family)}</dd></div>
    <div><dt>UNS</dt><dd>${g.uns ? esc(g.uns) : '—'}</dd></div>
    <div><dt>Also known as</dt><dd>${esc(g.aka.slice(1).join(', ') || g.aka[0])}</dd></div>
    <div><dt>Morphology</dt><dd>Spherical, gas / plasma atomised</dd></div>
  </dl>

  <h2>Material description</h2>
  <p>${esc(g.intro)}</p>

  <h2>Chemical composition</h2>
  ${chemistryTable(g)}

  <h2>Specifications</h2>
  <ul class="std">
    ${g.standards.map((s) => `<li><b>${esc(s.id)}</b><span>${esc(s.title)}</span></li>`).join('\n    ')}
  </ul>

  <h2>Particle size cuts available</h2>
  ${cutsTable(g)}

  <h2>Physical properties</h2>
  <table>
    <tbody>
      <tr><td>Solid (theoretical) density</td><td class="num">${g.physical.density.toFixed(2)} g/cm³</td></tr>
      <tr><td>Apparent density, typical</td><td class="num">${band(g.physical.density, PACKING.apparent)}</td></tr>
      <tr><td>Tap density, typical</td><td class="num">${band(g.physical.density, PACKING.tap)}</td></tr>
      <tr><td>Melting range</td><td class="num">${esc(g.physical.melting)}</td></tr>
      <tr><td>Magnetic response</td><td class="num">${esc(g.physical.magnetic)}</td></tr>
    </tbody>
    <caption>Apparent and tap density are quoted as the typical band for spherical atomised powder of this alloy — ${
      Math.round(PACKING.apparent[0] * 100)}–${Math.round(PACKING.apparent[1] * 100)} % and ${
      Math.round(PACKING.tap[0] * 100)}–${Math.round(PACKING.tap[1] * 100)} % of solid density respectively. Finer cuts sit toward the lower end. The measured value for the lot supplied is stated on its Certificate of Analysis.</caption>
  </table>

  <h2>Typical mechanical properties</h2>
  <table>
    <thead><tr><th>Property</th><th class="num">Typical value</th></tr></thead>
    <tbody>${g.mechanical.rows.map((r) => `
      <tr><td>${r.p}</td><td class="num">${esc(r.v)}</td></tr>`).join('')}
    </tbody>
    <caption>Condition: ${esc(g.mechanical.condition)}.${g.mechanical.note ? ' ' + esc(g.mechanical.note) : ''}
      <strong>These are indicative values for material built from this powder, not properties of the powder itself.</strong>
      Achieved properties depend on the machine, parameter set, build orientation and post-processing, and must be
      established by the part producer for their own process. They are not a warranted characteristic of the powder supplied.</caption>
  </table>

  <div class="cols">
    <div>
      <h2>Key advantages</h2>
      <ul>${g.advantages.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
    </div>
    <div>
      <h2>Typical applications</h2>
      <ul>${g.applications.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
    </div>
  </div>

  <div class="cols">
    <div>
      <h2>Packaging</h2>
      <ul>${HANDLING.packaging.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
    </div>
    <div>
      <h2>Storage and handling</h2>
      <ul>${HANDLING.storage.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
    </div>
  </div>

  <h2>Safety</h2>
  <ul>${safety.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>

  <footer class="foot">
    <div class="disc"><strong>Typical values, not a guarantee for any specific lot.</strong>
      The figures on this data sheet describe the grade as specified against the standards named above.
      They are not measurements of the material you will receive. A Certificate of Analysis carrying the
      actual measured chemistry and particle size distribution, traceable to a lot number, is issued with
      every shipment. Where a figure on that certificate conflicts with this data sheet, the certificate governs.</div>
    <div class="contact">
      <span><strong>${esc(COMPANY.name)}</strong> &nbsp;·&nbsp; ${esc(COMPANY.address)}</span>
      <span>${COMPANY.phones.map(esc).join(' · ')} &nbsp;·&nbsp; ${esc(COMPANY.emails[1])} &nbsp;·&nbsp; ${esc(COMPANY.web)}</span>
    </div>
    <div style="margin-top:6px">Data sheet ${esc(g.slug)} · Revision ${esc(REVISION.rev)} · Issued ${esc(REVISION.date)} ·
      Supersedes all previous issues. Aurico Alloys LLP reserves the right to revise this specification without notice.</div>
  </footer>

</article>
</body>
</html>
`;
}

// ---------------------------------------------------------------- write
if (!CHECK) mkdirSync(OUT, { recursive: true });

let drift = 0;
for (const g of GRADES) {
  if (!ORDER_CODES[g.slug]) {
    console.error(`  MISSING order code for "${g.slug}" — add it to ORDER_CODES in data.mjs`);
    process.exit(1);
  }
  const file = join(OUT, `${g.slug}.html`);
  const html = page(g);
  const old = existsSync(file) ? readFileSync(file, 'utf8') : null;

  if (old === html) continue;
  drift++;
  if (CHECK) console.log(`  drift: ${g.slug}.html`);
  else writeFileSync(file, html, 'utf8');
}

if (CHECK) {
  console.log(drift ? `\n${drift} sheet(s) out of date. Run without --check to regenerate.` : 'All sheets current.');
  process.exit(drift ? 1 : 0);
}
console.log(`Wrote ${drift} of ${GRADES.length} sheet(s) to docs/powder-datasheets/sheets/`);
