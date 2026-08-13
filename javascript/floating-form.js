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
  fieldsMarkup() {
    return `
      <form class="floating-form-form" novalidate>
        <div class="floating-form-group">
          <label class="floating-form-label" for="${this.id}-country">Country*</label>
          <input type="text" id="${this.id}-country" name="country" class="floating-form-input" autocomplete="country-name" required>
        </div>
        <div class="floating-form-group">
          <label class="floating-form-label" for="${this.id}-name">Name*</label>
          <input type="text" id="${this.id}-name" name="name" class="floating-form-input" autocomplete="name" required>
        </div>
        <div class="floating-form-group">
          <label class="floating-form-label" for="${this.id}-company">Company*</label>
          <input type="text" id="${this.id}-company" name="company" class="floating-form-input" autocomplete="organization" required>
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
            placeholder="Grade, form and dimensions - e.g. Inconel 625 sheet, 3mm x 1000 x 2000"></textarea>
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

  setStatus(element, variant, html) {
    element.className = `floating-form-status floating-form-status--${variant}`;
    element.innerHTML = html;
  }

  // Turns a failed submission into a WhatsApp message that already contains
  // everything the visitor typed, so the enquiry survives the outage.
  fallbackMarkup(data) {
    const body = [
      "Enquiry from nickelsheets.com",
      `Name: ${data.name}`,
      `Company: ${data.company}`,
      `Country: ${data.country}`,
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
