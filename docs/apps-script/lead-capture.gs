/**
 * Aurico Alloys - website enquiry capture, with CRM delivery.
 *
 * Receives enquiries from javascript/floating-form.js, writes them to a sheet,
 * forwards them to the Smart Tech CRM, and optionally emails the sales desk.
 *
 * Columns are driven by the payload: any key the form sends that has no column
 * yet gets one added, so adding a field to the form never needs a change here.
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

    // A lead with no arrival time is much harder to chase, and the browser does
    // not always send one.
    if (!data.timestamp) {
      data.timestamp = new Date().toISOString();
    }

    // Declared before syncHeaders so the columns exist on the row we are about
    // to append; the real values are written back once the CRM has answered.
    data.crm_status = 'pending';
    data.crm_id = '';
    data.crm_error = '';

    var sheet = getSheet();
    var headers = syncHeaders(sheet, data);

    var row = headers.map(function (key) {
      var value = data[key];
      return value === undefined || value === null ? '' : String(value);
    });

    sheet.appendRow(row);
    var rowNumber = sheet.getLastRow();

    // The lead is safe from here on. Everything below is best-effort.
    writeCrmStatus(sheet, headers, rowNumber, pushToCrm(data, rowNumber));

    notify(data, rowNumber);

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

function getSheet() {
  var book = SpreadsheetApp.getActiveSpreadsheet();

  // Only true if this script was detached from its spreadsheet, which turns
  // every later call into a confusing null error.
  if (!book) {
    throw new Error(
      'No bound spreadsheet. Open the Sheet and use Extensions -> Apps Script.'
    );
  }

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

/* ------------------------------------------------------------------ *
 * CRM
 * ------------------------------------------------------------------ */

/** The CRM accepts null for every field except external_id; '' is not null. */
function orNull(value) {
  if (value === undefined || value === null) return null;
  var text = String(value).trim();
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
  // The customer types one free-text requirement; the page they were on is the
  // best available product name, since the form does not ask for a product id.
  var attribution = [
    data.page_url || data.page ? 'Page: ' + (data.page_url || data.page) : null,
    data.utm_campaign ? 'Campaign: ' + data.utm_campaign : null,
    data.utm_source ? 'Source: ' + data.utm_source : null,
    data.referrer ? 'Referrer: ' + data.referrer : null
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
      product_name: orNull(data.page_title),
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
