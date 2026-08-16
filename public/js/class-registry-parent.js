(() => {
  const token = sessionStorage.getItem("parentToken");
  if (!token) return;

  const $ = (id) => document.getElementById(id);
  const section = $("class-registry-student");
  const toggle = $("class-registry-toggle");
  const toggleIcon = $("class-registry-toggle-icon");
  const controls = $("class-registry-controls");
  const termOptions = $("registry-term-options");
  const monthOptions = $("registry-month-options");
  const subjectOptions = $("registry-subject-options");
  const list = $("parent-class-registry-list");
  const upsell = $("registry-upsell-modal");
  const studentName = () => JSON.parse(sessionStorage.getItem("currentStudent") || "null")?.studentName || sessionStorage.getItem("studentName") || "التلميذ";

  let activeStudent = null;
  let isOpen = false;
  let term = "";
  let month = "";
  let subject = "";

  const TERMS = Object.freeze({
    TERM_1: {
      label: "الفصل الأول",
      months: [
        { value: "2026-09", label: "سبتمبر 2026" },
        { value: "2026-10", label: "أكتوبر 2026" },
        { value: "2026-11", label: "نوفمبر 2026" },
      ],
    },
    TERM_2: {
      label: "الفصل الثاني",
      months: [
        { value: "2027-01", label: "جانفي 2027" },
        { value: "2027-02", label: "فيفري 2027" },
      ],
    },
    TERM_3: {
      label: "الفصل الثالث",
      months: [
        { value: "2027-04", label: "أبريل 2027" },
        { value: "2027-05", label: "ماي 2027" },
      ],
    },
  });

  const statusLabels = { PENDING: "لم تُنجز بعد", COMPLETED: "تمت الحصة", TEACHER_ABSENT: "غياب الأستاذ" };
  const subjectLabels = { MATH: "الرياضيات", PHYSICS: "الفيزياء", PAID: "اشتراك مدفوع", FREE: "اشتراك مجاني" };

  function getStoredStudent() {
    try { return JSON.parse(sessionStorage.getItem("currentStudent") || "null"); } catch { return null; }
  }

  function getSubjectChoices() {
    return activeStudent?.level === "طالب جامعي"
      ? [{ value: "PAID", label: "اشتراك مدفوع" }, { value: "FREE", label: "اشتراك مجاني" }]
      : [{ value: "MATH", label: "الرياضيات" }, { value: "PHYSICS", label: "الفيزياء" }];
  }

  function getSelectedTerm() {
    return TERMS[term] || null;
  }

  async function api(path) {
    const response = await fetch(path, { headers: { Accept: "application/json", Authorization: `Bearer ${token}` } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "تعذر تحميل سجل الحصص.");
    return payload;
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat("ar-DZ", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Algiers" }).format(date)
      : "تاريخ غير صالح";
  }

  function openUpsell() {
    if (!upsell) return;
    upsell.hidden = false;
    document.body.style.overflow = "hidden";
    $("registry-upsell-close")?.focus();
  }

  function closeUpsell() {
    if (!upsell) return;
    upsell.hidden = true;
    document.body.style.overflow = "";
  }

  function isSafeYouTubeEmbedUrl(value) {
    return /^https:\/\/www\.youtube\.com\/embed\/[A-Za-z0-9_-]{11}.*$/.test(String(value || ""));
  }

  function openVideo(item) {
    const modal = $("lesson-video-modal");
    const frame = $("lesson-video-frame");
    const videoUrl = isSafeYouTubeEmbedUrl(item.youtubeEmbedUrl) ? item.youtubeEmbedUrl : item.previewUrl;
    if (!modal || !frame || !videoUrl) return;
    $("lesson-video-modal-title").textContent = `${subjectLabels[item.subject] || "الحصة"} · ${formatDate(item.scheduledAt)}`;
    $("lesson-video-sidebar-title").textContent = subjectLabels[item.subject] || "مشاهدة الحصة";
    $("lesson-video-sidebar-meta").textContent = `${formatDate(item.scheduledAt)} · مشاهدة داخل المنصة`;
    if (videoUrl.includes("youtube.com")) {
      frame.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture");
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

  function showMessage(message, className = "class-registry-empty") {
    list?.replaceChildren();
    if (!list) return;
    const element = document.createElement("p");
    element.className = className;
    element.textContent = message;
    list.append(element);
  }

  function showSelectionPrompt() {
    if (!isOpen) return;
    if (!term) return showMessage("اختر الفصل الدراسي أولاً.");
    if (!month) return showMessage("اختر الشهر من الفصل المحدد.");
    if (!subject) return showMessage("اختر المادة لعرض الحصص.");
    showMessage("جارٍ تحميل سجل الحصص…", "class-registry-loading");
  }

  function createOptionButton({ value, label, kind, active = false, disabled = false }) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `class-registry-option registry-${kind}-tab${active ? " is-active" : ""}`;
    button.dataset[`registry${kind.charAt(0).toUpperCase()}${kind.slice(1)}`] = value;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(active));
    button.disabled = disabled;
    button.textContent = label;
    return button;
  }

  function renderFilters() {
    if (!termOptions || !monthOptions || !subjectOptions) return;
    termOptions.replaceChildren();
    Object.entries(TERMS).forEach(([value, data]) => {
      termOptions.append(createOptionButton({ value, label: data.label, kind: "term", active: term === value }));
    });

    monthOptions.replaceChildren();
    const months = getSelectedTerm()?.months || [];
    if (!months.length) {
      const placeholder = document.createElement("span");
      placeholder.className = "class-registry-filter-placeholder";
      placeholder.textContent = "اختر الفصل أولاً";
      monthOptions.append(placeholder);
    } else {
      months.forEach((item) => monthOptions.append(createOptionButton({ value: item.value, label: item.label, kind: "month", active: month === item.value })));
    }

    subjectOptions.replaceChildren();
    const choices = getSubjectChoices();
    if (!month) {
      const placeholder = document.createElement("span");
      placeholder.className = "class-registry-filter-placeholder";
      placeholder.textContent = "اختر الشهر أولاً";
      subjectOptions.append(placeholder);
    } else {
      choices.forEach((item) => subjectOptions.append(createOptionButton({ value: item.value, label: item.label, kind: "subject", active: subject === item.value })));
    }

    toggle?.setAttribute("aria-expanded", String(isOpen));
    if (toggleIcon) toggleIcon.textContent = isOpen ? "⌃" : "⌄";
  }

  function render(items) {
    list?.replaceChildren();
    if (!list) return;
    if (!items.length) {
      showMessage(`لا توجد حصص مبرمجة في ${subjectLabels[subject] || "هذه المادة"} لهذا الشهر.`);
      return;
    }
    items.forEach((item) => {
      const card = document.createElement("article");
      card.className = `class-registry-item status-${String(item.status || "PENDING").toLowerCase()} ${item.canWatch ? "is-authorized" : "is-locked"}`;
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
      action.textContent = item.status === "COMPLETED"
        ? (item.canWatch ? "▶ مشاهدة التسجيل داخل الأكاديمية" : "🔒 ترقية للمشاهدة")
        : item.status === "TEACHER_ABSENT" ? "عرض ملاحظة الغياب" : "في انتظار إنجاز الحصة";
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

  async function load() {
    activeStudent = activeStudent || getStoredStudent();
    if (!activeStudent?.id || !activeStudent.level || !list || !isOpen) return;
    if (!term || !month || !subject) {
      showSelectionPrompt();
      return;
    }
    list.innerHTML = '<p class="class-registry-loading">جارٍ تحميل سجل الحصص…</p>';
    try {
      const payload = await api(`/api/schedules/registry/${encodeURIComponent(activeStudent.level)}?month=${encodeURIComponent(month)}&subject=${encodeURIComponent(subject)}&studentId=${encodeURIComponent(activeStudent.id)}`);
      render(Array.isArray(payload.data) ? payload.data : []);
    } catch (error) {
      showMessage(error.message);
    }
  }

  function selectTerm(value) {
    term = term === value ? "" : value;
    month = "";
    subject = "";
    renderFilters();
    showSelectionPrompt();
  }

  function selectMonth(value) {
    month = month === value ? "" : value;
    subject = "";
    renderFilters();
    showSelectionPrompt();
  }

  function selectSubject(value) {
    subject = subject === value ? "" : value;
    renderFilters();
    void load();
  }

  function setOpen(nextOpen) {
    isOpen = Boolean(nextOpen);
    if (controls) controls.hidden = !isOpen;
    section?.classList.toggle("is-open", isOpen);
    renderFilters();
    if (isOpen) showSelectionPrompt();
  }

  toggle?.addEventListener("click", () => setOpen(!isOpen));
  termOptions?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-registry-term]");
    if (button) selectTerm(button.dataset.registryTerm);
  });
  monthOptions?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-registry-month]");
    if (button && !button.disabled) selectMonth(button.dataset.registryMonth);
  });
  subjectOptions?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-registry-subject]");
    if (button && !button.disabled) selectSubject(button.dataset.registrySubject);
  });

  window.addEventListener("active-student-changed", (event) => {
    activeStudent = event.detail || null;
    term = "";
    month = "";
    subject = "";
    renderFilters();
    if (isOpen) showSelectionPrompt();
  });
  window.addEventListener("class-registry-updated", () => void load());
  window.addEventListener("class-registry-refresh", () => void load());
  $("registry-upsell-close")?.addEventListener("click", closeUpsell);
  upsell?.addEventListener("click", (event) => { if (event.target === upsell) closeUpsell(); });
  window.addEventListener("keydown", (event) => { if (event.key === "Escape") closeUpsell(); });

  activeStudent = getStoredStudent();
  renderFilters();
})();

// Registry terms: 2026 fall, 2027 winter, and 2027 spring months are selected
// before the API request, so the existing level/subject access rules stay intact.
