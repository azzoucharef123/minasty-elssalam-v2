"use strict";

(() => {
  const token = sessionStorage.getItem("teacherToken");
  if (!token) return;

  const $ = (id) => document.getElementById(id);
  const month = $("class-registry-month");
  const subject = $("class-registry-subject");
  const list = $("class-registry-list");
  const modal = $("class-registry-action-modal");
  const form = $("class-registry-action-form");
  const title = $("class-registry-action-title");
  const driveField = $("class-registry-drive-field");
  const driveInput = $("class-registry-drive-link");
  const notesField = $("class-registry-notes-field");
  const notesInput = $("class-registry-notes");
  let currentLevel = document.querySelector(".level-btn.is-active")?.dataset.level || "السنة الأولى";
  let selectedClass = null;

  const labels = {
    MATH: "الرياضيات",
    PHYSICS: "الفيزياء",
    PAID: "اشتراك مدفوع",
    FREE: "اشتراك مجاني",
  };
  const statusLabels = {
    PENDING: "لم تُنجز بعد",
    COMPLETED: "تمت الحصة",
    TEACHER_ABSENT: "غياب الأستاذ",
  };

  async function api(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "تعذر تنفيذ العملية.");
    return payload;
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat("ar-DZ", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date)
      : "تاريخ غير صالح";
  }

  function showError(message) {
    const error = document.querySelector("#dashboard-error, #message-box");
    if (error) {
      error.textContent = message;
      error.hidden = false;
      error.classList.add("is-visible");
    }
  }

  function openAction(item, nextStatus) {
    selectedClass = item;
    form.dataset.status = nextStatus;
    title.textContent = nextStatus === "COMPLETED" ? "تسجيل الحصة كمكتملة" : "تسجيل غياب الأستاذ";
    driveField.hidden = nextStatus !== "COMPLETED";
    notesField.hidden = nextStatus === "PENDING";
    driveInput.value = item.driveLink || "";
    notesInput.value = item.notes || "";
    modal.hidden = false;
    driveField.hidden ? notesInput.focus() : driveInput.focus();
  }

  function closeAction() {
    modal.hidden = true;
    selectedClass = null;
    form.reset();
  }

  function button(text, className, onClick) {
    const element = document.createElement("button");
    element.type = "button";
    element.className = className;
    element.textContent = text;
    element.addEventListener("click", onClick);
    return element;
  }

  function render(items) {
    list.replaceChildren();
    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "class-registry-empty";
      empty.textContent = "لا توجد حصص مسجلة لهذا الشهر والمادة.";
      list.append(empty);
      return;
    }
    items.forEach((item) => {
      const card = document.createElement("article");
      card.className = `class-registry-item status-${item.status.toLowerCase()}`;
      const copy = document.createElement("div");
      copy.className = "class-registry-item-copy";
      const name = document.createElement("strong");
      name.textContent = labels[item.subject] || item.subject;
      const date = document.createElement("span");
      date.textContent = formatDate(item.scheduledAt);
      const status = document.createElement("em");
      status.textContent = statusLabels[item.status] || item.status;
      copy.append(name, date, status);
      const actions = document.createElement("div");
      actions.className = "class-registry-item-actions";
      if (item.status === "COMPLETED") {
        actions.append(button("تعديل التسجيل", "registry-action registry-complete", () => openAction(item, "COMPLETED")));
      } else {
        actions.append(button("تمت الحصة", "registry-action registry-complete", () => openAction(item, "COMPLETED")));
      }
      if (item.status === "TEACHER_ABSENT") {
        actions.append(button("تعديل الملاحظة", "registry-action registry-absent", () => openAction(item, "TEACHER_ABSENT")));
      } else {
        actions.append(button("غياب الأستاذ", "registry-action registry-absent", () => openAction(item, "TEACHER_ABSENT")));
      }
      if (item.status !== "PENDING") {
        actions.append(button("إعادة إلى الانتظار", "registry-action registry-pending", () => update(item, "PENDING")));
      }
      card.append(copy, actions);
      if (item.notes) {
        const note = document.createElement("p");
        note.className = "class-registry-note";
        note.textContent = item.notes;
        card.append(note);
      }
      list.append(card);
    });
  }

  async function load() {
    if (!list || !month || !subject) return;
    list.innerHTML = '<p class="class-registry-loading">جارٍ تحميل سجل الحصص…</p>';
    try {
      const payload = await api(`/api/schedules/registry/${encodeURIComponent(currentLevel)}?month=${encodeURIComponent(month.value)}&subject=${encodeURIComponent(subject.value)}`);
      render(Array.isArray(payload.data) ? payload.data : []);
    } catch (error) {
      list.innerHTML = `<p class="class-registry-empty">${error.message}</p>`;
    }
  }

  async function update(item, status, fields = {}) {
    try {
      await api(`/api/schedules/registry/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, ...fields }),
      });
      closeAction();
      await load();
    } catch (error) {
      showError(error.message);
    }
  }

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!selectedClass) return;
    void update(selectedClass, form.dataset.status, { driveLink: driveInput.value.trim(), notes: notesInput.value.trim() });
  });
  $("class-registry-action-close")?.addEventListener("click", closeAction);
  modal?.addEventListener("click", (event) => { if (event.target === modal) closeAction(); });
  month?.addEventListener("change", () => void load());
  subject?.addEventListener("change", () => void load());
  document.querySelectorAll(".level-btn[data-level]").forEach((button) => button.addEventListener("click", () => { currentLevel = button.dataset.level; window.setTimeout(() => void load(), 0); }));
  window.addEventListener("class-registry-refresh", () => void load());
  void load();
})();
