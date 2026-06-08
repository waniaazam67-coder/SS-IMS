const STORAGE_KEY = "imsPortalStateV4";
const BACKEND_ORIGIN = "http://localhost:3000";
const IS_FILE_PROTOCOL = window.location.protocol === "file:";
const PORTAL_HOME_URL = IS_FILE_PROTOCOL ? `${BACKEND_ORIGIN}/index.html` : "index.html";
const LOGIN_PAGE_URL = IS_FILE_PROTOCOL ? `${BACKEND_ORIGIN}/login.html` : "login.html";
const SETTINGS_CACHE_KEY = "imsSystemSettingsDraft";
const SETTINGS_API_BASE = IS_FILE_PROTOCOL ? `${BACKEND_ORIGIN}/api/settings` : "/api/settings";
const THEME_STORAGE_KEY = "imsTheme";
const BUSINESS_DATA_API_BASE = IS_FILE_PROTOCOL ? `${BACKEND_ORIGIN}/api` : "/api";
const AUTO_REFRESH_INTERVAL_MS = 10000;
const CHAT_POLL_INTERVAL_MS = 5000;
const OFFICIAL_EMAIL_DOMAIN = "@shehersaaz.org.pk";
const OFFICIAL_EMAIL_MESSAGE = "Only Shehersaaz official email addresses are allowed.";
const AVAILABLE_USER_ROLES = [
  { key: "admin", label: "admin" },
  { key: "requestor", label: "requestor" },
  { key: "approver", label: "approver" },
  { key: "inventory_manager", label: "inventory_manager" }
];
const VIEW_ROLE_ACCESS = {
  dashboard: ["admin", "inventory_manager"],
  requisition: ["admin", "requestor", "approver", "inventory_manager"],
  requests: ["admin", "requestor", "approver", "inventory_manager"],
  approvals: ["admin", "approver"],
  inventory: ["admin", "inventory_manager"],
  procurement: ["admin", "inventory_manager"],
  issue: ["admin", "inventory_manager"],
  grn: ["admin", "inventory_manager"],
  po: ["admin", "inventory_manager"],
  vendors: ["admin", "inventory_manager"],
  itemRequests: ["admin"],
  transport: ["admin", "inventory_manager"],
  settings: ["admin"],
  history: ["admin"]
};
let seedTxCounter = 0;
let currentUser = {
  id: "",
  uid: "",
  name: "IMS User",
  email: "",
  role: "requestor",
  roles: [],
  permissions: [],
  status: ""
};
let isAdmin = false;
let settingsLoadedForUser = "";
let businessDataLoadedForUser = "";
let autoRefreshTimer = null;
let isAutoRefreshing = false;
let lastBusinessDataSignature = "";
let businessDataLoading = true;
let businessDataError = "";
const businessDataErrors = {};
let dashboardDefaultHtml = "";
const APPROVED_LOCATIONS = ["I9 warehouse", "Secretariat", "NSR CC", "RWP CC"];
const APPROVED_LOCATION_LOOKUP = new Map(APPROVED_LOCATIONS.map((location) => [
  location.toLowerCase().replace(/[^a-z0-9]/g, ""),
  location
]));

const seedState = {
  locations: [],
  categories: [],
  items: [],
  vendors: [],
  requests: [],
  transportRequests: [],
  purchaseOrders: [],
  grns: [],
  transactions: [],
  auditLogs: []
};

const VENDOR_ACCOUNT_DETAILS_KEY = "imsVendorAccountDetails";
const vendorAccountDetails = loadVendorAccountDetails();

let state = loadState();
let inventoryCategoryFilter = "All";
let inventoryLocationFilter = "All";
let inventoryStatusFilter = "All";
let inventorySearchTerm = "";
let stockIssueSearchTerm = "";
let stockIssueLocationFilter = "All";
let grnSearchTerm = "";
let grnVendorFilter = "All";
let poSearchTerm = "";
let poVendorFilter = "All";
let poStatusFilter = "All";
let vendorSearchTerm = "";
let inventoryPage = 1;
let inventoryModuleTab = "items";
let procurementModuleTab = "po";
let activeInventoryDetailCode = "";
let lastAppliedGrnPoNumber = "";
const INVENTORY_VIEW_TABS = {
  issue: "issue",
  grn: "grn"
};
const INVENTORY_TAB_LABELS = {
  items: "Items",
  warehouses: "Warehouses",
  categories: "Categories",
  issue: "Stock Issue",
  grn: "GRN"
};
const PROCUREMENT_VIEW_TABS = {
  po: "po",
  vendors: "vendors"
};
const PROCUREMENT_TAB_LABELS = {
  po: "PO",
  vendors: "Vendors"
};
const REQUEST_VIEW_TABS = {
  requisition: "requisition",
  transport: "transport",
  itemRequests: "items"
};
const REQUEST_TAB_LABELS = {
  requisition: "Requisition Form",
  transport: "Transport Requests",
  items: "Item Requests"
};
const INVENTORY_PAGE_SIZE = 18;
let requestsPage = 1;
let requestsFilter = "All";
let requestModuleTab = "requisition";
const REQUESTS_PAGE_SIZE = 10;
let settingsState = {};
let userManagementUsers = [];
let userManagementLoaded = false;
let lastUserInviteLink = "";
let lastInvitedUserEmail = "";
let lastInvitedUserName = "";
let copiedInviteMessageTimer = null;
let isAddingUser = false;
let activeEditPermissionsUserId = "";
let activeSettingsGroup = "team";
let activeNotificationTab = "direct";
let unreadOnly = false;
let notifications = [];
let notificationsLoaded = false;
let chatUsers = [];
let chatConversations = [];
let chatMessages = [];
let chatUsersLoaded = false;
let chatLoadError = "";
let selectedChatUserId = "";
let chatSearchTerm = "";
let chatPollTimer = null;
const knownUnreadNotificationIds = new Set();
let notificationSoundUnlocked = false;
let pendingPurchaseOrder = null;
let pendingCancelPoNumber = "";
let pendingDeleteUserId = "";
let activeHistorySection = "requests";
let previousHistoryView = "dashboard";
const expandedHistoryIds = new Set();

function redirectToLogin() {
  const target = IS_FILE_PROTOCOL
    ? PORTAL_HOME_URL
    : `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const returnTo = encodeURIComponent(target);
  window.location.replace(`${LOGIN_PAGE_URL}?returnTo=${returnTo}`);
}

function normalizeRoleKey(role) {
  const value = String(role || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (value === "requester") return "requestor";
  if (value === "inventory_manager") return "inventory_manager";
  return value;
}

function isOfficialEmail(email) {
  return String(email || "").trim().toLowerCase().endsWith(OFFICIAL_EMAIL_DOMAIN);
}

function userRoles() {
  return [...new Set((currentUser.roles || []).map(normalizeRoleKey).filter(Boolean))];
}

function hasRole(role) {
  const roles = userRoles();
  return roles.includes("admin") || roles.includes(normalizeRoleKey(role));
}

function canAccessView(view) {
  if (view === "history") return canAccessView(previousHistoryView || "dashboard");
  const allowedRoles = VIEW_ROLE_ACCESS[view] || [];
  return allowedRoles.some((role) => hasRole(role));
}

function canAccessRequestTab(tab) {
  const view = tab === "items" ? "itemRequests" : tab;
  return canAccessView(view);
}

function firstAccessibleRequestTab() {
  return Object.keys(REQUEST_TAB_LABELS).find(canAccessRequestTab) || "requisition";
}

function normalizeRequestModuleTab() {
  if (!REQUEST_TAB_LABELS[requestModuleTab] || !canAccessRequestTab(requestModuleTab)) {
    requestModuleTab = firstAccessibleRequestTab();
  }
}

function firstAccessibleView() {
  return Object.keys(VIEW_ROLE_ACCESS).find((view) => canAccessView(view)) || "requisition";
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
  // #region debug-point A:portal-session-start
  fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"signin-stale-user",runId:"pre-fix",hypothesisId:"A",location:"script.js:requirePortalSession:start",msg:"[DEBUG] requirePortalSession started",data:{seedUser:currentUser?.name||"",seedUid:currentUser?.uid||"",cachedToken:Boolean(localStorage.getItem("firebase_token")),path:window.location.pathname},ts:Date.now()})}).catch(()=>{});
  // #endregion
  if (!window.IMS_FIREBASE_CONFIG) {
    redirectToLogin();
    return null;
  }
  const user = await ensureFirebaseReady();
  // #region debug-point B:firebase-auth-state
  fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"signin-stale-user",runId:"pre-fix",hypothesisId:"B",location:"script.js:requirePortalSession:firebaseUser",msg:"[DEBUG] firebase auth state resolved",data:{hasUser:Boolean(user),email:user?.email||"",uid:user?.uid||""},ts:Date.now()})}).catch(()=>{});
  // #endregion
  if (!user) {
    localStorage.removeItem("firebase_token");
    redirectToLogin();
    return null;
  }
  if (!isOfficialEmail(user.email)) {
    localStorage.removeItem("firebase_token");
    if (window.imsFirebaseSignOut) await window.imsFirebaseSignOut();
    sessionStorage.setItem("imsAuthError", OFFICIAL_EMAIL_MESSAGE);
    redirectToLogin();
    return null;
  }
  const token = await user.getIdToken();
  localStorage.setItem("firebase_token", token);
  try {
    // #region debug-point C:auth-me-request
    fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"signin-stale-user",runId:"pre-fix",hypothesisId:"C",location:"script.js:requirePortalSession:authMe:start",msg:"[DEBUG] requesting /api/auth/me",data:{email:user?.email||"",uid:user?.uid||"",tokenLength:String(token||"").length},ts:Date.now()})}).catch(()=>{});
    // #endregion
    const response = await fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      const responseData = await response.json().catch(() => ({}));
      const message = responseData.error?.message || "Unable to load your IMS permissions.";
      if (response.status === 403) sessionStorage.setItem("imsAuthError", message);
      throw new Error(message);
    }
    const session = await response.json();
    const authUser = session.user || {};
    // #region debug-point D:auth-me-success
    fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"signin-stale-user",runId:"pre-fix",hypothesisId:"D",location:"script.js:requirePortalSession:authMe:success",msg:"[DEBUG] /api/auth/me succeeded",data:{sessionUserName:authUser?.name||"",sessionUserEmail:authUser?.email||"",roles:session?.roles||[],permissionsCount:Array.isArray(session?.permissions)?session.permissions.length:0},ts:Date.now()})}).catch(()=>{});
    // #endregion
    currentUser = {
      ...currentUser,
      id: authUser.id || user.uid,
      uid: user.uid,
      name: authUser.name || user.displayName || user.email || "IMS User",
      email: authUser.email || user.email || "",
      roles: Array.isArray(session.roles) ? session.roles.map(normalizeRoleKey) : [],
      permissions: Array.isArray(session.permissions) ? session.permissions : [],
      status: authUser.status || "active"
    };
    currentUser.role = currentUser.roles[0] || "requestor";
  } catch (error) {
    // #region debug-point E:auth-me-error
    fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"signin-stale-user",runId:"pre-fix",hypothesisId:"E",location:"script.js:requirePortalSession:authMe:error",msg:"[DEBUG] /api/auth/me failed",data:{message:error?.message||""},ts:Date.now()})}).catch(()=>{});
    // #endregion
    localStorage.removeItem("firebase_token");
    if (window.imsFirebaseSignOut) await window.imsFirebaseSignOut();
    redirectToLogin();
    return null;
  }
  isAdmin = hasRole("admin");
  // #region debug-point F:portal-session-ready
  fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"signin-stale-user",runId:"pre-fix",hypothesisId:"F",location:"script.js:requirePortalSession:ready",msg:"[DEBUG] portal session established",data:{currentUserName:currentUser?.name||"",currentUserEmail:currentUser?.email||"",currentUserId:currentUser?.id||"",isAdmin},ts:Date.now()})}).catch(()=>{});
  // #endregion
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
  { group: "user_management", title: "User Management", icon: "user-cog", description: "Manage user account roles and access.", adminOnly: true, fields: [] },
  { group: "inventory", title: "Inventory", icon: "boxes", description: "Inventory masters and stock movement rules.", fields: [
    ["item_categories", "Item categories", "textarea"],
    ["stock_status_rules", "Stock status rules", "textarea"], ["allow_negative_stock", "Allow negative stock", "checkbox"],
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

const removedSettingsGroups = new Set([
  "organization",
  "theme",
  "users_roles",
  "inventory",
  "locations",
  "requisitions",
  "purchase_orders",
  "grn",
  "vendors",
  "notifications",
  "print_templates"
]);

const LUMEN_SETTINGS_SECTIONS = [
  {
    group: "team",
    title: "Team",
    icon: "users",
    description: "People with access to this workspace."
  },
  {
    group: "roles",
    title: "Roles",
    icon: "shield-check",
    description: "Define roles and permission sets for your workspace."
  }
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
  const imported = window.IMS_IMPORTED_INVENTORY || {
    locations: [],
    items: window.IMS_IMPORTED_INVENTORY_ITEMS || []
  };
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

function approvedLocationName(location) {
  const key = String(location || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return APPROVED_LOCATION_LOOKUP.get(key) || "";
}

function enforceApprovedLocations() {
  state.locations = [...APPROVED_LOCATIONS];
  if (Array.isArray(state.inventoryRows)) {
    state.inventoryRows = state.inventoryRows
      .map((row) => ({ ...row, location: approvedLocationName(row.location) }))
      .filter((row) => row.location);
  }
  if (!APPROVED_LOCATIONS.includes(inventoryLocationFilter)) inventoryLocationFilter = "All";
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

function findItem(code) {
  return state.items.find((item) => item.code === code);
}

function findItemBySelection(name, typeOrCode, category = "") {
  return state.items.find((item) =>
    item.name === name &&
    (!category || item.category === category) &&
    (item.code === typeOrCode || item.type === typeOrCode)
  );
}

function categories() {
  const categoryNames = [
    ...(Array.isArray(state.categories) ? state.categories.map((category) => category?.name || category) : []),
    ...state.items.map((item) => item.category)
  ];
  return [...new Set(categoryNames.filter(Boolean))].sort((a, b) => a.localeCompare(b));
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
    .filter((item) => {
      const type = String(item.type || "").trim();
      const code = String(item.code || "").trim();
      return Boolean(type) && type !== code && !/^ITM[-_]/i.test(type);
    })
    .sort((a, b) => String(a.type || "").localeCompare(String(b.type || "")));
}

function loadVendorAccountDetails() {
  try {
    return JSON.parse(localStorage.getItem(VENDOR_ACCOUNT_DETAILS_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveVendorAccountDetails() {
  localStorage.setItem(VENDOR_ACCOUNT_DETAILS_KEY, JSON.stringify(vendorAccountDetails));
}

function vendorAccountKeys(vendor = {}) {
  return [
    vendor.id ? `id:${vendor.id}` : "",
    vendor.vendorId ? `vendor:${vendor.vendorId}` : "",
    vendor.name ? `name:${String(vendor.name).trim().toLowerCase()}` : ""
  ].filter(Boolean);
}

function normalizeVendorRecord(vendor = {}) {
  const savedDetails = vendorAccountKeys(vendor)
    .map((key) => vendorAccountDetails[key])
    .find(Boolean) || {};

  return {
    ...vendor,
    bankName: vendor.bankName || vendor.bank_name || savedDetails.bankName || "",
    accountTitle: vendor.accountTitle || vendor.account_title || savedDetails.accountTitle || "",
    accountNo: vendor.accountNo || vendor.account_no || savedDetails.accountNo || ""
  };
}

function rememberVendorAccountDetails(vendor = {}) {
  const normalized = normalizeVendorRecord(vendor);
  const details = {
    bankName: normalized.bankName || "",
    accountTitle: normalized.accountTitle || "",
    accountNo: normalized.accountNo || ""
  };

  if (!details.bankName && !details.accountTitle && !details.accountNo) return;
  vendorAccountKeys(normalized).forEach((key) => {
    vendorAccountDetails[key] = details;
  });
  saveVendorAccountDetails();
}

async function saveVendorRecord(vendorId, payload) {
  if (!vendorId) {
    return apiRequest("/vendors", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  try {
    return await apiRequest(`/vendors/${encodeURIComponent(vendorId)}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
  } catch (error) {
    if (![404, 405].includes(error.statusCode)) throw error;
    return apiRequest(`/vendors/${encodeURIComponent(vendorId)}`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }
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

function lowStockThreshold() {
  return 10;
}

function inventoryStockStatus(stock) {
  const quantity = Number(stock);
  if (!Number.isFinite(quantity)) return "Item master";
  if (quantity <= 0) return "Out of stock";
  return quantity < lowStockThreshold() ? "Low stock" : "In stock";
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
    const status = inventoryStockStatus(stock);
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
  const responseText = await response.text();
  let data = {};
  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch {
    data = {};
  }
  if (!response.ok) {
    const fallbackMessage = responseText && !responseText.trim().startsWith("<")
      ? responseText.trim()
      : `IMS API request failed (${response.status}).`;
    const error = new Error(data.error?.message || data.message || fallbackMessage);
    error.statusCode = response.status;
    error.data = data;
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
  // #region debug-point I:refresh-shell-start
  fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"signin-stale-user",runId:"pre-fix",hypothesisId:"I",location:"script.js:refreshVerifiedUserShell:start",msg:"[DEBUG] refreshVerifiedUserShell started",data:{currentUserId:currentUser?.id||"",currentUserName:currentUser?.name||"",settingsLoadedForUser,businessDataLoadedForUser},ts:Date.now()})}).catch(()=>{});
  // #endregion
  applyAdminVisibility();
  if (isAdmin && settingsLoadedForUser !== currentUser.id) {
    settingsLoadedForUser = currentUser.id;
    renderSettings();
    loadSettings({ silent: true });
  }
  if (businessDataLoadedForUser !== currentUser.id) {
    businessDataLoadedForUser = currentUser.id;
    businessDataLoading = true;
    businessDataError = "";
    Object.keys(businessDataErrors).forEach((key) => delete businessDataErrors[key]);
    render();
    await syncImportedInventoryToDatabase();
    await loadBusinessData({ silent: true });
    lastBusinessDataSignature = businessDataSignature();
  }
  // #region debug-point J:refresh-shell-finish
  fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"signin-stale-user",runId:"pre-fix",hypothesisId:"J",location:"script.js:refreshVerifiedUserShell:finish",msg:"[DEBUG] refreshVerifiedUserShell finished",data:{currentUserId:currentUser?.id||"",currentUserName:currentUser?.name||"",settingsLoadedForUser,businessDataLoadedForUser,businessDataError},ts:Date.now()})}).catch(()=>{});
  // #endregion
  render();
  startAutoRefresh();
  startChatPolling();
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

function escapeCssIdentifier(value) {
  if (window.CSS?.escape) return CSS.escape(String(value));
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
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

async function loadUserManagement({ silent = false } = {}) {
  if (!isAdmin) return;
  try {
    const data = await apiRequest("/auth/users");
    userManagementUsers = (data.users || []).map((user) => ({
      ...user,
      roles: Array.isArray(user.roles) ? user.roles.map(normalizeRoleKey) : []
    }));
    userManagementLoaded = true;
    renderSettings();
  } catch (error) {
    if (!silent) showToast(error.message || "Unable to load users.", "error");
  }
}

function renderSettingsTabs() {
  const tabs = document.getElementById("settingsTabs");
  const visibleSections = LUMEN_SETTINGS_SECTIONS;
  if (!visibleSections.some((section) => section.group === activeSettingsGroup)) {
    activeSettingsGroup = visibleSections[0]?.group || "";
  }
  tabs.innerHTML = visibleSections.map((section) => `
    <button class="settings-tab ${section.group === activeSettingsGroup ? "active" : ""}" type="button" data-settings-group="${section.group}">
      <i data-lucide="${section.icon}"></i><span>${section.title}</span>
    </button>
  `).join("");
}

function renderSettings() {
  if (!isAdmin) return;
  renderSettingsTabs();
  const visibleSections = LUMEN_SETTINGS_SECTIONS;
  const section = visibleSections.find((item) => item.group === activeSettingsGroup) || visibleSections[0];
  if (!section) return;
  if (section.group === "team") {
    renderUserManagement(section);
    return;
  }
  if (section.group === "roles") {
    renderRolesManagement(section);
    return;
  }
}

function removeDetachedManagementDrawers() {
  const form = document.getElementById("settingsForm");
  ["teamUserDrawer", "teamPermissionsDrawer"].forEach((id) => {
    const node = document.getElementById(id);
    if (node && node.parentElement !== form) node.remove();
  });
}

function renderUserManagement(section) {
  document.getElementById("settingsSectionTitle").textContent = section.title;
  document.getElementById("settingsSectionDescription").textContent = section.description;
  const form = document.getElementById("settingsForm");
  removeDetachedManagementDrawers();

  if (!userManagementLoaded) {
    form.innerHTML = `
      <div class="user-management-empty">Loading users...</div>
      <div class="settings-actions"><button class="secondary" type="button" id="reloadUsersBtn">Reload Users</button></div>
    `;
    renderSettingsTabs();
    loadUserManagement({ silent: true });
    return;
  }

  form.innerHTML = `
    <div class="settings-team-summary">
      <div class="settings-team-count">
        <i data-lucide="users"></i>
        <strong>${userManagementUsers.length} ${userManagementUsers.length === 1 ? "user" : "users"}</strong>
      </div>
      <button class="primary settings-add-user-btn" id="openAddUserDrawerBtn" type="button"><i data-lucide="user-plus"></i>Add user</button>
    </div>
    <div class="user-management-list settings-team-table" role="table" aria-label="Team">
      <div class="user-management-header" role="row">
        <span>Name</span>
        <span>Email</span>
        <span>Status</span>
        <span>Role / Permissions</span>
        <span>Last login</span>
        <span>Actions</span>
      </div>
      ${userManagementUsers.map((user) => {
        const roles = user.roles || [];
        const isSelf = String(user.id) === String(currentUser.id);
        const isActive = user.status ? String(user.status).toLowerCase() !== "inactive" : user.isActive !== false;
        const primaryRole = roles[0] || "requestor";
        return `
          <article class="user-management-card" data-user-id="${escapeHtml(user.id)}" role="row">
            <div class="user-management-person">
              <span class="user-management-avatar">${escapeHtml(initialsFor(user.name || user.email || "U"))}</span>
              <span class="user-management-identity"><strong>${escapeHtml(user.name || "Unnamed user")}</strong>${isSelf ? `<span class="settings-owner-pill">Owner</span>` : ""}</span>
            </div>
            <div class="settings-team-email">${escapeHtml(user.email || "")}</div>
            <div class="user-management-status">
              ${statusBadge(user.status || (user.isActive ? "active" : "inactive"))}
            </div>
            <div class="role-checkbox-grid">
              <strong>${escapeHtml(primaryRole.replace(/_/g, " "))}</strong>
              <span>${roles.length > 1 ? `+${roles.length - 1} overrides` : "Standard access"}</span>
            </div>
            <div class="settings-team-login">${escapeHtml(formatDate(user.lastLogin || user.last_login || user.updatedAt || user.updated_at || "")) || "-"}</div>
            <div class="user-management-actions">
              <button class="user-save-btn edit-user-roles" type="button" data-user-id="${escapeHtml(user.id)}"><i data-lucide="sliders-horizontal"></i>Edit permissions</button>
              <button class="user-status-btn toggle-user-status" type="button" data-user-id="${escapeHtml(user.id)}" data-next-active="${isActive ? "false" : "true"}" ${isSelf ? "disabled" : ""}>${isActive ? "Deactivate" : "Activate"}</button>
              ${isSelf ? `<button class="user-delete-btn" type="button" disabled aria-label="Cannot delete your own account"><i data-lucide="trash-2"></i></button>` : `<button class="user-delete-btn delete-user" type="button" data-user-id="${escapeHtml(user.id)}" aria-label="Delete ${escapeHtml(user.name || user.email || "user")}"><i data-lucide="trash-2"></i></button>`}
            </div>
            <div class="settings-inline-role-editor">
              <div class="role-checkbox-grid">
                ${AVAILABLE_USER_ROLES.map((role) => `
                  <label class="role-pill ${roles.includes(role.key) ? "selected" : ""}">
                    <input type="checkbox" name="roles-${escapeHtml(user.id)}" value="${role.key}" ${roles.includes(role.key) ? "checked" : ""}>
                    <span>${role.label}</span>
                  </label>
                `).join("")}
              </div>
              <button class="user-save-btn save-user-roles" type="button" data-user-id="${escapeHtml(user.id)}"><i data-lucide="save"></i>Save permissions</button>
            </div>
          </article>
        `;
      }).join("") || `<div class="user-management-empty">No users found.</div>`}
    </div>
    <div class="user-management-footer"><span>Showing 1 to ${userManagementUsers.length} of ${userManagementUsers.length} entries</span><button class="secondary" type="button" id="reloadUsersBtn">Reload Users</button></div>
    <div class="team-user-drawer" id="teamUserDrawer" aria-hidden="true">
      <section class="team-user-drawer-card" aria-label="Add user">
        <button class="icon-btn team-user-drawer-close" type="button" id="closeAddUserDrawerBtn" aria-label="Close add user"><i data-lucide="x"></i></button>
        <div class="section-title">
          <h2>Add user</h2>
          <p>Create a portal user and assign workspace roles.</p>
        </div>
        <div class="team-user-drawer-form">
          <label>Full Name<input id="newUserName" name="newUserName" placeholder="Enter full name" required></label>
          <label>Email Address<input id="newUserEmail" name="newUserEmail" type="email" placeholder="Enter email address" required></label>
          <fieldset class="team-drawer-role-list">
            <legend>Assign role</legend>
            ${AVAILABLE_USER_ROLES.map((role) => `
              <label class="team-drawer-role-option">
                <input type="checkbox" name="newUserRoles" value="${role.key}" ${role.key === "requestor" ? "checked" : ""}>
                <span>${role.label.replace(/_/g, " ")}</span>
              </label>
            `).join("")}
          </fieldset>
          <button class="primary team-user-submit-btn" id="addUserInlineBtn" type="button">
            <span class="team-user-submit-spinner" aria-hidden="true"></span>
            <span class="team-user-submit-label"><i data-lucide="user-plus"></i>Add user</span>
            <span class="team-user-submit-loading-label">Creating user...</span>
          </button>
          <div class="team-user-invite-link" id="teamUserInviteLink" ${lastUserInviteLink ? "" : "hidden"}>
            <div class="team-user-invite-head">
              <span class="team-user-invite-icon"><i data-lucide="link-2"></i></span>
              <div>
                <strong>Setup link</strong>
                <p>The user will create a password from this link and be signed in automatically.</p>
              </div>
            </div>
            <div class="team-user-invite-body">
              <label for="newUserInviteLink">Link</label>
              <div class="team-user-invite-input-wrap">
                <input id="newUserInviteLink" type="text" readonly value="${escapeHtml(lastUserInviteLink)}">
                <button class="icon-btn" id="copyInviteIconBtn" type="button" aria-label="Copy setup link"><i data-lucide="copy"></i></button>
              </div>
              <span class="team-user-invite-copied" id="userInviteCopiedMessage" hidden>Copied</span>
            </div>
            <div class="team-user-invite-actions">
              <button class="secondary" id="copyUserInviteLinkBtn" type="button"><i data-lucide="copy"></i>Copy link</button>
              <button class="primary" id="sendUserInviteLinkBtn" type="button"><i data-lucide="send"></i>Send setup link</button>
            </div>
          </div>
        </div>
      </section>
    </div>
    <div class="team-user-drawer" id="teamPermissionsDrawer" aria-hidden="true">
      <section class="team-user-drawer-card" aria-label="Edit permissions">
        <button class="icon-btn team-user-drawer-close" type="button" id="closePermissionsDrawerBtn" aria-label="Close permissions"><i data-lucide="x"></i></button>
        <div class="section-title">
          <h2>Edit permissions</h2>
          <p id="permissionsDrawerSubtitle">Update workspace roles for this user.</p>
        </div>
        <div class="team-user-drawer-form">
          <fieldset class="team-drawer-role-list">
            <legend>Assigned roles</legend>
            ${AVAILABLE_USER_ROLES.map((role) => `
              <label class="team-drawer-role-option">
                <input type="checkbox" name="editUserRoles" value="${role.key}">
                <span>${role.label.replace(/_/g, " ")}</span>
              </label>
            `).join("")}
          </fieldset>
          <button class="primary" id="savePermissionsDrawerBtn" type="button"><i data-lucide="save"></i>Save permissions</button>
        </div>
      </section>
    </div>
  `;
  renderSettingsTabs();
  bindTeamDrawerActions(form);
  if (window.lucide) window.lucide.createIcons();
}

function renderRolesManagement(section) {
  if (!userManagementLoaded) {
    document.getElementById("settingsSectionTitle").textContent = section.title;
    document.getElementById("settingsSectionDescription").textContent = section.description;
    document.getElementById("settingsForm").innerHTML = `
      <div class="user-management-empty">Loading roles...</div>
      <div class="settings-actions"><button class="secondary" type="button" id="reloadUsersBtn">Reload Roles</button></div>
    `;
    renderSettingsTabs();
    loadUserManagement({ silent: true });
    return;
  }

  const roleDescriptions = {
    admin: "Full access to all enabled modules.",
    requestor: "Submit requests and track personal request history.",
    approver: "Review assigned requests and record approval decisions.",
    inventory_manager: "Manage inventory, procurement, GRN, and stock issue flows."
  };
  const roleIcons = {
    admin: "shield",
    requestor: "send",
    approver: "list-checks",
    inventory_manager: "package"
  };
  document.getElementById("settingsSectionTitle").textContent = section.title;
  document.getElementById("settingsSectionDescription").textContent = section.description;
  document.getElementById("settingsForm").innerHTML = `
    <div class="settings-roles-head">
      <span>${AVAILABLE_USER_ROLES.length} roles</span>
      <button class="primary" type="button"><i data-lucide="plus"></i>New role</button>
    </div>
    <div class="settings-role-list">
      ${AVAILABLE_USER_ROLES.map((role) => {
        const memberCount = userManagementUsers.filter((user) => (user.roles || []).includes(role.key)).length;
        const permissionCount = role.key === "admin" ? "All" : role.key === "inventory_manager" ? "Procurement + inventory" : role.key === "approver" ? "Approvals" : "Requests";
        return `
          <article class="settings-role-card settings-role-${escapeHtml(role.key)}">
            <div class="settings-role-icon"><i data-lucide="${roleIcons[role.key] || "shield"}"></i></div>
            <div class="settings-role-copy">
              <h3>${escapeHtml(role.label.replace(/_/g, " "))}<span>System</span></h3>
              <p>${escapeHtml(roleDescriptions[role.key] || "Workspace access role.")}</p>
              <small>${escapeHtml(permissionCount)} permissions · ${memberCount} ${memberCount === 1 ? "member" : "members"}</small>
            </div>
            <span class="settings-role-member-pill">${memberCount} ${memberCount === 1 ? "member" : "members"}</span>
            <button class="secondary" type="button"><i data-lucide="eye"></i>View</button>
          </article>
        `;
      }).join("")}
    </div>
  `;
  renderSettingsTabs();
  if (window.lucide) window.lucide.createIcons();
}

function openAddUserDrawer() {
  const drawer = document.getElementById("teamUserDrawer");
  if (!drawer) return;
  if (drawer.parentElement !== document.body) document.body.appendChild(drawer);
  bindTeamDrawerActions(drawer);
  drawer.classList.add("show");
  drawer.setAttribute("aria-hidden", "false");
  document.body.classList.add("team-user-drawer-open");
  document.getElementById("newUserName")?.focus();
}

function closeAddUserDrawer() {
  const drawer = document.getElementById("teamUserDrawer");
  if (!drawer) return;
  drawer.classList.remove("show");
  drawer.setAttribute("aria-hidden", "true");
  if (!document.querySelector(".team-user-drawer.show")) {
    document.body.classList.remove("team-user-drawer-open");
  }
}

function openPermissionsDrawer(userId) {
  const drawer = document.getElementById("teamPermissionsDrawer");
  const user = userManagementUsers.find((item) => String(item.id) === String(userId));
  if (!drawer || !user) return showToast("User not found.", "error");
  if (drawer.parentElement !== document.body) document.body.appendChild(drawer);
  activeEditPermissionsUserId = String(user.id);
  const roles = (user.roles || []).map(normalizeRoleKey);
  const subtitle = document.getElementById("permissionsDrawerSubtitle");
  if (subtitle) subtitle.textContent = `${user.name || "User"} - ${user.email || ""}`;
  drawer.querySelectorAll("input[name='editUserRoles']").forEach((input) => {
    input.checked = roles.includes(normalizeRoleKey(input.value));
  });
  drawer.classList.add("show");
  drawer.setAttribute("aria-hidden", "false");
  document.body.classList.add("team-user-drawer-open");
}

function closePermissionsDrawer() {
  const drawer = document.getElementById("teamPermissionsDrawer");
  if (!drawer) return;
  drawer.classList.remove("show");
  drawer.setAttribute("aria-hidden", "true");
  activeEditPermissionsUserId = "";
  if (!document.querySelector(".team-user-drawer.show")) {
    document.body.classList.remove("team-user-drawer-open");
  }
}

function bindTeamDrawerActions(scope = document) {
  const openAddButton = scope.querySelector?.("#openAddUserDrawerBtn");
  const addButton = scope.querySelector?.("#addUserInlineBtn");
  const copyButton = scope.querySelector?.("#copyUserInviteLinkBtn");
  const copyIconButton = scope.querySelector?.("#copyInviteIconBtn");
  const sendButton = scope.querySelector?.("#sendUserInviteLinkBtn");
  const savePermissionsButton = scope.querySelector?.("#savePermissionsDrawerBtn");
  const closeAddButton = scope.querySelector?.("#closeAddUserDrawerBtn");
  const closePermissionsButton = scope.querySelector?.("#closePermissionsDrawerBtn");

  if (openAddButton) openAddButton.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    openAddUserDrawer();
  };
  if (addButton) addButton.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    addUserFromManagement();
  };
  if (copyButton) copyButton.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    copyUserInviteLink();
  };
  if (copyIconButton) copyIconButton.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    copyUserInviteLink();
  };
  if (sendButton) sendButton.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    sendUserInviteLink();
  };
  if (savePermissionsButton) savePermissionsButton.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    savePermissionsFromDrawer();
  };
  if (closeAddButton) closeAddButton.onclick = closeAddUserDrawer;
  if (closePermissionsButton) closePermissionsButton.onclick = closePermissionsDrawer;
}

function setUserInviteLink(inviteLink = "", details = {}) {
  lastUserInviteLink = String(inviteLink || "");
  lastInvitedUserEmail = lastUserInviteLink ? String(details.email || lastInvitedUserEmail || "").trim() : "";
  lastInvitedUserName = lastUserInviteLink ? String(details.name || lastInvitedUserName || "").trim() : "";
  const wrap = document.getElementById("teamUserInviteLink");
  const field = document.getElementById("newUserInviteLink");
  const sendButton = document.getElementById("sendUserInviteLinkBtn");
  const copiedMessage = document.getElementById("userInviteCopiedMessage");
  if (field) field.value = lastUserInviteLink;
  if (wrap) wrap.hidden = !lastUserInviteLink;
  if (sendButton) sendButton.disabled = !(lastUserInviteLink && lastInvitedUserEmail);
  if (copiedMessage) copiedMessage.hidden = true;
  if (copiedInviteMessageTimer) {
    clearTimeout(copiedInviteMessageTimer);
    copiedInviteMessageTimer = null;
  }
}

function showInviteCopiedMessage() {
  const copiedMessage = document.getElementById("userInviteCopiedMessage");
  if (!copiedMessage) return;
  copiedMessage.hidden = false;
  if (copiedInviteMessageTimer) clearTimeout(copiedInviteMessageTimer);
  copiedInviteMessageTimer = setTimeout(() => {
    const latestCopiedMessage = document.getElementById("userInviteCopiedMessage");
    if (latestCopiedMessage) latestCopiedMessage.hidden = true;
    copiedInviteMessageTimer = null;
  }, 1800);
}

function setAddUserLoading(isLoading) {
  isAddingUser = Boolean(isLoading);
  const addButton = document.getElementById("addUserInlineBtn");
  if (!addButton) return;
  addButton.disabled = isAddingUser;
  addButton.dataset.loading = isAddingUser ? "true" : "false";
}

async function copyUserInviteLink() {
  const link = document.getElementById("newUserInviteLink")?.value || lastUserInviteLink;
  if (!link) return showToast("No setup link to copy.", "error");
  try {
    await navigator.clipboard.writeText(link);
    showInviteCopiedMessage();
    showToast("Setup link copied.");
  } catch (error) {
    const field = document.getElementById("newUserInviteLink");
    field?.focus();
    field?.select();
    showToast("Select and copy the setup link.", "error");
  }
}

function sendUserInviteLink() {
  const link = document.getElementById("newUserInviteLink")?.value || lastUserInviteLink;
  const email = lastInvitedUserEmail;
  const name = lastInvitedUserName || "there";
  if (!link) return showToast("No setup link to send.", "error");
  if (!email) return showToast("No invite email address is available.", "error");
  const subject = encodeURIComponent("Set up your IMS Portal account");
  const body = encodeURIComponent(
    `Hello ${name},\n\nYour IMS Portal account has been created. Use the link below to create your password:\n\n${link}\n\nAfter setting your password, you will be signed in automatically.\n\nThanks.`
  );
  window.location.href = `mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}`;
  showToast("Invite email draft opened.");
}

async function saveUserRoles(userId, rolesOverride = null) {
  if (!isAdmin) return showToast("Admin access is required.", "error");
  const checkedRoles = Array.isArray(rolesOverride)
    ? rolesOverride
    : Array.from(document.querySelectorAll(`input[name="roles-${escapeCssIdentifier(userId)}"]:checked`)).map((input) => input.value);
  if (!checkedRoles.length) return showToast("Select at least one role.", "error");
  if (String(userId) === String(currentUser.id) && !checkedRoles.includes("admin")) {
    return showToast("Keep admin selected for your own account.", "error");
  }

  try {
    const data = await apiRequest(`/auth/users/${encodeURIComponent(userId)}/roles`, {
      method: "PUT",
      body: JSON.stringify({ roles: checkedRoles })
    });
    const updatedUser = data.user;
    userManagementUsers = userManagementUsers.map((user) => String(user.id) === String(userId)
      ? { ...user, ...updatedUser, roles: (updatedUser.roles || []).map(normalizeRoleKey) }
      : user);
    closePermissionsDrawer();
    renderSettings();
    showToast("User roles updated.");
  } catch (error) {
    showToast(error.message || "Unable to update user roles.", "error");
  }
}

async function addUserFromManagement() {
  if (!isAdmin) return showToast("Admin access is required.", "error");
  if (isAddingUser) return;
  const nameField = document.getElementById("newUserName");
  const emailField = document.getElementById("newUserEmail");
  const roles = Array.from(document.querySelectorAll("input[name='newUserRoles']:checked")).map((input) => input.value);
  const name = String(nameField?.value || "").trim();
  const email = String(emailField?.value || "").trim();
  if (!name) return showToast("Enter the user's full name.", "error");
  if (!email) return showToast("Enter the user's email.", "error");
  if (!roles.length) return showToast("Select at least one role.", "error");

  setAddUserLoading(true);
  try {
    const data = await apiRequest("/auth/users", {
      method: "POST",
      body: JSON.stringify({ name, email, roles })
    });
    const createdUser = data.user;
    const inviteLink = createdUser?.inviteLink || data.inviteLink || "";
    const inviteRecipient = {
      email: createdUser?.email || email,
      name: createdUser?.name || name
    };
    if (createdUser) {
      userManagementUsers = [
        { ...createdUser, roles: (createdUser.roles || []).map(normalizeRoleKey) },
        ...userManagementUsers.filter((user) => String(user.id) !== String(createdUser.id))
      ];
    } else {
      await loadUserManagement({ silent: true });
    }
    nameField.value = "";
    emailField.value = "";
    renderSettings();
    if (inviteLink) {
      setUserInviteLink(inviteLink, inviteRecipient);
      openAddUserDrawer();
      await copyUserInviteLink();
      showToast("User added. Setup link copied and ready to send.");
    } else {
      setUserInviteLink("");
      openAddUserDrawer();
      showToast("User added, but no setup link was returned.", "error");
    }
  } catch (error) {
    showToast(error.message || "Unable to add user.", "error");
  } finally {
    setAddUserLoading(false);
  }
}

async function toggleUserStatus(userId, nextActive) {
  if (!isAdmin) return showToast("Admin access is required.", "error");
  if (String(userId) === String(currentUser.id) && !nextActive) {
    return showToast("You cannot deactivate your own account.", "error");
  }

  try {
    const data = await apiRequest(`/auth/users/${encodeURIComponent(userId)}/status`, {
      method: "PUT",
      body: JSON.stringify({ isActive: nextActive })
    });
    const updatedUser = data.user;
    userManagementUsers = userManagementUsers.map((user) => String(user.id) === String(userId)
      ? { ...user, ...updatedUser, roles: (updatedUser.roles || user.roles || []).map(normalizeRoleKey) }
      : user);
    renderSettings();
    showToast(nextActive ? "User activated." : "User deactivated.");
  } catch (error) {
    showToast(error.message || "Unable to update user status.", "error");
  }
}

async function deleteUser(userId) {
  if (!isAdmin) return showToast("Admin access is required.", "error");
  if (String(userId) === String(currentUser.id)) {
    return showToast("You cannot delete your own account.", "error");
  }
  const user = userManagementUsers.find((item) => String(item.id) === String(userId));
  const label = user?.email || user?.name || "this user";
  pendingDeleteUserId = String(userId);
  document.getElementById("deleteUserMessage").textContent = `Delete ${label}? This will remove the user from the database and remove assigned roles.`;
  document.getElementById("deleteUserModal").classList.add("show");
  document.getElementById("deleteUserModal").setAttribute("aria-hidden", "false");
  if (window.lucide) window.lucide.createIcons();
}

function closeDeleteUserModal() {
  pendingDeleteUserId = "";
  document.getElementById("deleteUserModal").classList.remove("show");
  document.getElementById("deleteUserModal").setAttribute("aria-hidden", "true");
}

async function confirmDeleteUser() {
  const userId = pendingDeleteUserId;
  if (!userId) return;
  try {
    await apiRequest(`/auth/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
    userManagementUsers = userManagementUsers.filter((item) => String(item.id) !== String(userId));
    closeDeleteUserModal();
    renderSettings();
    showToast("User deleted.");
  } catch (error) {
    showToast(error.message || "Unable to delete user.", "error");
  }
}

async function saveActiveSettings(event) {
  event.preventDefault();
  if (!isAdmin) return showToast("Admin access is required.", "error");
  if (activeSettingsGroup === "team" || activeSettingsGroup === "roles") return;
  const section = settingsSections.find((item) => item.group === activeSettingsGroup && !removedSettingsGroups.has(item.group));
  if (!section) return showToast("This settings section is no longer available.", "error");
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
  if (!silent) {
    businessDataLoading = true;
    businessDataError = "";
    Object.keys(businessDataErrors).forEach((key) => delete businessDataErrors[key]);
    render();
  }
  // #region debug-point G:business-data-start
  fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"signin-stale-user",runId:"pre-fix",hypothesisId:"G",location:"script.js:loadBusinessData:start",msg:"[DEBUG] loadBusinessData started",data:{silent,currentUserId:currentUser?.id||"",currentUserName:currentUser?.name||""},ts:Date.now()})}).catch(()=>{});
  // #endregion
  const endpoints = [
    canAccessView("inventory") ? ["items", "/items"] : null,
    canAccessView("inventory") ? ["categories", "/categories"] : null,
    canAccessView("vendors") ? ["vendors", "/vendors"] : null,
    canAccessView("requests") ? ["requests", "/requests"] : null,
    canAccessView("transport") ? ["transportRequests", "/transport-requests"] : null,
    canAccessView("po") ? ["purchaseOrders", "/purchase-orders"] : null,
    canAccessView("grn") ? ["grns", "/grn"] : null,
    canAccessView("inventory") ? ["inventory", "/inventory"] : null
  ].filter(Boolean);
  const results = await Promise.allSettled(endpoints.map(([, path]) => apiRequest(path)));
  const failed = [];
  results.forEach((result, index) => {
    const key = endpoints[index][0];
    if (result.status !== "fulfilled") {
      failed.push(key);
      businessDataErrors[key] = result.reason?.message || `Unable to load ${key} data.`;
      return;
    }
    delete businessDataErrors[key];
    if (key === "inventory") {
      state.transactions = [];
      state.inventoryRows = result.value.inventory || [];
      return;
    }
    if (key === "items") {
      state.items = result.value.items || state.items || [];
      return;
    }
    state[key] = result.value[key] || state[key] || [];
    if (key === "vendors") state.vendors = state.vendors.map(normalizeVendorRecord);
  });
  state = applyImportedInventoryBase(state);
  enforceApprovedLocations();
  // #region debug-point H:business-data-finish
  fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"signin-stale-user",runId:"pre-fix",hypothesisId:"H",location:"script.js:loadBusinessData:finish",msg:"[DEBUG] loadBusinessData completed",data:{failed,items:state.items?.length||0,categories:state.categories?.length||0,inventoryRows:state.inventoryRows?.length||0,requests:state.requests?.length||0},ts:Date.now()})}).catch(()=>{});
  // #endregion
  if (!silent) showToast("IMS data refreshed from database.");
  businessDataError = failed.length ? `Unable to load ${failed.join(", ")} data.` : "";
  businessDataLoading = false;
}

function savePermissionsFromDrawer() {
  if (!activeEditPermissionsUserId) return showToast("Choose a user first.", "error");
  const roles = Array.from(document.querySelectorAll("#teamPermissionsDrawer input[name='editUserRoles']:checked")).map((input) => input.value);
  saveUserRoles(activeEditPermissionsUserId, roles);
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
    await loadNotifications({ silent: true });
    if (document.getElementById("notificationCenter").classList.contains("show")) renderNotificationCenter();
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
  document.querySelectorAll(".nav-item[data-view]").forEach((item) => {
    item.hidden = !canAccessView(item.dataset.view);
    item.classList.remove("unauthorized-nav");
  });
  document.querySelectorAll(".nav-section").forEach((section) => {
    const items = Array.from(section.querySelectorAll(".nav-item[data-view]"));
    if (!items.length) return;
    section.hidden = items.every((item) => item.hidden);
  });
}

function applyTheme(theme) {
  const normalized = String(theme || "Light").toLowerCase() === "dark" ? "dark" : "light";
  document.body.dataset.theme = normalized;
  localStorage.setItem(THEME_STORAGE_KEY, normalized);
  if (!settingsState.theme) settingsState.theme = {};
  settingsState.theme.portal_theme = normalized === "dark" ? "Dark" : "Light";
}

function notificationAudience(item = {}) {
  return item.metadata?.audience === "system" || (!item.recipientUserId && !item.recipientEmail) ? "watching" : "direct";
}

function notificationInitials(item = {}) {
  const label = item.type || item.entityType || item.title || "Notification";
  return String(label)
    .split(/[\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "IN";
}

function notificationTone(item = {}) {
  const type = String(item.type || "").toLowerCase();
  if (type.includes("approved") || type.includes("grn")) return "green";
  if (type.includes("stock") || type.includes("transport")) return "teal";
  return "";
}

function notificationType(item = {}) {
  return String(item.type || item.metadata?.type || "").toLowerCase();
}

function notificationReference(item = {}) {
  const metadata = item.metadata || {};
  return metadata.requestNumber
    || metadata.requestId
    || metadata.poNumber
    || metadata.grnNumber
    || metadata.movementNumber
    || item.reference
    || "";
}

function viewForNotification(item = {}) {
  const type = notificationType(item);
  const entity = String(item.entityType || "").toLowerCase();
  if (type.includes("approval_required")) return canAccessView("approvals") ? "approvals" : "requisition";
  if (entity.includes("transport") || type.includes("transport")) return "transport";
  if (entity.includes("purchase_order") || type.includes("po_")) return "po";
  if (entity.includes("grn") || type.includes("grn")) return "grn";
  if (entity.includes("inventory") || type.includes("stock_low")) return "inventory";
  if (entity.includes("stock_movement") || type.includes("stock_issued")) return canAccessView("issue") ? "issue" : "requisition";
  if (entity.includes("request") || type.includes("request")) return canAccessView("requisition") ? "requisition" : "requests";
  return firstAccessibleView();
}

function scrollToNotificationTarget(item = {}) {
  const reference = String(notificationReference(item) || "").trim();
  if (!reference) return;
  requestAnimationFrame(() => {
    const escapedReference = window.CSS?.escape ? CSS.escape(reference) : reference.replace(/["\\]/g, "\\$&");
    const target = document.querySelector(`[data-request-id="${escapedReference}"], [data-reference-id="${escapedReference}"]`);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("notification-target-highlight");
    setTimeout(() => target.classList.remove("notification-target-highlight"), 2200);
  });
}

function openNotificationTarget(item = {}) {
  const view = viewForNotification(item);
  closeNotificationCenter();
  setView(view);
  scrollToNotificationTarget(item);
}

function unlockNotificationSound() {
  notificationSoundUnlocked = true;
}

function playNotificationSound() {
  if (!notificationSoundUnlocked) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const context = new AudioContext();
  const now = context.currentTime;
  const gain = context.createGain();
  gain.connect(context.destination);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);

  [740, 980].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, now + index * 0.16);
    oscillator.connect(gain);
    oscillator.start(now + index * 0.16);
    oscillator.stop(now + index * 0.16 + 0.22);
  });
  setTimeout(() => context.close(), 800);
}

function syncNotificationSoundState(nextNotifications = [], { allowSound = true } = {}) {
  const unreadIds = nextNotifications
    .filter((item) => item.unread)
    .map((item) => String(item.id));
  const hasNewUnread = unreadIds.some((id) => !knownUnreadNotificationIds.has(id));
  knownUnreadNotificationIds.clear();
  unreadIds.forEach((id) => knownUnreadNotificationIds.add(id));
  if (allowSound && hasNewUnread) playNotificationSound();
}

async function loadNotifications({ silent = false } = {}) {
  const list = document.getElementById("notificationList");
  if (!silent && list) list.innerHTML = `<div class="notification-empty">Loading notifications...</div>`;
  try {
    const wasLoaded = notificationsLoaded;
    const data = await apiRequest(`/notifications${unreadOnly ? "?unreadOnly=true" : ""}`);
    notifications = Array.isArray(data.notifications) ? data.notifications : [];
    notificationsLoaded = true;
    syncNotificationSoundState(notifications, { allowSound: wasLoaded });
    updateNotificationBadge();
    return notifications;
  } catch (error) {
    if (!silent && list) list.innerHTML = `<div class="notification-empty">Unable to load notifications.</div>`;
    showToast(error.message || "Unable to load notifications.", "error");
    return [];
  }
}

async function markNotificationRead(id) {
  const item = notifications.find((row) => String(row.id) === String(id));
  if (!item || !item.unread) return;
  try {
    await apiRequest(`/notifications/${encodeURIComponent(id)}/read`, { method: "PATCH" });
    notifications = notifications.map((row) => String(row.id) === String(id) ? { ...row, unread: false, status: "read" } : row);
    updateNotificationBadge();
    renderNotificationCenter();
  } catch (error) {
    showToast(error.message || "Unable to mark notification as read.", "error");
  }
}

function renderNotificationCenter() {
  const list = document.getElementById("notificationList");
  const rows = notifications
    .filter((item) => !unreadOnly || item.unread);
  document.querySelectorAll(".notification-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.notificationTab === (unreadOnly ? "watching" : "direct"));
  });
  const unreadToggle = document.getElementById("unreadOnlyToggle");
  if (unreadToggle) unreadToggle.checked = unreadOnly;
  if (!notificationsLoaded) {
    list.innerHTML = `<div class="notification-empty">Loading notifications...</div>`;
    return;
  }
  list.innerHTML = `${rows.slice(0, 6).map((item) => `
    <article class="notification-item ${item.unread ? "" : "read"}" data-notification-id="${escapeHtml(item.id)}" title="${escapeHtml(item.message || item.body || "")}">
      <div class="notification-avatar ${notificationTone(item)}">${escapeHtml(notificationInitials(item))}</div>
      <div class="notification-body">
        <strong>${escapeHtml(item.title)}</strong>
        <p>${escapeHtml(item.message || item.body || "")}</p>
      </div>
      <span class="notification-arrow"><i data-lucide="arrow-right"></i></span>
      ${item.unread ? `<span class="notification-dot"></span>` : ""}
    </article>
  `).join("") || `<div class="notification-empty">${unreadOnly ? "No unread notifications." : "No notifications yet."}</div>`}
  ${rows.length ? `<button class="notification-see-all" type="button">See all</button>` : ""}`;
  if (window.lucide) lucide.createIcons();
}

function updateNotificationBadge() {
  const hasUnread = notifications.some((item) => item.unread);
  const btn = document.getElementById("notificationBtn");
  if (!btn) return;
  btn.classList.toggle("has-unread", hasUnread);
  btn.setAttribute("aria-label", hasUnread ? "Notifications, unread" : "Notifications");
}

async function openNotificationCenter() {
  const panel = document.getElementById("notificationCenter");
  panel.classList.add("show");
  panel.setAttribute("aria-hidden", "false");
  document.getElementById("notificationBtn").setAttribute("aria-expanded", "true");
  renderNotificationCenter();
  await loadNotifications();
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
  if (panel.classList.contains("show")) closeNotificationCenter();
  else openNotificationCenter();
}

function chatUserSubtitle(user) {
  return user.department || "IMS user";
}

function selectedChatUser() {
  return chatUsers.find((user) => String(user.id) === String(selectedChatUserId)) || null;
}

function renderUnreadBadges() {
  const totalUnread = chatUsers.reduce((sum, user) => sum + Number(user.unreadCount || 0), 0);
  const badge = document.getElementById("chatTopbarBadge");
  const btn = document.getElementById("chatBtn");
  if (!badge || !btn) return;
  badge.hidden = totalUnread <= 0;
  badge.textContent = totalUnread > 99 ? "99+" : String(totalUnread);
  btn.classList.toggle("has-unread", totalUnread > 0);
  btn.setAttribute("aria-label", totalUnread > 0 ? `Chat, ${totalUnread} unread` : "Chat");
}

function renderChatUsers() {
  const list = document.getElementById("chatUserList");
  if (!list) return;
  if (!chatUsersLoaded) {
    list.innerHTML = `<div class="chat-empty">Loading users...</div>`;
    return;
  }
  if (chatLoadError) {
    list.innerHTML = `<div class="chat-empty">${escapeHtml(chatLoadError)}</div>`;
    return;
  }
  const term = chatSearchTerm.trim().toLowerCase();
  const rows = chatUsers.filter((user) => {
    const haystack = [user.name, user.email, user.role, user.department].join(" ").toLowerCase();
    return !term || haystack.includes(term);
  });
  list.innerHTML = rows.map((user) => `
    <button class="chat-user ${String(user.id) === String(selectedChatUserId) ? "active" : ""}" type="button" data-chat-user-id="${escapeHtml(user.id)}">
      <span class="chat-avatar">${escapeHtml(initialsFor(user.name || user.email))}</span>
      <span class="chat-user-copy">
        <strong>${escapeHtml(user.name || user.email || "IMS user")}</strong>
        <span>${escapeHtml(user.email || "")}</span>
        ${user.department ? `<em>${escapeHtml(user.department)}</em>` : ""}
      </span>
      ${Number(user.unreadCount || 0) ? `<span class="chat-unread">${Number(user.unreadCount) > 99 ? "99+" : escapeHtml(user.unreadCount)}</span>` : ""}
    </button>
  `).join("") || `<div class="chat-empty">No users found.</div>`;
}

function renderChatThreadHead() {
  const head = document.getElementById("chatThreadHead");
  const input = document.getElementById("chatMessageInput");
  const submit = document.querySelector("#chatForm button[type='submit']");
  const user = selectedChatUser();
  if (!head || !input || !submit) return;
  if (!user) {
    head.innerHTML = `<strong>Select a user</strong><span>Start a private conversation</span>`;
    input.disabled = true;
    submit.disabled = true;
    return;
  }
  head.innerHTML = `
    <span class="chat-avatar">${escapeHtml(initialsFor(user.name || user.email))}</span>
    <span><strong>${escapeHtml(user.name || user.email || "IMS user")}</strong><em>${escapeHtml(user.email || chatUserSubtitle(user))}</em></span>
  `;
  input.disabled = false;
  submit.disabled = false;
}

function renderChatMessages() {
  const box = document.getElementById("chatMessages");
  if (!box) return;
  if (!selectedChatUserId) {
    box.innerHTML = `<div class="chat-empty thread-empty">Choose someone from the user list.</div>`;
    return;
  }
  box.innerHTML = chatMessages.map((message) => {
    const own = String(message.senderId) === String(currentUser.id);
    return `
      <article class="chat-message ${own ? "own" : ""}">
        <div class="chat-bubble">
          <p>${escapeHtml(message.messageText || "")}</p>
          <span class="chat-message-meta"><time>${escapeHtml(formatChatTime(message.createdAt))}</time>${own ? `<i data-lucide="check-check"></i>` : ""}</span>
        </div>
      </article>
    `;
  }).join("") || `<div class="chat-empty thread-empty">No messages yet.</div>`;
  box.scrollTop = box.scrollHeight;
}

function formatChatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

async function loadChatUsers({ silent = false } = {}) {
  if (!silent) {
    chatUsersLoaded = false;
    chatLoadError = "";
    renderChatUsers();
  }
  try {
    const [usersResponse, conversationsResponse] = await Promise.all([
      apiRequest("/chat/users"),
      apiRequest("/chat/conversations")
    ]);
    chatConversations = conversationsResponse.conversations || [];
    const conversationByUser = new Map(chatConversations.map((conversation) => [String(conversation.otherUserId), conversation]));
    chatUsers = (usersResponse.users || []).map((user) => {
      const conversation = conversationByUser.get(String(user.id));
      return {
        ...user,
        unreadCount: conversation ? Number(conversation.unreadCount || 0) : Number(user.unreadCount || 0),
        lastMessageAt: conversation?.lastMessageAt || user.lastMessageAt
      };
    });
    chatLoadError = "";
  } catch (error) {
    chatLoadError = error.statusCode === 404
      ? "Chat service is not available yet. Restart the IMS backend."
      : (error.message || "Unable to load chat users.");
    if (!silent) showToast(chatLoadError, "error");
  } finally {
    chatUsersLoaded = true;
    renderUnreadBadges();
    renderChatUsers();
    renderChatThreadHead();
  }
}

async function selectChatUser(userId) {
  if (String(userId) === String(currentUser.id)) return;
  selectedChatUserId = String(userId);
  chatMessages = [];
  renderChatUsers();
  renderChatThreadHead();
  renderChatMessages();
  await loadMessages(userId);
  await markMessagesRead(userId);
}

async function loadMessages(otherUserId = selectedChatUserId) {
  if (!otherUserId) return;
  const response = await apiRequest(`/chat/messages/${encodeURIComponent(otherUserId)}`);
  chatMessages = response.messages || [];
  renderChatMessages();
}

async function sendMessage(event) {
  event.preventDefault();
  if (!selectedChatUserId) return;
  const input = document.getElementById("chatMessageInput");
  const messageText = String(input?.value || "").trim();
  if (!messageText) {
    showToast("Message cannot be empty.", "error");
    return;
  }
  input.value = "";
  try {
    await apiRequest("/chat/messages", {
      method: "POST",
      body: JSON.stringify({ receiverId: selectedChatUserId, messageText })
    });
    await loadMessages(selectedChatUserId);
    await loadChatUsers({ silent: true });
  } catch (error) {
    input.value = messageText;
    showToast(error.message || "Unable to send message.", "error");
  }
}

async function markMessagesRead(otherUserId = selectedChatUserId) {
  if (!otherUserId) return;
  await apiRequest(`/chat/messages/${encodeURIComponent(otherUserId)}/read`, { method: "PUT" });
  chatUsers = chatUsers.map((user) => String(user.id) === String(otherUserId) ? { ...user, unreadCount: 0 } : user);
  renderUnreadBadges();
  renderChatUsers();
}

async function pollChat() {
  try {
    await loadChatUsers({ silent: true });
    if (selectedChatUserId && document.getElementById("chatPanel")?.classList.contains("show")) {
      await loadMessages(selectedChatUserId);
      await markMessagesRead(selectedChatUserId);
    }
  } catch (error) {
    console.warn("Chat polling failed:", error);
  }
}

function startChatPolling() {
  if (chatPollTimer) return;
  pollChat();
  chatPollTimer = setInterval(pollChat, CHAT_POLL_INTERVAL_MS);
}

async function openChatPanel() {
  const panel = document.getElementById("chatPanel");
  panel.classList.add("show");
  panel.setAttribute("aria-hidden", "false");
  document.getElementById("chatBtn").setAttribute("aria-expanded", "true");
  closeNotificationCenter();
  await loadChatUsers({ silent: chatUsersLoaded });
  renderChatMessages();
}

function closeChatPanel() {
  const panel = document.getElementById("chatPanel");
  panel.classList.remove("show");
  panel.setAttribute("aria-hidden", "true");
  document.getElementById("chatBtn").setAttribute("aria-expanded", "false");
}

function toggleChatPanel() {
  const panel = document.getElementById("chatPanel");
  if (panel.classList.contains("show")) closeChatPanel();
  else openChatPanel();
}

function money(value) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function quantityValue(value) {
  if (value === null || value === undefined || value === "") return "0";
  const number = Number(value || 0);
  return Number.isNaN(number) ? String(value) : String(Math.round(number));
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function remainingPoQuantity(po) {
  return Math.max(Number(po?.quantityOrdered || 0) - Number(po?.quantityReceived || 0), 0);
}

function remainingPoLineQuantity(item) {
  return Math.max(Number(item?.quantityOrdered || 0) - Number(item?.quantityReceived || 0), 0);
}

function poLineItems(po) {
  if (Array.isArray(po?.items) && po.items.length) return po.items;
  return [{
    category: po?.category || "",
    itemName: po?.itemName || "",
    itemType: po?.itemType || po?.type || "",
    itemCode: po?.itemCode || "",
    specifications: po?.specifications || po?.description || "",
    quantityOrdered: Number(po?.quantityOrdered ?? po?.quantity ?? 0),
    unitPrice: Number(po?.unitPrice || 0),
    subtotal: Number(po?.subtotal ?? (po?.quantityOrdered || po?.quantity || 0) * (po?.unitPrice || 0))
  }];
}

function poItemSummary(po) {
  const lines = poLineItems(po);
  if (lines.length > 1) return `${lines.length} items: ${lines.map((item) => item.itemName || item.itemCode || item.specifications || "Item").filter(Boolean).slice(0, 3).join(", ")}${lines.length > 3 ? "..." : ""}`;
  const item = lines[0] || {};
  return `${item.itemCode ? `${item.itemCode} - ` : ""}${item.itemName || item.specifications || ""}`;
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
  if (!field) return;
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
  setChoiceOptions(inventoryLocationSelect, "All locations", state.locations);
  if (state.locations.includes(inventoryLocationFilter)) {
    inventoryLocationSelect.value = inventoryLocationFilter;
  } else {
    inventoryLocationFilter = "All";
    inventoryLocationSelect.value = "";
  }
  const stockIssueLocationSelect = document.getElementById("stockIssueLocationFilter");
  setChoiceOptions(stockIssueLocationSelect, "All locations", state.locations);
  if (state.locations.includes(stockIssueLocationFilter)) {
    stockIssueLocationSelect.value = stockIssueLocationFilter;
  } else {
    stockIssueLocationFilter = "All";
    if (stockIssueLocationSelect) stockIssueLocationSelect.value = "";
  }
  const grnVendorSelect = document.getElementById("grnVendorFilter");
  const vendorNames = [...new Set(state.vendors.map((vendor) => vendor.name).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  setChoiceOptions(grnVendorSelect, "All vendors", vendorNames);
  if (vendorNames.includes(grnVendorFilter)) {
    grnVendorSelect.value = grnVendorFilter;
  } else {
    grnVendorFilter = "All";
    if (grnVendorSelect) grnVendorSelect.value = "";
  }
  syncVendorFilterClearButton("grn");
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
    setChoiceOptions(field, "Select type", items, (item) => item.type, (item) => item.type);
    const selectedItem = items.find((item) => item.code === selected || item.type === selected);
    if (selectedItem) field.value = selectedItem.type;
  });
  scope.querySelectorAll("[data-vendors]").forEach((field) => {
    const selected = field.value;
    setChoiceOptions(field, "Select vendor", state.vendors, (vendor) => vendor.name, (vendor) => vendor.name);
    if (selected) field.value = selected;
  });
  const poSelect = document.getElementById("poSelect");
  const selectedPo = poSelect.value;
  const receivablePos = state.purchaseOrders.filter(canReceivePo);
  setChoiceOptions(poSelect, "Select PO number", receivablePos, (po) => po.poNumber, (po) => `${po.poNumber} - ${poItemSummary(po)} (${quantityValue(remainingPoQuantity(po))} remaining)`);
  if (selectedPo && receivablePos.some((po) => po.poNumber === selectedPo)) poSelect.value = selectedPo;
}

function enableDatalistRefocusOptions() {
  document.addEventListener("focusin", (event) => {
    const field = event.target;
    if (!(field instanceof HTMLInputElement) || !field.getAttribute("list") || !field.value) return;
    field.dataset.previousDatalistValue = field.value;
    field.dataset.datalistChanged = "false";
    field.value = "";
  });

  document.addEventListener("input", (event) => {
    const field = event.target;
    if (!(field instanceof HTMLInputElement) || !field.dataset.previousDatalistValue) return;
    field.dataset.datalistChanged = "true";
  });

  document.addEventListener("focusout", (event) => {
    const field = event.target;
    if (!(field instanceof HTMLInputElement) || !field.dataset.previousDatalistValue) return;
    const previousValue = field.dataset.previousDatalistValue;
    const changed = field.dataset.datalistChanged === "true";
    if (!changed && !field.value) field.value = previousValue;
    delete field.dataset.previousDatalistValue;
    delete field.dataset.datalistChanged;
  });
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
  const typeField = document.getElementById(typeSelectId);
  const itemName = typeField.dataset.itemSource ? document.getElementById(typeField.dataset.itemSource)?.value : "";
  const category = typeField.dataset.categorySource ? document.getElementById(typeField.dataset.categorySource)?.value : "";
  const item = findItemBySelection(itemName, typeField.value, category);
  document.getElementById(displayInputId).value = item ? item.code : "";
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

function openManualStockIssue() {
  const drawer = document.getElementById("manualStockIssueDrawer");
  if (!drawer) return;
  if (drawer.parentElement !== document.body) document.body.appendChild(drawer);
  drawer.classList.add("show");
  drawer.setAttribute("aria-hidden", "false");
  document.body.classList.add("manual-stock-issue-open");
}

function closeManualStockIssue() {
  const drawer = document.getElementById("manualStockIssueDrawer");
  if (!drawer) return;
  drawer.classList.remove("show");
  drawer.setAttribute("aria-hidden", "true");
  document.body.classList.remove("manual-stock-issue-open");
}

function openPoDrawer() {
  const drawer = document.getElementById("poDrawer");
  if (!drawer) return;
  if (drawer.parentElement !== document.body) document.body.appendChild(drawer);
  syncSelectOptions(drawer);
  drawer.classList.add("show");
  drawer.setAttribute("aria-hidden", "false");
  document.body.classList.add("po-drawer-open");
  if (window.lucide) window.lucide.createIcons();
}

function closePoDrawer() {
  const drawer = document.getElementById("poDrawer");
  if (!drawer) return;
  drawer.classList.remove("show");
  drawer.setAttribute("aria-hidden", "true");
  document.body.classList.remove("po-drawer-open");
}

function openVendorDrawer() {
  const drawer = document.getElementById("vendorDrawer");
  if (!drawer) return;
  if (drawer.parentElement !== document.body) document.body.appendChild(drawer);
  drawer.classList.add("show");
  drawer.setAttribute("aria-hidden", "false");
  document.body.classList.add("vendor-drawer-open");
  if (window.lucide) window.lucide.createIcons();
}

function closeVendorDrawer() {
  const drawer = document.getElementById("vendorDrawer");
  if (!drawer) return;
  drawer.classList.remove("show");
  drawer.setAttribute("aria-hidden", "true");
  document.body.classList.remove("vendor-drawer-open");
}

function mountInventorySubsections() {
  [
    ["issueView", "inventoryIssuePanel"],
    ["grnView", "inventoryGrnPanel"]
  ].forEach(([sourceId, targetId]) => {
    const source = document.getElementById(sourceId);
    const target = document.getElementById(targetId);
    if (!source || !target || target.childElementCount) return;
    while (source.firstElementChild) {
      target.appendChild(source.firstElementChild);
    }
  });
}

function mountProcurementSubsections() {
  [
    ["poView", "procurementPoPanel"],
    ["vendorsView", "procurementVendorsPanel"]
  ].forEach(([sourceId, targetId]) => {
    const source = document.getElementById(sourceId);
    const target = document.getElementById(targetId);
    if (!source || !target || target.childElementCount) return;
    while (source.firstElementChild) {
      target.appendChild(source.firstElementChild);
    }
  });
}

function mountRequestSubsections() {
  [
    ["requisitionView", "requestsRequisitionPanel"],
    ["transportView", "requestsTransportPanel"]
  ].forEach(([sourceId, targetId]) => {
    const source = document.getElementById(sourceId);
    const target = document.getElementById(targetId);
    if (!source || !target || target.childElementCount) return;
    while (source.firstElementChild) {
      target.appendChild(source.firstElementChild);
    }
  });
}

const breadcrumbByView = {
  dashboard: ["Dashboard"],
  requisition: ["Requests", "Requisition Form"],
  requests: ["Requests"],
  inventory: ["Inventory"],
  issue: ["Inventory", "Stock Issue"],
  grn: ["Inventory", "GRN"],
  procurement: ["Procurement"],
  po: ["Procurement", "PO"],
  vendors: ["Procurement", "Vendors"],
  transport: ["Requests", "Transport Requests"],
  approvals: ["Approvals"],
  settings: ["Settings"],
  history: ["History"]
};

function updateTopbarBreadcrumb(view) {
  const breadcrumb = document.getElementById("topbarBreadcrumb");
  if (!breadcrumb) return;
  const parts = view === "inventory"
    ? ["Inventory", INVENTORY_TAB_LABELS[inventoryModuleTab] || "Items"]
    : view === "procurement"
      ? ["Procurement", PROCUREMENT_TAB_LABELS[procurementModuleTab] || "PO"]
    : view === "requests"
      ? ["Requests", REQUEST_TAB_LABELS[requestModuleTab] || "Requisition Form"]
    : breadcrumbByView[view] || ["Dashboard"];
  breadcrumb.innerHTML = `<span>Workspace</span>${parts.map((part, index) => `
    <i data-lucide="chevron-right"></i>
    ${index === parts.length - 1 ? `<strong>${escapeHtml(part)}</strong>` : `<span>${escapeHtml(part)}</span>`}
  `).join("")}`;
  if (window.lucide) lucide.createIcons();
}

function setView(view) {
  if (INVENTORY_VIEW_TABS[view]) {
    inventoryModuleTab = INVENTORY_VIEW_TABS[view];
    view = "inventory";
  }
  if (PROCUREMENT_VIEW_TABS[view]) {
    procurementModuleTab = PROCUREMENT_VIEW_TABS[view];
    view = "procurement";
  }
  if (REQUEST_VIEW_TABS[view]) {
    requestModuleTab = REQUEST_VIEW_TABS[view];
    view = "requests";
  }
  if (view === "requests") normalizeRequestModuleTab();
  if (!canAccessView(view)) {
    view = firstAccessibleView();
    if (INVENTORY_VIEW_TABS[view]) {
      inventoryModuleTab = INVENTORY_VIEW_TABS[view];
      view = "inventory";
    }
    if (PROCUREMENT_VIEW_TABS[view]) {
      procurementModuleTab = PROCUREMENT_VIEW_TABS[view];
      view = "procurement";
    }
    if (REQUEST_VIEW_TABS[view]) {
      requestModuleTab = REQUEST_VIEW_TABS[view];
      view = "requests";
    }
    if (view === "requests") normalizeRequestModuleTab();
  }
  if (!document.getElementById(`${view}View`)) view = firstAccessibleView();
  document.querySelector(".app-shell")?.setAttribute("data-active-view", view);
  document.querySelectorAll(".view").forEach((panel) => panel.classList.remove("active"));
  document.getElementById(`${view}View`).classList.add("active");
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  const active = document.querySelector(`.nav-item[data-view="${view}"] span:last-child`);
  document.getElementById("pageTitle").textContent = view === "history" ? "History" : active ? active.textContent : "Dashboard";
  updateTopbarBreadcrumb(view);
  render();
}

function openHistoryPage(section) {
  const activePanel = document.querySelector(".view.active");
  previousHistoryView = activePanel ? activePanel.id.replace(/View$/, "") : "dashboard";
  activeHistorySection = section;
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

function updatePoLineNumbers() {
  document.querySelectorAll("#poItems .po-item-row").forEach((row, index) => {
    row.querySelector("[data-po-line-number]").textContent = index + 1;
    row.querySelector(".remove-po-item").hidden = document.querySelectorAll("#poItems .po-item-row").length === 1;
  });
}

function updatePoRowItemId(row) {
  const itemName = row.querySelector("[name='itemName']").value;
  const itemType = row.querySelector("[name='itemCode']").value;
  const category = row.querySelector("[name='category']").value;
  const item = findItemBySelection(itemName, itemType, category);
  row.querySelector("[name='itemIdDisplay']").value = item ? item.code : "";
  const specifications = row.querySelector("[name='specifications']");
  if (item && !specifications.value) specifications.value = `${item.name} - ${item.type}`;
}

function syncPoRowOptions(row) {
  const categoryField = row.querySelector("[name='category']");
  const itemNameField = row.querySelector("[name='itemName']");
  const itemTypeField = row.querySelector("[name='itemCode']");
  itemNameField.dataset.categorySource = categoryField.id;
  itemTypeField.dataset.itemSource = itemNameField.id;
  itemTypeField.dataset.categorySource = categoryField.id;
  syncSelectOptions(row);
}

function addPoItemLine() {
  const currentRows = document.querySelectorAll("#poItems .po-item-row");
  if (currentRows.length >= 20) return showToast("A PO can include up to 20 items.", "error");
  const template = document.getElementById("poItemTemplate");
  const row = template.content.firstElementChild.cloneNode(true);
  const uid = `poLine${Date.now()}${currentRows.length}`;
  row.querySelector("[name='category']").id = `${uid}Category`;
  row.querySelector("[name='itemName']").id = `${uid}ItemName`;
  row.querySelector("[name='itemCode']").id = `${uid}ItemType`;
  row.querySelector("[name='itemIdDisplay']").id = `${uid}ItemId`;
  row.querySelector(".remove-po-item").addEventListener("click", () => {
    if (document.querySelectorAll("#poItems .po-item-row").length <= 1) return;
    row.remove();
    updatePoLineNumbers();
    updatePOAmount();
  });
  row.querySelector("[name='category']").addEventListener("change", () => {
    row.querySelector("[name='itemName']").value = "";
    row.querySelector("[name='itemCode']").value = "";
    updatePoRowItemId(row);
    syncPoRowOptions(row);
  });
  row.querySelector("[name='itemName']").addEventListener("change", () => {
    row.querySelector("[name='itemCode']").value = "";
    updatePoRowItemId(row);
    syncPoRowOptions(row);
  });
  row.querySelector("[name='itemName']").addEventListener("input", () => {
    row.querySelector("[name='itemCode']").value = "";
    updatePoRowItemId(row);
    syncPoRowOptions(row);
  });
  row.querySelector("[name='itemCode']").addEventListener("change", () => updatePoRowItemId(row));
  row.querySelector("[name='itemCode']").addEventListener("input", () => updatePoRowItemId(row));
  row.querySelector("[name='quantityOrdered']").addEventListener("input", updatePOAmount);
  row.querySelector("[name='unitPrice']").addEventListener("input", updatePOAmount);
  document.getElementById("poItems").appendChild(row);
  syncPoRowOptions(row);
  updatePoLineNumbers();
  updatePOAmount();
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
    ["Low Stock Items", currentStockRows.filter((row) => row.status === "Low stock").length],
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
      inventoryStatusFilter = "Low stock";
      inventorySearchTerm = "";
      const inventorySearchInput = document.getElementById("inventorySearchInput");
      if (inventorySearchInput) inventorySearchInput.value = "";
      inventoryPage = 1;
      setView("inventory");
    },
    "out-of-stock": () => {
      inventoryStatusFilter = "Out of stock";
      inventorySearchTerm = "";
      const inventorySearchInput = document.getElementById("inventorySearchInput");
      if (inventorySearchInput) inventorySearchInput.value = "";
      inventoryPage = 1;
      setView("inventory");
    },
    "inventory-items": () => {
      inventoryCategoryFilter = "All";
      inventoryLocationFilter = "All";
      inventoryStatusFilter = "All";
      inventorySearchTerm = "";
      const inventorySearchInput = document.getElementById("inventorySearchInput");
      if (inventorySearchInput) inventorySearchInput.value = "";
      inventoryPage = 1;
      setView("inventory");
    },
    "open-po": () => setView("po"),
    "pending-grns": () => setView("grn"),
    "transport-requests": () => setView("transport"),
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
  if (!dashboardDefaultHtml) dashboardDefaultHtml = document.getElementById("dashboardView")?.innerHTML || "";
  if (businessDataLoading) {
    showCardSkeleton("dashboardView");
    showTableSkeleton("dashboardRecentRequests", 6, 5);
    showTableSkeleton("dashboardPendingApprovals", 5, 5);
    showTableSkeleton("dashboardRecentActivity", 4, 6);
    return;
  }
  restoreDashboardShell();
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
  setText("kpiStockLines", currentStockRows.length);
  setText("kpiInStock", currentStockRows.filter((row) => row.stock > 0).length);
  setText("kpiStockLow", currentStockRows.filter((row) => row.status === "Low stock").length);
  setText("kpiOutOfStock", currentStockRows.filter((row) => row.status === "Out of stock").length);
  setText("kpiVendors", state.vendors.filter(isActiveVendor).length);
  setText("kpiVendorContacts", state.vendors.filter((vendor) => vendor.contact).length);
  setText("kpiVendorPhones", state.vendors.filter((vendor) => vendor.phone).length);
  setText("kpiVendorPOs", linkedVendorIds.size);
  setText("kpiTotalGRNs", state.grns.length);
  setText("kpiInventoryItems", state.items.length);
  setText("kpiItemCategories", categories().length);
  setText("kpiAcceptedQty", quantityValue(state.grns.reduce((sum, grn) => sum + Number(grn.qtyAccepted || 0), 0)));
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
  const recentRequestsTable = document.getElementById("dashboardRecentRequests");
  if (recentRequestsTable) setTableContent("dashboardRecentRequests", recentRows.join("") || emptyStateRow(6, "No requests yet", "Recent inventory requests will appear here."));

  const pendingApprovalsTable = document.getElementById("dashboardPendingApprovals");
  if (pendingApprovalsTable) setTableContent("dashboardPendingApprovals", pendingRequests
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
    `).join("") || emptyStateRow(5, "No pending approvals", "Requests awaiting approval will appear here."));

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

  const recentActivityTable = document.getElementById("dashboardRecentActivity");
  if (recentActivityTable) setTableContent("dashboardRecentActivity", activities.map((activity) => `
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
  `).join("") || emptyStateRow(4, "No recent activity", "Audit, request, PO, and GRN activity will appear here."));
}

function renderRequests() {
  if (businessDataLoading) {
    showTableSkeleton("requestsTable", 12, 7);
    return;
  }
  const requestsError = sourceError("requests");
  if (requestsError) {
    setTableContent("requestsTable", errorStateRow(12, requestsError));
    return;
  }
  const rows = state.requests.flatMap((request) => request.items.map((item) => ({ request, item })))
    .filter(({ item }) => !isRequestLineHistory(item))
    .filter(({ item }) => requestsFilter === "All" || item.approvalStatus === requestsFilter);
  const pageCount = Math.max(1, Math.ceil(rows.length / REQUESTS_PAGE_SIZE));
  requestsPage = Math.min(Math.max(1, requestsPage), pageCount);
  const start = (requestsPage - 1) * REQUESTS_PAGE_SIZE;
  const pageRows = rows.slice(start, start + REQUESTS_PAGE_SIZE);
  setTableContent("requestsTable", pageRows.map(({ request, item }) => {
    return `
      <tr data-request-id="${escapeHtml(request.requestId)}">
        <td>${escapeHtml(request.requestId)}</td>
        <td>${escapeHtml(request.requester)}</td>
        <td>${escapeHtml(request.department)}</td>
        <td>${escapeHtml(request.managerEmail || "")}</td>
        <td>${escapeHtml(request.location)}</td>
        <td>${escapeHtml(item.itemCode)}</td>
        <td>${escapeHtml(item.itemName)}</td>
        <td>${escapeHtml(item.type || "")}</td>
        <td>${quantityValue(item.quantity)}</td>
        <td>${statusBadge(item.approvalStatus)}</td>
        <td>${statusBadge(item.issuanceStatus)}</td>
        <td>${formatDate(request.date)}</td>
      </tr>`;
  }).join("") || emptyStateRow(12, "No requests yet", "Inventory request lines will appear here once they are submitted."));
  document.getElementById("requestsPageInfo").textContent = `Page ${requestsPage} of ${pageCount}`;
  document.getElementById("requestsPrev").disabled = requestsPage === 1;
  document.getElementById("requestsNext").disabled = requestsPage === pageCount;
}

function isRequestLineHistory(item = {}) {
  return ["Approved", "Issued", "Rejected", "Cancelled"].includes(item.approvalStatus)
    || ["Issued", "Rejected", "Cancelled"].includes(item.issuanceStatus);
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
    <tr data-request-id="${escapeHtml(request.requestId)}">
      <td>${escapeHtml(request.requestId)}</td>
      <td>${escapeHtml(request.requester)}</td>
      <td>${escapeHtml(request.department)}</td>
      <td>${escapeHtml(request.managerEmail || "")}</td>
      <td>${escapeHtml(request.location)}</td>
      <td>${escapeHtml(item.itemCode)}</td>
      <td>${escapeHtml(item.itemName)}</td>
      <td>${escapeHtml(item.type || "")}</td>
      <td>${quantityValue(item.quantity)}</td>
      <td>${statusBadge(item.approvalStatus)}</td>
      <td>${statusBadge(item.issuanceStatus)}</td>
      <td>${formatDate(request.date)}</td>
    </tr>`;
}

function renderRequisition() {
  if (businessDataLoading) {
    showTableSkeleton("myRequestsTable", 12, 6);
    return;
  }
  const rows = requestLineRows(state.requests.filter(requesterMatchesCurrentUser));
  const table = document.getElementById("myRequestsTable");
  if (!table) return;
  const requestsError = sourceError("requests");
  setTableContent("myRequestsTable", requestsError
    ? errorStateRow(12, requestsError)
    : rows.map(requestTrackingRow).join("") || emptyStateRow(12, "No requests yet", "Your submitted requests will appear here."));
}

function renderInventory() {
  if (businessDataLoading) {
    const cards = document.getElementById("inventoryCards");
    if (cards) cards.innerHTML = `<div class="inventory-card-empty">Loading inventory...</div>`;
    return;
  }
  const inventoryError = sourceError("inventory", "items");
  if (inventoryError) {
    const cards = document.getElementById("inventoryCards");
    if (cards) cards.innerHTML = `<div class="inventory-card-empty">${escapeHtml(inventoryError)}</div>`;
    return;
  }
  const searchTerm = inventorySearchTerm.trim().toLowerCase();
  const allStockRows = stockRows();
  const filteredStockRows = allStockRows.filter((row) => {
    const matchesCategory = inventoryCategoryFilter === "All" || row.category === inventoryCategoryFilter;
    const matchesLocation = inventoryLocationFilter === "All" || row.location === inventoryLocationFilter;
    const matchesSearch = !searchTerm || [row.code, row.name, row.type, row.category, row.location, row.status]
      .some((value) => String(value || "").toLowerCase().includes(searchTerm));
    return matchesCategory && matchesLocation && matchesSearch;
  });
  renderInventoryStatusTabs();
  const rows = inventoryItemCards(filteredStockRows).filter((item) => {
    return inventoryStatusFilter === "All" || inventoryItemStatus(item).label === inventoryStatusFilter;
  });
  const lowOrOutRows = allStockRows.filter((row) => {
    const status = String(row.status || "").toLowerCase();
    return status.includes("out of stock") || status.includes("low stock");
  });
  const inventoryTotalCount = document.getElementById("inventoryTotalCount");
  const inventoryLocationCount = document.getElementById("inventoryLocationCount");
  const inventoryLowCount = document.getElementById("inventoryLowCount");
  const inventoryCategoryCount = document.getElementById("inventoryCategoryCount");
  if (inventoryTotalCount) inventoryTotalCount.textContent = String(rows.length);
  if (inventoryLocationCount) inventoryLocationCount.textContent = String(new Set(allStockRows.map((row) => row.location).filter(Boolean)).size);
  if (inventoryLowCount) inventoryLowCount.textContent = String(lowOrOutRows.length);
  if (inventoryCategoryCount) inventoryCategoryCount.textContent = String(categories().length);
  renderInventoryModuleTabs(allStockRows, lowOrOutRows);
  renderInventoryWarehouses(allStockRows);
  renderInventoryCategories(allStockRows);
  const pageCount = Math.max(1, Math.ceil(rows.length / INVENTORY_PAGE_SIZE));
  inventoryPage = Math.min(Math.max(1, inventoryPage), pageCount);
  const start = (inventoryPage - 1) * INVENTORY_PAGE_SIZE;
  const pageRows = rows.slice(start, start + INVENTORY_PAGE_SIZE);
  renderInventoryCards(pageRows);
  document.getElementById("inventoryPageInfo").textContent = `Page ${inventoryPage} of ${pageCount} - ${rows.length} item${rows.length === 1 ? "" : "s"}`;
  document.getElementById("inventoryPrev").disabled = inventoryPage === 1;
  document.getElementById("inventoryNext").disabled = inventoryPage === pageCount;
}

function inventoryItemCards(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    if (!row.code) return;
    if (!groups.has(row.code)) {
      groups.set(row.code, {
        code: row.code,
        name: row.name,
        type: row.type,
        category: row.category,
        totalStock: 0,
        available: 0,
        locations: []
      });
    }
    const group = groups.get(row.code);
    const stock = Number(row.stock) || 0;
    group.totalStock += stock;
    group.available += Number(row.available ?? row.stock) || 0;
    group.locations.push({ location: row.location, stock, available: Number(row.available ?? row.stock) || 0, status: row.status });
  });
  const items = [...groups.values()];
  if (inventoryCategoryFilter !== "All") {
    return items.sort((a, b) => `${a.category} ${a.name}`.localeCompare(`${b.category} ${b.name}`));
  }
  const byCategory = categories().map((category) => ({
    category,
    items: items
      .filter((item) => item.category === category)
      .sort((a, b) => String(a.name || a.code).localeCompare(String(b.name || b.code)))
  }));
  const mixed = [];
  const longest = Math.max(0, ...byCategory.map((group) => group.items.length));
  for (let index = 0; index < longest; index += 1) {
    byCategory.forEach((group) => {
      if (group.items[index]) mixed.push(group.items[index]);
    });
  }
  return mixed;
}

function inventoryCardGradient(item = {}) {
  const category = item.category || "";
  const key = String(category).toLowerCase();
  if (key.includes("station")) return "linear-gradient(135deg,#fb8a45,#d94b0d)";
  if (key.includes("rwh")) return "linear-gradient(135deg,#37a665,#00602d)";
  if (key.includes("progress")) return "linear-gradient(135deg,#5488e9,#243fbd)";
  return "linear-gradient(135deg,#10b981,#0b6a36)";
}

function itemInitials(item) {
  return String(item.name || item.code || "?")
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function inventoryItemStatus(item = {}) {
  const stock = Number(item.totalStock);
  if (!Number.isFinite(stock) || stock <= 0) return { label: "Out of stock", className: "out", barClass: "out" };
  if (stock < lowStockThreshold()) return { label: "Low stock", className: "low", barClass: "low" };
  return { label: "In stock", className: "in", barClass: "in" };
}

function renderInventoryStatusTabs() {
  const container = document.getElementById("inventoryStatusTabs");
  if (!container) return;
  const statuses = ["All", "In stock", "Low stock", "Out of stock"];
  if (!statuses.includes(inventoryStatusFilter)) inventoryStatusFilter = "All";
  container.innerHTML = statuses.map((status) => `
    <button class="inventory-status-tab ${status === inventoryStatusFilter ? "active" : ""}" type="button" data-inventory-status="${status}">${status === "Low stock" ? "Low" : status}</button>
  `).join("");
}

function renderInventoryCards(items) {
  const container = document.getElementById("inventoryCards");
  if (!container) return;
  container.innerHTML = items.map((item) => {
    const status = inventoryItemStatus(item);
    const stockPercent = Math.max(4, Math.min(100, (item.totalStock / Math.max(lowStockThreshold(), item.totalStock, 1)) * 100));
    const stockLabel = status.className === "low" ? `${quantityValue(item.totalStock)} - min ${lowStockThreshold()}` : quantityValue(item.totalStock);
    return `<button class="inventory-item-card" type="button" data-item-code="${escapeHtml(item.code)}">
      <span class="inventory-card-visual" style="background:${inventoryCardGradient(item)}">
        <span>${escapeHtml(item.category || "Item")}</span>
        <strong>${escapeHtml(itemInitials(item))}</strong>
      </span>
      <span class="inventory-card-head">
        <span><strong>${escapeHtml(item.name || item.code)}</strong><small>${escapeHtml(item.code)}</small></span>
        <em class="${status.className}">${status.label === "Low stock" ? "Low" : status.label}</em>
      </span>
      <span class="inventory-card-meta"><span>Stock</span><strong>${stockLabel}</strong></span>
      <span class="inventory-card-bar ${status.barClass}"><i style="width:${stockPercent}%"></i></span>
      <span class="inventory-card-foot"><span>${escapeHtml(item.type || "NA")}</span><span>${item.locations.length} location${item.locations.length === 1 ? "" : "s"}</span></span>
    </button>`;
  }).join("") || `<div class="inventory-card-empty">No inventory items found.</div>`;
}

function openInventoryItemDetail(itemCode) {
  const rows = stockRows().filter((row) => row.code === itemCode);
  if (!rows.length) return;
  activeInventoryDetailCode = itemCode;
  const item = inventoryItemCards(rows)[0];
  const modal = document.getElementById("inventoryItemDetailModal");
  const title = document.getElementById("inventoryDetailTitle");
  const subtitle = document.getElementById("inventoryDetailSubtitle");
  const body = document.getElementById("inventoryDetailBody");
  if (!modal || !title || !subtitle || !body) return;
  title.textContent = item.name || item.code;
  subtitle.textContent = `${item.code} · ${item.category || "Uncategorized"}`;
  const locationRows = APPROVED_LOCATIONS.map((location) => {
    const row = rows.find((entry) => entry.location === location);
    const stock = Number(row?.stock || 0);
    const available = Number(row?.available ?? row?.stock ?? 0);
    return `<div class="inventory-detail-stock-row">
      <span>${escapeHtml(location)}</span>
      <input type="number" min="0" step="1" value="${stock}" data-detail-stock-location="${escapeHtml(location)}" data-current-stock="${stock}">
      <small>${escapeHtml(inventoryStockStatus(available))}</small>
    </div>`;
  }).join("");
  body.innerHTML = `
    <div class="inventory-detail-summary">
      <span class="inventory-card-visual" style="background:${inventoryCardGradient(item)}">
        <span>${escapeHtml(item.category || "Item")}</span>
        <strong>${escapeHtml(itemInitials(item))}</strong>
      </span>
      <div class="inventory-detail-facts">
        <div><span>Item ID</span><strong>${escapeHtml(item.code)}</strong></div>
        <div><span>Category</span><strong>${escapeHtml(item.category || "NA")}</strong></div>
        <div><span>Type / Specification</span><strong>${escapeHtml(item.type || "NA")}</strong></div>
        <div><span>Total stock</span><strong>${quantityValue(item.totalStock)}</strong></div>
      </div>
    </div>
    <section class="inventory-detail-stock">
      <h3>Stock on hand</h3>
      <p>Current quantity across approved IMS locations.</p>
      ${locationRows}
    </section>`;
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
  if (window.lucide) window.lucide.createIcons();
}

function closeInventoryItemDetail() {
  const modal = document.getElementById("inventoryItemDetailModal");
  if (!modal) return;
  activeInventoryDetailCode = "";
  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");
}

async function saveInventoryDetailStock() {
  if (!activeInventoryDetailCode) return;
  const rows = stockRows().filter((row) => row.code === activeInventoryDetailCode);
  const item = rows[0] || findItem(activeInventoryDetailCode);
  const inputs = [...document.querySelectorAll("[data-detail-stock-location]")];
  const changes = inputs.map((input) => {
    const next = Math.max(Number(input.value) || 0, 0);
    const current = Number(input.dataset.currentStock) || 0;
    return {
      location: input.dataset.detailStockLocation,
      delta: next - current
    };
  }).filter((change) => change.delta !== 0);
  if (!changes.length) return showToast("No stock changes to save.", "error");
  try {
    for (const change of changes) {
      await apiRequest("/stock/adjust", {
        method: "POST",
        body: JSON.stringify({
          itemCode: activeInventoryDetailCode,
          itemName: item?.name || "",
          category: item?.category || "",
          location: change.location,
          quantity: Math.abs(change.delta),
          direction: change.delta > 0 ? "in" : "out",
          notes: "Adjusted from inventory item details"
        })
      });
    }
    const reopenedCode = activeInventoryDetailCode;
    await loadBusinessData({ silent: true });
    render();
    openInventoryItemDetail(reopenedCode);
    showToast("Stock updated.");
  } catch (error) {
    showToast(error.message || "Unable to update stock.", "error");
  }
}

function openDeleteInventoryItemModal() {
  if (!activeInventoryDetailCode) return;
  const modal = document.getElementById("deleteInventoryItemModal");
  const message = document.getElementById("deleteInventoryItemMessage");
  const item = stockRows().find((row) => row.code === activeInventoryDetailCode);
  if (message) {
    message.textContent = `Do you want to delete ${item?.name || activeInventoryDetailCode}? It will be permanently deleted from the IMS.`;
  }
  if (!modal) return;
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
}

function closeDeleteInventoryItemModal() {
  const modal = document.getElementById("deleteInventoryItemModal");
  if (!modal) return;
  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");
}

async function confirmDeleteInventoryDetailItem() {
  if (!activeInventoryDetailCode) return;
  try {
    await apiRequest(`/items/${encodeURIComponent(activeInventoryDetailCode)}`, { method: "DELETE" });
    closeDeleteInventoryItemModal();
    closeInventoryItemDetail();
    await loadBusinessData({ silent: true });
    inventoryPage = 1;
    render();
    showToast("Product deleted from IMS.");
  } catch (error) {
    showToast(error.message || "Unable to delete product.", "error");
  }
}

function renderInventoryModuleTabs(allStockRows = stockRows()) {
  const activeView = document.querySelector(".app-shell")?.getAttribute("data-active-view") || "";
  document.querySelectorAll("[data-inventory-tab]").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.inventoryTab === inventoryModuleTab);
  });
  document.querySelectorAll(".inventory-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `inventory${inventoryModuleTab[0].toUpperCase()}${inventoryModuleTab.slice(1)}Panel`);
  });
  const kpis = document.getElementById("inventoryKpis");
  if (kpis) kpis.hidden = inventoryModuleTab !== "items";
  document.querySelectorAll("[data-inventory-items-only]").forEach((element) => {
    element.hidden = inventoryModuleTab !== "items";
  });
  document.querySelectorAll("[data-inventory-warehouses-only]").forEach((element) => {
    element.hidden = activeView !== "inventory" || inventoryModuleTab !== "warehouses";
  });
  document.querySelectorAll("[data-inventory-issue-only]").forEach((element) => {
    element.hidden = inventoryModuleTab !== "issue";
  });
  document.querySelectorAll("[data-inventory-categories-only]").forEach((element) => {
    element.hidden = activeView !== "inventory" || inventoryModuleTab !== "categories";
  });
  document.querySelectorAll("[data-inventory-grn-only]").forEach((element) => {
    element.hidden = inventoryModuleTab !== "grn";
  });
  const itemCount = new Set(allStockRows.map((row) => row.code).filter(Boolean)).size;
  const setText = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value);
  };
  setText("inventoryItemsTabCount", itemCount || state.items.length);
  setText("inventoryWarehousesTabCount", state.locations.length);
  setText("inventoryCategoriesTabCount", categories().length);
}

function isLowOrOutStock(row) {
  const status = String(row.status || "").toLowerCase();
  return status.includes("out of stock") || status.includes("restock") || status.includes("low stock");
}

function renderInventoryWarehouses(allStockRows = stockRows()) {
  const tbody = document.getElementById("inventoryWarehousesTable");
  if (!tbody) return;
  tbody.innerHTML = state.locations.map((location) => {
    const rows = allStockRows.filter((row) => row.location === location);
    const totalStock = rows.reduce((sum, row) => sum + (Number(row.stock) || 0), 0);
    const lowCount = rows.filter(isLowOrOutStock).length;
    const code = location === "I9 warehouse" ? "I9" : location.replace(/\s*CC$/i, "").slice(0, 3).toUpperCase();
    return `<tr><td>${escapeHtml(location)}</td><td>${escapeHtml(code)}</td><td>${rows.length}</td><td>${quantityValue(totalStock)}</td><td>${lowCount}</td></tr>`;
  }).join("") || emptyStateRow(5, "No warehouses found", "Approved locations will appear here.");
}

function categoryCode(categoryName = "") {
  const words = String(categoryName || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "---";
  if (words.length === 1) return words[0].replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase().padEnd(3, "-");
  return words.slice(0, 3).map((word) => word[0]).join("").toUpperCase();
}

function renderInventoryCategories(allStockRows = stockRows()) {
  const tbody = document.getElementById("inventoryCategoriesTable");
  if (!tbody) return;
  tbody.innerHTML = categories().map((category) => {
    const rows = allStockRows.filter((row) => row.category === category);
    const uniqueItems = new Set(rows.map((row) => row.code).filter(Boolean)).size;
    const totalStock = rows.reduce((sum, row) => sum + (Number(row.stock) || 0), 0);
    const lowCount = rows.filter(isLowOrOutStock).length;
    return `<tr><td>${escapeHtml(category)}</td><td>${escapeHtml(categoryCode(category))}</td><td>${uniqueItems}</td><td>${quantityValue(totalStock)}</td><td>${lowCount}</td></tr>`;
  }).join("") || emptyStateRow(5, "No categories found", "Inventory categories will appear here.");
}

function openCategoryModal() {
  document.getElementById("categoryModal").classList.add("show");
  document.getElementById("categoryModal").setAttribute("aria-hidden", "false");
}

function closeCategoryModal() {
  document.getElementById("categoryModal").classList.remove("show");
  document.getElementById("categoryModal").setAttribute("aria-hidden", "true");
}

function renderProcurement() {
  if (!PROCUREMENT_TAB_LABELS[procurementModuleTab]) procurementModuleTab = "po";
  document.querySelectorAll("#procurementView [data-procurement-tab]").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.procurementTab === procurementModuleTab);
  });
  document.querySelectorAll("#procurementView .procurement-panel").forEach((panel) => {
    const panelTab = panel.id === "procurementVendorsPanel" ? "vendors" : "po";
    panel.classList.toggle("active", panelTab === procurementModuleTab);
  });
  document.querySelectorAll("[data-procurement-po-only]").forEach((element) => {
    element.hidden = procurementModuleTab !== "po";
  });
  document.querySelectorAll("[data-procurement-vendors-only]").forEach((element) => {
    element.hidden = procurementModuleTab !== "vendors";
  });
}

function renderRequestSection() {
  normalizeRequestModuleTab();
  const requestCount = state.requests.reduce((sum, request) => sum + (request.items?.length || 0), 0);
  setText("requestRequisitionTabCount", requestLineRows(state.requests.filter(requesterMatchesCurrentUser)).length);
  setText("requestTransportTabCount", state.transportRequests.length);
  setText("requestItemsTabCount", requestCount);
  document.querySelectorAll("#requestsView [data-request-tab]").forEach((tab) => {
    tab.hidden = !canAccessRequestTab(tab.dataset.requestTab);
    tab.classList.toggle("active", tab.dataset.requestTab === requestModuleTab);
  });
  document.querySelectorAll("#requestsView .request-panel").forEach((panel) => {
    const panelTab = panel.id === "requestsTransportPanel"
      ? "transport"
      : panel.id === "requestsItemsPanel"
        ? "items"
        : "requisition";
    panel.classList.toggle("active", panelTab === requestModuleTab);
  });
}


function renderIssue() {
  if (businessDataLoading) {
    showTableSkeleton("issueTable", 8, 6);
    return;
  }
  const issueError = sourceError("requests", "inventory");
  if (issueError) {
    setTableContent("issueTable", errorStateRow(8, issueError));
    return;
  }
  const searchTerm = stockIssueSearchTerm.trim().toLowerCase();
  const rows = state.requests.flatMap((request) => request.items
    .filter((item) => item.approvalStatus === "Approved" && !["Issued", "Rejected", "Cancelled"].includes(item.issuanceStatus))
    .filter(() => stockIssueLocationFilter === "All" || request.location === stockIssueLocationFilter)
    .filter((item) => {
      if (!searchTerm) return true;
      return [request.requestId, request.location, item.itemName, item.itemCode]
        .some((value) => String(value || "").toLowerCase().includes(searchTerm));
    })
    .map((item) => {
      const available = stockFor(item.itemCode, request.location);
      const approvedQty = Number(item.quantityApproved || item.quantity || 0);
      const issuedQty = Number(item.quantityIssued || 0);
      const remainingQty = Math.max(approvedQty - issuedQty, 0) || Number(item.quantity || 0);
      const remainingQtyDisplay = quantityValue(remainingQty);
      return `<tr>
        <td>${request.requestId}</td><td>${item.itemCode} - ${item.itemName}</td><td>${request.location}</td><td>${remainingQtyDisplay}</td><td>${quantityValue(available)}</td>
        <td><input class="table-input" type="number" min="1" max="${remainingQtyDisplay}" value="${remainingQtyDisplay}" id="qty-${item.id}"></td>
        <td><input class="table-input" placeholder="Issued by" id="by-${item.id}"></td>
        <td><button class="tiny success" onclick="issueItem('${request.requestId}','${item.id}')">Issue</button></td>
      </tr>`;
    }));
  const emptyTitle = searchTerm ? "No matching approved stock issues" : "No approved stock to issue";
  const emptyBody = searchTerm ? "Try another request ID, location, or item name." : "Approved request items ready for issuance will appear here.";
  setTableContent("issueTable", rows.join("") || emptyStateRow(8, emptyTitle, emptyBody));
}

function renderPO() {
  if (businessDataLoading) {
    showTableSkeleton("poTable", 6, 7);
    return;
  }
  const poError = sourceError("purchaseOrders", "vendors");
  if (poError) {
    setTableContent("poTable", errorStateRow(6, poError));
    return;
  }
  renderPoVendorFilter();
  renderPoStatusFilters();
  const searchTerm = poSearchTerm.trim().toLowerCase();
  const rows = state.purchaseOrders.filter((po) => {
    const status = poDisplayStatus(po);
    const matchesStatus = poStatusFilter === "All" || status === poStatusFilter;
    const matchesVendor = poVendorFilter === "All" || poVendorName(po) === poVendorFilter;
    const matchesSearch = !searchTerm || [po.poNumber, poVendorName(po), poItemSummary(po), po.location, po.quotationReference]
      .some((value) => String(value || "").toLowerCase().includes(searchTerm));
    return matchesStatus && matchesVendor && matchesSearch;
  });
  setTableContent("poTable", rows.map(renderPoRecordRow).join("") || emptyStateRow(6, "No matching purchase orders", "Try another PO number, vendor, or status filter."));
  if (window.lucide) lucide.createIcons();
}

function poVendorName(po = {}) {
  return po.vendorName || state.vendors.find((vendor) => String(vendor.id) === String(po.vendorId))?.name || "-";
}

function poDisplayStatus(po = {}) {
  const status = String(po.status || "").trim().toLowerCase();
  const ordered = Number(po.quantityOrdered ?? po.quantity ?? 0);
  const received = Number(po.quantityReceived || 0);
  if (status.includes("cancel")) return "Cancelled";
  if (status.includes("draft")) return "Draft";
  if (status.includes("partial")) return "Partial";
  if (status.includes("received") || (ordered > 0 && received >= ordered)) return "Received";
  if (received > 0) return "Partial";
  if (status.includes("confirm") || status.includes("approved") || status.includes("sent") || status.includes("pending approval") || status.includes("open") || status.includes("ordered") || status.includes("closed")) return "Confirmed";
  return "Draft";
}

function poExpectedDate(po = {}) {
  return po.arrivedBy || po.serviceCompletionDate || po.expectedDate || po.deliveryDate || "";
}

function poSourceReference(po = {}) {
  return po.rfqNumber || po.rfq || po.quotationReference || "-";
}

function poStatusCount(status) {
  if (status === "All") return state.purchaseOrders.length;
  return state.purchaseOrders.filter((po) => poDisplayStatus(po) === status).length;
}

function renderPoStatusFilters() {
  const container = document.getElementById("poStatusFilters");
  if (!container) return;
  const statuses = ["All", "Draft", "Confirmed", "Partial", "Received", "Cancelled"];
  if (!statuses.includes(poStatusFilter)) poStatusFilter = "All";
  container.innerHTML = statuses.map((status) => `
    <button class="po-status-filter ${status === poStatusFilter ? "active" : ""}" type="button" data-po-status="${status}">
      ${status} <span>${poStatusCount(status)}</span>
    </button>
  `).join("");
}

function renderPoVendorFilter() {
  const select = document.getElementById("poVendorFilter");
  if (!select) return;
  const selected = poVendorFilter === "All" ? "" : poVendorFilter;
  const vendors = [...new Set(state.purchaseOrders.map(poVendorName).filter((name) => name && name !== "-"))]
    .sort((a, b) => a.localeCompare(b));
  select.innerHTML = `<option value="">All vendors</option>${vendors.map((vendor) => `<option value="${escapeHtml(vendor)}">${escapeHtml(vendor)}</option>`).join("")}`;
  select.value = vendors.includes(selected) ? selected : "";
  poVendorFilter = select.value || "All";
  syncVendorFilterClearButton("po");
}

function syncVendorFilterClearButton(type) {
  const isPo = type === "po";
  const button = document.getElementById(isPo ? "clearPoVendorFilter" : "clearGrnVendorFilter");
  const filterValue = isPo ? poVendorFilter : grnVendorFilter;
  if (button) button.disabled = filterValue === "All";
}

function clearVendorFilter(type) {
  const isPo = type === "po";
  const select = document.getElementById(isPo ? "poVendorFilter" : "grnVendorFilter");
  if (isPo) {
    poVendorFilter = "All";
    if (select) select.value = "";
    renderPO();
    return;
  }
  grnVendorFilter = "All";
  if (select) select.value = "";
  renderGRN();
  syncVendorFilterClearButton("grn");
}

function renderPoRecordRow(po) {
  const status = poDisplayStatus(po);
  return `
    <tr data-reference-id="${escapeHtml(po.poNumber)}">
      <td><strong>${escapeHtml(po.poNumber)}</strong></td>
      <td>${escapeHtml(poVendorName(po))}</td>
      <td>${formatDate(po.issueDate || po.date)}</td>
      <td><span class="po-status-select">${escapeHtml(status)}<i data-lucide="chevron-down"></i></span></td>
      <td><strong>$${money(po.poAmount ?? po.total)}</strong></td>
      <td class="button-cell">
        <span class="po-row-actions">
          <button class="tiny" onclick="printPO('${escapeHtml(po.poNumber)}')" title="Print PO" aria-label="Print PO"><i data-lucide="clipboard-list"></i></button>
          <button class="tiny" type="button" title="Receive PO" aria-label="Receive PO" onclick="setView('grn')"><i data-lucide="package-open"></i></button>
          ${canCancelPo(po) ? `<button class="tiny danger" onclick="cancelPO('${escapeHtml(po.poNumber)}')" title="Cancel PO" aria-label="Cancel PO"><i data-lucide="trash-2"></i></button>` : ""}
        </span>
      </td>
    </tr>
  `;
}

function collectPurchaseOrder(formElement) {
  const form = new FormData(formElement);
  const vendorValue = String(form.get("vendorId") || "").trim().toLowerCase();
  const vendor = state.vendors.find((row) => String(row.id) === String(form.get("vendorId")) || String(row.name || "").trim().toLowerCase() === vendorValue);
  const items = [...document.querySelectorAll("#poItems .po-item-row")].map((row) => {
    const category = String(row.querySelector("[name='category']").value || "").trim();
    const itemNameValue = String(row.querySelector("[name='itemName']").value || "").trim();
    const itemTypeValue = String(row.querySelector("[name='itemCode']").value || "").trim();
    const item = findItemBySelection(itemNameValue, itemTypeValue, category) || findItem(row.querySelector("[name='itemIdDisplay']").value);
    const quantityOrdered = Number(row.querySelector("[name='quantityOrdered']").value);
    const unitPrice = Number(row.querySelector("[name='unitPrice']").value) || 0;
    return {
      category: category || item?.category || "",
      itemName: itemNameValue || item?.name || "",
      itemType: item?.type || itemTypeValue,
      itemCode: item?.code || String(row.querySelector("[name='itemIdDisplay']").value || itemTypeValue).trim(),
      specifications: String(row.querySelector("[name='specifications']").value || "").trim(),
      quantityOrdered,
      unitPrice,
      subtotal: quantityOrdered * unitPrice
    };
  });
  const firstItem = items[0] || {};
  const quantityOrdered = items.reduce((sum, item) => sum + Number(item.quantityOrdered || 0), 0);
  const subtotal = items.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
  const taxRate = Number(form.get("taxRate")) || 0;
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
    deliveryNtn: String(form.get("deliveryNtn") || "424701-0").trim(),
    budgetLine: String(form.get("budgetLine") || "").trim(),
    bankName: String(form.get("bankName") || "").trim(),
    accountTitle: String(form.get("accountTitle") || "").trim(),
    accountNo: String(form.get("accountNo") || "").trim(),
    status: form.get("status"),
    location: form.get("location"),
    arrivedBy: form.get("arrivedBy") || "",
    serviceStartDate: form.get("serviceStartDate"),
    serviceCompletionDate: form.get("serviceCompletionDate"),
    paymentTerms: String(form.get("paymentTerms") || "").trim(),
    deliveryTerms: String(form.get("deliveryTerms") || "").trim(),
    quotationReference: String(form.get("quotationReference") || "").trim(),
    category: firstItem.category || "",
    itemName: firstItem.itemName || "",
    itemType: firstItem.itemType || "",
    itemCode: firstItem.itemCode || "",
    specifications: items.map((item) => item.specifications).filter(Boolean).join(" | "),
    items,
    quantityOrdered,
    unitPrice: items.length === 1 ? Number(firstItem.unitPrice || 0) : 0,
    subtotal,
    taxRate,
    taxAmount,
    poAmount: subtotal + taxAmount,
    quantityReceived: 0,
    approvedBy: String(form.get("approvedBy") || "").trim(),
    notesRemarks: String(form.get("notesRemarks") || "").trim(),
    date: new Date().toISOString()
  };
}

function renderPurchaseOrderSheet(po) {
  const lines = poLineItems(po);
  const subTotal = Number(po.subtotal ?? lines.reduce((sum, item) => sum + Number(item.subtotal ?? (item.quantityOrdered || 0) * (item.unitPrice || 0)), 0));
  const taxRate = Number(po.taxRate || 0);
  const taxAmount = Number(po.taxAmount ?? subTotal * (taxRate / 100));
  const grandTotal = Number(po.poAmount ?? po.total ?? subTotal + taxAmount);
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
            ${lines.map((item) => {
              const itemDescription = [item.itemName, item.itemType, item.specifications || item.description]
                .filter(Boolean)
                .join(" - ");
              const lineTotal = Number(item.subtotal ?? (item.quantityOrdered || item.quantity || 0) * (item.unitPrice || 0));
              return `<tr>
                <td>
                  <strong>${escapeHtml(itemDescription || item.itemCode || "Item / service")}</strong>
                  ${item.itemCode ? `<span>Item ID: ${escapeHtml(item.itemCode)}</span>` : ""}
                </td>
                <td>${quantityValue(item.quantityOrdered ?? item.quantity)}</td>
                <td>Rs. ${money(item.unitPrice)}</td>
                <td>Rs. ${money(lineTotal)}</td>
              </tr>`;
            }).join("")}
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
  form.elements.deliveryNtn.value = "424701-0";
  form.elements.status.value = "";
  form.elements.poAmount.value = "0";
  document.getElementById("poItems").innerHTML = "";
  addPoItemLine();
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
  document.getElementById("grnPoLineItem").innerHTML = `<option value="">Select PO item</option>`;
  ["qtyReceived", "qtyAccepted"].forEach((name) => {
    form.elements[name].removeAttribute("max");
    form.elements[name].placeholder = "";
  });
  syncSelectOptions(form);
}

function clearGrnPoDetails() {
  lastAppliedGrnPoNumber = String(document.getElementById("poSelect")?.value || "").trim();
  document.getElementById("grnItemName").value = "";
  document.getElementById("grnItemType").value = "";
  document.getElementById("grnItemCode").value = "";
  document.getElementById("grnPoLineItem").innerHTML = `<option value="">Select PO item</option>`;
  const form = document.getElementById("grnForm");
  ["qtyReceived", "qtyAccepted"].forEach((name) => {
    form.elements[name].removeAttribute("max");
    form.elements[name].placeholder = "";
    form.elements[name].value = "";
  });
}

function selectedGrnPo() {
  const poNumber = String(document.getElementById("poSelect")?.value || "").trim().toLowerCase();
  return state.purchaseOrders.find((row) => String(row.poNumber || "").trim().toLowerCase() === poNumber);
}

function syncGrnPoSelection() {
  const currentPoNumber = String(document.getElementById("poSelect")?.value || "").trim();
  if (currentPoNumber === lastAppliedGrnPoNumber) return;
  lastAppliedGrnPoNumber = currentPoNumber;
  applySelectedPoToGrn();
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
    closePoDrawer();
    showToast("Purchase order saved.");
  } catch (error) {
    showToast(`Unable to save PO: ${error.message}`, "error");
  }
}

function renderGRN() {
  if (businessDataLoading) {
    showTableSkeleton("grnTable", 8, 6);
    return;
  }
  const grnError = sourceError("grns", "purchaseOrders");
  if (grnError) {
    setTableContent("grnTable", errorStateRow(8, grnError));
    return;
  }
  const searchTerm = grnSearchTerm.trim().toLowerCase();
  const rows = state.grns.filter((grn) => {
    const grnRow = grnRecordDetails(grn);
    const matchesVendor = grnVendorFilter === "All" || grnRow.vendorName === grnVendorFilter;
    const matchesSearch = !searchTerm || [grn.grnNumber, grn.poNumber, grn.itemCode, grn.itemName, grn.location, grnRow.vendorName]
      .some((value) => String(value || "").toLowerCase().includes(searchTerm));
    return matchesVendor && matchesSearch;
  });
  setTableContent("grnTable", rows.map((grn) => `
    ${renderGrnRecordRow(grn)}
  `).join("") || emptyStateRow(8, "No matching GRN records", "Try another GRN, PO, vendor, or filter."));
  if (window.lucide) lucide.createIcons();
}

function grnRecordDetails(grn) {
  const po = state.purchaseOrders.find((row) => row.poNumber === grn.poNumber) || {};
  const vendor = state.vendors.find((row) => String(row.id) === String(po.vendorId));
  const vendorName = po.vendorName || vendor?.name || "-";
  return { po, vendorName };
}

function renderGrnRecordRow(grn) {
  const { vendorName } = grnRecordDetails(grn);
  const received = Number(grn.qtyReceived || 0);
  const accepted = Number(grn.qtyAccepted || 0);
  const status = accepted < received ? "Rejected" : (grn.status || "Received");
  return `
    <tr data-reference-id="${escapeHtml(grn.grnNumber)}">
      <td>${escapeHtml(grn.grnNumber)}</td>
      <td>${escapeHtml(grn.poNumber || "Manual")}</td>
      <td>${escapeHtml(vendorName)}</td>
      <td>${formatDate(grn.date)}</td>
      <td>${escapeHtml(grn.location || "-")}</td>
      <td>${quantityValue(accepted || received)}</td>
      <td><span class="grn-status-pill">${escapeHtml(status)}</span></td>
      <td class="button-cell"><span class="grn-row-actions"><button class="tiny" onclick="printGRN('${escapeHtml(grn.grnNumber)}')" title="Print GRN" aria-label="Print GRN"><i data-lucide="clipboard-list"></i></button></span></td>
    </tr>
  `;
}

function renderGrnSheet(grn) {
  const po = state.purchaseOrders.find((row) => row.poNumber === grn.poNumber) || {};
  const description = grn.itemName || grn.description || grn.itemType || po.specifications || "Specification only";
  const received = Number(grn.qtyReceived || 0);
  const accepted = Number(grn.qtyAccepted || 0);
  const rejected = Math.max(received - accepted, 0);

  return `
    <section class="po-sheet grn-sheet">
      <header class="po-form-header">
        <div class="po-form-title">
          <h1>GOODS RECEIVED NOTE</h1>
          <h1>Shehersaaz</h1>
          <p>Al-Zahir Plaza, Suite No: 04, 2nd Floor<br>Banigala, Islamabad</p>
        </div>
      </header>

      <div class="po-detail-grid">
        <div class="po-form-party">
          <h2>GRN INFORMATION</h2>
          <dl>
            <dt>GRN Number:</dt><dd>${escapeHtml(grn.grnNumber)}</dd>
            <dt>GRN Date:</dt><dd>${formatDate(grn.date)}</dd>
            <dt>PO Number:</dt><dd>${escapeHtml(grn.poNumber || "Manual")}</dd>
          </dl>
        </div>
        <div class="po-form-party">
          <h2>RECEIVING DETAILS</h2>
          <dl>
            <dt>Location:</dt><dd>${escapeHtml(grn.location || po.location || "")}</dd>
            <dt>Received By:</dt><dd>${escapeHtml(grn.receivedBy || "")}</dd>
            <dt>Vendor:</dt><dd>${escapeHtml(po.vendorName || "")}</dd>
            <dt>Status:</dt><dd>${escapeHtml(grn.status || "Received")}</dd>
          </dl>
        </div>
      </div>

      <div class="po-form-section">
        <h2 class="po-section-bar">GOODS RECEIVED DETAILS</h2>
        <table class="po-items-table grn-items-table">
          <thead>
            <tr>
              <th>Item / Specification</th>
              <th>Item ID</th>
              <th>Qty Received</th>
              <th>Qty Accepted</th>
              <th>Qty Rejected</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>${escapeHtml(description)}</strong>${grn.notes ? `<span>${escapeHtml(grn.notes)}</span>` : ""}</td>
              <td>${escapeHtml(grn.itemCode || po.itemCode || "")}</td>
              <td>${quantityValue(received)}</td>
              <td>${quantityValue(accepted)}</td>
              <td>${quantityValue(rejected)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <footer class="po-signature-grid">
        <div>
          <p>Received By:</p>
          <strong>${escapeHtml(grn.receivedBy || "")}</strong>
          <strong>Signature</strong>
          <em>Date: ___________</em>
        </div>
        <div>
          <p>Verified By:</p>
          <span>Inventory / Procurement</span>
          <strong>Signature</strong>
          <em>Date: ___________</em>
        </div>
      </footer>
    </section>
  `;
}

function applySelectedPoToGrn() {
  const po = selectedGrnPo();
  if (!po) {
    clearGrnPoDetails();
    return;
  }
  document.getElementById("poSelect").value = po.poNumber;
  lastAppliedGrnPoNumber = po.poNumber;
  const lineSelect = document.getElementById("grnPoLineItem");
  const allLines = poLineItems(po).filter((item) => item.itemCode || item.itemName || item.specifications);
  const receivableLines = allLines.filter((item) => remainingPoLineQuantity(item) > 0);
  const lines = receivableLines.length ? receivableLines : allLines;
  lineSelect.innerHTML = `<option value="">Select PO item</option>${lines.map((item, index) => `
    <option value="${escapeHtml(item.lineId || `line-${index}`)}" ${index === 0 ? "selected" : ""}>
      ${escapeHtml(item.itemCode || "Item")} - ${escapeHtml(item.itemName || item.specifications || "")} (${quantityValue(remainingPoLineQuantity(item))} remaining)
    </option>
  `).join("")}`;
  if (lines[0]) lineSelect.value = lines[0].lineId || "line-0";
  applySelectedPoLineToGrn();
}

function applySelectedPoLineToGrn() {
  const po = selectedGrnPo();
  const selectedLineId = document.getElementById("grnPoLineItem")?.value;
  const allLines = poLineItems(po).filter((item) => item.itemCode || item.itemName || item.specifications);
  const selectedLine = allLines.find((item, index) => String(item.lineId || `line-${index}`) === String(selectedLineId))
    || allLines.find((item) => remainingPoLineQuantity(item) > 0)
    || allLines[0];
  if (!po || !selectedLine) return;
  document.getElementById("grnPoLineItem").value = selectedLine.lineId || `line-${poLineItems(po).indexOf(selectedLine)}`;
  const itemNameInput = document.getElementById("grnItemName");
  const itemTypeInput = document.getElementById("grnItemType");
  const itemCodeInput = document.getElementById("grnItemCode");
  const locationSelect = document.querySelector("#grnForm [name='location']");
  const receivedInput = document.querySelector("#grnForm [name='qtyReceived']");
  const acceptedInput = document.querySelector("#grnForm [name='qtyAccepted']");
  const item = findItem(selectedLine.itemCode) || {};
  itemNameInput.value = selectedLine.itemName || item.name || "";
  itemTypeInput.value = selectedLine.itemType || item.type || "";
  itemCodeInput.value = selectedLine.itemCode || "";
  if (po.location) locationSelect.value = po.location;
  const remaining = remainingPoLineQuantity(selectedLine);
  receivedInput.max = remaining || "";
  acceptedInput.max = remaining || "";
  receivedInput.placeholder = remaining ? `Remaining: ${quantityValue(remaining)}` : "No quantity remaining";
  acceptedInput.placeholder = remaining ? `Remaining: ${quantityValue(remaining)}` : "No quantity remaining";
  receivedInput.value = remaining > 0 ? remaining : "";
  acceptedInput.value = remaining > 0 ? remaining : "";
}

function openGrnDrawer() {
  const drawer = document.getElementById("grnDrawer");
  if (!drawer) return;
  if (drawer.parentElement !== document.body) {
    document.body.appendChild(drawer);
  }
  syncSelectOptions(drawer);
  if (document.getElementById("poSelect")?.value) applySelectedPoToGrn();
  drawer.classList.add("show");
  drawer.setAttribute("aria-hidden", "false");
  document.body.classList.add("grn-drawer-open");
}

function closeGrnDrawer() {
  const drawer = document.getElementById("grnDrawer");
  if (!drawer) return;
  drawer.classList.remove("show");
  drawer.setAttribute("aria-hidden", "true");
  document.body.classList.remove("grn-drawer-open");
}

function applySelectedVendorToPo() {
  const form = document.getElementById("poForm");
  const vendorValue = String(form.elements.vendorId.value || "").trim().toLowerCase();
  const vendor = state.vendors.find((row) => String(row.id) === String(form.elements.vendorId.value) || String(row.name || "").trim().toLowerCase() === vendorValue);
  form.elements.vendorContact.value = vendor ? [vendor.contact, vendor.phone, vendor.email].filter(Boolean).join(" / ") : "";
  form.elements.vendorAddress.value = vendor?.address || "";
  form.elements.bankName.value = vendor?.bankName || vendor?.bank_name || "";
  form.elements.accountTitle.value = vendor?.accountTitle || vendor?.account_title || "";
  form.elements.accountNo.value = vendor?.accountNo || vendor?.account_no || "";
}

function isTransportHistory(row = {}) {
  return ["Arranged", "Completed", "Cancelled"].includes(row.arrangementStatus)
    || row.approvalStatus === "Rejected";
}

function transportDestination(row) {
  return row.dropoffLocation || row.destinationCityArea || row.meetingVisitLocation || row.destination || "";
}

function transportBoardRows() {
  return state.transportRequests.map((request) => ({
    kind: "transport",
    request,
    requestId: request.id,
    requester: request.requester,
    department: request.department || request.transportType || "Transport",
    date: request.travelDate || request.date,
    approvalStatus: request.approvalStatus,
    arrangementStatus: request.arrangementStatus,
    label: request.transportType || "Transport Request"
  }));
}

function transportColumnFor(row) {
  if (row.approvalStatus === "Rejected" || row.arrangementStatus === "Cancelled") return "cancelled";
  if (row.arrangementStatus === "Completed") return "completed";
  if (row.arrangementStatus === "Arranged") return "arranged";
  if (row.approvalStatus === "Approved") return "approved";
  return "pending";
}

function renderTransportCard(row) {
  return `<button class="approval-kanban-card transport-kanban-card" type="button" data-transport-id="${escapeHtml(row.requestId)}">
    <em>${escapeHtml(row.label)}</em>
    <strong>${escapeHtml(row.requester || "Requester")}</strong>
    <span><i data-lucide="map-pin"></i>${escapeHtml(transportDestination(row.request) || "Destination")}</span>
    <span><i data-lucide="clock"></i>${escapeHtml(requestDateTime(row.date))}</span>
  </button>`;
}

function renderTransport() {
  const board = document.getElementById("transportBoard");
  if (!board) return;
  if (businessDataLoading) {
    board.classList.add("loading");
    board.innerHTML = Array.from({ length: 5 }, () => `
      <section class="approval-kanban-column transport-column skeleton-card">
        <div class="skeleton skeleton-line short"></div>
        ${Array.from({ length: 3 }, () => `
          <div class="skeleton-card compact">
            <span class="skeleton skeleton-line wide"></span>
            <span class="skeleton skeleton-line"></span>
          </div>
        `).join("")}
      </section>
    `).join("");
    return;
  }
  board.classList.remove("loading");
  const transportError = sourceError("transportRequests");
  if (transportError) {
    board.innerHTML = `<div class="approval-kanban-empty">${escapeHtml(transportError)}</div>`;
    return;
  }
  const columns = [
    { key: "pending", title: "Pending", icon: "timer" },
    { key: "approved", title: "Approved", icon: "check-circle-2" },
    { key: "arranged", title: "Arranged", icon: "route" },
    { key: "completed", title: "Completed", icon: "flag-checkered" },
    { key: "cancelled", title: "Cancelled", icon: "x-circle" }
  ];
  const grouped = columns.reduce((acc, column) => ({ ...acc, [column.key]: [] }), {});
  transportBoardRows().forEach((row) => grouped[transportColumnFor(row)].push(row));
  board.innerHTML = columns.map((column) => `
    <section class="approval-kanban-column transport-column ${column.key}">
      <header>
        <span><i data-lucide="${column.icon}"></i>${column.title}</span>
        <div class="approval-column-tools">
          <strong>${grouped[column.key].length}</strong>
          <button class="approval-column-menu-btn" type="button" data-transport-menu="${column.key}" aria-label="${column.title} options" aria-expanded="false"><i data-lucide="ellipsis"></i></button>
          <div class="approval-column-menu" data-transport-menu-panel="${column.key}" aria-hidden="true">
            <button type="button" data-transport-refresh="${column.key}"><i data-lucide="refresh-cw"></i>Refresh</button>
            <button type="button" data-transport-history="${column.key}"><i data-lucide="history"></i>Show history</button>
          </div>
        </div>
      </header>
      <div class="approval-kanban-list">
        ${grouped[column.key].map(renderTransportCard).join("") || `<div class="approval-kanban-empty">No requests</div>`}
      </div>
    </section>
  `).join("");
  if (window.lucide) window.lucide.createIcons();
}

function closeTransportColumnMenus() {
  document.querySelectorAll("[data-transport-menu-panel].show").forEach((menu) => {
    menu.classList.remove("show");
    menu.setAttribute("aria-hidden", "true");
  });
  document.querySelectorAll(".approval-column-menu-btn[aria-expanded='true'][data-transport-menu]").forEach((button) => {
    button.setAttribute("aria-expanded", "false");
  });
}

function transportColumnTitle(key) {
  return {
    pending: "Pending",
    approved: "Approved",
    arranged: "Arranged",
    completed: "Completed",
    cancelled: "Cancelled"
  }[key] || "Transport";
}

function openTransportColumnHistory(columnKey) {
  const rows = transportBoardRows().filter((row) => transportColumnFor(row) === columnKey);
  const modal = document.getElementById("approvalDetailModal");
  const content = document.getElementById("approvalDetailContent");
  document.getElementById("approvalDetailTitle").textContent = `${transportColumnTitle(columnKey)} transport history`;
  document.getElementById("approvalDetailSubtitle").textContent = `${rows.length} request${rows.length === 1 ? "" : "s"} in this section`;
  content.innerHTML = `
    <div class="approval-history-list">
      ${rows.map((row) => `
        <button class="approval-history-item" type="button" data-transport-history-item="${escapeHtml(row.requestId)}">
          <span class="approval-history-type">${escapeHtml(row.label)}</span>
          <strong>${escapeHtml(row.requester || "Requester")}</strong>
          <span>${escapeHtml(transportDestination(row.request) || row.department || "Destination")}</span>
          <time>${escapeHtml(requestDateTime(row.date))}</time>
        </button>
      `).join("") || `<div class="approval-kanban-empty">No requests</div>`}
    </div>
  `;
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
}

function isPendingApproval(status) {
  return String(status || "").toLowerCase() === "pending";
}

function isSameLocalDay(left, right = new Date()) {
  const date = new Date(left);
  if (Number.isNaN(date.getTime())) return false;
  return date.getFullYear() === right.getFullYear()
    && date.getMonth() === right.getMonth()
    && date.getDate() === right.getDate();
}

function requestDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function lineManagerMatchesCurrentUser(request = {}) {
  if (isAdmin) return true;
  const userEmail = String(currentUser.email || "").trim().toLowerCase();
  if (!userEmail) return false;
  return String(request.managerEmail || "").trim().toLowerCase() === userEmail;
}

function approvalBoardRows() {
  const inventoryRows = state.requests.filter(lineManagerMatchesCurrentUser).flatMap((request) => request.items.map((item) => ({
    kind: "inventory",
    request,
    item,
    id: `${request.requestId}-${item.id}`,
    requestId: request.requestId,
    itemId: item.id,
    requester: request.requester,
    department: request.department,
    date: request.date,
    status: item.approvalStatus,
    managerEmail: request.managerEmail,
    label: "Item Request"
  })));
  const transportRows = state.transportRequests.filter(lineManagerMatchesCurrentUser).map((request) => ({
    kind: "transport",
    request,
    id: `transport-${request.id}`,
    requestId: request.id,
    requester: request.requester,
    department: request.department || request.transportType || "Transport",
    date: request.travelDate || request.date,
    status: request.approvalStatus,
    managerEmail: request.managerEmail,
    label: request.transportType || "Transport Request"
  }));
  return [...inventoryRows, ...transportRows];
}

function approvalColumnFor(row) {
  const status = String(row.status || "").toLowerCase();
  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";
  if (isSameLocalDay(row.date)) return "new";
  return "pending";
}

function renderApprovalCard(row) {
  return `<button class="approval-kanban-card" type="button" data-approval-kind="${escapeHtml(row.kind)}" data-request-id="${escapeHtml(row.requestId)}" data-item-id="${escapeHtml(row.itemId || "")}">
    <em>${escapeHtml(row.label)}</em>
    <strong>${escapeHtml(row.requester || "Requester")}</strong>
    <span><i data-lucide="building-2"></i>${escapeHtml(row.department || "Department")}</span>
    <span><i data-lucide="clock"></i>${escapeHtml(requestDateTime(row.date))}</span>
  </button>`;
}

function renderApprovals() {
  const board = document.getElementById("approvalsBoard");
  if (!board) return;
  if (businessDataLoading) {
    board.classList.add("loading");
    board.innerHTML = Array.from({ length: 4 }, () => `
      <section class="approval-kanban-column skeleton-card">
        <div class="skeleton skeleton-line short"></div>
        ${Array.from({ length: 3 }, () => `
          <div class="skeleton-card compact">
            <span class="skeleton skeleton-line wide"></span>
            <span class="skeleton skeleton-line"></span>
          </div>
        `).join("")}
      </section>
    `).join("");
    return;
  }
  board.classList.remove("loading");
  const approvalError = sourceError("requests", "transportRequests");
  if (approvalError) {
    board.innerHTML = `<div class="approval-kanban-empty">${escapeHtml(approvalError)}</div>`;
    return;
  }
  const columns = [
    { key: "new", title: "New", icon: "sparkles" },
    { key: "pending", title: "Pending", icon: "timer" },
    { key: "approved", title: "Approved", icon: "check-circle-2" },
    { key: "rejected", title: "Rejected", icon: "x-circle" }
  ];
  const grouped = columns.reduce((acc, column) => ({ ...acc, [column.key]: [] }), {});
  approvalBoardRows().forEach((row) => grouped[approvalColumnFor(row)].push(row));
  board.innerHTML = columns.map((column) => `
    <section class="approval-kanban-column ${column.key}">
      <header>
        <span><i data-lucide="${column.icon}"></i>${column.title}</span>
        <div class="approval-column-tools">
          <strong>${grouped[column.key].length}</strong>
          <button class="approval-column-menu-btn" type="button" data-approval-menu="${column.key}" aria-label="${column.title} options" aria-expanded="false"><i data-lucide="ellipsis"></i></button>
          <div class="approval-column-menu" data-approval-menu-panel="${column.key}" aria-hidden="true">
            <button type="button" data-approval-refresh="${column.key}"><i data-lucide="refresh-cw"></i>Refresh</button>
            <button type="button" data-approval-history="${column.key}"><i data-lucide="history"></i>Show history</button>
          </div>
        </div>
      </header>
      <div class="approval-kanban-list">
        ${grouped[column.key].map(renderApprovalCard).join("") || `<div class="approval-kanban-empty">No requests</div>`}
      </div>
    </section>
  `).join("");
  if (window.lucide) window.lucide.createIcons();
}

function closeApprovalColumnMenus() {
  document.querySelectorAll(".approval-column-menu.show").forEach((menu) => {
    menu.classList.remove("show");
    menu.setAttribute("aria-hidden", "true");
  });
  document.querySelectorAll(".approval-column-menu-btn[aria-expanded='true']").forEach((button) => {
    button.setAttribute("aria-expanded", "false");
  });
}

function approvalColumnTitle(key) {
  return {
    new: "New",
    pending: "Pending",
    approved: "Approved",
    rejected: "Rejected"
  }[key] || "Requests";
}

function openApprovalColumnHistory(columnKey) {
  const rows = approvalBoardRows().filter((row) => approvalColumnFor(row) === columnKey);
  const modal = document.getElementById("approvalDetailModal");
  const content = document.getElementById("approvalDetailContent");
  const title = `${approvalColumnTitle(columnKey)} history`;
  document.getElementById("approvalDetailTitle").textContent = title;
  document.getElementById("approvalDetailSubtitle").textContent = `${rows.length} request${rows.length === 1 ? "" : "s"} in this section`;
  content.innerHTML = `
    <div class="approval-history-list">
      ${rows.map((row) => `
        <button class="approval-history-item" type="button" data-approval-kind="${escapeHtml(row.kind)}" data-request-id="${escapeHtml(row.requestId)}" data-item-id="${escapeHtml(row.itemId || "")}">
          <span class="approval-history-type">${escapeHtml(row.label)}</span>
          <strong>${escapeHtml(row.requester || "Requester")}</strong>
          <span>${escapeHtml(row.department || "Department")}</span>
          <time>${escapeHtml(requestDateTime(row.date))}</time>
        </button>
      `).join("") || `<div class="approval-kanban-empty">No requests</div>`}
    </div>
  `;
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
}

function renderVendors() {
  if (businessDataLoading) {
    showTableSkeleton("vendorsTable", 8, 6);
    return;
  }
  const vendorsError = sourceError("vendors");
  if (vendorsError) {
    setTableContent("vendorsTable", errorStateRow(8, vendorsError));
    return;
  }
  const searchTerm = vendorSearchTerm.trim().toLowerCase();
  const rows = state.vendors.filter((vendor) => {
    if (!searchTerm) return true;
    return [vendor.name, vendor.phone, vendor.contact, vendor.bankName, vendor.accountTitle, vendor.accountNo, vendor.address]
      .some((value) => String(value || "").toLowerCase().includes(searchTerm));
  });
  setTableContent("vendorsTable", rows.map((vendor) => `
    <tr>
      <td>${escapeHtml(vendor.name)}</td>
      <td>${escapeHtml(vendor.phone || "")}</td>
      <td>${escapeHtml(vendor.contact || "")}</td>
      <td>${escapeHtml(vendor.bankName || "")}</td>
      <td>${escapeHtml(vendor.accountTitle || "")}</td>
      <td>${escapeHtml(vendor.accountNo || "")}</td>
      <td>${escapeHtml(vendor.address || "")}</td>
      <td><button class="tiny" type="button" onclick="editVendor('${escapeHtml(vendor.id)}')">Edit</button></td>
    </tr>
  `).join("") || emptyStateRow(8, searchTerm ? "No matching vendors" : "No vendors added yet", searchTerm ? "Try another name, phone, contact, bank, account, or address." : "Vendor records used by purchase orders will appear here."));
}

function resetVendorForm() {
  const form = document.getElementById("vendorForm");
  form.reset();
  form.elements.id.value = "";
  document.getElementById("saveVendorButton").innerHTML = `<i data-lucide="building-2"></i>Add Vendor`;
  const title = document.getElementById("vendorDrawerTitle");
  if (title) title.textContent = "Add Vendor";
  document.getElementById("cancelVendorEdit").hidden = true;
  if (window.lucide) window.lucide.createIcons();
}

window.editVendor = function (vendorId) {
  const vendor = state.vendors.find((row) => String(row.id) === String(vendorId));
  if (!vendor) return showToast("Vendor not found.", "error");
  const form = document.getElementById("vendorForm");
  form.elements.id.value = vendor.id;
  form.elements.name.value = vendor.name || "";
  form.elements.phone.value = vendor.phone || "";
  form.elements.contact.value = vendor.contact || "";
  form.elements.bankName.value = vendor.bankName || "";
  form.elements.accountTitle.value = vendor.accountTitle || "";
  form.elements.accountNo.value = vendor.accountNo || "";
  form.elements.address.value = vendor.address || "";
  document.getElementById("saveVendorButton").innerHTML = `<i data-lucide="save"></i>Update Vendor`;
  const title = document.getElementById("vendorDrawerTitle");
  if (title) title.textContent = "Edit Vendor";
  document.getElementById("cancelVendorEdit").hidden = false;
  openVendorDrawer();
  if (window.lucide) window.lucide.createIcons();
};

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
    if (section === "requests") return !entity.includes("transport") && (entity.includes("request") || isIssuedStockHistory(log));
    if (section === "transport") return entity.includes("transport");
    if (section === "approvals") return isApprovedHistory(log);
    if (section === "stockOut") return isIssuedStockHistory(log);
    return false;
  });
}

function recordHistoryEntries(section) {
  if (section === "requests") {
    return state.requests.flatMap((request) => request.items
      .filter(isRequestLineHistory)
      .map((item) => {
        const titleStatus = item.issuanceStatus === "Issued" ? "issued" : String(item.approvalStatus || "completed").toLowerCase();
        return {
          id: `request-record-${request.requestId}-${item.id}-${titleStatus}`,
          kind: "items",
          ref: request.requestId,
          title: `${request.requestId} item ${titleStatus}`,
          subtitle: `${item.itemName || item.itemCode || "Request item"} moved to history`,
          log: { date: request.date },
          details: {
            requestId: request.requestId,
            requester: request.requester,
            requesterEmail: request.requesterEmail,
            department: request.department,
            location: request.location,
            managerEmail: request.managerEmail,
            requestDate: request.date,
            itemId: item.id,
            itemCode: item.itemCode,
            itemName: item.itemName,
            type: item.type,
            quantity: item.quantity,
            quantityApproved: item.quantityApproved,
            quantityIssued: item.quantityIssued,
            notes: request.notes || request.notes_remarks,
            status: [item.approvalStatus, item.issuanceStatus].filter(Boolean).join(" / ")
          }
        };
      }));
  }

  if (section === "transport") {
    return state.transportRequests
      .filter(isTransportHistory)
      .map((row) => {
        const status = row.arrangementStatus === "Pending" ? row.approvalStatus : row.arrangementStatus;
        return {
          id: `transport-record-${row.id}-${status}`,
          kind: "transport",
          ref: row.requestId || `TRQ-${row.id}`,
          title: `${row.requestId || `TRQ-${row.id}`} ${String(status || "completed").toLowerCase()}`,
          subtitle: status === "Arranged" ? "Transport has been scheduled" : "Transport request moved to history",
          log: { date: row.updatedAt || row.date || row.travelDate },
          details: {
            id: row.id,
            requestNumber: row.requestId,
            requester: row.requester,
            requesterEmail: row.requesterEmail,
            department: row.department,
            transportType: row.transportType,
            purpose: row.purpose || row.notes,
            pickupLocation: row.pickupLocation,
            destination: transportDestination(row),
            travelDate: row.travelDate,
            departureTime: row.departureTime || row.localDepartureTime || row.pickupTime,
            vehicleType: row.vehicleType,
            passengers: row.passengers || row.travelers || row.localPassengers,
            duration: row.expectedDuration || row.tripDuration,
            status: [row.approvalStatus, row.arrangementStatus].filter(Boolean).join(" / ")
          }
        };
      });
  }

  return [];
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

function requestItemForHistory(entry, request) {
  if (!request) return null;
  const d = entry.details || {};
  return request.items?.find((item) =>
    String(item.id) === String(d.itemId)
    || (d.itemCode && item.itemCode === d.itemCode)
    || (d.itemName && item.itemName === d.itemName)
  );
}

function historyDetailGrid(entry) {
  if (!expandedHistoryIds.has(entry.id)) return "";
  const transport = entry.kind === "transport" ? transportForHistory(entry) : null;
  const request = entry.kind === "items" ? requestForHistory(entry) : null;
  const item = entry.kind === "items" ? requestItemForHistory(entry, request) : null;
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
    ["Request date", formatDate(request?.date || d.requestDate || d.date)],
    ["Requester email", request?.requesterEmail || d.requesterEmail],
    ["Manager email", request?.managerEmail || d.managerEmail],
    ["Status", [d.fromStatus, d.toStatus].filter(Boolean).join(" -> ") || d.status],
    ["Item name", item?.itemName || d.itemName],
    ["Item ID", item?.itemCode || d.itemCode || d.itemId],
    ["Type", item?.type || d.type],
    ["Requested quantity", quantityValue(item?.quantity ?? d.quantity)],
    ["Movement", d.movementNumber],
    ["Notes", d.notes || d.details]
  ];
  return `<div class="history-details">${cells.filter(([, value]) => value !== undefined && value !== null && value !== "").map(([label, value]) => `
    <div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>
  `).join("")}</div>`;
}

function renderHistoryPage() {
  const titles = {
    requests: "Requests history",
    transport: "Transport history",
    approvals: "Approvals history",
    stockOut: "Stock out history"
  };
  setText("historyTitle", titles[activeHistorySection] || titles.requests);
  const list = document.getElementById("historyList");
  if (!list) return;
  const auditEntries = historyRows(activeHistorySection)
    .map((log) => ({ log, ...historySummary(log) }));
  const entries = [...recordHistoryEntries(activeHistorySection), ...auditEntries]
    .sort((a, b) => new Date(b.log?.date || 0) - new Date(a.log?.date || 0));
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

function skeletonLine(width = "100%") {
  return `<span class="skeleton skeleton-line" style="width:${escapeHtml(width)}"></span>`;
}

function showTableSkeleton(tbodyId, columnCount, rowCount = 6) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  tbody.classList.add("loading");
  tbody.innerHTML = Array.from({ length: rowCount }, () => `
    <tr class="skeleton-row">
      ${Array.from({ length: columnCount }, (_, index) => `<td>${skeletonLine(index % 3 === 0 ? "72%" : index % 3 === 1 ? "92%" : "54%")}</td>`).join("")}
    </tr>
  `).join("");
}

function showCardSkeleton(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.classList.add("loading");
  container.innerHTML = `
    <div class="skeleton-card">
      <div class="skeleton skeleton-line short"></div>
      <div class="skeleton skeleton-line wide"></div>
      <div class="skeleton-grid">
        ${Array.from({ length: 6 }, () => `
          <div class="skeleton-card compact">
            <span class="skeleton skeleton-circle"></span>
            <span class="skeleton skeleton-line"></span>
            <span class="skeleton skeleton-line short"></span>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function clearSkeleton(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.classList.remove("loading");
}

function setTableContent(tbodyId, html) {
  clearSkeleton(tbodyId);
  const tbody = document.getElementById(tbodyId);
  if (tbody) tbody.innerHTML = html;
}

function restoreDashboardShell() {
  const dashboard = document.getElementById("dashboardView");
  if (!dashboard) return;
  if (!dashboardDefaultHtml) dashboardDefaultHtml = dashboard.innerHTML;
  if (dashboard.classList.contains("loading")) {
    dashboard.innerHTML = dashboardDefaultHtml;
    dashboard.classList.remove("loading");
  }
}

function showEmptyState(containerId, title, message, actionText = "") {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.classList.remove("loading");
  const isTbody = container.tagName === "TBODY";
  const colCount = isTbody ? (container.closest("table")?.querySelectorAll("thead th").length || 1) : 1;
  const markup = `
    <div class="empty-state">
      <span class="empty-state-icon"><i data-lucide="inbox"></i></span>
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(message)}</p>
      ${actionText ? `<button class="secondary" type="button">${escapeHtml(actionText)}</button>` : ""}
    </div>
  `;
  container.innerHTML = isTbody ? `<tr><td colspan="${colCount}">${markup}</td></tr>` : markup;
  if (window.lucide) window.lucide.createIcons();
}

function emptyStateRow(cols, title, message, actionText = "") {
  return `<tr><td colspan="${cols}">
    <div class="empty-state">
      <span class="empty-state-icon"><i data-lucide="inbox"></i></span>
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(message)}</p>
      ${actionText ? `<button class="secondary" type="button">${escapeHtml(actionText)}</button>` : ""}
    </div>
  </td></tr>`;
}

function errorStateRow(cols, message = businessDataError || "Unable to load this data.") {
  return emptyStateRow(cols, "Unable to load data", message);
}

function sourceError(...keys) {
  return keys.map((key) => businessDataErrors[key]).find(Boolean) || "";
}

function render() {
  syncSelectOptions();
  renderCategoryTabs();
  updateStockOutItemId();
  renderDashboard();
  renderRequests();
  renderRequisition();
  renderInventory();
  renderRequestSection();
  renderProcurement();
  renderIssue();
  renderPO();
  renderGRN();
  renderTransport();
  renderApprovals();
  renderVendors();
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
  if (qty > remainingQty) return showToast(`Issue quantity cannot exceed remaining approved quantity (${quantityValue(remainingQty)}).`, "error");
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
    closeApprovalDetailModal();
    showToast(`Transport ${status.toLowerCase()}.`);
  } catch (error) {
    showToast(error.message, "error");
  }
};

function findInventoryApprovalLine(requestId, itemId) {
  const request = state.requests.find((row) => String(row.requestId) === String(requestId));
  const item = request?.items.find((row) => String(row.id) === String(itemId));
  return { request, item };
}

function findTransportApprovalLine(requestId) {
  return state.transportRequests.find((row) => String(row.id) === String(requestId));
}

function closeApprovalDetailModal() {
  const modal = document.getElementById("approvalDetailModal");
  if (!modal) return;
  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");
}

function approvalDetailMarkup(details, actionMarkup) {
  return `
    <div class="approval-detail-grid">
      ${details.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value ?? "")}</strong></div>`).join("")}
    </div>
    <div class="approval-detail-actions">${actionMarkup}</div>
  `;
}

window.openApprovalDetail = function (kind, requestId, itemId = "") {
  if (kind === "transport") return openTransportApprovalDetail(requestId);
  const { request, item } = findInventoryApprovalLine(requestId, itemId);
  if (!request || !item) return showToast("Request item not found.", "error");
  if (!lineManagerMatchesCurrentUser(request)) return showToast("This request is assigned to another line manager.", "error");
  const modal = document.getElementById("approvalDetailModal");
  const content = document.getElementById("approvalDetailContent");
  document.getElementById("approvalDetailTitle").textContent = request.requestId || "Request details";
  document.getElementById("approvalDetailSubtitle").textContent = `${request.requester || "Requester"} - ${request.department || "Department"} - ${requestDateTime(request.date)}`;
  const details = [
    ["Requester name", request.requester],
    ["Department", request.department],
    ["Request date and time", requestDateTime(request.date)],
    ["Line manager email", request.managerEmail],
    ["Requester email", request.requesterEmail],
    ["Location", request.location],
    ["Request ID", request.requestId],
    ["Item ID", item.itemCode],
    ["Item name", item.itemName],
    ["Type", item.type],
    ["Requested quantity", quantityValue(item.quantity)]
  ];
  content.innerHTML = approvalDetailMarkup(details, isPendingApproval(item.approvalStatus) ? `
        <button class="primary" type="button" onclick="setRequestApproval('${escapeHtml(request.requestId)}','${escapeHtml(item.id)}','Approved')"><i data-lucide="check"></i>Approve</button>
        <button class="danger-btn" type="button" onclick="setRequestApproval('${escapeHtml(request.requestId)}','${escapeHtml(item.id)}','Rejected')"><i data-lucide="x"></i>Reject</button>
      ` : statusBadge(item.approvalStatus));
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
  if (window.lucide) window.lucide.createIcons();
};

function openTransportApprovalDetail(requestId) {
  const request = findTransportApprovalLine(requestId);
  if (!request) return showToast("Transport request not found.", "error");
  if (!lineManagerMatchesCurrentUser(request)) return showToast("This request is assigned to another line manager.", "error");
  const modal = document.getElementById("approvalDetailModal");
  const content = document.getElementById("approvalDetailContent");
  document.getElementById("approvalDetailTitle").textContent = request.id || "Transport request";
  document.getElementById("approvalDetailSubtitle").textContent = `${request.requester || "Requester"} - ${request.transportType || "Transport"} - ${requestDateTime(request.travelDate || request.date)}`;
  const details = [
    ["Requester name", request.requester],
    ["Request type", request.transportType],
    ["Request date and time", requestDateTime(request.travelDate || request.date)],
    ["Line manager email", request.managerEmail],
    ["Pickup location", request.pickupLocation],
    ["Destination", transportDestination(request)],
    ["Pickup / departure time", request.pickupTime || request.departureTime || request.localDepartureTime],
    ["Return date / time", request.returnDate || request.returnTime],
    ["Vehicle", request.vehicleType],
    ["Goods / items", request.goodsDescription],
    ["Quantity / passengers", request.goodsQuantity || request.travelers || request.passengers || request.localPassengers],
    ["Purpose / notes", request.purpose],
    ["Arrangement status", request.arrangementStatus]
  ];
  content.innerHTML = approvalDetailMarkup(details, isPendingApproval(request.approvalStatus) ? `
      <button class="primary" type="button" onclick="setTransportApproval('${escapeHtml(request.id)}','Approved')"><i data-lucide="check"></i>Approve</button>
      <button class="danger-btn" type="button" onclick="setTransportApproval('${escapeHtml(request.id)}','Rejected')"><i data-lucide="x"></i>Reject</button>
    ` : transportDetailActions(request));
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
  if (window.lucide) window.lucide.createIcons();
}

function transportDetailActions(request) {
  if (request.approvalStatus === "Approved" && request.arrangementStatus === "Pending") {
    return `
      <button class="primary" type="button" onclick="setTransport('${escapeHtml(request.id)}','Arranged')"><i data-lucide="route"></i>Arrange</button>
      <button class="danger-btn" type="button" onclick="setTransport('${escapeHtml(request.id)}','Cancelled')"><i data-lucide="x"></i>Cancel</button>
    `;
  }
  return `<div class="approval-detail-status-row">${statusBadge(request.approvalStatus)} ${statusBadge(request.arrangementStatus)}</div>`;
}

window.setRequestApproval = async function (requestId, itemId, status) {
  const request = state.requests.find((row) => row.requestId === requestId);
  const item = request?.items.find((row) => String(row.id) === String(itemId));
  if (!request || !item) return showToast("Request item not found.", "error");
  if (!lineManagerMatchesCurrentUser(request)) return showToast("This request is assigned to another line manager.", "error");
  try {
    await apiRequest(`/requests/${encodeURIComponent(requestId)}/items/${encodeURIComponent(itemId)}/approval`, {
      method: "PUT",
      body: JSON.stringify({ status })
    });
    await loadBusinessData({ silent: true });
    render();
    closeApprovalDetailModal();
    showToast(`Request ${status.toLowerCase()}.`);
  } catch (error) {
    showToast(error.message, "error");
  }
};

window.setTransportApproval = async function (id, status) {
  const row = state.transportRequests.find((item) => String(item.id) === String(id));
  if (!row) return showToast("Transport request not found.", "error");
  if (!lineManagerMatchesCurrentUser(row)) return showToast("This request is assigned to another line manager.", "error");
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

window.printGRN = function (grnNumber) {
  const grn = state.grns.find((row) => String(row.grnNumber) === String(grnNumber));
  if (!grn) return showToast("GRN not found.", "error");
  printHtml(renderGrnSheet(grn));
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
          .grn-items-table th:nth-child(2), .grn-items-table td:nth-child(2) { width: 16%; text-align: left; }
          .grn-items-table th:nth-child(3), .grn-items-table th:nth-child(4), .grn-items-table th:nth-child(5), .grn-items-table td:nth-child(3), .grn-items-table td:nth-child(4), .grn-items-table td:nth-child(5) { width: 14%; text-align: right; }
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

document.querySelector(".sidebar")?.addEventListener("click", (event) => {
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
    requestModuleTab = "requisition";
    requestsFilter = "All";
    requestsPage = 1;
  }
  if (item.dataset.view === "inventory") {
    inventoryModuleTab = "items";
    inventoryStatusFilter = "All";
    inventoryPage = 1;
  }
  if (item.dataset.view === "procurement") {
    procurementModuleTab = "po";
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
  unlockNotificationSound();
  toggleNotificationCenter();
});

document.getElementById("closeNotificationCenter").addEventListener("click", closeNotificationCenter);

document.getElementById("chatBtn")?.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleChatPanel();
});

document.getElementById("closeChatPanel")?.addEventListener("click", closeChatPanel);

document.getElementById("chatPanel")?.addEventListener("click", (event) => {
  event.stopPropagation();
  const userButton = event.target.closest("[data-chat-user-id]");
  if (userButton) {
    selectChatUser(userButton.dataset.chatUserId).catch((error) => {
      showToast(error.message || "Unable to open chat.", "error");
    });
  }
});

document.getElementById("chatUserSearch")?.addEventListener("input", (event) => {
  chatSearchTerm = event.target.value || "";
  renderChatUsers();
});

document.getElementById("chatForm")?.addEventListener("submit", sendMessage);

document.getElementById("notificationCenter").addEventListener("click", (event) => {
  event.stopPropagation();
  const tab = event.target.closest("[data-notification-tab]");
  if (tab) {
    activeNotificationTab = "direct";
    unreadOnly = tab.dataset.notificationTab === "watching";
    document.getElementById("unreadOnlyToggle").checked = unreadOnly;
    renderNotificationCenter();
    return;
  }
  const entry = event.target.closest("[data-notification-id]");
  if (entry) {
    const item = notifications.find((row) => String(row.id) === String(entry.dataset.notificationId));
    markNotificationRead(entry.dataset.notificationId).finally(() => {
      if (item) openNotificationTarget(item);
    });
  }
});

document.getElementById("unreadOnlyToggle").addEventListener("change", async (event) => {
  unreadOnly = event.target.checked;
  await loadNotifications();
  renderNotificationCenter();
});

document.getElementById("markNotificationsRead").addEventListener("click", async () => {
  try {
    await apiRequest("/notifications/read-all", { method: "PATCH" });
    showToast("Notifications marked as read.");
  } catch (error) {
    showToast(error.message || "Unable to mark notifications as read.", "error");
  }
  unreadOnly = false;
  document.getElementById("unreadOnlyToggle").checked = false;
  await loadNotifications({ silent: true });
  renderNotificationCenter();
  updateNotificationBadge();
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".kebab-wrap")) closeDashboardMenus();
  if (!event.target.closest(".approval-column-tools")) closeApprovalColumnMenus();
  if (!event.target.closest(".approval-column-tools")) closeTransportColumnMenus();
  if (!event.target.closest("#notificationCenter") && !event.target.closest("#notificationBtn")) closeNotificationCenter();
  if (!event.target.closest("#chatPanel") && !event.target.closest("#chatBtn")) closeChatPanel();
  if (!event.target.closest("#profileMenu") && !event.target.closest("#profileBtn")) {
    const pm = document.getElementById("profileMenu");
    if (pm && pm.classList.contains("show")) {
      pm.classList.remove("show");
      pm.setAttribute("aria-hidden", "true");
    }
  }
});

document.addEventListener("pointerdown", unlockNotificationSound, { once: true });

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeDashboardMenus();
    closeApprovalColumnMenus();
    closeTransportColumnMenus();
    closeNotificationCenter();
    closeChatPanel();
    closePoCancelModal();
    closeDeleteUserModal();
    closeApprovalDetailModal();
    closeAddUserDrawer();
    closePermissionsDrawer();
  }
});

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
  if (activeSettingsGroup === "team" || activeSettingsGroup === "roles") loadUserManagement({ silent: true });
});

document.getElementById("settingsForm").addEventListener("submit", saveActiveSettings);

document.getElementById("settingsForm").addEventListener("click", (event) => {
  if (event.target.id === "reloadSettingsBtn") loadSettings({ silent: false });
  if (event.target.id === "reloadUsersBtn") loadUserManagement({ silent: false });
  if (event.target.closest("#openAddUserDrawerBtn")) openAddUserDrawer();
  if (event.target.closest("#closeAddUserDrawerBtn")) closeAddUserDrawer();
  if (event.target.closest("#closePermissionsDrawerBtn")) closePermissionsDrawer();
  if (event.target.id === "teamUserDrawer") closeAddUserDrawer();
  if (event.target.id === "teamPermissionsDrawer") closePermissionsDrawer();
  if (event.target.closest("#addUserInlineBtn")) addUserFromManagement();
  if (event.target.closest("#copyUserInviteLinkBtn")) copyUserInviteLink();
  if (event.target.closest("#savePermissionsDrawerBtn")) savePermissionsFromDrawer();
  const editButton = event.target.closest(".edit-user-roles");
  if (editButton) openPermissionsDrawer(editButton.dataset.userId);
  const saveButton = event.target.closest(".save-user-roles");
  if (saveButton) saveUserRoles(saveButton.dataset.userId);
  const statusButton = event.target.closest(".toggle-user-status");
  if (statusButton) toggleUserStatus(statusButton.dataset.userId, statusButton.dataset.nextActive === "true");
  const deleteButton = event.target.closest(".delete-user");
  if (deleteButton) deleteUser(deleteButton.dataset.userId);
});

document.addEventListener("click", (event) => {
  if (event.target.closest("#openAddUserDrawerBtn")) openAddUserDrawer();
  if (event.target.closest("#closeAddUserDrawerBtn")) closeAddUserDrawer();
  if (event.target.closest("#closePermissionsDrawerBtn")) closePermissionsDrawer();
  if (event.target.closest("#addUserInlineBtn")) addUserFromManagement();
  if (event.target.closest("#copyUserInviteLinkBtn")) copyUserInviteLink();
  if (event.target.closest("#savePermissionsDrawerBtn")) savePermissionsFromDrawer();
  const editButton = event.target.closest(".edit-user-roles");
  if (editButton) openPermissionsDrawer(editButton.dataset.userId);
});

document.getElementById("settingsForm").addEventListener("change", (event) => {
  const input = event.target.closest(".role-pill input");
  if (!input) return;
  input.closest(".role-pill").classList.toggle("selected", input.checked);
});

document.getElementById("categoryTabs").addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  inventoryCategoryFilter = button.dataset.category;
  inventoryPage = 1;
  document.querySelectorAll(".category-tab").forEach((tab) => tab.classList.toggle("active", tab === button));
  renderInventory();
});

document.getElementById("inventoryStatusTabs")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-inventory-status]");
  if (!button) return;
  inventoryStatusFilter = button.dataset.inventoryStatus;
  inventoryPage = 1;
  renderInventory();
});

document.getElementById("inventoryModuleTabs")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-inventory-tab]");
  if (!button) return;
  inventoryModuleTab = button.dataset.inventoryTab;
  renderInventory();
  updateTopbarBreadcrumb("inventory");
});

document.getElementById("procurementModuleTabs")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-procurement-tab]");
  if (!button) return;
  procurementModuleTab = button.dataset.procurementTab;
  renderProcurement();
  updateTopbarBreadcrumb("procurement");
});

document.getElementById("requestModuleTabs")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-request-tab]");
  if (!button) return;
  requestModuleTab = button.dataset.requestTab;
  if (requestModuleTab === "items") {
    requestsFilter = "All";
    requestsPage = 1;
  }
  renderRequestSection();
  updateTopbarBreadcrumb("requests");
});

document.getElementById("inventoryCards")?.addEventListener("click", (event) => {
  const card = event.target.closest("[data-item-code]");
  if (!card) return;
  openInventoryItemDetail(card.dataset.itemCode);
});

document.getElementById("inventoryView")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-view]");
  if (!button) return;
  setView(button.dataset.view);
});

document.getElementById("inventoryLocationFilter").addEventListener("change", (event) => {
  inventoryLocationFilter = event.target.value || "All";
  inventoryPage = 1;
  renderInventory();
});

document.getElementById("inventorySearchInput").addEventListener("input", (event) => {
  inventorySearchTerm = event.target.value || "";
  inventoryPage = 1;
  renderInventory();
});

document.getElementById("stockIssueSearchInput")?.addEventListener("input", (event) => {
  stockIssueSearchTerm = event.target.value || "";
  renderIssue();
});

document.getElementById("stockIssueLocationFilter")?.addEventListener("change", (event) => {
  stockIssueLocationFilter = event.target.value || "All";
  renderIssue();
});

document.getElementById("grnSearchInput")?.addEventListener("input", (event) => {
  grnSearchTerm = event.target.value || "";
  renderGRN();
});

document.getElementById("grnVendorFilter")?.addEventListener("change", (event) => {
  grnVendorFilter = event.target.value || "All";
  syncVendorFilterClearButton("grn");
  renderGRN();
});

document.getElementById("clearGrnVendorFilter")?.addEventListener("click", () => {
  clearVendorFilter("grn");
});

document.getElementById("poSearchInput")?.addEventListener("input", (event) => {
  poSearchTerm = event.target.value || "";
  renderPO();
});

document.getElementById("vendorSearchInput")?.addEventListener("input", (event) => {
  vendorSearchTerm = event.target.value || "";
  renderVendors();
});

document.getElementById("poVendorFilter")?.addEventListener("change", (event) => {
  poVendorFilter = event.target.value || "All";
  renderPO();
});

document.getElementById("clearPoVendorFilter")?.addEventListener("click", () => {
  clearVendorFilter("po");
});

document.getElementById("poStatusFilters")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-po-status]");
  if (!button) return;
  poStatusFilter = button.dataset.poStatus;
  renderPO();
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
document.getElementById("openCategoryModal")?.addEventListener("click", openCategoryModal);
document.getElementById("openWarehouseModal")?.addEventListener("click", () => {
  showToast("Add warehouse will be wired to warehouse creation next.", "error");
});
document.getElementById("openManualStockIssue")?.addEventListener("click", openManualStockIssue);
document.getElementById("closeManualStockIssue")?.addEventListener("click", closeManualStockIssue);
document.getElementById("openPoDrawer")?.addEventListener("click", openPoDrawer);
document.getElementById("closePoDrawer")?.addEventListener("click", closePoDrawer);
document.getElementById("openVendorDrawer")?.addEventListener("click", () => {
  resetVendorForm();
  openVendorDrawer();
});
document.getElementById("closeVendorDrawer")?.addEventListener("click", closeVendorDrawer);
document.getElementById("closeItemModal").addEventListener("click", closeItemModal);
document.getElementById("cancelItemModal").addEventListener("click", closeItemModal);
document.getElementById("closeCategoryModal")?.addEventListener("click", closeCategoryModal);
document.getElementById("cancelCategoryModal")?.addEventListener("click", closeCategoryModal);
document.getElementById("itemModal").addEventListener("click", (event) => {
  if (event.target.id === "itemModal") closeItemModal();
});
document.getElementById("categoryModal")?.addEventListener("click", (event) => {
  if (event.target.id === "categoryModal") closeCategoryModal();
});
document.getElementById("manualStockIssueDrawer")?.addEventListener("click", (event) => {
  if (event.target.id === "manualStockIssueDrawer") closeManualStockIssue();
});
document.getElementById("poDrawer")?.addEventListener("click", (event) => {
  if (event.target.id === "poDrawer") closePoDrawer();
});
document.getElementById("vendorDrawer")?.addEventListener("click", (event) => {
  if (event.target.id === "vendorDrawer") closeVendorDrawer();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeManualStockIssue();
  if (event.key === "Escape") closePoDrawer();
  if (event.key === "Escape") closeVendorDrawer();
});

document.getElementById("closeInventoryDetail")?.addEventListener("click", closeInventoryItemDetail);
document.getElementById("dismissInventoryDetail")?.addEventListener("click", closeInventoryItemDetail);
document.getElementById("saveInventoryStock")?.addEventListener("click", saveInventoryDetailStock);
document.getElementById("deleteInventoryItem")?.addEventListener("click", openDeleteInventoryItemModal);
document.getElementById("inventoryItemDetailModal")?.addEventListener("click", (event) => {
  if (event.target.id === "inventoryItemDetailModal") closeInventoryItemDetail();
});
document.getElementById("closeDeleteInventoryItemModal")?.addEventListener("click", closeDeleteInventoryItemModal);
document.getElementById("cancelDeleteInventoryItem")?.addEventListener("click", closeDeleteInventoryItemModal);
document.getElementById("confirmDeleteInventoryItem")?.addEventListener("click", confirmDeleteInventoryDetailItem);
document.getElementById("deleteInventoryItemModal")?.addEventListener("click", (event) => {
  if (event.target.id === "deleteInventoryItemModal") closeDeleteInventoryItemModal();
});
document.getElementById("closePoPreview")?.addEventListener("click", closePoPreview);
document.getElementById("editPoPreview")?.addEventListener("click", closePoPreview);
document.getElementById("savePoPreview")?.addEventListener("click", savePendingPO);
document.getElementById("poPreviewModal")?.addEventListener("click", (event) => {
  if (event.target.id === "poPreviewModal") closePoPreview();
});
document.getElementById("closePoCancel")?.addEventListener("click", closePoCancelModal);
document.getElementById("dismissPoCancel")?.addEventListener("click", closePoCancelModal);
document.getElementById("poCancelForm")?.addEventListener("submit", submitPoCancellation);
document.getElementById("poCancelModal")?.addEventListener("click", (event) => {
  if (event.target.id === "poCancelModal") closePoCancelModal();
});
document.getElementById("closeDeleteUserModal")?.addEventListener("click", closeDeleteUserModal);
document.getElementById("cancelDeleteUser")?.addEventListener("click", closeDeleteUserModal);
document.getElementById("confirmDeleteUser")?.addEventListener("click", confirmDeleteUser);
document.getElementById("deleteUserModal")?.addEventListener("click", (event) => {
  if (event.target.id === "deleteUserModal") closeDeleteUserModal();
});
document.getElementById("approvalsBoard")?.addEventListener("click", (event) => {
  const menuButton = event.target.closest("[data-approval-menu]");
  if (menuButton) {
    const key = menuButton.dataset.approvalMenu;
    const menu = document.querySelector(`[data-approval-menu-panel="${escapeCssIdentifier(key)}"]`);
    const willOpen = !menu?.classList.contains("show");
    closeApprovalColumnMenus();
    if (menu && willOpen) {
      menu.classList.add("show");
      menu.setAttribute("aria-hidden", "false");
      menuButton.setAttribute("aria-expanded", "true");
    }
    return;
  }
  const refreshButton = event.target.closest("[data-approval-refresh]");
  if (refreshButton) {
    closeApprovalColumnMenus();
    loadBusinessData({ silent: true }).then(() => {
      render();
      showToast(`${approvalColumnTitle(refreshButton.dataset.approvalRefresh)} refreshed.`);
    }).catch((error) => showToast(error.message || "Unable to refresh requests.", "error"));
    return;
  }
  const historyButton = event.target.closest("[data-approval-history]");
  if (historyButton) {
    closeApprovalColumnMenus();
    openApprovalColumnHistory(historyButton.dataset.approvalHistory);
    return;
  }
  const card = event.target.closest(".approval-kanban-card");
  if (!card) return;
  window.openApprovalDetail(card.dataset.approvalKind, card.dataset.requestId, card.dataset.itemId);
});
document.getElementById("transportBoard")?.addEventListener("click", (event) => {
  const menuButton = event.target.closest("[data-transport-menu]");
  if (menuButton) {
    const key = menuButton.dataset.transportMenu;
    const menu = document.querySelector(`[data-transport-menu-panel="${escapeCssIdentifier(key)}"]`);
    const willOpen = !menu?.classList.contains("show");
    closeTransportColumnMenus();
    if (menu && willOpen) {
      menu.classList.add("show");
      menu.setAttribute("aria-hidden", "false");
      menuButton.setAttribute("aria-expanded", "true");
    }
    return;
  }
  const refreshButton = event.target.closest("[data-transport-refresh]");
  if (refreshButton) {
    closeTransportColumnMenus();
    loadBusinessData({ silent: true }).then(() => {
      render();
      showToast(`${transportColumnTitle(refreshButton.dataset.transportRefresh)} refreshed.`);
    }).catch((error) => showToast(error.message || "Unable to refresh transport requests.", "error"));
    return;
  }
  const historyButton = event.target.closest("[data-transport-history]");
  if (historyButton) {
    closeTransportColumnMenus();
    openTransportColumnHistory(historyButton.dataset.transportHistory);
    return;
  }
  const card = event.target.closest(".transport-kanban-card");
  if (!card) return;
  openTransportApprovalDetail(card.dataset.transportId);
});
document.getElementById("closeApprovalDetail")?.addEventListener("click", closeApprovalDetailModal);
document.getElementById("approvalDetailModal")?.addEventListener("click", (event) => {
  if (event.target.id === "approvalDetailModal") closeApprovalDetailModal();
  const historyItem = event.target.closest(".approval-history-item");
  if (historyItem) {
    if (historyItem.dataset.transportHistoryItem) {
      openTransportApprovalDetail(historyItem.dataset.transportHistoryItem);
      return;
    }
    window.openApprovalDetail(historyItem.dataset.approvalKind, historyItem.dataset.requestId, historyItem.dataset.itemId);
  }
});

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
  const subtotal = [...document.querySelectorAll("#poItems .po-item-row")].reduce((sum, row) => {
    const quantity = Number(row.querySelector("[name='quantityOrdered']").value) || 0;
    const unitPrice = Number(row.querySelector("[name='unitPrice']").value) || 0;
    return sum + quantity * unitPrice;
  }, 0);
  const taxRate = Number(form.elements.taxRate.value) || 0;
  form.elements.poAmount.value = money(subtotal + subtotal * (taxRate / 100));
}

document.getElementById("poForm").elements.taxRate.addEventListener("input", updatePOAmount);
document.getElementById("poForm").elements.vendorId.addEventListener("input", applySelectedVendorToPo);
document.getElementById("poForm").elements.vendorId.addEventListener("change", applySelectedVendorToPo);
document.getElementById("addPoItem").addEventListener("click", addPoItemLine);

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

document.getElementById("manualStockOutForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const item = findItemBySelection(form.get("itemName"), form.get("itemCode"), form.get("category"));
  if (!item) return showToast("Select a valid item type.", "error");
  form.set("itemCode", item.code);
  const itemCode = item.code;
  const location = form.get("location");
  const quantity = Number(form.get("quantity"));
  const issuedTo = String(form.get("issuedTo") || "").trim();
  const notes = String(form.get("notes") || "").trim();
  const available = stockFor(itemCode, location);
  if (!quantity || quantity < 1) return showToast("Stock out quantity must be greater than zero.", "error");
  if (available < quantity) return showToast("Stock unavailable for this manual stock out.", "error");
  form.set("notes", [issuedTo ? `Issued to: ${issuedTo}` : "", notes].filter(Boolean).join(" | "));
  try {
    await apiRequest("/stock/out", { method: "POST", body: JSON.stringify(Object.fromEntries(form)) });
    event.currentTarget.reset();
    closeManualStockIssue();
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
  const category = String(form.get("category") || "").trim();
  const name = String(form.get("name")).trim();
  const rows = [...document.querySelectorAll("#itemTypeRows .item-type-row")].map((row) => ({
    type: row.querySelector("[name='type']").value.trim(),
    code: row.querySelector("[name='code']").value.trim()
  }));
  if (!category) return showToast("Choose a category.", "error");
  if (!rows.length) return showToast("Add at least one item type.", "error");
  if (rows.some((row) => !row.type || !row.code)) return showToast("Each type needs an Item ID.", "error");
  const submittedCodes = rows.map((row) => row.code.toLowerCase());
  if (new Set(submittedCodes).size !== submittedCodes.length) return showToast("Item ID already exists in this form.", "error");
  const duplicate = rows.find((row) => state.items.some((item) => item.code.toLowerCase() === row.code.toLowerCase()));
  if (duplicate) return showToast(`Item ID already exists: ${duplicate.code}`, "error");
  try {
    await apiRequest("/items", { method: "POST", body: JSON.stringify({ category, name, types: rows }) });
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

document.getElementById("categoryForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const name = String(form.get("name") || "").trim();
  if (!name) return showToast("Enter a category name.", "error");
  if (categories().some((category) => category.toLowerCase() === name.toLowerCase())) {
    return showToast("This category already exists.", "error");
  }
  try {
    await apiRequest("/categories", { method: "POST", body: JSON.stringify({ name }) });
    event.currentTarget.reset();
    closeCategoryModal();
    await loadBusinessData({ silent: true });
    inventoryModuleTab = "categories";
    render();
    showToast("Category added.");
  } catch (error) {
    showToast(error.message || "Unable to add category.", "error");
  }
});

document.getElementById("poForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const po = collectPurchaseOrder(event.currentTarget);
  if (!po.vendorId) return showToast("Select a vendor.", "error");
  if (!po.items.length) return showToast("Add at least one PO item.", "error");
  if (po.items.length > 20) return showToast("A PO can include up to 20 items.", "error");
  if (po.items.some((item) => !item.itemCode)) return showToast("Select item name and type for every PO item.", "error");
  if (po.items.some((item) => !item.quantityOrdered || item.quantityOrdered <= 0)) return showToast("Quantity ordered must be greater than zero for every item.", "error");
  if (po.items.some((item) => !item.specifications)) return showToast("Add specifications for every PO item.", "error");
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
  const po = selectedGrnPo();
  const selectedPoLineId = String(form.get("poLineId") || "");
  const poLine = poLineItems(po).find((item, index) => String(item.lineId || `line-${index}`) === selectedPoLineId);
  const remaining = poLine ? remainingPoLineQuantity(poLine) : Infinity;
  if (!canReceivePo(po)) return showToast("Select an open PO with remaining quantity.", "error");
  if (!poLine) return showToast("Select a PO with an item to receive.", "error");
  if (accepted > received) return showToast("Accepted quantity cannot exceed received quantity.", "error");
  if (accepted > remaining) return showToast(`Accepted quantity cannot exceed remaining PO quantity (${quantityValue(remaining)}).`, "error");
  if (/^line-\d+$/.test(selectedPoLineId)) form.set("poLineId", "");
  try {
    const result = await apiRequest("/grn", { method: "POST", body: JSON.stringify(Object.fromEntries(form)) });
    await loadBusinessData({ silent: true });
    resetGrnForm();
    render();
    closeGrnDrawer();
    showToast(`${result.grnNumber} saved and stock ledger updated.`);
  } catch (error) {
    showToast(error.message, "error");
  }
});

document.getElementById("openGrnDrawer")?.addEventListener("click", openGrnDrawer);
document.getElementById("closeGrnDrawer")?.addEventListener("click", closeGrnDrawer);
document.getElementById("grnDrawer")?.addEventListener("click", (event) => {
  if (event.target === event.currentTarget) closeGrnDrawer();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeGrnDrawer();
});
document.getElementById("poSelect").addEventListener("change", applySelectedPoToGrn);
document.getElementById("poSelect").addEventListener("input", () => {
  const po = selectedGrnPo();
  if (po) {
    applySelectedPoToGrn();
  }
});
document.getElementById("poSelect").addEventListener("blur", applySelectedPoToGrn);
document.getElementById("grnPoLineItem").addEventListener("change", applySelectedPoLineToGrn);

document.getElementById("vendorForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  const vendorId = String(form.get("id") || "").trim();
  const payload = {
    name: String(form.get("name") || "").trim(),
    phone: String(form.get("phone") || "").trim(),
    contact: String(form.get("contact") || "").trim(),
    bankName: String(form.get("bankName") || "").trim(),
    accountTitle: String(form.get("accountTitle") || "").trim(),
    accountNo: String(form.get("accountNo") || "").trim(),
    address: String(form.get("address") || "").trim()
  };
  try {
    if (vendorId && !/^\d+$/.test(vendorId)) throw new Error("Vendor ID is missing. Refresh the page and try editing again.");
    const result = await saveVendorRecord(vendorId, payload);
    const responseVendor = result.vendor || result.data?.vendor || {};
    const savedVendor = normalizeVendorRecord({
      ...payload,
      ...responseVendor,
      id: responseVendor.id || vendorId,
      vendorId: responseVendor.vendorId || ""
    });
    rememberVendorAccountDetails(savedVendor);
    resetVendorForm();
    await loadBusinessData({ silent: true });
    state.vendors = state.vendors.map(normalizeVendorRecord);
    render();
    closeVendorDrawer();
    showToast(vendorId ? "Vendor updated." : "Vendor added.");
  } catch (error) {
    showToast(error.message, "error");
  }
});

document.getElementById("cancelVendorEdit").addEventListener("click", () => {
  resetVendorForm();
  closeVendorDrawer();
});

const GLOBAL_SEARCH_ITEMS = [
  { group: "Recent", title: "Inventory", subtitle: "Stock overview", view: "inventory", icon: "boxes", terms: "items stock warehouse locations" },
  { group: "Navigation", title: "Dashboard", subtitle: "Go to page", view: "dashboard", icon: "layout-grid", terms: "home overview widgets" },
  { group: "Navigation", title: "Inventory", subtitle: "Go to page", view: "inventory", icon: "boxes", terms: "stock items warehouse" },
  { group: "Navigation", title: "Inventory › Stock Issue", subtitle: "Go to page", view: "issue", icon: "package-minus", terms: "issue out stock" },
  { group: "Navigation", title: "Inventory › GRN", subtitle: "Go to page", view: "grn", icon: "truck", terms: "goods receipt note receive" },
  { group: "Navigation", title: "Procurement › PO", subtitle: "Go to page", view: "po", icon: "file-pen-line", terms: "purchase order procurement" },
  { group: "Navigation", title: "Procurement › Vendors", subtitle: "Go to page", view: "vendors", icon: "building-2", terms: "suppliers vendor accounts" },
  { group: "Navigation", title: "Requests › Requisition Form", subtitle: "Go to page", view: "requisition", icon: "file-plus-2", terms: "request form submit items" },
  { group: "Navigation", title: "Requests › Transport Requests", subtitle: "Go to page", view: "transport", icon: "route", terms: "vehicle transport travel" },
  { group: "Navigation", title: "Requests", subtitle: "Go to page", view: "requests", icon: "list-checks", terms: "submitted approvals request list" },
  { group: "Navigation", title: "Approvals", subtitle: "Go to page", view: "approvals", icon: "shield-check", terms: "approve reject managers" },
  { group: "Navigation", title: "Reports", subtitle: "Visible in sidebar", icon: "bar-chart-3", terms: "insights analytics report" },
  { group: "Navigation", title: "Settings", subtitle: "Go to page", view: "settings", icon: "settings", terms: "admin users roles configuration" },
  { group: "Actions", title: "Add inventory item", subtitle: "Open Inventory", view: "inventory", icon: "plus", terms: "new add item inventory" },
  { group: "Actions", title: "Create requisition", subtitle: "Open Requisition Form", view: "requisition", icon: "send", terms: "new request submit requisition" },
  { group: "Actions", title: "Create purchase order", subtitle: "Open PO", view: "po", icon: "file-plus", terms: "new po procurement purchase" },
  { group: "Actions", title: "Add vendor", subtitle: "Open Vendors", view: "vendors", icon: "building-2", terms: "new supplier vendor" }
];

function searchableItems() {
  return GLOBAL_SEARCH_ITEMS.filter((item) => !item.view || canAccessView(item.view));
}

function renderGlobalSearchResults() {
  const results = document.getElementById("globalSearchResults");
  const input = document.getElementById("globalSearchPaletteInput");
  if (!results || !input) return;
  const term = input.value.trim().toLowerCase();
  const items = searchableItems().filter((item) => {
    const haystack = `${item.title} ${item.subtitle || ""} ${item.group} ${item.terms || ""}`.toLowerCase();
    return !term || haystack.includes(term);
  });
  if (!items.length) {
    results.innerHTML = `<div class="search-empty">No sections found.</div>`;
    return;
  }
  let currentGroup = "";
  results.innerHTML = items.map((item, index) => {
    const heading = item.group !== currentGroup ? `<div class="search-result-group">${escapeHtml(item.group)}</div>` : "";
    currentGroup = item.group;
    return `${heading}
      <button class="search-result-item ${index === 0 ? "active" : ""}" type="button" ${item.view ? `data-search-view="${escapeHtml(item.view)}"` : "disabled"} aria-label="${escapeHtml(item.title)}">
        <span class="search-result-icon"><i data-lucide="${escapeHtml(item.icon)}"></i></span>
        <span class="search-result-title">${escapeHtml(item.title)}</span>
        <span class="search-result-subtitle">${escapeHtml(item.subtitle || "")}</span>
        ${item.view ? `<span class="search-enter"><i data-lucide="corner-down-left"></i></span>` : ""}
      </button>`;
  }).join("");
  if (window.lucide) window.lucide.createIcons();
}

function openGlobalSearch(seed = "") {
  const overlay = document.getElementById("globalSearchOverlay");
  const input = document.getElementById("globalSearchPaletteInput");
  if (!overlay || !input) return;
  overlay.classList.add("show");
  overlay.setAttribute("aria-hidden", "false");
  input.value = seed;
  renderGlobalSearchResults();
  requestAnimationFrame(() => input.focus());
}

function closeGlobalSearch() {
  const overlay = document.getElementById("globalSearchOverlay");
  const topInput = document.getElementById("globalSearch");
  if (!overlay) return;
  overlay.classList.remove("show");
  overlay.setAttribute("aria-hidden", "true");
  if (topInput) topInput.value = "";
}

document.querySelector(".search")?.addEventListener("click", () => openGlobalSearch(document.getElementById("globalSearch")?.value || ""));
document.getElementById("globalSearch")?.addEventListener("focus", (event) => openGlobalSearch(event.target.value));
document.getElementById("globalSearch")?.addEventListener("input", (event) => openGlobalSearch(event.target.value));
document.getElementById("globalSearchPaletteInput")?.addEventListener("input", renderGlobalSearchResults);
document.getElementById("closeGlobalSearch")?.addEventListener("click", closeGlobalSearch);
document.getElementById("globalSearchOverlay")?.addEventListener("click", (event) => {
  if (event.target.closest("[data-search-close]")) closeGlobalSearch();
  const item = event.target.closest("[data-search-view]");
  if (!item) return;
  closeGlobalSearch();
  setView(item.dataset.searchView);
});

document.addEventListener("keydown", (event) => {
  const isShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k";
  if (isShortcut) {
    event.preventDefault();
    openGlobalSearch();
  }
  if (event.key === "Escape") closeGlobalSearch();
  if (event.key === "Enter" && document.getElementById("globalSearchOverlay")?.classList.contains("show")) {
    const active = document.querySelector(".search-result-item.active[data-search-view]");
    if (!active || document.activeElement?.id !== "globalSearchPaletteInput") return;
    event.preventDefault();
    closeGlobalSearch();
    setView(active.dataset.searchView);
  }
});

async function initializePortal() {
  // #region debug-point K:initialize-portal-start
  fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"signin-stale-user",runId:"pre-fix",hypothesisId:"K",location:"script.js:initializePortal:start",msg:"[DEBUG] initializePortal started",data:{seedUser:currentUser?.name||"",seedUid:currentUser?.uid||"",theme:localStorage.getItem(THEME_STORAGE_KEY)||""},ts:Date.now()})}).catch(()=>{});
  // #endregion
  applyTheme(localStorage.getItem(THEME_STORAGE_KEY));
  const session = await requirePortalSession();
  if (!session) return;
  mountInventorySubsections();
  mountProcurementSubsections();
  mountRequestSubsections();
  enableDatalistRefocusOptions();
  applyAdminVisibility();
  setView(document.querySelector(".app-shell")?.getAttribute("data-active-view") || "dashboard");
  addRequestLine();
  addItemTypeLine();
  addPoItemLine();
  render();
  await loadNotifications({ silent: true });
  syncAuthState();
  // #region debug-point L:initialize-portal-finish
  fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"signin-stale-user",runId:"pre-fix",hypothesisId:"L",location:"script.js:initializePortal:finish",msg:"[DEBUG] initializePortal finished",data:{currentUserName:currentUser?.name||"",currentUserEmail:currentUser?.email||"",businessDataLoadedForUser,settingsLoadedForUser},ts:Date.now()})}).catch(()=>{});
  // #endregion
}

initializePortal();
