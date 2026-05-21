const STORAGE_KEY = "imsPortalStateV4";
let seedTxCounter = 0;

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
let inventoryPage = 1;
const INVENTORY_PAGE_SIZE = 15;

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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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

function money(value) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
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

function renderDashboard() {
  const allItems = state.requests.flatMap((request) => request.items.map((item) => ({ ...item, request })));
  document.getElementById("kpiRequests").textContent = state.requests.length;
  document.getElementById("kpiPendingApprovals").textContent = allItems.filter((item) => item.approvalStatus === "Pending").length;
  document.getElementById("kpiPendingIssue").textContent = allItems.filter((item) => item.approvalStatus === "Approved" && item.issuanceStatus !== "Issued").length;
  document.getElementById("kpiLowStock").textContent = stockRows().filter((row) => row.status !== "OK").length;
  document.getElementById("kpiPO").textContent = state.purchaseOrders.length;
  document.getElementById("kpiGRN").textContent = state.purchaseOrders.filter((po) => po.status !== "Closed").length;
  document.getElementById("kpiTransport").textContent = state.transportRequests.filter((row) => row.arrangementStatus === "Pending").length;
  document.getElementById("kpiAudit").textContent = state.auditLogs.length;
}

function renderRequests() {
  document.getElementById("requestsTable").innerHTML = state.requests.flatMap((request) => request.items.map((item) => `
    <tr>
      <td>${request.requestId}</td><td>${request.requester}</td><td>${request.department}</td><td>${request.location}</td>
      <td>${item.itemCode}</td><td>${item.itemName}</td><td>${item.type || ""}</td><td>${item.quantity}</td>
      <td>${statusBadge(item.approvalStatus)}</td><td>${statusBadge(item.issuanceStatus)}</td><td>${new Date(request.date).toLocaleDateString()}</td>
    </tr>`)).join("") || emptyRow(11);
}

function renderInventory() {
  const rows = stockRows().filter((row) => {
    const matchesCategory = inventoryCategoryFilter === "All" || row.category === inventoryCategoryFilter;
    const matchesLocation = inventoryLocationFilter === "All" || row.location === inventoryLocationFilter;
    return matchesCategory && matchesLocation;
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
  printHtml(`<h1>Purchase Order ${po.poNumber}</h1><p>Issue Date: ${formatDate(po.issueDate || po.date)}</p><p>Vendor: ${po.vendorName}</p><p>Specifications: ${po.specifications || po.description || po.itemCode || ""}</p><p>Quantity Ordered: ${money(po.quantityOrdered ?? po.quantity)}</p><p>Unit Price: ${money(po.unitPrice)}</p><p>PO Amount: ${money(po.poAmount ?? po.total)}</p><p>Status: ${po.status}</p>`);
};

function printHtml(html) {
  const printWindow = window.open("", "_blank", "width=800,height=700");
  printWindow.document.write(`<html><head><title>Print</title><style>body{font-family:Arial;padding:32px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ddd;padding:8px}</style></head><body>${html}</body></html>`);
  printWindow.document.close();
  printWindow.print();
}

document.getElementById("sideNav").addEventListener("click", (event) => {
  const item = event.target.closest("[data-view]");
  if (item) setView(item.dataset.view);
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

document.getElementById("addRequestItem").addEventListener("click", addRequestLine);
document.getElementById("addItemType").addEventListener("click", addItemTypeLine);
document.getElementById("openItemModal").addEventListener("click", openItemModal);
document.getElementById("closeItemModal").addEventListener("click", closeItemModal);
document.getElementById("cancelItemModal").addEventListener("click", closeItemModal);
document.getElementById("itemModal").addEventListener("click", (event) => {
  if (event.target.id === "itemModal") closeItemModal();
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
  form.elements.poAmount.value = money(quantity * unitPrice);
}

document.getElementById("poForm").elements.quantityOrdered.addEventListener("input", updatePOAmount);
document.getElementById("poForm").elements.unitPrice.addEventListener("input", updatePOAmount);

document.getElementById("requestForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const existingLineCount = state.requests.flatMap((request) => request.items).length;
  const rows = [...document.querySelectorAll("#requestItems .line-row")].map((row, index) => {
    const itemCode = row.querySelector("[name='itemCode']").value;
    const item = findItem(itemCode);
    return {
      id: `RI-${String(existingLineCount + index + 1).padStart(3, "0")}`,
      itemCode,
      itemName: item.name,
      type: item.type,
      quantity: Number(row.querySelector("[name='quantity']").value),
      approvalStatus: "Pending",
      issuanceStatus: "Pending"
    };
  });
  if (!rows.length) return showToast("Add at least one item.", "error");
  const requestId = nextId("REQ", state.requests.map((request) => ({ requestId: request.requestId })));
  state.requests.unshift({
    requestId,
    date: new Date().toISOString(),
    requester: form.get("requester"),
    department: form.get("department"),
    location: form.get("location"),
    managerEmail: form.get("managerEmail"),
    requesterEmail: form.get("requesterEmail"),
    items: rows
  });
  audit("CREATE_REQUEST", "request", requestId, `${rows.length} item line(s) submitted`);
  event.currentTarget.reset();
  document.getElementById("requestItems").innerHTML = "";
  addRequestLine();
  saveState();
  render();
  showToast(`${requestId} created.`);
});

document.getElementById("stockInForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const entry = {
    id: nextId("TX", state.transactions),
    itemCode: form.get("itemCode"),
    location: form.get("location"),
    type: "STOCK_IN_MANUAL",
    quantity: Number(form.get("quantity")),
    sourceId: "manual",
    notes: form.get("notes"),
    performedBy: "Inventory Manager",
    date: new Date().toISOString()
  };
  state.transactions.unshift(entry);
  audit("MANUAL_STOCK_IN", "stock_transaction", entry.id, `${entry.quantity} ${entry.itemCode} to ${entry.location}`);
  event.currentTarget.reset();
  saveState();
  render();
  showToast("Manual stock-in saved.");
});

document.getElementById("manualStockOutForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const itemCode = form.get("itemCode");
  const location = form.get("location");
  const quantity = Number(form.get("quantity"));
  const available = stockFor(itemCode, location);
  if (!quantity || quantity < 1) return showToast("Stock out quantity must be greater than zero.", "error");
  if (available < quantity) return showToast("Stock unavailable for this manual stock out.", "error");
  const entry = {
    id: nextId("TX", state.transactions),
    itemCode,
    location,
    type: "STOCK_OUT",
    quantity,
    sourceId: "manual",
    notes: form.get("notes"),
    performedBy: form.get("issuedBy") || "Inventory Manager",
    date: new Date().toISOString()
  };
  state.transactions.unshift(entry);
  audit("MANUAL_STOCK_OUT", "stock_transaction", entry.id, `${entry.quantity} ${entry.itemCode} from ${entry.location}`);
  event.currentTarget.reset();
  saveState();
  render();
  showToast("Manual stock-out saved.");
});

document.getElementById("itemForm").addEventListener("submit", (event) => {
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
  rows.forEach((row) => {
    state.items.push({
      code: row.code,
      name,
      type: row.type,
      category,
      reorderLevel: 0,
      unit,
      active: true
    });
  });
  audit("CREATE_ITEM", "item", rows.map((row) => row.code).join(", "), `${rows.length} item type(s) created for ${name}`);
  event.currentTarget.reset();
  document.getElementById("itemTypeRows").innerHTML = "";
  addItemTypeLine();
  closeItemModal();
  saveState();
  render();
  showToast("Inventory item added.");
});

document.getElementById("poForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const vendor = state.vendors.find((row) => row.id === form.get("vendorId"));
  const quantityOrdered = Number(form.get("quantityOrdered"));
  const unitPrice = Number(form.get("unitPrice"));
  const quantityReceived = Number(form.get("quantityReceived")) || 0;
  const poNumber = String(form.get("poNumber") || "").trim() || nextId("PO", state.purchaseOrders.map((po) => ({ poNumber: po.poNumber })));
  if (!vendor) return showToast("Select a vendor.", "error");
  if (!quantityOrdered || quantityOrdered <= 0) return showToast("Quantity ordered must be greater than zero.", "error");
  if (quantityReceived > quantityOrdered) return showToast("Quantity received cannot exceed quantity ordered.", "error");
  if (state.purchaseOrders.some((po) => String(po.poNumber).toLowerCase() === poNumber.toLowerCase())) {
    return showToast("PO number already exists.", "error");
  }
  state.purchaseOrders.unshift({
    poNumber,
    vendorId: vendor.id,
    vendorName: vendor.name,
    issueDate: form.get("issueDate") || new Date().toISOString().slice(0, 10),
    specifications: String(form.get("specifications")).trim(),
    quantityOrdered,
    unitPrice,
    poAmount: quantityOrdered * unitPrice,
    status: form.get("status"),
    arrivedBy: form.get("arrivedBy"),
    location: form.get("location"),
    quantityReceived,
    notesRemarks: form.get("notesRemarks"),
    date: new Date().toISOString()
  });
  audit("CREATE_PO", "purchase_order", poNumber, "PO created; no stock movement posted");
  event.currentTarget.reset();
  updatePOAmount();
  saveState();
  render();
  showToast(`${poNumber} created without changing stock.`);
});

document.getElementById("grnForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const accepted = Number(form.get("qtyAccepted"));
  const received = Number(form.get("qtyReceived"));
  if (accepted > received) return showToast("Accepted quantity cannot exceed received quantity.", "error");
  const grnNumber = nextId("GRN", state.grns.map((grn) => ({ grnNumber: grn.grnNumber })));
  const grn = {
    grnNumber,
    poNumber: form.get("poNumber"),
    itemCode: form.get("itemCode"),
    location: form.get("location"),
    qtyReceived: received,
    qtyAccepted: accepted,
    receivedBy: form.get("receivedBy"),
    notes: form.get("notes"),
    date: new Date().toISOString()
  };
  state.grns.unshift(grn);
  if (accepted > 0) {
    state.transactions.unshift({
      id: nextId("TX", state.transactions),
      itemCode: grn.itemCode,
      location: grn.location,
      type: "GRN_STOCK_IN",
      quantity: accepted,
      sourceId: grnNumber,
      notes: `GRN receipt ${grnNumber}`,
      performedBy: grn.receivedBy,
      date: new Date().toISOString()
    });
  }
  audit("CREATE_GRN", "grn", grnNumber, `${accepted} accepted for ${grn.itemCode}`);
  event.currentTarget.reset();
  saveState();
  render();
  showToast(`${grnNumber} saved and stock ledger updated.`);
});

document.getElementById("vendorForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const id = nextId("VEN", state.vendors);
  state.vendors.push({ id, name: form.get("name"), phone: form.get("phone"), contact: form.get("contact"), address: form.get("address") });
  audit("CREATE_VENDOR", "vendor", id, form.get("name"));
  event.currentTarget.reset();
  saveState();
  render();
  showToast("Vendor added.");
});

document.getElementById("exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "ims-export.json";
  link.click();
  URL.revokeObjectURL(url);
});

document.getElementById("globalSearch").addEventListener("input", (event) => {
  const term = event.target.value.toLowerCase();
  document.querySelectorAll("tbody tr").forEach((row) => {
    row.style.display = row.textContent.toLowerCase().includes(term) ? "" : "none";
  });
});

addRequestLine();
addItemTypeLine();
render();
