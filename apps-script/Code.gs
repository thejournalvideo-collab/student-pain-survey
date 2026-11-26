/**
 * Student Pain Point Survey: receives answers and stores them in this Google Sheet.
 *
 * Setup (once):
 * 1. Make a new Google Sheet. Extensions > Apps Script. Replace everything with this file. Save.
 * 2. Project Settings (gear) > Script properties > Add: READ_KEY = any long random text.
 *    (Claude uses this key to read the results. Keep it private.)
 * 3. Deploy > New deployment > type "Web app". Execute as: Me. Who has access: Anyone. Deploy, allow access.
 * 4. Copy the Web app URL (ends in /exec) and give it to Claude.
 */
var SHEET = "Responses";
var HEADERS = ["Received", "Respondent ID", "Survey version", "Source", "Subject area", "Tried a project",
  "Rank count", "Ranking (JSON)", "Custom added (JSON)", "Unranked (JSON)",
  "#1", "#2", "#3", "#4", "#5", "Sex"];

// Works whether the script was opened from a Sheet or on its own (then it makes its own Sheet once)
function spreadsheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) return ss;
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty("SHEET_ID");
  if (id) return SpreadsheetApp.openById(id);
  ss = SpreadsheetApp.create("Student Pain Point Survey - Responses");
  props.setProperty("SHEET_ID", ss.getId());
  return ss;
}

function sheet_() {
  var ss = spreadsheet_();
  var sh = ss.getSheetByName(SHEET);
  if (!sh) { sh = ss.insertSheet(SHEET); sh.appendRow(HEADERS); sh.setFrozenRows(1); }
  // Older sheets: add any header that is missing at the end (e.g. "Sex")
  if (sh.getLastColumn() < HEADERS.length) sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  return sh;
}

// Text only, short, and never a spreadsheet formula
function clean_(v, max) {
  var s = String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max || 80);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
function cleanList_(a, maxItems) {
  if (!Array.isArray(a)) return [];
  return a.slice(0, maxItems || 40).map(function (x) { return clean_(x, 60); }).filter(String);
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var d = JSON.parse(e.postData.contents);
    var id = clean_(d.respondentId, 64);
    var ranking = cleanList_(d.ranking);
    if (!id || ranking.length < 3) return json_({ ok: false, error: "invalid" });
    var row = [new Date(), id, clean_(d.surveyVersion, 20), clean_(d.source, 20), clean_(d.subject, 60), clean_(d.triedProject, 30),
      ranking.length, JSON.stringify(ranking), JSON.stringify(cleanList_(d.customAdded, 10)), JSON.stringify(cleanList_(d.unranked)),
      ranking[0] || "", ranking[1] || "", ranking[2] || "", ranking[3] || "", ranking[4] || "", clean_(d.sex, 30)];
    var sh = sheet_();
    // One answer per person: a repeat submission replaces their earlier row
    var ids = sh.getLastRow() > 1 ? sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues() : [];
    for (var i = 0; i < ids.length; i++) {
      if (ids[i][0] === id) { sh.getRange(i + 2, 1, 1, row.length).setValues([row]); return json_({ ok: true, updated: true }); }
    }
    sh.appendRow(row);
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: "server", detail: String(err && err.message || err).slice(0, 200) });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

// Read all answers: GET <url>?key=READ_KEY
function doGet(e) {
  var key = PropertiesService.getScriptProperties().getProperty("READ_KEY");
  if (!key || !e || !e.parameter || e.parameter.key !== key) return json_({ ok: false, error: "forbidden" });
  var values = sheet_().getDataRange().getValues();
  var head = values.shift();
  var rows = values.map(function (r) {
    return {
      received: r[0], source: r[3], subject: r[4], triedProject: r[5], sex: r[15] || "",
      ranking: JSON.parse(r[7] || "[]"), customAdded: JSON.parse(r[8] || "[]"), surveyVersion: r[2]
    };
  });
  return json_({ ok: true, count: rows.length, rows: rows });
}
