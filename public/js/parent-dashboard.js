"use strict";

const PARENT_TOKEN_KEY = "parentToken";

const elements = {
  liveBanner: document.getElementById("live-class-banner"),
  joinLiveClassButton: document.getElementById("join-live-class-btn"),
  dashboardError: document.getElementById("dashboard-error"),
  loadingState: document.getElementById("loading-state"),
  dashboardContent: document.getElementById("dashboard-content"),
  studentAvatar: document.getElementById("student-avatar"),
  studentName: document.getElementById("student-name"),
  studentLevel: document.getElementById("student-level"),
  accountStatus: document.getElementById("account-status"),
  cardReuploadPanel: document.getElementById("card-reupload-panel"),
  replacementCardInput: document.getElementById("replacement-card-input"),
  replacementCardButton: document.getElementById("replacement-card-button"),
  paymentStatus: document.getElementById("payment-status"),
  universityPaymentUpgrade: document.getElementById("university-payment-upgrade"),
  universityUpgradeButton: document.getElementById("university-upgrade-button"),
  universityPaymentTransfer: document.getElementById("university-payment-transfer"),
  parentPaymentReceiptInput: document.getElementById("parent-payment-receipt-input"),
  parentPaymentSubmit: document.getElementById("parent-payment-submit"),
  parentPaymentPending: document.getElementById("parent-payment-pending"),
  parentPaymentConfirmed: document.getElementById("parent-payment-confirmed"),
  parentScheduleList: document.getElementById("parent-schedule-list"),
  teacherAbsenceNotice: document.getElementById("teacher-absence-notice"),
  logoutButton: document.getElementById("logout-btn"),
  materialsList: document.getElementById("materials-list"),
  attendanceCount: document.getElementById("attendance-count"),
  studentSwitcher: document.getElementById("student-switcher"),
  studentSwitcherList: document.getElementById("student-switcher-list"),
  paymentAccessModal: document.getElementById("payment-access-modal"),
  paymentAccessTitle: document.getElementById("payment-access-title"),
  paymentAccessHeadMessage: document.getElementById("payment-access-head-message"),
  paymentAccessMessage: document.getElementById("payment-access-message"),
  callTeacherNowButton: document.getElementById("call-teacher-now-btn"),
  declineRegistrationButton: document.getElementById("decline-registration-btn"),
};

let socket = null;
let currentStudent = null;
let currentStudents = [];
let currentLobbyLevel = null;
let paymentReturnRefreshTimer = null;
let activeLiveClassType = null;
let universityPaymentTransferRequested = false;
let parentScheduledClasses = [];
let parentTeacherAbsent = false;

function clearParentSession() {
  [
    PARENT_TOKEN_KEY,
    "parentPhone",
    "studentName",
    "level",
    "studentLevel",
    "studentId",
    "currentStudent",
    "student",
    "loggedInStudent",
    "selectedStudentId",
    "parentStudents",
    "userRole",
    "studentMicPreflight",
  ].forEach((key) => sessionStorage.removeItem(key));
}

function redirectToParentLogin() {
  clearParentSession();
  window.location.replace("./parent-login.html");
}

function getParentToken() {
  const token = sessionStorage.getItem(PARENT_TOKEN_KEY);

  if (!token) {
    redirectToParentLogin();
    return null;
  }

  return token;
}

function showError(message = "") {
  if (!elements.dashboardError) {
    return;
  }

  elements.dashboardError.textContent = message;
  elements.dashboardError.classList.toggle("is-visible", Boolean(message));
}

function clearError() {
  showError();
}

function openPaymentAccessModal(reason = "access") {
  if (!elements.paymentAccessModal) {
    return;
  }

  const subscriptionUpgrade = reason === "subscription-upgrade";
  if (elements.paymentAccessTitle) {
    elements.paymentAccessTitle.textContent = subscriptionUpgrade
      ? "هذه الحصة مخصصة للاشتراك المدفوع"
      : "الدخول للحصة يحتاج إلى تفعيل";
  }
  if (elements.paymentAccessHeadMessage) {
    elements.paymentAccessHeadMessage.textContent = subscriptionUpgrade
      ? "أنت مشترك في المجاني فقط وهذه الحصة المدفوعة الآن للطلبة ذوي الاشتراك المدفوع."
      : "لم يتم تأكيد الدفع أو إبلاغ الأستاذ بموعد الدفع.";
  }
  if (elements.paymentAccessMessage) {
    elements.paymentAccessMessage.textContent = subscriptionUpgrade
      ? "للترقية إلى الاشتراك المدفوع، اضغط على الزر الأخضر واتصل بالأستاذ مباشرة على الرقم 0556960950."
      : "إذا كنت تريد الدفع، اضغط على الزر الأخضر واتصل بالأستاذ مباشرة على الرقم 0556960950.";
  }

  elements.paymentAccessModal.hidden = false;
  document.body.style.overflow = "hidden";
}

function closePaymentAccessModal() {
  if (!elements.paymentAccessModal) {
    return;
  }

  elements.paymentAccessModal.hidden = true;
  document.body.style.overflow = "";
}

function setLiveClassVisible(isVisible) {
  elements.liveBanner?.classList.toggle("is-visible", Boolean(isVisible));
}

function getInitials(name) {
  const words = String(name || "تلميذ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return (
    words
      .slice(0, 2)
      .map((word) => word.charAt(0))
      .join("") || "ت"
  );
}

function renderStudentSwitcher(students) {
  if (!elements.studentSwitcher || !elements.studentSwitcherList) {
    return;
  }

  const hasMultipleStudents = students.length > 1;
  elements.studentSwitcher.hidden = !hasMultipleStudents;
  elements.studentSwitcherList.replaceChildren();

  if (!hasMultipleStudents) {
    return;
  }

  for (const student of students) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "student-switcher-card";
    button.setAttribute("role", "listitem");
    button.classList.toggle("is-active", currentStudent?.id === student.id);
    button.setAttribute(
      "aria-label",
      `عرض ملف التلميذ ${student.studentName}، ${student.level}`
    );

    const avatar = document.createElement("span");
    avatar.className = "student-switcher-avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = getInitials(student.studentName);

    const copy = document.createElement("span");
    copy.className = "student-switcher-card-copy";

    const name = document.createElement("strong");
    name.textContent = student.studentName;
    const level = document.createElement("small");
    level.textContent = student.level;
    copy.append(name, level);

    const check = document.createElement("span");
    check.className = "student-switcher-check";
    check.setAttribute("aria-hidden", "true");
    check.textContent = "✓";

    button.append(avatar, copy, check);
    button.addEventListener("click", () => selectStudent(student.id));
    elements.studentSwitcherList.append(button);
  }
}

function scheduleTypeLabel(level, subject) {
  const labels = level === "طالب جامعي"
    ? { PAID: "اشتراك مدفوع", FREE: "اشتراك مجاني" }
    : { MATH: "الرياضيات", PHYSICS: "الفيزياء" };
  return labels[subject] || "حصة مبرمجة";
}

function formatParentScheduleDate(value) {
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

function renderParentSchedule() {
  if (elements.teacherAbsenceNotice) {
    elements.teacherAbsenceNotice.hidden = !parentTeacherAbsent;
  }
  if (!elements.parentScheduleList) return;
  elements.parentScheduleList.replaceChildren();

  if (!parentScheduledClasses.length) {
    const empty = document.createElement("p");
    empty.className = "parent-schedule-empty";
    empty.textContent = "لا توجد حصص مبرمجة لهذا المستوى حالياً.";
    elements.parentScheduleList.append(empty);
    return;
  }

  parentScheduledClasses.forEach((scheduledClass) => {
    const item = document.createElement("article");
    item.className = "parent-schedule-item";
    const content = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = scheduleTypeLabel(currentStudent?.level, scheduledClass.subject);
    const date = document.createElement("span");
    date.textContent = formatParentScheduleDate(scheduledClass.scheduledAt);
    content.append(title, date);
    const dot = document.createElement("i");
    dot.setAttribute("aria-hidden", "true");
    item.append(content, dot);
    elements.parentScheduleList.append(item);
  });
}

async function loadParentSchedule(level) {
  try {
    const response = await parentFetch(`/api/schedules/${encodeURIComponent(level)}`, {
      headers: { Accept: "application/json" },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "تعذر تحميل برنامج الحصص.");
    if (!currentStudent || currentStudent.level !== level) return;

    parentScheduledClasses = Array.isArray(payload.scheduledClasses) ? payload.scheduledClasses : [];
    parentTeacherAbsent = payload.teacherAbsent === true;
    renderParentSchedule();
  } catch (error) {
    console.error("Unable to load parent schedule:", error);
  }
}

function selectStudent(studentId) {
  const student = currentStudents.find((item) => item.id === studentId);
  if (!student) {
    return;
  }

  currentStudent = student;
  sessionStorage.setItem("selectedStudentId", student.id);
  sessionStorage.setItem("parentStudents", JSON.stringify(currentStudents));
  persistStudentSession(student);
  renderStudentSwitcher(currentStudents);
  renderStudent(student);
  elements.dashboardContent.hidden = false;
  clearError();
  emitLobbyJoin(student.level);
  void loadAttendanceCount(student.id);
  void loadParentSchedule(student.level);
}

function secondarySubscriptionLabel(student) {
  if (student.mathEnrollment && student.physicsEnrollment) return "فيزياء ورياضيات";
  if (student.physicsEnrollment) return "فيزياء فقط";
  return "رياضيات فقط";
}

function renderUniversityPaymentUpgrade(student, isPaidSubscription) {
  const isUniversityStudent = student.level === "طالب جامعي";
  const receiptPending = Boolean(student.paymentReceiptPending);
  const showUpgrade = isUniversityStudent && !isPaidSubscription;

  if (elements.universityPaymentUpgrade) {
    elements.universityPaymentUpgrade.hidden = !showUpgrade;
  }
  if (elements.parentPaymentConfirmed) {
    elements.parentPaymentConfirmed.hidden = !(isUniversityStudent && isPaidSubscription && Boolean(student.paymentReceiptUrl));
  }
  if (!showUpgrade) {
    universityPaymentTransferRequested = false;
    return;
  }

  if (elements.universityUpgradeButton) {
    elements.universityUpgradeButton.hidden = receiptPending;
  }
  if (elements.universityPaymentTransfer) {
    elements.universityPaymentTransfer.hidden = !receiptPending && !universityPaymentTransferRequested;
  }
  if (elements.parentPaymentReceiptInput) {
    elements.parentPaymentReceiptInput.disabled = receiptPending;
  }
  if (elements.parentPaymentSubmit) {
    elements.parentPaymentSubmit.disabled = receiptPending;
  }
  if (elements.parentPaymentPending) {
    elements.parentPaymentPending.hidden = !receiptPending;
    elements.parentPaymentPending.textContent = receiptPending
      ? "تم إرسال وصل الدفع بنجاح. الوصل في انتظار تأكيد الأستاذ."
      : "";
  }
}

function renderStudent(student) {
  elements.studentAvatar.textContent = getInitials(student.studentName);
  elements.studentName.textContent = student.studentName;
  elements.studentLevel.textContent = student.level;
  const isUniversityStudent = student.level === "طالب جامعي";
  const accountActive = student.accountActive !== false && !student.cardReuploadRequested;
  const identityPending =
    isUniversityStudent &&
    student.accountActive === false &&
    !student.cardReuploadRequested &&
    Boolean(student.cardPhotoUrl);
  if (elements.accountStatus) {
    elements.accountStatus.textContent = student.cardReuploadRequested
      ? "إعادة رفع البطاقة مطلوبة"
      : identityPending
        ? "في انتظار تأكيد هوية البطاقة"
        : accountActive
          ? "حساب مفعل"
          : "حساب غير مفعل";
    elements.accountStatus.classList.toggle("is-active", accountActive);
    elements.accountStatus.classList.toggle("is-inactive", !accountActive && !identityPending);
    elements.accountStatus.classList.toggle("is-pending", identityPending);
  }
  if (elements.cardReuploadPanel) {
    elements.cardReuploadPanel.hidden = !(
      student.level === "طالب جامعي" && Boolean(student.cardReuploadRequested)
    );
  }

  const paymentStage = student.paymentStage || (student.paymentStatus ? "PAID" : "UNPAID");
  const isPaid = paymentStage === "PAID";
  elements.paymentStatus.textContent = isUniversityStudent
    ? isPaid ? "اشتراك مدفوع" : "اشتراك مجاني"
    : secondarySubscriptionLabel(student);
  elements.paymentStatus.classList.toggle("is-paid", isUniversityStudent && isPaid);
  elements.paymentStatus.classList.toggle("is-free", isUniversityStudent && !isPaid);
  elements.paymentStatus.classList.toggle("is-subject", !isUniversityStudent);
  renderUniversityPaymentUpgrade(student, isPaid);
}

/**
 * Save the exact identity required by student-live.js immediately before any
 * viewer handoff. These fields are not authorization credentials; the parent
 * JWT remains separate and is never exposed to the viewer as a socket token.
 */
function persistStudentSession(student) {
  sessionStorage.setItem("studentName", student.studentName);
  sessionStorage.setItem("level", student.level);
  sessionStorage.setItem("studentLevel", student.level);
  sessionStorage.setItem("studentId", student.id);
  sessionStorage.setItem("currentStudent", JSON.stringify(student));
}

async function parentFetch(url, options = {}) {
  const token = getParentToken();
  if (!token) {
    throw new Error("انتهت جلسة الولي.");
  }

  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401 || response.status === 403) {
    redirectToParentLogin();
    throw new Error("انتهت الجلسة أو لا تملك صلاحية الوصول إلى هذه البيانات.");
  }

  return response;
}

function formatMaterialDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "تاريخ غير متاح";
  }

  return new Intl.DateTimeFormat("ar-DZ", { dateStyle: "medium" }).format(date);
}

function isSafeMaterialUrl(fileUrl) {
  return /^\/uploads\/[A-Za-z0-9_.%\-]+$/.test(String(fileUrl || ""));
}

function renderMaterials(materials) {
  if (!elements.materialsList) {
    return;
  }

  elements.materialsList.replaceChildren();

  if (!materials.length) {
    const empty = document.createElement("p");
    empty.className = "materials-empty";
    empty.textContent = "لا توجد ملفات حالياً";
    elements.materialsList.append(empty);
    return;
  }

  for (const material of materials) {
    if (!isSafeMaterialUrl(material.fileUrl)) {
      continue;
    }

    const link = document.createElement("a");
    link.className = "material-list-item";
    link.href = material.fileUrl;
    link.download = "";
    link.setAttribute("aria-label", `تحميل الملف: ${material.title || "ملف تعليمي"}`);

    const icon = document.createElement("span");
    icon.className = "material-list-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "▣";

    const copy = document.createElement("span");
    copy.className = "material-list-copy";

    const title = document.createElement("strong");
    title.className = "material-list-title";
    title.textContent = String(material.title || "ملف تعليمي");

    const date = document.createElement("small");
    date.className = "material-list-date";
    date.textContent = `أُضيف في ${formatMaterialDate(material.createdAt)}`;

    const downloadIcon = document.createElement("span");
    downloadIcon.className = "material-download-icon";
    downloadIcon.setAttribute("aria-hidden", "true");
    downloadIcon.textContent = "↓";

    copy.append(title, date);
    link.append(icon, copy, downloadIcon);
    elements.materialsList.append(link);
  }

  if (!elements.materialsList.childElementCount) {
    renderMaterials([]);
  }
}

async function loadMaterials(level) {
  if (!elements.materialsList || !level) {
    return;
  }

  elements.materialsList.replaceChildren();
  const loading = document.createElement("p");
  loading.className = "materials-empty";
  loading.textContent = "جارٍ تحميل الملفات...";
  elements.materialsList.append(loading);

  try {
    const response = await parentFetch(`/api/materials/${encodeURIComponent(level)}`, {
      headers: { Accept: "application/json" },
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error || "تعذر تحميل الملفات حالياً.");
    }

    renderMaterials(Array.isArray(payload.data) ? payload.data : []);
  } catch (error) {
    if (/انتهت الجلسة/.test(error.message)) {
      return;
    }

    console.error("Unable to load course materials:", error);
    elements.materialsList.replaceChildren();
    const unavailable = document.createElement("p");
    unavailable.className = "materials-empty";
    unavailable.textContent = "تعذر تحميل الملفات حالياً.";
    elements.materialsList.append(unavailable);
  }
}

function updateAttendanceCount(value) {
  if (elements.attendanceCount) {
    elements.attendanceCount.textContent = String(value);
  }
}

async function loadAttendanceCount(studentId) {
  if (!studentId) {
    updateAttendanceCount(0);
    return;
  }

  try {
    const response = await parentFetch(
      `/api/attendance/student/${encodeURIComponent(studentId)}`,
      { headers: { Accept: "application/json" } }
    );
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error || "تعذر تحميل سجل الحضور.");
    }

    updateAttendanceCount(Array.isArray(payload.data) ? payload.data.length : 0);
  } catch (error) {
    if (/انتهت الجلسة/.test(error.message)) {
      return;
    }

    console.error("Unable to load attendance count:", error);
    updateAttendanceCount(0);
  }
}

function emitLobbyJoin(level) {
  if (!level || !socket?.connected) {
    return;
  }

  currentLobbyLevel = level;

  socket.emit("join_level_lobby", { level }, (response) => {
    if (!response?.ok) {
      showError(
        response?.message || response?.error || "تعذر متابعة حالة الحصة المباشرة."
      );
      return;
    }

    // The acknowledgement restores the existing state; subsequent events keep
    // it current while the parent remains on this dashboard.
    activeLiveClassType = response.isClassLive ? response.subject || null : null;
    setLiveClassVisible(Boolean(response.isClassLive));
  });
}

async function loadDashboard({ backgroundRefresh = false } = {}) {
  const parentPhone = sessionStorage.getItem("parentPhone");

  if (!parentPhone || !getParentToken()) {
    return;
  }

  if (!backgroundRefresh) {
    clearError();
    elements.loadingState.hidden = false;
    elements.dashboardContent.hidden = true;
    setLiveClassVisible(false);
  }

  try {
    const response = await parentFetch(
      `/api/students/parent/${encodeURIComponent(parentPhone)}`,
      { headers: { Accept: "application/json" } }
    );
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error || payload.message || "تعذر تحميل بيانات التلميذ.");
    }

    const students = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.students)
        ? payload.students
        : payload?.id
          ? [payload]
          : [];

    if (!students.length) {
      throw new Error("لم يتم العثور على تلاميذ مرتبطين بهذا الرقم.");
    }

    currentStudents = students;
    sessionStorage.setItem("parentStudents", JSON.stringify(currentStudents));

    const storedStudentId = sessionStorage.getItem("selectedStudentId");
    const selectedStudent =
      currentStudents.find((student) => student.id === storedStudentId) || currentStudents[0];
    selectStudent(selectedStudent.id);
  } catch (error) {
    if (!/انتهت الجلسة/.test(error.message)) {
      console.error("Unable to load parent dashboard:", error);
      if (!backgroundRefresh) {
        showError(error.message || "تعذر تحميل بيانات التلميذ. حاول مرة أخرى.");
      }
    }
  } finally {
    if (!backgroundRefresh) {
      elements.loadingState.hidden = true;
    }
  }
}

async function prepareStudentMicrophonePermission() {
  sessionStorage.removeItem("studentMicPreflight");

  if (!navigator.mediaDevices?.getUserMedia) {
    return;
  }

  try {
    // This is called inside the parent's intentional classroom-entry click.
    // The stream is immediately stopped: it exists only to save the browser
    // permission for the viewer, not to transmit any student audio here.
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    sessionStorage.setItem("studentMicPreflight", "granted");
  } catch (error) {
    // The class remains viewable if the learner chooses not to share a mic.
    console.info("Student microphone preflight was not granted:", error?.name || error);
  }
}

async function enterLiveClass() {
  if (!currentStudent) {
    showError("تعذر فتح الحصة قبل تحميل بيانات التلميذ.");
    return;
  }

  const isUniversityStudent = currentStudent.level === "طالب جامعي";
  const isPaidSubscription =
    currentStudent.paymentStage === "PAID" || currentStudent.paymentStatus === true;
  const identityPending =
    isUniversityStudent &&
    currentStudent.accountActive === false &&
    !currentStudent.cardReuploadRequested &&
    Boolean(currentStudent.cardPhotoUrl);

  if (currentStudent.cardReuploadRequested || identityPending) {
    showError(
      currentStudent.cardReuploadRequested
        ? "يجب رفع بطاقة جديدة أولاً قبل دخول الحصة."
        : "حساب الطالب في انتظار تأكيد هوية البطاقة من الأستاذ."
    );
    return;
  }

  if (!currentStudent.liveAccessEnabled) {
    clearError();
    openPaymentAccessModal();
    return;
  }

  if (isUniversityStudent && !isPaidSubscription && activeLiveClassType === "PAID") {
    clearError();
    openPaymentAccessModal("subscription-upgrade");
    return;
  }

  const originalLabel = elements.joinLiveClassButton?.textContent;
  if (elements.joinLiveClassButton) {
    elements.joinLiveClassButton.disabled = true;
    elements.joinLiveClassButton.textContent = "جارٍ تجهيز الحصة…";
  }

  // Use this exact user gesture to request the browser mic permission once.
  // On return, the viewer keeps the track disabled until teacher approval.
  await prepareStudentMicrophonePermission();
  persistStudentSession(currentStudent);
  sessionStorage.setItem("joinLiveClassImmediately", "true");
  window.location.assign("./student-live.html?join=direct");

  // Navigation normally begins immediately; this is only a safe fallback.
  if (elements.joinLiveClassButton) {
    elements.joinLiveClassButton.disabled = false;
    elements.joinLiveClassButton.textContent = originalLabel || "الدخول إلى الحصة";
  }
}

function refreshAccessAfterReturningFromCall() {
  if (document.hidden || paymentReturnRefreshTimer) {
    return;
  }

  paymentReturnRefreshTimer = window.setTimeout(() => {
    paymentReturnRefreshTimer = null;
    void loadDashboard({ backgroundRefresh: true });
  }, 450);
}

function openUniversityPaymentTransfer() {
  universityPaymentTransferRequested = true;
  if (elements.universityPaymentTransfer) {
    elements.universityPaymentTransfer.hidden = false;
    elements.universityPaymentTransfer.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

async function submitUniversityPaymentReceipt() {
  const receipt = elements.parentPaymentReceiptInput?.files?.[0];
  if (!receipt || !currentStudent) {
    showError("اختر صورة وصل الدفع أولاً.");
    return;
  }

  const originalLabel = elements.parentPaymentSubmit?.textContent;
  if (elements.parentPaymentSubmit) {
    elements.parentPaymentSubmit.disabled = true;
    elements.parentPaymentSubmit.textContent = "جارٍ إرسال الوصل…";
  }

  try {
    const formData = new FormData();
    formData.append("paymentReceipt", receipt);
    const response = await parentFetch(
      `/api/students/${encodeURIComponent(currentStudent.id)}/payment-receipt`,
      { method: "POST", body: formData }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "تعذر إرسال وصل الدفع.");
    }

    elements.parentPaymentReceiptInput.value = "";
    universityPaymentTransferRequested = true;
    await loadDashboard({ backgroundRefresh: true });
  } catch (error) {
    if (!/انتهت الجلسة/.test(error.message)) {
      showError(error.message || "تعذر إرسال وصل الدفع.");
    }
  } finally {
    if (elements.parentPaymentSubmit && !currentStudent?.paymentReceiptPending) {
      elements.parentPaymentSubmit.disabled = false;
      elements.parentPaymentSubmit.textContent = originalLabel || "إرسال وصل الدفع للأستاذ";
    }
  }
}

async function uploadReplacementCard() {
  const file = elements.replacementCardInput?.files?.[0];
  if (!file || !currentStudent) {
    return;
  }

  const originalLabel = elements.replacementCardButton?.textContent;
  if (elements.replacementCardButton) {
    elements.replacementCardButton.disabled = true;
    elements.replacementCardButton.textContent = "جارٍ رفع البطاقة…";
  }

  try {
    const formData = new FormData();
    formData.append("cardPhoto", file);
    const response = await parentFetch(
      `/api/students/${encodeURIComponent(currentStudent.id)}/card-photo`,
      { method: "POST", body: formData }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "تعذر رفع البطاقة الجديدة.");
    }

    elements.replacementCardInput.value = "";
    await loadDashboard({ backgroundRefresh: true });
  } catch (error) {
    if (!/انتهت الجلسة/.test(error.message)) {
      showError(error.message || "تعذر رفع البطاقة الجديدة.");
    }
  } finally {
    if (elements.replacementCardButton) {
      elements.replacementCardButton.disabled = false;
      elements.replacementCardButton.textContent = originalLabel || "رفع بطاقة جديدة";
    }
  }
}

function logout() {
  clearParentSession();
  window.location.replace("./parent-login.html");
}

function initializeLobbySocket() {
  // Socket.io is loaded by parent-dashboard.html before this script.
  if (typeof io !== "function") {
    showError("تعذر متابعة حالة الحصة المباشرة حالياً.");
    return;
  }

  socket = io();

  socket.on("connect", () => {
    if (currentStudent?.level) {
      emitLobbyJoin(currentStudent.level);
    }
  });

  socket.on("live_class_started", (data = {}) => {
    if (!currentStudent || (data.level && data.level !== currentStudent.level)) {
      return;
    }

    activeLiveClassType = data.subject || null;
    setLiveClassVisible(true);
  });

  socket.on("live_class_ended", (data = {}) => {
    if (!currentStudent || (data.level && data.level !== currentStudent.level)) {
      return;
    }

    activeLiveClassType = null;
    setLiveClassVisible(false);
  });

  socket.on("student_live_access_updated", (data = {}) => {
    if (!currentStudent || data.studentId !== currentStudent.id) {
      return;
    }

    // The teacher has just opened or blocked this exact learner's class access.
    // Refresh authenticated dashboard data immediately without reloading the page.
    void loadDashboard({ backgroundRefresh: true });
  });

  socket.on("student_account_status_updated", (data = {}) => {
    if (!currentStudent || data.studentId !== currentStudent.id) {
      return;
    }

    void loadDashboard({ backgroundRefresh: true });
  });

  socket.on("student_payment_receipt_updated", (data = {}) => {
    if (!currentStudent || data.studentId !== currentStudent.id) {
      return;
    }

    void loadDashboard({ backgroundRefresh: true });
  });

  socket.on("class_schedule_updated", (data = {}) => {
    if (!currentStudent || data.level !== currentStudent.level) {
      return;
    }

    void loadParentSchedule(currentStudent.level);
  });

  socket.on("teacher_absence_updated", (data = {}) => {
    if (!currentStudent || data.level !== currentStudent.level) {
      return;
    }

    parentTeacherAbsent = data.isAbsent === true;
    renderParentSchedule();
  });

  socket.on("disconnect", () => {
    // Never leave an unverified positive state visible while the status socket
    // is unavailable. The ACK restores it once Socket.io reconnects.
    activeLiveClassType = null;
    setLiveClassVisible(false);
  });

  socket.on("classroom_error", (data = {}) => {
    if (data.event === "join_level_lobby" && data.message) {
      showError(data.message);
    }
  });
}

if (!getParentToken()) {
  // getParentToken has already initiated the login redirect.
} else {
  elements.joinLiveClassButton?.addEventListener("click", () => {
    void enterLiveClass();
  });
  elements.universityUpgradeButton?.addEventListener("click", openUniversityPaymentTransfer);
  elements.parentPaymentSubmit?.addEventListener("click", () => {
    void submitUniversityPaymentReceipt();
  });
  elements.replacementCardButton?.addEventListener("click", () => {
    elements.replacementCardInput?.click();
  });
  elements.replacementCardInput?.addEventListener("change", () => {
    void uploadReplacementCard();
  });
  elements.logoutButton?.addEventListener("click", logout);
  elements.callTeacherNowButton?.addEventListener("click", () => {
    closePaymentAccessModal();
  });
  elements.declineRegistrationButton?.addEventListener("click", () => {
    closePaymentAccessModal();
    window.location.assign("./index.html");
  });
  elements.paymentAccessModal?.addEventListener("click", (event) => {
    if (event.target === elements.paymentAccessModal) {
      closePaymentAccessModal();
    }
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closePaymentAccessModal();
    }
  });
  window.addEventListener("focus", refreshAccessAfterReturningFromCall);
  window.addEventListener("pageshow", refreshAccessAfterReturningFromCall);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      refreshAccessAfterReturningFromCall();
    }
  });
  initializeLobbySocket();
  loadDashboard();
}
