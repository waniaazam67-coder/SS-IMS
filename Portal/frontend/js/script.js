const STORAGE_KEY = "imsPortalStateV4";
const SETTINGS_CACHE_KEY = "imsSystemSettingsDraft";
const SETTINGS_API_BASE = "/api/settings";
const THEME_STORAGE_KEY = "imsTheme";
const BUSINESS_DATA_API_BASE = "/api";
const AUTO_REFRESH_INTERVAL_MS = 10000;
let seedTxCounter = 0;
let currentUser = {
  id: 1,
  uid: "local-admin",
  name: "Inventory Manager",
  email: "",
  role: "Admin",
  roles: ["Admin"],
  permissions: [],
  status: "active"
};
let isAdmin = true;
let settingsLoadedForUser = "";
let businessDataLoadedForUser = "";
let autoRefreshTimer = null;
let isAutoRefreshing = false;
let lastBusinessDataSignature = "";

const seedState = {
  locations: [],
  items: [],
  vendors: [],
  requests: [],
  transportRequests: [],
  purchaseOrders: [],
  grns: [],
  transactions: [],
  auditLogs: []
};

let state = loadState();
let inventoryCategoryFilter = "All";
let inventoryLocationFilter = "All";
let inventoryStatusFilter = "All";
let inventoryPage = 1;
const INVENTORY_PAGE_SIZE = 15;
let requestsPage = 1;
let requestsFilter = "All";
const REQUESTS_PAGE_SIZE = 10;
let settingsState = {};
let activeSettingsGroup = "organization";
let activeNotificationTab = "direct";
let unreadOnly = false;
const readNotificationIds = new Set();
let pendingPurchaseOrder = null;
let pendingCancelPoNumber = "";
let activeHistorySection = "requests";
let previousHistoryView = "dashboard";
let activeHistoryFilter = "all";
const expandedHistoryIds = new Set();

function redirectToLogin() {
  const target = window.location.protocol === "file:"
    ? "index.html"
    : `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const returnTo = encodeURIComponent(target);
  window.location.replace(`login.html?returnTo=${returnTo}`);
}

async function ensureFirebaseReady() {
  if (window.imsFirebaseReady) return window.imsFirebaseReady;
  const [{ initializeApp }, { getAuth, onAuthStateChanged, signOut }] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js")
  ]);
  const app = window.imsFirebaseApp || initializeApp(window.IMS_FIREBASE_CONFIG);
  window.imsFirebaseApp = app;
  window.imsFirebaseAuth = window.imsFirebaseAuth || getAuth(app);
  window.imsFirebaseSignOut = () => signOut(window.imsFirebaseAuth);
  window.imsFirebaseReady = new Promise((resolve) => {
    onAuthStateChanged(window.imsFirebaseAuth, resolve);
  });
  return window.imsFirebaseReady;
}

async function requirePortalSession() {
  if (!window.IMS_FIREBASE_CONFIG) {
    redirectToLogin();
    return null;
  }
  const user = await ensureFirebaseReady();
  if (!user) {
    localStorage.removeItem("firebase_token");
    redirectToLogin();
    return null;
  }
  const token = await user.getIdToken();
  localStorage.setItem("firebase_token", token);
  currentUser = {
    ...currentUser,
    id: user.uid,
    uid: user.uid,
    name: user.displayName || user.email || "IMS User",
    email: user.email || "",
    role: "Admin",
    roles: ["Admin"],
    status: "active"
  };
  isAdmin = currentUser.roles.includes("Admin") || currentUser.role === "Admin";
  return { user, access_token: token };
}

// Settings sections describe field metadata only; saved values are loaded from MySQL through /api/settings.
const settingsSections = [
  { group: "organization", title: "Organization", icon: "building-2", description: "Organization identity and default communication settings.", fields: [
    ["organization_name", "Organization name", "text", true], ["logo_url", "Logo URL", "url"], ["address", "Address", "textarea"],
    ["default_currency", "Default currency", "text", true], ["timezone", "Timezone", "text", true], ["sender_email", "Official sender email", "email", true]
  ] },
  { group: "theme", title: "Theme", icon: "palette", description: "Choose the portal appearance for this browser.", fields: [
    ["portal_theme", "Portal theme", "select", true, ["Light", "Dark"]]
  ] },
  { group: "users_roles", title: "Users & Roles", icon: "users", description: "User, role, permission, department, and location master rules.", fields: [
    ["user_management_enabled", "User management enabled", "checkbox"], ["role_management_enabled", "Role management enabled", "checkbox"],
    ["permission_assignment_enabled", "Permission assignment enabled", "checkbox"], ["department_assignment_enabled", "Department assignment enabled", "checkbox"],
    ["location_assignment_enabled", "Location assignment enabled", "checkbox"], ["inactive_users_allowed", "Active/inactive status enabled", "checkbox"]
  ] },
  { group: "inventory", title: "Inventory", icon: "boxes", description: "Inventory masters and stock movement rules.", fields: [
    ["item_categories", "Item categories", "textarea"], ["units_of_measurement", "Units of measurement", "textarea"],
    ["stock_status_rules", "Stock status rules", "textarea"], ["allow_negative_stock", "Allow negative stock", "checkbox"], ["allow_manual_stock_in", "Allow manual stock in", "checkbox"],
    ["allow_stock_adjustments", "Allow stock adjustments", "checkbox"]
  ] },
  { group: "locations", title: "Locations", icon: "map-pin", description: "Location master configuration.", fields: [
    ["locations", "Locations", "textarea", true], ["location_code_format", "Location code", "text"], ["location_focal_person", "Location focal person", "text"],
    ["inactive_locations_allowed", "Active/inactive status enabled", "checkbox"]
  ] },
  { group: "requisitions", title: "Requisitions", icon: "list-checks", description: "Request numbering, status, field, and approval rules.", fields: [
    ["request_id_format", "Request ID format", "text", true], ["request_statuses", "Request statuses", "textarea", true], ["required_fields", "Required fields", "textarea"],
    ["allow_cancellation", "Allow cancellation", "checkbox"], ["allow_editing_before_approval", "Allow editing before approval", "checkbox"], ["approval_levels", "Approval levels", "number"]
  ] },
  { group: "purchase_orders", title: "PO", icon: "file-pen-line", description: "Purchase order numbering, defaults, tax, approval, and print rules.", fields: [
    ["po_number_format", "PO number format", "text", true], ["po_statuses", "PO statuses", "textarea", true], ["default_payment_terms", "Default payment terms", "text"],
    ["default_delivery_terms", "Default delivery terms", "text"], ["gst_tax_percentage", "GST/tax percentage", "number"], ["po_approval_rules", "PO approval rules", "textarea"],
    ["po_terms_conditions", "PO terms and conditions", "textarea"], ["printable_po_template", "Printable PO template settings", "textarea"]
  ] },
  { group: "grn", title: "GRN", icon: "truck", description: "GRN numbering, status, receiving, and PO requirement rules.", fields: [
    ["grn_id_format", "GRN ID format", "text", true], ["grn_statuses", "GRN statuses", "textarea", true], ["allow_partial_receiving", "Allow partial receiving", "checkbox"],
    ["allow_over_receiving", "Allow over-receiving", "checkbox"], ["require_po_for_grn", "Require PO for GRN", "checkbox"], ["require_accepted_rejected_qty", "Require accepted/rejected quantity", "checkbox"]
  ] },
  { group: "vendors", title: "Vendors", icon: "building", description: "Vendor required fields, bank details, inactive status, and duplicate checks.", fields: [
    ["required_vendor_fields", "Required vendor fields", "textarea"], ["bank_detail_requirements", "Bank detail requirements", "textarea"],
    ["allow_inactive_vendors", "Allow inactive vendors", "checkbox"], ["duplicate_vendor_checks", "Duplicate vendor checks", "textarea"]
  ] },
  { group: "notifications", title: "Notifications", icon: "bell", description: "Admin-controlled notification triggers, channels, templates, and timing rules.", fields: [
    ["request_notifications_heading", "Request Notifications", "heading"],
    ["notify_requester_request_submitted", "Notify requester when request is submitted", "checkbox"], ["notify_manager_approval_required", "Notify manager when approval is required", "checkbox"],
    ["notify_inventory_after_request_approval", "Notify inventory team after approval", "checkbox"], ["notify_requester_request_rejected", "Notify requester if request is rejected", "checkbox"],
    ["notify_requester_request_approved", "Notify requester when request is approved", "checkbox"], ["notify_requester_partially_issued", "Notify requester when request is partially issued", "checkbox"],
    ["notify_requester_fully_issued", "Notify requester when request is fully issued", "checkbox"], ["notify_requester_request_closed", "Notify requester when request is closed", "checkbox"],
    ["pending_approval_reminders", "Reminder for pending approvals", "checkbox"], ["request_reminder_frequency", "Reminder frequency (daily/hourly/manual)", "text"],
    ["approval_escalation_days", "Escalation after X days", "number"],
    ["approval_notifications_heading", "Approval Notifications", "heading"],
    ["send_approval_email_manager", "Send approval email to manager", "checkbox"], ["send_approval_link_email", "Send approval link in email", "checkbox"],
    ["include_request_summary_email", "Include request summary in email", "checkbox"], ["notify_requester_after_decision", "Notify requester after decision", "checkbox"],
    ["notify_finance_approval_required", "Notify finance for approval-required requests", "checkbox"], ["notify_finance_budget_validation", "Notify finance for budget validation", "checkbox"],
    ["notify_ed_high_value_po", "Notify ED for high-value PO approval", "checkbox"], ["notify_ed_exceptional_requests", "Notify ED for exceptional requests", "checkbox"],
    ["inventory_notifications_heading", "Inventory Notifications", "heading"],
    ["notify_requester_stock_ready", "Notify requester when stock is ready for collection", "checkbox"], ["notify_inventory_stock_validation_pending", "Notify inventory when stock validation is pending", "checkbox"],
    ["enable_low_stock_alerts", "Enable low stock alerts", "checkbox"], ["notify_inventory_manager_low_stock", "Notify inventory manager", "checkbox"],
    ["notify_procurement_low_stock", "Notify procurement", "checkbox"], ["reorder_threshold", "Set reorder threshold", "number"],
    ["notify_procurement_out_of_stock", "Notify procurement automatically", "checkbox"], ["create_procurement_queue_notification", "Create procurement queue notification", "checkbox"],
    ["procurement_notifications_heading", "Procurement Notifications", "heading"],
    ["notify_procurement_stock_unavailable", "Notify procurement when stock unavailable", "checkbox"], ["notify_procurement_request_requires_po", "Notify procurement when request requires PO", "checkbox"],
    ["notify_finance_po_approval", "Notify finance when PO requires approval", "checkbox"], ["notify_ed_po_approval", "Notify ED when PO requires approval", "checkbox"],
    ["email_po_to_vendor", "Email PO to vendor", "checkbox"], ["send_revised_po_notification", "Send revised PO notification", "checkbox"], ["send_po_cancellation_notification", "Send PO cancellation notification", "checkbox"],
    ["grn_notifications_heading", "GRN Notifications", "heading"],
    ["notify_inventory_grn_creation", "Notify inventory after GRN creation", "checkbox"], ["notify_procurement_grn_completion", "Notify procurement after GRN completion", "checkbox"],
    ["notify_requester_stock_available_after_grn", "Notify requester when stock becomes available", "checkbox"], ["notify_procurement_partial_delivery", "Notify procurement for partial delivery", "checkbox"],
    ["notify_procurement_rejected_quantity", "Notify procurement for rejected quantity", "checkbox"],
    ["transport_notifications_heading", "Transport Notifications", "heading"],
    ["notify_transport_focal_person", "Notify transport focal person", "checkbox"], ["notify_requester_transport_arrangement", "Notify requester after transport arrangement", "checkbox"],
    ["notify_requester_transport_decision", "Notify requester after transport approval/rejection", "checkbox"],
    ["notification_channels_heading", "Notification Channels", "heading"],
    ["enable_email_notifications", "Enable email notifications", "checkbox"], ["notification_sender_email", "Configure sender email", "email"], ["smtp_configuration", "Configure SMTP", "textarea"],
    ["enable_sms_notifications_later", "SMS notifications (later version)", "checkbox"], ["enable_whatsapp_notifications_later", "WhatsApp notifications (later version)", "checkbox"],
    ["enable_in_app_notifications_later", "In-app notifications (later version)", "checkbox"], ["enable_push_notifications_later", "Push notifications (later version)", "checkbox"],
    ["notification_templates_heading", "Notification Templates", "heading"],
    ["request_submission_template", "Request submission email template", "textarea"], ["approval_request_template", "Approval request template", "textarea"],
    ["approval_confirmation_template", "Approval confirmation template", "textarea"], ["rejection_template", "Rejection template", "textarea"],
    ["po_email_template", "PO email template", "textarea"], ["low_stock_alert_template", "Low stock alert template", "textarea"], ["grn_completion_template", "GRN completion template", "textarea"],
    ["notification_timing_heading", "Notification Timing", "heading"],
    ["send_notifications_instantly", "Send instantly", "checkbox"], ["send_batched_summary", "Send batched summary", "checkbox"], ["daily_digest", "Daily digest", "checkbox"], ["weekly_digest", "Weekly digest", "checkbox"]
  ] },
  { group: "print_templates", title: "Print Templates", icon: "printer", description: "Reusable print labels, footer copy, and terms.", fields: [
    ["requisition_print_settings", "Requisition print settings", "textarea"], ["po_print_settings", "PO print settings", "textarea"], ["grn_print_settings", "GRN print settings", "textarea"],
    ["stock_issue_slip_settings", "Stock issue slip settings", "textarea"], ["signature_labels", "Signature labels", "textarea"], ["footer_text", "Footer text", "textarea"],
    ["terms_conditions", "Terms and conditions", "textarea"]
  ] },
];

function tx(itemCode, location, type, quantity, sourceId, notes) {
  return {
    id: `TX-${String(++seedTxCounter).padStart(3, "0")}`,
    itemCode,
    location,
    type,
    quantity: Number(quantity),
    sourceId,
    notes,
    performedBy: "System",
    date: new Date().toISOString()
  };
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  const imported = importedInventoryState();
  if (!saved) return { ...structuredClone(seedState), ...imported };
  try {
    return applyImportedInventoryBase(JSON.parse(saved));
  } catch {
    return { ...structuredClone(seedState), ...imported };
  }
}

function importedInventoryState() {
  const imported = window.IMS_IMPORTED_INVENTORY || {};
  return {
    locations: Array.isArray(imported.locations) ? structuredClone(imported.locations) : [],
    items: Array.isArray(imported.items) ? structuredClone(imported.items) : []
  };
}

function applyImportedInventoryBase(sourceState) {
  const imported = importedInventoryState();
  return {
    ...structuredClone(seedState),
    ...(sourceState || {}),
    locations: imported.locations.length ? imported.locations : (sourceState?.locations || []),
    items: imported.items.length ? imported.items : (sourceState?.items || [])
  };
}

function saveState() {
  // Core IMS records are persisted through MySQL APIs, not browser storage.
}

function nextId(prefix, rows) {
  const max = rows.reduce((highest, row) => {
    const id = row.id || row.requestId || row.poNumber || row.grnNumber || "";
    const value = Number(String(id).replace(/\D/g, ""));
    return Math.max(highest, value || 0);
  }, 0);
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

function audit(action, entityType, entityId, details) {
  state.auditLogs.unshift({
    id: nextId("AUD", state.auditLogs),
    date: new Date().toISOString(),
    action,
    entityType,
    entityId,
    details
  });
}

function findItem(code) {
  return state.items.find((item) => item.code === code);
}

function categories() {
  return [...new Set(state.items.map((item) => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function itemLabel(item) {
  return `${item.code} - ${item.name}${item.type ? ` (${item.type})` : ""}`;
}

function itemNamesForCategory(category) {
  return [...new Set(state.items
    .filter((item) => !category || item.category === category)
    .map((item) => item.name)
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function itemTypesForName(name, category = "") {
  return state.items
    .filter((item) => item.name === name && (!category || item.category === category))
    .sort((a, b) => String(a.type || "").localeCompare(String(b.type || "")));
}

function stockFor(itemCode, location) {
  const dbRow = (state.inventoryRows || []).find((row) => row.code === itemCode && row.location === location);
  if (dbRow) return Number(dbRow.available ?? dbRow.stock ?? 0);
  return state.transactions
    .filter((entry) => entry.itemCode === itemCode && entry.location === location)
    .reduce((sum, entry) => {
      const isOut = ["STOCK_OUT", "REQUEST_ISSUE", "MANUAL_OUT", "ADJUSTMENT_OUT", "TRANSFER_OUT"].includes(entry.type);
      return sum + (isOut ? -entry.quantity : entry.quantity);
    }, 0);
}

function stockRows() {
  const importedInventoryByKey = new Map((state.inventoryRows || [])
    .filter((row) => row.code && row.location)
    .map((row) => [`${row.code}|${row.location}`, row]));
  if (!state.locations.length && !state.transactions.length && !importedInventoryByKey.size) {
    return state.items.map((item) => ({
      ...item,
      location: "-",
      stock: "-",
      status: "Item master"
    }));
  }
  const pairs = new Map();
  state.items.forEach((item) => {
    state.locations.forEach((location) => pairs.set(`${item.code}|${location}`, { itemCode: item.code, location }));
  });
  state.transactions
    .filter((entry) => findItem(entry.itemCode) && state.locations.includes(entry.location))
    .forEach((entry) => pairs.set(`${entry.itemCode}|${entry.location}`, { itemCode: entry.itemCode, location: entry.location }));
  return [...pairs.values()].map((pair) => {
    const dbRow = importedInventoryByKey.get(`${pair.itemCode}|${pair.location}`);
    const item = findItem(pair.itemCode) || dbRow || {};
    const stock = dbRow ? Number(dbRow.stock || 0) : stockFor(pair.itemCode, pair.location);
    const available = dbRow ? Number(dbRow.available ?? dbRow.stock ?? 0) : stock;
    const status = stock <= 0 ? "Out of stock" : "OK";
    return { ...item, location: pair.location, stock, available, status };
  });
}

function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  setTimeout(() => toast.className = "toast", 2800);
}

function initialsFor(nameOrEmail) {
  const source = String(nameOrEmail || "IMS User").trim();
  const parts = source.includes("@") ? [source.split("@")[0]] : source.split(/\s+/);
  return parts.slice(0, 2).map((part) => part[0] || "").join("").toUpperCase() || "IM";
}

async function apiRequest(path, options = {}) {
  const token = localStorage.getItem("firebase_token");
  const response = await fetch(`${BUSINESS_DATA_API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error?.message || "IMS API request failed.");
    error.statusCode = response.status;
    throw error;
  }
  return data;
}

async function syncImportedInventoryToDatabase() {
  const imported = importedInventoryState();
  if (!imported.items.length) return;
  try {
    await apiRequest("/items/sync-import", {
      method: "POST",
      body: JSON.stringify(imported)
    });
  } catch (error) {
    console.warn("Imported inventory sync failed:", error);
  }
}

async function refreshVerifiedUserShell() {
  applyAdminVisibility();
  if (isAdmin && settingsLoadedForUser !== currentUser.id) {
    settingsLoadedForUser = currentUser.id;
    renderSettings();
    loadSettings({ silent: true });
  }
  if (businessDataLoadedForUser !== currentUser.id) {
    businessDataLoadedForUser = currentUser.id;
    await syncImportedInventoryToDatabase();
    await loadBusinessData({ silent: true });
    lastBusinessDataSignature = businessDataSignature();
  }
  render();
  startAutoRefresh();
}

function syncAuthState() {
  document.querySelectorAll(".profile").forEach((button) => {
    button.setAttribute("aria-label", currentUser.name || currentUser.email || "IMS User");
    button.dataset.profileName = currentUser.name || currentUser.email || "IMS User";
  });
  document.querySelectorAll(".profile-name").forEach((name) => {
    name.textContent = currentUser.name || currentUser.email || "IMS User";
  });
  document.querySelectorAll(".avatar").forEach((avatar) => {
    avatar.textContent = initialsFor(currentUser.name || currentUser.email);
  });
  refreshVerifiedUserShell();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[char]));
}

function settingValueType(type) {
  if (type === "checkbox") return "boolean";
  if (type === "number") return "number";
  return "string";
}

function normalizeSettings(rows) {
  return rows.reduce((groups, row) => {
    const group = row.setting_group;
    if (!groups[group]) groups[group] = {};
    groups[group][row.setting_key] = row.value_type === "boolean" ? row.setting_value === true || row.setting_value === "true" : row.setting_value;
    return groups;
  }, {});
}

async function requestSettings(path = "", options = {}) {
  const token = localStorage.getItem("firebase_token");
  const response = await fetch(`${SETTINGS_API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  if (response.status === 403) {
    const error = new Error("Admin access is required.");
    error.statusCode = 403;
    error.accessDenied = true;
    throw error;
  }
  if (!response.ok) throw new Error("Settings API is unavailable.");
  return response.json();
}

async function loadSettings(options = {}) {
  const silent = Boolean(options.silent);
  if (!isAdmin) return;
  try {
    const data = await requestSettings();
    settingsState = normalizeSettings(data.settings || []);
    applyTheme(settingsState.theme?.portal_theme || localStorage.getItem(THEME_STORAGE_KEY));
    localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(settingsState));
  } catch (error) {
    settingsState = JSON.parse(localStorage.getItem(SETTINGS_CACHE_KEY) || "{}");
    applyTheme(settingsState.theme?.portal_theme || localStorage.getItem(THEME_STORAGE_KEY));
    if (!silent) showToast(`${error.message} Using local draft settings.`, "error");
  }
  renderSettings();
}

function renderSettingsTabs() {
  const tabs = document.getElementById("settingsTabs");
  tabs.innerHTML = settingsSections.map((section) => `
    <button class="settings-tab ${section.group === activeSettingsGroup ? "active" : ""}" type="button" data-settings-group="${section.group}">
      <i data-lucide="${section.icon}"></i><span>${section.title}</span>
    </button>
  `).join("");
}

function renderSettings() {
  if (!isAdmin) return;
  const section = settingsSections.find((item) => item.group === activeSettingsGroup) || settingsSections[0];
  const values = settingsState[section.group] || {};
  document.getElementById("settingsSectionTitle").textContent = section.title;
  document.getElementById("settingsSectionDescription").textContent = section.description;
  document.getElementById("settingsForm").innerHTML = `
    <div class="settings-group-grid">
      ${section.fields.map(([key, label, type, required, options]) => {
        if (type === "heading") {
          return `<div class="settings-subhead">${label}</div>`;
        }
        const value = escapeHtml(values[key] ?? "");
        if (type === "checkbox") {
          return `<label class="setting-check"><input type="checkbox" name="${key}" ${value === true || value === "true" ? "checked" : ""}>${label}</label>`;
        }
        if (type === "select") {
          const listId = `settings-${section.group}-${key}-options`;
          return `<label class="setting-field">${label}<input ${required ? "required" : ""} name="${key}" value="${value}" list="${listId}" placeholder="Select ${escapeHtml(label)}"><datalist id="${listId}">${(options || []).map((option) => `<option value="${escapeHtml(option)}"></option>`).join("")}</datalist></label>`;
        }
        const requiredAttr = required ? "required" : "";
        const fieldClass = type === "textarea" ? "setting-field full" : "setting-field";
        const input = type === "textarea"
          ? `<textarea ${requiredAttr} name="${key}">${value}</textarea>`
          : `<input ${requiredAttr} type="${type}" name="${key}" value="${value}">`;
        return `<label class="${fieldClass}">${label}${input}</label>`;
      }).join("")}
    </div>
    <div class="settings-actions"><button class="secondary" type="button" id="reloadSettingsBtn">Reload</button><button class="primary" type="submit"><i data-lucide="save"></i>Save Settings</button></div>
  `;
  renderSettingsTabs();
  if (window.lucide) window.lucide.createIcons();
}

async function saveActiveSettings(event) {
  event.preventDefault();
  if (!isAdmin) return showToast("Admin access is required.", "error");
  const section = settingsSections.find((item) => item.group === activeSettingsGroup);
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const payload = {};
  section.fields.forEach(([key, label, type]) => {
    if (type === "heading") return;
    const field = form.elements[key];
    payload[key] = {
      value: type === "checkbox" ? field.checked : field.value.trim(),
      valueType: settingValueType(type),
      description: label
    };
  });
  settingsState[section.group] = Object.fromEntries(Object.entries(payload).map(([key, row]) => [key, row.value]));
  if (section.group === "theme") applyTheme(settingsState.theme.portal_theme);
  localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(settingsState));
  try {
    await requestSettings(`/${section.group}`, { method: "PUT", body: JSON.stringify({ settings: payload }) });
    showToast(`${section.title} settings saved.`);
  } catch (error) {
    showToast(`${error.message} Saved as a local draft.`, "error");
  }
}

async function loadBusinessData({ silent = false } = {}) {
  const endpoints = [
    ["items", "/items"],
    ["vendors", "/vendors"],
    ["requests", "/requests"],
    ["transportRequests", "/transport-requests"],
    ["purchaseOrders", "/purchase-orders"],
    ["grns", "/grn"],
    ["auditLogs", "/audit"],
    ["inventory", "/inventory"]
  ];
  const results = await Promise.allSettled(endpoints.map(([, path]) => apiRequest(path)));
  results.forEach((result, index) => {
    if (result.status !== "fulfilled") return;
    const key = endpoints[index][0];
    if (key === "inventory") {
      state.transactions = [];
      state.inventoryRows = result.value.inventory || [];
      return;
    }
    if (key === "items") return;
    state[key] = result.value[key] || state[key] || [];
  });
  state = applyImportedInventoryBase(state);
  if (!importedInventoryState().locations.length) {
    state.locations = [...new Set([
      ...state.locations,
      ...state.requests.map((request) => request.location),
      ...state.inventoryRows?.map((row) => row.location) || []
    ].filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }
  if (!silent) showToast("IMS data refreshed from database.");
}

function businessDataSignature() {
  const latest = (rows, key = "date") => rows
    .map((row) => row?.[key] || row?.created_at || row?.updated_at || row?.requestId || row?.id || "")
    .sort()
    .at(-1) || "";
  return JSON.stringify({
    requests: [state.requests.length, latest(state.requests), state.requests[0]?.requestId || ""],
    transportRequests: [state.transportRequests.length, latest(state.transportRequests), state.transportRequests[0]?.id || ""],
    purchaseOrders: [state.purchaseOrders.length, latest(state.purchaseOrders, "issueDate"), state.purchaseOrders[0]?.poNumber || ""],
    grns: [state.grns.length, latest(state.grns), state.grns[0]?.grnNumber || ""],
    inventory: [state.inventoryRows?.length || 0, latest(state.inventoryRows || [], "code")],
    auditLogs: [state.auditLogs.length, latest(state.auditLogs)]
  });
}

function shouldPauseAutoRefresh() {
  if (document.hidden) return true;
  const active = document.activeElement;
  if (!active) return false;
  const tag = active.tagName;
  return active.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(tag);
}

async function autoRefreshBusinessData() {
  if (isAutoRefreshing || shouldPauseAutoRefresh()) return;
  isAutoRefreshing = true;
  try {
    const previousSignature = lastBusinessDataSignature || businessDataSignature();
    await loadBusinessData({ silent: true });
    const nextSignature = businessDataSignature();
    lastBusinessDataSignature = nextSignature;
    if (nextSignature !== previousSignature) {
      render();
      showToast("Portal updated with latest activity.");
    }
  } catch (error) {
    console.warn("Auto-refresh failed:", error);
  } finally {
    isAutoRefreshing = false;
  }
}

function startAutoRefresh() {
  if (autoRefreshTimer) return;
  autoRefreshTimer = setInterval(autoRefreshBusinessData, AUTO_REFRESH_INTERVAL_MS);
}

function applyAdminVisibility() {
  document.querySelectorAll(".admin-only").forEach((element) => {
    element.hidden = !isAdmin;
  });
}

function applyTheme(theme) {
  const normalized = String(theme || "Light").toLowerCase() === "dark" ? "dark" : "light";
  document.body.dataset.theme = normalized;
  localStorage.setItem(THEME_STORAGE_KEY, normalized);
  if (!settingsState.theme) settingsState.theme = {};
  settingsState.theme.portal_theme = normalized === "dark" ? "Dark" : "Light";
}

function notificationSeed() {
  const pendingRequests = state.requests.filter((request) => request.items.some((item) => item.approvalStatus === "Pending")).slice(0, 2);
  const lowStockRows = stockRows().filter((row) => row.status !== "OK").slice(0, 2);
  const items = [
    {
      id: "approval-required",
      tab: "direct",
      unread: true,
      avatar: "IM",
      title: "Approval required for an inventory request",
      body: pendingRequests[0] ? `${pendingRequests[0].requestId} from ${pendingRequests[0].requester || "Requester"}` : "A new request is waiting for manager approval",
      meta: "Requests • Pending approval",
      age: "now",
      reply: pendingRequests[0] ? `Review ${pendingRequests[0].requestId} and approve or reject the requested items.` : ""
    },
    {
      id: "stock-ready",
      tab: "direct",
      unread: true,
      avatar: "ST",
      avatarClass: "green",
      title: "Inventory team has a stock update",
      body: lowStockRows[0] ? `${lowStockRows[0].name || lowStockRows[0].code} is ${lowStockRows[0].status.toLowerCase()}` : "Stock validation is ready for review",
      meta: "Inventory • Stock availability",
      age: "today"
    },
    {
      id: "po-approval",
      tab: "watching",
      unread: true,
      avatar: "PO",
      title: "Purchase order notification",
      body: state.purchaseOrders[0] ? `${state.purchaseOrders[0].poNumber} is ${state.purchaseOrders[0].status}` : "A PO will appear here when procurement starts",
      meta: "Procurement - PO approval",
      age: "1 day ago"
    },
    {
      id: "grn-complete",
      tab: "watching",
      unread: false,
      avatar: "GR",
      avatarClass: "teal",
      title: "GRN completion update",
      body: state.grns[0] ? `${state.grns[0].grnNumber} was received by ${state.grns[0].receivedBy || "Inventory"}` : "Completed receiving updates will appear here",
      meta: "GRN • Goods receiving",
      age: "2 days ago"
    }
  ];
  return items;
}

function renderNotificationCenter() {
  const list = document.getElementById("notificationList");
  const rows = notificationSeed()
    .map((item) => ({ ...item, unread: item.unread && !readNotificationIds.has(item.id) }))
    .filter((item) => item.tab === activeNotificationTab && (!unreadOnly || item.unread));
  document.querySelectorAll(".notification-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.notificationTab === activeNotificationTab);
  });
  list.innerHTML = `<div class="notification-section-label">Latest</div>${rows.map((item) => `
    <article class="notification-item ${item.unread ? "" : "read"}">
      <div class="notification-avatar ${item.avatarClass || ""}">${item.avatar}</div>
      <div class="notification-body">
        <strong>${escapeHtml(item.title)} <span class="notification-meta" style="display:inline">${escapeHtml(item.age)}</span></strong>
        <p>${escapeHtml(item.body)}</p>
        <span class="notification-meta">${escapeHtml(item.meta)}</span>
        ${item.reply ? `<div class="notification-reply"><p>${escapeHtml(item.reply)}</p><div class="notification-reply-actions"><button type="button">👍</button><button type="button">👏</button><button type="button"></button><button type="button">☺</button><button class="reply-btn" type="button">Reply</button><button class="thread-btn" type="button">View thread</button></div></div>` : ""}
      </div>
      <span class="notification-dot"></span>
    </article>
  `).join("") || `<div class="notification-empty">No notifications to show</div>`}`;
}

function updateNotificationBadge() {
  const hasUnread = notificationSeed().some((item) => item.unread && !readNotificationIds.has(item.id));
  const btn = document.getElementById("notificationBtn");
  if (!btn) return;
  btn.classList.toggle("has-unread", hasUnread);
  btn.setAttribute("aria-label", hasUnread ? "Notifications, unread" : "Notifications");
}

function openNotificationCenter() {
  const panel = document.getElementById("notificationCenter");
  panel.classList.add("show");
  panel.setAttribute("aria-hidden", "false");
  document.getElementById("notificationBtn").setAttribute("aria-expanded", "true");
  renderNotificationCenter();
}

function closeNotificationCenter() {
  const panel = document.getElementById("notificationCenter");
  panel.classList.remove("show");
  panel.setAttribute("aria-hidden", "true");
  document.getElementById("notificationBtn").setAttribute("aria-expanded", "false");
}

function toggleNotificationCenter() {
  const panel = document.getElementById("notificationCenter");
  panel.classList.contains("show") ? closeNotificationCenter() : openNotificationCenter();
}

function money(value) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function remainingPoQuantity(po) {
  return Math.max(Number(po?.quantityOrdered || 0) - Number(po?.quantityReceived || 0), 0);
}

function canReceivePo(po) {
  const status = String(po?.status || "").toLowerCase();
  return po && remainingPoQuantity(po) > 0 && !["received", "cancelled"].includes(status);
}

function canCancelPo(po) {
  const status = String(po?.status || "").toLowerCase();
  return po && !["received", "cancelled", "closed"].includes(status);
}

function poStatusKey(po) {
  return String(po?.status || "").trim().toLowerCase();
}

function isActiveVendor(vendor) {
  return vendor?.active !== false && vendor?.isActive !== false && vendor?.is_active !== false;
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function optionsHtml(values, getValue = (row) => row, getLabel = (row) => row) {
  return values.map((row) => `<option value="${escapeHtml(getValue(row))}">${escapeHtml(getLabel(row))}</option>`).join("");
}

function setChoiceOptions(field, placeholder, values, getValue = (row) => row, getLabel = (row) => row) {
  const selected = field.value;
  if (field.tagName === "SELECT") {
    field.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>${optionsHtml(values, getValue, getLabel)}`;
    if (selected) field.value = selected;
    return;
  }
  if (!field.id) field.id = `choice-${Math.random().toString(36).slice(2)}`;
  const listId = field.getAttribute("list") || `${field.id}Options`;
  field.setAttribute("list", listId);
  field.placeholder = placeholder;
  let list = document.getElementById(listId);
  if (!list) {
    list = document.createElement("datalist");
    list.id = listId;
    field.insertAdjacentElement("afterend", list);
  }
  list.innerHTML = values.map((row) => {
    const value = getValue(row);
    const label = getLabel(row);
    return `<option value="${escapeHtml(value)}" label="${escapeHtml(label)}"></option>`;
  }).join("");
}

function syncSelectOptions(scope = document) {
  const currentCategories = categories();
  scope.querySelectorAll("[data-categories]").forEach((field) => {
    setChoiceOptions(field, "Select category", currentCategories);
    if (field.value && !currentCategories.includes(field.value)) field.value = field.value;
  });
  scope.querySelectorAll("[data-locations]").forEach((field) => {
    setChoiceOptions(field, "Select location", state.locations);
  });
  const inventoryLocationSelect = document.getElementById("inventoryLocationFilter");
  setChoiceOptions(inventoryLocationSelect, "All locations", ["All", ...state.locations]);
  if (state.locations.includes(inventoryLocationFilter)) {
    inventoryLocationSelect.value = inventoryLocationFilter;
  } else {
    inventoryLocationFilter = "All";
    inventoryLocationSelect.value = "All";
  }
  scope.querySelectorAll("[data-items]").forEach((field) => {
    const selected = field.value;
    const categorySourceId = field.dataset.categorySource;
    const category = categorySourceId ? document.getElementById(categorySourceId)?.value : "";
    const items = category ? state.items.filter((item) => item.category === category) : state.items;
    setChoiceOptions(field, "Select item", items, (item) => item.code, itemLabel);
    if (selected && items.some((item) => item.code === selected)) field.value = selected;
  });
  scope.querySelectorAll("[data-item-names]").forEach((field) => {
    const selected = field.value;
    const categorySourceId = field.dataset.categorySource;
    const category = categorySourceId ? document.getElementById(categorySourceId)?.value : "";
    const names = itemNamesForCategory(category);
    setChoiceOptions(field, "Select item", names);
    if (selected && names.includes(selected)) field.value = selected;
  });
  scope.querySelectorAll("[data-item-types]").forEach((field) => {
    const selected = field.value;
    const itemSourceId = field.dataset.itemSource;
    const itemName = itemSourceId ? document.getElementById(itemSourceId)?.value : "";
    const categorySourceId = field.dataset.categorySource;
    const category = categorySourceId ? document.getElementById(categorySourceId)?.value : "";
    const items = itemName ? itemTypesForName(itemName, category) : [];
    setChoiceOptions(field, "Select type", items, (item) => item.code, (item) => item.type || item.code);
    if (selected && items.some((item) => item.code === selected)) field.value = selected;
  });
  scope.querySelectorAll("[data-vendors]").forEach((field) => {
    const selected = field.value;
    setChoiceOptions(field, "Select vendor", state.vendors, (vendor) => vendor.name, (vendor) => vendor.name);
    if (selected) field.value = selected;
  });
  const poSelect = document.getElementById("poSelect");
  const selectedPo = poSelect.value;
  const receivablePos = state.purchaseOrders.filter(canReceivePo);
  setChoiceOptions(poSelect, "Select PO number", receivablePos, (po) => po.poNumber, (po) => `${po.poNumber} - ${po.itemCode || po.specifications || "Item"} (${money(remainingPoQuantity(po))} remaining)`);
  if (selectedPo && receivablePos.some((po) => po.poNumber === selectedPo)) poSelect.value = selectedPo;
}

function renderCategoryTabs() {
  const tabs = document.getElementById("categoryTabs");
  const values = ["All", ...categories()];
  if (!values.includes(inventoryCategoryFilter)) inventoryCategoryFilter = "All";
  tabs.innerHTML = values.map((category) => `
    <button class="category-tab ${category === inventoryCategoryFilter ? "active" : ""}" type="button" data-category="${category}">${category}</button>
  `).join("");
}

function updateSelectedItemId(typeSelectId, displayInputId) {
  const item = findItem(document.getElementById(typeSelectId).value);
  document.getElementById(displayInputId).value = item ? item.code : "";
}

function updateStockInItemId() {
  updateSelectedItemId("stockInItemType", "stockInItemId");
}

function updateStockOutItemId() {
  updateSelectedItemId("stockOutItemType", "stockOutItemId");
}

function openItemModal() {
  document.getElementById("itemModal").classList.add("show");
  document.getElementById("itemModal").setAttribute("aria-hidden", "false");
}

function closeItemModal() {
  document.getElementById("itemModal").classList.remove("show");
  document.getElementById("itemModal").setAttribute("aria-hidden", "true");
}

function setView(view) {
  if (view === "settings" && !isAdmin) {
    showToast("Admin access is required for Settings.", "error");
    return;
  }
  document.querySelectorAll(".view").forEach((panel) => panel.classList.remove("active"));
  document.getElementById(`${view}View`).classList.add("active");
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  const active = document.querySelector(`.nav-item[data-view="${view}"] span:last-child`);
  document.getElementById("pageTitle").textContent = view === "history" ? "History" : active ? active.textContent : "Dashboard";
  render();
}

function openHistoryPage(section) {
  const activePanel = document.querySelector(".view.active");
  previousHistoryView = activePanel ? activePanel.id.replace(/View$/, "") : "dashboard";
  activeHistorySection = section;
  activeHistoryFilter = "all";
  expandedHistoryIds.clear();
  setView("history");
}

function addRequestLine() {
  const template = document.getElementById("requestItemTemplate");
  const row = template.content.firstElementChild.cloneNode(true);
  row.querySelector(".remove-line").addEventListener("click", () => row.remove());
  document.getElementById("requestItems").appendChild(row);
  syncSelectOptions(row);
  if (window.lucide) window.lucide.createIcons();
}

function addItemTypeLine() {
  const template = document.getElementById("itemTypeTemplate");
  const row = template.content.firstElementChild.cloneNode(true);
  row.querySelector(".remove-type").addEventListener("click", () => {
    if (document.querySelectorAll("#itemTypeRows .item-type-row").length > 1) row.remove();
  });
  document.getElementById("itemTypeRows").appendChild(row);
  if (window.lucide) window.lucide.createIcons();
}

function statusBadge(status) {
  const key = String(status).toLowerCase().replace(/\s+/g, "-");
  return `<span class="badge ${key}">${status}</span>`;
}

function cancellationReason(notes) {
  const match = String(notes || "").match(/Cancellation reason:\s*([^\n]+)/i);
  return match ? match[1].trim() : "";
}

function requestOverallStatus(request) {
  if (request.items.every((item) => item.approvalStatus === "Rejected")) return "Rejected";
  if (request.items.some((item) => item.approvalStatus === "Pending")) return "Pending";
  if (request.items.some((item) => item.issuanceStatus !== "Issued")) return "Approved";
  return "Issued";
}

function requestIssuanceStatus(request) {
  if (request.items.every((item) => item.issuanceStatus === "Issued")) return "Issued";
  if (request.items.some((item) => ["Issued", "Partially Issued"].includes(item.issuanceStatus))) return "Partially Issued";
  return "Pending";
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function closeDashboardMenus() {
  document.querySelectorAll(".kebab-menu.show").forEach((menu) => {
    menu.classList.remove("show");
    menu.setAttribute("aria-hidden", "true");
  });
  document.querySelectorAll("[data-menu-toggle]").forEach((button) => button.setAttribute("aria-expanded", "false"));
}

function toggleDashboardMenu(menuId, button) {
  const menu = document.getElementById(menuId);
  const willOpen = !menu.classList.contains("show");
  closeDashboardMenus();
  if (!willOpen) return;
  menu.classList.add("show");
  menu.setAttribute("aria-hidden", "false");
  button.setAttribute("aria-expanded", "true");
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, "\"\"")}"`;
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function dashboardSummaryRows() {
  const currentStockRows = stockRows();
  const approvedRequests = state.requests.filter((request) => requestOverallStatus(request) === "Approved" || requestOverallStatus(request) === "Issued");
  const openPOs = state.purchaseOrders.filter((po) => poStatusKey(po) === "open");
  const orderedPOs = state.purchaseOrders.filter((po) => ["ordered", "pending"].includes(poStatusKey(po)));
  const closedDeliveredPOs = state.purchaseOrders.filter((po) => ["closed", "delivered", "received"].includes(poStatusKey(po)));
  const partialDeliveredPOs = state.purchaseOrders.filter((po) => poStatusKey(po).includes("partial") || (Number(po.quantityReceived || 0) > 0 && remainingPoQuantity(po) > 0));
  const cancelledPOs = state.purchaseOrders.filter((po) => ["cancelled", "canceled"].includes(poStatusKey(po)) || po.cancellationReason);
  return [
    ["Inventory Requests", state.requests.length],
    ["Transport Requests", state.transportRequests.length],
    ["Approved Requests", approvedRequests.length],
    ["Low Stock Items", currentStockRows.filter((row) => row.status === "Restock needed").length],
    ["Out of Stock Items", currentStockRows.filter((row) => row.status === "Out of stock").length],
    ["Opened PO", openPOs.length],
    ["Ordered PO", orderedPOs.length],
    ["Closed/Delivered PO", closedDeliveredPOs.length],
    ["Partially Delivered PO", partialDeliveredPOs.length],
    ["Cancelled PO", cancelledPOs.length],
    ["Active Vendors", state.vendors.filter(isActiveVendor).length],
    ["Total GRNs", state.grns.length],
    ["Total Inventory Items", state.items.length],
    ["Item Categories", categories().length]
  ];
}

function exportSummaryPdf() {
  const rows = dashboardSummaryRows().map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`).join("");
  printHtml(`
    <section class="po-sheet">
      <h1>IMS Dashboard Summary</h1>
      <table><tbody>${rows}</tbody></table>
    </section>
  `);
}

function exportProcurementCsv() {
  downloadCsv("ims-procurement-summary.csv", [
    ["Metric", "Value"],
    ["Opened PO", state.purchaseOrders.filter((po) => poStatusKey(po) === "open").length],
    ["Ordered PO", state.purchaseOrders.filter((po) => ["ordered", "pending"].includes(poStatusKey(po))).length],
    ["Closed/Delivered PO", state.purchaseOrders.filter((po) => ["closed", "delivered", "received"].includes(poStatusKey(po))).length],
    ["Partially Delivered PO", state.purchaseOrders.filter((po) => poStatusKey(po).includes("partial") || (Number(po.quantityReceived || 0) > 0 && remainingPoQuantity(po) > 0)).length],
    ["Cancelled PO", state.purchaseOrders.filter((po) => ["cancelled", "canceled"].includes(poStatusKey(po)) || po.cancellationReason).length],
    ["Total GRNs", state.grns.length],
    ["Active Vendors", state.vendors.filter(isActiveVendor).length]
  ]);
}

function handleDashboardAction(action) {
  const actionMap = {
    "summary-details": () => {
      requestsFilter = "All";
      requestsPage = 1;
      setView("requests");
    },
    "summary-csv": () => downloadCsv("ims-dashboard-summary.csv", [["Metric", "Value"], ...dashboardSummaryRows()]),
    "summary-pdf": exportSummaryPdf,
    "view-requests": () => {
      requestsFilter = "All";
      requestsPage = 1;
      setView("requests");
    },
    "pending-approvals": () => {
      setView("approvals");
    },
    "pending-issue": () => setView("issue"),
    "low-stock": () => {
      inventoryStatusFilter = "Restock needed";
      inventoryPage = 1;
      setView("inventory");
    },
    "out-of-stock": () => {
      inventoryStatusFilter = "Out of stock";
      inventoryPage = 1;
      setView("inventory");
    },
    "inventory-items": () => {
      inventoryCategoryFilter = "All";
      inventoryLocationFilter = "All";
      inventoryStatusFilter = "All";
      inventoryPage = 1;
      setView("inventory");
    },
    "open-po": () => setView("po"),
    "pending-grns": () => setView("grn"),
    "transport-requests": () => setView("transport"),
    "audit-logs": () => setView("reports"),
    "procurement-export": exportProcurementCsv,
    "refresh": () => {
      render();
      showToast("Dashboard refreshed.");
    }
  };
  actionMap[action]?.();
}

function activityIcon(activity) {
  const icons = {
    "Request submitted": "send",
    "Approved": "check-circle-2",
    "Issued": "package-check",
    "PO created": "file-pen-line",
    "GRN received": "truck"
  };
  return icons[activity] || "activity";
}

function renderDashboard() {
  const currentStockRows = stockRows();
  const linkedVendorIds = new Set(state.purchaseOrders.map((po) => po.vendorId).filter(Boolean));
  const linkedGrnPOs = new Set(state.grns.map((grn) => grn.poNumber).filter(Boolean));
  const pendingRequests = state.requests.filter((request) => request.items.some((item) => item.approvalStatus === "Pending"));
  const approvedRequests = state.requests.filter((request) => requestOverallStatus(request) === "Approved" || requestOverallStatus(request) === "Issued");
  const rejectedRequests = state.requests.filter((request) => requestOverallStatus(request) === "Rejected");
  const openPOs = state.purchaseOrders.filter((po) => poStatusKey(po) === "open");
  const orderedPOs = state.purchaseOrders.filter((po) => ["ordered", "pending"].includes(poStatusKey(po)));
  const closedDeliveredPOs = state.purchaseOrders.filter((po) => ["closed", "delivered", "received"].includes(poStatusKey(po)));
  const partialDeliveredPOs = state.purchaseOrders.filter((po) => poStatusKey(po).includes("partial") || (Number(po.quantityReceived || 0) > 0 && remainingPoQuantity(po) > 0));
  const cancelledPOs = state.purchaseOrders.filter((po) => ["cancelled", "canceled"].includes(poStatusKey(po)) || po.cancellationReason);

  setText("kpiRequests", state.requests.length);
  setText("kpiTransport", state.transportRequests.length);
  setText("kpiApprovedRequests", approvedRequests.length);
  setText("kpiRejectedRequests", rejectedRequests.length);
  setText("kpiLowStock", currentStockRows.filter((row) => row.status !== "OK").length);
  setText("kpiPO", state.purchaseOrders.length);
  setText("kpiGRN", state.purchaseOrders.filter((po) => po.status !== "Closed").length);
  setText("kpiOpenPO", openPOs.length);
  setText("kpiOrderedPO", orderedPOs.length);
  setText("kpiClosedDeliveredPO", closedDeliveredPOs.length);
  setText("kpiPartialDeliveredPO", partialDeliveredPOs.length);
  setText("kpiCancelledPO", cancelledPOs.length);
  setText("kpiAudit", state.auditLogs.length);
  setText("kpiStockLines", currentStockRows.length);
  setText("kpiInStock", currentStockRows.filter((row) => row.stock > 0).length);
  setText("kpiStockLow", currentStockRows.filter((row) => row.status === "Restock needed").length);
  setText("kpiOutOfStock", currentStockRows.filter((row) => row.status === "Out of stock").length);
  setText("kpiVendors", state.vendors.filter(isActiveVendor).length);
  setText("kpiVendorContacts", state.vendors.filter((vendor) => vendor.contact).length);
  setText("kpiVendorPhones", state.vendors.filter((vendor) => vendor.phone).length);
  setText("kpiVendorPOs", linkedVendorIds.size);
  setText("kpiTotalGRNs", state.grns.length);
  setText("kpiInventoryItems", state.items.length);
  setText("kpiItemCategories", categories().length);
  setText("kpiAcceptedQty", money(state.grns.reduce((sum, grn) => sum + Number(grn.qtyAccepted || 0), 0)));
  setText("kpiGRNLinkedPOs", linkedGrnPOs.size);
  setText("kpiManualGRNs", state.grns.filter((grn) => !grn.poNumber).length);
  setText("pendingApprovalCount", pendingRequests.length);

  const recentRows = [...state.requests]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5)
    .map((request) => `
      <tr class="clickable-row" data-dashboard-request="${escapeHtml(request.requestId)}">
        <td colspan="6">
          <div class="dashboard-feed-row">
            <span class="activity-icon"><i data-lucide="package"></i></span>
            <span class="dashboard-feed-copy">
              <strong>${escapeHtml(request.requestId)} created by ${escapeHtml(request.requester || "Requester")}</strong>
              <span>${escapeHtml(request.department || "Department")} - ${formatDate(request.date)} - ${requestOverallStatus(request)} / ${requestIssuanceStatus(request)}</span>
            </span>
          </div>
        </td>
      </tr>
    `);
  document.getElementById("dashboardRecentRequests").innerHTML = recentRows.join("") || emptyRow(6);

  document.getElementById("dashboardPendingApprovals").innerHTML = pendingRequests
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5)
    .map((request) => `
      <tr class="clickable-row" data-dashboard-request="${escapeHtml(request.requestId)}">
        <td colspan="5">
          <div class="dashboard-feed-row">
            <span class="activity-icon"><i data-lucide="circle-alert"></i></span>
            <span class="dashboard-feed-copy">
              <strong>${escapeHtml(request.requestId)} awaiting approval</strong>
              <span>${escapeHtml(request.requester || "Requester")} - ${escapeHtml(request.department || "Department")} - ${formatDate(request.date)}</span>
            </span>
          </div>
        </td>
      </tr>
    `).join("") || emptyRow(5);

  const activities = [
    ...state.requests.map((request) => ({
      date: request.date,
      activity: "Request submitted",
      reference: request.requestId,
      details: `${request.requester || "Requester"} • ${request.department || "Department"}`
    })),
    ...state.requests.flatMap((request) => request.items
      .filter((item) => item.approvalStatus === "Approved")
      .map((item) => ({ date: request.date, activity: "Approved", reference: request.requestId, details: item.itemName || item.itemCode }))),
    ...state.transactions
      .filter((entry) => entry.type === "STOCK_OUT" && String(entry.sourceId || "").startsWith("REQ"))
      .map((entry) => ({ date: entry.date, activity: "Issued", reference: entry.sourceId, details: `${entry.quantity} ${entry.itemCode}` })),
    ...state.purchaseOrders.map((po) => ({ date: po.issueDate || po.date, activity: "PO created", reference: po.poNumber, details: po.vendorName || po.itemCode || "" })),
    ...state.grns.map((grn) => ({ date: grn.date, activity: "GRN received", reference: grn.grnNumber, details: grn.poNumber || grn.itemCode || "" }))
  ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);

  document.getElementById("dashboardRecentActivity").innerHTML = activities.map((activity) => `
    <tr>
      <td colspan="4">
        <div class="dashboard-feed-row">
          <span class="activity-icon"><i data-lucide="${activityIcon(activity.activity)}"></i></span>
          <span class="dashboard-feed-copy">
            <strong>${escapeHtml(activity.reference)} - ${escapeHtml(activity.activity)}</strong>
            <span>${escapeHtml(activity.details)} - ${formatDate(activity.date)}</span>
          </span>
        </div>
      </td>
    </tr>
  `).join("") || emptyRow(4);
}

function renderRequests() {
  const rows = state.requests.flatMap((request) => request.items.map((item) => ({ request, item })))
    .filter(({ item }) => requestsFilter === "All" || item.approvalStatus === requestsFilter);
  const pageCount = Math.max(1, Math.ceil(rows.length / REQUESTS_PAGE_SIZE));
  requestsPage = Math.min(Math.max(1, requestsPage), pageCount);
  const start = (requestsPage - 1) * REQUESTS_PAGE_SIZE;
  const pageRows = rows.slice(start, start + REQUESTS_PAGE_SIZE);
  document.getElementById("requestsTable").innerHTML = pageRows.map(({ request, item }) => {
    return `
      <tr>
        <td>${escapeHtml(request.requestId)}</td>
        <td>${escapeHtml(request.requester)}</td>
        <td>${escapeHtml(request.department)}</td>
        <td>${escapeHtml(request.managerEmail || "")}</td>
        <td>${escapeHtml(request.location)}</td>
        <td>${escapeHtml(item.itemCode)}</td>
        <td>${escapeHtml(item.itemName)}</td>
        <td>${escapeHtml(item.type || "")}</td>
        <td>${escapeHtml(item.quantity)}</td>
        <td>${statusBadge(item.approvalStatus)}</td>
        <td>${statusBadge(item.issuanceStatus)}</td>
        <td>${formatDate(request.date)}</td>
      </tr>`;
  }).join("") || emptyRow(12);
  document.getElementById("requestsPageInfo").textContent = `Page ${requestsPage} of ${pageCount}`;
  document.getElementById("requestsPrev").disabled = requestsPage === 1;
  document.getElementById("requestsNext").disabled = requestsPage === pageCount;
}

function requesterMatchesCurrentUser(request) {
  const email = String(currentUser.email || "").trim().toLowerCase();
  const name = String(currentUser.name || "").trim().toLowerCase();
  if (email) return String(request.requesterEmail || "").trim().toLowerCase() === email;
  if (name && name !== "inventory manager") return String(request.requester || "").trim().toLowerCase() === name;
  return true;
}

function requestLineRows(requests) {
  return requests.flatMap((request) => request.items.map((item) => ({ request, item })));
}

function requestTrackingRow({ request, item }) {
  return `
    <tr>
      <td>${escapeHtml(request.requestId)}</td>
      <td>${escapeHtml(request.requester)}</td>
      <td>${escapeHtml(request.department)}</td>
      <td>${escapeHtml(request.managerEmail || "")}</td>
      <td>${escapeHtml(request.location)}</td>
      <td>${escapeHtml(item.itemCode)}</td>
      <td>${escapeHtml(item.itemName)}</td>
      <td>${escapeHtml(item.type || "")}</td>
      <td>${escapeHtml(item.quantity)}</td>
      <td>${statusBadge(item.approvalStatus)}</td>
      <td>${statusBadge(item.issuanceStatus)}</td>
      <td>${formatDate(request.date)}</td>
    </tr>`;
}

function renderRequisition() {
  const rows = requestLineRows(state.requests.filter(requesterMatchesCurrentUser));
  const table = document.getElementById("myRequestsTable");
  if (!table) return;
  table.innerHTML = rows.map(requestTrackingRow).join("") || emptyRow(12);
}

function renderInventory() {
  const rows = stockRows().filter((row) => {
    const matchesCategory = inventoryCategoryFilter === "All" || row.category === inventoryCategoryFilter;
    const matchesLocation = inventoryLocationFilter === "All" || row.location === inventoryLocationFilter;
    const matchesStatus = inventoryStatusFilter === "All" || row.status === inventoryStatusFilter;
    return matchesCategory && matchesLocation && matchesStatus;
  });
  const pageCount = Math.max(1, Math.ceil(rows.length / INVENTORY_PAGE_SIZE));
  inventoryPage = Math.min(Math.max(1, inventoryPage), pageCount);
  const start = (inventoryPage - 1) * INVENTORY_PAGE_SIZE;
  const pageRows = rows.slice(start, start + INVENTORY_PAGE_SIZE);
  document.getElementById("inventoryTable").innerHTML = pageRows.map((row) => `
    <tr><td>${row.code}</td><td>${row.name}</td><td>${row.type}</td><td>${row.category}</td><td>${row.location}</td><td>${row.stock}</td><td>${statusBadge(row.status)}</td></tr>
  `).join("") || emptyRow(7);
  document.getElementById("inventoryPageInfo").textContent = `Page ${inventoryPage} of ${pageCount}`;
  document.getElementById("inventoryPrev").disabled = inventoryPage === 1;
  document.getElementById("inventoryNext").disabled = inventoryPage === pageCount;
}

function renderIssue() {
  const rows = state.requests.flatMap((request) => request.items
    .filter((item) => item.approvalStatus === "Approved" && !["Issued", "Rejected", "Cancelled"].includes(item.issuanceStatus))
    .map((item) => {
      const available = stockFor(item.itemCode, request.location);
      const approvedQty = Number(item.quantityApproved || item.quantity || 0);
      const issuedQty = Number(item.quantityIssued || 0);
      const remainingQty = Math.max(approvedQty - issuedQty, 0) || Number(item.quantity || 0);
      return `<tr>
        <td>${request.requestId}</td><td>${item.itemCode} - ${item.itemName}</td><td>${request.location}</td><td>${remainingQty}</td><td>${available}</td>
        <td><input class="table-input" type="number" min="1" max="${remainingQty}" value="${remainingQty}" id="qty-${item.id}"></td>
        <td><input class="table-input" placeholder="Issued by" id="by-${item.id}"></td>
        <td><button class="tiny success" onclick="issueItem('${request.requestId}','${item.id}')">Issue</button></td>
      </tr>`;
    }));
  document.getElementById("issueTable").innerHTML = rows.join("") || emptyRow(8);
}

function renderPO() {
  document.getElementById("poTable").innerHTML = state.purchaseOrders.map((po) => `
    <tr>
      <td>${po.poNumber}</td>
      <td>${formatDate(po.issueDate || po.date)}</td>
      <td>${po.vendorName}</td>
      <td>${po.itemCode ? `${po.itemCode} - ` : ""}${po.itemName || po.specifications || po.description || ""}</td>
      <td>${money(po.quantityOrdered ?? po.quantity)}</td>
      <td>${money(po.unitPrice)}</td>
      <td>${money(po.poAmount ?? po.total)}</td>
      <td>${statusBadge(po.status)}</td>
      <td>${formatDate(po.arrivedBy)}</td>
      <td>${po.location || ""}</td>
      <td>${money(po.quantityReceived)}</td>
      <td class="po-cancel-reason">${escapeHtml(cancellationReason(po.notesRemarks) || "")}</td>
      <td class="button-cell">
        <button class="tiny" onclick="printPO('${po.poNumber}')">Print</button>
        ${canCancelPo(po) ? `<button class="tiny danger" onclick="cancelPO('${po.poNumber}')">Cancel</button>` : ""}
      </td>
    </tr>
  `).join("") || emptyRow(13);
}

function collectPurchaseOrder(formElement) {
  const form = new FormData(formElement);
  const vendorValue = String(form.get("vendorId") || "").trim().toLowerCase();
  const vendor = state.vendors.find((row) => String(row.id) === String(form.get("vendorId")) || String(row.name || "").trim().toLowerCase() === vendorValue);
  const item = findItem(form.get("itemCode"));
  const quantityOrdered = Number(form.get("quantityOrdered"));
  const unitPrice = Number(form.get("unitPrice"));
  const taxRate = Number(form.get("taxRate")) || 0;
  const subtotal = quantityOrdered * unitPrice;
  const taxAmount = subtotal * (taxRate / 100);
  const poNumber = String(form.get("poNumber") || "").trim() || nextId("PO", state.purchaseOrders.map((po) => ({ poNumber: po.poNumber })));

  return {
    poNumber,
    vendorId: vendor?.id || "",
    vendorName: vendor?.name || "",
    vendorContact: String(form.get("vendorContact") || vendor?.phone || vendor?.contact || "").trim(),
    vendorAddress: String(form.get("vendorAddress") || vendor?.address || "").trim(),
    issueDate: form.get("issueDate") || isoToday(),
    focalPerson: String(form.get("focalPerson") || "").trim(),
    budgetLine: String(form.get("budgetLine") || "").trim(),
    bankName: String(form.get("bankName") || "").trim(),
    accountTitle: String(form.get("accountTitle") || "").trim(),
    accountNo: String(form.get("accountNo") || "").trim(),
    status: form.get("status"),
    location: form.get("location"),
    arrivedBy: form.get("arrivedBy"),
    serviceStartDate: form.get("serviceStartDate"),
    serviceCompletionDate: form.get("serviceCompletionDate"),
    paymentTerms: String(form.get("paymentTerms") || "").trim(),
    deliveryTerms: String(form.get("deliveryTerms") || "").trim(),
    quotationReference: String(form.get("quotationReference") || "").trim(),
    category: String(form.get("category") || item?.category || "").trim(),
    itemName: String(form.get("itemName") || item?.name || "").trim(),
    itemType: item?.type || "",
    itemCode: String(form.get("itemCode") || "").trim(),
    specifications: String(form.get("specifications") || "").trim(),
    quantityOrdered,
    unitPrice,
    subtotal,
    taxRate,
    taxAmount,
    poAmount: subtotal + taxAmount,
    quantityReceived: 0,
    approvedBy: String(form.get("approvedBy") || "").trim(),
    supplierSignatory: String(form.get("supplierSignatory") || "").trim(),
    notesRemarks: String(form.get("notesRemarks") || "").trim(),
    date: new Date().toISOString()
  };
}

function renderPurchaseOrderSheet(po) {
  const subTotal = Number(po.subtotal ?? (po.quantityOrdered || 0) * (po.unitPrice || 0));
  const taxRate = Number(po.taxRate || 0);
  const taxAmount = Number(po.taxAmount ?? subTotal * (taxRate / 100));
  const grandTotal = Number(po.poAmount ?? po.total ?? subTotal + taxAmount);
  const itemDescription = [po.itemName, po.itemType, po.specifications || po.description]
    .filter(Boolean)
    .join(" - ");
  const deliveryContact = [po.focalPerson, po.vendorContact && po.focalPerson ? "" : null]
    .filter(Boolean)
    .join("");
  const terms = [
    "A delivery or advice note must accompany all goods delivered and must bear this PO number.",
    "This PO's number must be quoted on all invoices corresponding to this order. Failure to do so may lead to delays in release of payments.",
    "Payment will be made as per agreed terms and schedule.",
    "The vendor will take full responsibility for delivery of this order as per agreed specifications and delivery terms.",
    "Shehersaaz will withhold applicable taxes and deposit the same in Government Treasury.",
    "Warranty, after-sale service, and replacement commitments must follow the invoice or agreed quotation."
  ];

  return `
    <section class="po-sheet po-form-document">
      <header class="po-form-header">
        <div class="po-form-title">
          <h1>PURCHASE/WORK ORDER</h1>
          <h1>Shehersaaz</h1>
          <p>Al-Zahir Plaza, Suite No: 04, 2nd Floor<br>Banigala, Islamabad</p>
        </div>
      </header>

      <div class="po-detail-grid">
        <div class="po-form-party">
          <h2>VENDOR DETAILS</h2>
          <dl>
            <dt>Name:</dt><dd>${escapeHtml(po.vendorName)}</dd>
            <dt>Address:</dt><dd>${escapeHtml(po.vendorAddress)}</dd>
            <dt>NTN:</dt><dd>${escapeHtml(po.vendorNtn || po.ntn || "")}</dd>
            <dt>Contact:</dt><dd>${escapeHtml(po.vendorContact)}</dd>
          </dl>
        </div>
        <div class="po-form-party">
          <h2>DELIVERY DETAILS</h2>
          <dl>
            <dt>Delivery Point:</dt><dd>Shehersaaz Warehouse</dd>
            <dt>Address:</dt><dd>${escapeHtml(po.location || "Street 14, Plot 100, I-9/2, Islamabad")}</dd>
            <dt>NTN:</dt><dd>${escapeHtml(po.deliveryNtn || "")}</dd>
            <dt>Focal Person:</dt><dd>${escapeHtml(deliveryContact || po.focalPerson)}</dd>
          </dl>
        </div>
      </div>

      <div class="po-detail-grid compact">
        <div class="po-form-party">
          <h2>PO REFERENCE INFORMATION</h2>
          <dl>
            <dt>PO Number:</dt><dd>${escapeHtml(po.poNumber)}</dd>
            <dt>Service Start Date:</dt><dd>${formatDate(po.serviceStartDate || po.issueDate)}</dd>
            <dt>Service Completion Date:</dt><dd>${formatDate(po.serviceCompletionDate || po.arrivedBy)}</dd>
            <dt>Payment Terms:</dt><dd>${escapeHtml(po.paymentTerms)}</dd>
            <dt>Delivery Terms:</dt><dd>${escapeHtml(po.deliveryTerms)}</dd>
          </dl>
        </div>
        <div class="po-form-party">
          <h2>BANK ACCOUNT DETAILS</h2>
          <dl>
            <dt>Bank:</dt><dd>${escapeHtml(po.bankName)}</dd>
            <dt>Account Title:</dt><dd>${escapeHtml(po.accountTitle)}</dd>
            <dt>Account No.:</dt><dd>${escapeHtml(po.accountNo)}</dd>
            <dt>Quotation Ref:</dt><dd>${escapeHtml(po.quotationReference)}</dd>
          </dl>
        </div>
      </div>

      <div class="po-form-section">
        <h2 class="po-section-bar">PO DETAILS</h2>
        <table class="po-items-table">
          <thead>
            <tr>
              <th>Description &amp; Specifications</th>
              <th>Qty</th>
              <th>Unit Price</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <strong>${escapeHtml(itemDescription || po.itemCode || "Item / service")}</strong>
                ${po.itemCode ? `<span>Item ID: ${escapeHtml(po.itemCode)}</span>` : ""}
              </td>
              <td>${money(po.quantityOrdered ?? po.quantity)}</td>
              <td>Rs. ${money(po.unitPrice)}</td>
              <td>Rs. ${money(subTotal)}</td>
            </tr>
          </tbody>
        </table>
        <div class="po-total-lines">
          <p><span>SUB TOTAL:</span><strong>Rs. ${money(subTotal)}</strong></p>
          <p><span>GST ${money(taxRate)}%:</span><strong>Rs. ${money(taxAmount)}</strong></p>
          <p><span>TOTAL:</span><strong>Rs. ${money(grandTotal)}</strong></p>
        </div>
      </div>

      <div class="po-form-section terms">
        <h2>TERMS AND CONDITIONS</h2>
        ${terms.map((term, index) => `<p><strong>${index + 1}.</strong> ${escapeHtml(term)}</p>`).join("")}
        ${po.notesRemarks ? `<p><strong>Notes:</strong> ${escapeHtml(po.notesRemarks)}</p>` : ""}
      </div>

      <footer class="po-signature-grid">
        <div>
          <p>Authorized By:</p>
          <span>(On behalf of Logistics &amp; Procurement Section)</span>
          <strong>Signature</strong>
          <em>Date: ___________</em>
        </div>
        <div>
          <p>Approved By:</p>
          <strong>${escapeHtml(po.approvedBy)}</strong>
          <strong>Signature</strong>
          <em>Date: ___________</em>
        </div>
      </footer>
    </section>
  `;
}

function openPoPreview(po) {
  pendingPurchaseOrder = po;
  document.getElementById("poPreviewContent").innerHTML = renderPurchaseOrderSheet(po);
  document.getElementById("poPreviewModal").classList.add("show");
  document.getElementById("poPreviewModal").setAttribute("aria-hidden", "false");
  if (window.lucide) window.lucide.createIcons();
}

function closePoPreview() {
  document.getElementById("poPreviewModal").classList.remove("show");
  document.getElementById("poPreviewModal").setAttribute("aria-hidden", "true");
}

function openPoCancelModal(poNumber) {
  pendingCancelPoNumber = poNumber;
  document.getElementById("poCancelSubtitle").textContent = `Add the reason before cancelling ${poNumber}.`;
  document.getElementById("poCancelReason").value = "";
  document.getElementById("poCancelModal").classList.add("show");
  document.getElementById("poCancelModal").setAttribute("aria-hidden", "false");
  setTimeout(() => document.getElementById("poCancelReason").focus(), 0);
  if (window.lucide) window.lucide.createIcons();
}

function closePoCancelModal() {
  pendingCancelPoNumber = "";
  document.getElementById("poCancelForm").reset();
  document.getElementById("poCancelModal").classList.remove("show");
  document.getElementById("poCancelModal").setAttribute("aria-hidden", "true");
}

function resetPoForm() {
  const form = document.getElementById("poForm");
  form.reset();
  [...form.elements].forEach((field) => {
    if (!field.name || field.type === "submit" || field.type === "button") return;
    field.value = "";
  });
  form.elements.vendorContact.value = "";
  form.elements.vendorAddress.value = "";
  form.elements.itemIdDisplay.value = "";
  form.elements.poAmount.value = "0";
  document.getElementById("poItemName").value = "";
  document.getElementById("poItemType").value = "";
  syncSelectOptions(form);
  updatePOAmount();
}

function resetGrnForm() {
  const form = document.getElementById("grnForm");
  form.reset();
  [...form.elements].forEach((field) => {
    if (!field.name || field.type === "submit" || field.type === "button") return;
    field.value = "";
  });
  document.getElementById("grnItemName").value = "";
  document.getElementById("grnItemType").value = "";
  document.getElementById("grnItemCode").value = "";
  ["qtyReceived", "qtyAccepted"].forEach((name) => {
    form.elements[name].removeAttribute("max");
    form.elements[name].placeholder = "";
  });
  syncSelectOptions(form);
}

async function savePendingPO() {
  if (!pendingPurchaseOrder) return;
  try {
    await apiRequest("/purchase-orders", { method: "POST", body: JSON.stringify(pendingPurchaseOrder) });
    resetPoForm();
    pendingPurchaseOrder = null;
    await loadBusinessData({ silent: true });
    render();
    closePoPreview();
    showToast("Purchase order saved.");
  } catch (error) {
    showToast(error.message, "error");
  }
}

function renderGRN() {
  document.getElementById("grnTable").innerHTML = state.grns.map((grn) => `
    <tr><td>${grn.grnNumber}</td><td>${grn.poNumber || "Manual"}</td><td>${grn.itemCode || ""}</td><td>${grn.itemName || grn.description || grn.itemType || "Specification only"}</td><td>${grn.location}</td><td>${money(grn.qtyReceived)}</td><td>${money(grn.qtyAccepted)}</td><td>${grn.stockMovementId ? `#${grn.stockMovementId}` : ""}</td><td>${grn.receivedBy}</td><td>${formatDate(grn.date)}</td></tr>
  `).join("") || emptyRow(10);
}

function applySelectedPoToGrn() {
  const poNumber = document.getElementById("poSelect")?.value;
  const po = state.purchaseOrders.find((row) => row.poNumber === poNumber);
  if (!po || !canReceivePo(po)) {
    resetGrnForm();
    return;
  }
  const itemNameInput = document.getElementById("grnItemName");
  const itemTypeInput = document.getElementById("grnItemType");
  const itemCodeInput = document.getElementById("grnItemCode");
  const locationSelect = document.querySelector("#grnForm [name='location']");
  const receivedInput = document.querySelector("#grnForm [name='qtyReceived']");
  const acceptedInput = document.querySelector("#grnForm [name='qtyAccepted']");
  const item = findItem(po.itemCode) || {};
  itemNameInput.value = po.itemName || item.name || "";
  itemTypeInput.value = po.itemType || item.type || "";
  itemCodeInput.value = po.itemCode || "";
  if (po.location) locationSelect.value = po.location;
  const remaining = remainingPoQuantity(po);
  receivedInput.max = remaining || "";
  acceptedInput.max = remaining || "";
  receivedInput.placeholder = remaining ? `Remaining: ${money(remaining)}` : "No quantity remaining";
  acceptedInput.placeholder = remaining ? `Remaining: ${money(remaining)}` : "No quantity remaining";
  if (remaining > 0 && !receivedInput.value) receivedInput.value = remaining;
  if (remaining > 0 && !acceptedInput.value) acceptedInput.value = remaining;
}

function applySelectedVendorToPo() {
  const form = document.getElementById("poForm");
  const vendorValue = String(form.elements.vendorId.value || "").trim().toLowerCase();
  const vendor = state.vendors.find((row) => String(row.id) === String(form.elements.vendorId.value) || String(row.name || "").trim().toLowerCase() === vendorValue);
  form.elements.vendorContact.value = vendor ? [vendor.contact, vendor.phone, vendor.email].filter(Boolean).join(" / ") : "";
  form.elements.vendorAddress.value = vendor?.address || "";
}

function updatePoItemId() {
  const form = document.getElementById("poForm");
  const itemCode = form.elements.itemCode.value;
  const item = findItem(itemCode);
  form.elements.itemIdDisplay.value = itemCode || "";
  if (item && !form.elements.specifications.value) {
    form.elements.specifications.value = `${item.name} - ${item.type}`;
  }
}

function renderTransport() {
  const actionCell = (row) => {
    if (row.approvalStatus !== "Approved") return `<td></td>`;
    return `<td class="button-cell"><button class="tiny success" onclick="setTransport('${row.id}','Arranged')">Arrange</button><button class="tiny danger" onclick="setTransport('${row.id}','Cancelled')">Cancel</button></td>`;
  };
  const goodsRows = state.transportRequests.filter((row) => row.transportType === "Goods Transport");
  const travelRows = state.transportRequests.filter((row) => row.transportType === "Travel Request");
  const localRows = state.transportRequests.filter((row) => row.transportType === "Local Visit / Meeting Transport");

  document.getElementById("goodsTransportTable").innerHTML = goodsRows.map((row) => `
    <tr><td>${row.id}</td><td>${row.requester}</td><td>${row.managerEmail || ""}</td><td>${formatDate(row.travelDate)}</td><td>${row.pickupTime || row.departureTime || ""}</td><td>${row.pickupLocation || ""}</td><td>${row.dropoffLocation || row.destination || ""}</td><td>${row.goodsDescription || ""}</td><td>${row.goodsQuantity || ""}</td><td>${row.vehicleType || ""}</td><td>${row.purpose || ""}</td><td>${statusBadge(row.approvalStatus)}</td><td>${statusBadge(row.arrangementStatus)}</td>${actionCell(row)}</tr>
  `).join("") || emptyRow(14);

  document.getElementById("travelTransportTable").innerHTML = travelRows.map((row) => `
    <tr><td>${row.id}</td><td>${row.requester}</td><td>${row.managerEmail || ""}</td><td>${formatDate(row.travelDate)}</td><td>${row.departureTime || ""}</td><td>${formatDate(row.returnDate)}</td><td>${row.pickupLocation || ""}</td><td>${row.destinationCityArea || row.destination || ""}</td><td>${row.tripDuration || ""}</td><td>${row.advanceRequired || ""}</td><td>${row.travelers || row.passengers || ""}</td><td>${row.vehicleType || ""}</td><td>${row.purpose || ""}</td><td>${statusBadge(row.approvalStatus)}</td><td>${statusBadge(row.arrangementStatus)}</td>${actionCell(row)}</tr>
  `).join("") || emptyRow(16);

  document.getElementById("localTransportTable").innerHTML = localRows.map((row) => `
    <tr><td>${row.id}</td><td>${row.requester}</td><td>${row.managerEmail || ""}</td><td>${formatDate(row.travelDate)}</td><td>${row.localDepartureTime || row.departureTime || ""}</td><td>${row.returnTime || ""}</td><td>${row.pickupLocation || ""}</td><td>${row.meetingVisitLocation || row.destination || ""}</td><td>${row.expectedDuration || ""}</td><td>${row.localPassengers || row.passengers || ""}</td><td>${row.vehicleType || ""}</td><td>${row.purpose || ""}</td><td>${statusBadge(row.approvalStatus)}</td><td>${statusBadge(row.arrangementStatus)}</td>${actionCell(row)}</tr>
  `).join("") || emptyRow(15);
}

function transportDestination(row) {
  return row.dropoffLocation || row.destinationCityArea || row.meetingVisitLocation || row.destination || "";
}

function renderApprovals() {
  const inventoryRows = state.requests.flatMap((request) => request.items
    .filter((item) => item.approvalStatus === "Pending")
    .map((item) => ({ request, item })));
  document.getElementById("inventoryApprovalsTable").innerHTML = inventoryRows.map(({ request, item }) => `
    <tr>
      <td>${escapeHtml(request.requestId)}</td>
      <td>${escapeHtml(request.requester)}</td>
      <td>${escapeHtml(request.department)}</td>
      <td>${escapeHtml(request.managerEmail || "")}</td>
      <td>${escapeHtml(request.location)}</td>
      <td>${escapeHtml(item.itemCode)}</td>
      <td>${escapeHtml(item.itemName)}</td>
      <td>${escapeHtml(item.type || "")}</td>
      <td>${escapeHtml(item.quantity)}</td>
      <td>${formatDate(request.date)}</td>
      <td class="button-cell"><button class="tiny success" onclick="setRequestApproval('${request.requestId}','${item.id}','Approved')">Approve</button><button class="tiny danger" onclick="setRequestApproval('${request.requestId}','${item.id}','Rejected')">Reject</button></td>
    </tr>
  `).join("") || emptyRow(11);

  const transportRows = state.transportRequests.filter((row) => row.approvalStatus === "Pending");
  document.getElementById("transportApprovalsTable").innerHTML = transportRows.map((row) => `
    <tr>
      <td>${escapeHtml(row.id)}</td>
      <td>${escapeHtml(row.transportType || "")}</td>
      <td>${escapeHtml(row.requester || "")}</td>
      <td>${escapeHtml(row.managerEmail || "")}</td>
      <td>${formatDate(row.travelDate || row.date)}</td>
      <td>${escapeHtml(row.pickupLocation || "")}</td>
      <td>${escapeHtml(transportDestination(row))}</td>
      <td>${escapeHtml(row.purpose || row.goodsDescription || "")}</td>
      <td>${statusBadge(row.approvalStatus)}</td>
      <td class="button-cell"><button class="tiny success" onclick="setTransportApproval('${row.id}','Approved')">Approve</button><button class="tiny danger" onclick="setTransportApproval('${row.id}','Rejected')">Reject</button></td>
    </tr>
  `).join("") || emptyRow(10);
}

function renderVendors() {
  document.getElementById("vendorsTable").innerHTML = state.vendors.map((vendor) => `
    <tr><td>${vendor.name}</td><td>${vendor.phone || ""}</td><td>${vendor.contact || ""}</td><td>${vendor.address || ""}</td></tr>
  `).join("") || emptyRow(4);
}

function renderAudit() {
  document.getElementById("auditTable").innerHTML = state.auditLogs.map((log) => `
    <tr><td>${new Date(log.date).toLocaleString()}</td><td>${log.action}</td><td>${log.entityType} ${log.entityId}</td><td>${log.details}</td></tr>
  `).join("") || emptyRow(4);
}

function detailsText(details) {
  if (!details) return "";
  if (typeof details === "string") {
    try {
      const parsed = JSON.parse(details);
      return Object.entries(parsed).map(([key, value]) => `${key}: ${value}`).join(" | ");
    } catch {
      return details;
    }
  }
  return Object.entries(details).map(([key, value]) => `${key}: ${value}`).join(" | ");
}

function detailsObject(details) {
  if (!details) return {};
  if (typeof details === "object") return details;
  try {
    return JSON.parse(details);
  } catch {
    return { details };
  }
}

function isApprovedHistory(log) {
  const details = detailsObject(log.details);
  const entity = String(log.entityType || "").toLowerCase();
  const field = String(details.field || "").toLowerCase();
  const toStatus = String(details.toStatus || details.status || "").toLowerCase();
  return toStatus === "approved" && (field.includes("approval") || entity.includes("request_item") || entity.includes("transport_requests"));
}

function isIssuedStockHistory(log) {
  const details = detailsObject(log.details);
  const entity = String(log.entityType || "").toLowerCase();
  const type = String(details.type || "").toLowerCase();
  const text = detailsText(log.details).toLowerCase();
  return entity.includes("stock_movements") && (
    type.includes("out") ||
    type.includes("request_issue") ||
    text.includes("request_issue") ||
    text.includes("manual_out") ||
    text.includes("issued")
  );
}

function isFulfilledHistory(log) {
  const details = detailsObject(log.details);
  const entity = String(log.entityType || "").toLowerCase();
  const field = String(details.field || "").toLowerCase();
  const toStatus = String(details.toStatus || details.status || "").toLowerCase();
  return ["issued", "fulfilled", "completed", "arranged"].includes(toStatus) && (
    field === "status" ||
    field === "issuance_status" ||
    entity.includes("request_item") ||
    entity.includes("requests") ||
    entity.includes("transport_requests")
  );
}

function isVisibleHistoryEvent(log) {
  return isApprovedHistory(log) || isIssuedStockHistory(log) || isFulfilledHistory(log);
}

function historyRows(section) {
  return state.auditLogs.filter((log) => {
    if (!isVisibleHistoryEvent(log)) return false;
    const entity = String(log.entityType || "").toLowerCase();
    if (section === "requests") return entity.includes("request") || isIssuedStockHistory(log);
    if (section === "approvals") return isApprovedHistory(log);
    if (section === "stockIn") return false;
    if (section === "stockOut") return isIssuedStockHistory(log);
    return false;
  });
}

function compactDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function historyRef(details, log) {
  return details.requestNumber || details.requestId || details.poNumber || details.movementNumber || `${log.entityType || ""}-${log.entityId || ""}`;
}

function historyKind(log, details) {
  const entity = String(log.entityType || "").toLowerCase();
  const text = `${detailsText(log.details)} ${entity}`.toLowerCase();
  if (entity.includes("transport") || text.includes("transport") || String(details.requestNumber || "").startsWith("TRQ")) return "transport";
  return "items";
}

function historyIcon(entry) {
  if (entry.title.toLowerCase().includes("arranged")) return ["truck", "blue"];
  if (entry.title.toLowerCase().includes("approved")) return ["check", "green"];
  if (entry.title.toLowerCase().includes("issued")) return ["package-check", "purple"];
  return entry.kind === "transport" ? ["route", "blue"] : ["package", "purple"];
}

function historySummary(log) {
  const details = detailsObject(log.details);
  const kind = historyKind(log, details);
  const ref = historyRef(details, log);
  const field = String(details.field || "").toLowerCase();
  const toStatus = details.toStatus || details.status || "";
  let title = `${ref} updated`;
  let subtitle = "Activity recorded";

  if (kind === "transport" && field === "approval_status") {
    title = `${ref} ${String(toStatus || "updated").toLowerCase()}`;
    subtitle = "Transport request status changed";
  } else if (kind === "transport" && field === "status") {
    title = `${ref} ${String(toStatus || "updated").toLowerCase()}`;
    subtitle = toStatus === "Arranged" ? "Transport has been scheduled" : "Transport arrangement status changed";
  } else if (field === "approval_status" || details.fromStatus || details.toStatus) {
    title = `${ref} item ${String(toStatus || "updated").toLowerCase()}`;
    subtitle = "Request item status updated";
  } else if (String(details.type || "").includes("OUT") || String(details.type || "").includes("REQUEST_ISSUE") || String(details.movementNumber || "").startsWith("MOV")) {
    title = `${ref} stock issued`;
    subtitle = details.type ? String(details.type).replace(/_/g, " ").toLowerCase() : "Issued stock recorded";
  }

  return { details, kind, ref, title, subtitle, id: `${log.entityType}-${log.entityId}-${log.date}-${title}` };
}
function transportForHistory(entry) {
  return state.transportRequests.find((row) => row.requestId === entry.ref || String(row.id) === String(entry.details.transportRequestId || entry.details.id || entry.details.entityId));
}

function requestForHistory(entry) {
  return state.requests.find((row) => row.requestId === entry.ref || row.items?.some((item) => String(item.id) === String(entry.details.itemId)));
}

function historyDetailGrid(entry) {
  if (!expandedHistoryIds.has(entry.id)) return "";
  const transport = entry.kind === "transport" ? transportForHistory(entry) : null;
  const request = entry.kind === "items" ? requestForHistory(entry) : null;
  const d = entry.details;
  const cells = entry.kind === "transport" ? [
    ["Requested by", transport?.requester || d.requester],
    ["Purpose", transport?.purpose || d.purpose],
    ["Destination", transportDestination(transport || {}) || d.destination || d.dropoffLocation],
    ["Pickup", [transport?.pickupLocation || d.pickupLocation, transport?.location || d.location].filter(Boolean).join(" -> ")],
    ["Travel date", formatDate(transport?.travelDate || d.travelDate || d.transportDate)],
    ["Departure", transport?.departureTime || transport?.localDepartureTime || transport?.pickupTime || d.departureTime],
    ["Vehicle", transport?.vehicleType || d.vehicleType],
    ["Passengers", transport?.passengers || transport?.travelers || transport?.localPassengers || d.passengers],
    ["Duration", transport?.expectedDuration || transport?.tripDuration || d.duration],
    ["Department", transport?.department || d.department],
    ["Type", transport?.transportType || d.transportType],
    ["Requester email", transport?.requesterEmail || d.requesterEmail]
  ] : [
    ["Request", request?.requestId || entry.ref],
    ["Requester", request?.requester || d.requester],
    ["Department", request?.department || d.department],
    ["Location", request?.location || d.location],
    ["Status", [d.fromStatus, d.toStatus].filter(Boolean).join(" -> ") || d.status],
    ["Item", d.itemCode || d.itemId || d.itemName],
    ["Quantity", d.quantity],
    ["Movement", d.movementNumber],
    ["Notes", d.notes || d.details]
  ];
  return `<div class="history-details">${cells.filter(([, value]) => value !== undefined && value !== null && value !== "").map(([label, value]) => `
    <div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>
  `).join("")}</div>`;
}

function renderHistoryPage() {
  const titles = {
    requests: ["Requests history", "Tap any entry to see details"],
    approvals: ["Approvals history", "Tap any entry to see details"],
    stockIn: ["Stock in history", "Tap any entry to see details"],
    stockOut: ["Stock out history", "Tap any entry to see details"]
  };
  const [title, description] = titles[activeHistorySection] || titles.requests;
  setText("historyTitle", title);
  setText("historyDescription", description);
  document.querySelectorAll("[data-history-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.historyFilter === activeHistoryFilter);
  });
  const list = document.getElementById("historyList");
  if (!list) return;
  const entries = historyRows(activeHistorySection)
    .map((log) => ({ log, ...historySummary(log) }))
    .filter((entry) => activeHistoryFilter === "all" || entry.kind === activeHistoryFilter);
  list.innerHTML = entries.map((entry) => {
    const [icon, tone] = historyIcon(entry);
    const open = expandedHistoryIds.has(entry.id);
    return `<article class="history-entry ${open ? "open" : ""}" data-history-entry="${escapeHtml(entry.id)}">
      <button class="history-entry-main" type="button">
        <span class="history-icon ${tone}"><i data-lucide="${icon}"></i></span>
        <span class="history-copy"><strong>${escapeHtml(entry.title)}</strong><span>${escapeHtml(entry.subtitle)}</span></span>
        <span class="history-meta"><strong>${escapeHtml(compactDate(entry.log.date))}</strong><em>${escapeHtml(entry.ref)}</em></span>
        <i class="history-chevron" data-lucide="chevron-down"></i>
      </button>
      ${historyDetailGrid(entry)}
    </article>`;
  }).join("") || `<div class="history-empty">No history yet</div>`;
}

function emptyRow(cols) {
  return `<tr><td colspan="${cols}" class="empty">No records yet</td></tr>`;
}

function render() {
  syncSelectOptions();
  renderCategoryTabs();
  updateStockInItemId();
  updateStockOutItemId();
  renderDashboard();
  renderRequests();
  renderRequisition();
  renderInventory();
  renderIssue();
  renderPO();
  renderGRN();
  renderTransport();
  renderApprovals();
  renderVendors();
  renderAudit();
  renderHistoryPage();
  if (document.getElementById("settingsView").classList.contains("active")) renderSettings();
  if (document.getElementById("notificationCenter").classList.contains("show")) renderNotificationCenter();
  updateNotificationBadge();
  if (window.lucide) window.lucide.createIcons();
}

window.issueItem = async function (requestId, itemId) {
  const request = state.requests.find((row) => row.requestId === requestId);
  const item = request?.items.find((row) => String(row.id) === String(itemId));
  if (!request || !item) return showToast("Request item not found.", "error");
  const qty = Number(document.getElementById(`qty-${item.id}`).value);
  const issuedBy = document.getElementById(`by-${item.id}`).value || "Inventory Manager";
  const available = stockFor(item.itemCode, request.location);
  const approvedQty = Number(item.quantityApproved || item.quantity || 0);
  const issuedQty = Number(item.quantityIssued || 0);
  const remainingQty = Math.max(approvedQty - issuedQty, 0) || Number(item.quantity || 0);
  if (item.approvalStatus !== "Approved") return showToast("Approval is required before issuance.", "error");
  if (!qty || qty < 1) return showToast("Issue quantity must be greater than zero.", "error");
  if (qty > remainingQty) return showToast(`Issue quantity cannot exceed remaining approved quantity (${remainingQty}).`, "error");
  if (available < qty) return showToast("Stock unavailable. Mark this request for procurement.", "error");
  try {
    await apiRequest(`/requests/${encodeURIComponent(requestId)}/items/${encodeURIComponent(itemId)}/issue`, {
      method: "POST",
      body: JSON.stringify({ quantity: qty, issuedBy, notes: `Issued by ${issuedBy}` })
    });
    await loadBusinessData({ silent: true });
    render();
    showToast("Stock issued and request status updated.");
  } catch (error) {
    showToast(error.message, "error");
  }
};

window.setTransport = async function (id, status) {
  const row = state.transportRequests.find((item) => String(item.id) === String(id));
  if (!row) return showToast("Transport request not found.", "error");
  try {
    await apiRequest(`/transport-requests/${encodeURIComponent(id)}/arrangement`, {
      method: "PUT",
      body: JSON.stringify({ status })
    });
    await loadBusinessData({ silent: true });
    render();
    showToast(`Transport ${status.toLowerCase()}.`);
  } catch (error) {
    showToast(error.message, "error");
  }
};

window.setRequestApproval = async function (requestId, itemId, status) {
  const request = state.requests.find((row) => row.requestId === requestId);
  const item = request?.items.find((row) => String(row.id) === String(itemId));
  if (!request || !item) return showToast("Request item not found.", "error");
  try {
    await apiRequest(`/requests/${encodeURIComponent(requestId)}/items/${encodeURIComponent(itemId)}/approval`, {
      method: "PUT",
      body: JSON.stringify({ status })
    });
    await loadBusinessData({ silent: true });
    render();
    showToast(`Request ${status.toLowerCase()}.`);
  } catch (error) {
    showToast(error.message, "error");
  }
};

window.setTransportApproval = async function (id, status) {
  const row = state.transportRequests.find((item) => String(item.id) === String(id));
  if (!row) return showToast("Transport request not found.", "error");
  try {
    await apiRequest(`/transport-requests/${encodeURIComponent(id)}/approval`, {
      method: "PUT",
      body: JSON.stringify({ status })
    });
    await loadBusinessData({ silent: true });
    render();
    showToast(`Transport request ${status.toLowerCase()}.`);
  } catch (error) {
    showToast(error.message, "error");
  }
};

window.printPO = function (poNumber) {
  const po = state.purchaseOrders.find((row) => row.poNumber === poNumber);
  if (!po) return showToast("Purchase order not found.", "error");
  printHtml(renderPurchaseOrderSheet({
    subtotal: Number(po.subtotal ?? (po.quantityOrdered || 0) * (po.unitPrice || 0)),
    taxRate: Number(po.taxRate || 0),
    taxAmount: Number(po.taxAmount || 0),
    ...po
  }));
};

window.cancelPO = async function (poNumber) {
  const po = state.purchaseOrders.find((row) => row.poNumber === poNumber);
  if (!po) return showToast("Purchase order not found.", "error");
  if (!canCancelPo(po)) return showToast("This purchase order cannot be cancelled.", "error");
  openPoCancelModal(poNumber);
};

async function submitPoCancellation(event) {
  event.preventDefault();
  const poNumber = pendingCancelPoNumber;
  const po = state.purchaseOrders.find((row) => row.poNumber === poNumber);
  if (!po) return showToast("Purchase order not found.", "error");
  if (!canCancelPo(po)) return showToast("This purchase order cannot be cancelled.", "error");
  const reason = String(new FormData(event.currentTarget).get("reason") || "").trim();
  if (!reason) return showToast("Cancellation reason is required.", "error");
  try {
    await apiRequest(`/purchase-orders/${encodeURIComponent(poNumber)}/cancel`, {
      method: "PUT",
      body: JSON.stringify({ reason })
    });
    await loadBusinessData({ silent: true });
    render();
    closePoCancelModal();
    showToast(`${poNumber} cancelled.`);
  } catch (error) {
    showToast(error.message, "error");
  }
}

function printHtml(html) {
  const printWindow = window.open("", "_blank", "width=800,height=700");
  printWindow.document.write(`
    <html>
      <head>
        <title>Print</title>
        <style>
          @page { size: A4; margin: 10mm; }
          * { box-sizing: border-box; }
          body { margin: 0; padding: 0; background: #fff; color: #333; font-family: Arial, sans-serif; }
          .po-sheet { width: 100%; max-width: 190mm; margin: 0 auto; padding: 0; border: 0; box-shadow: none; font-size: 11px; }
          .po-form-header { padding: 18px 20px; color: #2c3e50; text-align: center; border-top: 28px solid #2c3e50; border-bottom: 2px solid #2c3e50; }
          .po-form-title h1:first-child { margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 0; }
          .po-form-title h1:nth-child(2) { margin: 7px 0 0; font-size: 18px; font-weight: 800; }
          .po-form-header p { margin: 12px 0 0; color: #555; line-height: 1.45; }
          .po-detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 34px; margin-top: 18px; break-inside: avoid; }
          .po-detail-grid.compact { margin-top: 18px; }
          .po-form-party { min-height: 110px; padding-top: 0; }
          .po-form-party h2, .po-form-section h2 { margin: 0 0 12px; color: #2c3e50; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0; }
          .po-form-party dl { display: grid; grid-template-columns: 125px 1fr; gap: 7px 8px; margin: 0; }
          .po-form-party dt { margin: 0; color: #2c3e50; font-weight: 800; }
          .po-form-party dd { margin: 0; line-height: 1.35; }
          .po-form-section { margin-top: 20px; break-inside: avoid; }
          .po-section-bar { margin: 0; padding: 10px 12px; color: #fff !important; background: #2c3e50; }
          .po-items-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
          .po-items-table th { padding: 10px; color: #fff; background: #34495e; border: 1px solid #ddd; font-weight: 800; text-align: left; }
          .po-items-table th:nth-child(2), .po-items-table td:nth-child(2) { width: 12%; text-align: center; }
          .po-items-table th:nth-child(3), .po-items-table th:nth-child(4), .po-items-table td:nth-child(3), .po-items-table td:nth-child(4) { width: 18%; text-align: right; }
          .po-items-table td { min-height: 82px; padding: 14px 10px; vertical-align: top; border: 1px solid #ddd; line-height: 1.4; }
          .po-items-table td strong, .po-items-table td span { display: block; }
          .po-items-table td span { margin-top: 8px; color: #555; }
          .po-total-lines { width: 34%; min-width: 245px; margin-left: auto; border-right: 1px solid #ddd; border-left: 1px solid #ddd; }
          .po-total-lines p { display: flex; justify-content: space-between; gap: 12px; margin: 0; padding: 10px 12px; border-bottom: 1px solid #ddd; }
          .po-total-lines p:last-child { color: #2c3e50; font-size: 14px; font-weight: 800; }
          .po-form-section.terms { break-before: page; padding-top: 24px; border-top: 28px solid #2c3e50; }
          .po-form-section.terms p { margin: 0 0 12px; line-height: 1.5; }
          .po-signature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 52px; break-inside: avoid; }
          .po-signature-grid > div { min-height: 116px; padding: 16px; color: #fff; background: #333; text-align: center; }
          .po-signature-grid p, .po-signature-grid strong, .po-signature-grid span, .po-signature-grid em { display: block; margin: 0 0 10px; font-style: normal; }
          .po-signature-grid strong:last-of-type { margin-top: 56px; }
        </style>
      </head>
      <body>${html}</body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 150);
}

document.getElementById("sideNav").addEventListener("click", (event) => {
  const toggle = event.target.closest(".nav-section-toggle");
  if (toggle) {
    const section = toggle.closest(".nav-section");
    const collapsed = section.classList.toggle("collapsed");
    toggle.setAttribute("aria-expanded", String(!collapsed));
    return;
  }
  const item = event.target.closest("[data-view]");
  if (!item) return;
  if (item.dataset.view === "requests") {
    requestsFilter = "All";
    requestsPage = 1;
  }
  if (item.dataset.view === "inventory") {
    inventoryStatusFilter = "All";
    inventoryPage = 1;
  }
  setView(item.dataset.view);
});

document.getElementById("dashboardView").addEventListener("click", (event) => {
  const menuButton = event.target.closest("[data-menu-toggle]");
  if (menuButton) {
    event.stopPropagation();
    toggleDashboardMenu(menuButton.dataset.menuToggle, menuButton);
    return;
  }
  const actionButton = event.target.closest("[data-dashboard-action]");
  if (actionButton) {
    event.stopPropagation();
    const action = actionButton.dataset.dashboardAction;
    closeDashboardMenus();
    handleDashboardAction(action);
    return;
  }
  const row = event.target.closest("[data-dashboard-request]");
  if (!row) return;
  setView("requests");
});

document.getElementById("dashboardView").addEventListener("keydown", (event) => {
  if (!["Enter", " "].includes(event.key)) return;
  const actionTarget = event.target.closest("[data-dashboard-action]");
  if (!actionTarget || actionTarget.tagName === "BUTTON") return;
  event.preventDefault();
  handleDashboardAction(actionTarget.dataset.dashboardAction);
});

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-history-page]");
  if (!button) return;
  openHistoryPage(button.dataset.historyPage);
});

document.getElementById("historyView").addEventListener("click", (event) => {
  const tab = event.target.closest("[data-history-filter]");
  if (tab) {
    activeHistoryFilter = tab.dataset.historyFilter;
    renderHistoryPage();
    if (window.lucide) window.lucide.createIcons();
    return;
  }
  const entry = event.target.closest("[data-history-entry]");
  if (!entry) return;
  const id = entry.dataset.historyEntry;
  expandedHistoryIds.has(id) ? expandedHistoryIds.delete(id) : expandedHistoryIds.add(id);
  renderHistoryPage();
  if (window.lucide) window.lucide.createIcons();
});

document.getElementById("historyBackBtn")?.addEventListener("click", () => setView(previousHistoryView || "dashboard"));

document.getElementById("notificationBtn").addEventListener("click", (event) => {
  event.stopPropagation();
  toggleNotificationCenter();
});

document.getElementById("closeNotificationCenter").addEventListener("click", closeNotificationCenter);

document.getElementById("notificationCenter").addEventListener("click", (event) => {
  event.stopPropagation();
  const tab = event.target.closest("[data-notification-tab]");
  if (tab) {
    activeNotificationTab = tab.dataset.notificationTab;
    renderNotificationCenter();
  }
});

document.getElementById("unreadOnlyToggle").addEventListener("change", (event) => {
  unreadOnly = event.target.checked;
  renderNotificationCenter();
});

document.getElementById("markNotificationsRead").addEventListener("click", () => {
  notificationSeed().forEach((item) => readNotificationIds.add(item.id));
  showToast("Notifications marked as read.");
  unreadOnly = false;
  document.getElementById("unreadOnlyToggle").checked = false;
  renderNotificationCenter();
  updateNotificationBadge();
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".kebab-wrap")) closeDashboardMenus();
  if (!event.target.closest("#notificationCenter") && !event.target.closest("#notificationBtn")) closeNotificationCenter();
  if (!event.target.closest("#profileMenu") && !event.target.closest("#profileBtn")) {
    const pm = document.getElementById("profileMenu");
    if (pm && pm.classList.contains("show")) {
      pm.classList.remove("show");
      pm.setAttribute("aria-hidden", "true");
    }
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeDashboardMenus();
    closeNotificationCenter();
    closePoCancelModal();
  }
});

document.getElementById("topSettingsBtn")?.addEventListener("click", () => setView("settings"));

document.getElementById("profileBtn")?.addEventListener("click", (event) => {
  event.stopPropagation();
  const pm = document.getElementById("profileMenu");
  if (!pm) return;
  const open = pm.classList.toggle("show");
  pm.setAttribute("aria-hidden", String(!open));
});

document.getElementById("logoutBtn")?.addEventListener("click", async () => {
  localStorage.removeItem("firebase_token");
  if (window.imsFirebaseSignOut) await window.imsFirebaseSignOut();
  window.location.replace("login.html");
});

document.getElementById("settingsTabs").addEventListener("click", (event) => {
  const button = event.target.closest("[data-settings-group]");
  if (!button) return;
  activeSettingsGroup = button.dataset.settingsGroup;
  renderSettings();
});

document.getElementById("settingsForm").addEventListener("submit", saveActiveSettings);

document.getElementById("settingsForm").addEventListener("click", (event) => {
  if (event.target.id === "reloadSettingsBtn") loadSettings({ silent: false });
});

document.getElementById("sidebarToggle").addEventListener("click", () => {
  const shell = document.querySelector(".app-shell");
  const collapsed = shell.classList.toggle("sidebar-collapsed");
  const toggle = document.getElementById("sidebarToggle");
  toggle.setAttribute("aria-expanded", String(!collapsed));
  toggle.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
  toggle.innerHTML = `<i data-lucide="${collapsed ? "panel-left-open" : "panel-left-close"}"></i>`;
  if (window.lucide) window.lucide.createIcons();
});

document.getElementById("categoryTabs").addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  inventoryCategoryFilter = button.dataset.category;
  inventoryPage = 1;
  document.querySelectorAll(".category-tab").forEach((tab) => tab.classList.toggle("active", tab === button));
  renderInventory();
});

document.getElementById("inventoryLocationFilter").addEventListener("change", (event) => {
  inventoryLocationFilter = event.target.value || "All";
  inventoryPage = 1;
  renderInventory();
});

document.getElementById("inventoryPrev").addEventListener("click", () => {
  inventoryPage -= 1;
  renderInventory();
});

document.getElementById("inventoryNext").addEventListener("click", () => {
  inventoryPage += 1;
  renderInventory();
});

document.getElementById("requestsPrev").addEventListener("click", () => {
  requestsPage -= 1;
  renderRequests();
});

document.getElementById("requestsNext").addEventListener("click", () => {
  requestsPage += 1;
  renderRequests();
});

document.getElementById("openRequisitionForm")?.addEventListener("click", () => {
  const portalUser = {
    name: currentUser.name || "Inventory Manager",
    email: currentUser.email || "admin@shehersaaz.local",
    role: currentUser.role || "Requester"
  };
  sessionStorage.setItem("loggedInUser", JSON.stringify(portalUser));
  localStorage.setItem("imsPortalUser", JSON.stringify(portalUser));
  window.open("/requisition-form", "_blank", "noopener");
});

document.getElementById("addRequestItem").addEventListener("click", addRequestLine);
document.getElementById("addItemType").addEventListener("click", addItemTypeLine);
document.getElementById("openItemModal").addEventListener("click", openItemModal);
document.getElementById("closeItemModal").addEventListener("click", closeItemModal);
document.getElementById("cancelItemModal").addEventListener("click", closeItemModal);
document.getElementById("itemModal").addEventListener("click", (event) => {
  if (event.target.id === "itemModal") closeItemModal();
});
document.getElementById("closePoPreview").addEventListener("click", closePoPreview);
document.getElementById("editPoPreview").addEventListener("click", closePoPreview);
document.getElementById("savePoPreview").addEventListener("click", savePendingPO);
document.getElementById("poPreviewModal").addEventListener("click", (event) => {
  if (event.target.id === "poPreviewModal") closePoPreview();
});
document.getElementById("closePoCancel").addEventListener("click", closePoCancelModal);
document.getElementById("dismissPoCancel").addEventListener("click", closePoCancelModal);
document.getElementById("poCancelForm").addEventListener("submit", submitPoCancellation);
document.getElementById("poCancelModal").addEventListener("click", (event) => {
  if (event.target.id === "poCancelModal") closePoCancelModal();
});

document.getElementById("stockInCategory").addEventListener("change", () => {
  document.getElementById("stockInItemName").value = "";
  document.getElementById("stockInItemType").value = "";
  syncSelectOptions(document.getElementById("stockInForm"));
  updateStockInItemId();
});

document.getElementById("stockInItemName").addEventListener("change", () => {
  document.getElementById("stockInItemType").value = "";
  syncSelectOptions(document.getElementById("stockInForm"));
  updateStockInItemId();
});

document.getElementById("stockInItemType").addEventListener("change", updateStockInItemId);

document.getElementById("stockOutCategory").addEventListener("change", () => {
  document.getElementById("stockOutItemName").value = "";
  document.getElementById("stockOutItemType").value = "";
  syncSelectOptions(document.getElementById("manualStockOutForm"));
  updateStockOutItemId();
});

document.getElementById("stockOutItemName").addEventListener("change", () => {
  document.getElementById("stockOutItemType").value = "";
  syncSelectOptions(document.getElementById("manualStockOutForm"));
  updateStockOutItemId();
});

document.getElementById("stockOutItemType").addEventListener("change", updateStockOutItemId);

function updatePOAmount() {
  const form = document.getElementById("poForm");
  const quantity = Number(form.elements.quantityOrdered.value) || 0;
  const unitPrice = Number(form.elements.unitPrice.value) || 0;
  const taxRate = Number(form.elements.taxRate.value) || 0;
  const subtotal = quantity * unitPrice;
  form.elements.poAmount.value = money(subtotal + subtotal * (taxRate / 100));
}

document.getElementById("poForm").elements.quantityOrdered.addEventListener("input", updatePOAmount);
document.getElementById("poForm").elements.unitPrice.addEventListener("input", updatePOAmount);
document.getElementById("poForm").elements.taxRate.addEventListener("input", updatePOAmount);
document.getElementById("poForm").elements.vendorId.addEventListener("change", applySelectedVendorToPo);
document.getElementById("poCategory").addEventListener("change", () => {
  document.getElementById("poItemName").value = "";
  document.getElementById("poItemType").value = "";
  updatePoItemId();
  syncSelectOptions(document.getElementById("poForm"));
});
document.getElementById("poItemName").addEventListener("change", () => {
  document.getElementById("poItemType").value = "";
  updatePoItemId();
  syncSelectOptions(document.getElementById("poForm"));
});
document.getElementById("poItemType").addEventListener("change", updatePoItemId);

document.getElementById("requestForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const rows = [...document.querySelectorAll("#requestItems .line-row")].map((row, index) => {
    const itemCode = row.querySelector("[name='itemCode']").value;
    const item = findItem(itemCode);
    return {
      itemCode,
      itemName: item?.name,
      type: item?.type,
      quantity: Number(row.querySelector("[name='quantity']").value)
    };
  });
  if (!rows.length) return showToast("Add at least one item.", "error");
  try {
    const result = await apiRequest("/requests", {
      method: "POST",
      body: JSON.stringify({
        requester: form.get("requester"),
        department: form.get("department"),
        location: form.get("location"),
        managerEmail: form.get("managerEmail"),
        requesterEmail: form.get("requesterEmail"),
        items: rows
      })
    });
    event.currentTarget.reset();
    document.getElementById("requestItems").innerHTML = "";
    addRequestLine();
    requestsPage = 1;
    await loadBusinessData({ silent: true });
    render();
    showToast(`${result.requestId} created.`);
  } catch (error) {
    showToast(error.message, "error");
  }
});

document.getElementById("stockInForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    await apiRequest("/stock/in/manual", { method: "POST", body: JSON.stringify(Object.fromEntries(form)) });
    event.currentTarget.reset();
    await loadBusinessData({ silent: true });
    render();
    showToast("Manual stock-in saved.");
  } catch (error) {
    showToast(error.message, "error");
  }
});

document.getElementById("manualStockOutForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const itemCode = form.get("itemCode");
  const location = form.get("location");
  const quantity = Number(form.get("quantity"));
  const available = stockFor(itemCode, location);
  if (!quantity || quantity < 1) return showToast("Stock out quantity must be greater than zero.", "error");
  if (available < quantity) return showToast("Stock unavailable for this manual stock out.", "error");
  try {
    await apiRequest("/stock/out", { method: "POST", body: JSON.stringify(Object.fromEntries(form)) });
    event.currentTarget.reset();
    await loadBusinessData({ silent: true });
    render();
    showToast("Manual stock-out saved.");
  } catch (error) {
    showToast(error.message, "error");
  }
});

document.getElementById("itemForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const category = String(form.get("newCategory") || form.get("category") || "").trim();
  const name = String(form.get("name")).trim();
  const unit = String(form.get("unit")).trim();
  const rows = [...document.querySelectorAll("#itemTypeRows .item-type-row")].map((row) => ({
    type: row.querySelector("[name='type']").value.trim(),
    code: row.querySelector("[name='code']").value.trim()
  }));
  if (!category) return showToast("Choose a category or enter a new category.", "error");
  if (!rows.length) return showToast("Add at least one item type.", "error");
  if (rows.some((row) => !row.type || !row.code)) return showToast("Each type needs an Item ID.", "error");
  const submittedCodes = rows.map((row) => row.code.toLowerCase());
  if (new Set(submittedCodes).size !== submittedCodes.length) return showToast("Item ID already exists in this form.", "error");
  const duplicate = rows.find((row) => state.items.some((item) => item.code.toLowerCase() === row.code.toLowerCase()));
  if (duplicate) return showToast(`Item ID already exists: ${duplicate.code}`, "error");
  try {
    await apiRequest("/items", { method: "POST", body: JSON.stringify({ category, name, unit, types: rows }) });
    event.currentTarget.reset();
    document.getElementById("itemTypeRows").innerHTML = "";
    addItemTypeLine();
    closeItemModal();
    await loadBusinessData({ silent: true });
    render();
    showToast("Inventory item added.");
  } catch (error) {
    showToast(error.message, "error");
  }
});

document.getElementById("poForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const po = collectPurchaseOrder(event.currentTarget);
  if (!po.vendorId) return showToast("Select a vendor.", "error");
  if (!po.itemCode) return showToast("Select item name and type for the PO.", "error");
  if (!po.quantityOrdered || po.quantityOrdered <= 0) return showToast("Quantity ordered must be greater than zero.", "error");
  if (!po.specifications) return showToast("Add PO specifications.", "error");
  if (state.purchaseOrders.some((row) => String(row.poNumber).toLowerCase() === po.poNumber.toLowerCase())) {
    return showToast("PO number already exists.", "error");
  }
  openPoPreview(po);
});

document.getElementById("grnForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const accepted = Number(form.get("qtyAccepted"));
  const received = Number(form.get("qtyReceived"));
  const po = state.purchaseOrders.find((row) => row.poNumber === form.get("poNumber"));
  const remaining = po ? remainingPoQuantity(po) : Infinity;
  if (!canReceivePo(po)) return showToast("Select an open PO with remaining quantity.", "error");
  if (accepted > received) return showToast("Accepted quantity cannot exceed received quantity.", "error");
  if (accepted > remaining) return showToast(`Accepted quantity cannot exceed remaining PO quantity (${money(remaining)}).`, "error");
  try {
    const result = await apiRequest("/grn", { method: "POST", body: JSON.stringify(Object.fromEntries(form)) });
    await loadBusinessData({ silent: true });
    resetGrnForm();
    render();
    showToast(`${result.grnNumber} saved and stock ledger updated.`);
  } catch (error) {
    showToast(error.message, "error");
  }
});

document.getElementById("poSelect").addEventListener("change", applySelectedPoToGrn);

document.getElementById("vendorForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    await apiRequest("/vendors", { method: "POST", body: JSON.stringify(Object.fromEntries(form)) });
    event.currentTarget.reset();
    await loadBusinessData({ silent: true });
    render();
    showToast("Vendor added.");
  } catch (error) {
    showToast(error.message, "error");
  }
});

document.getElementById("globalSearch").addEventListener("input", (event) => {
  const term = event.target.value.toLowerCase();
  document.querySelectorAll("tbody tr").forEach((row) => {
    row.style.display = row.textContent.toLowerCase().includes(term) ? "" : "none";
  });
});

async function initializePortal() {
  applyTheme(localStorage.getItem(THEME_STORAGE_KEY));
  const session = await requirePortalSession();
  if (!session) return;
  applyAdminVisibility();
  addRequestLine();
  addItemTypeLine();
  render();
  syncAuthState();
}

initializePortal();
