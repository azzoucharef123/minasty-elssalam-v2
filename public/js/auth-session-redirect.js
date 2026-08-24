"use strict";

(() => {
  const currentPath = window.location.pathname;
  const isEntryPage = /\/(?:index|parent-login|teacher-login)\.html?$/.test(currentPath) || currentPath === "/";
  if (!isEntryPage) return;

  const read = (key) => {
    try {
      return sessionStorage.getItem(key) || localStorage.getItem(key) || "";
    } catch {
      return "";
    }
  };

  const role = read("userRole") || (read("teacherToken") ? "teacher" : read("parentToken") ? "parent" : "");
  const token = role === "teacher" ? read("teacherToken") : role === "parent" ? read("parentToken") : "";
  if (!token) return;

  const target = role === "teacher" ? "./teacher-dashboard.html" : role === "parent" ? "./parent-dashboard.html" : "";
  if (!target || currentPath.endsWith(target.slice(1))) return;

  if (role === "parent" && read("forceParentPinChange") === "1") {
    window.location.replace("./force-pin.html");
    return;
  }

  fetch("/api/auth/sessions", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    credentials: "same-origin",
  })
    .then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (response.status === 428 && payload.code === "PARENT_PIN_CHANGE_REQUIRED" && role === "parent") {
        try { sessionStorage.setItem("forceParentPinChange", "1"); } catch {}
        return { forcePinChange: true };
      }
      if (!response.ok) throw new Error("SESSION_NOT_VALID");
      return { forcePinChange: false };
    })
    .then(({ forcePinChange }) => window.location.replace(forcePinChange ? "./force-pin.html" : target))
    .catch(() => {
      // Invalid or revoked sessions stay on the login/landing page so the user can sign in again.
    });
})();
