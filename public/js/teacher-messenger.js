"use strict";

(() => {
  const form = document.getElementById("teacher-messenger-form");
  if (!form) return;

  const token = sessionStorage.getItem("teacherToken") || "";
  const el = (id) => document.getElementById(id);
  const state = { settings: null, students: [] };

  const api = async (path, options = {}) => {
    const response = await fetch(path, {
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "تعذر تنفيذ عملية Messenger.");
    return payload;
  };

  function setFeedback(message, isError = false) {
    const target = el("teacher-messenger-feedback");
    if (!target) return;
    target.textContent = message || "";
    target.classList.toggle("is-error", isError);
  }

  function setStatus(message, type = "loading") {
    const badge = el("teacher-messenger-status-badge");
    if (!badge) return;
    badge.textContent = message;
    badge.classList.remove("is-loading", "is-safe", "is-warning", "is-danger");
    badge.classList.add(`is-${type}`);
  }

  function setNumber(id, value) {
    const target = el(id);
    if (target) target.value = value == null ? "" : String(value);
  }

  function updateQuota(quota = {}) {
    [
      ["teacher-messenger-attempted-count", quota.attemptedCount],
      ["teacher-messenger-sent-count", quota.sentCount],
      ["teacher-messenger-skipped-count", quota.skippedCount],
      ["teacher-messenger-remaining-count", quota.remainingCount],
    ].forEach(([id, value]) => {
      const target = el(id);
      if (target) target.textContent = String(Number(value) || 0);
    });
    const warning = el("teacher-messenger-warning-status");
    if (warning) warning.textContent = quota.warningReached ? "اقترب من الحد اليومي" : `${quota.requireRecentInteractionHours || 24} ساعة للتفاعل`;
    const danger = el("teacher-messenger-danger-status");
    if (danger) danger.textContent = quota.paused ? (quota.pauseReason || "متوقف للمراجعة") : "لا توجد أخطاء حرجة";
  }

  function fillSettings(settings = {}) {
    state.settings = settings;
    setNumber("teacher-messenger-daily-warning", settings.dailyWarningLimit ?? 800);
    setNumber("teacher-messenger-daily-hard", settings.dailyHardLimit ?? 1000);
    setNumber("teacher-messenger-interval", settings.minIntervalMs ?? 1000);
    setNumber("teacher-messenger-retries", settings.maxRetries ?? 3);
    setNumber("teacher-messenger-window", settings.requireRecentInteractionHours ?? 24);
    el("teacher-messenger-enabled").checked = settings.enabled !== false;
    el("teacher-messenger-append-confirmation").checked = settings.appendConfirmationRequest !== false;
    el("teacher-messenger-pause-rate-limit").checked = settings.pauseOnRateLimit !== false;
    const safe = el("teacher-messenger-safe-status");
    if (safe) safe.textContent = settings.enabled ? "مفعّل" : "متوقف يدويًا";
  }

  function renderStudents() {
    const list = el("teacher-messenger-student-list");
    if (!list) return;
    if (!state.students.length) {
      list.innerHTML = "<p>لا يوجد تلاميذ في المستوى المختار.</p>";
      return;
    }
    list.innerHTML = state.students.map((student) => {
      const id = String(student.id || "");
      const name = String(student.studentName || "تلميذ دون اسم").replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[char]));
      return `<label class="teacher-messenger-student-option"><input type="checkbox" value="${id}" data-messenger-student><span><strong>${name}</strong><small>${student.paymentStage || (student.paymentStatus ? "PAID" : "UNPAID")}</small></span></label>`;
    }).join("");
  }

  async function loadStudents() {
    const level = el("teacher-messenger-level")?.value || "";
    const list = el("teacher-messenger-student-list");
    if (list) {
      list.hidden = false;
      list.innerHTML = "<p>جارٍ تحميل تلاميذ المستوى…</p>";
    }
    try {
      const payload = await api(`/api/students/level/${encodeURIComponent(level)}`);
      state.students = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
      renderStudents();
    } catch (error) {
      state.students = [];
      if (list) list.innerHTML = `<p>${error.message}</p>`;
    }
  }

  async function loadStatus() {
    if (!token) {
      setStatus("انتهت الجلسة", "danger");
      setFeedback("سجّل الدخول بحساب الأستاذ أولًا.", true);
      return;
    }
    try {
      const payload = await api("/api/messenger/teacher/settings");
      const data = payload.data || {};
      fillSettings(data.settings || {});
      updateQuota(data.quota || {});
      const service = data;
      if (!service.configured) {
        setStatus("غير مهيأ", "warning");
        el("teacher-messenger-safe-status").textContent = "ينقص إعداد Meta";
      } else if (data.settings?.enabled === false) {
        setStatus("متوقف يدويًا", "warning");
      } else if (data.quota?.paused) {
        setStatus("متوقف للمراجعة", "danger");
      } else {
        setStatus("جاهز للإرسال", "safe");
      }
    } catch (error) {
      setStatus("تعذر التحقق", "danger");
      setFeedback(error.message, true);
    }
  }

  function settingsPayload() {
    return {
      enabled: Boolean(el("teacher-messenger-enabled")?.checked),
      dailyWarningLimit: Number(el("teacher-messenger-daily-warning")?.value || 800),
      dailyHardLimit: Number(el("teacher-messenger-daily-hard")?.value || 1000),
      minIntervalMs: Number(el("teacher-messenger-interval")?.value || 1000),
      maxRetries: Number(el("teacher-messenger-retries")?.value || 3),
      requireRecentInteractionHours: Number(el("teacher-messenger-window")?.value || 24),
      appendConfirmationRequest: Boolean(el("teacher-messenger-append-confirmation")?.checked),
      pauseOnRateLimit: Boolean(el("teacher-messenger-pause-rate-limit")?.checked),
    };
  }

  async function saveSettings() {
    const button = el("teacher-messenger-save-settings");
    if (button) button.disabled = true;
    setFeedback("جارٍ حفظ إعدادات الأمان…");
    try {
      const payload = await api("/api/messenger/teacher/settings", { method: "PUT", body: JSON.stringify(settingsPayload()) });
      fillSettings(payload.data || {});
      setStatus("جاهز للإرسال", "safe");
      setFeedback(payload.message || "تم حفظ إعدادات Messenger الآمنة.");
    } catch (error) {
      setFeedback(error.message, true);
    } finally {
      if (button) button.disabled = false;
    }
  }

  function selectedTargetIds() {
    return [...document.querySelectorAll("#teacher-messenger-student-list input[data-messenger-student]:checked")].map((input) => input.value).filter(Boolean);
  }

  async function submit(event) {
    event.preventDefault();
    const targetMode = document.querySelector('input[name="teacher-messenger-target-mode"]:checked')?.value || "ALL_LEVEL";
    const title = el("teacher-messenger-title")?.value.trim() || "";
    const body = el("teacher-messenger-body")?.value.trim() || "";
    const targetStudentIds = selectedTargetIds();
    if (!title || !body) return setFeedback("اكتب عنوان الرسالة ونصها أولًا.", true);
    if (targetMode === "SELECTED" && !targetStudentIds.length) return setFeedback("اختر تلميذًا واحدًا أو مجموعة أولًا.", true);
    const button = el("teacher-messenger-send");
    if (button) button.disabled = true;
    setFeedback("جارٍ إنشاء حملة Messenger والتحقق من المستلمين…");
    try {
      const payload = await api("/api/messenger/teacher/campaigns", {
        method: "POST",
        body: JSON.stringify({
          targetLevel: el("teacher-messenger-level")?.value,
          recipientType: "PARENTS",
          targetMode,
          targetStudentIds,
          paymentFilter: el("teacher-messenger-payment")?.value || "ALL",
          subjectFilter: el("teacher-messenger-subject")?.value || "ALL",
          deliveryChannel: "MESSENGER",
          title,
          body,
          deliveryMode: "IMMEDIATE",
        }),
      });
      setFeedback(`تم إنشاء الحملة. المستلمون المؤهلون: ${Number(payload.recipientCount) || 0}.`);
      el("teacher-messenger-title").value = "";
      el("teacher-messenger-body").value = "";
      await loadStatus();
    } catch (error) {
      setFeedback(error.message, true);
    } finally {
      if (button) button.disabled = false;
    }
  }

  el("teacher-messenger-level")?.addEventListener("change", loadStudents);
  document.querySelectorAll('input[name="teacher-messenger-target-mode"]').forEach((input) => input.addEventListener("change", () => {
    const list = el("teacher-messenger-student-list");
    if (list) list.hidden = input.value !== "SELECTED";
    if (input.checked && input.value === "SELECTED") void loadStudents();
  }));
  el("teacher-messenger-save-settings")?.addEventListener("click", () => void saveSettings());
  form.addEventListener("submit", (event) => void submit(event));
  void loadStatus();
})();
