/**
 * RSVP and gift receiver for the wedding site.
 *
 * Paste this into Extensions → Apps Script on the Google Sheet that should
 * collect replies, then deploy it as a web app (see README.md in this folder).
 *
 *  - RSVPs are appended to the "RSVPs" tab.
 *  - Paystack gifts are verified with Paystack, then appended to the "Gifts" tab.
 *    This needs the PAYSTACK_SECRET_KEY script property (see README.md).
 */

var RSVP_SHEET = 'RSVPs';
var RSVP_HEADERS = ['Received', 'Full name', 'Phone number'];

var GIFT_SHEET = 'Gifts';
var GIFT_HEADERS = ['Paid at', 'Guest name', 'Email', 'Amount (₦)', 'Note', 'Channel', 'Reference'];
var GIFT_REFERENCE_COL = 7;

function doPost(e) {
  try {
    var p = (e && e.parameter) || {};
    if (p.type === 'gift') return json(handleGift(p));
    return json(handleRsvp(p));
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

// Lets you open the web-app URL in a browser to confirm it is live.
function doGet() {
  return json({ ok: true, message: 'RSVP endpoint is running.' });
}

// — RSVPs —

function handleRsvp(p) {
  // Honeypot: the hidden "website" field is always empty for real guests.
  // Report success so bots don't retry, but don't save anything.
  if (clean(p.website, 200)) return { ok: true };

  var name = clean(p.name, 120);
  var phone = clean(p.phone, 40);
  if (!name || !phone) return { ok: false, error: 'Missing name or phone number.' };

  return withLock(function () {
    getSheet(RSVP_SHEET, RSVP_HEADERS).appendRow([new Date(), asText(name), asText(phone)]);
    return { ok: true };
  });
}

// — Paystack gifts —

function handleGift(p) {
  var reference = clean(p.reference, 100);
  if (!/^[\w.\-=]+$/.test(reference)) return { ok: false, error: 'Missing or invalid reference.' };

  var secret = PropertiesService.getScriptProperties().getProperty('PAYSTACK_SECRET_KEY');
  if (!secret) return { ok: false, error: 'PAYSTACK_SECRET_KEY is not set.' };

  // Ask Paystack directly whether this payment succeeded. The page's word alone
  // isn't trusted, so nobody can add made-up gifts to the sheet.
  var res = UrlFetchApp.fetch(
    'https://api.paystack.co/transaction/verify/' + encodeURIComponent(reference),
    { headers: { Authorization: 'Bearer ' + secret }, muteHttpExceptions: true }
  );
  var body = JSON.parse(res.getContentText() || '{}');
  var tx = body && body.data;
  if (res.getResponseCode() !== 200 || !body.status || !tx || tx.status !== 'success') {
    return { ok: false, error: 'Payment not confirmed by Paystack.' };
  }

  var name = clean(p.name, 120) || metaField(tx, 'guest_name');
  var note = clean(p.note, 500) || metaField(tx, 'note');
  if (note === '-') note = '';
  var email = (tx.customer && tx.customer.email) || clean(p.email, 200);
  var amount = tx.amount / 100;

  return withLock(function () {
    var sheet = getSheet(GIFT_SHEET, GIFT_HEADERS);

    // Skip if this payment was already logged (e.g. the page posted twice).
    var last = sheet.getLastRow();
    if (last > 1) {
      var found = sheet
        .getRange(2, GIFT_REFERENCE_COL, last - 1, 1)
        .createTextFinder(tx.reference)
        .matchEntireCell(true)
        .findNext();
      if (found) return { ok: true, duplicate: true };
    }

    sheet.appendRow([
      new Date(tx.paid_at || tx.paidAt || Date.now()),
      asText(name),
      asText(email),
      amount,
      asText(note),
      tx.channel || '',
      tx.reference,
    ]);
    sheet.getRange(sheet.getLastRow(), 4).setNumberFormat('#,##0.00');
    return { ok: true };
  });
}

function metaField(tx, key) {
  var fields = (tx.metadata && tx.metadata.custom_fields) || [];
  for (var i = 0; i < fields.length; i++) {
    if (fields[i].variable_name === key) return clean(fields[i].value, 500);
  }
  return '';
}

// — helpers —

function withLock(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function getSheet(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  return sheet;
}

function clean(value, maxLen) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

// Store values as plain text: keeps a leading "+" or "0" on phone numbers and
// stops anything starting with = + - @ from being run as a spreadsheet formula.
function asText(value) {
  if (!value) return value;
  return /^[=+\-@]/.test(value) || /^\d/.test(value) ? "'" + value : value;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
