"use strict";

(() => {
  const banner = document.getElementById("parent-messenger-required-banner");
  if (!banner) return;

  const token = sessionStorage.getItem("parentToken") || "";
  const startButton = document.getElementById("parent-messenger-required-start");
  const note = document.getElementById("parent-messenger-required-note");
  const fallback = document.getElementById("parent-messenger-fallback");
  const fallbackPhrase = document.getElementById("parent-messenger-fallback-phrase");
  const fallbackAction = document.getElementById("parent-messenger-fallback-action");

  const api = async (path, options = {}) => {
    const response = await fetch(path, {
      ...options,
      headers: { Accept: "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "تعذر التحقق من ربط Messenger.");
    return payload;
  };

  function setLoading(loading) {
    if (startButton) startButton.disabled = loading;

  }

  function renderFallbackCode(value) {
    const code = String(value || "").trim();
    if (!/^\d{10}$/.test(code)) {
      if (fallback) fallback.hidden = true;
      return;
    }
    if (fallbackPhrase) fallbackPhrase.textContent = code;
    if (fallbackAction) {
      fallbackAction.textContent = fallbackAction.dataset.copied === "true"
        ? "الانتقال إلى ربط الحساب"
        : "نسخ الرقم";
    }
    if (fallback) fallback.hidden = false;
  }

  function clearFallbackCode() {
    sessionStorage.removeItem("parentMessengerFallbackCode");
    sessionStorage.removeItem("parentMessengerLinkUrl");
    if (fallback) fallback.hidden = true;
    if (fallbackPhrase) fallbackPhrase.textContent = "";
  }

  function isSafeMessengerUrl(value) {
    try {
      const parsed = new URL(String(value || ""), window.location.origin);
      return parsed.protocol === "https:"
        && parsed.hostname === "m.me"
        && Boolean(parsed.searchParams.get("ref"));
    } catch {
      return false;
    }
  }

  function setBlocked(blocked) {
    document.documentElement.classList.toggle("parent-messenger-blocked", blocked);
    banner.classList.toggle("is-blocking", blocked);
  }

  async function refresh() {
    if (!token) return;
    setLoading(true);
    try {
      const payload = await api("/api/messenger/status");
      const data = payload || {};
      if (data.linked) {
        clearFallbackCode();
        setBlocked(false);
        banner.hidden = true;
        return;
      }
      setBlocked(true);
      banner.hidden = false;
      renderFallbackCode(sessionStorage.getItem("parentMessengerFallbackCode"));
      if (note) note.textContent = data.configured
        ? "لا يمكن فتح لوحة الولي أو الحصص قبل اكتمال الربط. اضغط بدء الربط، ثم أرسل الرقم الظاهر إلى الصفحة."
        : "لا يمكن فتح لوحة الولي أو الحصص قبل اكتمال الربط. إعدادات Meta غير مكتملة حاليًا.";
      if (startButton) startButton.disabled = !data.configured;
    } catch (error) {
      setBlocked(true);
      banner.hidden = false;
      if (note) note.textContent = "لا يمكن فتح لوحة الولي أو الحصص حتى يتم التحقق من ربط Messenger. حاول مرة أخرى بعد قليل.";
      if (startButton) startButton.disabled = true;
    } finally {
      if (refreshButton) refreshButton.disabled = false;
    }
  }

  async function start() {
    setLoading(true);
    if (note) note.textContent = "جارٍ إنشاء رابط آمن قصير الصلاحية…";
    try {
      const payload = await api("/api/messenger/link/start", { method: "POST" });
      const fallbackCode = String(payload?.fallbackCode || "").trim();
      if (/^\d{10}$/.test(fallbackCode)) {
        sessionStorage.setItem("parentMessengerFallbackCode", fallbackCode);
        if (fallbackAction) fallbackAction.dataset.copied = "false";
        renderFallbackCode(fallbackCode);
      }
      const url = String(payload?.url || payload?.link || "").trim();
      if (!url) throw new Error("لم يتم استلام رابط Messenger.");
      if (!isSafeMessengerUrl(url)) throw new Error("رابط Messenger المستلم غير صالح أو غير آمن.");
      sessionStorage.setItem("parentMessengerLinkUrl", url);
      // m.me chooses the Messenger app when the device/browser supports it;
      // otherwise the platform may open a browser page.
      window.location.href = url;
    } catch (error) {
      if (note) note.textContent = error.message || "تعذر بدء الربط.";
      setLoading(false);
    }
  }

  startButton?.addEventListener("click", () => void start());
  fallbackAction?.addEventListener("click", async () => {
    const code = String(fallbackPhrase?.textContent || "").trim();
    if (!/^\d{10}$/.test(code)) return;
    if (fallbackAction.dataset.copied === "true") {
      const url = sessionStorage.getItem("parentMessengerLinkUrl") || "";
      if (isSafeMessengerUrl(url)) window.location.href = url;
      return;
    }
    try {
      await navigator.clipboard.writeText(code);
      fallbackAction.dataset.copied = "true";
      fallbackAction.textContent = "الانتقال إلى ربط الحساب";
      if (note) note.textContent = "تم نسخ الرقم. اضغط الزر نفسه للانتقال إلى صفحة ربط الحساب.";
    } catch {
      if (note) note.textContent = `انسخ الرقم يدويًا: ${code}`;
    }
  });
  window.addEventListener("focus", () => void refresh(), { passive: true });
  window.setInterval(() => {
    if (document.visibilityState === "visible") void refresh();
  }, 5_000);
  void refresh();
})();
