(function () {
  const MAX_VISIBLE_TOASTS = 5;
  const AUTO_DISMISS_MS = 20000;
  const REMOVE_ANIMATION_MS = 240;
  const toasts = [];
  let container = null;

  const TYPE_ICONS = {
    success: "check-circle-2",
    info: "bell",
    warning: "triangle-alert",
    error: "circle-alert",
    approval: "clipboard-check",
    requisition: "file-text"
  };

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;"
    }[char]));
  }

  function ensureContainer() {
    if (container) return container;
    container = document.createElement("div");
    container.className = "notification-toast-region";
    container.setAttribute("role", "region");
    container.setAttribute("aria-label", "Real-time notifications");
    container.setAttribute("aria-live", "polite");
    container.setAttribute("aria-relevant", "additions");
    document.body.appendChild(container);
    return container;
  }

  function notificationType(notification = {}) {
    const raw = String(notification.type || notification.metadata?.type || notification.entityType || "").toLowerCase();
    if (raw.includes("success") || raw.includes("approved") || raw.includes("grn")) return "success";
    if (raw.includes("warn") || raw.includes("low") || raw.includes("stock")) return "warning";
    if (raw.includes("error") || raw.includes("reject") || raw.includes("cancel")) return "error";
    if (raw.includes("approval")) return "approval";
    if (raw.includes("requisition") || raw.includes("request")) return "requisition";
    return "info";
  }

  function notificationTime(notification = {}) {
    const value = notification.createdAt || notification.created_at || notification.time;
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return "Just now";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function removeToast(id) {
    const index = toasts.findIndex((toast) => toast.id === id);
    if (index === -1) return;
    const toast = toasts[index];
    window.clearTimeout(toast.timer);
    toast.element.classList.add("is-removing");
    window.setTimeout(() => {
      toast.element.remove();
      const currentIndex = toasts.findIndex((row) => row.id === id);
      if (currentIndex !== -1) toasts.splice(currentIndex, 1);
    }, REMOVE_ANIMATION_MS);
  }

  function enforceLimit() {
    while (toasts.length > MAX_VISIBLE_TOASTS) {
      removeToast(toasts[toasts.length - 1].id);
    }
  }

  function show(notification = {}, options = {}) {
    const host = ensureContainer();
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const type = notificationType(notification);
    const icon = TYPE_ICONS[type] || TYPE_ICONS.info;
    const title = notification.title || "IMS notification";
    const message = notification.message || notification.body || "";
    const element = document.createElement("article");
    element.className = `notification-toast notification-toast-${type}`;
    element.tabIndex = 0;
    element.setAttribute("role", "status");
    element.setAttribute("aria-label", `${title}. ${message}`);
    element.innerHTML = `
      <div class="notification-toast-icon" aria-hidden="true"><i data-lucide="${icon}"></i></div>
      <button class="notification-toast-content" type="button">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(message)}</span>
        <time>${escapeHtml(notificationTime(notification))}</time>
      </button>
      <button class="notification-toast-close" type="button" aria-label="Dismiss notification">
        <i data-lucide="x"></i>
      </button>
    `;

    const timer = window.setTimeout(() => removeToast(id), AUTO_DISMISS_MS);
    const toast = { id, element, timer };
    toasts.unshift(toast);
    host.prepend(element);
    enforceLimit();

    element.querySelector(".notification-toast-close")?.addEventListener("click", (event) => {
      event.stopPropagation();
      removeToast(id);
    });
    element.querySelector(".notification-toast-content")?.addEventListener("click", () => {
      if (typeof options.onOpen === "function") options.onOpen(notification);
      removeToast(id);
    });
    element.addEventListener("keydown", (event) => {
      if (event.key === "Escape" || event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        removeToast(id);
      }
    });

    if (window.lucide) lucide.createIcons();
    return id;
  }

  window.IMSNotificationToastManager = {
    show,
    dismiss: removeToast
  };
})();
