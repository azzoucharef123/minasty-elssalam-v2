"use strict";

const PARENT_TOKEN_KEY = "parentToken";

const elements = {
  liveBanner: document.getElementById("live-class-banner"),
  joinLiveClassButton: document.getElementById("join-live-class-btn"),
  dashboardError: document.getElementById("dashboard-error"),
  loadingState: document.getElementById("loading-state"),
  dashboardContent: document.getElementById("dashboard-content"),
  lessonRepositoryCard: document.getElementById("lesson-repository-card"),
  studentAvatar: document.getElementById("student-avatar"),
  studentName: document.getElementById("student-name"),
  studentLevel: document.getElementById("student-level"),
  accountStatus: document.getElementById("account-status"),
  cardReuploadPanel: document.getElementById("card-reupload-panel"),
  replacementCardInput: document.getElementById("replacement-card-input"),
  replacementCardButton: document.getElementById("replacement-card-button"),
  paymentStatus: document.getElementById("payment-status"),
  secondaryPaymentState: document.getElementById("secondary-payment-state"),
  universityPaymentUpgrade: document.getElementById("university-payment-upgrade"),
  universityUpgradeButton: document.getElementById("university-upgrade-button"),
  universityPaymentTransfer: document.getElementById("university-payment-transfer"),
  parentPaymentReceiptInput: document.getElementById("parent-payment-receipt-input"),
  parentPaymentSubmit: document.getElementById("parent-payment-submit"),
  parentPaymentPending: document.getElementById("parent-payment-pending"),
  parentPaymentConfirmed: document.getElementById("parent-payment-confirmed"),
  secondaryPaymentUpgrade: document.getElementById("secondary-payment-upgrade"),
  secondaryUpgradeButton: document.getElementById("secondary-upgrade-button"),
  secondaryPaymentTransfer: document.getElementById("secondary-payment-transfer"),
  secondarySubscriptionType: document.getElementById("secondary-subscription-type"),
  secondaryPaymentReceiptInput: document.getElementById("secondary-payment-receipt-input"),
  secondaryPaymentSubmit: document.getElementById("secondary-payment-submit"),
  secondaryPaymentPending: document.getElementById("secondary-payment-pending"),
  parentScheduleList: document.getElementById("parent-schedule-list"),
  teacherAbsenceNotice: document.getElementById("teacher-absence-notice"),
  logoutButton: document.getElementById("logout-btn"),
  lessonVideoList: document.getElementById("lesson-video-list"),
  lessonRepositoryLevelCaption: document.getElementById("lesson-repository-level-caption"),
  lessonVideoModal: document.getElementById("lesson-video-modal"),
  lessonVideoModalTitle: document.getElementById("lesson-video-modal-title"),
  lessonVideoSidebarTitle: document.getElementById("lesson-video-sidebar-title"),
  lessonVideoSidebarMeta: document.getElementById("lesson-video-sidebar-meta"),
  lessonVideoFrame: document.getElementById("lesson-video-frame"),
  lessonVideoPlayerShell: document.querySelector(".lesson-video-player-shell"),
  lessonVideoFullscreen: document.getElementById("lesson-video-fullscreen"),
  lessonVideoRotate: document.getElementById("lesson-video-rotate"),
  lessonVideoClose: document.getElementById("lesson-video-close"),
  materialsList: document.getElementById("materials-list"),
  attendanceCount: document.getElementById("attendance-count"),
  studentSwitcher: document.getElementById("student-switcher"),
  studentSwitcherList: document.getElementById("student-switcher-list"),
  activeStudentBar: document.getElementById("active-student-bar"),
  activeStudentName: document.getElementById("active-student-name"),
  changeStudentButton: document.getElementById("change-student-button"),
  paymentAccessModal: document.getElementById("payment-access-modal"),
  paymentAccessTitle: document.getElementById("payment-access-title"),
  paymentAccessHeadMessage: document.getElementById("payment-access-head-message"),
  paymentAccessMessage: document.getElementById("payment-access-message"),
  callTeacherNowButton: document.getElementById("call-teacher-now-btn"),
  declineRegistrationButton: document.getElementById("decline-registration-btn"),
  parentKpiSubscription: document.getElementById("parent-kpi-subscription"),
  parentKpiNextClass: document.getElementById("parent-kpi-next-class"),
  parentKpiRating: document.getElementById("parent-kpi-rating"),
  parentSidebar: document.getElementById("parent-sidebar"),
  parentSidebarBackdrop: document.getElementById("parent-sidebar-backdrop"),
  parentSidebarToggle: document.getElementById("parent-sidebar-toggle"),
  parentSidebarClose: document.getElementById("parent-sidebar-close"),
  parentSidebarLogout: document.getElementById("parent-sidebar-logout"),
  parentNavLinks: Array.from(document.querySelectorAll(".parent-nav-link")),
  documentFeedbackModal: document.getElementById("document-feedback-modal"),
  documentFeedbackTitle: document.getElementById("document-feedback-title"),
  documentFeedbackMessage: document.getElementById("document-feedback-message"),
  documentFeedbackClose: document.getElementById("document-feedback-close"),
};

let socket = null;
let currentStudent = null;
let currentStudents = [];
let currentLobbyLevel = null;
let paymentReturnRefreshTimer = null;
let activeLiveClassType = null;
let universityPaymentTransferRequested = false;
let secondaryPaymentTransferRequested = false;
let lessonVideoPreviousFocus = null;
let parentScheduledClasses = [];
let parentTeacherAbsent = false;
let teacherAbsenceLevel = null;

const LEVEL_DISPLAY_LABELS = Object.freeze({
  "السنة الأولى": "السنة الأولى متوسط",
  "السنة الثانية": "السنة الثانية متوسط",
  "السنة الثالثة": "السنة الثالثة متوسط",
  "السنة الرابعة": "السنة الرابعة متوسط",
  "طالب جامعي": "طالب جامعي",
});

function displayLevelLabel(level) {
  return LEVEL_DISPLAY_LABELS[level] || level || "—";
}

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

function openDocumentFeedback(message, title = "تعذر إتمام العملية") {
  if (!elements.documentFeedbackModal) {
    showError(message);
    return;
  }
  if (elements.documentFeedbackTitle) elements.documentFeedbackTitle.textContent = title;
  if (elements.documentFeedbackMessage) elements.documentFeedbackMessage.textContent = String(message || "تعذر إتمام العملية.");
  elements.documentFeedbackModal.hidden = false;
  elements.documentFeedbackModal.classList.add("is-open");
  elements.documentFeedbackClose?.focus();
}

function closeDocumentFeedback() {
  elements.documentFeedbackModal?.classList.remove("is-open");
  if (elements.documentFeedbackModal) elements.documentFeedbackModal.hidden = true;
}

function openPaymentAccessModal(reason = "access") {
  if (!elements.paymentAccessModal) {
    return;
  }

  const subscriptionUpgrade = reason === "subscription-upgrade";
  const subjectUpgrade = reason === "subject-upgrade";
  const requiredSubject = activeLiveClassType === "PHYSICS" ? "الفيزياء" : "الرياضيات";
  const currentSubject = activeLiveClassType === "PHYSICS" ? "الرياضيات" : "الفيزياء";
  if (elements.paymentAccessTitle) {
    elements.paymentAccessTitle.textContent = subscriptionUpgrade
      ? "هذه الحصة مخصصة للاشتراك المدفوع"
      : subjectUpgrade
        ? `حصة اليوم ${requiredSubject}`
        : "الدخول للحصة يحتاج إلى تفعيل";
  }
  if (elements.paymentAccessHeadMessage) {
    elements.paymentAccessHeadMessage.textContent = subscriptionUpgrade
      ? "أنت مشترك في المجاني فقط وهذه الحصة المدفوعة الآن للطلبة ذوي الاشتراك المدفوع."
      : subjectUpgrade
        ? `حصة اليوم ${requiredSubject} وأنت مشترك في ${currentSubject} فقط.`
        : "لم يتم تأكيد الدفع أو إبلاغ الأستاذ بموعد الدفع.";
  }
  if (elements.paymentAccessMessage) {
    elements.paymentAccessMessage.textContent = subscriptionUpgrade
      ? "للترقية إلى الاشتراك المدفوع، اضغط على الزر الأخضر واتصل بالأستاذ مباشرة على الرقم 0556960950."
      : subjectUpgrade
        ? `إذا كنت تريد الاشتراك في ${requiredSubject}، اتصل بالأستاذ مباشرة على الرقم 0556960950.`
        : "إذا كنت تريد الدفع، اضغط على الزر الأخضر واتصل بالأستاذ مباشرة على الرقم 0556960950.";
  }
  if (elements.declineRegistrationButton) {
    elements.declineRegistrationButton.textContent = subjectUpgrade
      ? `لا أريد الاشتراك في ${requiredSubject}`
      : "لا أريد التسجيل";
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
    button.className = "student-switcher-card student-switcher-tab";
    button.setAttribute("role", "listitem");
    button.classList.toggle("is-active", currentStudent?.id === student.id);
    button.setAttribute(
      "aria-label",
      `عرض ملف التلميذ ${student.studentName}، ${displayLevelLabel(student.level)}`
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
    level.textContent = displayLevelLabel(student.level);
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
  const isAbsenceForCurrentStudent = Boolean(
    parentTeacherAbsent && currentStudent && teacherAbsenceLevel === currentStudent.level
  );
  if (elements.teacherAbsenceNotice) {
    elements.teacherAbsenceNotice.hidden = !isAbsenceForCurrentStudent;
  }
  if (elements.parentKpiNextClass) {
    elements.parentKpiNextClass.textContent = parentScheduledClasses.length
      ? scheduleTypeLabel(currentStudent?.level, parentScheduledClasses[0].subject)
      : "لا توجد";
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
    const subjectIcon = document.createElement("i");
    subjectIcon.className = "parent-schedule-subject-icon";
    subjectIcon.setAttribute("aria-hidden", "true");
    subjectIcon.textContent = scheduledClass.subject === "PHYSICS" ? "ϟ" : scheduledClass.subject === "MATH" ? "∠" : "★";
    const join = document.createElement("button");
    join.type = "button";
    join.className = "parent-schedule-join";
    join.textContent = "دخول الحصة";
    join.disabled = !activeLiveClassType;
    join.title = join.disabled ? "يتفعل الزر عند بدء الحصة" : "الدخول إلى الحصة المباشرة";
    if (!join.disabled) join.addEventListener("click", () => void enterLiveClass());
    item.append(subjectIcon, content, join);
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
    teacherAbsenceLevel = parentTeacherAbsent ? level : null;
    renderParentSchedule();
  } catch (error) {
    console.error("Unable to load parent schedule:", error);
  }
}

function openStudentPicker() {
  if (currentStudents.length < 2 || !elements.studentSwitcher) {
    return;
  }

  elements.studentSwitcher.hidden = false;
  if (elements.dashboardContent) elements.dashboardContent.hidden = true;
  if (elements.activeStudentBar) elements.activeStudentBar.hidden = true;
  renderStudentSwitcher(currentStudents);
  elements.studentSwitcher.querySelector(".student-switcher-card")?.focus();
}

function updateActiveStudentBar(student) {
  const hasMultipleStudents = currentStudents.length > 1;
  if (elements.activeStudentBar) {
    elements.activeStudentBar.hidden = !hasMultipleStudents;
  }
  if (elements.activeStudentName) {
    elements.activeStudentName.textContent = student?.studentName || "—";
  }
}

function selectStudent(studentId) {
  const student = currentStudents.find((item) => item.id === studentId);
  if (!student) {
    return;
  }

  currentStudent = student;
  window.dispatchEvent(new CustomEvent("active-student-changed", { detail: student }));
  // Clear level-specific state before loading the selected student's data so
  // the previous student's schedule or live class cannot flash in the UI.
  parentScheduledClasses = [];
  activeLiveClassType = null;
  setLiveClassVisible(false);
  parentTeacherAbsent = false;
  teacherAbsenceLevel = null;
  renderParentSchedule();
  sessionStorage.setItem("selectedStudentId", student.id);
  sessionStorage.setItem("parentStudents", JSON.stringify(currentStudents));
  persistStudentSession(student);
  renderStudentSwitcher(currentStudents);
  updateActiveStudentBar(student);
  if (elements.studentSwitcher) elements.studentSwitcher.hidden = true;
  renderStudent(student);
  elements.dashboardContent.hidden = false;
  clearError();
  emitLobbyJoin(student.level);
  void loadAttendanceCount(student.id);
  void loadParentSchedule(student.level);
  if (canAccessLessonRepository(student)) {
    void loadLessonVideos(student.level);
  } else {
    elements.lessonVideoList?.replaceChildren();
  }
}

function canAccessLessonRepository(student) {
  if (!student || student.level === "طالب جامعي") return true;
  const stage = student.paymentStage || (student.paymentStatus ? "PAID" : "UNPAID");
  return stage !== "UNPAID";
}

function syncLessonRepositoryVisibility(student) {
  const shouldShow = canAccessLessonRepository(student);
  if (elements.lessonRepositoryCard) {
    elements.lessonRepositoryCard.hidden = !shouldShow;
  }
  if (!shouldShow) {
    elements.lessonVideoList?.replaceChildren();
  }
}

function secondaryPaymentStateLabel(student) {
  const stage = student.paymentStage || (student.paymentStatus ? "PAID" : "UNPAID");
  const amount = Number.isSafeInteger(student.amountDue) && student.amountDue > 0
    ? ` — ${student.amountDue.toLocaleString("ar-DZ")} دج`
    : "";
  return stage === "PAID"
    ? `تم تأكيد الدفع${amount}`
    : stage === "PROMISED"
      ? `الوعد بالدفع${amount}`
      : "لم يتم الدفع";
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

function renderSecondaryPaymentUpgrade(student) {
  const isSecondaryStudent = Boolean(student) && student.level !== "طالب جامعي";
  const paymentStage = student?.paymentStage || (student?.paymentStatus ? "PAID" : "UNPAID");
  const showUpgrade = isSecondaryStudent && paymentStage === "UNPAID";
  const receiptPending = Boolean(student?.paymentReceiptPending);

  if (elements.secondaryPaymentUpgrade) {
    elements.secondaryPaymentUpgrade.hidden = !showUpgrade;
  }
  if (!showUpgrade) {
    secondaryPaymentTransferRequested = false;
    return;
  }

  if (elements.secondaryUpgradeButton) {
    elements.secondaryUpgradeButton.hidden = receiptPending;
  }
  if (elements.secondaryPaymentTransfer) {
    elements.secondaryPaymentTransfer.hidden = !secondaryPaymentTransferRequested;
  }
  if (elements.secondaryPaymentReceiptInput) {
    elements.secondaryPaymentReceiptInput.disabled = receiptPending;
  }
  if (elements.secondaryPaymentSubmit) {
    elements.secondaryPaymentSubmit.disabled = receiptPending;
  }
  if (elements.secondaryPaymentPending) {
    elements.secondaryPaymentPending.hidden = !receiptPending;
    elements.secondaryPaymentPending.textContent = receiptPending
      ? "تم إرسال الوصل واختيار الاشتراك. ينتظر الطلب مراجعة الأستاذ وتأكيد الدفع."
      : "";
  }
}

function renderStudent(student) {
  elements.studentAvatar.textContent = getInitials(student.studentName);
  elements.studentName.textContent = student.studentName;
  elements.studentLevel.textContent = displayLevelLabel(student.level);
  const isUniversityStudent = student.level === "طالب جامعي";
  const paymentStage = student.paymentStage || (student.paymentStatus ? "PAID" : "UNPAID");
  const accountActive = student.accountActive !== false && !student.cardReuploadRequested;
  const identityPending =
    isUniversityStudent &&
    student.accountActive === false &&
    !student.cardReuploadRequested &&
    Boolean(student.cardPhotoUrl);
  if (elements.accountStatus) {
    const secondaryPaid = !isUniversityStudent && ["PAID", "PROMISED"].includes(paymentStage);
    elements.accountStatus.textContent = !isUniversityStudent
      ? secondaryPaid ? "حساب مدفوع" : "حساب مجاني"
      : student.cardReuploadRequested
        ? "إعادة رفع البطاقة مطلوبة"
        : identityPending
          ? "في انتظار تأكيد هوية البطاقة"
          : accountActive
            ? "حساب مفعل"
            : "حساب غير مفعل";
    elements.accountStatus.classList.toggle("is-active", !isUniversityStudent ? secondaryPaid : accountActive);
    elements.accountStatus.classList.toggle("is-inactive", !isUniversityStudent ? !secondaryPaid : !accountActive && !identityPending);
    elements.accountStatus.classList.toggle("is-pending", isUniversityStudent && identityPending);
  }
  if (elements.cardReuploadPanel) {
    elements.cardReuploadPanel.hidden = !(
      student.level === "طالب جامعي" && Boolean(student.cardReuploadRequested)
    );
  }

  const isPaid = paymentStage === "PAID";
  syncLessonRepositoryVisibility(student);
  elements.paymentStatus.textContent = isUniversityStudent
    ? isPaid ? "اشتراك مدفوع" : "اشتراك مجاني"
    : secondarySubscriptionLabel(student);
  elements.paymentStatus.classList.toggle("is-paid", isUniversityStudent && isPaid);
  elements.paymentStatus.classList.toggle("is-free", isUniversityStudent && !isPaid);
  elements.paymentStatus.classList.toggle("is-subject", !isUniversityStudent);
  if (elements.parentKpiSubscription) {
    elements.parentKpiSubscription.textContent = isUniversityStudent
      ? isPaid ? "مدفوع" : "مجاني"
      : secondarySubscriptionLabel(student);
    elements.parentKpiSubscription.classList.toggle("is-paid", isPaid || (!isUniversityStudent && paymentStage !== "UNPAID"));
    elements.parentKpiSubscription.classList.toggle("is-unpaid", !isPaid && (isUniversityStudent || paymentStage === "UNPAID"));
  }
  if (elements.secondaryPaymentState) {
    elements.secondaryPaymentState.hidden = isUniversityStudent;
    elements.secondaryPaymentState.textContent = isUniversityStudent
      ? ""
      : `حالة الدفع: ${secondaryPaymentStateLabel(student)}`;
  }
  renderUniversityPaymentUpgrade(student, isPaid);
  renderSecondaryPaymentUpgrade(student);
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

function formatLessonVideoDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "تاريخ غير متاح";
  return new Intl.DateTimeFormat("ar-DZ", { dateStyle: "medium" }).format(date);
}

function isSafeLessonPreviewUrl(value) {
  const url = String(value || "");
  const isDrive = /^https:\/\/drive\.google\.com\/file\/d\/[A-Za-z0-9_-]{20,200}\/preview$/.test(url);
  const isYouTube = /^https:\/\/www\.youtube\.com\/embed\/[A-Za-z0-9_-]{11}.*$/.test(url);
  return isDrive || isYouTube;
}

function updateLessonFullscreenLabel() {
  if (!elements.lessonVideoFullscreen) return;
  const isFullscreen = document.fullscreenElement === elements.lessonVideoPlayerShell;
  elements.lessonVideoFullscreen.textContent = isFullscreen ? "إغلاق ملء الشاشة" : "ملء الشاشة";
  elements.lessonVideoFullscreen.setAttribute("aria-label", isFullscreen ? "إغلاق ملء الشاشة" : "فتح ملء الشاشة");
}

async function toggleLessonFullscreen() {
  const shell = elements.lessonVideoPlayerShell;
  if (!shell) return;
  try {
    if (document.fullscreenElement === shell) {
      await document.exitFullscreen?.();
      screen.orientation?.unlock?.();
    } else if (shell.requestFullscreen) {
      await shell.requestFullscreen();
    }
  } catch (error) {
    console.warn("Unable to toggle lesson fullscreen:", error);
  } finally {
    updateLessonFullscreenLabel();
  }
}

async function rotateLessonScreen() {
  const shell = elements.lessonVideoPlayerShell;
  if (!shell) return;
  try {
    if (document.fullscreenElement !== shell && shell.requestFullscreen) {
      await shell.requestFullscreen();
    }
    const currentType = screen.orientation?.type || "portrait-primary";
    const targetType = currentType.startsWith("landscape") ? "portrait-primary" : "landscape-primary";
    if (screen.orientation?.lock) {
      await screen.orientation.lock(targetType);
    }
  } catch (error) {
    console.warn("Unable to rotate lesson video:", error);
  } finally {
    updateLessonFullscreenLabel();
  }
}

function closeLessonVideo() {
  if (document.fullscreenElement === elements.lessonVideoPlayerShell) {
    void document.exitFullscreen?.().catch?.(() => {});
  }
  screen.orientation?.unlock?.();
  if (elements.lessonVideoModal) elements.lessonVideoModal.hidden = true;
  if (elements.lessonVideoFrame) elements.lessonVideoFrame.removeAttribute("src");
  document.body.classList.remove("lesson-video-open");
  const previousFocus = lessonVideoPreviousFocus;
  lessonVideoPreviousFocus = null;
  if (previousFocus && typeof previousFocus.focus === "function") {
    window.setTimeout(() => previousFocus.focus(), 0);
  }
}

function openLessonVideo(video) {
  if (!isSafeLessonPreviewUrl(video?.previewUrl) || !elements.lessonVideoModal || !elements.lessonVideoFrame) {
    return;
  }

  lessonVideoPreviousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const title = video.title || "مشاهدة الحصة";
  const date = `أضيفت في ${formatLessonVideoDate(video.createdAt)}`;
  if (elements.lessonVideoModalTitle) elements.lessonVideoModalTitle.textContent = title;
  if (elements.lessonVideoSidebarTitle) elements.lessonVideoSidebarTitle.textContent = title;
  if (elements.lessonVideoSidebarMeta) elements.lessonVideoSidebarMeta.textContent = `${date} · مشاهدة داخل المنصة`;
  elements.lessonVideoFrame.title = title;
  
  // Ensure YouTube embeds have full permissions
  if (String(video.previewUrl).includes("youtube.com")) {
    elements.lessonVideoFrame.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share");
    elements.lessonVideoFrame.setAttribute("allowfullscreen", "true");
    elements.lessonVideoFrame.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
  } else {
    elements.lessonVideoFrame.removeAttribute("allow");
    elements.lessonVideoFrame.removeAttribute("allowfullscreen");
    elements.lessonVideoFrame.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
  }
  
  elements.lessonVideoFrame.src = video.previewUrl;
  elements.lessonVideoModal.hidden = false;
  document.body.classList.add("lesson-video-open");
  window.setTimeout(() => elements.lessonVideoClose?.focus(), 0);
}

function createLessonVideoEmptyState(message) {
  const empty = document.createElement("div");
  empty.className = "lesson-video-empty";
  empty.innerHTML = '<svg class="lesson-video-empty-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.75 6.5A1.75 1.75 0 0 1 6.5 4.75h5l1.6 1.75h4.4A1.75 1.75 0 0 1 19.25 8v9.5a1.75 1.75 0 0 1-1.75 1.75h-11a1.75 1.75 0 0 1-1.75-1.75v-11Z"/><path d="m10 11 4 2.5-4 2.5V11Z"/></svg><span></span>';
  empty.querySelector("span").textContent = message;
  return empty;
}

function renderLessonVideos(videos) {
  if (!elements.lessonVideoList) return;
  elements.lessonVideoList.replaceChildren();

  if (!videos.length) {
    elements.lessonVideoList.append(createLessonVideoEmptyState("لا توجد حصص مسجلة متاحة حالياً."));
    return;
  }

  videos.forEach((video, index) => {
    if (!isSafeLessonPreviewUrl(video?.previewUrl)) return;
    const item = document.createElement("article");
    item.className = "lesson-video-item";
    item.setAttribute("aria-label", `الدرس ${index + 1}: ${video.title || "حصة مسجلة"}`);

    const art = document.createElement("div");
    art.className = "lesson-video-art";
    art.setAttribute("aria-hidden", "true");
    art.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4.75 5.75A1.75 1.75 0 0 1 6.5 4h11a1.75 1.75 0 0 1 1.75 1.75v9.5A1.75 1.75 0 0 1 17.5 17h-11a1.75 1.75 0 0 1-1.75-1.75v-9.5Z"/><path d="m10 8 5 3.5-5 3.5V8Z"/><path d="M9 20h6M12 17v3"/></svg>';

    const copy = document.createElement("div");
    copy.className = "lesson-video-copy";
    const title = document.createElement("strong");
    title.textContent = video.title || "حصة مسجلة";
    const type = document.createElement("span");
    type.className = "lesson-video-type";
    type.textContent = video.repositoryTypeLabel || "درس مسجل";
    const date = document.createElement("small");
    date.textContent = `أضيفت في ${formatLessonVideoDate(video.createdAt)}`;
    const watch = document.createElement("button");
    watch.type = "button";
    watch.className = "watch-lesson-video-btn";
    watch.textContent = "مشاهدة الدرس";
    watch.setAttribute("aria-label", `مشاهدة ${video.title || "الحصة المسجلة"}`);
    watch.addEventListener("click", () => openLessonVideo(video));
    copy.append(title, type, date, watch);
    item.append(art, copy);
    elements.lessonVideoList.append(item);
  });

  if (!elements.lessonVideoList.childElementCount) renderLessonVideos([]);
}

async function loadLessonVideos(level) {
  if (!elements.lessonVideoList || !level || !canAccessLessonRepository(currentStudent)) return;
  if (elements.lessonRepositoryLevelCaption) {
    elements.lessonRepositoryLevelCaption.textContent = `فيديوهات حصص ${displayLevelLabel(level)} المتاحة حسب مادة أو نوع اشتراك التلميذ.`;
  }
  elements.lessonVideoList.replaceChildren();
  elements.lessonVideoList.append(createLessonVideoEmptyState("جارٍ تحميل مستودع الدروس…"));

  try {
    const studentId = currentStudent?.id ? `?studentId=${encodeURIComponent(currentStudent.id)}` : "";
    const response = await parentFetch(`/api/lesson-videos/${encodeURIComponent(level)}${studentId}`, {
      headers: { Accept: "application/json" },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "تعذر تحميل مستودع الدروس.");
    if (!currentStudent || currentStudent.level !== level) return;
    renderLessonVideos(Array.isArray(payload.data) ? payload.data : []);
  } catch (error) {
    if (/انتهت الجلسة/.test(error.message)) return;
    console.error("Unable to load lesson videos:", error);
    if (!currentStudent || currentStudent.level !== level) return;
    elements.lessonVideoList.replaceChildren(createLessonVideoEmptyState("تعذر تحميل مستودع الدروس حالياً."));
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
    const storedStudent = currentStudents.find((student) => student.id === storedStudentId);
    if (currentStudents.length > 1 && !storedStudent) {
      currentStudent = null;
      updateActiveStudentBar(null);
      renderStudentSwitcher(currentStudents);
      if (elements.studentSwitcher) elements.studentSwitcher.hidden = false;
      elements.dashboardContent.hidden = true;
      clearError();
      return;
    }

    selectStudent((storedStudent || currentStudents[0]).id);
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
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });
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
  const hasSecondaryPaymentAccess =
    !isUniversityStudent && ["PAID", "PROMISED"].includes(currentStudent.paymentStage);
  const isFreeSecondaryClass = !isUniversityStudent && activeLiveClassType === "FREE";
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

  if (!isFreeSecondaryClass && !currentStudent.liveAccessEnabled && !hasSecondaryPaymentAccess) {
    clearError();
    openPaymentAccessModal();
    return;
  }

  if (isUniversityStudent && !isPaidSubscription && activeLiveClassType === "PAID") {
    clearError();
    openPaymentAccessModal("subscription-upgrade");
    return;
  }

  const isMissingSecondarySubject =
    !isUniversityStudent &&
    ((activeLiveClassType === "MATH" && !currentStudent.mathEnrollment) ||
      (activeLiveClassType === "PHYSICS" && !currentStudent.physicsEnrollment));
  if (isMissingSecondarySubject) {
    clearError();
    openPaymentAccessModal("subject-upgrade");
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

function openSecondaryPaymentTransfer() {
  secondaryPaymentTransferRequested = true;
  if (elements.secondaryPaymentTransfer) {
    elements.secondaryPaymentTransfer.hidden = false;
    elements.secondaryPaymentTransfer.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

async function submitSecondaryPaymentReceipt() {
  const receipt = elements.secondaryPaymentReceiptInput?.files?.[0];
  const subscriptionType = elements.secondarySubscriptionType?.value;
  if (!currentStudent) {
    openDocumentFeedback("تعذر تحديد حساب التلميذ الحالي. أعد فتح لوحة الولي وحاول مرة أخرى.", "تعذر تحديد الحساب");
    return;
  }
  const missing = [];
  if (!receipt) missing.push("لم ترفع وصل الدفع.");
  if (!["BOTH", "MATH", "PHYSICS"].includes(subscriptionType)) missing.push("لم تختَر المادة أو نوع الاشتراك.");
  if (missing.length) {
    openDocumentFeedback(missing.join("\n"), "بيانات الترقية ناقصة");
    if (!receipt) elements.secondaryPaymentReceiptInput?.focus();
    else elements.secondarySubscriptionType?.focus();
    return;
  }

  const originalLabel = elements.secondaryPaymentSubmit?.textContent;
  if (elements.secondaryPaymentSubmit) {
    elements.secondaryPaymentSubmit.disabled = true;
    elements.secondaryPaymentSubmit.textContent = "جارٍ إرسال الوصل…";
  }

  try {
    const formData = new FormData();
    formData.append("paymentReceipt", receipt);
    formData.append("subscriptionType", subscriptionType);
    const response = await parentFetch(
      `/api/students/${encodeURIComponent(currentStudent.id)}/payment-receipt`,
      { method: "POST", body: formData }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "تعذر إرسال وصل الدفع.");
    }

    elements.secondaryPaymentReceiptInput.value = "";
    secondaryPaymentTransferRequested = true;
    await loadDashboard({ backgroundRefresh: true });
  } catch (error) {
    if (!/انتهت الجلسة/.test(error.message)) {
      openDocumentFeedback(error.message || "تعذر إرسال وصل الدفع.", "تعذر إرسال وصل الدفع");
    }
  } finally {
    if (elements.secondaryPaymentSubmit && !currentStudent?.paymentReceiptPending) {
      elements.secondaryPaymentSubmit.disabled = false;
      elements.secondaryPaymentSubmit.textContent = originalLabel || "إرسال وصل الدفع للأستاذ";
    }
  }
}

async function submitUniversityPaymentReceipt() {
  const receipt = elements.parentPaymentReceiptInput?.files?.[0];
  if (!currentStudent) {
    openDocumentFeedback("تعذر تحديد حساب الطالب الجامعي الحالي. أعد فتح لوحة الولي وحاول مرة أخرى.", "تعذر تحديد الحساب");
    return;
  }
  if (!receipt) {
    openDocumentFeedback("لم ترفع وصل الدفع.", "وصل الدفع مطلوب");
    elements.parentPaymentReceiptInput?.focus();
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
      openDocumentFeedback(error.message || "تعذر إرسال وصل الدفع.", "تعذر إرسال وصل الدفع");
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
  void window.revokeServerSession?.();
  clearParentSession();
  window.location.replace("./parent-login.html");
}

function setParentSidebarOpen(isOpen) {
  elements.parentSidebar?.classList.toggle("is-open", isOpen);
  if (elements.parentSidebarBackdrop) elements.parentSidebarBackdrop.hidden = !isOpen;
  elements.parentSidebarToggle?.setAttribute("aria-expanded", String(isOpen));
  document.body.classList.toggle("parent-sidebar-open", isOpen);
}

function setParentActiveNav(link) {
  elements.parentNavLinks.forEach((item) => item.classList.toggle("is-active", item === link));
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
    teacherAbsenceLevel = parentTeacherAbsent ? data.level : null;
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
  elements.secondaryUpgradeButton?.addEventListener("click", openSecondaryPaymentTransfer);
  elements.secondaryPaymentSubmit?.addEventListener("click", () => {
    void submitSecondaryPaymentReceipt();
  });
  elements.replacementCardButton?.addEventListener("click", () => {
    elements.replacementCardInput?.click();
  });
  elements.replacementCardInput?.addEventListener("change", () => {
    void uploadReplacementCard();
  });
  elements.logoutButton?.addEventListener("click", logout);
  elements.parentSidebarLogout?.addEventListener("click", logout);
  elements.changeStudentButton?.addEventListener("click", openStudentPicker);
  elements.parentSidebarToggle?.addEventListener("click", () => setParentSidebarOpen(!elements.parentSidebar?.classList.contains("is-open")));
  elements.parentSidebarClose?.addEventListener("click", () => setParentSidebarOpen(false));
  elements.parentSidebarBackdrop?.addEventListener("click", () => setParentSidebarOpen(false));
  elements.parentNavLinks.forEach((link) => link.addEventListener("click", () => { setParentActiveNav(link); setParentSidebarOpen(false); }));
  elements.documentFeedbackClose?.addEventListener("click", closeDocumentFeedback);
  elements.documentFeedbackModal?.addEventListener("click", (event) => {
    if (event.target === elements.documentFeedbackModal) closeDocumentFeedback();
  });
  elements.lessonVideoClose?.addEventListener("click", closeLessonVideo);
  elements.lessonVideoFullscreen?.addEventListener("click", () => { void toggleLessonFullscreen(); });
  elements.lessonVideoRotate?.addEventListener("click", () => { void rotateLessonScreen(); });
  document.addEventListener("fullscreenchange", updateLessonFullscreenLabel);
  elements.lessonVideoModal?.addEventListener("click", (event) => {
    if (event.target === elements.lessonVideoModal) closeLessonVideo();
  });
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
      setParentSidebarOpen(false);
      closeDocumentFeedback();
      closePaymentAccessModal();
      closeLessonVideo();
    }
  });
  window.addEventListener("focus", refreshAccessAfterReturningFromCall);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      refreshAccessAfterReturningFromCall();
    }
  });
  initializeLobbySocket();
  loadDashboard();
}
