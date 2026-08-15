"use strict";

(() => {
  const persistentKeys = new Set([
    "teacherToken",
    "teacherAuth",
    "parentToken",
    "parentPhone",
    "userRole",
    "selectedStudentId",
    "parentStudents",
    "studentName",
    "level",
    "studentLevel",
    "studentId",
    "currentStudent",
    "currentStudentName",
    "currentStudentLevel",
    "loggedInStudent",
    "student",
  ]);

  const originalGetItem = Storage.prototype.getItem;
  const originalSetItem = Storage.prototype.setItem;
  const originalRemoveItem = Storage.prototype.removeItem;

  persistentKeys.forEach((key) => {
    const sessionValue = originalGetItem.call(sessionStorage, key);
    const localValue = originalGetItem.call(localStorage, key);
    if (sessionValue === null && localValue !== null) {
      originalSetItem.call(sessionStorage, key, localValue);
    }
  });

  Storage.prototype.setItem = function setItem(key, value) {
    originalSetItem.call(this, key, value);
    if (this === sessionStorage && persistentKeys.has(key)) {
      originalSetItem.call(localStorage, key, value);
    }
  };

  Storage.prototype.removeItem = function removeItem(key) {
    originalRemoveItem.call(this, key);
    if (this === sessionStorage && persistentKeys.has(key)) {
      originalRemoveItem.call(localStorage, key);
    }
  };

  Storage.prototype.getItem = function getItem(key) {
    const value = originalGetItem.call(this, key);
    if (this === sessionStorage && value === null && persistentKeys.has(key)) {
      return originalGetItem.call(localStorage, key);
    }
    return value;
  };

  window.revokeServerSession = function revokeServerSession() {
    const token = sessionStorage.getItem("teacherToken") || sessionStorage.getItem("parentToken");
    if (!token) return Promise.resolve();
    return fetch("/api/auth/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      keepalive: true,
    }).catch(() => {});
  };
})();
