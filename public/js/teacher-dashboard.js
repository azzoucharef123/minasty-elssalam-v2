"use strict";

const TEACHER_TOKEN_KEY = "teacherToken";

const elements = {
  levelButtons: Array.from(document.querySelectorAll(".level-btn[data-level], [data-level].level-button")),
  currentLevelTitle: document.querySelector("#current-level-title, #current-level, [data-current-level]"),
  studentsTableBody: document.querySelector("#students-table-body, #students-tbody, table tbody"),
  tableEmptyState: document.querySelector("#table-empty-state, #empty-state"),
  dashboardError: document.querySelector("#dashboard-error, #message-box"),
  logoutButton: document.querySelector("#logout-btn, [data-action='logout']"),
  publicInviteButton: document.getElementById("public-invite-btn"),

  toast: document.querySelector("#toast, #success-toast"),
  searchInput: document.getElementById("student-search"),
  paymentFilter: document.getElementById("payment-filter"),
  summaryTotal: document.getElementById("summary-total"),
  summaryPaid: document.getElementById("summary-paid"),
  summaryUnpaid: document.getElementById("summary-unpaid"),
  filteredResultsLabel: document.getElementById("filtered-results-label"),
  attendanceModal: document.getElementById("attendance-modal"),
  attendanceStudentName: document.getElementById("attendance-student-name"),
  attendanceList: document.getElementById("attendance-list"),
  attendanceEmpty: document.getElementById("attendance-empty"),
  closeAttendanceButton: document.getElementById("close-attendance-modal"),
  subscriptionModal: document.getElementById("subscription-modal"),
  subscriptionForm: document.getElementById("subscription-form"),
  subscriptionStudentName: document.getElementById("subscription-student-name"),
  subscriptionPaymentStage: document.getElementById("subscription-payment-stage"),
  subscriptionTypeLabel: document.getElementById("subscription-type-label"),
  subscriptionLiveAccess: document.getElementById("subscription-live-access"),
  closeSubscriptionButton: document.getElementById("close-subscription-modal"),
  dashboardDate: document.getElementById("dashboard-date"),
  bentoCurrentLevel: document.getElementById("bento-current-level"),
  bentoLiveEnabled: document.getElementById("bento-live-enabled"),
  bentoTotalCaption: document.getElementById("bento-total-caption"),
  paymentProgressBar: document.getElementById("payment-progress-bar"),
  paymentProgressCaption: document.getElementById("payment-progress-caption"),
  bentoMathCount: document.getElementById("bento-math-count"),
  bentoPhysicsCount: document.getElementById("bento-physics-count"),
  bentoLatestStudent: document.getElementById("bento-latest-student"),
  bentoLatestCaption: document.getElementById("bento-latest-caption"),
  bentoActivityStatus: document.getElementById("bento-activity-status"),
  focusStudentSearchButton: document.getElementById("focus-student-search"),
  jumpToRosterButton: document.getElementById("jump-to-roster"),
  studentsPanel: document.getElementById("students-panel"),
  studentPaymentHeading: document.getElementById("student-payment-heading"),
  paymentStatusModal: document.getElementById("payment-status-modal"),
  paymentStatusForm: document.getElementById("payment-status-form"),
  paymentStatusStudentName: document.getElementById("payment-status-student-name"),
  paymentStatusStage: document.getElementById("payment-status-stage"),
  paymentStatusAmount: document.getElementById("payment-status-amount"),
  paymentAmountField: document.getElementById("payment-amount-field"),
  closePaymentStatusButton: document.getElementById("close-payment-status-modal"),
  scheduleForm: document.getElementById("schedule-form"),
  scheduleSubject: document.getElementById("schedule-subject"),
  scheduleDateTime: document.getElementById("schedule-datetime"),
  scheduleSubmitButton: document.getElementById("schedule-submit-btn"),
  scheduleCancelButton: document.getElementById("schedule-cancel-edit-btn"),
  scheduledClassList: document.getElementById("scheduled-class-list"),
  scheduleLevelCaption: document.getElementById("schedule-level-caption"),
  teacherAbsenceButton: document.getElementById("teacher-absence-btn"),
  teacherAbsenceStatus: document.getElementById("teacher-absence-status"),
  lessonVideoForm: document.getElementById("lesson-video-form"),
  lessonVideoType: document.getElementById("lesson-video-type"),
  lessonVideoTypeHelp: document.getElementById("lesson-video-type-help"),
  driveVideoTypeLabel: document.getElementById("drive-video-type-label"),
  lessonVideoTitle: document.getElementById("lesson-video-title"),
  lessonVideoUrl: document.getElementById("lesson-video-url"),
  lessonVideoSubmit: document.getElementById("lesson-video-submit"),
  lessonVideoPicker: document.getElementById("lesson-video-picker"),
  lessonVideoList: document.getElementById("teacher-lesson-video-list"),
  driveVideoModal: document.getElementById("drive-video-modal"),
  closeDriveVideoModal: document.getElementById("close-drive-video-modal"),
  driveVideoList: document.getElementById("drive-video-list"),
  lessonRepositoryCaption: document.getElementById("lesson-repository-caption"),
};

let currentLevel =
  document.querySelector(".level-btn.is-active, .level-btn.active, .level-button.is-active")?.dataset
    .level || "السنة الأولى";
// Prompt 14 source of truth: complete API data for the selected level.
let currentStudents = [];
let subscriptionStudentId = null;
let toastTimer = null;
let scheduledClasses = [];
let teacherAbsent = false;
let editingScheduledClassId = null;
let paymentStatusStudentId = null;
let lessonVideos = [];
let googlePickerApiKey = null;
let googlePickerAppId = null;
let googlePickerLoadPromise = null;
let googleDriveListPromise = null;
let googlePickerAccessToken = null;
let googlePickerTokenExpiresAt = 0;

function clearTeacherSession() {
  sessionStorage.removeItem(TEACHER_TOKEN_KEY);
  sessionStorage.removeItem("teacherAuth");
  sessionStorage.removeItem("userRole");
}

function redirectToTeacherLogin() {
  clearTeacherSession();
  window.location.replace("./teacher-login.html");
}

function getTeacherToken() {
  const token = sessionStorage.getItem(TEACHER_TOKEN_KEY);

  if (!token) {
    redirectToTeacherLogin();
    return null;
  }

  return token;
}

function showDashboardError(message = "") {
  if (!elements.dashboardError) {
    return;
  }

  elements.dashboardError.textContent = message;
  elements.dashboardError.hidden = !message;
  elements.dashboardError.classList.toggle("is-visible", Boolean(message));
}

function secondarySubscriptionMode(student) {
  if (student.mathEnrollment && student.physicsEnrollment) return "BOTH";
  if (student.physicsEnrollment) return "PHYSICS";
  return "MATH";
}

function paymentStageMeta(student) {
  if (student.level !== "طالب جامعي") {
    const mode = secondarySubscriptionMode(student);
    return mode === "BOTH"
      ? { label: "فيزياء ورياضيات", className: "is-paid" }
      : mode === "PHYSICS"
        ? { label: "فيزياء فقط", className: "is-unpaid" }
        : { label: "رياضيات فقط", className: "is-unpaid" };
  }

  const stage = student.paymentStage || (student.paymentStatus ? "PAID" : "UNPAID");
  return stage === "PAID"
    ? { label: "اشتراك مدفوع", className: "is-paid" }
    : { label: "اشتراك مجاني", className: "is-unpaid" };
}

function secondaryPaymentStatusMeta(student) {
  const stage = student.paymentStage || (student.paymentStatus ? "PAID" : "UNPAID");
  const amount = Number.isSafeInteger(student.amountDue) && student.amountDue > 0
    ? ` — ${student.amountDue.toLocaleString("ar-DZ")} دج`
    : "";
  return stage === "PAID"
    ? { label: `تم تأكيد الدفع${amount}`, className: "is-paid" }
    : stage === "PROMISED"
      ? { label: `الوعد بالدفع${amount}`, className: "is-promised" }
      : { label: "لم يتم الدفع", className: "is-unpaid" };
}

function accountStatusMeta(student) {
  if (student.level === "طالب جامعي") {
    if (student.cardReuploadRequested) {
      return { label: "إعادة رفع البطاقة مطلوبة", className: "is-inactive" };
    }

    if (student.accountActive === false && student.cardPhotoUrl) {
      return { label: "في انتظار تأكيد هوية البطاقة", className: "is-pending" };
    }
  }

  return student.accountActive !== false
    ? { label: "حساب مفعل", className: "is-active" }
    : { label: "حساب غير مفعل", className: "is-inactive" };
}

function showToast(message) {
  if (!elements.toast) {
    return;
  }

  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  elements.toast.classList.add("is-visible");

  toastTimer = window.setTimeout(() => {
    elements.toast.hidden = true;
    elements.toast.classList.remove("is-visible");
  }, 3_000);
}

/**
 * Performs a protected API request. Any expired, invalid, or unauthorized JWT
 * immediately ends the local teacher session and returns the user to login.
 */
async function teacherFetch(url, options = {}) {
  const token = getTeacherToken();
  if (!token) {
    throw new Error("انتهت جلسة الأستاذ.");
  }

  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401 || response.status === 403) {
    redirectToTeacherLogin();
    throw new Error("انتهت الجلسة أو لا تملك الصلاحية المطلوبة.");
  }

  return response;
}

const GOOGLE_DRIVE_CLIENT_ID = "938017291163-6uinh4868l66eo8887hsqkt7h3h1ss6e.apps.googleusercontent.com";
const GOOGLE_DRIVE_FILE_SCOPE = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
].join(" ");
const VIDEO_MIME_TYPES = "video/mp4,video/webm,video/quicktime,video/x-matroska,video/avi,video/mpeg";

function isGooglePickerTokenUsable() {
  return Boolean(googlePickerAccessToken && Date.now() < googlePickerTokenExpiresAt - 60_000);
}

function waitForGoogleScript(scriptId, src, isReady) {
  if (isReady()) return Promise.resolve();

  return new Promise((resolve, reject) => {
    let script = document.getElementById(scriptId);
    if (!script) {
      script = document.createElement("script");
      script.id = scriptId;
      script.src = src;
      script.defer = true;
      document.head.append(script);
    }

    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      window.clearInterval(checkTimer);
      window.clearTimeout(timeoutTimer);
      callback(value);
    };
    const check = () => {
      if (isReady()) finish(resolve);
    };
    const checkTimer = window.setInterval(check, 100);
    const timeoutTimer = window.setTimeout(() => {
      finish(reject, new Error("تعذر تحميل خدمة Google. تحقق من اتصال الإنترنت أو من إعدادات Chrome."));
    }, 10_000);
    script.addEventListener("load", check, { once: true });
    script.addEventListener("error", () => {
      finish(reject, new Error("تعذر تحميل خدمة Google. تحقق من اتصال الإنترنت أو من إعدادات Chrome."));
    }, { once: true });
    check();
  });
}

async function ensureGooglePickerReady() {
  if (!googlePickerLoadPromise) {
    googlePickerLoadPromise = waitForGoogleScript(
      "google-identity-services",
      "https://accounts.google.com/gsi/client",
      () => Boolean(window.google?.accounts?.oauth2),
    ).catch((error) => {
      googlePickerLoadPromise = null;
      throw error;
    });
  }
  return googlePickerLoadPromise;
}

async function loadGooglePickerConfiguration() {
  if (googlePickerApiKey && googlePickerAppId) return;
  const response = await teacherFetch("/api/google-picker/config", {
    headers: { Accept: "application/json" },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.apiKey || !payload.appId) {
    throw new Error(payload.error || "تعذر إعداد اختيار ملفات Google Drive.");
  }
  googlePickerApiKey = payload.apiKey;
  googlePickerAppId = payload.appId;
}

async function requestGooglePickerToken() {
  if (isGooglePickerTokenUsable()) return googlePickerAccessToken;
  await ensureGooglePickerReady();

  return new Promise((resolve, reject) => {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_DRIVE_CLIENT_ID,
      scope: GOOGLE_DRIVE_FILE_SCOPE,
      callback: (response) => {
        if (response?.error || !response?.access_token) {
          reject(new Error(response?.error_description || "لم يتم منح إذن اختيار فيديو من Google Drive."));
          return;
        }
        googlePickerAccessToken = response.access_token;
        googlePickerTokenExpiresAt = Date.now() + (Number(response.expires_in) || 3_600) * 1_000;
        resolve(googlePickerAccessToken);
      },
      error_callback: (error) => {
        reject(new Error(error?.message || "تم إغلاق نافذة تسجيل الدخول إلى Google."));
      },
    });
    tokenClient.requestAccessToken({ prompt: "" });
  });
}

function closeDriveVideoModal() {
  if (elements.driveVideoModal) {
    elements.driveVideoModal.hidden = true;
    elements.driveVideoModal.classList.remove("is-visible");
  }
}

async function fetchGoogleDriveVideos(accessToken) {
  const query = "mimeType contains 'video/' and trashed = false";
  const fields = "files(id, name, mimeType, size, modifiedTime, webViewLink)";
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&pageSize=50&orderBy=modifiedTime desc`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || "تعذر تحميل قائمة الفيديوهات من Google Drive.");
  }

  const data = await response.json();
  return data.files || [];
}

function renderDriveVideoList(files) {
  if (!elements.driveVideoList) return;
  elements.driveVideoList.innerHTML = "";

  if (!files || files.length === 0) {
    const empty = document.createElement("p");
    empty.className = "drive-video-empty";
    empty.textContent = "لا توجد ملفات فيديو في حسابك على Google Drive.";
    elements.driveVideoList.append(empty);
    return;
  }

  files.forEach((file) => {
    const button = document.createElement("button");
    button.className = "drive-video-item";
    button.type = "button";

    const copy = document.createElement("div");
    copy.className = "drive-video-item-copy";

    const title = document.createElement("span");
    title.className = "drive-video-item-title";
    title.textContent = file.name;

    const meta = document.createElement("span");
    meta.className = "drive-video-item-meta";
    const date = new Date(file.modifiedTime).toLocaleDateString("ar-DZ");
    const size = file.size ? `${(Number(file.size) / (1024 * 1024)).toFixed(1)} MB` : "حجم غير معروف";
    meta.textContent = `${date} — ${size}`;

    copy.append(title, meta);

    const icon = document.createElement("span");
    icon.className = "drive-video-item-icon";
    icon.textContent = "🎬";

    button.append(copy, icon);

    button.addEventListener("click", () => {
      const driveUrl = `https://drive.google.com/file/d/${file.id}/view`;
      if (elements.lessonVideoTitle) elements.lessonVideoTitle.value = file.name;
      if (elements.lessonVideoUrl) elements.lessonVideoUrl.value = driveUrl;
      closeDriveVideoModal();
      void saveLessonVideo(null, { title: file.name, driveUrl });
    });

    elements.driveVideoList.append(button);
  });
}

async function openGoogleDriveVideoPicker() {
  if (!elements.lessonVideoPicker || !elements.driveVideoModal) return;
  updateLessonVideoTypeLabel();
  elements.lessonVideoPicker.disabled = true;
  const originalLabel = elements.lessonVideoPicker.textContent;
  elements.lessonVideoPicker.textContent = "جارٍ الاتصال بـ Google…";

  try {
    await ensureGooglePickerReady();
    const accessToken = await requestGooglePickerToken();

    elements.driveVideoModal.hidden = false;
    elements.driveVideoModal.classList.add("is-visible");
    if (elements.driveVideoList) {
      elements.driveVideoList.innerHTML = '<p class="drive-video-loading">جارٍ تحميل قائمة الفيديوهات…</p>';
    }

    const files = await fetchGoogleDriveVideos(accessToken);
    renderDriveVideoList(files);
  } catch (error) {
    console.error("Unable to list Google Drive videos:", error);
    showDashboardError(error.message || "تعذر فتح فيديوهات Google Drive.");
    closeDriveVideoModal();
  } finally {
    elements.lessonVideoPicker.disabled = false;
    elements.lessonVideoPicker.textContent = originalLabel || "اختيار فيديو من Google Drive";
  }
}

function setActiveLevelButton(level) {
  elements.levelButtons.forEach((button) => {
    const isActive = button.dataset.level === level;
    button.classList.toggle("is-active", isActive);
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-current", isActive ? "true" : "false");
  });
}

function setCurrentLevelHeading(level) {
  if (elements.currentLevelTitle) {
    elements.currentLevelTitle.textContent = level;
  }
  if (elements.bentoCurrentLevel) {
    elements.bentoCurrentLevel.textContent = level;
  }
  if (elements.studentPaymentHeading) {
    elements.studentPaymentHeading.textContent = level === "طالب جامعي" ? "بطاقة الطالب" : "حالة الدفع";
  }
}

function getLessonVideoTypeOptions(level) {
  return level === "طالب جامعي"
    ? [
        { value: "FREE", label: "حصص مجانية" },
        { value: "PAID", label: "حصص مدفوعة" },
      ]
    : [
        { value: "MATH", label: "دروس الرياضيات" },
        { value: "PHYSICS", label: "دروس الفيزياء" },
      ];
}

function syncLessonVideoTypeOptions() {
  if (!elements.lessonVideoType) return;
  const options = getLessonVideoTypeOptions(currentLevel);
  const previousValue = elements.lessonVideoType.value;
  elements.lessonVideoType.replaceChildren();
  options.forEach(({ value, label }) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    elements.lessonVideoType.append(option);
  });
  if (options.some((option) => option.value === previousValue)) {
    elements.lessonVideoType.value = previousValue;
  }
  updateLessonVideoTypeLabel();
}

function updateLessonVideoTypeLabel() {
  const selected = getLessonVideoTypeOptions(currentLevel).find(
    (option) => option.value === elements.lessonVideoType?.value,
  );
  const label = selected?.label || "التصنيف المحدد";
  if (elements.lessonVideoTypeHelp) {
    elements.lessonVideoTypeHelp.textContent = currentLevel === "طالب جامعي"
      ? `${label}: يظهر الفيديو للطالب المجاني أو المدفوع حسب نوع الاشتراك.`
      : `${label}: يظهر الفيديو فقط للتلميذ المسجل في هذه المادة.`;
  }
  if (elements.driveVideoTypeLabel) {
    elements.driveVideoTypeLabel.textContent = label;
  }
}

function truncateText(value, maxLength = 55) {
  const text = String(value || "").trim();
  if (!text) {
    return "—";
  }

  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function scheduleTypeOptions(level) {
  return level === "طالب جامعي"
    ? [
        { value: "PAID", label: "اشتراك مدفوع" },
        { value: "FREE", label: "اشتراك مجاني" },
      ]
    : [
        { value: "MATH", label: "الرياضيات" },
        { value: "PHYSICS", label: "الفيزياء" },
      ];
}

function scheduleTypeLabel(level, subject) {
  return scheduleTypeOptions(level).find((item) => item.value === subject)?.label || "نوع غير معروف";
}

function toDateTimeLocalValue(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatScheduledDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "توقيت غير صالح";
  return new Intl.DateTimeFormat("ar-DZ", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function syncScheduleSubjectOptions(selectedValue) {
  if (!elements.scheduleSubject) return;
  const previousValue = selectedValue || elements.scheduleSubject.value;
  elements.scheduleSubject.replaceChildren();
  scheduleTypeOptions(currentLevel).forEach((item) => {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.label;
    elements.scheduleSubject.append(option);
  });
  const values = scheduleTypeOptions(currentLevel).map((item) => item.value);
  elements.scheduleSubject.value = values.includes(previousValue) ? previousValue : values[0];
}

function resetScheduleForm() {
  editingScheduledClassId = null;
  if (elements.scheduleForm) elements.scheduleForm.reset();
  syncScheduleSubjectOptions();
  if (elements.scheduleSubmitButton) elements.scheduleSubmitButton.textContent = "إضافة حصة";
  if (elements.scheduleCancelButton) elements.scheduleCancelButton.hidden = true;
}

function renderScheduledClasses() {
  if (!elements.scheduledClassList) return;
  elements.scheduledClassList.replaceChildren();

  if (!scheduledClasses.length) {
    const empty = document.createElement("p");
    empty.className = "scheduled-class-empty";
    empty.textContent = "لا توجد حصص مبرمجة لهذا المستوى بعد.";
    elements.scheduledClassList.append(empty);
    return;
  }

  scheduledClasses.forEach((scheduledClass) => {
    const item = document.createElement("article");
    item.className = "scheduled-class-item";
    const info = document.createElement("div");
    info.className = "scheduled-class-info";
    const title = document.createElement("strong");
    title.textContent = scheduleTypeLabel(currentLevel, scheduledClass.subject);
    const date = document.createElement("span");
    date.textContent = formatScheduledDate(scheduledClass.scheduledAt);
    info.append(title, date);

    const actions = document.createElement("div");
    actions.className = "scheduled-class-actions";
    actions.append(
      createButton("تعديل", "edit", () => beginScheduleEdit(scheduledClass.id)),
      createButton("حذف", "delete", () => void deleteScheduledClass(scheduledClass.id))
    );
    item.append(info, actions);
    elements.scheduledClassList.append(item);
  });
}

function renderTeacherAbsence() {
  if (elements.scheduleLevelCaption) {
    elements.scheduleLevelCaption.textContent = `أضف وعدّل واحذف حصص ${currentLevel}.`;
  }
  if (elements.teacherAbsenceButton) {
    elements.teacherAbsenceButton.classList.toggle("is-active", teacherAbsent);
    elements.teacherAbsenceButton.textContent = teacherAbsent
      ? "إلغاء حالة غياب الأستاذ"
      : "الأستاذ غائب اليوم";
  }
  if (elements.teacherAbsenceStatus) {
    elements.teacherAbsenceStatus.hidden = !teacherAbsent;
    elements.teacherAbsenceStatus.textContent = teacherAbsent
      ? "الأستاذ غائب اليوم. ستظهر هذه الرسالة لتلاميذ هذا المستوى."
      : "";
  }
}

async function loadLevelSchedule() {
  try {
    const response = await teacherFetch(`/api/schedules/${encodeURIComponent(currentLevel)}`, {
      headers: { Accept: "application/json" },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "تعذر تحميل برنامج الحصص.");

    scheduledClasses = Array.isArray(payload.scheduledClasses) ? payload.scheduledClasses : [];
    teacherAbsent = payload.teacherAbsent === true;
    renderTeacherAbsence();
    renderScheduledClasses();
  } catch (error) {
    console.error("Unable to load level schedule:", error);
    showDashboardError(error.message || "تعذر تحميل برنامج الحصص.");
  }
}

function renderLessonVideos() {
  if (elements.lessonRepositoryCaption) {
    elements.lessonRepositoryCaption.textContent = `أضف رابط فيديو Google Drive لحصص ${currentLevel} ليشاهده التلاميذ داخل حساباتهم.`;
  }
  if (!elements.lessonVideoList) return;

  elements.lessonVideoList.replaceChildren();
  if (!lessonVideos.length) {
    const empty = document.createElement("p");
    empty.className = "teacher-lesson-empty";
    empty.textContent = "لا توجد فيديوهات مضافة لهذا المستوى بعد.";
    elements.lessonVideoList.append(empty);
    return;
  }

  lessonVideos.forEach((video) => {
    const item = document.createElement("article");
    item.className = "teacher-lesson-video-item";
    const copy = document.createElement("div");
    copy.className = "teacher-lesson-video-copy";
    const title = document.createElement("strong");
    title.textContent = video.title || "حصة مسجلة";
    const date = document.createElement("small");
    date.textContent = `أضيفت في ${formatScheduledDate(video.createdAt)}`;
    const type = document.createElement("span");
    type.className = "teacher-lesson-video-type";
    type.textContent = video.repositoryTypeLabel || "تصنيف غير معروف";
    copy.append(title, type, date);

    const actions = document.createElement("div");
    actions.className = "teacher-lesson-video-actions";
    const open = document.createElement("a");
    open.href = video.driveUrl;
    open.target = "_blank";
    open.rel = "noopener noreferrer";
    open.textContent = "فتح الرابط";
    const remove = createButton("حذف", "delete", () => void deleteLessonVideo(video.id));
    actions.append(open, remove);
    item.append(copy, actions);
    elements.lessonVideoList.append(item);
  });
}

async function loadLessonVideos() {
  if (!elements.lessonVideoList) return;

  try {
    const response = await teacherFetch(`/api/lesson-videos/${encodeURIComponent(currentLevel)}`, {
      headers: { Accept: "application/json" },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "تعذر تحميل مستودع الدروس.");
    lessonVideos = Array.isArray(payload.data) ? payload.data : [];
    renderLessonVideos();
  } catch (error) {
    console.error("Unable to load lesson videos:", error);
    lessonVideos = [];
    renderLessonVideos();
    showDashboardError(error.message || "تعذر تحميل مستودع الدروس.");
  }
}

async function saveLessonVideo(event, selectedVideo = null) {
  event?.preventDefault();
  const title = selectedVideo?.title || elements.lessonVideoTitle?.value.trim() || "";
  const driveUrl = selectedVideo?.driveUrl || elements.lessonVideoUrl?.value.trim() || "";
  const repositoryType = selectedVideo?.repositoryType || elements.lessonVideoType?.value || "";
  if (!title || !driveUrl) {
    showDashboardError("أدخل عنوان الحصة ورابط Google Drive أولاً.");
    return;
  }
  if (!repositoryType) {
    showDashboardError("اختر مادة الحصة أو نوع الاشتراك أولاً.");
    elements.lessonVideoType?.focus();
    return;
  }

  elements.lessonVideoSubmit.disabled = true;
  try {
    const response = await teacherFetch("/api/lesson-videos", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ level: currentLevel, title, driveUrl, repositoryType }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "تعذر حفظ رابط الحصة.");

    elements.lessonVideoForm.reset();
    syncLessonVideoTypeOptions();
    showToast("تمت إضافة الفيديو إلى تصنيف المستودع المحدد.");
    await loadLessonVideos();
  } catch (error) {
    console.error("Unable to save lesson video:", error);
    showDashboardError(error.message || "تعذر حفظ رابط الحصة.");
  } finally {
    elements.lessonVideoSubmit.disabled = false;
  }
}

async function deleteLessonVideo(videoId) {
  if (!window.confirm("هل تريد حذف رابط هذه الحصة من المستودع؟ لن يُحذف الفيديو من Google Drive.")) {
    return;
  }

  try {
    const response = await teacherFetch(`/api/lesson-videos/${encodeURIComponent(videoId)}`, {
      method: "DELETE",
      headers: { Accept: "application/json" },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "تعذر حذف رابط الحصة.");

    showToast("تم حذف رابط الحصة من المستودع.");
    await loadLessonVideos();
  } catch (error) {
    console.error("Unable to delete lesson video:", error);
    showDashboardError(error.message || "تعذر حذف رابط الحصة.");
  }
}

function createButton(label, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function createCell(content, className = "") {
  const cell = document.createElement("td");
  if (className) {
    cell.className = className;
  }

  if (content instanceof Node) {
    cell.append(content);
  } else {
    cell.textContent = content;
  }

  return cell;
}

function renderTable(studentsArray) {
  const students = studentsArray;

  if (!elements.studentsTableBody) {
    return;
  }

  elements.studentsTableBody.replaceChildren();

  if (elements.tableEmptyState) {
    elements.tableEmptyState.hidden = students.length > 0;
  }

  if (students.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.textContent = "لا يوجد تلاميذ مسجلون في هذا المستوى حالياً.";
    cell.className = "empty-table-cell";
    row.append(cell);
    elements.studentsTableBody.append(row);
    return;
  }

  for (const student of students) {
    const row = document.createElement("tr");

    const paymentMeta = paymentStageMeta(student);
    const paymentButton = createButton(
      paymentMeta.label,
      `payment-toggle ${paymentMeta.className}`,
      () => openSubscriptionModal(student.id)
    );
    paymentButton.title = "اضغط لتعديل حالة الدفع والمبلغ";

    const liveAccessButton = createButton(
      student.liveAccessEnabled ? "دخول الحصة مفتوح" : "فتح دخول الحصة",
      `payment-toggle ${student.liveAccessEnabled ? "is-paid" : "is-unpaid"}`,
      () => toggleLiveAccess(student.id)
    );
    liveAccessButton.setAttribute("aria-pressed", String(Boolean(student.liveAccessEnabled)));
    liveAccessButton.title = student.liveAccessEnabled
      ? "اضغط لمنع هذا التلميذ من دخول الحصة"
      : "اضغط للسماح لهذا التلميذ بدخول الحصة";

    const subscriptionButton = createButton(
      "تعديل الاشتراك",
      "edit-notes-btn",
      () => openSubscriptionModal(student.id)
    );
    const attendanceButton = createButton(
      "سجل الحضور",
      "attendance-log-btn",
      () => openAttendanceModal(student.id)
    );
    const deleteButton = createButton(
      "حذف المستخدم",
      "delete-student-btn",
      () => deleteStudent(student.id)
    );
    const actionGroup = document.createElement("div");
    actionGroup.className = "table-action-group";
    actionGroup.append(
      liveAccessButton,
      subscriptionButton,
      attendanceButton,
      deleteButton
    );

    const identity = document.createElement("div");
    identity.className = "teacher-student-identity";
    const studentName = document.createElement("strong");
    studentName.textContent = student.studentName;
    const accountStatus = document.createElement("span");
    const accountMeta = accountStatusMeta(student);
    accountStatus.className = `teacher-account-status ${accountMeta.className}`;
    accountStatus.textContent = accountMeta.label;
    identity.append(studentName, accountStatus);

    if (student.level === "طالب جامعي") {
      const reuploadButton = createButton(
        student.cardReuploadRequested ? "تم طلب إعادة الرفع" : "أعد رفع البطاقة",
        "card-reupload-btn",
        () => requestCardReupload(student.id)
      );
      reuploadButton.disabled = Boolean(student.cardReuploadRequested);
      reuploadButton.title = student.cardReuploadRequested
        ? "ينتظر رفع الطالب للصورة الجديدة"
        : "اطلب من الطالب رفع صورة أوضح للبطاقة";
      actionGroup.append(reuploadButton);

      const identityPending =
        student.accountActive === false &&
        !student.cardReuploadRequested &&
        Boolean(student.cardPhotoUrl);
      if (identityPending) {
        const confirmIdentityButton = createButton(
          "تأكيد هوية البطاقة",
          "card-confirm-btn",
          () => confirmCardIdentity(student.id)
        );
        confirmIdentityButton.title = "بعد مراجعة البطاقة، اضغط لتفعيل حساب الطالب";
        actionGroup.append(confirmIdentityButton);
      }

      const paymentReceiptPending =
        Boolean(student.paymentReceiptPending) && Boolean(student.paymentReceiptUrl);
      if (paymentReceiptPending) {
        const viewReceiptButton = createButton(
          "عرض وصل الدفع",
          "payment-receipt-view-btn",
          () => viewStudentPaymentReceipt(student.id)
        );
        viewReceiptButton.title = "عرض وصل الدفع المرفوع من الطالب";
        const confirmPaymentButton = createButton(
          "تأكيد وصل الدفع",
          "payment-receipt-confirm-btn",
          () => confirmPaymentReceipt(student.id)
        );
        confirmPaymentButton.title = "تأكيد الدفع وتحويل الحساب إلى اشتراك مدفوع";
        actionGroup.append(viewReceiptButton, confirmPaymentButton);
      }
    }

    const cardCell = document.createElement("td");
    cardCell.className = "card-photo-cell";
    if (student.level !== "طالب جامعي") {
      const paymentStatusMeta = secondaryPaymentStatusMeta(student);
      const paymentStatusButton = createButton(
        paymentStatusMeta.label,
        `secondary-payment-status ${paymentStatusMeta.className}`,
        () => openPaymentStatusModal(student.id)
      );
      paymentStatusButton.title = "اضغط لتحديد حالة الدفع والقيمة";
      cardCell.append(paymentStatusButton);
    } else if (student.cardPhotoUrl) {
      const cardButton = createButton(
        "عرض البطاقة",
        "card-view-btn",
        () => viewStudentCard(student.id)
      );
      cardButton.title = "عرض صورة بطاقة الطالب الجامعي";
      cardCell.append(cardButton);
    } else {
      cardCell.textContent = "غير متوفرة";
      cardCell.classList.add("muted-cell");
    }

    row.append(
      createCell(identity),
      createCell(student.parentPhone, "phone-cell"),
      createCell(paymentButton, "payment-cell"),
      cardCell,
      createCell(actionGroup, "actions-cell")
    );

    elements.studentsTableBody.append(row);
  }
}

/** Updates the three cards from the same array visible in the table. */
function updateSummary(studentsArray) {
  const total = studentsArray.length;
  const paid = studentsArray.filter((student) => student.paymentStatus === true).length;
  const unpaid = total - paid;

  if (elements.summaryTotal) elements.summaryTotal.textContent = String(total);
  if (elements.summaryPaid) elements.summaryPaid.textContent = String(paid);
  if (elements.summaryUnpaid) elements.summaryUnpaid.textContent = String(unpaid);
  if (elements.filteredResultsLabel) {
    elements.filteredResultsLabel.textContent = `${total} نتيجة معروضة`;
  }

  updateBentoInsights(studentsArray, { total, paid, unpaid });
}

function updateBentoInsights(studentsArray, summary) {
  const total = summary?.total ?? studentsArray.length;
  const paid = summary?.paid ?? studentsArray.filter((student) => student.paymentStatus === true).length;
  const unpaid = summary?.unpaid ?? total - paid;
  const liveEnabled = studentsArray.filter((student) => student.liveAccessEnabled).length;
  const mathCount = paid;
  const physicsCount = unpaid;
  const paymentRate = total ? Math.round((paid / total) * 100) : 0;
  const latestStudent = studentsArray[0];

  if (elements.bentoLiveEnabled) elements.bentoLiveEnabled.textContent = String(liveEnabled);
  if (elements.bentoTotalCaption) {
    elements.bentoTotalCaption.textContent = total ? `${total} تلميذ في العرض` : "بانتظار التلاميذ";
  }
  if (elements.paymentProgressBar) elements.paymentProgressBar.style.width = `${paymentRate}%`;
  if (elements.paymentProgressCaption) {
    elements.paymentProgressCaption.textContent = total
      ? `${paid} اشتراك مدفوع و${unpaid} اشتراك مجاني`
      : "ستظهر حالة الاشتراكات بعد تحميل القائمة.";
  }
  if (elements.bentoMathCount) elements.bentoMathCount.textContent = String(mathCount);
  if (elements.bentoPhysicsCount) elements.bentoPhysicsCount.textContent = String(physicsCount);
  if (elements.bentoLatestStudent) {
    elements.bentoLatestStudent.textContent = latestStudent?.studentName || "لا يوجد تلاميذ في هذا المستوى";
  }
  if (elements.bentoLatestCaption) {
    elements.bentoLatestCaption.textContent = latestStudent
      ? `آخر تلميذ ظاهر: ${latestStudent.level || currentLevel}`
      : "غيّر المستوى أو أضف تلميذًا جديدًا للبدء.";
  }
  if (elements.bentoActivityStatus) {
    elements.bentoActivityStatus.textContent = total ? `تم تحديث ${total} تلميذ` : "تحديث مباشر للبيانات";
  }
}

/** Applies both controls to the in-memory array; no extra API call is made. */
function applyFilters() {
  const query = String(elements.searchInput?.value || "")
    .trim()
    .toLocaleLowerCase("ar");
  const paymentSelection = elements.paymentFilter?.value || "all";

  const filteredStudents = currentStudents.filter((student) => {
    const matchesName =
      !query || String(student.studentName || "").toLocaleLowerCase("ar").includes(query);
    const matchesPayment =
      paymentSelection === "all" ||
      (paymentSelection === "paid" && student.paymentStatus === true) ||
      (paymentSelection === "unpaid" && student.paymentStatus === false);

    return matchesName && matchesPayment;
  });

  renderTable(filteredStudents);
  updateSummary(filteredStudents);
}

async function fetchStudents(level = currentLevel) {
  if (!getTeacherToken()) {
    return;
  }

  currentLevel = level;
  setActiveLevelButton(level);
  setCurrentLevelHeading(level);
  syncLessonVideoTypeOptions();
  showDashboardError();

  try {
    const response = await teacherFetch(
      `/api/students/level/${encodeURIComponent(level)}`,
      { headers: { Accept: "application/json" } }
    );
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "تعذر تحميل قائمة التلاميذ.");
    }

    // Phase 15 returns { status, data, meta }; retain the legacy array fallback
    // so this dashboard remains compatible during a staged deployment.
    currentStudents = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
    resetScheduleForm();
    await Promise.all([loadLevelSchedule(), loadLessonVideos()]);
    applyFilters();
  } catch (error) {
    if (!/انتهت الجلسة/.test(error.message)) {
      console.error("Unable to fetch teacher roster:", error);
      showDashboardError(error.message || "تعذر تحميل قائمة التلاميذ.");
    }
  }
}

function beginScheduleEdit(scheduledClassId) {
  const scheduledClass = scheduledClasses.find((item) => item.id === scheduledClassId);
  if (!scheduledClass) return;
  editingScheduledClassId = scheduledClass.id;
  syncScheduleSubjectOptions(scheduledClass.subject);
  elements.scheduleDateTime.value = toDateTimeLocalValue(scheduledClass.scheduledAt);
  elements.scheduleSubmitButton.textContent = "حفظ التعديل";
  elements.scheduleCancelButton.hidden = false;
  elements.scheduleForm?.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function saveScheduledClass(event) {
  event.preventDefault();
  const subject = elements.scheduleSubject?.value;
  const localDateTime = elements.scheduleDateTime?.value;
  const scheduledAt = localDateTime ? new Date(localDateTime).toISOString() : "";
  if (!subject || !scheduledAt) {
    showDashboardError("حدد نوع الحصة والتاريخ والتوقيت أولاً.");
    return;
  }

  const isEditing = Boolean(editingScheduledClassId);
  try {
    const response = await teacherFetch(
      isEditing ? `/api/schedules/${encodeURIComponent(editingScheduledClassId)}` : "/api/schedules",
      {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ level: currentLevel, subject, scheduledAt }),
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "تعذر حفظ الحصة المبرمجة.");

    showToast(payload.message || "تم حفظ الحصة المبرمجة.");
    resetScheduleForm();
    await loadLevelSchedule();
  } catch (error) {
    console.error("Unable to save scheduled class:", error);
    showDashboardError(error.message || "تعذر حفظ الحصة المبرمجة.");
  }
}

async function deleteScheduledClass(scheduledClassId) {
  if (!window.confirm("هل تريد حذف هذه الحصة المبرمجة؟")) return;
  try {
    const response = await teacherFetch(`/api/schedules/${encodeURIComponent(scheduledClassId)}`, {
      method: "DELETE",
      headers: { Accept: "application/json" },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "تعذر حذف الحصة المبرمجة.");

    showToast(payload.message || "تم حذف الحصة المبرمجة.");
    if (editingScheduledClassId === scheduledClassId) resetScheduleForm();
    await loadLevelSchedule();
  } catch (error) {
    console.error("Unable to delete scheduled class:", error);
    showDashboardError(error.message || "تعذر حذف الحصة المبرمجة.");
  }
}

async function toggleTeacherAbsence() {
  try {
    const response = await teacherFetch(`/api/schedules/absence/${encodeURIComponent(currentLevel)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ isAbsent: !teacherAbsent }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "تعذر تحديث حالة الغياب.");

    teacherAbsent = payload.data?.isAbsent === true;
    renderTeacherAbsence();
    showToast(payload.message || "تم تحديث حالة غياب الأستاذ.");
  } catch (error) {
    console.error("Unable to update teacher absence:", error);
    showDashboardError(error.message || "تعذر تحديث حالة الغياب.");
  }
}

async function updateStudent(studentId, updates) {
  const student = currentStudents.find((item) => item.id === studentId);
  if (!student) {
    throw new Error("تعذر العثور على بيانات التلميذ الحالية.");
  }

  const payload = {
    paymentStage:
      typeof updates.paymentStage === "string"
        ? updates.paymentStage
        : student.paymentStage || (student.paymentStatus ? "PAID" : "UNPAID"),
    amountDue:
      Object.prototype.hasOwnProperty.call(updates, "amountDue")
        ? updates.amountDue
        : student.amountDue ?? null,
    mathEnrollment:
      typeof updates.mathEnrollment === "boolean" ? updates.mathEnrollment : Boolean(student.mathEnrollment),
    physicsEnrollment:
      typeof updates.physicsEnrollment === "boolean" ? updates.physicsEnrollment : Boolean(student.physicsEnrollment),
    liveAccessEnabled:
      typeof updates.liveAccessEnabled === "boolean"
        ? updates.liveAccessEnabled
        : Boolean(student.liveAccessEnabled),
    physicsNote: "",
    mathNote: "",
  };

  const response = await teacherFetch(`/api/students/${encodeURIComponent(studentId)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "تعذر حفظ تحديثات التلميذ.");
  }

  return data;
}

async function requestCardReupload(studentId) {
  try {
    const response = await teacherFetch(
      `/api/students/${encodeURIComponent(studentId)}/request-card-reupload`,
      { method: "PUT", headers: { Accept: "application/json" } }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "تعذر إرسال طلب إعادة رفع البطاقة.");
    }

    showToast(payload.message || "تم إرسال طلب إعادة رفع البطاقة.");
    await fetchStudents(currentLevel);
  } catch (error) {
    if (!/انتهت الجلسة/.test(error.message)) {
      console.error("Unable to request card reupload:", error);
      showDashboardError(error.message || "تعذر إرسال طلب إعادة رفع البطاقة.");
    }
  }
}

async function confirmCardIdentity(studentId) {
  try {
    const response = await teacherFetch(
      `/api/students/${encodeURIComponent(studentId)}/confirm-card-identity`,
      { method: "PUT", headers: { Accept: "application/json" } }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "تعذر تأكيد هوية البطاقة.");
    }

    showToast(payload.message || "تم تأكيد هوية البطاقة وتفعيل الحساب.");
    await fetchStudents(currentLevel);
  } catch (error) {
    if (!/انتهت الجلسة/.test(error.message)) {
      console.error("Unable to confirm student card identity:", error);
      showDashboardError(error.message || "تعذر تأكيد هوية البطاقة.");
    }
  }
}

async function toggleLiveAccess(studentId) {
  const student = currentStudents.find((item) => item.id === studentId);
  if (!student) {
    return;
  }

  try {
    const nextValue = !Boolean(student.liveAccessEnabled);
    await updateStudent(studentId, { liveAccessEnabled: nextValue });
    showToast(nextValue ? "تم السماح للتلميذ بدخول الحصة." : "تم منع التلميذ من دخول الحصة.");
    await fetchStudents(currentLevel);
  } catch (error) {
    if (!/انتهت الجلسة/.test(error.message)) {
      console.error("Unable to update live access:", error);
      showDashboardError(error.message || "تعذر تحديث صلاحية دخول الحصة.");
    }
  }
}

function configureSubscriptionTypeOptions(student) {
  if (!elements.subscriptionPaymentStage) return;
  const isUniversityStudent = student.level === "طالب جامعي";
  const options = isUniversityStudent
    ? [
        { value: "PAID", label: "اشتراك مدفوع" },
        { value: "UNPAID", label: "اشتراك مجاني" },
      ]
    : [
        { value: "BOTH", label: "فيزياء ورياضيات" },
        { value: "PHYSICS", label: "فيزياء فقط" },
        { value: "MATH", label: "رياضيات فقط" },
      ];

  elements.subscriptionPaymentStage.replaceChildren();
  options.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.label;
    elements.subscriptionPaymentStage.append(option);
  });
  if (elements.subscriptionTypeLabel) {
    elements.subscriptionTypeLabel.firstChild.textContent = isUniversityStudent ? "نوع اشتراك الجامعة" : "اشتراك الحصص";
  }
  elements.subscriptionPaymentStage.value = isUniversityStudent
    ? student.paymentStage === "PAID" || student.paymentStatus ? "PAID" : "UNPAID"
    : secondarySubscriptionMode(student);
}

function syncPaymentAmountField() {
  const needsAmount = elements.paymentStatusStage?.value !== "UNPAID";
  if (elements.paymentAmountField) elements.paymentAmountField.hidden = !needsAmount;
  if (elements.paymentStatusAmount) {
    elements.paymentStatusAmount.required = needsAmount;
    if (!needsAmount) elements.paymentStatusAmount.value = "";
  }
}

function openPaymentStatusModal(studentId) {
  const student = currentStudents.find((item) => item.id === studentId);
  if (!student || student.level === "طالب جامعي" || !elements.paymentStatusModal) return;

  paymentStatusStudentId = studentId;
  elements.paymentStatusStudentName.textContent = student.studentName;
  elements.paymentStatusStage.value = student.paymentStage || (student.paymentStatus ? "PAID" : "UNPAID");
  elements.paymentStatusAmount.value = Number.isSafeInteger(student.amountDue) ? String(student.amountDue) : "";
  syncPaymentAmountField();
  elements.paymentStatusModal.hidden = false;
  elements.paymentStatusModal.classList.add("is-open");
}

function closePaymentStatusModal() {
  paymentStatusStudentId = null;
  elements.paymentStatusModal?.classList.remove("is-open");
  if (elements.paymentStatusModal) elements.paymentStatusModal.hidden = true;
}

async function savePaymentStatus(event) {
  event.preventDefault();
  if (!paymentStatusStudentId) return;
  const student = currentStudents.find((item) => item.id === paymentStatusStudentId);
  if (!student) return;

  const paymentStage = elements.paymentStatusStage.value;
  const amountValue = elements.paymentStatusAmount.value.trim();
  const amountDue = paymentStage === "UNPAID" ? null : Number(amountValue);
  if (paymentStage !== "UNPAID" && (!Number.isSafeInteger(amountDue) || amountDue <= 0)) {
    showDashboardError("حدد قيمة صحيحة للدفع أو الوعد بالدفع.");
    return;
  }

  const submitButton = elements.paymentStatusForm?.querySelector("button[type='submit']");
  if (submitButton) submitButton.disabled = true;
  try {
    await updateStudent(paymentStatusStudentId, {
      paymentStage,
      amountDue,
      liveAccessEnabled: paymentStage !== "UNPAID",
    });
    closePaymentStatusModal();
    showToast(paymentStage === "UNPAID" ? "تم منع الطالب غير المدفوع من دخول الحصة." : "تم حفظ حالة الدفع والقيمة.");
    await fetchStudents(currentLevel);
  } catch (error) {
    console.error("Unable to save payment status:", error);
    showDashboardError(error.message || "تعذر حفظ حالة الدفع.");
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

function openSubscriptionModal(studentId) {
  const student = currentStudents.find((item) => item.id === studentId);
  if (!student || !elements.subscriptionModal) {
    return;
  }

  subscriptionStudentId = studentId;
  elements.subscriptionStudentName.textContent = student.studentName;
  configureSubscriptionTypeOptions(student);
  elements.subscriptionLiveAccess.checked = Boolean(student.liveAccessEnabled);
  elements.subscriptionModal.hidden = false;
  elements.subscriptionModal.classList.add("is-open");
}

function closeSubscriptionModal() {
  subscriptionStudentId = null;
  elements.subscriptionModal?.classList.remove("is-open");
  if (elements.subscriptionModal) {
    elements.subscriptionModal.hidden = true;
  }
}

async function saveSubscription(event) {
  event.preventDefault();
  if (!subscriptionStudentId) {
    return;
  }

  const student = currentStudents.find((item) => item.id === subscriptionStudentId);
  if (!student) return;
  const selectedMode = elements.subscriptionPaymentStage.value;
  const isUniversityStudent = student.level === "طالب جامعي";
  const enrollment = isUniversityStudent
    ? { mathEnrollment: true, physicsEnrollment: true }
    : selectedMode === "BOTH"
      ? { mathEnrollment: true, physicsEnrollment: true }
      : selectedMode === "PHYSICS"
        ? { mathEnrollment: false, physicsEnrollment: true }
        : { mathEnrollment: true, physicsEnrollment: false };
  const paymentStage = isUniversityStudent
    ? selectedMode
    : student.paymentStage || (student.paymentStatus ? "PAID" : "UNPAID");

  const submitButton = elements.subscriptionForm?.querySelector("button[type='submit']");
  if (submitButton) submitButton.disabled = true;

  try {
    await updateStudent(subscriptionStudentId, {
      paymentStage,
      ...enrollment,
      liveAccessEnabled: Boolean(elements.subscriptionLiveAccess?.checked),
    });
    closeSubscriptionModal();
    showToast("تم حفظ نوع اشتراك التلميذ.");
    await fetchStudents(currentLevel);
  } catch (error) {
    if (!/انتهت الجلسة/.test(error.message)) {
      console.error("Unable to save subscription settings:", error);
      showDashboardError(error.message || "تعذر حفظ اشتراك التلميذ.");
    }
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

async function viewStudentCard(studentId) {
  const student = currentStudents.find((item) => item.id === studentId);
  if (!student?.cardPhotoUrl) {
    showDashboardError("لا توجد صورة بطاقة لهذا المستخدم.");
    return;
  }

  const previewWindow = window.open("about:blank", "_blank");
  if (!previewWindow) {
    showDashboardError("اسمح بالنوافذ المنبثقة لعرض صورة البطاقة.");
    return;
  }

  try {
    const response = await teacherFetch(
      `/api/students/${encodeURIComponent(studentId)}/card-photo`,
      { headers: { Accept: "image/*" } }
    );

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "تعذر عرض صورة البطاقة.");
    }

    const imageUrl = URL.createObjectURL(await response.blob());
    previewWindow.location.href = imageUrl;
  } catch (error) {
    previewWindow.close();
    if (!/انتهت الجلسة/.test(error.message)) {
      console.error("Unable to view student card:", error);
      showDashboardError(error.message || "تعذر عرض صورة البطاقة.");
    }
  }
}

async function viewStudentPaymentReceipt(studentId) {
  const previewWindow = window.open("about:blank", "_blank");
  if (!previewWindow) {
    showDashboardError("اسمح بالنوافذ المنبثقة لعرض وصل الدفع.");
    return;
  }

  try {
    const response = await teacherFetch(
      `/api/students/${encodeURIComponent(studentId)}/payment-receipt`,
      { headers: { Accept: "image/*" } }
    );

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "تعذر عرض وصل الدفع.");
    }

    previewWindow.location.href = URL.createObjectURL(await response.blob());
  } catch (error) {
    previewWindow.close();
    if (!/انتهت الجلسة/.test(error.message)) {
      console.error("Unable to view payment receipt:", error);
      showDashboardError(error.message || "تعذر عرض وصل الدفع.");
    }
  }
}

async function confirmPaymentReceipt(studentId) {
  try {
    const response = await teacherFetch(
      `/api/students/${encodeURIComponent(studentId)}/confirm-payment-receipt`,
      { method: "PUT", headers: { Accept: "application/json" } }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "تعذر تأكيد وصل الدفع.");
    }

    showToast(payload.message || "تم تأكيد الدفع وتفعيل الاشتراك المدفوع.");
    await fetchStudents(currentLevel);
  } catch (error) {
    if (!/انتهت الجلسة/.test(error.message)) {
      console.error("Unable to confirm payment receipt:", error);
      showDashboardError(error.message || "تعذر تأكيد وصل الدفع.");
    }
  }
}

async function deleteStudent(studentId) {
  const student = currentStudents.find((item) => item.id === studentId);
  if (!student) {
    return;
  }

  const confirmed = window.confirm(
    `هل أنت متأكد من حذف المستخدم ${student.studentName}؟ سيتم حذف بياناته وسجل حضوره نهائياً.`
  );
  if (!confirmed) {
    return;
  }

  try {
    const response = await teacherFetch(`/api/students/${encodeURIComponent(studentId)}`, {
      method: "DELETE",
      headers: { Accept: "application/json" },
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error || "تعذر حذف المستخدم.");
    }

    showToast(payload.message || "تم حذف المستخدم بنجاح.");
    await fetchStudents(currentLevel);
  } catch (error) {
    if (!/انتهت الجلسة/.test(error.message)) {
      console.error("Unable to delete student:", error);
      showDashboardError(error.message || "تعذر حذف المستخدم.");
    }
  }
}

function formatAttendanceDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "تاريخ غير متاح";
  }

  return new Intl.DateTimeFormat("ar-DZ", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(date);
}

function renderAttendanceRecords(records) {
  if (!elements.attendanceList) {
    return;
  }

  elements.attendanceList.replaceChildren();

  if (!records.length) {
    const empty = document.createElement("p");
    empty.id = "attendance-empty";
    empty.className = "attendance-empty";
    empty.textContent = "لا يوجد سجل حضور للحصص المباشرة حتى الآن.";
    elements.attendanceList.append(empty);
    return;
  }

  const list = document.createElement("ul");
  list.className = "attendance-records";

  for (const record of records) {
    const item = document.createElement("li");
    item.className = "attendance-record";

    const date = document.createElement("strong");
    date.textContent = formatAttendanceDate(record.joinedAt);

    const level = document.createElement("span");
    level.textContent = record.level || "المستوى الدراسي";

    item.append(date, level);
    list.append(item);
  }

  elements.attendanceList.append(list);
}

async function openAttendanceModal(studentId) {
  const student = currentStudents.find((item) => item.id === studentId);
  if (!student || !elements.attendanceModal) {
    return;
  }

  if (elements.attendanceStudentName) {
    elements.attendanceStudentName.textContent = student.studentName;
  }

  renderAttendanceRecords([]);
  elements.attendanceModal.hidden = false;
  elements.attendanceModal.classList.add("is-open");

  try {
    const response = await teacherFetch(
      `/api/attendance/student/${encodeURIComponent(studentId)}`,
      { headers: { Accept: "application/json" } }
    );
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error || "تعذر تحميل سجل الحضور.");
    }

    renderAttendanceRecords(Array.isArray(payload.data) ? payload.data : []);
  } catch (error) {
    if (!/انتهت الجلسة/.test(error.message)) {
      console.error("Unable to load attendance history:", error);
      renderAttendanceRecords([]);
      showDashboardError(error.message || "تعذر تحميل سجل الحضور.");
    }
  }
}

function closeAttendanceModal() {
  elements.attendanceModal?.classList.remove("is-open");
  if (elements.attendanceModal) {
    elements.attendanceModal.hidden = true;
  }
}

function updateDashboardDate() {
  if (!elements.dashboardDate) {
    return;
  }

  elements.dashboardDate.textContent = new Intl.DateTimeFormat("ar-DZ", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
}

function focusStudentSearch() {
  elements.studentsPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
  window.setTimeout(() => elements.searchInput?.focus(), 320);
}

function jumpToRoster() {
  elements.studentsPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function logoutTeacher() {
  clearTeacherSession();
  window.location.replace("./teacher-login.html");
}

async function createPublicInvite() {
  const createSecureId = () => window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 16)}`;
  const roomId = createSecureId();
  const hostToken = createSecureId();
  const hostUrl = new URL("./public-class.html", window.location.href);
  hostUrl.searchParams.set("host", roomId);
  hostUrl.searchParams.set("token", hostToken);
  showToast("تم فتح الحصة العامة. سيظهر زر الدخول في الصفحة الرئيسية للزوار.");

  const publicWindow = window.open(hostUrl.toString(), "_blank");
  if (publicWindow) publicWindow.opener = null;
  else window.location.assign(hostUrl.toString());
}

if (!getTeacherToken()) {
  // getTeacherToken has already redirected; no protected initialization occurs.
} else {
  elements.levelButtons.forEach((button) => {
    button.addEventListener("click", () => fetchStudents(button.dataset.level));
  });
  elements.publicInviteButton?.addEventListener("click", () => { void createPublicInvite(); });

  elements.paymentStatusForm?.addEventListener("submit", savePaymentStatus);
  elements.paymentStatusStage?.addEventListener("change", syncPaymentAmountField);
  elements.closePaymentStatusButton?.addEventListener("click", closePaymentStatusModal);
  elements.paymentStatusModal?.addEventListener("click", (event) => {
    if (event.target === elements.paymentStatusModal) closePaymentStatusModal();
  });
  elements.scheduleForm?.addEventListener("submit", saveScheduledClass);
elements.lessonVideoForm?.addEventListener("submit", saveLessonVideo);
elements.lessonVideoPicker?.addEventListener("click", () => {
  void openGoogleDriveVideoPicker();
});
elements.closeDriveVideoModal?.addEventListener("click", closeDriveVideoModal);
elements.driveVideoModal?.addEventListener("click", (e) => {
  if (e.target === elements.driveVideoModal) closeDriveVideoModal();
});
  elements.scheduleCancelButton?.addEventListener("click", resetScheduleForm);
  elements.teacherAbsenceButton?.addEventListener("click", () => void toggleTeacherAbsence());
  elements.subscriptionForm?.addEventListener("submit", saveSubscription);
  elements.closeSubscriptionButton?.addEventListener("click", closeSubscriptionModal);
  elements.logoutButton?.addEventListener("click", logoutTeacher);

  elements.editModal?.addEventListener("click", (event) => {
    if (event.target === elements.editModal) {
      closeEditModal();
    }
  });
  elements.subscriptionModal?.addEventListener("click", (event) => {
    if (event.target === elements.subscriptionModal) {
      closeSubscriptionModal();
    }
  });
  elements.closeAttendanceButton?.addEventListener("click", closeAttendanceModal);
  elements.attendanceModal?.addEventListener("click", (event) => {
    if (event.target === elements.attendanceModal) {
      closeAttendanceModal();
    }
  });

  elements.searchInput?.addEventListener("input", applyFilters);
  elements.paymentFilter?.addEventListener("change", applyFilters);
  elements.focusStudentSearchButton?.addEventListener("click", focusStudentSearch);
  elements.jumpToRosterButton?.addEventListener("click", jumpToRoster);

  updateDashboardDate();
  fetchStudents(currentLevel);
}
