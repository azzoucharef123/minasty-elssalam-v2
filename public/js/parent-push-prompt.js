"use strict";

(() => {
  const DISMISS_KEY = "minasaty-parent-push-prompt-dismissed-v1";
  const DENIED_GUIDANCE_KEY = "minasaty-parent-push-denied-guidance-v1";
  const DISMISS_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

  const prompt = document.getElementById("parent-push-prompt");
  const card = prompt?.querySelector(".parent-push-prompt-card");
  const title = document.getElementById("parent-push-prompt-title");
  const message = document.getElementById("parent-push-prompt-message");
  const status = document.getElementById("parent-push-prompt-status");
  const enableButton = document.getElementById("parent-push-prompt-enable");
  const laterButton = document.getElementById("parent-push-prompt-later");
  const closeButton = document.getElementById("parent-push-prompt-close");
  if (!prompt || !enableButton || !laterButton || !closeButton) return;

  let lastFocusedElement = null;
  let instructionOnly = false;

  function getParentToken() {
    return sessionStorage.getItem("parentToken");
  }

  function isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  function isStandalone() {
    return window.matchMedia?.("(display-mode: standalone)")?.matches || navigator.standalone === true;
  }

  function supportsPush() {
    return Boolean(
      window.isSecureContext &&
      "Notification" in window &&
      "serviceWorker" in navigator &&
      "PushManager" in window,
    );
  }

  function wasDismissedRecently() {
    try {
      const dismissedAt = Number(localStorage.getItem(DISMISS_KEY));
      return Number.isFinite(dismissedAt) && Date.now() - dismissedAt < DISMISS_COOLDOWN_MS;
    } catch {
      return false;
    }
  }

  function rememberDismissal() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Private browsing may block storage; the prompt still works for this page view.
    }
  }

  function rememberDeniedGuidance() {
    try {
      localStorage.setItem(DENIED_GUIDANCE_KEY, "1");
    } catch {
      // Private browsing may block storage; the current page can still show the guidance.
    }
  }

  function wasDeniedGuidanceShown() {
    try {
      return localStorage.getItem(DENIED_GUIDANCE_KEY) === "1";
    } catch {
      return false;
    }
  }

  function setStatus(text, kind = "info") {
    if (!status) return;
    status.textContent = text;
    status.dataset.kind = kind;
    status.hidden = !text;
  }

  function setPromptContent() {
    instructionOnly = !supportsPush();
    if (instructionOnly) {
      title.textContent = "تنبيهات الحصص على هاتفك";
      if (isIOS() && !isStandalone()) {
        message.textContent = "في Safari على iPhone أو iPad، أضف المنصة إلى الشاشة الرئيسية أولًا، ثم افتحها من أيقونتها وفعّل التنبيهات من هناك.";
        setStatus("من قائمة Safari اضغط «مشاركة» ثم «إضافة إلى الشاشة الرئيسية». بعد فتح التطبيق من الشاشة الرئيسية ستظهر إمكانية التفعيل.", "warning");
      } else {
        message.textContent = "هذا المتصفح لا يتيح تنبيهات Push لهذه الصفحة. افتح المنصة عبر Chrome أو Safari حديث وباتصال HTTPS، ثم جرّب مرة أخرى.";
        setStatus("يمكنك متابعة استخدام لوحة الولي بشكل عادي؛ التنبيهات اختيارية ولا تمنع الدخول.", "warning");
      }
      enableButton.hidden = true;
      laterButton.textContent = "فهمت";
      return;
    }

    title.textContent = "لا تفوّت بداية حصتك";
    message.textContent = "فعّل تنبيهات المنصة لتصلك تنبيهات بداية الحصص والرسائل المهمة من الأستاذ.";
    setStatus("");
    enableButton.hidden = false;
    enableButton.disabled = false;
    enableButton.textContent = "تفعيل تنبيهات الحصص";
    laterButton.textContent = "ليس الآن";
  }

  function showPrompt() {
    if (prompt.hidden === false) return;
    setPromptContent();
    lastFocusedElement = document.activeElement;
    prompt.hidden = false;
    document.body.classList.add("parent-push-prompt-open");
    window.setTimeout(() => (instructionOnly ? laterButton : enableButton).focus(), 30);
  }

  function hidePrompt({ remember = false } = {}) {
    if (remember) rememberDismissal();
    prompt.hidden = true;
    document.body.classList.remove("parent-push-prompt-open");
    if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
      lastFocusedElement.focus({ preventScroll: true });
    }
    lastFocusedElement = null;
  }

  function showDeniedState() {
    title.textContent = "تنبيهات المنصة غير مفعّلة";
    message.textContent = "رفض المتصفح إذن التنبيهات. يمكنك إعادة تفعيلها لاحقًا من إعدادات الموقع في Chrome أو Safari.";
    setStatus("لأسباب أمنية لا يستطيع الموقع إعادة فتح نافذة الإذن بعد رفضها تلقائيًا. افتح إعدادات الموقع، اسمح بالتنبيهات، ثم أعد تحميل الصفحة.", "warning");
    enableButton.hidden = true;
    enableButton.disabled = true;
    laterButton.textContent = "إغلاق";
  }

  async function enableParentClassNotifications() {
    if (!supportsPush()) throw new Error("هذا المتصفح لا يدعم تنبيهات Push لهذه الصفحة.");
    if (!getParentToken()) throw new Error("انتهت جلسة الولي. يرجى تسجيل الدخول من جديد.");

    const permission = Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();
    if (permission !== "granted") {
      if (permission === "denied") showDeniedState();
      throw new Error(permission === "denied" ? "تم رفض إذن التنبيهات من المتصفح." : "لم يتم اختيار السماح بالتنبيهات.");
    }

    const result = await window.enablePushNotifications({ requestPermission: false });
    try {
      localStorage.setItem("minasaty-parent-push-enabled-v1", String(Date.now()));
    } catch {
      // The server subscription is the source of truth; storage is only a UX hint.
    }
    return result;
  }

  async function handleEnable() {
    if (instructionOnly || enableButton.disabled) return;
    enableButton.disabled = true;
    enableButton.textContent = "جارٍ تفعيل التنبيهات…";
    setStatus("سيظهر الآن طلب الإذن الأصلي من Chrome أو Safari. اختر «السماح» لتسجيل هذا الجهاز.", "info");

    try {
      await enableParentClassNotifications();
      setStatus("تم تفعيل تنبيهات الحصص على هذا الجهاز بنجاح.", "success");
      window.setTimeout(() => hidePrompt(), 900);
    } catch (error) {
      enableButton.disabled = false;
      enableButton.textContent = "المحاولة مرة أخرى";
      if (Notification.permission === "denied") showDeniedState();
      else setStatus(error?.message || "تعذر تفعيل التنبيهات حاليًا. يمكنك المحاولة مرة أخرى.", "error");
    }
  }

  function maybeShowPrompt() {
    const token = getParentToken();
    if (!token || !prompt.hidden) return;
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") return;
    if (Notification.permission === "denied") {
      if (wasDeniedGuidanceShown() || wasDismissedRecently()) return;
      showPrompt();
      showDeniedState();
      rememberDeniedGuidance();
      return;
    }
    if (wasDismissedRecently()) return;
    showPrompt();
  }

  enableButton.addEventListener("click", () => { void handleEnable(); });
  laterButton.addEventListener("click", () => hidePrompt({ remember: true }));
  closeButton.addEventListener("click", () => hidePrompt({ remember: true }));
  prompt.addEventListener("click", (event) => {
    if (event.target === prompt) hidePrompt({ remember: true });
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !prompt.hidden) hidePrompt({ remember: true });
  });
  window.addEventListener("parent-dashboard-ready", maybeShowPrompt);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && Notification.permission === "granted") hidePrompt();
  });

  // The dashboard dispatches parent-dashboard-ready after its authenticated load.
  // The delayed fallback also covers cached pages and multi-student selection states.
  window.setTimeout(maybeShowPrompt, 1200);
})();
