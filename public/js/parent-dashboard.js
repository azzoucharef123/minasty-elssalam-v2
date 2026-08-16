"use strict";

const PARENT_TOKEN_KEY = "parentToken";

const elements = {
  liveBanner: document.getElementById("live-class-banner"),
  joinLiveClassButton: document.getElementById("join-live-class-btn"),
  dashboardError: document.getElementById("dashboard-error"),
  loadingState: document.getElementById("loading-state"),
  dashboardContent: document.getElementById("dashboard-content"),
  lessonRepositoryCard: document.getElementById("lesson-repository-card"),
  lessonRepositoryToggle: document.getElementById("lesson-repository-toggle"),
  lessonRepositoryControls: document.getElementById("lesson-repository-controls"),
  lessonRepositoryToggleIcon: document.getElementById("lesson-repository-toggle-icon"),
  studentCertificatesCard: document.getElementById("student-certificates-card"),
  studentCertificatesToggle: document.getElementById("student-certificates-toggle"),
  studentCertificatesContent: document.getElementById("student-certificates-content"),
  studentCertificatesToggleIcon: document.getElementById("student-certificates-toggle-icon"),
  studentCertificatesList: document.getElementById("student-certificates-list"),
  studentCertificatesCaption: document.getElementById("student-certificates-caption"),
  studentCertificateModal: document.getElementById("student-certificate-modal"),
  studentCertificateModalImage: document.getElementById("student-certificate-modal-image"),
  studentCertificateModalClose: document.getElementById("student-certificate-modal-close"),
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
  parentScheduleCard: document.getElementById("parent-schedule-card"),
  parentNextClassStatus: document.getElementById("parent-next-class-status"),
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
  lessonVideoZoomLayer: document.getElementById("lesson-video-zoom-layer"),
  lessonVideoZoomHint: document.getElementById("lesson-video-zoom-hint"),
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
  levelScheduleCard: document.getElementById("level-schedule-card"),
  levelScheduleLevel: document.getElementById("level-schedule-level"),
  levelScheduleImageButton: document.getElementById("level-schedule-image-button"),
  levelScheduleImage: document.getElementById("level-schedule-image"),
  levelScheduleImageModal: document.getElementById("level-schedule-image-modal"),
  levelScheduleImageLarge: document.getElementById("level-schedule-image-large"),
  levelScheduleImageClose: document.getElementById("level-schedule-image-close"),
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
let lessonRepositoryOpen = false;
let studentCertificatesOpen = false;
let certificateImageUrls = new Set();

function scrollExpandedPanel(panel) {
  if (!panel || panel.hidden) return;
  window.setTimeout(() => {
    const header = document.querySelector(".parent-header");
    const headerHeight = header?.getBoundingClientRect().height || 0;
    const panelHeight = panel.getBoundingClientRect().height;
    const canCenter = panelHeight > 0 && panelHeight <= window.innerHeight * 0.86;
    panel.scrollIntoView({ behavior: "smooth", block: canCenter ? "center" : "start", inline: "nearest" });
    if (!canCenter && headerHeight > 0) {
      window.setTimeout(() => window.scrollBy({ top: -(headerHeight + 12), behavior: "smooth" }), 80);
    }
  }, 90);
}

window.focusExpandedParentPanel = scrollExpandedPanel;

function revokeCertificateImageUrls() {
  certificateImageUrls.forEach((url) => URL.revokeObjectURL(url));
  certificateImageUrls = new Set();
}

function setStudentCertificatesOpen(nextOpen) {
  studentCertificatesOpen = Boolean(nextOpen);
  if (elements.studentCertificatesContent) elements.studentCertificatesContent.hidden = !studentCertificatesOpen;
  elements.studentCertificatesCard?.classList.toggle("is-open", studentCertificatesOpen);
  elements.studentCertificatesToggle?.setAttribute("aria-expanded", String(studentCertificatesOpen));
  if (elements.studentCertificatesToggleIcon) elements.studentCertificatesToggleIcon.textContent = studentCertificatesOpen ? "⌃" : "⌄";
  if (studentCertificatesOpen) scrollExpandedPanel(elements.studentCertificatesCard);
}

function syncStudentCertificatesVisibility(student) {
  const shouldShow = Boolean(student);
  if (elements.studentCertificatesCard) elements.studentCertificatesCard.hidden = !shouldShow;
  if (!shouldShow) elements.studentCertificatesList?.replaceChildren();
  setStudentCertificatesOpen(false);
}

function showCertificateEmptyState(message) {
  const empty = document.createElement("p");
  empty.className = "student-certificates-empty";
  empty.textContent = message;
  return empty;
}

function openCertificateImage(url, title) {
  if (!elements.studentCertificateModal || !elements.studentCertificateModalImage || !url) return;
  elements.studentCertificateModalImage.src = url;
  elements.studentCertificateModalImage.alt = title || "شهادة التلميذ";
  elements.studentCertificateModal.hidden = false;
  document.body.style.overflow = "hidden";
  elements.studentCertificateModalClose?.focus();
}

function closeCertificateImage() {
  if (elements.studentCertificateModal) elements.studentCertificateModal.hidden = true;
  if (elements.studentCertificateModalImage) elements.studentCertificateModalImage.removeAttribute("src");
  document.body.style.overflow = "";
}

function renderStudentCertificates(certificates) {
  if (!elements.studentCertificatesList) return;
  elements.studentCertificatesList.replaceChildren();
  if (!certificates.length) {
    elements.studentCertificatesList.append(showCertificateEmptyState("لم يحصل التلميذ على شهادات مضافة بعد. استمر في التقدم، وستظهر إنجازاتك هنا."));
    return;
  }

  certificates.forEach((certificate) => {
    const card = document.createElement("article");
    card.className = "student-certificate-card";
    const imageButton = document.createElement("button");
    imageButton.type = "button";
    imageButton.className = "student-certificate-image-button";
    imageButton.setAttribute("aria-label", `تكبير شهادة ${certificate.title}`);
    const image = document.createElement("img");
    image.src = certificate.imageObjectUrl || "";
    image.alt = certificate.title || "شهادة التلميذ";
    image.loading = "lazy";
    image.decoding = "async";
    imageButton.append(image);
    imageButton.addEventListener("click", () => openCertificateImage(certificate.imageObjectUrl, certificate.title));

    const copy = document.createElement("div");
    copy.className = "student-certificate-copy";
    const title = document.createElement("strong");
    title.textContent = certificate.title || "شهادة إنجاز";
    const date = document.createElement("time");
    date.dateTime = certificate.awardedAt || "";
    date.textContent = certificate.awardedAt
      ? `تاريخ الحصول عليها: ${new Intl.DateTimeFormat("ar-DZ", { dateStyle: "medium" }).format(new Date(certificate.awardedAt))}`
      : "شهادة إنجاز";
    copy.append(title, date);
    if (certificate.description) {
      const description = document.createElement("p");
      description.textContent = certificate.description;
      copy.append(description);
    }
    card.append(imageButton, copy);
    elements.studentCertificatesList.append(card);
  });
}

async function loadStudentCertificates(studentId) {
  if (!elements.studentCertificatesList || !studentId) return;
  revokeCertificateImageUrls();
  elements.studentCertificatesList.replaceChildren(showCertificateEmptyState("جارٍ تحميل شهادات التلميذ…"));
  try {
    const response = await parentFetch(`/api/certificates/student/${encodeURIComponent(studentId)}`, { headers: { Accept: "application/json" } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "تعذر تحميل شهادات التلميذ.");
    if (!currentStudent || currentStudent.id !== studentId) return;
    const certificates = Array.isArray(payload.data) ? payload.data : [];
    for (const certificate of certificates) {
      try {
        const imageResponse = await parentFetch(certificate.imageUrl, { headers: { Accept: "image/*" } });
        if (!imageResponse.ok) continue;
        const imageUrl = URL.createObjectURL(await imageResponse.blob());
        certificate.imageObjectUrl = imageUrl;
        certificateImageUrls.add(imageUrl);
      } catch (error) {
        console.warn("Unable to load certificate image:", error);
      }
    }
    renderStudentCertificates(certificates.filter((certificate) => certificate.imageObjectUrl));
  } catch (error) {
    if (/انتهت الجلسة/.test(error.message)) return;
    console.error("Unable to load student certificates:", error);
    elements.studentCertificatesList.replaceChildren(showCertificateEmptyState("تعذر تحميل الشهادات حاليًا."));
  }
}
let currentStudents = [];
let currentLobbyLevel = null;
let paymentReturnRefreshTimer = null;
let activeLiveClassType = null;
let universityPaymentTransferRequested = false;
let secondaryPaymentTransferRequested = false;
let lessonVideoPreviousFocus = null;
let lessonZoomScale = 1;
let lessonZoomX = 0;
let lessonZoomY = 0;
let lessonZoomPointers = new Map();
let lessonZoomPinchStartDistance = 0;
let lessonZoomPinchStartScale = 1;
let lessonZoomPanStart = null;
let lessonUpgradeContext = null;
let parentScheduledClasses = [];
let parentScheduleAdvanceTimer = null;
let parentTeacherAbsent = false;
let teacherAbsenceLevel = null;

const LEVEL_DISPLAY_LABELS = Object.freeze({
  "السنة الأولى": "السنة الأولى متوسط",
  "السنة الثانية": "السنة الثانية متوسط",
  "السنة الثالثة": "السنة الثالثة متوسط",
  "السنة الرابعة": "السنة الرابعة متوسط",
  "طالب جامعي": "طالب جامعي",
});

const LEVEL_SCHEDULE_IMAGES = Object.freeze({
  "السنة الأولى": "./assets/level-schedules/year-1.png",
  "السنة الثانية": "./assets/level-schedules/year-2.png",
  "السنة الثالثة": "./assets/level-schedules/year-3.png",
  "السنة الرابعة": "./assets/level-schedules/year-4.png",
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
  const lessonUpgrade = reason.startsWith("lesson-");
  const lessonFreeOnly = reason === "lesson-free-only";
  if (!lessonUpgrade) lessonUpgradeContext = null;
  const lessonSubject = reason === "lesson-math-only" ? "الفيزياء" : "الرياضيات";
  const requiredSubject = activeLiveClassType === "PHYSICS" ? "الفيزياء" : "الرياضيات";
  const currentSubject = activeLiveClassType === "PHYSICS" ? "الرياضيات" : "الفيزياء";
  if (elements.paymentAccessTitle) {
    elements.paymentAccessTitle.textContent = lessonUpgrade
      ? reason === "lesson-unpaid"
        ? "أنت غير مشترك حالياً"
        : lessonFreeOnly
          ? "هذا الدرس مخصص للاشتراك المدفوع"
          : `هذا الدرس في ${lessonSubject}`
      : subscriptionUpgrade
        ? "هذه الحصة مخصصة للاشتراك المدفوع"
        : subjectUpgrade
          ? `حصة اليوم ${requiredSubject}`
          : "الدخول للحصة يحتاج إلى تفعيل";
  }
  if (elements.paymentAccessHeadMessage) {
    elements.paymentAccessHeadMessage.textContent = lessonUpgrade
      ? reason === "lesson-unpaid"
        ? "أنت لست مشتركاً حالياً، وحسابك مجاني. اضغط على الزر للترقية والوصول إلى الدروس."
        : lessonFreeOnly
          ? "أنت مشترك في الحساب المجاني فقط، وهذا الدرس مخصص للاشتراك المدفوع."
          : `أنت مشترك في ${lessonSubject === "الفيزياء" ? "الرياضيات" : "الفيزياء"} فقط، ولا يشمل اشتراكك هذا الدرس.`
      : subscriptionUpgrade
        ? "أنت مشترك في المجاني فقط وهذه الحصة المدفوعة الآن للطلبة ذوي الاشتراك المدفوع."
        : subjectUpgrade
          ? `حصة اليوم ${requiredSubject} وأنت مشترك في ${currentSubject} فقط.`
          : "لم يتم تأكيد الدفع أو إبلاغ الأستاذ بموعد الدفع.";
  }
  if (elements.paymentAccessMessage) {
    elements.paymentAccessMessage.textContent = lessonUpgrade
      ? "للوصول إلى هذا الدرس، اضغط على زر «ترقية حسابي الآن» واختر المادة أو الاشتراك المناسب."
      : subscriptionUpgrade
        ? "للترقية إلى الاشتراك المدفوع، اضغط على الزر الأخضر واتصل بالأستاذ مباشرة على الرقم 0556960950."
        : subjectUpgrade
          ? `إذا كنت تريد الاشتراك في ${requiredSubject}، اتصل بالأستاذ مباشرة على الرقم 0556960950.`
          : "إذا كنت تريد الدفع، اضغط على الزر الأخضر واتصل بالأستاذ مباشرة على الرقم 0556960950.";
  }
  if (elements.callTeacherNowButton) {
    elements.callTeacherNowButton.textContent = lessonUpgrade ? "ترقية حسابي الآن" : "اتصل بالأستاذ الآن";
    elements.callTeacherNowButton.href = lessonUpgrade ? "#" : "tel:0556960950";
  }
  if (elements.declineRegistrationButton) {
    elements.declineRegistrationButton.textContent = lessonUpgrade
      ? "إغلاق"
      : subjectUpgrade
        ? `لا أريد الاشتراك في ${requiredSubject}`
        : "لا أريد التسجيل";
  }

  elements.paymentAccessModal.hidden = false;
  document.body.style.overflow = "hidden";
}

function openLessonUpgradeModal(video) {
  lessonUpgradeContext = video || null;
  const reason = video?.accessReason === "UNPAID"
    ? "lesson-unpaid"
    : video?.accessReason === "MATH_ONLY"
      ? "lesson-math-only"
      : video?.accessReason === "PHYSICS_ONLY"
        ? "lesson-physics-only"
        : "lesson-free-only";
  openPaymentAccessModal(reason);
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
  renderParentSchedule();
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
    : { MATH: "الرياضيات", PHYSICS: "الفيزياء", FREE: "حصة مجانية" };
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
    timeZone: "Africa/Algiers",
  }).format(date);
}

function getNextParentScheduledClass() {
  const now = Date.now();
  if (activeLiveClassType) {
    const liveScheduledClass = parentScheduledClasses
      .filter((scheduledClass) => scheduledClass?.subject === activeLiveClassType)
      .map((scheduledClass) => ({ scheduledClass, timestamp: new Date(scheduledClass.scheduledAt).getTime() }))
      .filter(({ timestamp }) => Number.isFinite(timestamp) && Math.abs(timestamp - now) <= 3 * 60 * 60 * 1000)
      .sort((left, right) => Math.abs(left.timestamp - now) - Math.abs(right.timestamp - now))[0]?.scheduledClass;
    return liveScheduledClass
      ? { ...liveScheduledClass, isLiveNow: true }
      : { id: `live-${currentStudent?.level || "level"}-${activeLiveClassType}`, subject: activeLiveClassType, scheduledAt: null, isLiveNow: true };
  }

  return parentScheduledClasses
    .filter((scheduledClass) => {
      const timestamp = new Date(scheduledClass?.scheduledAt).getTime();
      return Number.isFinite(timestamp) && timestamp > now;
    })
    .sort((left, right) => new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime())[0] || null;
}

function scheduleParentScheduleAdvance(nextClass) {
  window.clearTimeout(parentScheduleAdvanceTimer);
  parentScheduleAdvanceTimer = null;
  if (!nextClass) return;
  const timestamp = new Date(nextClass.scheduledAt).getTime();
  const delay = timestamp - Date.now();
  if (!Number.isFinite(delay) || delay <= 0) return;
  parentScheduleAdvanceTimer = window.setTimeout(() => {
    parentScheduleAdvanceTimer = null;
    renderParentSchedule();
  }, delay + 100);
}

function renderParentSchedule() {
  const nextClass = getNextParentScheduledClass();
  scheduleParentScheduleAdvance(nextClass);
  if (elements.parentScheduleCard) elements.parentScheduleCard.hidden = !currentStudent;
  if (elements.parentNextClassStatus) {
    elements.parentNextClassStatus.textContent = activeLiveClassType
      ? "الحصة مفتوحة الآن"
      : "حسب برنامج المستوى";
    elements.parentNextClassStatus.classList.toggle("is-live", Boolean(activeLiveClassType));
  }
  const isAbsenceForCurrentStudent = Boolean(
    parentTeacherAbsent && currentStudent && teacherAbsenceLevel === currentStudent.level
  );
  if (elements.teacherAbsenceNotice) {
    elements.teacherAbsenceNotice.hidden = !isAbsenceForCurrentStudent;
  }
  if (elements.parentKpiNextClass) {
    elements.parentKpiNextClass.textContent = nextClass
      ? scheduleTypeLabel(currentStudent?.level, nextClass.subject)
      : "لا توجد";
  }
  if (!elements.parentScheduleList) return;
  elements.parentScheduleList.replaceChildren();

  if (!nextClass) {
    const empty = document.createElement("p");
    empty.className = "parent-schedule-empty";
    empty.textContent = "لا توجد حصص قادمة مبرمجة حاليًا.";
    elements.parentScheduleList.append(empty);
    return;
  }

  [nextClass].forEach((scheduledClass) => {
    const item = document.createElement("article");
    item.className = "parent-schedule-item";
    const content = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = scheduleTypeLabel(currentStudent?.level, scheduledClass.subject);
    const date = document.createElement("span");
    date.textContent = scheduledClass.isLiveNow ? "مفتوحة الآن" : formatParentScheduleDate(scheduledClass.scheduledAt);
    content.append(title, date);
    const subjectIcon = document.createElement("i");
    subjectIcon.className = "parent-schedule-subject-icon";
    subjectIcon.setAttribute("aria-hidden", "true");
    subjectIcon.textContent = scheduledClass.subject === "PHYSICS" ? "ϟ" : scheduledClass.subject === "MATH" ? "∠" : "★";
    const join = document.createElement("button");
    join.type = "button";
    const isLiveNow = Boolean(activeLiveClassType);
    join.className = `parent-schedule-join${isLiveNow ? " is-live" : ""}`;
    join.textContent = isLiveNow ? "ادخل الآن — الحصة مفتوحة الآن بسرعة" : "الدخول للحصة";
    join.disabled = !isLiveNow;
    join.title = join.disabled ? "سيتفعل الزر عند بدء حصة هذا المستوى" : "الدخول إلى الحصة المباشرة الآن";
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

function renderLevelScheduleCard(student) {
  const imageUrl = LEVEL_SCHEDULE_IMAGES[student?.level] || "";
  const hasScheduleImage = Boolean(imageUrl);
  if (elements.levelScheduleCard) elements.levelScheduleCard.hidden = !hasScheduleImage;
  if (!hasScheduleImage) {
    if (elements.levelScheduleImage) elements.levelScheduleImage.removeAttribute("src");
    if (elements.levelScheduleImageLarge) elements.levelScheduleImageLarge.removeAttribute("src");
    return;
  }

  const levelLabel = displayLevelLabel(student.level);
  if (elements.levelScheduleLevel) elements.levelScheduleLevel.textContent = levelLabel;
  if (elements.levelScheduleImage) {
    elements.levelScheduleImage.src = imageUrl;
    elements.levelScheduleImage.alt = `جدول حصص ${levelLabel}`;
  }
  if (elements.levelScheduleImageLarge) {
    elements.levelScheduleImageLarge.src = imageUrl;
    elements.levelScheduleImageLarge.alt = `جدول حصص ${levelLabel} مكبراً`;
  }
  if (elements.levelScheduleImageModal) elements.levelScheduleImageModal.hidden = true;
}

function closeLevelScheduleImageModal() {
  if (elements.levelScheduleImageModal) elements.levelScheduleImageModal.hidden = true;
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
  renderLevelScheduleCard(student);
  if (elements.studentSwitcher) elements.studentSwitcher.hidden = true;
  renderStudent(student);
  elements.dashboardContent.hidden = false;
  clearError();
  emitLobbyJoin(student.level);
  void loadActivityStats(student.id);
  void loadStudentCertificates(student.id);
  void loadParentSchedule(student.level);
  if (canAccessLessonRepository(student)) {
    void loadLessonVideos(student.level);
  } else {
    elements.lessonVideoList?.replaceChildren();
  }
}

function canAccessLessonRepository(student) {
  // The repository remains visible for every selected student so locked lesson
  // cards can explain the required upgrade instead of appearing to be missing.
  return Boolean(student);
}

function setLessonRepositoryOpen(nextOpen) {
  lessonRepositoryOpen = Boolean(nextOpen);
  if (elements.lessonRepositoryControls) elements.lessonRepositoryControls.hidden = !lessonRepositoryOpen;
  elements.lessonRepositoryCard?.classList.toggle("is-open", lessonRepositoryOpen);
  elements.lessonRepositoryToggle?.setAttribute("aria-expanded", String(lessonRepositoryOpen));
  if (elements.lessonRepositoryToggleIcon) elements.lessonRepositoryToggleIcon.textContent = lessonRepositoryOpen ? "⌃" : "⌄";
  if (lessonRepositoryOpen) scrollExpandedPanel(elements.lessonRepositoryCard);
}

function syncLessonRepositoryVisibility(student) {
  const shouldShow = Boolean(student);
  if (elements.lessonRepositoryCard) {
    elements.lessonRepositoryCard.hidden = !shouldShow;
  }
  if (!shouldShow) {
    elements.lessonVideoList?.replaceChildren();
  }
  setLessonRepositoryOpen(false);
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
  syncStudentCertificatesVisibility(student);
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
  // The subscription KPI was intentionally removed from the markup because its information is now part of the unified card.
  if (elements.secondaryPaymentState) {
    const paymentStateValue = elements.secondaryPaymentState.querySelector("strong");
    elements.secondaryPaymentState.hidden = isUniversityStudent;
    if (paymentStateValue) {
      paymentStateValue.textContent = isUniversityStudent ? "" : secondaryPaymentStateLabel(student);
      paymentStateValue.classList.toggle("is-paid", paymentStage === "PAID");
      paymentStateValue.classList.toggle("is-unpaid", paymentStage === "UNPAID");
    } else {
      elements.secondaryPaymentState.textContent = isUniversityStudent
        ? ""
        : `حالة الدفع: ${secondaryPaymentStateLabel(student)}`;
    }
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

function clampLessonZoomValue(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function applyLessonZoom() {
  if (!elements.lessonVideoFrame) return;
  elements.lessonVideoFrame.style.transform = `translate3d(${lessonZoomX}px, ${lessonZoomY}px, 0) scale(${lessonZoomScale})`;
  elements.lessonVideoZoomHint?.classList.toggle("is-visible", lessonZoomScale > 1.01);
}

function clampLessonZoomPan() {
  const layer = elements.lessonVideoZoomLayer;
  if (!layer) return;
  const rect = layer.getBoundingClientRect();
  const maxX = Math.max(0, (rect.width * (lessonZoomScale - 1)) / 2);
  const maxY = Math.max(0, (rect.height * (lessonZoomScale - 1)) / 2);
  lessonZoomX = clampLessonZoomValue(lessonZoomX, -maxX, maxX);
  lessonZoomY = clampLessonZoomValue(lessonZoomY, -maxY, maxY);
}

function resetLessonZoom() {
  lessonZoomScale = 1;
  lessonZoomX = 0;
  lessonZoomY = 0;
  lessonZoomPointers.clear();
  lessonZoomPinchStartDistance = 0;
  lessonZoomPanStart = null;
  elements.lessonVideoZoomLayer?.classList.remove("is-active");
  elements.lessonVideoZoomHint?.classList.remove("is-visible");
  if (elements.lessonVideoFrame) elements.lessonVideoFrame.style.transform = "";
}

function activateLessonZoomLayer() {
  // Capture pinch gestures only over the video image area. The native YouTube
  // control bar remains uncovered so CC, quality, settings, and fullscreen work.
  elements.lessonVideoZoomLayer?.classList.add("is-active");
}

function lessonZoomDistance(first, second) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function postLessonVideoPlayCommand() {
  const frameWindow = elements.lessonVideoFrame?.contentWindow;
  if (!frameWindow) return;
  frameWindow.postMessage(JSON.stringify({ event: "command", func: "playVideo", args: [] }), "https://www.youtube.com");
}

function handleLessonZoomPointerDown(event) {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  const layer = elements.lessonVideoZoomLayer;
  if (!layer) return;
  layer.setPointerCapture?.(event.pointerId);
  lessonZoomPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (lessonZoomPointers.size === 2) {
    const [first, second] = [...lessonZoomPointers.values()];
    lessonZoomPinchStartDistance = Math.max(1, lessonZoomDistance(first, second));
    lessonZoomPinchStartScale = lessonZoomScale;
    lessonZoomPanStart = null;
  } else if (lessonZoomScale > 1) {
    lessonZoomPanStart = { x: event.clientX - lessonZoomX, y: event.clientY - lessonZoomY };
  }
  event.preventDefault();
}

function handleLessonZoomPointerMove(event) {
  if (!lessonZoomPointers.has(event.pointerId)) return;
  lessonZoomPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (lessonZoomPointers.size >= 2) {
    const [first, second] = [...lessonZoomPointers.values()];
    const distance = Math.max(1, lessonZoomDistance(first, second));
    lessonZoomScale = clampLessonZoomValue(lessonZoomPinchStartScale * (distance / lessonZoomPinchStartDistance), 1, 4);
    clampLessonZoomPan();
    applyLessonZoom();
  } else if (lessonZoomScale > 1 && lessonZoomPanStart) {
    lessonZoomX = event.clientX - lessonZoomPanStart.x;
    lessonZoomY = event.clientY - lessonZoomPanStart.y;
    clampLessonZoomPan();
    applyLessonZoom();
  }
  event.preventDefault();
}

function handleLessonZoomPointerUp(event) {
  const wasSingleTap = lessonZoomPointers.size === 1 && lessonZoomScale <= 1.01;
  lessonZoomPointers.delete(event.pointerId);
  if (lessonZoomPointers.size < 2) lessonZoomPinchStartDistance = 0;
  if (lessonZoomPointers.size === 1 && lessonZoomScale > 1) {
    const [remaining] = [...lessonZoomPointers.values()];
    lessonZoomPanStart = { x: remaining.x - lessonZoomX, y: remaining.y - lessonZoomY };
  } else if (!lessonZoomPointers.size) {
    lessonZoomPanStart = null;
    if (wasSingleTap) postLessonVideoPlayCommand();
  }
  event.preventDefault();
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
      resetLessonZoom();
    } else if (shell.requestFullscreen) {
      await shell.requestFullscreen();
      activateLessonZoomLayer();
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
    activateLessonZoomLayer();
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
  resetLessonZoom();
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
    elements.lessonVideoList.append(createLessonVideoEmptyState("لا توجد فيديوهات مكملة متاحة حاليًا."));
    return;
  }

  videos.forEach((video, index) => {
    if (!video?.title) return;
    const item = document.createElement("article");
    item.className = `lesson-video-item${video.locked ? " is-locked" : ""}`;
    item.setAttribute("aria-label", `الدرس ${index + 1}: ${video.title || "حصة مسجلة"}`);

    const art = document.createElement("div");
    art.className = "lesson-video-art";
    art.setAttribute("aria-hidden", "true");
    art.innerHTML = video.locked
      ? '<svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><path d="M12 14v3"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M4.75 5.75A1.75 1.75 0 0 1 6.5 4h11a1.75 1.75 0 0 1 1.75 1.75v9.5A1.75 1.75 0 0 1 17.5 17h-11a1.75 1.75 0 0 1-1.75-1.75v-9.5Z"/><path d="m10 8 5 3.5-5 3.5V8Z"/><path d="M9 20h6M12 17v3"/></svg>';

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
    watch.className = `watch-lesson-video-btn${video.locked ? " is-locked" : ""}`;
    watch.textContent = video.locked ? "ترقية الحساب" : "مشاهدة الدرس";
    watch.setAttribute("aria-label", video.locked ? `ترقية الحساب للوصول إلى ${video.title}` : `مشاهدة ${video.title || "الحصة المسجلة"}`);
    watch.addEventListener("click", () => {
      if (video.locked) {
        openLessonUpgradeModal(video);
      } else {
        openLessonVideo(video);
      }
    });
    copy.append(title, type, date, watch);
    item.append(art, copy);
    elements.lessonVideoList.append(item);
  });

  if (!elements.lessonVideoList.childElementCount) renderLessonVideos([]);
}

async function loadLessonVideos(level) {
  if (!elements.lessonVideoList || !level || !canAccessLessonRepository(currentStudent)) return;
  if (elements.lessonRepositoryLevelCaption) {
    elements.lessonRepositoryLevelCaption.textContent = `فيديوهات مكملة لمستوى ${displayLevelLabel(level)}، أضافها الأستاذ يدويًا حسب المادة أو نوع الاشتراك.`;
  }
  elements.lessonVideoList.replaceChildren();
    elements.lessonVideoList.append(createLessonVideoEmptyState("جارٍ تحميل الفيديوهات المكملة…"));

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
    elements.lessonVideoList.replaceChildren(createLessonVideoEmptyState("تعذر تحميل الفيديوهات المكملة حاليًا."));
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
  elements.lessonRepositoryToggle?.addEventListener("click", () => setLessonRepositoryOpen(!lessonRepositoryOpen));
  elements.studentCertificatesToggle?.addEventListener("click", () => setStudentCertificatesOpen(!studentCertificatesOpen));
  elements.studentCertificateModalClose?.addEventListener("click", closeCertificateImage);
  elements.studentCertificateModal?.addEventListener("click", (event) => {
    if (event.target === elements.studentCertificateModal) closeCertificateImage();
  });
  elements.lessonVideoClose?.addEventListener("click", closeLessonVideo);
  elements.lessonVideoFullscreen?.addEventListener("click", () => { void toggleLessonFullscreen(); });
  elements.lessonVideoRotate?.addEventListener("click", () => { void rotateLessonScreen(); });
  elements.lessonVideoZoomLayer?.addEventListener("pointerdown", handleLessonZoomPointerDown, { passive: false });
  elements.lessonVideoZoomLayer?.addEventListener("pointermove", handleLessonZoomPointerMove, { passive: false });
  elements.lessonVideoZoomLayer?.addEventListener("pointerup", handleLessonZoomPointerUp, { passive: false });
  elements.lessonVideoZoomLayer?.addEventListener("pointercancel", handleLessonZoomPointerUp, { passive: false });
  document.addEventListener("fullscreenchange", updateLessonFullscreenLabel);
  elements.lessonVideoModal?.addEventListener("click", (event) => {
    if (event.target === elements.lessonVideoModal) closeLessonVideo();
  });
  elements.levelScheduleImageButton?.addEventListener("click", () => {
    if (elements.levelScheduleImageModal) elements.levelScheduleImageModal.hidden = false;
    elements.levelScheduleImageClose?.focus();
  });
  elements.levelScheduleImageClose?.addEventListener("click", closeLevelScheduleImageModal);
  elements.levelScheduleImageModal?.addEventListener("click", (event) => {
    if (event.target === elements.levelScheduleImageModal || event.target.matches("[data-close-level-schedule]")) {
      closeLevelScheduleImageModal();
    }
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeCertificateImage();
    }
  });
  elements.callTeacherNowButton?.addEventListener("click", (event) => {
    if (lessonUpgradeContext) {
      event.preventDefault();
      const upgradeHandler = currentStudent?.level === "طالب جامعي"
        ? openUniversityPaymentTransfer
        : openSecondaryPaymentTransfer;
      lessonUpgradeContext = null;
      closePaymentAccessModal();
      upgradeHandler?.();
      return;
    }
    closePaymentAccessModal();
  });
  elements.declineRegistrationButton?.addEventListener("click", () => {
    const isLessonUpgrade = Boolean(lessonUpgradeContext);
    lessonUpgradeContext = null;
    closePaymentAccessModal();
    if (!isLessonUpgrade) window.location.assign("./index.html");
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
      closeLevelScheduleImageModal();
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
