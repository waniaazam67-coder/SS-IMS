const PERMISSIONS = Object.freeze({
  MANAGE_SETTINGS: "setting.manage",
  MANAGE_USERS: "user.manage",
  MANAGE_ROLES: "role.manage",
  MANAGE_INVENTORY: "inventory.manage",
  VIEW_INVENTORY: "inventory.view",
  CREATE_REQUESTS: "request.create",
  ISSUE_STOCK: "inventory.issue",
  APPROVE_REQUESTS: "request.approve",
  MANAGE_PURCHASE_ORDERS: "purchase_order.manage",
  APPROVE_PURCHASE_ORDERS: "purchase_order.approve",
  MANAGE_GRNS: "grn.manage",
  VIEW_AUDIT_LOGS: "audit.view"
});

module.exports = {
  PERMISSIONS
};
