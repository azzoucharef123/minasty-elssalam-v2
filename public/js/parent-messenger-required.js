"use strict";

(() => {
  const banner = document.getElementById("parent-messenger-required-banner");
  if (!banner) return;

  const token = sessionStorage.getItem("parentToken") || "";
  const startButton = document.getElementById("parent-messenger-required-start");
  const refreshButton = document.getElementById("parent-messenger-required-refresh");
  const note = document.getElementById("parent-messenger-required-note");
  const fallback = document.getElementById("parent-messenger-fallback");
  const fallbackPhrase = document.getElementById("parent-messenger-fallback-phrase");
  const fallbackCopy = document.getElementById("parent-messenger-fallback-copy");

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
    if (refreshButton) refreshButton.disabled = loading;
  }

  function renderFallbackPhrase(value) {
    const phrase = String(value || "").trim();
    if (!/^تم \d{8}$/.test(phrase)) {
      if (fallback) fallback.hidden = true;
      return;
    }
    if (fallbackPhrase) fallbackPhrase.textContent = phrase;
    if (fallback) fallback.hidden = false;
  }

  function clearFallbackPhrase() {
    sessionStorage.removeItem("parentMessengerFallbackPhrase");
    if (fallback) fallback.hidden = true;
    if (fallbackPhrase) fallbackPhrase.textContent = "";
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
        clearFallbackPhrase();
        setBlocked(false);
        banner.hidden = true;
        return;
      }
      setBlocked(true);
      banner.hidden = false;
      renderFallbackPhrase(sessionStorage.getItem("parentMessengerFallbackPhrase"));
      if (note) note.textContent = data.configured
        ? "لا يمكن فتح لوحة الولي أو الحصص قبل اكتمال الربط. اضغط بدء الربط، ثم أرسل رسالة إلى الصفحة."
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
      if (/^\d{8}$/.test(fallbackCode)) {
        sessionStorage.setItem("parentMessengerFallbackPhrase", `تم ${fallbackCode}`);
        renderFallbackPhrase(`تم ${fallbackCode}`);
      }
      const url = String(payload?.url || payload?.link || "").trim();
      if (!url) throw new Error("لم يتم استلام رابط Messenger.");
      let parsedUrl;
      try { parsedUrl = new URL(url, window.location.origin); } catch { throw new Error("رابط Messenger المستلم غير صالح."); }
      if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== "m.me" || !parsedUrl.searchParams.get("ref")) {
        throw new Error("رابط Messenger المستلم غير صالح أو غير آمن.");
      }
      // m.me chooses the Messenger app when the device/browser supports it;
      // otherwise the platform may open a browser page.
      window.location.href = url;
    } catch (error) {
      if (note) note.textContent = error.message || "تعذر بدء الربط.";
      setLoading(false);
    }
  }

  startButton?.addEventListener("click", () => void start());
  refreshButton?.addEventListener("click", () => void refresh());
  fallbackCopy?.addEventListener("click", async () => {
    const phrase = String(fallbackPhrase?.textContent || "").trim();
    if (!phrase) return;
    try {
      await navigator.clipboard.writeText(phrase);
      if (note) note.textContent = "تم نسخ عبارة الربط. أرسلها إلى صفحة Messenger من نفس الحساب.";
    } catch {
      if (note) note.textContent = `انسخ يدويًا العبارة: ${phrase}`;
    }
  });
  window.addEventListener("focus", () => void refresh(), { passive: true });
  void refresh();
})();
