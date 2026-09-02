// lead-config.js - every destination and tracking name the enquiry form uses.
//
// This is the only file to edit when leads should go somewhere else.
//
// NOTHING SECRET GOES IN THIS FILE. It is served to the browser like any other
// static asset, so anything written here is public. The CRM bearer token in
// particular must never appear in this file, in any other file under
// /javascript, or anywhere else in this repository - the repo backs a GitHub
// Pages site and anyone who can read the token can file fake enquiries.
//
// The CRM webhook cannot be called from the browser at all: it answers the
// OPTIONS preflight with 401 and no CORS headers, by design. Reaching it needs
// a server-side hop that holds the token and forwards the lead. That hop is not
// built yet - when it is, add it to the list below as a same-origin URL.

export const LEAD_ENDPOINTS = [
  {
    // Google Apps Script -> Google Sheet. Currently the only destination, and
    // the store of record for every enquiry.
    name: "sheet",
    url: "https://script.google.com/macros/s/AKfycbwzxL3Z3fxIWCnQO6EyEu1r3_QttTFE1uLkl3tx8QpCoGecyohNy1lK-mIHXlJFRwM9/exec",
    enabled: true,
  },
];

// Shown when every endpoint fails, so a broken pipe turns into a WhatsApp
// message instead of a lost enquiry.
export const FALLBACK_CONTACT = {
  whatsapp: "917977886611",
  email: "info@auricoalloys.com",
};

// GA4 event names. generate_lead is a GA4 recommended event, so it can be
// marked as a key event in the GA4 UI with no custom definition needed.
export const EVENTS = {
  formStart: "form_start",
  leadSubmitted: "generate_lead",
  leadUnverified: "form_submit_unverified",
  leadFailed: "form_submit_error",
  contactClick: "contact_click",
  // Fired when a visitor turns a weight-calculator result into an enquiry, so
  // the calculator -> RFQ funnel is measurable rather than a hunch.
  calculatorQuote: "calculator_quote_click",
};
