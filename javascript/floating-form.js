// floating-form.js - the site-wide enquiry form.
//
// Renders in two modes from one definition:
//   floating - a launcher button plus a slide-in panel, added to every page by
//              the shared footer include.
//   inline   - the same fields rendered into an existing container, used by the
//              contact page (<div id="rfq-form">).
//
// Both modes share one submit path. That path deliberately does NOT use
// mode:"no-cors" as its primary transport: a no-cors fetch resolves opaquely,
// so the old code reported "Inquiry submitted successfully!" even when the lead
// never arrived. Submissions now land in one of three honest states - verified,
// unverified, or failed - and the last one hands the visitor a WhatsApp link
// with their enquiry already written out, so a broken pipe still yields a lead.

import { LEAD_ENDPOINTS, FALLBACK_CONTACT, EVENTS } from "./lead-config.js";

const ATTRIBUTION_KEY = "aurico_attribution";

// Everything that reaches the textarea default is escaped here, once. The text
// comes from the query string or from the page's own JSON-LD, and is only ever
// used as a textarea default - never as markup.
function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// A CTA can hand the form the enquiry it was raised from, so a visitor who
// clicked "Request a sample" on the Inconel 718 powder page does not have to
// retype which powder they meant.
function ctaEnquiry() {
  try {
    return (new URLSearchParams(window.location.search).get("enquiry") || "").slice(0, 300);
  } catch {
    return "";
  }
}

// Routes whose subject is not a thing anyone enquires about. The ~130 location
// pages are the reason this list exists rather than a blanket "derive from the
// breadcrumb": theirs ends on a bare place name, so the derived seed would read
// "Enquiry: Mumbai", which tells the sales desk nothing and reads as a bug to
// the visitor. Home has no breadcrumb at all and needs no entry.
const NO_SUBJECT_PREFIXES = [
  "/nickel-alloy-supplier-in-",
  "/supply-locations/",
  "/export-markets/",
  "/pages/contact/",
  "/privacy/",
  "/terms/",
  // The weight calculator's last crumb is "Weight Calculator", which tells the
  // sales desk nothing - the same failure as seeding "Enquiry: Mumbai" off a
  // location page. It supplies its own subject instead: its quote button builds
  // an explicit ?enquiry= naming the material, form, size and calculated
  // weight, and an explicit one always beats the derived seed.
  "/tools/",
];

// Pulls the current page's subject out of its BreadcrumbList. The last crumb is
// already the hand-written name of what the page sells - "Inconel 625 Sheets",
// "Ti-6Al-4V Grade 5 Powder" - which is why this reads the breadcrumb rather
// than <title> or <h1>. Those carry marketing tails ("| Premium Corrosion &
// High-Temperature Alloy"), entity escapes and, on a few pages, mojibake; the
// breadcrumb carries none of it. 740 of 774 pages have one, and a page without
// simply gets no seed.
function breadcrumbSubject() {
  const blocks = document.querySelectorAll('script[type="application/ld+json"]');

  for (const block of blocks) {
    let parsed;
    try {
      parsed = JSON.parse(block.textContent);
    } catch {
      // A page carries several of these - Product, FAQPage, BreadcrumbList -
      // and one being unreadable must not cost us the others, which is why this
      // loops rather than reading only the first block. (The parked Product
      // node on an unpriced page is commented out at the element level, so it
      // never reaches the DOM to be parsed in the first place.)
      continue;
    }

    const candidates = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.["@graph"])
        ? parsed["@graph"]
        : [parsed];

    for (const node of candidates) {
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

// The form-hub breadcrumbs shout - "SHEETS", "COIL", "HOLLOW BARS" - because
// their headings do. Seeding "Enquiry: SHEETS" is not wrong, just shouty, so
// those are title-cased.
//
// The test is deliberately "letters and spaces only", not "has no lowercase".
// A grade designation is upper-case by nature and must survive untouched: the
// looser rule turned 904L into "904l", AM 350 into "Am 350" and 254 SMO into
// "254 Smo" - publishing a grade name this site does not sell. Any digit or
// punctuation means it is an identifier, not a shouted noun, so leave it be.
function tidySubject(name) {
  const collapsed = name.replace(/\s+/g, " ").trim().slice(0, 120);
  if (!/^[A-Z][A-Z ]*$/.test(collapsed)) return collapsed;
  return collapsed.replace(/\S+/g, (word) => word.charAt(0) + word.slice(1).toLowerCase());
}

// What the page is about, tidied and with the suppression list applied: the last
// breadcrumb crumb on a product page, or "" on home, the location pages and the
// tools, where a derived subject tells the sales desk nothing. Shared by the
// textarea prefill and the WhatsApp seed so the two never disagree about what a
// page is selling.
function derivedSubject() {
  const path = window.location.pathname;
  if (path === "/" || NO_SUBJECT_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return "";
  }
  return tidySubject(breadcrumbSubject());
}

// The textarea default. An explicit ?enquiry= CTA always wins over the derived
// subject - it says what the visitor clicked, which is more specific than what
// the page is about.
function prefillInquiry() {
  const explicit = ctaEnquiry();
  if (explicit) return escapeHtml(explicit);

  const subject = derivedSubject();
  // "Enquiry: " prefix so the line reads as something the form supplied rather
  // than as text the visitor left behind, and a trailing newline so the caret
  // lands under it and they add their sizes instead of editing around the seed.
  return subject ? `Enquiry: ${escapeHtml(subject)}\n` : "";
}

const ATTRIBUTION_FIELDS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
];

/* ------------------------------------------------------------------ *
 * Analytics
 * ------------------------------------------------------------------ */

// gtag is loaded by an inline snippet on nearly every page, but not all of
// them, and ad-blockers remove it. Tracking must never break a submission.
function track(eventName, params = {}) {
  try {
    if (typeof window.gtag === "function") {
      window.gtag("event", eventName, params);
    }
  } catch (error) {
    console.debug("Analytics event dropped:", error);
  }
}

// Records which campaign brought the visitor in, on their first page, and keeps
// it for the session. Without this every lead is attributed to whichever page
// happened to hold the form rather than to the ad or search that earned it.
function captureAttribution() {
  let stored = {};
  try {
    stored = JSON.parse(sessionStorage.getItem(ATTRIBUTION_KEY)) || {};
  } catch {
    stored = {};
  }

  const params = new URLSearchParams(window.location.search);
  let changed = false;

  ATTRIBUTION_FIELDS.forEach((field) => {
    const value = params.get(field);
    if (value && !stored[field]) {
      stored[field] = value;
      changed = true;
    }
  });

  if (!stored.landing_page) {
    stored.landing_page = window.location.pathname;
    changed = true;
  }
  if (!stored.referrer) {
    stored.referrer = document.referrer || "direct";
    changed = true;
  }

  if (changed) {
    try {
      sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(stored));
    } catch {
      // Private browsing. Attribution is a nice-to-have, not worth failing over.
    }
  }

  return stored;
}

/* ------------------------------------------------------------------ *
 * Transport
 * ------------------------------------------------------------------ */

// Separates "the server answered and refused" from "we never got an answer".
// Only the second kind is worth a blind retry: an endpoint that rejected the
// enquiry once will reject it again, and treating that as delivered would
// reintroduce the false-success bug this transport exists to remove.
class LeadRejected extends Error {
  constructor(message) {
    super(message);
    this.name = "LeadRejected";
  }
}

// text/plain is a CORS-safelisted content type, so the browser sends no
// preflight and Apps Script answers with Access-Control-Allow-Origin: *. That
// keeps the response readable, which is the entire point - we need to know
// whether the lead actually landed. The body is still JSON; only the declared
// content type differs, and the Apps Script reads e.postData.contents either way.
async function postVerified(endpoint, payload) {
  const response = await fetch(endpoint.url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new LeadRejected(`${endpoint.name} returned HTTP ${response.status}`);
  }

  // A 200 is not proof on its own. Apps Script's ContentService cannot set a
  // status code, so a script that threw halfway through still answers 200 - the
  // real outcome is in the body. Anything that is not an explicit {ok:false}
  // counts as delivered, which keeps older deployments that echo plain text
  // working.
  const body = (await response.text()).trim();
  if (body.startsWith("{")) {
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      return endpoint.name;
    }
    if (parsed && parsed.ok === false) {
      throw new LeadRejected(
        `${endpoint.name} rejected the lead: ${parsed.error || "no reason given"}`
      );
    }
  }

  return endpoint.name;
}

// Last-ditch delivery for the case where the verified request is blocked before
// it is answered - an Apps Script deployment that predates the CORS-aware
// version, say. The request itself still reaches the server; we simply cannot
// read the reply, so the caller reports this as unverified rather than as
// success.
async function postOpaque(endpoint, payload) {
  await fetch(endpoint.url, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });
  return endpoint.name;
}

// Returns "verified" if at least one endpoint confirmed receipt, "unverified"
// if the opaque fallback went out without throwing. Throws only when nothing
// could be delivered at all.
async function dispatch(payload) {
  const targets = LEAD_ENDPOINTS.filter((endpoint) => endpoint.enabled && endpoint.url);

  if (!targets.length) {
    throw new Error("No lead endpoint is enabled in lead-config.js");
  }

  const verified = await Promise.allSettled(
    targets.map((endpoint) => postVerified(endpoint, payload))
  );

  const delivered = verified
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);

  if (delivered.length) {
    return { status: "verified", delivered };
  }

  verified.forEach((result) => console.error("Lead endpoint failed:", result.reason));

  // Retry only the endpoints that never answered. If every one of them answered
  // and refused, the enquiry genuinely did not land and the visitor needs to be
  // told so rather than shown a success message.
  const unreachable = targets.filter(
    (_, index) => verified[index].reason?.name !== "LeadRejected"
  );

  if (!unreachable.length) {
    throw new Error("Every lead endpoint rejected the enquiry");
  }

  const opaque = await Promise.allSettled(
    unreachable.map((endpoint) => postOpaque(endpoint, payload))
  );

  const attempted = opaque
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);

  if (attempted.length) {
    return { status: "unverified", delivered: attempted };
  }

  throw new Error("Every lead endpoint failed");
}

/* ------------------------------------------------------------------ *
 * Component
 * ------------------------------------------------------------------ */

export class FloatingForm {
  constructor(config = {}) {
    this.config = {
      mode: "floating", // "floating" | "inline"
      mount: null, // selector, required when mode is "inline"
      buttonText: "Request an Offer",
      formTitle: "Request an Offer",
      position: "bottom-left",
      ...config,
    };

    this.isVisible = false;
    this.hasStarted = false;
    this.init();
  }

  init() {
    this.injectStyles();
    if (this.config.mode === "inline") {
      this.createInline();
    } else {
      this.createFloating();
    }
    if (this.form) {
      this.bindFormEvents();
    }
  }

  injectStyles() {
    if (document.getElementById("floating-form-styles")) return;

    // z-index note: the WhatsApp/email rail in the header sits at 9999. The
    // panel and its overlay have to clear that, or the rail floats on top of
    // the open form - which it did, directly over the fields on mobile.
    const styles = `
      .floating-form-button {
        position: fixed;
        left: 20px;
        bottom: 20px;
        background: linear-gradient(135deg, #fec163 0%, #e67e22 100%);
        color: white;
        border-radius: 50px;
        padding: 15px 20px;
        cursor: pointer;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        transition: transform 0.3s ease, box-shadow 0.3s ease;
        z-index: 9990;
        display: flex;
        align-items: center;
        gap: 10px;
        border: none;
        font-family: inherit;
        font-size: 16px;
      }

      .floating-form-button:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(0,0,0,0.3);
      }

      .floating-form-sidebar {
        position: fixed;
        top: 0;
        right: 0;
        width: 400px;
        max-width: 100%;
        height: 100vh;
        background: white;
        box-shadow: -2px 0 10px rgba(0,0,0,0.1);
        transform: translateX(100%);
        transition: transform 0.3s ease;
        z-index: 10001;
        padding: 30px;
        overflow-y: auto;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }

      .floating-form-sidebar.show {
        transform: translateX(0);
      }

      .floating-form-close {
        position: absolute;
        top: 15px;
        right: 20px;
        font-size: 30px;
        cursor: pointer;
        color: #666;
        background: none;
        border: none;
        line-height: 1;
      }

      .floating-form-title {
        margin-bottom: 25px;
        color: #333;
        font-size: 24px;
        font-weight: 600;
      }

      .floating-form-group { margin-bottom: 15px; }

      .floating-form-label {
        display: block;
        margin-bottom: 5px;
        font-weight: 500;
        color: #555;
      }

      .floating-form-optional {
        font-weight: 400;
        font-size: 12px;
        color: #6b7280;
      }

      .floating-form-input,
      .floating-form-textarea {
        width: 100%;
        padding: 12px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 14px;
        box-sizing: border-box;
        font-family: inherit;
      }

      .floating-form-input:focus-visible,
      .floating-form-textarea:focus-visible {
        outline: 2px solid #1a5276;
        outline-offset: 1px;
      }

      .floating-form-textarea { resize: vertical; min-height: 100px; }

      .floating-form-hint {
        display: block;
        margin-top: 4px;
        font-size: 12px;
        color: #6b7280;
      }

      .floating-form-checkbox-wrapper { margin: 15px 0; }

      .floating-form-checkbox-label {
        display: flex;
        align-items: flex-start;
        font-size: 12px;
        line-height: 1.4;
        cursor: pointer;
      }

      .floating-form-checkbox { margin-right: 8px; margin-top: 2px; }

      .floating-form-submit {
        width: 100%;
        padding: 12px;
        background: linear-gradient(135deg, #1a5276 0%, #154360 100%);
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 16px;
        transition: opacity 0.3s;
        font-family: inherit;
      }

      .floating-form-submit:disabled { opacity: 0.6; cursor: not-allowed; }

      .floating-form-status {
        margin-top: 12px;
        padding: 12px;
        border-radius: 4px;
        font-size: 14px;
        line-height: 1.5;
      }

      .floating-form-status:empty { display: none; }

      .floating-form-status a { color: inherit; font-weight: 600; }

      .floating-form-status--pending { background: #f0f0f0; color: #444; }
      .floating-form-status--ok { background: #e8f5e9; color: #1b5e20; }
      .floating-form-status--error { background: #fdecea; color: #8c1c13; }

      .floating-form-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.5);
        z-index: 10000;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.3s ease, visibility 0.3s ease;
      }

      .floating-form-overlay.show { opacity: 1; visibility: visible; }

      /* Inline mode: the same fields, no fixed positioning or chrome. */
      .floating-form-inline {
        background: #fff;
        border: 1px solid #e3e6e8;
        border-radius: 8px;
        padding: 28px;
        box-shadow: 0 2px 12px rgba(0,0,0,0.06);
      }

      @media (max-width: 768px) {
        .floating-form-sidebar { width: 100%; padding: 24px 20px; }
        .floating-form-button { left: 15px; bottom: 15px; padding: 12px 16px; }
        .floating-form-inline { padding: 20px; }
      }

      @media (prefers-reduced-motion: reduce) {
        .floating-form-sidebar,
        .floating-form-overlay,
        .floating-form-button { transition: none; }
      }
    `;

    const styleSheet = document.createElement("style");
    styleSheet.id = "floating-form-styles";
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
  }

  // The field set is shared by both modes. Names are unchanged from the
  // original form so the existing Sheet columns keep lining up.
  //
  // Country and company are deliberately NOT required, as of 2026-08-29. Seven
  // required fields is a lot to ask of a visitor who wants a price, and neither
  // of these is needed to answer them: the Apps Script only insists on an email
  // or a phone number, and the sales desk can ask for the rest in the reply.
  // Both are still sent, and still get their Sheet column - an unfilled one
  // simply arrives empty. See the lead review task for what this is being
  // measured against.
  fieldsMarkup() {
    return `
      <form class="floating-form-form" novalidate>
        <div class="floating-form-group">
          <label class="floating-form-label" for="${this.id}-country">Country <span class="floating-form-optional">(optional)</span></label>
          <input type="text" id="${this.id}-country" name="country" class="floating-form-input" autocomplete="country-name">
        </div>
        <div class="floating-form-group">
          <label class="floating-form-label" for="${this.id}-name">Name*</label>
          <input type="text" id="${this.id}-name" name="name" class="floating-form-input" autocomplete="name" required>
        </div>
        <div class="floating-form-group">
          <label class="floating-form-label" for="${this.id}-company">Company <span class="floating-form-optional">(optional)</span></label>
          <input type="text" id="${this.id}-company" name="company" class="floating-form-input" autocomplete="organization">
        </div>
        <div class="floating-form-group">
          <label class="floating-form-label" for="${this.id}-phone">Mobile Number*</label>
          <input type="tel" id="${this.id}-phone" name="phone" class="floating-form-input" autocomplete="tel" required>
        </div>
        <div class="floating-form-group">
          <label class="floating-form-label" for="${this.id}-email">E-Mail*</label>
          <input type="email" id="${this.id}-email" name="email" class="floating-form-input" autocomplete="email" required>
        </div>
        <div class="floating-form-group">
          <label class="floating-form-label" for="${this.id}-quantity">Quantity</label>
          <input type="text" id="${this.id}-quantity" name="quantity" class="floating-form-input"
            placeholder="e.g. 500 kg, 20 sheets, 2 MT">
          <small class="floating-form-hint">Approximate is fine &mdash; it helps us quote accurately.</small>
        </div>
        <div class="floating-form-group">
          <label class="floating-form-label" for="${this.id}-inquiry">Inquiry*</label>
          <textarea id="${this.id}-inquiry" name="inquiry" rows="4" class="floating-form-textarea" required
            placeholder="Grade, form and dimensions - e.g. Inconel 625 sheet, 3mm x 1000 x 2000">${prefillInquiry()}</textarea>
          <small class="floating-form-hint">Add the dimensions you need &mdash; e.g. 3mm &times; 1000 &times; 2000.</small>
        </div>
        <div class="floating-form-checkbox-wrapper">
          <label class="floating-form-checkbox-label" for="${this.id}-privacy">
            <input type="checkbox" id="${this.id}-privacy" name="privacy" class="floating-form-checkbox" required>
            <span>I hereby accept the <a href="/privacy/" target="_blank" rel="noopener">privacy policy</a> and I am
            aware that I am using this form to send personal information!</span>
          </label>
        </div>
        <button type="submit" class="floating-form-submit">Submit Inquiry</button>
        <div class="floating-form-status" role="status" aria-live="polite"></div>
      </form>
    `;
  }

  createFloating() {
    this.id = "rfq-floating";

    this.overlay = document.createElement("div");
    this.overlay.className = "floating-form-overlay";
    this.overlay.hidden = true;

    this.button = document.createElement("button");
    this.button.type = "button";
    this.button.className = "floating-form-button";
    this.button.setAttribute("aria-haspopup", "dialog");
    this.button.setAttribute("aria-expanded", "false");
    this.button.innerHTML = `
      <i class="fas fa-comment-dots" aria-hidden="true"></i>
      <span>${this.config.buttonText}</span>
    `;

    this.sidebar = document.createElement("div");
    this.sidebar.className = "floating-form-sidebar";
    this.sidebar.setAttribute("role", "dialog");
    this.sidebar.setAttribute("aria-modal", "true");
    this.sidebar.setAttribute("aria-label", this.config.formTitle);
    this.sidebar.innerHTML = `
      <button class="floating-form-close" type="button" aria-label="Close enquiry form">&times;</button>
      <h3 class="floating-form-title">${this.config.formTitle}</h3>
      ${this.fieldsMarkup()}
    `;

    document.body.append(this.overlay, this.button, this.sidebar);
    this.form = this.sidebar.querySelector(".floating-form-form");

    this.button.addEventListener("click", () => this.toggle());
    this.sidebar
      .querySelector(".floating-form-close")
      .addEventListener("click", () => this.close());
    this.overlay.addEventListener("click", () => this.close());

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.isVisible) this.close();
    });
  }

  createInline() {
    const container = document.querySelector(this.config.mount);
    if (!container) return;

    this.id = container.id || "rfq-inline";
    container.classList.add("floating-form-inline");
    container.innerHTML = `
      <h2 class="floating-form-title">${this.config.formTitle}</h2>
      ${this.fieldsMarkup()}
    `;
    this.form = container.querySelector(".floating-form-form");
  }

  bindFormEvents() {
    this.form.addEventListener("submit", (event) => this.handleSubmit(event));

    // form_start marks the point where someone begins filling the form. The gap
    // between form_start and generate_lead is the abandonment rate, which is
    // the number that tells you whether the field set is the problem.
    this.form.addEventListener(
      "input",
      () => {
        if (this.hasStarted) return;
        this.hasStarted = true;
        track(EVENTS.formStart, {
          form_location: this.config.mode,
          page_path: window.location.pathname,
        });
      },
      { once: false }
    );
  }

  toggle() {
    if (this.isVisible) this.close();
    else this.open();
  }

  open() {
    this.isVisible = true;
    this.overlay.hidden = false;
    this.overlay.classList.add("show");
    this.sidebar.classList.add("show");
    this.button.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
    this.sidebar.querySelector(".floating-form-input")?.focus();
  }

  close() {
    this.isVisible = false;
    this.overlay.classList.remove("show");
    this.sidebar.classList.remove("show");
    this.button.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
    // Keep the overlay out of the accessibility tree once it has faded.
    window.setTimeout(() => {
      if (!this.isVisible) this.overlay.hidden = true;
    }, 300);
  }

  // Opens the panel with the enquiry textarea already written out. Used by a CTA
  // that knows exactly what the visitor wants - the weight calculator hands over
  // the material, form, size and computed weight - so they land on a form that
  // is half-filled instead of being sent through a page reload to the contact
  // page. Floating mode only; the inline form is always open already.
  openWith(text) {
    if (this.config.mode !== "floating") return;
    const textarea = this.form?.querySelector('textarea[name="inquiry"]');
    if (textarea && text) textarea.value = text;
    this.open();
  }

  setStatus(element, variant, html) {
    element.className = `floating-form-status floating-form-status--${variant}`;
    element.innerHTML = html;
  }

  // Turns a failed submission into a WhatsApp message that already contains
  // everything the visitor typed, so the enquiry survives the outage.
  fallbackMarkup(data) {
    // Every optional field is conditional, not just quantity: a template
    // literal is truthy even when the value inside it is empty, so an
    // unconditional line here would put a bare "Company:" into the WhatsApp
    // message the moment those two fields stopped being required.
    const body = [
      "Enquiry from nickelsheets.com",
      `Name: ${data.name}`,
      data.company ? `Company: ${data.company}` : null,
      data.country ? `Country: ${data.country}` : null,
      `Email: ${data.email}`,
      `Phone: ${data.phone}`,
      data.quantity ? `Quantity: ${data.quantity}` : null,
      `Page: ${data.page_url}`,
      "",
      data.inquiry,
    ]
      .filter(Boolean)
      .join("\n");

    const whatsapp = `https://api.whatsapp.com/send?phone=${FALLBACK_CONTACT.whatsapp}&text=${encodeURIComponent(body)}`;
    const mail = `mailto:${FALLBACK_CONTACT.email}?subject=${encodeURIComponent("Enquiry from nickelsheets.com")}&body=${encodeURIComponent(body)}`;

    return `We could not submit the form just now. Your enquiry is not lost -
      <a href="${whatsapp}" target="_blank" rel="noopener">send it on WhatsApp</a> or
      <a href="${mail}">email it to us</a>, both already filled in.`;
  }

  async handleSubmit(event) {
    event.preventDefault();

    const form = event.target;
    const submitBtn = form.querySelector(".floating-form-submit");
    const status = form.querySelector(".floating-form-status");

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    submitBtn.disabled = true;
    this.setStatus(status, "pending", "Submitting&hellip;");

    // FormData rather than form.country / form.name: the named-getter route
    // works, but one of the fields is called "name", which collides with
    // HTMLFormElement's own name property and only resolves correctly because
    // of a legacy override rule. Reading the values explicitly avoids relying
    // on that.
    const fields = new FormData(form);
    const value = (key) => (fields.get(key) || "").toString().trim();

    const attribution = captureAttribution();
    const payload = {
      country: value("country"),
      name: value("name"),
      // company and quantity map onto the CRM's contact.company and
      // interest.quantity. Both arrive empty until the Sheet gains matching
      // columns - the Apps Script drops keys it has no column for.
      company: value("company"),
      phone: value("phone"),
      email: value("email"),
      quantity: value("quantity"),
      inquiry: value("inquiry"),
      privacy: fields.get("privacy") ? "Accepted" : "Not Accepted",
      timestamp: new Date().toISOString(),
      // Kept for backwards compatibility with the existing Sheet column.
      page: window.location.pathname,
      // Context the sales team needs to quote without a round trip, and that
      // the CRM maps onto interest.product_name.
      page_url: window.location.href,
      page_title: document.title,
      form_location: this.config.mode,
      ...attribution,
    };

    try {
      const { status: outcome } = await dispatch(payload);

      if (outcome === "verified") {
        track(EVENTS.leadSubmitted, {
          form_location: this.config.mode,
          page_path: window.location.pathname,
          country: payload.country,
        });
      } else {
        // Delivered, but the endpoint did not confirm it. Almost always means
        // the Apps Script predates the CORS-aware deployment; watch this event
        // in GA4 after any change to the Apps Script.
        track(EVENTS.leadUnverified, {
          form_location: this.config.mode,
          page_path: window.location.pathname,
        });
      }

      this.setStatus(
        status,
        "ok",
        "Thank you - your enquiry has reached us. We reply to every enquiry within one working day."
      );
      form.reset();
      this.hasStarted = false;

      if (this.config.mode === "floating") {
        window.setTimeout(() => this.close(), 4000);
      }
    } catch (error) {
      console.error("Lead submission failed:", error);
      track(EVENTS.leadFailed, {
        form_location: this.config.mode,
        page_path: window.location.pathname,
      });
      this.setStatus(status, "error", this.fallbackMarkup(payload));
    } finally {
      submitBtn.disabled = false;
    }
  }

  destroy() {
    this.button?.remove();
    this.sidebar?.remove();
    this.overlay?.remove();
    document.getElementById("floating-form-styles")?.remove();
  }
}

/* ------------------------------------------------------------------ *
 * Contact-link tracking
 * ------------------------------------------------------------------ */

// The header rail, the footer and the fallback state all offer WhatsApp, phone
// and email. Those are enquiries too, and until now none of them were counted -
// GA4 had no idea which of the 758 pages produced contact of any kind.
function trackContactClicks() {
  document.addEventListener(
    "click",
    (event) => {
      const link = event.target.closest("a[href]");
      if (!link) return;

      const href = link.getAttribute("href") || "";
      let method = null;

      if (href.includes("wa.me") || href.includes("api.whatsapp.com")) method = "whatsapp";
      else if (href.startsWith("tel:")) method = "phone";
      else if (href.startsWith("mailto:")) method = "email";

      if (!method) return;

      track(EVENTS.contactClick, {
        method,
        page_path: window.location.pathname,
        link_text: (link.textContent || "").trim().slice(0, 100),
      });
    },
    // Capture phase, so the event is recorded even if something downstream
    // stops propagation before it bubbles to the document.
    true
  );
}

/* ------------------------------------------------------------------ *
 * WhatsApp deep-link seeding
 * ------------------------------------------------------------------ */

// The header rail carries a static WhatsApp link, rendered identically onto
// every page by the shared include, so on its own it opens a blank chat and the
// sales desk learns nothing about what the visitor was looking at. Seed it at
// runtime with the same subject the enquiry form uses - an explicit ?enquiry=
// CTA first, then the page's breadcrumb - plus the page URL, so a visitor who
// reaches for WhatsApp instead of the form still arrives with the enquiry
// half-written. This is the WhatsApp half of prefillInquiry, and it reuses the
// same derivation on purpose: document.title is not used here for the same
// reason it is not used there - marketing tails, entity escapes and mojibake.
//
// The number lives only in the markup (and lead-config's FALLBACK_CONTACT); it
// is never written here, so this cannot send leads to the wrong phone.
function seedWhatsAppLinks() {
  const subject = ctaEnquiry() || derivedSubject();
  const body = [
    subject
      ? `Hello Aurico Alloys, I would like a quote for: ${subject}`
      : "Hello Aurico Alloys, I would like a quote.",
    "",
    `Page: ${window.location.href}`,
  ].join("\n");
  const text = encodeURIComponent(body);

  // Runs once at start(). On the runtime product route the header is injected
  // after this fires, so that one page's rail link keeps its blank chat - it
  // still works, it just is not seeded, which is a graceful miss rather than a
  // break.
  document
    .querySelectorAll('a[href*="api.whatsapp.com"], a[href*="wa.me"]')
    .forEach((link) => {
      const href = link.getAttribute("href") || "";
      // A link that already carries its own message says more than this generic
      // seed - the failed-submission fallback builds one - so leave it be.
      if (/[?&]text=/.test(href)) return;
      const separator = href.includes("?") ? "&" : "?";
      link.setAttribute("href", `${href}${separator}text=${text}`);
    });
}

/* ------------------------------------------------------------------ *
 * Bootstrap
 * ------------------------------------------------------------------ */

// The module is referenced by the shared footer include and, on many pages, by
// a second script tag left over from before. Modules are deduplicated by
// resolved URL, so this still runs exactly once per page - but the guard makes
// that explicit rather than incidental.
function start() {
  if (window.floatingFormLoaded) return;
  window.floatingFormLoaded = true;

  captureAttribution();
  trackContactClicks();
  seedWhatsAppLinks();

  // The contact page (and any other page that wants the form in the flow of the
  // content) opts in by placing an empty <div id="rfq-form"> where it belongs.
  const inlineMount = document.getElementById("rfq-form");
  if (inlineMount) {
    window.inlineForm = new FloatingForm({
      mode: "inline",
      mount: "#rfq-form",
      formTitle: inlineMount.dataset.title || "Request a Quotation",
    });
  }

  window.floatingForm = new FloatingForm();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
