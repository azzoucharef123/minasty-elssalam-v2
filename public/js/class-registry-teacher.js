"use strict";

(() => {
  const token = sessionStorage.getItem("teacherToken");
  if (!token) return;

  const $ = (id) => document.getElementById(id);
  const term = $("class-registry-term");
  const month = $("class-registry-month");
  const subject = $("class-registry-subject");
  const list = $("class-registry-list");
  const registryToggle = $("class-registry-toggle");
  const registryControls = $("class-registry-controls");
  const registryToggleIcon = $("class-registry-toggle-icon");
  const modal = $("class-registry-action-modal");
  const form = $("class-registry-action-form");
  const title = $("class-registry-action-title");
  const driveField = $("class-registry-drive-field");
  const driveInput = $("class-registry-drive-link");
  const notesField = $("class-registry-notes-field");
  const notesInput = $("class-registry-notes");
  const youtubeField = $("class-registry-youtube-field");
  const youtubePickerButton = $("class-registry-youtube-picker");
  const youtubeVideoIdInput = $("class-registry-youtube-video-id");
  const youtubeSelectedLabel = $("class-registry-youtube-selected");
  const youtubeConnectButton = $("youtube-connect-button");
  const youtubeConnectionStatus = $("youtube-connection-status");
  const youtubePickerModal = $("youtube-video-picker-modal");
  const youtubePickerList = $("youtube-video-picker-list");
  let currentLevel = document.querySelector(".level-btn.is-active")?.dataset.level || "السنة الأولى";
  let selectedTerm = "";
  let selectedMonth = "";
  let selectedSubject = "";
  let selectedClass = null;
  let youtubeConnected = false;
  let registryOpen = false;

  function setRegistryOpen(nextOpen) {
    registryOpen = Boolean(nextOpen);
    if (registryControls) registryControls.hidden = !registryOpen;
    registryToggle?.setAttribute("aria-expanded", String(registryOpen));
    if (registryToggleIcon) registryToggleIcon.textContent = registryOpen ? "⌃" : "⌄";
    if (registryOpen) showSelectionPrompt();
  }

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
      ? new Intl.DateTimeFormat("ar-DZ", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Algiers" }).format(date)
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

  function getSelectedTerm() {
    return TERMS[selectedTerm] || null;
  }

  function fillSelect(select, placeholder, options, selectedValue, disabled) {
    if (!select) return;
    select.replaceChildren();
    const first = document.createElement("option");
    first.value = "";
    first.textContent = placeholder;
    select.append(first);
    options.forEach(({ value, label }) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      select.append(option);
    });
    select.disabled = disabled;
    select.value = selectedValue || "";
  }

  function renderFilters() {
    fillSelect(
      term,
      "اختر الفصل الدراسي",
      Object.entries(TERMS).map(([value, data]) => ({ value, label: data.label })),
      selectedTerm,
      false
    );
    fillSelect(
      month,
      selectedTerm ? "اختر الشهر" : "اختر الفصل أولًا",
      getSelectedTerm()?.months || [],
      selectedMonth,
      !selectedTerm
    );
    fillSelect(
      subject,
      selectedMonth ? "اختر المادة" : "اختر الشهر أولًا",
      [
        { value: "MATH", label: "الرياضيات" },
        { value: "PHYSICS", label: "الفيزياء" },
      ],
      selectedSubject,
      !selectedMonth
    );
  }

  function showSelectionPrompt() {
    if (!registryOpen || !list) return;
    if (!selectedTerm) {
      list.innerHTML = '<p class="class-registry-empty">اختر الفصل الدراسي أولًا.</p>';
      return;
    }
    if (!selectedMonth) {
      list.innerHTML = '<p class="class-registry-empty">اختر الشهر من القائمة.</p>';
      return;
    }
    if (!selectedSubject) {
      list.innerHTML = '<p class="class-registry-empty">اختر المادة من القائمة.</p>';
    }
  }

  function setYoutubeStatus(text, connected = youtubeConnected) {
    if (youtubeConnectionStatus) youtubeConnectionStatus.textContent = text;
    youtubeConnectButton?.classList.toggle("is-connected", connected);
    if (youtubeConnectButton) youtubeConnectButton.textContent = connected ? "إدارة قناة YouTube" : "ربط قناة YouTube";
  }

  async function loadYoutubeStatus() {
    try {
      const payload = await api("/api/youtube/status");
      youtubeConnected = Boolean(payload.data?.connected);
      setYoutubeStatus(youtubeConnected ? "قناة YouTube مرتبطة" : "لم تُربط قناة YouTube بعد");
    } catch (error) {
      youtubeConnected = false;
      setYoutubeStatus("تعذر التحقق من قناة YouTube", false);
      console.warn("Unable to read YouTube status:", error);
    }
  }

  async function connectYoutube() {
    try {
      const payload = await api("/api/youtube/connect");
      const popup = window.open(payload.authorizationUrl, "youtube-oauth", "popup,width=560,height=760");
      if (!popup) showError("اسمح بالنوافذ المنبثقة لإكمال ربط قناة YouTube.");
    } catch (error) {
      showError(error.message);
    }
  }

  function closeYoutubePicker() {
    if (youtubePickerModal) youtubePickerModal.hidden = true;
  }

  function selectYoutubeVideo(video) {
    youtubeVideoIdInput.value = video.id;
    youtubeSelectedLabel.textContent = `تم اختيار: ${video.title}`;
    youtubeSelectedLabel.title = video.title;
    closeYoutubePicker();
  }

  function renderYoutubeVideos(videos) {
    youtubePickerList.replaceChildren();
    if (!videos.length) {
      const empty = document.createElement("p");
      empty.className = "class-registry-empty";
      empty.textContent = "لا توجد فيديوهات متاحة في القناة.";
      youtubePickerList.append(empty);
      return;
    }
    videos.forEach((video) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "youtube-video-picker-item";
      const image = document.createElement("img");
      image.src = video.thumbnail || "";
      image.alt = "";
      image.loading = "lazy";
      const copy = document.createElement("span");
      const titleElement = document.createElement("strong");
      titleElement.textContent = video.title;
      const meta = document.createElement("small");
      meta.textContent = video.publishedAt ? new Intl.DateTimeFormat("ar-DZ", { dateStyle: "medium" }).format(new Date(video.publishedAt)) : "فيديو من القناة";
      copy.append(titleElement, meta);
      button.append(image, copy);
      button.addEventListener("click", () => selectYoutubeVideo(video));
      youtubePickerList.append(button);
    });
  }

  async function openYoutubePicker() {
    if (!youtubeConnected) {
      await connectYoutube();
      return;
    }
    youtubePickerModal.hidden = false;
    youtubePickerList.innerHTML = '<p class="class-registry-loading">جارٍ تحميل فيديوهات القناة…</p>';
    try {
      const payload = await api("/api/youtube/videos?limit=20");
      renderYoutubeVideos(Array.isArray(payload.data) ? payload.data : []);
    } catch (error) {
      youtubePickerList.innerHTML = `<p class="class-registry-empty">${error.message}</p>`;
    }
  }

  function openAction(item, nextStatus) {
    selectedClass = item;
    form.dataset.status = nextStatus;
    title.textContent = nextStatus === "COMPLETED" ? "تسجيل الحصة كمكتملة" : "تسجيل غياب الأستاذ";
    driveField.hidden = nextStatus !== "COMPLETED";
    youtubeField.hidden = nextStatus !== "COMPLETED";
    notesField.hidden = nextStatus === "PENDING";
    driveInput.value = item.driveLink || "";
    youtubeVideoIdInput.value = item.youtubeVideoId || "";
    youtubeSelectedLabel.textContent = item.youtubeVideoId ? "يوجد فيديو YouTube مرتبط بهذه الحصة" : "لم يتم اختيار فيديو YouTube";
    notesInput.value = item.notes || "";
    modal.hidden = false;
    driveField.hidden && youtubeField.hidden ? notesInput.focus() : (item.youtubeVideoId ? notesInput.focus() : youtubePickerButton.focus());
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
    if (!list || !term || !month || !subject || !selectedTerm || !selectedMonth || !selectedSubject) {
      showSelectionPrompt();
      return;
    }
    list.innerHTML = '<p class="class-registry-loading">جارٍ تحميل سجل الحصص…</p>';
    try {
      const payload = await api(`/api/schedules/registry/${encodeURIComponent(currentLevel)}?month=${encodeURIComponent(selectedMonth)}&subject=${encodeURIComponent(selectedSubject)}`);
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

  registryToggle?.addEventListener("click", () => setRegistryOpen(!registryOpen));
  term?.addEventListener("change", () => {
    selectedTerm = term.value;
    selectedMonth = "";
    selectedSubject = "";
    renderFilters();
    showSelectionPrompt();
  });
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!selectedClass) return;
    void update(selectedClass, form.dataset.status, { driveLink: driveInput.value.trim(), youtubeVideoId: youtubeVideoIdInput.value.trim(), notes: notesInput.value.trim() });
  });
  $("class-registry-action-close")?.addEventListener("click", closeAction);
  modal?.addEventListener("click", (event) => { if (event.target === modal) closeAction(); });
  $("youtube-video-picker-close")?.addEventListener("click", closeYoutubePicker);
  youtubePickerModal?.addEventListener("click", (event) => { if (event.target === youtubePickerModal) closeYoutubePicker(); });
  youtubePickerButton?.addEventListener("click", () => void openYoutubePicker());
  youtubeConnectButton?.addEventListener("click", () => void connectYoutube());
  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin) return;
    if (event.data?.type === "youtube-connected") {
      youtubeConnected = true;
      setYoutubeStatus("قناة YouTube مرتبطة", true);
    }
    if (event.data?.type === "youtube-connect-failed") setYoutubeStatus("فشل ربط قناة YouTube", false);
  });
  month?.addEventListener("change", () => {
    selectedMonth = month.value;
    selectedSubject = "";
    renderFilters();
    showSelectionPrompt();
  });
  subject?.addEventListener("change", () => {
    selectedSubject = subject.value;
    renderFilters();
    void load();
  });
  document.querySelectorAll(".level-btn[data-level]").forEach((button) => button.addEventListener("click", () => {
    currentLevel = button.dataset.level;
    selectedTerm = "";
    selectedMonth = "";
    selectedSubject = "";
    renderFilters();
    window.setTimeout(() => void load(), 0);
  }));
  window.addEventListener("class-registry-refresh", () => void load());
  renderFilters();
  void loadYoutubeStatus();
  void load();
})();
