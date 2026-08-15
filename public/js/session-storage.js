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

  window.enablePushNotifications = async function enablePushNotifications() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) throw new Error("هذا المتصفح لا يدعم إشعارات الهاتف.");
    const token = sessionStorage.getItem("teacherToken") || sessionStorage.getItem("parentToken");
    if (!token) throw new Error("سجّل الدخول أولاً.");
    const registration = await navigator.serviceWorker.register("/sw.js");
    const keyResponse = await fetch("/api/push/public-key", { headers: { Authorization: `Bearer ${token}` } });
    const keyData = await keyResponse.json();
    if (!keyResponse.ok) throw new Error(keyData.error || "إشعارات الهاتف غير مفعلة بعد.");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("لم تسمح بإشعارات الهاتف.");
    const applicationServerKey = Uint8Array.from(atob(keyData.publicKey.replace(/-/g, "+").replace(/_/g, "/")), (char) => char.charCodeAt(0));
    const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
    const response = await fetch("/api/push/subscribe", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(subscription.toJSON()) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "تعذر تفعيل الإشعارات.");
    return data;
  };

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

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
