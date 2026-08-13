/**
 * Aurico Alloys - website enquiry capture.
 *
 * Receives enquiries from javascript/floating-form.js, writes them to a sheet,
 * and optionally emails the sales desk. Replaces the earlier script, which had
 * a fixed set of columns and silently discarded any field it did not recognise
 * - which is how "company" and "quantity" would otherwise vanish.
 *
 * This version reads the keys off the payload and adds a column for anything it
 * has not seen before, so adding a field to the form never again needs a change
 * here. Nothing is dropped.
 *
 * ---------------------------------------------------------------------------
 * SETUP
 * ---------------------------------------------------------------------------
 * 1. Open the Google Sheet that should hold the leads.
 * 2. Extensions -> Apps Script. Delete whatever is there, paste this in.
 * 3. Deploy -> New deployment -> type "Web app".
 *      Execute as:      Me
 *      Who has access:  Anyone            <- required, or the browser gets a 401
 * 4. Copy the /exec URL into LEAD_ENDPOINTS in javascript/lead-config.js.
 * 5. Optional, for the email alert:
 *      Project Settings -> Script Properties -> add NOTIFY_EMAIL = you@domain
 *
 * Re-deploy as a NEW VERSION after any edit, or the old code keeps serving.
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

    var data = JSON.parse(e.postData.contents);

    if (!data.email && !data.phone) {
      return jsonReply({ ok: false, error: 'Enquiry needs an email or a phone number' });
    }

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

  var subject = 'Website enquiry #' + rowNumber +
    (data.company ? ' - ' + data.company : '') +
    (data.country ? ' (' + data.country + ')' : '');

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
