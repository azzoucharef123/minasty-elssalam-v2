"use strict";

const messengerToken = sessionStorage.getItem("parentToken") || "";
const messengerApi = async (path, options = {}) => {
  const response = await fetch(path, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${messengerToken}`,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "تعذر تنفيذ عملية Messenger.");
  return data;
};

const messengerElements = {
  card: document.getElementById("messenger-card"),
  badge: document.getElementById("messenger-status-badge"),
  text: document.getElementById("messenger-status-text"),
  start: document.getElementById("messenger-link-start"),
  remove: document.getElementById("messenger-link-remove"),
  instructions: document.getElementById("messenger-link-instructions"),
};

function setMessengerState({ linked = false, configured = true, status = "UNLINKED", pageName = "أستاذ الفيزياء و الرياضيات", linkedAt = null, message = "" } = {}) {
  if (!messengerElements.card) return;
  const pending = !linked && status === "PENDING";
  messengerElements.badge.textContent = linked ? "مرتبط" : !configured ? "غير متاح" : pending ? "قيد الانتظار" : "غير مرتبط";
  messengerElements.badge.classList.toggle("is-connected", linked);
  messengerElements.badge.classList.toggle("is-unavailable", !configured);
  messengerElements.text.textContent = message || (linked
    ? `تم ربط Messenger بصفحة «${pageName}»${linkedAt ? ` منذ ${new Date(linkedAt).toLocaleString("ar-DZ")}` : ""}.`
    : !configured
      ? "ربط Messenger غير متاح حاليًا لأن بيانات Meta لم تُضف إلى الخادم بعد."
      : pending
        ? "تم إنشاء رابط ربط مؤقت. افتحه وأرسل رسالة إلى الصفحة لإكمال الربط."
        : `اربط Messenger لتصلك التنبيهات المسموح بها من صفحة «${pageName}».`);
  messengerElements.start.hidden = linked || !configured;
  messengerElements.remove.hidden = !linked && !pending;
  if (!linked && !pending) messengerElements.remove.hidden = true;
}

async function loadMessengerStatus() {
  try {
    const data = await messengerApi("/api/messenger/status");
    setMessengerState(data);
  } catch (error) {
    setMessengerState({ configured: true, message: error.message });
  }
}

messengerElements.start?.addEventListener("click", async () => {
  messengerElements.start.disabled = true;
  messengerElements.instructions.hidden = true;
  try {
    const data = await messengerApi("/api/messenger/link/start", { method: "POST", body: "{}" });
    setMessengerState({ configured: true, status: "PENDING", pageName: data.pageName });
    messengerElements.instructions.textContent = `${data.instructions} الرابط صالح حتى ${new Date(data.expiresAt).toLocaleTimeString("ar-DZ")}.`;
    messengerElements.instructions.hidden = false;
    window.open(data.link, "_blank", "noopener,noreferrer");
  } catch (error) {
    messengerElements.text.textContent = error.message;
  } finally {
    messengerElements.start.disabled = false;
  }
});

messengerElements.remove?.addEventListener("click", async () => {
  if (!window.confirm("هل تريد فصل Messenger عن حساب Minasaty؟")) return;
  messengerElements.remove.disabled = true;
  try {
    const data = await messengerApi("/api/messenger/link", { method: "DELETE" });
    messengerElements.instructions.hidden = true;
    setMessengerState({ configured: true, message: data.message });
  } catch (error) {
    messengerElements.text.textContent = error.message;
  } finally {
    messengerElements.remove.disabled = false;
  }
});

if (messengerToken) void loadMessengerStatus();
else setMessengerState({ configured: true, message: "انتهت الجلسة. سجّل الدخول أولًا." });
