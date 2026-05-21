const STORAGE_KEY = "imsPortalStateV4";
const SETTINGS_CACHE_KEY = "imsSystemSettingsDraft";
const SETTINGS_API_BASE = "/api/settings";
const THEME_STORAGE_KEY = "imsTheme";
const BUSINESS_DATA_API_BASE = "/api";
const SUPABASE_URL = "https://xgjcesjksmhhvvvceegi.supabase.co";
const SUPABASE_KEY = "sb_publishable_SPL5YZrnxx5HT1Qom5vJpg_5F7osFOB";
const sb = window.supabase?.createClient(SUPABASE_URL, SUPABASE_KEY);
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

function redirectToLogin() {
  const target = window.location.protocol === "file:"
    ? "index.html"
    : `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const returnTo = encodeURIComponent(target);
  window.location.replace(`login.html?returnTo=${returnTo}`);
}

async function requirePortalSession() {
  // TEMP DEV BYPASS: auth is disabled so the portal can be opened directly while working locally.
  // To re-enable login/signup authorization, remove this return and restore the Supabase checks below.
  return {
    user: {
      id: currentUser.id,
      email: currentUser.email,
      user_metadata: { full_name: currentUser.name }
    },
    access_token: ""
  };

  /*
  if (!sb) {
    redirectToLogin();
    return null;
  }
  const { data, error } = await sb.auth.getSession();
  if (error || !data.session) {
    localStorage.removeItem("sb_token");
    redirectToLogin();
    return null;
  }
  const { session } = data;
  const metadata = session.user.user_metadata || {};
  localStorage.setItem("sb_token", session.access_token);
  currentUser = {
    ...currentUser,
    id: session.user.id,
    uid: session.user.id,
    name: metadata.full_name || metadata.name || session.user.email || "IMS User",
    email: session.user.email || "",
    role: metadata.role || "Admin",
    roles: Array.isArray(metadata.roles) ? metadata.roles : [metadata.role || "Admin"],
    status: "active"
  };
  isAdmin = currentUser.roles.includes("Admin") || currentUser.role === "Admin";
  return session;
  */
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
    ["item_categories", "Item categories", "textarea"], ["units_of_measurement", "Units of measurement", "textarea"], ["reorder_level_rules", "Reorder level rules", "textarea"],
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
  if (!saved && window.IMS_IMPORTED_INVENTORY) return structuredClone(window.IMS_IMPORTED_INVENTORY);
  if (!saved) return structuredClone(seedState);
  try {
    return JSON.parse(saved);
  } catch {
    return structuredClone(seedState);
  }
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
  return state.transactions
    .filter((entry) => entry.itemCode === itemCode && entry.location === location)
    .reduce((sum, entry) => {
      const isOut = ["STOCK_OUT", "ADJUSTMENT_OUT"].includes(entry.type);
      return sum + (isOut ? -entry.quantity : entry.quantity);
    }, 0);
}

function stockRows() {
  if (Array.isArray(state.inventoryRows) && state.inventoryRows.length) {
    return state.inventoryRows.map((row) => ({
      code: row.code,
      name: row.name,
      type: row.type,
      category: row.category,
      location: row.location,
      stock: Number(row.stock || 0),
      status: row.status
    }));
  }
  const pairs = new Map();
  state.items.forEach((item) => {
    state.locations.forEach((location) => pairs.set(`${item.code}|${location}`, { itemCode: item.code, location }));
  });
  state.transactions.forEach((entry) => pairs.set(`${entry.itemCode}|${entry.location}`, { itemCode: entry.itemCode, location: entry.location }));
  return [...pairs.values()].map((pair) => {
    const item = findItem(pair.itemCode) || {};
    const stock = stockFor(pair.itemCode, pair.location);
    const status = stock <= 0 ? "Out of stock" : stock <= (item.reorderLevel || 0) ? "Restock needed" : "OK";
    return { ...item, location: pair.location, stock, status };
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
  const token = localStorage.getItem("sb_token");
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

async function refreshVerifiedUserShell() {
  applyAdminVisibility();
  if (isAdmin && settingsLoadedForUser !== currentUser.id) {
    settingsLoadedForUser = currentUser.id;
    renderSettings();
    loadSettings({ silent: true });
  }
  if (businessDataLoadedForUser !== currentUser.id) {
    businessDataLoadedForUser = currentUser.id;
    await loadBusinessData({ silent: true });
  }
  render();
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
  const token = localStorage.getItem("sb_token");
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
          return `<label class="setting-field">${label}<select ${required ? "required" : ""} name="${key}">${(options || []).map((option) => `<option value="${escapeHtml(option)}" ${value === option ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select></label>`;
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
    state[key] = result.value[key] || state[key] || [];
  });
  state.locations = [...new Set([
    ...state.locations,
    ...state.requests.map((request) => request.location),
    ...state.inventoryRows?.map((row) => row.location) || []
  ].filter(Boolean))].sort((a, b) => a.localeCompare(b));
  if (!silent) showToast("IMS data refreshed from database.");
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

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function optionsHtml(values, getValue = (row) => row, getLabel = (row) => row) {
  return values.map((row) => `<option value="${getValue(row)}">${getLabel(row)}</option>`).join("");
}

function syncSelectOptions(scope = document) {
  const currentCategories = categories();
  scope.querySelectorAll("[data-categories]").forEach((select) => {
    const selected = select.value;
    select.innerHTML = `<option value="">Select category</option>${optionsHtml(currentCategories)}`;
    if (selected && currentCategories.includes(selected)) select.value = selected;
  });
  scope.querySelectorAll("[data-locations]").forEach((select) => {
    const selected = select.value;
    select.innerHTML = `<option value="">Select location</option>${optionsHtml(state.locations)}`;
    if (selected) select.value = selected;
  });
  const inventoryLocationSelect = document.getElementById("inventoryLocationFilter");
  inventoryLocationSelect.innerHTML = `<option value="All">All locations</option>${optionsHtml(state.locations)}`;
  if (state.locations.includes(inventoryLocationFilter)) {
    inventoryLocationSelect.value = inventoryLocationFilter;
  } else {
    inventoryLocationFilter = "All";
    inventoryLocationSelect.value = "All";
  }
  scope.querySelectorAll("[data-items]").forEach((select) => {
    const selected = select.value;
    const categorySourceId = select.dataset.categorySource;
    const category = categorySourceId ? document.getElementById(categorySourceId)?.value : "";
    const items = category ? state.items.filter((item) => item.category === category) : state.items;
    select.innerHTML = `<option value="">Select item</option>${optionsHtml(items, (item) => item.code, itemLabel)}`;
    if (selected && items.some((item) => item.code === selected)) select.value = selected;
  });
  scope.querySelectorAll("[data-item-names]").forEach((select) => {
    const selected = select.value;
    const categorySourceId = select.dataset.categorySource;
    const category = categorySourceId ? document.getElementById(categorySourceId)?.value : "";
    const names = itemNamesForCategory(category);
    select.innerHTML = `<option value="">Select item</option>${optionsHtml(names)}`;
    if (selected && names.includes(selected)) select.value = selected;
  });
  scope.querySelectorAll("[data-item-types]").forEach((select) => {
    const selected = select.value;
    const itemSourceId = select.dataset.itemSource;
    const itemName = itemSourceId ? document.getElementById(itemSourceId)?.value : "";
    const categorySourceId = select.dataset.categorySource;
    const category = categorySourceId ? document.getElementById(categorySourceId)?.value : "";
    const items = itemName ? itemTypesForName(itemName, category) : [];
    select.innerHTML = `<option value="">Select type</option>${optionsHtml(items, (item) => item.code, (item) => item.type || item.code)}`;
    if (selected && items.some((item) => item.code === selected)) select.value = selected;
  });
  scope.querySelectorAll("[data-vendors]").forEach((select) => {
    const selected = select.value;
    select.innerHTML = `<option value="">Select vendor</option>${optionsHtml(state.vendors, (vendor) => vendor.id, (vendor) => vendor.name)}`;
    if (selected) select.value = selected;
  });
  const poSelect = document.getElementById("poSelect");
  poSelect.innerHTML = `<option value="">Manual receipt</option>${optionsHtml(state.purchaseOrders, (po) => po.poNumber, (po) => po.poNumber)}`;
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
  document.getElementById("pageTitle").textContent = active ? active.textContent : "Dashboard";
  render();
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

function requestOverallStatus(request) {
  if (request.items.every((item) => item.approvalStatus === "Rejected")) return "Rejected";
  if (request.items.some((item) => item.approvalStatus === "Pending")) return "Pending";
  if (request.items.some((item) => item.issuanceStatus !== "Issued")) return "Approved";
  return "Issued";
}

function requestIssuanceStatus(request) {
  if (request.items.every((item) => item.issuanceStatus === "Issued")) return "Issued";
  if (request.items.some((item) => item.issuanceStatus === "Issued")) return "Partially Issued";
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
  const pendingRequests = state.requests.filter((request) => request.items.some((item) => item.approvalStatus === "Pending"));
  const approvedRequests = state.requests.filter((request) => requestOverallStatus(request) === "Approved" || requestOverallStatus(request) === "Issued");
  const rejectedRequests = state.requests.filter((request) => requestOverallStatus(request) === "Rejected");
  return [
    ["Total Requests", state.requests.length],
    ["Pending Approvals", pendingRequests.length],
    ["Approved Requests", approvedRequests.length],
    ["Rejected Requests", rejectedRequests.length],
    ["Low Stock Items", currentStockRows.filter((row) => row.status === "Restock needed").length],
    ["Out of Stock Items", currentStockRows.filter((row) => row.status === "Out of stock").length]
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
    ["Purchase Orders", state.purchaseOrders.length],
    ["Pending GRNs", state.purchaseOrders.filter((po) => po.status !== "Closed").length],
    ["Total GRNs", state.grns.length],
    ["Active Vendors", state.vendors.length]
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
      requestsFilter = "Pending";
      requestsPage = 1;
      setView("requests");
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

  setText("kpiRequests", state.requests.length);
  setText("kpiPendingApprovals", pendingRequests.length);
  setText("kpiApprovedRequests", approvedRequests.length);
  setText("kpiRejectedRequests", rejectedRequests.length);
  setText("kpiLowStock", currentStockRows.filter((row) => row.status !== "OK").length);
  setText("kpiPO", state.purchaseOrders.length);
  setText("kpiGRN", state.purchaseOrders.filter((po) => po.status !== "Closed").length);
  setText("kpiTransport", state.transportRequests.filter((row) => row.arrangementStatus === "Pending").length);
  setText("kpiAudit", state.auditLogs.length);
  setText("kpiStockLines", currentStockRows.length);
  setText("kpiInStock", currentStockRows.filter((row) => row.stock > 0).length);
  setText("kpiStockLow", currentStockRows.filter((row) => row.status === "Restock needed").length);
  setText("kpiOutOfStock", currentStockRows.filter((row) => row.status === "Out of stock").length);
  setText("kpiVendors", state.vendors.length);
  setText("kpiVendorContacts", state.vendors.filter((vendor) => vendor.contact).length);
  setText("kpiVendorPhones", state.vendors.filter((vendor) => vendor.phone).length);
  setText("kpiVendorPOs", linkedVendorIds.size);
  setText("kpiTotalGRNs", state.grns.length);
  setText("kpiAcceptedQty", money(state.grns.reduce((sum, grn) => sum + Number(grn.qtyAccepted || 0), 0)));
  setText("kpiGRNLinkedPOs", linkedGrnPOs.size);
  setText("kpiManualGRNs", state.grns.filter((grn) => !grn.poNumber).length);
  setText("pendingApprovalCount", pendingRequests.length);

  const recentRows = [...state.requests]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5)
    .map((request) => `
      <tr class="clickable-row" data-dashboard-request="${escapeHtml(request.requestId)}">
        <td>${escapeHtml(request.requestId)}</td>
        <td>${escapeHtml(request.requester)}</td>
        <td>${escapeHtml(request.department)}</td>
        <td>${formatDate(request.date)}</td>
        <td>${statusBadge(requestOverallStatus(request))}</td>
        <td>${statusBadge(requestIssuanceStatus(request))}</td>
      </tr>
    `);
  document.getElementById("dashboardRecentRequests").innerHTML = recentRows.join("") || emptyRow(6);

  document.getElementById("dashboardPendingApprovals").innerHTML = pendingRequests
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5)
    .map((request) => `
      <tr class="clickable-row" data-dashboard-request="${escapeHtml(request.requestId)}">
        <td>${escapeHtml(request.requestId)}</td>
        <td>${escapeHtml(request.requester)}</td>
        <td>${escapeHtml(request.department)}</td>
        <td>${formatDate(request.date)}</td>
        <td>${statusBadge("Pending")}</td>
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
      <td><span class="activity-label"><span class="activity-icon"><i data-lucide="${activityIcon(activity.activity)}"></i></span>${escapeHtml(activity.activity)}</span></td>
      <td>${escapeHtml(activity.reference)}</td>
      <td>${escapeHtml(activity.details)}</td>
      <td>${formatDate(activity.date)}</td>
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
    const actions = [
      "Request submitted",
      item.approvalStatus === "Approved" ? "Approval recorded" : "",
      item.approvalStatus === "Rejected" ? "Rejection recorded" : "",
      item.issuanceStatus === "Issued" ? "Stock issued" : ""
    ].filter(Boolean);
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
        <td><ul class="action-bullets">${actions.map((action) => `<li>${escapeHtml(action)}</li>`).join("")}</ul></td>
        <td>${formatDate(request.date)}</td>
      </tr>`;
  }).join("") || emptyRow(13);
  document.getElementById("requestsPageInfo").textContent = `Page ${requestsPage} of ${pageCount}`;
  document.getElementById("requestsPrev").disabled = requestsPage === 1;
  document.getElementById("requestsNext").disabled = requestsPage === pageCount;
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
    .filter((item) => item.approvalStatus === "Approved" && item.issuanceStatus !== "Issued")
    .map((item) => {
      const available = stockFor(item.itemCode, request.location);
      return `<tr>
        <td>${request.requestId}</td><td>${item.itemCode} - ${item.itemName}</td><td>${request.location}</td><td>${item.quantity}</td><td>${available}</td>
        <td><input class="table-input" type="number" min="1" max="${item.quantity}" value="${item.quantity}" id="qty-${item.id}"></td>
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
      <td>${po.specifications || po.description || po.itemCode || ""}</td>
      <td>${money(po.quantityOrdered ?? po.quantity)}</td>
      <td>${money(po.unitPrice)}</td>
      <td>${money(po.poAmount ?? po.total)}</td>
      <td>${statusBadge(po.status)}</td>
      <td>${formatDate(po.arrivedBy)}</td>
      <td>${po.location || ""}</td>
      <td>${money(po.quantityReceived)}</td>
      <td><button class="tiny" onclick="printPO('${po.poNumber}')">Print</button></td>
    </tr>
  `).join("") || emptyRow(12);
}

function collectPurchaseOrder(formElement) {
  const form = new FormData(formElement);
  const vendor = state.vendors.find((row) => String(row.id) === String(form.get("vendorId")));
  const quantityOrdered = Number(form.get("quantityOrdered"));
  const unitPrice = Number(form.get("unitPrice"));
  const quantityReceived = Number(form.get("quantityReceived")) || 0;
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
    specifications: String(form.get("specifications") || "").trim(),
    productCode: String(form.get("productCode") || "").trim(),
    quantityOrdered,
    unitPrice,
    subtotal,
    taxRate,
    taxAmount,
    poAmount: subtotal + taxAmount,
    quantityReceived,
    approvedBy: String(form.get("approvedBy") || "").trim(),
    supplierSignatory: String(form.get("supplierSignatory") || "").trim(),
    notesRemarks: String(form.get("notesRemarks") || "").trim(),
    date: new Date().toISOString()
  };
}

function renderPurchaseOrderSheet(po) {
  const terms = [
    "1. A delivery or advice note must accompany all goods and must bear this order number.",
    "2. This PO's number must be quoted on all invoices corresponding to this order. Failure to do so may lead to delays in release of payments.",
    "3. Payment will be made as per Shehersaaz policy through crossed cheque or pay order.",
    "4. The vendor will take full responsibility for delivery of this order as per agreed terms.",
    "5. Shehersaaz will withhold applicable taxes and deposit the same in Government Treasury.",
    "6. Written warranty and after sale service details must be signed and stamped by the vendor where applicable."
  ];

  return `
    <section class="po-sheet po-form-document">
      <header class="po-form-header">
        <div>
          <p class="po-form-kicker">PURCHASE / WORK ORDER</p>
          <h1>Shehersaaz</h1>
          <p>Al-Zahir Plaza, Suite No: 04, 2nd Floor, Banigala, Islamabad</p>
        </div>
        <div class="po-form-number">
          <span>PO Number</span>
          <strong>${escapeHtml(po.poNumber)}</strong>
          <small>${formatDate(po.issueDate)}</small>
        </div>
      </header>

      <div class="po-form-band">
        <div class="po-form-party">
          <h2>Vendor</h2>
          <strong>${escapeHtml(po.vendorName)}</strong>
          <span>${escapeHtml(po.vendorAddress)}</span>
          <span>${escapeHtml(po.vendorContact)}</span>
        </div>
        <div class="po-form-party">
          <h2>Shehersaaz Reference Information</h2>
          <dl>
            <dt>Focal Person</dt><dd>${escapeHtml(po.focalPerson)}</dd>
            <dt>Budget Line</dt><dd>${escapeHtml(po.budgetLine)}</dd>
            <dt>Location</dt><dd>${escapeHtml(po.location)}</dd>
          </dl>
        </div>
      </div>

      <div class="po-form-section">
        <h2>Order Details</h2>
        <div class="po-field-grid">
          <div><span>Service Start Date</span><strong>${formatDate(po.serviceStartDate)}</strong></div>
          <div><span>Service Completion Date</span><strong>${formatDate(po.serviceCompletionDate)}</strong></div>
          <div><span>Payment Terms</span><strong>${escapeHtml(po.paymentTerms)}</strong></div>
          <div><span>Delivery Terms</span><strong>${escapeHtml(po.deliveryTerms)}</strong></div>
          <div class="wide"><span>Quotation Reference</span><strong>${escapeHtml(po.quotationReference)}</strong></div>
        </div>
      </div>

      <div class="po-form-section">
        <h2>Bank Details</h2>
        <div class="po-field-grid three">
          <div><span>Bank</span><strong>${escapeHtml(po.bankName)}</strong></div>
          <div><span>A/C Title</span><strong>${escapeHtml(po.accountTitle)}</strong></div>
          <div><span>A/C No.</span><strong>${escapeHtml(po.accountNo)}</strong></div>
        </div>
      </div>

      <div class="po-form-section">
        <h2>Items / Services</h2>
        <div class="po-item-form">
          <div class="description">
            <span>Description</span>
            <strong>${escapeHtml(po.specifications)}</strong>
          </div>
          <div><span>Product Code</span><strong>${escapeHtml(po.productCode)}</strong></div>
          <div><span>Qty</span><strong>${money(po.quantityOrdered)}</strong></div>
          <div><span>Unit Price</span><strong>${money(po.unitPrice)}</strong></div>
          <div><span>Total</span><strong>${money(po.subtotal)}</strong></div>
        </div>
      </div>

      <div class="po-form-summary">
        <div class="po-approval-card">
          <span>Approved By</span>
          <strong>${escapeHtml(po.approvedBy)}</strong>
          <em>Signature</em>
        </div>
        <div class="po-approval-card">
          <span>Supplier Signatory</span>
          <strong>${escapeHtml(po.supplierSignatory)}</strong>
          <em>Stamp / Signature</em>
        </div>
        <div class="po-total-card">
          <p><span>Total</span><strong>${money(po.subtotal)}</strong></p>
          <p><span>GST ${money(po.taxRate)}%</span><strong>${money(po.taxAmount)}</strong></p>
          <p class="grand"><span>Grand Total</span><strong>${money(po.poAmount)}</strong></p>
        </div>
      </div>

      <div class="po-form-section terms">
        <h2>Terms and Conditions</h2>
        ${terms.map((term) => `<p>${escapeHtml(term)}</p>`).join("")}
        ${po.notesRemarks ? `<p><strong>Notes:</strong> ${escapeHtml(po.notesRemarks)}</p>` : ""}
      </div>
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

async function savePendingPO() {
  if (!pendingPurchaseOrder) return;
  try {
    await apiRequest("/purchase-orders", { method: "POST", body: JSON.stringify(pendingPurchaseOrder) });
    document.getElementById("poForm").reset();
    updatePOAmount();
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
    <tr><td>${grn.grnNumber}</td><td>${grn.poNumber || "Manual"}</td><td>${grn.itemCode || grn.description || "Specification only"}</td><td>${grn.location}</td><td>${grn.qtyReceived}</td><td>${grn.qtyAccepted}</td><td>${grn.receivedBy}</td><td>${grn.date || ""}</td></tr>
  `).join("") || emptyRow(8);
}

function renderTransport() {
  document.getElementById("transportTable").innerHTML = state.transportRequests.map((row) => `
    <tr><td>${row.id}</td><td>${row.requester}</td><td>${row.transportType}</td><td>${row.travelDate}</td><td>${statusBadge(row.approvalStatus)}</td><td>${statusBadge(row.arrangementStatus)}</td>
    <td class="button-cell"><button class="tiny success" onclick="setTransport('${row.id}','Arranged')">Arrange</button><button class="tiny danger" onclick="setTransport('${row.id}','Rejected')">Reject</button></td></tr>
  `).join("") || emptyRow(7);
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
  renderInventory();
  renderIssue();
  renderPO();
  renderGRN();
  renderTransport();
  renderVendors();
  renderAudit();
  if (document.getElementById("settingsView").classList.contains("active")) renderSettings();
  if (document.getElementById("notificationCenter").classList.contains("show")) renderNotificationCenter();
  updateNotificationBadge();
  if (window.lucide) window.lucide.createIcons();
}

window.issueItem = function (requestId, itemId) {
  const request = state.requests.find((row) => row.requestId === requestId);
  const item = request.items.find((row) => row.id === itemId);
  const qty = Number(document.getElementById(`qty-${item.id}`).value);
  const issuedBy = document.getElementById(`by-${item.id}`).value || "Inventory Manager";
  const available = stockFor(item.itemCode, request.location);
  if (item.approvalStatus !== "Approved") return showToast("Approval is required before issuance.", "error");
  if (!qty || qty < 1) return showToast("Issue quantity must be greater than zero.", "error");
  if (available < qty) return showToast("Stock unavailable. Mark this request for procurement.", "error");
  state.transactions.unshift({
    id: nextId("TX", state.transactions),
    itemCode: item.itemCode,
    location: request.location,
    type: "STOCK_OUT",
    quantity: qty,
    sourceId: requestId,
    notes: `Issued against ${requestId}`,
    performedBy: issuedBy,
    date: new Date().toISOString()
  });
  item.issuanceStatus = "Issued";
  item.quantityIssued = qty;
  item.issueDate = new Date().toISOString();
  item.issuedBy = issuedBy;
  audit("ISSUE_STOCK", "request_item", itemId, `${qty} ${item.itemCode} issued from ${request.location}`);
  saveState();
  render();
  showToast("Stock issued and ledger updated.");
};

window.setTransport = function (id, status) {
  const row = state.transportRequests.find((item) => item.id === id);
  row.arrangementStatus = status;
  audit("UPDATE_TRANSPORT", "transport_request", id, `Arrangement set to ${status}`);
  saveState();
  render();
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

function printHtml(html) {
  const printWindow = window.open("", "_blank", "width=800,height=700");
  printWindow.document.write(`
    <html>
      <head>
        <title>Print</title>
        <style>
          @page { size: A4; margin: 10mm; }
          * { box-sizing: border-box; }
          body { margin: 0; padding: 0; background: #fff; color: #111827; font-family: Arial, sans-serif; }
          .po-sheet { width: 100%; max-width: 190mm; margin: 0 auto; padding: 12mm; border: 0; box-shadow: none; font-size: 11px; }
          .po-form-header { display: flex; justify-content: space-between; gap: 24px; padding-bottom: 16px; border-bottom: 3px solid #111827; }
          .po-form-kicker { margin: 0 0 8px; font-size: 13px; font-weight: 800; letter-spacing: 0; }
          .po-form-header h1 { margin: 0; font-size: 28px; letter-spacing: 0; }
          .po-form-header p { margin: 4px 0 0; line-height: 1.35; }
          .po-form-number { min-width: 180px; padding: 12px; border: 1px solid #111827; text-align: right; }
          .po-form-number span, .po-form-number small { display: block; }
          .po-form-number span { font-size: 11px; font-weight: 800; text-transform: uppercase; }
          .po-form-number strong { display: block; margin: 8px 0; font-size: 22px; }
          .po-form-band, .po-form-summary { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 16px; }
          .po-form-party, .po-form-section, .po-approval-card, .po-total-card { padding: 12px; border: 1px solid #cbd5e1; border-radius: 4px; break-inside: avoid; }
          .po-form-party h2, .po-form-section h2 { margin: 0 0 10px; font-size: 12px; text-transform: uppercase; letter-spacing: 0; }
          .po-form-party strong, .po-form-party span { display: block; margin-bottom: 5px; line-height: 1.35; }
          .po-form-party dl { display: grid; grid-template-columns: 120px 1fr; gap: 7px 10px; margin: 0; }
          .po-form-party dt, .po-field-grid span, .po-item-form span, .po-approval-card span { color: #475569; font-size: 10px; font-weight: 800; text-transform: uppercase; }
          .po-form-party dd { margin: 0; font-weight: 700; }
          .po-form-section { margin-top: 14px; }
          .po-field-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
          .po-field-grid.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
          .po-field-grid .wide { grid-column: 1 / -1; }
          .po-field-grid > div, .po-item-form > div { min-height: 48px; padding: 9px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 3px; }
          .po-field-grid strong, .po-item-form strong { display: block; margin-top: 5px; line-height: 1.35; }
          .po-item-form { display: grid; grid-template-columns: 2fr 1fr .7fr .9fr .9fr; gap: 8px; }
          .po-item-form .description { min-height: 86px; }
          .po-form-summary { grid-template-columns: 1fr 1fr 240px; }
          .po-approval-card { min-height: 88px; }
          .po-approval-card strong { display: block; margin-top: 8px; }
          .po-approval-card em { display: block; margin-top: 30px; padding-top: 8px; border-top: 1px solid #111827; color: #475569; font-style: normal; }
          .po-total-card { padding: 0; overflow: hidden; }
          .po-total-card p { display: flex; justify-content: space-between; gap: 12px; margin: 0; padding: 10px 12px; border-bottom: 1px solid #e2e8f0; }
          .po-total-card .grand { color: #fff; background: #111827; border-bottom: 0; font-size: 13px; }
          .po-form-section.terms p { margin: 5px 0; line-height: 1.35; }
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
  localStorage.removeItem("sb_token");
  if (sb) await sb.auth.signOut();
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
  if (!po.quantityOrdered || po.quantityOrdered <= 0) return showToast("Quantity ordered must be greater than zero.", "error");
  if (po.quantityReceived > po.quantityOrdered) return showToast("Quantity received cannot exceed quantity ordered.", "error");
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
  if (accepted > received) return showToast("Accepted quantity cannot exceed received quantity.", "error");
  try {
    const result = await apiRequest("/grn", { method: "POST", body: JSON.stringify(Object.fromEntries(form)) });
    event.currentTarget.reset();
    await loadBusinessData({ silent: true });
    render();
    showToast(`${result.grnNumber} saved and stock ledger updated.`);
  } catch (error) {
    showToast(error.message, "error");
  }
});

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
