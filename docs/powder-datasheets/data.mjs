// Source of truth for every powder technical data sheet.
//
// A data sheet states what the GRADE is specified to be, per a citable standard.
// It never states what one lot measured — that is the Certificate of Analysis,
// issued per shipment. Keeping the two apart is the whole point of this file:
// the existing PDFs were lot reports titled "Data Sheet", and because each was
// hand-edited the CP-Ti 15-53 plasma-atomised sheet and the CP-Ti 45-105
// gas-atomised sheet ended up carrying byte-identical chemistry. Two lots from
// two atomisation routes cannot return the same six figures. That is what
// copy-paste does, and it is why nothing here is written twice.
//
// Chemistry values are strings, not numbers, so a cell can honestly say
// "balance", "≤ 0.10" or "5.50–6.50" without a formatting layer guessing
// what was meant.

export const COMPANY = {
  name: 'Aurico Alloys LLP',
  address: '112, Aman Grih, 1st Carpenter Street, C.P. Tank Road, Mumbai 400 004, India',
  phones: ['+91 80976 53930', '+91 79778 86611'],
  emails: ['sales.aurico@gmail.com', 'info@auricoalloys.com'],
  web: 'www.auricoalloys.com',
};

// Revision stamps every sheet. Bump REV when the specification content changes;
// the date is what a reader checks the sheet's age against.
export const REVISION = { rev: '1.1', date: '2026-08-21' };

// A particle size cut is a classification result, so the distribution it yields
// is close to grade-independent — a 15-53 um cut of In625 and of SS316L land
// within a micron or two of each other. That is why the distributions live here,
// keyed by cut, and are written once.
//
// WHICH cuts a grade is offered in is a different question entirely, and it is
// not uniform: availability varies by grade and by what the mills actually run.
// So each grade names its own list in `cuts` below, and DEFAULT_CUTS is only the
// starting point for a grade that has not been set yet.
//
// The typical ranges were checked against the four lots where real measured data
// exists (SS316L 15-53, CP-Ti 45-105, Ti64 20-53, SS316L 50-150); each falls
// inside the band quoted.
export const CUT_SPECS = {
  '5–25': {
    d10: '6–9', d50: '12–16', d90: '22–26', flow: 'Carney funnel†',
    processes: 'Metal Injection Moulding (MIM), Binder Jetting',
  },
  // Not a general-purpose cut. Some L-PBF machine manuals call for 10–30 µm to
  // get their best result on particular grades — dental CoCrMo is one — which is
  // why this is marked on a single grade rather than offered across the file.
  //
  // The distribution below is interpolated between 5–25 and 15–45, not measured:
  // it is the one row here with no lot data behind it. Replace it the first time
  // a 10–30 run is classified. Footnote 2 already tells the reader these are
  // typical and that the lot's real distribution is on its CoA.
  '10–30': {
    d10: '11–14', d50: '17–22', d90: '27–32', flow: 'Carney funnel†',
    processes: 'Laser Powder Bed Fusion — fine-layer dental and fine-feature work',
  },
  '15–45': {
    d10: '16–21', d50: '26–33', d90: '40–46', flow: '14–17 s / 50 g',
    processes: 'Laser Powder Bed Fusion (L-PBF / SLM / DMLS)',
  },
  '15–53': {
    d10: '16–22', d50: '28–36', d90: '46–54', flow: '14–18 s / 50 g',
    processes: 'Laser Powder Bed Fusion (L-PBF / SLM / DMLS)',
  },
  '20–63': {
    d10: '22–28', d50: '34–42', d90: '55–64', flow: '15–19 s / 50 g',
    processes: 'Laser Powder Bed Fusion, Electron Beam Melting (EBM)',
  },
  '45–105': {
    d10: '47–55', d50: '68–78', d90: '100–110', flow: '20–26 s / 50 g',
    processes: 'Electron Beam Melting (EBM), Directed Energy Deposition (DED)',
  },
  '53–105': {
    d10: '55–62', d50: '72–82', d90: '100–110', flow: '20–26 s / 50 g',
    processes: 'Electron Beam Melting (EBM), Directed Energy Deposition (DED)',
  },
  '45–150': {
    d10: '48–60', d50: '80–95', d90: '140–150', flow: '22–28 s / 50 g',
    processes: 'DED, Laser Cladding, Hot Isostatic Pressing (HIP)',
  },
  '53–150': {
    d10: '58–66', d50: '88–98', d90: '140–150', flow: '22–28 s / 50 g',
    processes: 'DED, Thermal Spray, Hot Isostatic Pressing (HIP)',
  },
};

// The five the flyer lists, which is the claim already being made to customers.
// The brochure lists eight — it adds 15-45, 20-63 and 53-105 — but the two
// documents disagree and neither matches what is actually stocked per grade.
//
// Defaulting to the smaller list is deliberate: listing a cut that turns out not
// to exist costs more than omitting one that does, and the footnote already says
// other cuts can be classified to order. The other three are defined in
// CUT_SPECS above and only need naming in a grade's `cuts` to appear.
export const DEFAULT_CUTS = ['5–25', '15–53', '45–105', '45–150', '53–150'];

export const CUT_FOOTNOTES = [
  'Cuts listed are those normally supplied in this grade. Availability varies by grade and by mill run — confirm the cut required at enquiry, and other cuts can be classified to order.',
  'Particle size distribution determined by laser diffraction per ASTM B822. Values are typical for the stated cut and are indicative only — the measured distribution for the lot supplied is stated on its Certificate of Analysis.',
  '† Cuts finer than approximately 15 µm do not reliably flow through the 2.5 mm orifice of a Hall funnel (ASTM B213); a Carney funnel (ASTM B964) is used instead and the two results are not comparable.',
  'Apparent density per ASTM B212, tap density per ASTM B527. Both fall with decreasing particle size, so the finer cuts of a grade sit toward the lower end of the quoted band.',
];

// Apparent and tap density scale with the alloy's solid density, so they are
// derived rather than typed per grade — one less place for a transcription
// error. The percentage bands cover every real measurement on file.
export const PACKING = { apparent: [0.50, 0.60], tap: [0.58, 0.68] };

export const HANDLING = {
  packaging: [
    'Standard: 5 kg and 10 kg vacuum-sealed aluminium-foil pouches, argon back-filled, inside a sealed HDPE pail.',
    'Bulk: 25 kg and 50 kg steel drums under argon. Other quantities to order.',
    'Every package carries the grade, particle size cut, lot number and net weight, and is traceable to its Certificate of Analysis.',
  ],
  storage: [
    'Store sealed in a dry, well-ventilated area below 30 °C, away from oxidisers, acids and ignition sources.',
    'Do not open until required. Once opened, purge with argon and reseal; repeated exposure to humid air raises oxygen and degrades flow.',
    'Powder recovered from a build should be sieved and its oxygen content re-checked before reuse.',
  ],
};

export const SAFETY_GENERAL = [
  'Fine metallic powder. Avoid creating dust clouds. Use local exhaust ventilation, and wear a certified respirator, safety glasses and gloves when handling.',
  'Ground all equipment and containers to prevent electrostatic discharge.',
  'Consult the Safety Data Sheet before use.',
];

// Titanium and aluminium powders are combustible in ways the steels are not,
// and the extinguishing media differ. Stating this per family rather than
// generically is the difference between a useful warning and boilerplate.
export const SAFETY_REACTIVE = [
  'This powder is combustible and, when finely divided and dispersed in air, capable of forming an explosive atmosphere. Handle under inert atmosphere where practical.',
  'Do not use water, carbon dioxide, foam or halogenated agents on a metal powder fire — they react with the burning metal. Use a Class D extinguishing agent or dry sand.',
  'Wet or damp powder can evolve hydrogen. Keep away from moisture.',
];

const cite = (id, title) => ({ id, title });

export const GRADES = [
  // ------------------------------------------------------------------ steels
  {
    slug: 'ss316l',
    name: 'Stainless Steel 316L',
    subtitle: 'Austenitic Chromium–Nickel–Molybdenum Stainless Steel Powder',
    family: 'Stainless steel',
    aka: ['SS316L', '1.4404', 'X2CrNiMo17-12-2'],
    uns: 'S31603',
    standards: [
      cite('ASTM F3184', 'Additive Manufacturing Stainless Steel Alloy (UNS S31603) with Powder Bed Fusion'),
      cite('ASTM A276 / A240', 'Wrought chemistry reference, UNS S31603'),
      cite('AMS 5910', 'Corrosion-resistant steel powder, 16Cr–12Ni–2.1Mo'),
    ],
    intro:
      'The most widely used austenitic stainless steel in additive manufacturing. The low carbon ceiling suppresses chromium-carbide precipitation at grain boundaries during solidification, so the alloy resists intergranular corrosion in the as-built condition without a solution anneal. Molybdenum extends pitting and crevice resistance into chloride-bearing service.',
    advantages: [
      'Excellent general and chloride pitting corrosion resistance',
      'Low carbon content resists sensitisation — no post-build anneal required for corrosion service',
      'High ductility and toughness, retained down to cryogenic temperature',
      'Readily weldable, machinable and electropolished',
      'Non-magnetic in the annealed condition',
    ],
    applications: [
      'Chemical and petrochemical process equipment',
      'Marine and offshore hardware',
      'Food, dairy and pharmaceutical contact parts',
      'Heat exchangers and conformally cooled tooling',
      'Surgical instruments and non-implant medical devices',
    ],
    chemistry: {
      basis: 'ASTM F3184 / UNS S31603',
      columnHeads: ['Composition, wt %'],
      rows: [
        { el: 'Cr', name: 'Chromium', values: ['16.00–18.00'] },
        { el: 'Ni', name: 'Nickel', values: ['10.00–14.00'] },
        { el: 'Mo', name: 'Molybdenum', values: ['2.00–3.00'] },
        { el: 'Mn', name: 'Manganese', values: ['≤ 2.00'] },
        { el: 'Si', name: 'Silicon', values: ['≤ 0.75'] },
        { el: 'N', name: 'Nitrogen', values: ['≤ 0.10'] },
        { el: 'P', name: 'Phosphorus', values: ['≤ 0.045'] },
        { el: 'C', name: 'Carbon', values: ['≤ 0.030'] },
        { el: 'S', name: 'Sulphur', values: ['≤ 0.030'] },
        { el: 'Fe', name: 'Iron', values: ['Balance'] },
      ],
      supplementary: [
        { el: 'O', name: 'Oxygen', values: ['≤ 0.10 typical'] },
      ],
      note: 'Oxygen is not limited by ASTM F3184 but is reported on every Certificate of Analysis, since it governs powder reusability and as-built ductility. A tighter oxygen ceiling can be agreed at order.',
    },
    physical: { density: 7.99, melting: '1 375–1 400 °C', magnetic: 'Non-magnetic (austenitic)' },
    mechanical: {
      condition: 'as-built L-PBF, > 99.5 % dense, tested per ISO 6892-1',
      rows: [
        { p: 'Ultimate tensile strength', v: '540–650 MPa' },
        { p: 'Yield strength (R<sub>p0.2</sub>)', v: '450–530 MPa' },
        { p: 'Elongation at break', v: '30–50 %' },
        { p: 'Hardness', v: '170–220 HV5' },
        { p: 'Modulus of elasticity', v: '180–200 GPa' },
      ],
    },
  },
  {
    slug: 'ss304l',
    name: 'Stainless Steel 304L',
    subtitle: 'Austenitic Chromium–Nickel Stainless Steel Powder',
    family: 'Stainless steel',
    aka: ['SS304L', '1.4307', 'X2CrNi18-9'],
    uns: 'S30403',
    standards: [
      cite('ASTM A276 / A240', 'Wrought chemistry reference, UNS S30403'),
      cite('AMS 5647', 'Corrosion-resistant steel, 18Cr–8Ni, low carbon'),
    ],
    intro:
      'The general-purpose austenitic stainless steel, and the economical choice wherever chloride exposure does not demand the molybdenum of 316L. The low-carbon variant resists sensitisation in welded and additively built sections.',
    advantages: [
      'Good general corrosion resistance in oxidising media',
      'Low carbon content resists weld-decay and sensitisation',
      'Excellent formability and ductility',
      'Lower cost than molybdenum-bearing grades',
    ],
    applications: [
      'General process and storage vessels',
      'Architectural and structural components',
      'Food and beverage equipment',
      'Automotive and general engineering parts',
    ],
    chemistry: {
      basis: 'ASTM A276 / UNS S30403',
      columnHeads: ['Composition, wt %'],
      rows: [
        { el: 'Cr', name: 'Chromium', values: ['18.00–20.00'] },
        { el: 'Ni', name: 'Nickel', values: ['8.00–12.00'] },
        { el: 'Mn', name: 'Manganese', values: ['≤ 2.00'] },
        { el: 'Si', name: 'Silicon', values: ['≤ 0.75'] },
        { el: 'N', name: 'Nitrogen', values: ['≤ 0.10'] },
        { el: 'P', name: 'Phosphorus', values: ['≤ 0.045'] },
        { el: 'C', name: 'Carbon', values: ['≤ 0.030'] },
        { el: 'S', name: 'Sulphur', values: ['≤ 0.030'] },
        { el: 'Fe', name: 'Iron', values: ['Balance'] },
      ],
      supplementary: [{ el: 'O', name: 'Oxygen', values: ['≤ 0.10 typical'] }],
      note: 'Oxygen is reported on the Certificate of Analysis for every lot.',
    },
    physical: { density: 7.90, melting: '1 400–1 450 °C', magnetic: 'Non-magnetic (austenitic)' },
    mechanical: {
      condition: 'as-built L-PBF, > 99.5 % dense, tested per ISO 6892-1',
      rows: [
        { p: 'Ultimate tensile strength', v: '520–640 MPa' },
        { p: 'Yield strength (R<sub>p0.2</sub>)', v: '420–520 MPa' },
        { p: 'Elongation at break', v: '35–55 %' },
        { p: 'Hardness', v: '160–210 HV5' },
        { p: 'Modulus of elasticity', v: '190–200 GPa' },
      ],
    },
  },
  {
    slug: '17-4ph',
    name: '17-4 PH Stainless Steel',
    subtitle: 'Martensitic Precipitation-Hardening Stainless Steel Powder',
    family: 'Stainless steel',
    aka: ['17-4PH', 'Type 630', '1.4542'],
    uns: 'S17400',
    standards: [
      cite('ASTM F3301', 'Additive Manufacturing — post-processing of metal PBF parts'),
      cite('ASTM A564 Type 630', 'Wrought chemistry reference, UNS S17400'),
      cite('AMS 5643', 'Corrosion-resistant steel bars and forgings, 16Cr–4Ni–4Cu'),
    ],
    intro:
      'A martensitic stainless steel that reaches high strength through a low-temperature copper precipitation treatment rather than a quench, so parts age with very little distortion. Strength and toughness are dialled in by the ageing condition — H900 for maximum hardness, H1150 for maximum toughness.',
    advantages: [
      'High strength and hardness after a single low-temperature ageing treatment',
      'Minimal dimensional change on ageing',
      'Good corrosion resistance, better than the 400-series martensitics',
      'Mechanical properties tunable across a wide range by heat-treat condition',
    ],
    applications: [
      'Aerospace structural fittings and brackets',
      'Oil and gas valve and pump components',
      'Injection-mould tooling and inserts',
      'High-strength shafts, couplings and fasteners',
    ],
    chemistry: {
      basis: 'ASTM A564 Grade 630 / UNS S17400',
      columnHeads: ['Composition, wt %'],
      rows: [
        { el: 'Cr', name: 'Chromium', values: ['15.00–17.50'] },
        { el: 'Ni', name: 'Nickel', values: ['3.00–5.00'] },
        { el: 'Cu', name: 'Copper', values: ['3.00–5.00'] },
        { el: 'Nb+Ta', name: 'Niobium + Tantalum', values: ['0.15–0.45'] },
        { el: 'Mn', name: 'Manganese', values: ['≤ 1.00'] },
        { el: 'Si', name: 'Silicon', values: ['≤ 1.00'] },
        { el: 'C', name: 'Carbon', values: ['≤ 0.07'] },
        { el: 'P', name: 'Phosphorus', values: ['≤ 0.040'] },
        { el: 'S', name: 'Sulphur', values: ['≤ 0.030'] },
        { el: 'Fe', name: 'Iron', values: ['Balance'] },
      ],
      supplementary: [
        { el: 'O', name: 'Oxygen', values: ['≤ 0.10 typical'] },
        { el: 'N', name: 'Nitrogen', values: ['≤ 0.10 typical'] },
      ],
      note: 'Nitrogen content influences the retained-austenite fraction in as-built material and is reported per lot. Nitrogen-atomised and argon-atomised powder behave differently on ageing; state which is required at order.',
    },
    physical: { density: 7.80, melting: '1 404–1 440 °C', magnetic: 'Magnetic (martensitic)' },
    mechanical: {
      condition: 'L-PBF, solution treated and aged to H900',
      rows: [
        { p: 'Ultimate tensile strength', v: '1 250–1 400 MPa' },
        { p: 'Yield strength (R<sub>p0.2</sub>)', v: '1 050–1 250 MPa' },
        { p: 'Elongation at break', v: '8–14 %' },
        { p: 'Hardness', v: '38–44 HRC' },
        { p: 'Modulus of elasticity', v: '190–200 GPa' },
      ],
    },
  },
  {
    slug: '15-5ph',
    name: '15-5 PH Stainless Steel',
    subtitle: 'Martensitic Precipitation-Hardening Stainless Steel Powder',
    family: 'Stainless steel',
    aka: ['15-5PH', 'XM-12', '1.4545'],
    uns: 'S15500',
    standards: [
      cite('ASTM F3301', 'Additive Manufacturing — post-processing of metal PBF parts'),
      cite('ASTM A564 Type XM-12', 'Wrought chemistry reference, UNS S15500'),
      cite('AMS 5659', 'Corrosion-resistant steel bars and forgings, 15Cr–5Ni–4Cu–Nb'),
    ],
    intro:
      'A ferrite-free variant of 17-4 PH, hardened by the same low-temperature copper precipitation treatment. Chromium is pulled down and nickel raised relative to 17-4 PH specifically to suppress delta ferrite, which is what costs 17-4 PH transverse toughness; the result is a steel with the same strength range but markedly better properties across the short direction. Normally double vacuum melted for that reason.',
    advantages: [
      'Essentially free of delta ferrite, so transverse toughness matches longitudinal',
      'High strength and hardness after a single low-temperature ageing treatment',
      'Minimal dimensional change on ageing',
      'Good corrosion resistance, better than the 400-series martensitics',
      'Properties tunable across a wide range by heat-treat condition',
    ],
    applications: [
      'Aerospace structural fittings and rotating components',
      'Oil and gas valve, pump and downhole components',
      'Injection-mould tooling and inserts',
      'High-strength shafts, gears and couplings',
    ],
    chemistry: {
      basis: 'ASTM A564 Type XM-12 / UNS S15500',
      columnHeads: ['Composition, wt %'],
      rows: [
        { el: 'Cr', name: 'Chromium', values: ['14.00–15.50'] },
        { el: 'Ni', name: 'Nickel', values: ['3.50–5.50'] },
        { el: 'Cu', name: 'Copper', values: ['2.50–4.50'] },
        { el: 'Nb+Ta', name: 'Niobium + Tantalum', values: ['0.15–0.45'] },
        { el: 'Mn', name: 'Manganese', values: ['≤ 1.00'] },
        { el: 'Si', name: 'Silicon', values: ['≤ 1.00'] },
        { el: 'C', name: 'Carbon', values: ['≤ 0.07'] },
        { el: 'P', name: 'Phosphorus', values: ['≤ 0.040'] },
        { el: 'S', name: 'Sulphur', values: ['≤ 0.030'] },
        { el: 'Fe', name: 'Iron', values: ['Balance'] },
      ],
      supplementary: [
        { el: 'O', name: 'Oxygen', values: ['≤ 0.10 typical'] },
        { el: 'N', name: 'Nitrogen', values: ['≤ 0.10 typical'] },
      ],
      note: 'The chromium and nickel bands are what separate this alloy from 17-4 PH — lower chromium, higher nickel, chosen to keep delta ferrite out of the structure. The two are not interchangeable on a drawing that calls one out by UNS number.',
    },
    physical: { density: 7.80, melting: '1 404–1 440 °C', magnetic: 'Magnetic (martensitic)' },
    mechanical: {
      condition: 'L-PBF, solution treated and aged to H900',
      rows: [
        { p: 'Ultimate tensile strength', v: '1 250–1 400 MPa' },
        { p: 'Yield strength (R<sub>p0.2</sub>)', v: '1 100–1 300 MPa' },
        { p: 'Elongation at break', v: '10–16 %' },
        { p: 'Hardness', v: '40–45 HRC' },
        { p: 'Modulus of elasticity', v: '190–200 GPa' },
      ],
    },
  },
  {
    slug: 'h13',
    name: 'H13 Tool Steel',
    subtitle: 'Chromium Hot-Work Tool Steel Powder',
    family: 'Tool steel',
    aka: ['AISI H13', '1.2344', 'X40CrMoV5-1', 'SKD61'],
    uns: 'T20813',
    standards: [
      cite('ASTM A681', 'Alloy tool steels, Grade H13'),
      cite('DIN EN ISO 4957', 'Tool steels, X40CrMoV5-1 (1.2344)'),
    ],
    intro:
      'The standard hot-work die steel, and the usual choice for conformally cooled tooling. Chromium, molybdenum and vanadium form stable carbides that resist softening at elevated temperature, so the alloy holds hardness through repeated thermal cycles and resists heat checking in die casting service.',
    advantages: [
      'Retains hardness at elevated service temperature',
      'Excellent resistance to thermal fatigue and heat checking',
      'Good toughness at working hardness of 45–52 HRC',
      'Suited to conformal cooling channels that cannot be drilled conventionally',
    ],
    applications: [
      'Die-casting dies and inserts',
      'Conformally cooled injection-mould tooling',
      'Hot forging and extrusion dies',
      'Wear-resistant components and repair cladding',
    ],
    chemistry: {
      basis: 'ASTM A681 Grade H13 / DIN 1.2344',
      columnHeads: ['Composition, wt %'],
      rows: [
        { el: 'Cr', name: 'Chromium', values: ['4.75–5.50'] },
        { el: 'Mo', name: 'Molybdenum', values: ['1.10–1.75'] },
        { el: 'V', name: 'Vanadium', values: ['0.80–1.20'] },
        { el: 'Si', name: 'Silicon', values: ['0.80–1.20'] },
        { el: 'C', name: 'Carbon', values: ['0.32–0.45'] },
        { el: 'Mn', name: 'Manganese', values: ['0.20–0.60'] },
        { el: 'P', name: 'Phosphorus', values: ['≤ 0.030'] },
        { el: 'S', name: 'Sulphur', values: ['≤ 0.030'] },
        { el: 'Fe', name: 'Iron', values: ['Balance'] },
      ],
      supplementary: [{ el: 'O', name: 'Oxygen', values: ['≤ 0.10 typical'] }],
      note: 'H13 is air-hardening and crack-sensitive in additive processing. A heated build plate and immediate stress relief are strongly recommended.',
    },
    physical: { density: 7.80, melting: '1 427–1 494 °C', magnetic: 'Magnetic' },
    mechanical: {
      condition: 'L-PBF, quenched and double tempered',
      rows: [
        { p: 'Ultimate tensile strength', v: '1 700–1 950 MPa' },
        { p: 'Yield strength (R<sub>p0.2</sub>)', v: '1 400–1 650 MPa' },
        { p: 'Elongation at break', v: '3–7 %' },
        { p: 'Hardness', v: '46–52 HRC' },
        { p: 'Modulus of elasticity', v: '200–215 GPa' },
      ],
    },
  },
  {
    slug: 'maraging-ms1',
    name: 'Maraging Steel MS1',
    subtitle: '18Ni-300 Maraging Tool Steel Powder',
    family: 'Tool steel',
    aka: ['MS1', '1.2709', '18Ni300', 'X3NiCoMoTi18-9-5'],
    uns: 'K93120',
    standards: [
      cite('DIN 1.2709', 'X3NiCoMoTi18-9-5 maraging tool steel'),
      cite('ASTM A538 Grade B', 'Maraging steel, 18Ni Grade 300'),
    ],
    intro:
      'An iron–nickel martensitic steel that takes its strength from intermetallic precipitation rather than carbon. It builds readily in the soft martensitic condition, machines easily at around 35 HRC, and is then aged in a single three-hour step at 490 °C to above 50 HRC with almost no distortion — which is why it dominates additively manufactured tooling.',
    advantages: [
      'Very high strength after a simple, low-temperature single-step age',
      'Negligible dimensional change on ageing — machine soft, then harden',
      'Excellent weldability and build stability, low cracking risk',
      'Readily nitrided or polished to a mirror finish for moulds',
    ],
    applications: [
      'Injection-mould inserts with conformal cooling',
      'Die-casting and extrusion tooling',
      'Aerospace and motorsport structural parts',
      'High-strength fixtures and gauges',
    ],
    chemistry: {
      basis: 'DIN 1.2709 / ASTM A538 Grade B (18Ni-300)',
      columnHeads: ['Composition, wt %'],
      rows: [
        { el: 'Ni', name: 'Nickel', values: ['17.0–19.0'] },
        { el: 'Co', name: 'Cobalt', values: ['8.5–9.5'] },
        { el: 'Mo', name: 'Molybdenum', values: ['4.5–5.2'] },
        { el: 'Ti', name: 'Titanium', values: ['0.60–0.80'] },
        { el: 'Al', name: 'Aluminium', values: ['0.05–0.15'] },
        { el: 'Cr', name: 'Chromium', values: ['≤ 0.50'] },
        { el: 'Cu', name: 'Copper', values: ['≤ 0.50'] },
        { el: 'C', name: 'Carbon', values: ['≤ 0.03'] },
        { el: 'Mn', name: 'Manganese', values: ['≤ 0.10'] },
        { el: 'Si', name: 'Silicon', values: ['≤ 0.10'] },
        { el: 'P', name: 'Phosphorus', values: ['≤ 0.01'] },
        { el: 'S', name: 'Sulphur', values: ['≤ 0.01'] },
        { el: 'Fe', name: 'Iron', values: ['Balance'] },
      ],
      supplementary: [{ el: 'O', name: 'Oxygen', values: ['≤ 0.05 typical'] }],
      note: 'Titanium and aluminium are the precipitation formers and their control is what makes the alloy ageable; both are reported to two decimals on the Certificate of Analysis.',
    },
    physical: { density: 8.00, melting: '1 413–1 443 °C', magnetic: 'Magnetic' },
    mechanical: {
      condition: 'L-PBF, aged 6 h at 490 °C',
      rows: [
        { p: 'Ultimate tensile strength', v: '1 900–2 100 MPa' },
        { p: 'Yield strength (R<sub>p0.2</sub>)', v: '1 800–2 000 MPa' },
        { p: 'Elongation at break', v: '2–6 %' },
        { p: 'Hardness', v: '50–56 HRC' },
        { p: 'Modulus of elasticity', v: '180–190 GPa' },
      ],
    },
  },
  {
    slug: 'cx',
    name: 'Stainless Steel CX',
    subtitle: 'Martensitic Precipitation-Hardening Corrosion-Resistant Steel Powder',
    family: 'Stainless steel',
    aka: ['CX', 'Corrax-type', 'Fe–12Cr–9Ni–2Mo–Al'],
    uns: null,
    proprietary: true,
    standards: [
      cite('No public grade standard', 'CX is a proprietary composition with no ASTM, AMS or UNS designation'),
    ],
    intro:
      'A soft-martensitic precipitation-hardening stainless steel developed specifically for additive manufacturing. It combines the corrosion resistance of a 13 % chromium stainless with an ageing response that reaches above 50 HRC, and unlike 17-4 PH it is supplied soft enough to machine before ageing.',
    advantages: [
      'Hardens above 50 HRC on a single low-temperature age',
      'Corrosion resistance well above conventional tool steels',
      'Builds in a soft, machinable condition',
      'Good polishability for mould surfaces',
    ],
    applications: [
      'Corrosion-exposed injection-mould tooling',
      'Medical and dental tooling',
      'Aerospace components requiring strength with corrosion resistance',
    ],
    chemistry: {
      basis: 'Nominal composition — confirm against the supplying mill’s specification',
      columnHeads: ['Composition, wt %'],
      rows: [
        { el: 'Cr', name: 'Chromium', values: ['11.0–13.0'] },
        { el: 'Ni', name: 'Nickel', values: ['8.0–10.0'] },
        { el: 'Mo', name: 'Molybdenum', values: ['1.2–1.8'] },
        { el: 'Al', name: 'Aluminium', values: ['1.2–1.8'] },
        { el: 'C', name: 'Carbon', values: ['≤ 0.03'] },
        { el: 'Mn', name: 'Manganese', values: ['≤ 0.50'] },
        { el: 'Si', name: 'Silicon', values: ['≤ 0.50'] },
        { el: 'Fe', name: 'Iron', values: ['Balance'] },
      ],
      supplementary: [{ el: 'O', name: 'Oxygen', values: ['≤ 0.05 typical'] }],
      note:
        'CX has no public ASTM, AMS or UNS grade definition, so there is no independent standard against which conformance can be judged. The limits above are nominal. Orders are accepted and certified against the supplying mill’s own specification, which is issued with the material.',
    },
    physical: { density: 7.70, melting: '1 400–1 440 °C', magnetic: 'Magnetic (martensitic)' },
    mechanical: {
      condition: 'L-PBF, aged 3 h at 525 °C',
      rows: [
        { p: 'Ultimate tensile strength', v: '1 600–1 750 MPa' },
        { p: 'Yield strength (R<sub>p0.2</sub>)', v: '1 400–1 550 MPa' },
        { p: 'Elongation at break', v: '4–8 %' },
        { p: 'Hardness', v: '48–52 HRC' },
        { p: 'Modulus of elasticity', v: '185–200 GPa' },
      ],
    },
  },

  // ----------------------------------------------------------- nickel alloys
  {
    slug: 'inconel-625',
    name: 'Inconel 625',
    subtitle: 'Nickel–Chromium–Molybdenum–Niobium Superalloy Powder',
    family: 'Nickel superalloy',
    aka: ['Alloy 625', 'IN625', '2.4856', 'Nicrofer 6020'],
    uns: 'N06625',
    standards: [
      cite('ASTM F3056', 'Additive Manufacturing Nickel Alloy (UNS N06625) with Powder Bed Fusion'),
      cite('AMS 5666', 'Nickel alloy bars, forgings and rings, 62Ni–21.5Cr–9Mo–3.65Nb'),
      cite('ASTM B443', 'Nickel–chromium–molybdenum–columbium alloy plate, sheet and strip'),
    ],
    intro:
      'A solid-solution strengthened superalloy that needs no precipitation treatment to reach useful strength, which makes it forgiving to build and weld. Molybdenum and niobium stiffen the nickel–chromium matrix and give near-immunity to chloride stress-corrosion cracking, pitting and crevice attack across a very wide temperature range — from cryogenic to about 980 °C.',
    advantages: [
      'Outstanding resistance to pitting, crevice corrosion and chloride stress-corrosion cracking',
      'High strength without a precipitation heat treatment',
      'Serviceable from cryogenic temperature to approximately 980 °C',
      'Excellent weldability and freedom from strain-age cracking',
      'Resists seawater and a wide range of acids',
    ],
    applications: [
      'Gas turbine combustion and exhaust components',
      'Subsea and downhole oil and gas hardware',
      'Chemical process vessels, scrubbers and heat exchangers',
      'Marine and seawater-handling equipment',
      'Flue-gas desulphurisation systems',
    ],
    chemistry: {
      basis: 'ASTM F3056 / UNS N06625',
      columnHeads: ['Composition, wt %'],
      rows: [
        { el: 'Ni', name: 'Nickel', values: ['≥ 58.0'] },
        { el: 'Cr', name: 'Chromium', values: ['20.0–23.0'] },
        { el: 'Mo', name: 'Molybdenum', values: ['8.0–10.0'] },
        { el: 'Nb+Ta', name: 'Niobium + Tantalum', values: ['3.15–4.15'] },
        { el: 'Fe', name: 'Iron', values: ['≤ 5.0'] },
        { el: 'Co', name: 'Cobalt', values: ['≤ 1.0'] },
        { el: 'Mn', name: 'Manganese', values: ['≤ 0.50'] },
        { el: 'Si', name: 'Silicon', values: ['≤ 0.50'] },
        { el: 'Al', name: 'Aluminium', values: ['≤ 0.40'] },
        { el: 'Ti', name: 'Titanium', values: ['≤ 0.40'] },
        { el: 'C', name: 'Carbon', values: ['≤ 0.10'] },
        { el: 'P', name: 'Phosphorus', values: ['≤ 0.015'] },
        { el: 'S', name: 'Sulphur', values: ['≤ 0.015'] },
      ],
      supplementary: [
        { el: 'O', name: 'Oxygen', values: ['≤ 0.05 typical'] },
        { el: 'N', name: 'Nitrogen', values: ['≤ 0.05 typical'] },
      ],
      note: 'Oxygen and nitrogen govern powder reusability and are reported on every Certificate of Analysis. Where a build specification imposes a ceiling on either, state it at order so the lot can be selected against it.',
    },
    physical: { density: 8.44, melting: '1 290–1 350 °C', magnetic: 'Non-magnetic' },
    mechanical: {
      condition: 'as-built L-PBF, > 99.5 % dense, tested per ISO 6892-1',
      rows: [
        { p: 'Ultimate tensile strength', v: '900–1 050 MPa' },
        { p: 'Yield strength (R<sub>p0.2</sub>)', v: '600–750 MPa' },
        { p: 'Elongation at break', v: '30–45 %' },
        { p: 'Hardness', v: '250–300 HV5' },
        { p: 'Modulus of elasticity', v: '170–200 GPa' },
      ],
    },
  },
  {
    slug: 'inconel-718',
    name: 'Inconel 718',
    subtitle: 'Precipitation-Hardening Nickel–Chromium Superalloy Powder',
    family: 'Nickel superalloy',
    aka: ['Alloy 718', 'IN718', '2.4668'],
    uns: 'N07718',
    standards: [
      cite('ASTM F3055', 'Additive Manufacturing Nickel Alloy (UNS N07718) with Powder Bed Fusion'),
      cite('AMS 5662 / 5663', 'Nickel alloy bars, forgings and rings, precipitation hardenable'),
      cite('ASTM B637', 'Precipitation-hardening nickel alloy bars, forgings and forging stock'),
    ],
    intro:
      'The workhorse of additively manufactured aerospace hardware. Niobium-driven γ″ precipitation gives very high strength up to about 700 °C, and because that precipitation is sluggish the alloy can be welded and built without the strain-age cracking that afflicts faster-hardening superalloys. Properties depend heavily on the post-build treatment; homogenisation before solution and ageing is essential for additive material.',
    advantages: [
      'Very high strength and creep resistance to approximately 700 °C',
      'Sluggish precipitation kinetics — weldable and build-crack resistant',
      'Excellent fatigue strength after HIP and full heat treatment',
      'Good oxidation and corrosion resistance',
    ],
    applications: [
      'Turbine discs, blades, casings and seals',
      'Rocket engine and launch vehicle components',
      'Downhole tooling and completion hardware',
      'High-temperature fasteners and springs',
    ],
    chemistry: {
      basis: 'ASTM F3055 / UNS N07718',
      columnHeads: ['Composition, wt %'],
      rows: [
        { el: 'Ni', name: 'Nickel (+ Co)', values: ['50.0–55.0'] },
        { el: 'Cr', name: 'Chromium', values: ['17.0–21.0'] },
        { el: 'Nb+Ta', name: 'Niobium + Tantalum', values: ['4.75–5.50'] },
        { el: 'Mo', name: 'Molybdenum', values: ['2.80–3.30'] },
        { el: 'Ti', name: 'Titanium', values: ['0.65–1.15'] },
        { el: 'Al', name: 'Aluminium', values: ['0.20–0.80'] },
        { el: 'Co', name: 'Cobalt', values: ['≤ 1.00'] },
        { el: 'Mn', name: 'Manganese', values: ['≤ 0.35'] },
        { el: 'Si', name: 'Silicon', values: ['≤ 0.35'] },
        { el: 'Cu', name: 'Copper', values: ['≤ 0.30'] },
        { el: 'C', name: 'Carbon', values: ['≤ 0.08'] },
        { el: 'P', name: 'Phosphorus', values: ['≤ 0.015'] },
        { el: 'S', name: 'Sulphur', values: ['≤ 0.015'] },
        { el: 'B', name: 'Boron', values: ['≤ 0.006'] },
        { el: 'Fe', name: 'Iron', values: ['Balance'] },
      ],
      supplementary: [
        { el: 'O', name: 'Oxygen', values: ['≤ 0.05 typical'] },
        { el: 'N', name: 'Nitrogen', values: ['≤ 0.05 typical'] },
      ],
      note: 'Aerospace orders routinely impose tighter interstitial ceilings than the grade requires. State the governing specification at order.',
    },
    physical: { density: 8.19, melting: '1 260–1 336 °C', magnetic: 'Non-magnetic' },
    mechanical: {
      condition: 'L-PBF, homogenised, solution treated and aged per AMS 5663',
      rows: [
        { p: 'Ultimate tensile strength', v: '1 350–1 450 MPa' },
        { p: 'Yield strength (R<sub>p0.2</sub>)', v: '1 150–1 250 MPa' },
        { p: 'Elongation at break', v: '12–20 %' },
        { p: 'Hardness', v: '44–48 HRC' },
        { p: 'Modulus of elasticity', v: '195–210 GPa' },
      ],
    },
  },
  {
    slug: 'hastelloy-x',
    name: 'Nickel Alloy HX',
    subtitle: 'Nickel–Chromium–Iron–Molybdenum High-Temperature Alloy Powder',
    family: 'Nickel superalloy',
    aka: ['Hastelloy X', 'Alloy HX', '2.4665', 'Nicrofer 4722Co'],
    uns: 'N06002',
    standards: [
      cite('AMS 5754', 'Nickel alloy bars, forgings and rings, 47.5Ni–22Cr–1.5Co–9Mo'),
      cite('ASTM B435', 'UNS N06002 plate, sheet and strip'),
    ],
    intro:
      'A solid-solution strengthened alloy that keeps useful strength and oxidation resistance to about 1 200 °C, higher than either 625 or 718. It is the standard choice for combustor liners and other thin-section hot-gas-path hardware, where its exceptional fabricability and freedom from build cracking matter as much as its high-temperature strength.',
    advantages: [
      'Oxidation resistance and useful strength to approximately 1 200 °C',
      'Outstanding resistance to stress-corrosion cracking and carburising atmospheres',
      'Excellent weldability and build stability in thin sections',
      'Resists chlorine-bearing and reducing atmospheres',
    ],
    applications: [
      'Gas turbine combustor liners, transition ducts and burner cans',
      'Industrial furnace and heat-treatment fixtures',
      'Petrochemical reactor internals',
      'Nuclear and high-temperature ducting',
    ],
    chemistry: {
      basis: 'AMS 5754 / UNS N06002',
      columnHeads: ['Composition, wt %'],
      rows: [
        { el: 'Ni', name: 'Nickel', values: ['Balance'] },
        { el: 'Cr', name: 'Chromium', values: ['20.5–23.0'] },
        { el: 'Fe', name: 'Iron', values: ['17.0–20.0'] },
        { el: 'Mo', name: 'Molybdenum', values: ['8.0–10.0'] },
        { el: 'Co', name: 'Cobalt', values: ['0.50–2.50'] },
        { el: 'W', name: 'Tungsten', values: ['0.20–1.00'] },
        { el: 'C', name: 'Carbon', values: ['0.05–0.15'] },
        { el: 'Mn', name: 'Manganese', values: ['≤ 1.00'] },
        { el: 'Si', name: 'Silicon', values: ['≤ 1.00'] },
        { el: 'Al', name: 'Aluminium', values: ['≤ 0.50'] },
        { el: 'Ti', name: 'Titanium', values: ['≤ 0.15'] },
        { el: 'P', name: 'Phosphorus', values: ['≤ 0.040'] },
        { el: 'S', name: 'Sulphur', values: ['≤ 0.030'] },
        { el: 'B', name: 'Boron', values: ['≤ 0.010'] },
      ],
      supplementary: [
        { el: 'O', name: 'Oxygen', values: ['≤ 0.05 typical'] },
        { el: 'N', name: 'Nitrogen', values: ['≤ 0.05 typical'] },
      ],
      note: 'Unusually for a nickel alloy, HX specifies a carbon minimum — the carbides it forms contribute to high-temperature strength, so a low-carbon lot is not a better lot.',
    },
    physical: { density: 8.22, melting: '1 260–1 355 °C', magnetic: 'Non-magnetic' },
    mechanical: {
      condition: 'as-built L-PBF, > 99.5 % dense, tested per ISO 6892-1',
      rows: [
        { p: 'Ultimate tensile strength', v: '750–850 MPa' },
        { p: 'Yield strength (R<sub>p0.2</sub>)', v: '550–650 MPa' },
        { p: 'Elongation at break', v: '25–40 %' },
        { p: 'Hardness', v: '220–260 HV5' },
        { p: 'Modulus of elasticity', v: '185–205 GPa' },
      ],
    },
  },
  {
    slug: 'hastelloy-c22',
    name: 'Nickel Alloy C-22',
    subtitle: 'Nickel–Chromium–Molybdenum–Tungsten Corrosion-Resistant Alloy Powder',
    family: 'Nickel superalloy',
    aka: ['Hastelloy C-22', 'Alloy 22', '2.4602', 'Nicrofer 5621'],
    uns: 'N06022',
    standards: [
      cite('ASTM B575', 'UNS N06022 plate, sheet and strip'),
      cite('ASTM B574', 'UNS N06022 rod'),
      cite('AMS 5798', 'Nickel alloy, corrosion resistant, welding wire'),
    ],
    intro:
      'One of the most universally corrosion-resistant alloys available. The high chromium plus molybdenum plus tungsten combination resists both oxidising and reducing media — the pairing that defeats most stainless steels — and its very low carbon and silicon give outstanding resistance to weld-heat-affected-zone attack in the as-welded or as-built condition.',
    advantages: [
      'Resists both oxidising and reducing corrosive media',
      'Outstanding resistance to pitting, crevice attack and stress-corrosion cracking',
      'Exceptional resistance to localised corrosion in the as-welded condition',
      'Handles oxidising acid chlorides, wet chlorine and hypochlorite',
    ],
    applications: [
      'Flue-gas desulphurisation scrubbers and ducting',
      'Chemical process equipment for mixed acid service',
      'Pharmaceutical and fine-chemical reactors',
      'Pulp and paper bleaching plant',
      'Nuclear waste containment hardware',
    ],
    chemistry: {
      basis: 'ASTM B575 / UNS N06022',
      columnHeads: ['Composition, wt %'],
      rows: [
        { el: 'Ni', name: 'Nickel', values: ['Balance'] },
        { el: 'Cr', name: 'Chromium', values: ['20.0–22.5'] },
        { el: 'Mo', name: 'Molybdenum', values: ['12.5–14.5'] },
        { el: 'W', name: 'Tungsten', values: ['2.5–3.5'] },
        { el: 'Fe', name: 'Iron', values: ['2.0–6.0'] },
        { el: 'Co', name: 'Cobalt', values: ['≤ 2.5'] },
        { el: 'V', name: 'Vanadium', values: ['≤ 0.35'] },
        { el: 'Mn', name: 'Manganese', values: ['≤ 0.50'] },
        { el: 'C', name: 'Carbon', values: ['≤ 0.015'] },
        { el: 'Si', name: 'Silicon', values: ['≤ 0.08'] },
        { el: 'P', name: 'Phosphorus', values: ['≤ 0.02'] },
        { el: 'S', name: 'Sulphur', values: ['≤ 0.02'] },
      ],
      supplementary: [
        { el: 'O', name: 'Oxygen', values: ['≤ 0.05 typical'] },
        { el: 'N', name: 'Nitrogen', values: ['≤ 0.05 typical'] },
      ],
      note: 'The very low carbon and silicon ceilings are what give C-22 its as-welded corrosion performance. A lot meeting the chromium and molybdenum ranges but running high on either will not behave like C-22 in service.',
    },
    physical: { density: 8.69, melting: '1 357–1 399 °C', magnetic: 'Non-magnetic' },
    mechanical: {
      condition: 'as-built L-PBF, > 99.5 % dense, tested per ISO 6892-1',
      rows: [
        { p: 'Ultimate tensile strength', v: '780–900 MPa' },
        { p: 'Yield strength (R<sub>p0.2</sub>)', v: '520–640 MPa' },
        { p: 'Elongation at break', v: '35–50 %' },
        { p: 'Hardness', v: '230–270 HV5' },
        { p: 'Modulus of elasticity', v: '190–210 GPa' },
      ],
    },
  },

  // -------------------------------------------------------- titanium alloys
  {
    slug: 'ti6al4v',
    name: 'Ti-6Al-4V',
    subtitle: 'Alpha–Beta Titanium Alloy Powder — Grade 5 and Grade 23 (ELI)',
    family: 'Titanium alloy',
    aka: ['Ti64', 'Ti-6Al-4V', 'Grade 5', 'Grade 23 ELI', '3.7165'],
    uns: 'R56400 (Gr 5) / R56407 (Gr 23)',
    reactive: true,
    standards: [
      cite('ASTM F2924', 'Additive Manufacturing Ti-6Al-4V with Powder Bed Fusion — Grade 5'),
      cite('ASTM F3001', 'Additive Manufacturing Ti-6Al-4V ELI with Powder Bed Fusion — Grade 23'),
      cite('ASTM F1472', 'Wrought Ti-6Al-4V for surgical implants — Grade 5'),
      cite('ASTM F136', 'Wrought Ti-6Al-4V ELI for surgical implants — Grade 23'),
    ],
    intro:
      'The most used titanium alloy in the world, and the reference material for additive manufacturing in aerospace and medical. Grade 5 and Grade 23 are the same alloy at different interstitial purity: Grade 23 (Extra Low Interstitial) caps oxygen, iron and hydrogen more tightly, trading a little strength for markedly better fracture toughness and fatigue resistance, which is why implant work specifies it.',
    advantages: [
      'Very high specific strength — comparable to steel at 56 % of the density',
      'Excellent corrosion resistance in seawater and body fluids',
      'Biocompatible and osseointegrating; Grade 23 qualified for implants',
      'Useful strength to approximately 400 °C',
      'Non-magnetic and low thermal expansion',
    ],
    applications: [
      'Aerospace structural and engine components',
      'Orthopaedic and spinal implants (Grade 23)',
      'Dental implants and abutments',
      'Motorsport and high-performance automotive parts',
      'Marine and subsea hardware',
    ],
    chemistry: {
      basis: 'ASTM F2924 (Grade 5) and ASTM F3001 (Grade 23 ELI)',
      columnHeads: ['Grade 5, wt %', 'Grade 23 ELI, wt %'],
      rows: [
        { el: 'Al', name: 'Aluminium', values: ['5.50–6.75', '5.50–6.50'] },
        { el: 'V', name: 'Vanadium', values: ['3.50–4.50', '3.50–4.50'] },
        { el: 'Fe', name: 'Iron', values: ['≤ 0.30', '≤ 0.25'] },
        { el: 'O', name: 'Oxygen', values: ['≤ 0.20', '≤ 0.13'] },
        { el: 'C', name: 'Carbon', values: ['≤ 0.08', '≤ 0.08'] },
        { el: 'N', name: 'Nitrogen', values: ['≤ 0.05', '≤ 0.05'] },
        { el: 'H', name: 'Hydrogen', values: ['≤ 0.015', '≤ 0.012'] },
        { el: 'Y', name: 'Yttrium', values: ['≤ 0.005', '≤ 0.005'] },
        { el: '—', name: 'Other elements, each', values: ['≤ 0.10', '≤ 0.10'] },
        { el: '—', name: 'Other elements, total', values: ['≤ 0.40', '≤ 0.40'] },
        { el: 'Ti', name: 'Titanium', values: ['Balance', 'Balance'] },
      ],
      note:
        'Grade 5 and Grade 23 differ only in aluminium, iron, oxygen and hydrogen. They are not interchangeable and a single set of limits cannot serve both — state which grade is required at order, and confirm that the Certificate of Analysis names the same one.',
    },
    physical: { density: 4.43, melting: '1 604–1 660 °C', magnetic: 'Non-magnetic' },
    mechanical: {
      condition: 'L-PBF, stress relieved 2 h at 700 °C, tested per ISO 6892-1',
      rows: [
        { p: 'Ultimate tensile strength', v: '1 050–1 250 MPa' },
        { p: 'Yield strength (R<sub>p0.2</sub>)', v: '950–1 100 MPa' },
        { p: 'Elongation at break', v: '8–15 %' },
        { p: 'Hardness', v: '320–380 HV5' },
        { p: 'Modulus of elasticity', v: '110–120 GPa' },
      ],
      note: 'Hot isostatic pressing closes residual porosity and raises elongation to 14–18 % at 950–1 050 MPa tensile strength. Implant work normally specifies it.',
    },
  },
  {
    slug: 'cp-titanium-grade-2',
    name: 'Commercially Pure Titanium Grade 2',
    subtitle: 'Unalloyed Titanium Powder',
    family: 'Titanium',
    aka: ['CP-Ti Grade 2', 'CP Ti Gr 2', '3.7035'],
    uns: 'R50400',
    reactive: true,
    standards: [
      cite('ASTM B348 Grade 2', 'Titanium and titanium alloy bars and billets'),
      cite('ASTM F67 Grade 2', 'Unalloyed titanium for surgical implant applications'),
      cite('ASTM B988', 'Powder metallurgy titanium and titanium alloy structural components'),
    ],
    intro:
      'Unalloyed titanium, and the most widely used of the four commercially pure grades. It trades the strength of Ti-6Al-4V for markedly better ductility, formability and weldability, while retaining titanium’s corrosion resistance — which comes from a tenacious self-repairing oxide film rather than from any alloying addition.',
    advantages: [
      'Outstanding corrosion resistance in seawater, chlorides and oxidising acids',
      'Excellent ductility, formability and weldability',
      'Fully biocompatible and osseointegrating',
      'Low density with good strength-to-weight ratio',
      'Non-magnetic; suitable for MRI-compatible hardware',
    ],
    applications: [
      'Chemical process and desalination equipment',
      'Dental implants and craniofacial plates',
      'Marine and offshore hardware',
      'Heat exchangers and condenser tubing',
      'Architectural and consumer components',
    ],
    chemistry: {
      basis: 'ASTM B348 / ASTM F67, Grade 2 — Grade 1 shown for comparison',
      columnHeads: ['Grade 2, wt %', 'Grade 1, wt %'],
      rows: [
        { el: 'O', name: 'Oxygen', values: ['≤ 0.25', '≤ 0.18'] },
        { el: 'Fe', name: 'Iron', values: ['≤ 0.30', '≤ 0.20'] },
        { el: 'C', name: 'Carbon', values: ['≤ 0.08', '≤ 0.08'] },
        { el: 'N', name: 'Nitrogen', values: ['≤ 0.03', '≤ 0.03'] },
        { el: 'H', name: 'Hydrogen', values: ['≤ 0.015', '≤ 0.015'] },
        { el: '—', name: 'Other elements, each', values: ['≤ 0.10', '≤ 0.10'] },
        { el: '—', name: 'Other elements, total', values: ['≤ 0.40', '≤ 0.40'] },
        { el: 'Ti', name: 'Titanium', values: ['Balance', 'Balance'] },
      ],
      note:
        'Oxygen and iron are what separate the commercially pure grades from one another — there is no other distinguishing addition. A sheet that does not name its grade is not specifying the material. Grade 1, 3 and 4 are available to order.',
    },
    physical: { density: 4.51, melting: '1 668 °C', magnetic: 'Non-magnetic' },
    mechanical: {
      condition: 'as-built L-PBF, > 99.5 % dense, tested per ISO 6892-1',
      rows: [
        { p: 'Ultimate tensile strength', v: '500–650 MPa' },
        { p: 'Yield strength (R<sub>p0.2</sub>)', v: '400–530 MPa' },
        { p: 'Elongation at break', v: '18–28 %' },
        { p: 'Hardness', v: '170–220 HV5' },
        { p: 'Modulus of elasticity', v: '100–115 GPa' },
      ],
    },
  },

  // ------------------------------------------------------------ cobalt alloy
  {
    slug: 'cocrmo',
    name: 'Cobalt Chrome CoCrMo',
    subtitle: 'Cobalt–Chromium–Molybdenum Alloy Powder',
    family: 'Cobalt alloy',
    aka: ['CoCrMo', 'ASTM F75', 'Co28Cr6Mo', '2.4723'],
    uns: 'R31538',
    standards: [
      cite('ASTM F3213', 'Additive Manufacturing Cobalt-28Cr-6Mo Alloy (UNS R31538) with Powder Bed Fusion'),
      cite('ASTM F75', 'Cobalt-28Cr-6Mo alloy castings for surgical implants'),
      cite('ISO 5832-4', 'Implants for surgery — cobalt-chromium-molybdenum casting alloy'),
    ],
    intro:
      'A cobalt-based alloy that combines high hardness, exceptional wear resistance and full biocompatibility — a rare combination that has made it the standard bearing-surface material for joint replacements. Chromium carbides dispersed through the cobalt matrix carry the wear resistance, and the alloy keeps its strength and oxidation resistance well above the range where stainless steels soften.',
    advantages: [
      'Exceptional wear and galling resistance',
      'Biocompatible; the established implant bearing-surface alloy',
      'Retains hardness and strength at elevated temperature',
      'Excellent corrosion resistance in body fluids and chlorides',
      'High modulus of elasticity for a wear surface',
    ],
    applications: [
      'Hip, knee and dental prosthetics',
      'Dental crowns, bridges and frameworks',
      'Gas turbine hot-section and wear components',
      'Valve seats, bushings and wear-resistant tooling',
    ],
    chemistry: {
      basis: 'ASTM F75 / ASTM F3213 / UNS R31538',
      columnHeads: ['Composition, wt %'],
      rows: [
        { el: 'Co', name: 'Cobalt', values: ['Balance'] },
        { el: 'Cr', name: 'Chromium', values: ['27.00–30.00'] },
        { el: 'Mo', name: 'Molybdenum', values: ['5.00–7.00'] },
        { el: 'Ni', name: 'Nickel', values: ['≤ 0.50'] },
        { el: 'Fe', name: 'Iron', values: ['≤ 0.75'] },
        { el: 'C', name: 'Carbon', values: ['≤ 0.35'] },
        { el: 'Mn', name: 'Manganese', values: ['≤ 1.00'] },
        { el: 'Si', name: 'Silicon', values: ['≤ 1.00'] },
        { el: 'N', name: 'Nitrogen', values: ['≤ 0.25'] },
        { el: 'W', name: 'Tungsten', values: ['≤ 0.20'] },
        { el: 'Al', name: 'Aluminium', values: ['≤ 0.10'] },
        { el: 'Ti', name: 'Titanium', values: ['≤ 0.10'] },
        { el: 'P', name: 'Phosphorus', values: ['≤ 0.020'] },
        { el: 'B', name: 'Boron', values: ['≤ 0.010'] },
        { el: 'S', name: 'Sulphur', values: ['≤ 0.010'] },
      ],
      supplementary: [{ el: 'O', name: 'Oxygen', values: ['≤ 0.05 typical'] }],
      note: 'The nickel ceiling of 0.50 % matters for implant use — it is what allows the alloy to be used on nickel-sensitised patients, and it is the figure to check first on an implant-grade Certificate of Analysis.',
    },
    physical: { density: 8.30, melting: '1 330–1 400 °C', magnetic: 'Non-magnetic' },
    mechanical: {
      condition: 'as-built L-PBF, > 99.5 % dense, tested per ISO 6892-1',
      rows: [
        { p: 'Ultimate tensile strength', v: '1 100–1 300 MPa' },
        { p: 'Yield strength (R<sub>p0.2</sub>)', v: '700–900 MPa' },
        { p: 'Elongation at break', v: '10–18 %' },
        { p: 'Hardness', v: '380–450 HV5' },
        { p: 'Modulus of elasticity', v: '200–230 GPa' },
      ],
    },
  },
  // CoCrMoW - dental Co-Cr-W-Mo, ISO 22674 - IS NOT WRITTEN YET, ON PURPOSE.
  //
  // Supplier and competitor names are deliberately not written in this file. It
  // is committed to a public repository, so a name here is a published name even
  // though the folder is excluded from the build. Refer to "our supplier" and
  // "the other manufacturer"; whoever needs the actual names has them elsewhere.
  //
  // An entry was drafted here from figures another manufacturer publishes for
  // their own branded alloy. We do not supply that material. Publishing someone
  // else's density, strength, modulus and thermal expansion as ours asserts that
  // what we ship performs identically, which is a representation nobody has
  // checked. Same class of error as the lot reports this folder replaced - a
  // claim about material we do not hold - so the whole entry was pulled rather
  // than partly corrected.
  //
  // To add it, take EVERY field from our own supplier's data sheet: chemistry,
  // density, solidus/liquidus, ISO 22674 Type, Rp0.2, Rm, modulus, elongation,
  // hardness, and thermal expansion if it is a metal-ceramic alloy. Carry no
  // number over from a competitor.
  //
  // Chemistry as received, SOURCE UNCONFIRMED - it arrived separately from that
  // other manufacturer's page and may or may not be our supplier's:
  //   Co balance, Cr 24.50-28.50, Mo 4.50-6.50, W 4.00-6.00,
  //   Si <= 1.00, Mn <= 1.00, Fe <= 0.50
  //
  // DO NOT ADOPT THOSE FIGURES. A supplier Certificate of Analysis read on
  // 2026-08-29 states the limits as Cr 24.50-28.50, Mo 4.00-6.00, W 4.00-6.00,
  // Si 1.00, Fe 1.00, Co balance - so Mo and Fe above are both wrong, which is
  // exactly what "source unconfirmed" was guarding against. That certificate is
  // still not enough on its own: it heads the table "as per ISO 22674", which is
  // a performance standard classifying alloys by Rp0.2 and elongation rather
  // than a composition spec, and it omits the nickel, beryllium and cadmium
  // declaration ISO 22674 does require - which the supplier's own CoCrW
  // certificates carry. Written confirmation of the limits plus that
  // declaration has been requested. Wait for it.
  //
  // This is NOT a variant of the CoCrMo entry above. F75 runs 27-30 % Cr and
  // caps W at 0.20 % as a residual; this runs lower Cr with W at 4-6 % as a
  // deliberate addition, and is qualified to ISO 22674 for dental restorations,
  // not ISO 5832-4 for implants. No ASTM F-number belongs on it.

  // --------------------------------------------------------- aluminium alloys
  {
    slug: 'alsi10mg',
    name: 'AlSi10Mg',
    subtitle: 'Aluminium–Silicon–Magnesium Casting Alloy Powder',
    family: 'Aluminium alloy',
    aka: ['AlSi10Mg', 'EN AC-43000', '3.2381'],
    uns: null,
    reactive: true,
    standards: [
      cite('ASTM F3318', 'Additive Manufacturing AlSi10Mg with Powder Bed Fusion'),
      cite('EN 1706 AC-43000', 'Aluminium casting alloy chemistry reference'),
    ],
    intro:
      'The established aluminium alloy for laser powder bed fusion. Its near-eutectic silicon content gives a narrow freezing range and excellent fluidity, so it builds with very low hot-cracking risk, and the fine cellular silicon network that forms under rapid solidification makes as-built material considerably stronger than the same alloy cast conventionally.',
    advantages: [
      'Low density with good strength and hardness',
      'Near-eutectic composition — excellent build stability, low cracking risk',
      'High thermal and electrical conductivity',
      'Good corrosion resistance; readily anodised',
      'Responds to T6 heat treatment',
    ],
    applications: [
      'Lightweight automotive and motorsport components',
      'Heat sinks and thermal management hardware',
      'Aerospace brackets and housings',
      'Robotics and drone structures',
      'Functional prototypes and short-run production parts',
    ],
    chemistry: {
      basis: 'ASTM F3318 / EN AC-43000',
      columnHeads: ['Composition, wt %'],
      rows: [
        { el: 'Si', name: 'Silicon', values: ['9.0–11.0'] },
        { el: 'Mg', name: 'Magnesium', values: ['0.20–0.45'] },
        { el: 'Fe', name: 'Iron', values: ['≤ 0.55'] },
        { el: 'Mn', name: 'Manganese', values: ['≤ 0.45'] },
        { el: 'Ti', name: 'Titanium', values: ['≤ 0.15'] },
        { el: 'Zn', name: 'Zinc', values: ['≤ 0.10'] },
        { el: 'Cu', name: 'Copper', values: ['≤ 0.05'] },
        { el: 'Ni', name: 'Nickel', values: ['≤ 0.05'] },
        { el: 'Pb', name: 'Lead', values: ['≤ 0.05'] },
        { el: 'Sn', name: 'Tin', values: ['≤ 0.05'] },
        { el: 'Al', name: 'Aluminium', values: ['Balance'] },
      ],
      supplementary: [{ el: 'O', name: 'Oxygen', values: ['≤ 0.20 typical'] }],
      note: 'Aluminium powder oxidises readily and its oxygen content rises with every reuse cycle. Oxygen is reported per lot, and recovered powder should be re-tested before being returned to a build.',
    },
    physical: { density: 2.67, melting: '570–590 °C', magnetic: 'Non-magnetic' },
    mechanical: {
      condition: 'L-PBF, stress relieved 2 h at 300 °C, tested per ISO 6892-1',
      rows: [
        { p: 'Ultimate tensile strength', v: '350–450 MPa' },
        { p: 'Yield strength (R<sub>p0.2</sub>)', v: '220–290 MPa' },
        { p: 'Elongation at break', v: '6–12 %' },
        { p: 'Hardness', v: '100–130 HV5' },
        { p: 'Modulus of elasticity', v: '65–75 GPa' },
      ],
    },
  },
  {
    slug: 'al6061',
    name: 'Aluminium 6061',
    subtitle: 'Aluminium–Magnesium–Silicon Wrought Alloy Powder',
    family: 'Aluminium alloy',
    aka: ['Al6061', 'AA6061', '3.3211', 'AlMg1SiCu'],
    uns: 'A96061',
    reactive: true,
    standards: [
      cite('AMS 4025 / ASTM B209', 'Aluminium alloy 6061 chemistry reference'),
      cite('ASTM B928', 'Aluminium alloy designation, UNS A96061'),
    ],
    intro:
      'The general-purpose structural aluminium, and the alloy most parts are designed in before anyone asks how they will be made. It is heat treatable to T6, readily weldable and machinable, and corrosion resistant. In additive processing it is crack-sensitive — its wide freezing range makes it prone to solidification cracking — so it is most often used for directed energy deposition, cladding and binder jetting rather than laser powder bed fusion.',
    advantages: [
      'Good strength-to-weight ratio with T6 heat treatment',
      'Excellent weldability and machinability',
      'Good corrosion resistance; readily anodised',
      'The most widely specified structural aluminium — direct design equivalence with wrought parts',
    ],
    applications: [
      'Structural frames, brackets and fittings',
      'Repair cladding and DED build-up on 6061 substrates',
      'Marine and transport hardware',
      'General engineering and tooling components',
    ],
    chemistry: {
      basis: 'ASTM B209 / AMS 4025, UNS A96061',
      columnHeads: ['Composition, wt %'],
      rows: [
        { el: 'Mg', name: 'Magnesium', values: ['0.80–1.20'] },
        { el: 'Si', name: 'Silicon', values: ['0.40–0.80'] },
        { el: 'Cu', name: 'Copper', values: ['0.15–0.40'] },
        { el: 'Cr', name: 'Chromium', values: ['0.04–0.35'] },
        { el: 'Fe', name: 'Iron', values: ['≤ 0.70'] },
        { el: 'Mn', name: 'Manganese', values: ['≤ 0.15'] },
        { el: 'Zn', name: 'Zinc', values: ['≤ 0.25'] },
        { el: 'Ti', name: 'Titanium', values: ['≤ 0.15'] },
        { el: '—', name: 'Other elements, each', values: ['≤ 0.05'] },
        { el: '—', name: 'Other elements, total', values: ['≤ 0.15'] },
        { el: 'Al', name: 'Aluminium', values: ['Balance'] },
      ],
      supplementary: [{ el: 'O', name: 'Oxygen', values: ['≤ 0.20 typical'] }],
      note: '6061 is solidification-crack sensitive in laser powder bed fusion. For L-PBF work AlSi10Mg is normally the better choice; 6061 is supplied primarily for DED, cladding and binder jetting.',
    },
    physical: { density: 2.70, melting: '582–652 °C', magnetic: 'Non-magnetic' },
    mechanical: {
      condition: 'DED or L-PBF, heat treated to T6, tested per ISO 6892-1',
      rows: [
        { p: 'Ultimate tensile strength', v: '290–340 MPa' },
        { p: 'Yield strength (R<sub>p0.2</sub>)', v: '240–290 MPa' },
        { p: 'Elongation at break', v: '8–14 %' },
        { p: 'Hardness', v: '95–110 HV5' },
        { p: 'Modulus of elasticity', v: '68–72 GPa' },
      ],
    },
  },
  {
    slug: 'al7075',
    name: 'Aluminium 7075',
    subtitle: 'Aluminium–Zinc–Magnesium–Copper High-Strength Alloy Powder',
    family: 'Aluminium alloy',
    aka: ['Al7075', 'AA7075', '3.4365', 'AlZn5.5MgCu'],
    uns: 'A97075',
    reactive: true,
    standards: [
      cite('AMS 4045 / ASTM B209', 'Aluminium alloy 7075 chemistry reference'),
      cite('ASTM B928', 'Aluminium alloy designation, UNS A97075'),
    ],
    intro:
      'The highest-strength conventional aluminium alloy, reaching tensile strengths that approach mild steel at a third of the density. Zinc with magnesium and copper drives a strong precipitation response. Like 6061 it is difficult to process by laser powder bed fusion without grain-refining additions, and is supplied mainly for cold spray, DED and binder jetting.',
    advantages: [
      'Highest strength of the standard aluminium alloys',
      'Excellent strength-to-weight ratio for structural aerospace use',
      'Good fatigue strength',
      'Responds strongly to T6 and T73 heat treatment',
    ],
    applications: [
      'Aerospace structural components and fittings',
      'Defence and high-load structures',
      'Cold spray repair of 7000-series airframe parts',
      'Motorsport and high-performance structures',
    ],
    chemistry: {
      basis: 'ASTM B209 / AMS 4045, UNS A97075',
      columnHeads: ['Composition, wt %'],
      rows: [
        { el: 'Zn', name: 'Zinc', values: ['5.10–6.10'] },
        { el: 'Mg', name: 'Magnesium', values: ['2.10–2.90'] },
        { el: 'Cu', name: 'Copper', values: ['1.20–2.00'] },
        { el: 'Cr', name: 'Chromium', values: ['0.18–0.28'] },
        { el: 'Fe', name: 'Iron', values: ['≤ 0.50'] },
        { el: 'Si', name: 'Silicon', values: ['≤ 0.40'] },
        { el: 'Mn', name: 'Manganese', values: ['≤ 0.30'] },
        { el: 'Ti', name: 'Titanium', values: ['≤ 0.20'] },
        { el: '—', name: 'Other elements, each', values: ['≤ 0.05'] },
        { el: '—', name: 'Other elements, total', values: ['≤ 0.15'] },
        { el: 'Al', name: 'Aluminium', values: ['Balance'] },
      ],
      supplementary: [{ el: 'O', name: 'Oxygen', values: ['≤ 0.20 typical'] }],
      note: '7075 has a wide freezing range and is highly susceptible to solidification cracking in laser powder bed fusion. Confirm the intended process at order.',
    },
    physical: { density: 2.81, melting: '477–635 °C', magnetic: 'Non-magnetic' },
    mechanical: {
      condition: 'DED or cold spray, heat treated to T6, tested per ISO 6892-1',
      rows: [
        { p: 'Ultimate tensile strength', v: '480–560 MPa' },
        { p: 'Yield strength (R<sub>p0.2</sub>)', v: '420–500 MPa' },
        { p: 'Elongation at break', v: '5–11 %' },
        { p: 'Hardness', v: '140–165 HV5' },
        { p: 'Modulus of elasticity', v: '70–75 GPa' },
      ],
    },
  },
];

// Aurico order codes. The existing PDFs all carry a "Stock No:" on an
// Aurico-branded page which is the supplying mill's internal code — it names
// the source to every customer who reads a data sheet. These replace it. Do not
// write the mill's prefix back into this file to explain the point; the repo is
// public, and the prefix identifies the supplier as surely as the name would.
export const ORDER_CODES = {
  ss316l: 'SS316L', ss304l: 'SS304L', '17-4ph': '17-4PH', '15-5ph': '15-5PH', h13: 'H13',
  'maraging-ms1': 'MS1', cx: 'CX', 'inconel-625': 'IN625', 'inconel-718': 'IN718',
  'hastelloy-x': 'HX', 'hastelloy-c22': 'C22', ti6al4v: 'TI64',
  'cp-titanium-grade-2': 'CPTI2', cocrmo: 'COCRMO', alsi10mg: 'ALSI10MG',
  al6061: 'AL6061', al7075: 'AL7075',
};
