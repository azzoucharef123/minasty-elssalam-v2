"use strict";

(() => {
  const token = sessionStorage.getItem("parentToken");
  if (!token) return;

  const $ = (id) => document.getElementById(id);
  const list = $("parent-class-registry-list");
  const upsell = $("registry-upsell-modal");
  const studentName = () => JSON.parse(sessionStorage.getItem("currentStudent") || "null")?.studentName || sessionStorage.getItem("studentName") || "التلميذ";
  let activeStudent = null;
  let month = "2026-09";
  let subject = "MATH";

  const statusLabels = { PENDING: "لم تُنجز بعد", COMPLETED: "تمت الحصة", TEACHER_ABSENT: "غياب الأستاذ" };
  const subjectLabels = { MATH: "الرياضيات", PHYSICS: "الفيزياء" };

  function getStoredStudent() {
    try { return JSON.parse(sessionStorage.getItem("currentStudent") || "null"); } catch { return null; }
  }

  async function api(path) {
    const response = await fetch(path, { headers: { Accept: "application/json", Authorization: `Bearer ${token}` } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "تعذر تحميل سجل الحصص.");
    return payload;
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("ar-DZ", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Algiers" }).format(date) : "تاريخ غير صالح";
  }

  function openUpsell() {
    upsell.hidden = false;
    document.body.style.overflow = "hidden";
    $("registry-upsell-close")?.focus();
  }

  function closeUpsell() {
    upsell.hidden = true;
    document.body.style.overflow = "";
  }

  function isSafeYouTubeEmbedUrl(value) {
    const url = String(value || "");
    return /^https:\/\/www\.youtube\.com\/embed\/[A-Za-z0-9_-]{11}.*$/.test(url);
  }

  function openVideo(item) {
    const modal = $("#lesson-video-modal");
    const frame = $("#lesson-video-frame");
    const videoUrl = isSafeYouTubeEmbedUrl(item.youtubeEmbedUrl) ? item.youtubeEmbedUrl : item.previewUrl;
    if (!modal || !frame || !videoUrl) return;
    $("#lesson-video-modal-title").textContent = `${subjectLabels[item.subject] || "الحصة"} · ${formatDate(item.scheduledAt)}`;
    $("#lesson-video-sidebar-title").textContent = subjectLabels[item.subject] || "مشاهدة الحصة";
    $("#lesson-video-sidebar-meta").textContent = `${formatDate(item.scheduledAt)} · مشاهدة داخل المنصة`;
    // Ensure YouTube embeds have full permissions
    if (videoUrl.includes("youtube.com")) {
      frame.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share");
      frame.setAttribute("allowfullscreen", "true");
      frame.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    } else {
      frame.removeAttribute("allow");
      frame.removeAttribute("allowfullscreen");
      frame.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    }
    
    frame.src = videoUrl;
    frame.setAttribute("title", item.youtubeVideoId ? "فيديو YouTube داخل الأكاديمية" : "فيديو الحصة المسجلة");
    modal.hidden = false;
    document.body.classList.add("lesson-video-open");
  }

  function render(items) {
    list.replaceChildren();
    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "class-registry-empty";
      empty.textContent = `لا توجد حصص مبرمجة في ${subjectLabels[subject] || "هذه المادة"} لهذا الشهر.`;
      list.append(empty);
      return;
    }
    items.forEach((item) => {
      const card = document.createElement("article");
      card.className = `class-registry-item status-${item.status.toLowerCase()} ${item.canWatch ? "is-authorized" : "is-locked"}`;
      const copy = document.createElement("div");
      copy.className = "class-registry-item-copy";
      const title = document.createElement("strong");
      title.textContent = subjectLabels[item.subject] || item.subject;
      const date = document.createElement("span");
      date.textContent = formatDate(item.scheduledAt);
      const status = document.createElement("em");
      status.textContent = statusLabels[item.status] || item.status;
      copy.append(title, date, status);
      const action = document.createElement("button");
      action.type = "button";
      action.className = item.canWatch ? "registry-watch-button" : "registry-lock-button";
      action.textContent = item.status === "COMPLETED" ? (item.canWatch ? "▶ مشاهدة التسجيل داخل الأكاديمية" : "🔒 ترقية للمشاهدة") : item.status === "TEACHER_ABSENT" ? "عرض ملاحظة الغياب" : "في انتظار إنجاز الحصة";
      action.disabled = item.status === "PENDING";
      action.addEventListener("click", () => {
        if (item.status === "TEACHER_ABSENT") return;
        if (!item.canWatch) openUpsell();
        else openVideo(item);
      });
      card.append(copy, action);
      if (item.notes) {
        const note = document.createElement("p");
        note.className = "class-registry-note";
        note.textContent = item.notes;
        card.append(note);
      }
      list.append(card);
    });
  }

  function showSelectionPrompt() {
    if (!list) return;
    list.replaceChildren();
    const prompt = document.createElement("p");
    prompt.className = "class-registry-empty";
    prompt.textContent = !month && !subject
      ? "اختر الشهر والمادة لعرض الحصص."
      : !month
        ? "اختر الشهر لعرض حصص المادة المحددة."
        : "اختر المادة لعرض حصص الشهر المحدد.";
    list.append(prompt);
  }

  async function load() {
    activeStudent = activeStudent || getStoredStudent();
    if (!activeStudent?.id || !activeStudent.level || !list) return;
    if (!month || !subject) {
      showSelectionPrompt();
      return;
    }
    list.innerHTML = '<p class="class-registry-loading">جارٍ تحميل سجل الحصص…</p>';
    try {
      const payload = await api(`/api/schedules/registry/${encodeURIComponent(activeStudent.level)}?month=${encodeURIComponent(month)}&subject=${encodeURIComponent(subject)}&studentId=${encodeURIComponent(activeStudent.id)}`);
      render(Array.isArray(payload.data) ? payload.data : []);
    } catch (error) {
      list.innerHTML = `<p class="class-registry-empty">${error.message}</p>`;
    }
  }

  function toggleFilter(button, selector, key) {
    const value = button.dataset[key];
    const isSelected = (key === "registryMonth" ? month : subject) === value;
    if (key === "registryMonth") month = isSelected ? "" : value;
    else subject = isSelected ? "" : value;

    document.querySelectorAll(selector).forEach((item) => {
      item.classList.toggle("is-active", item === button && !isSelected);
      item.setAttribute("aria-selected", String(item === button && !isSelected));
    });
    void load();
  }

  document.querySelectorAll("[data-registry-month]").forEach((button) => button.addEventListener("click", () => {
    toggleFilter(button, "[data-registry-month]", "registryMonth");
  }));
  document.querySelectorAll("[data-registry-subject]").forEach((button) => button.addEventListener("click", () => {
    toggleFilter(button, "[data-registry-subject]", "registrySubject");
  }));
  window.addEventListener("active-student-changed", (event) => { activeStudent = event.detail || null; void load(); });
  window.addEventListener("class-registry-updated", () => void load());
  $("registry-upsell-close")?.addEventListener("click", closeUpsell);
  upsell?.addEventListener("click", (event) => { if (event.target === upsell) closeUpsell(); });
  window.addEventListener("keydown", (event) => { if (event.key === "Escape") closeUpsell(); });
  void load();
})();
