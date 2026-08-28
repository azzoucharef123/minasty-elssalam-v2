"use strict";

(() => {
  // Temporarily hidden: parent Messenger enforcement is disabled until the
  // linking flow is fully validated. Keep this guard for future reactivation.
  const PARENT_MESSENGER_ENFORCEMENT_ENABLED = false;
  if (!PARENT_MESSENGER_ENFORCEMENT_ENABLED) return;

  const token = sessionStorage.getItem("parentToken") || "";
  if (!token) return;

  const protectedPath = /\/(?:student-live-times-level|student-live)\.html?$/.test(window.location.pathname);
  if (!protectedPath) return;

  const redirectToParentGate = () => {
    if (!window.location.pathname.endsWith("/parent-dashboard.html")) {
      window.location.replace("/parent-dashboard.html?messenger=required");
    }
  };

  window.parentMessengerGatePromise = fetch("/api/messenger/status", {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    cache: "no-store",
  }).then(async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.linked) {
      redirectToParentGate();
      return false;
    }
    return true;
  }).catch(() => {
    redirectToParentGate();
    return false;
  });
})();
