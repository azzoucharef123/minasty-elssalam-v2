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

  fetch("/api/auth/sessions", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    credentials: "same-origin",
  })
    .then((response) => {
      if (!response.ok) throw new Error("SESSION_NOT_VALID");
      return response.json();
    })
    .then(() => window.location.replace(target))
    .catch(() => {
      // Invalid or revoked sessions stay on the login/landing page so the user can sign in again.
    });
})();
