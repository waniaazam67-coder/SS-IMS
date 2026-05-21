const SHEET_NAME = "Requisitions";

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const route = String(params.page || params.action || params.route || params.mode || "").toLowerCase();

  if (route === "print" || params.id) {
    return renderPrintPage(params.id || params.requestId || "");
  }

  return HtmlService.createHtmlOutputFromFile("Form")
    .setTitle("Requisition Form")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  const payload = parsePayload_(e);
  const requestId = payload.requestId || createRequestId_();
  const sheet = getRequisitionSheet_();
  ensureHeaders_(sheet);

  const items = Array.isArray(payload.items) ? payload.items : [];
  const now = new Date();

  items.forEach(function(item, index) {
    sheet.appendRow([
      requestId,
      now,
      payload.requestedBy || "",
      payload.email || payload.requesterEmail || "",
      payload.lineManagerEmail || "",
      Array.isArray(payload.ccEmails) ? payload.ccEmails.join(", ") : "",
      payload.department || "",
      payload.location || "",
      payload.requestDate || "",
      payload.selectedCategory || "",
      index + 1,
      item.requestType || "",
      item.category || "",
      item.itemName || "",
      item.type || "",
      item.itemID || "",
      item.qty || "",
      item.description || "",
      item.transportRequestType || "",
      item.transportDate || "",
      item.destination || "",
      item.departureTime || "",
      item.duration || "",
      item.vehicleType || "",
      item.passengers || "",
      item.purpose || "",
      item.pickupLocation || "",
      item.dropoffLocation || "",
      item.goodsDescription || "",
      item.goodsQuantity || "",
      item.advanceRequired || "",
      item.returnDate || "",
      item.returnTime || ""
    ]);
  });

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, requestId: requestId }))
    .setMimeType(ContentService.MimeType.JSON);
}

function getRequisitionById(requestId) {
  if (!requestId) {
    return null;
  }

  const sheet = getRequisitionSheet_();
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return null;
  }

  const headers = values[0].map(function(header) {
    return String(header).trim();
  });
  const rows = values.slice(1).map(function(row) {
    return rowToObject_(headers, row);
  }).filter(function(row) {
    return String(readField_(row, ["Request ID", "RequestId", "requestId"]) || "").trim() === requestId;
  });

  if (!rows.length) {
    return null;
  }

  const first = rows[0];

  return {
    requestId: requestId,
    requestedBy: readField_(first, ["Requested By", "requestedBy"]) || "",
    requestDate: readField_(first, ["Request Date", "requestDate"]) || "",
    department: readField_(first, ["Department", "department"]) || "",
    budgetLine: readField_(first, ["Budget Line", "budgetLine"]) || "",
    purpose: buildPurpose_(first),
    items: extractPrintItems_(rows)
  };
}

function renderPrintPage(requestId) {
  const request = getRequisitionById(requestId);

  if (!request) {
    return HtmlService.createHtmlOutput(
      '<!doctype html><html><head><meta charset="UTF-8"><title>Request not found</title>' +
      '<style>body{font-family:Arial,sans-serif;padding:40px;color:#222}.message{max-width:680px;margin:60px auto;border:1px solid #ddd;padding:24px}button{padding:10px 16px}</style>' +
      '</head><body><div class="message"><h1>Request not found</h1><p>The Request ID is missing or was not found in the sheet.</p><p><strong>Request ID:</strong> ' + escapeHtml_(requestId || "") + '</p></div></body></html>'
    ).setTitle("Request not found");
  }

  return HtmlService.createHtmlOutput(buildPrintHtml_(request))
    .setTitle("Purchase/Work Request Form");
}

function buildPrintHtml_(request) {
  const rows = [];
  const items = Array.isArray(request.items) ? request.items.slice(0, 14) : [];

  for (let i = 0; i < 14; i++) {
    const item = items[i] || {};
    rows.push(
      "<tr>" +
      "<td class=\"sno\">" + (i + 1) + "</td>" +
      "<td>" + escapeHtml_(item.particular || "") + "</td>" +
      "<td>" + escapeHtml_(item.specification || "") + "</td>" +
      "<td>" + escapeHtml_(item.quantity || "") + "</td>" +
      "<td>" + escapeHtml_(item.comment || "") + "</td>" +
      "</tr>"
    );
  }

  return '<!doctype html><html><head><meta charset="UTF-8"><title>Purchase/Work Request Form</title>' +
    '<style>' +
    '@page{size:A4 portrait;margin:12mm}' +
    '*{box-sizing:border-box}' +
    'body{margin:0;background:#f2f2f2;color:#111;font-family:Arial,Helvetica,sans-serif}' +
    '.toolbar{display:flex;justify-content:center;gap:10px;padding:14px}' +
    '.toolbar button{border:0;background:#1f2937;color:#fff;border-radius:6px;padding:10px 18px;font-weight:700;cursor:pointer}' +
    '.sheet{width:210mm;min-height:297mm;margin:0 auto 20px;background:#fff;padding:11mm 10mm 10mm;border:1px solid #ddd}' +
    '.header{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:16px}' +
    'h1{display:inline-block;margin:0;font-size:26px;letter-spacing:1px;font-weight:900;border-bottom:8px solid #ddd;line-height:1.05}' +
    '.logo-mark{width:54px;height:54px;border-radius:50%;border:3px solid #222;display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:900;color:#444}' +
    '.top-grid{display:grid;grid-template-columns:1.35fr .9fr;gap:20px 34px;margin-top:8px;font-size:15px}' +
    '.field{display:flex;align-items:flex-end;gap:8px;min-height:32px}' +
    '.label{font-weight:800;white-space:nowrap}' +
    '.line{border-bottom:1.5px solid #111;min-height:22px;flex:1;padding:0 4px;overflow-wrap:anywhere}' +
    '.hint{display:block;font-size:12px;font-style:italic;font-weight:400;margin-top:2px}' +
    '.purpose{grid-column:1/-1;align-items:flex-start}' +
    '.purpose .line{min-height:42px}' +
    'table{width:100%;border-collapse:collapse;margin-top:20px;table-layout:fixed;font-size:13px}' +
    'th,td{border:1px solid #777;padding:5px 6px;vertical-align:top;overflow-wrap:anywhere;word-break:normal}' +
    'th{background:#eee;text-align:left;font-size:14px;font-weight:900}' +
    'td{height:37px;line-height:1.25}' +
    '.sno{width:7%;text-align:center;vertical-align:middle}' +
    '.particular{width:28%}.spec{width:30%}.qty{width:11%}.comment{width:24%}' +
    '.signatures{display:grid;grid-template-columns:1fr 1fr;gap:40px 70px;margin-top:24px;font-size:15px;font-weight:800}' +
    '.signature{display:flex;align-items:flex-end;gap:8px}' +
    '.signature .line{height:24px}' +
    '.role{display:block;text-align:center;font-size:12px;font-style:italic;font-weight:400;margin-top:3px}' +
    '@media print{body{background:#fff}.toolbar{display:none}.sheet{width:auto;min-height:auto;margin:0;border:0;padding:0}h1{font-size:25px}td{height:36px}.signatures{margin-top:22px}}' +
    '</style></head><body>' +
    '<div class="toolbar"><button onclick="window.print()">Print</button></div>' +
    '<main class="sheet">' +
    '<section class="header"><h1>PURCHASE/ WORK REQUEST FORM</h1><div class="logo-mark">S</div></section>' +
    '<section class="top-grid">' +
    fieldHtml_("Requested By:", request.requestedBy, "(Name and Designation)") +
    fieldHtml_("Date:", formatDate_(request.requestDate), "(dd/mm/yy)") +
    fieldHtml_("Department:", request.department, "") +
    fieldHtml_("Budget Line:", request.budgetLine, "(To be filled by Finance)") +
    '<div class="field purpose"><span class="label">Purpose of Requirement:</span><span class="line">' + escapeHtml_(request.purpose || "") + '</span></div>' +
    '</section>' +
    '<table><thead><tr><th class="sno">S No.</th><th class="particular">Particular</th><th class="spec">Complete Specification</th><th class="qty">Quantity Required</th><th class="comment">Comment</th></tr></thead><tbody>' +
    rows.join("") +
    '</tbody></table>' +
    '<section class="signatures">' +
    signatureHtml_("Requested by:", "Employee") +
    signatureHtml_("Verified by:", "Administration") +
    signatureHtml_("Authorised by:", "Finance") +
    signatureHtml_("Approved by:", "Executive Director") +
    '</section></main></body></html>';
}

function fieldHtml_(label, value, hint) {
  return '<div><div class="field"><span class="label">' + escapeHtml_(label) + '</span><span class="line">' + escapeHtml_(value || "") + '</span></div>' +
    (hint ? '<span class="hint">' + escapeHtml_(hint) + '</span>' : "") + '</div>';
}

function signatureHtml_(label, role) {
  return '<div><div class="signature"><span>' + escapeHtml_(label) + '</span><span class="line"></span></div><span class="role">(' + escapeHtml_(role) + ')</span></div>';
}

function buildPrintItem_(row) {
  const requestType = readField_(row, ["Request Type", "requestType"]) || "";
  const transportType = readField_(row, ["Transport Request Type", "transportRequestType"]) || "";
  const itemName = readField_(row, ["Item Name", "itemName"]) || "";
  const type = readField_(row, ["Type", "type"]) || "";
  const itemId = readField_(row, ["Item ID", "itemID"]) || "";
  const description = readField_(row, ["Description", "description"]) || "";
  const goods = readField_(row, ["Goods Description", "goodsDescription"]) || "";
  const qty = readField_(row, ["Quantity", "qty", "Goods Quantity", "goodsQuantity"]) || "";

  if (requestType === "transportation" || transportType) {
    return {
      particular: transportType || "Transportation",
      specification: compactJoin_([
        goods,
        readField_(row, ["Vehicle Type", "vehicleType"]),
        readField_(row, ["Pickup Location", "pickupLocation"]),
        readField_(row, ["Destination", "destination", "Dropoff Location", "dropoffLocation"]),
        readField_(row, ["Transport Date", "transportDate"]),
        readField_(row, ["Departure Time", "departureTime"])
      ]),
      quantity: qty,
      comment: readField_(row, ["Purpose", "purpose"]) || ""
    };
  }

  return {
    particular: itemName,
    specification: compactJoin_([type, itemId, description]),
    quantity: qty,
    comment: ""
  };
}

function extractPrintItems_(rows) {
  if (rows.length === 1) {
    const storedItems = readField_(rows[0], ["Items", "items", "Item Details", "itemDetails"]);

    if (storedItems) {
      try {
        const parsed = typeof storedItems === "string" ? JSON.parse(storedItems) : storedItems;

        if (Array.isArray(parsed)) {
          return parsed.map(buildPrintItem_);
        }
      } catch (error) {
        // Fall through to row-based rendering when the existing sheet stores readable item columns.
      }
    }
  }

  return rows.map(buildPrintItem_);
}

function buildPurpose_(row) {
  return readField_(row, ["Purpose of Requirement", "purposeOfRequirement", "Purpose", "purpose", "Selected Category", "selectedCategory", "Category", "category"]) || "";
}

function parsePayload_(e) {
  try {
    return JSON.parse(e.postData.contents || "{}");
  } catch (error) {
    return {};
  }
}

function getRequisitionSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  return spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.getSheets()[0] || spreadsheet.insertSheet(SHEET_NAME);
}

function ensureHeaders_(sheet) {
  if (sheet.getLastRow() > 0) {
    return;
  }

  sheet.appendRow([
    "Request ID", "Submitted At", "Requested By", "Requester Email", "Line Manager Email", "CC Emails",
    "Department", "Location", "Request Date", "Selected Category", "S No.", "Request Type", "Category",
    "Item Name", "Type", "Item ID", "Quantity", "Description", "Transport Request Type",
    "Transport Date", "Destination", "Departure Time", "Duration", "Vehicle Type", "Passengers",
    "Purpose", "Pickup Location", "Dropoff Location", "Goods Description", "Goods Quantity",
    "Advance Required", "Return Date", "Return Time"
  ]);
}

function rowToObject_(headers, row) {
  return headers.reduce(function(record, header, index) {
    record[header] = row[index];
    return record;
  }, {});
}

function readField_(record, names) {
  for (let i = 0; i < names.length; i++) {
    if (record[names[i]] !== undefined && record[names[i]] !== null && record[names[i]] !== "") {
      return record[names[i]];
    }
  }

  const keys = Object.keys(record);
  const normalizedNames = names.map(normalizeKey_);

  for (let i = 0; i < keys.length; i++) {
    if (normalizedNames.indexOf(normalizeKey_(keys[i])) !== -1 && record[keys[i]] !== undefined && record[keys[i]] !== null && record[keys[i]] !== "") {
      return record[keys[i]];
    }
  }

  return "";
}

function normalizeKey_(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function compactJoin_(values) {
  return values.filter(function(value) {
    return value !== undefined && value !== null && String(value).trim() !== "";
  }).join(" | ");
}

function formatDate_(value) {
  if (!value) {
    return "";
  }

  const date = Object.prototype.toString.call(value) === "[object Date]" ? value : new Date(value);

  if (isNaN(date.getTime())) {
    return String(value);
  }

  return Utilities.formatDate(date, Session.getScriptTimeZone(), "dd/MM/yy");
}

function createRequestId_() {
  return "REQ-" + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd-HHmmss") + "-" + Math.floor(Math.random() * 900 + 100);
}

function escapeHtml_(value) {
  return String(value === undefined || value === null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
