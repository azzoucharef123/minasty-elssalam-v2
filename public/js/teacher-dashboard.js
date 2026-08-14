"use strict";

const TEACHER_TOKEN_KEY = "teacherToken";

const elements = {
  levelButtons: Array.from(document.querySelectorAll(".level-btn[data-level], [data-level].level-button")),
  currentLevelTitle: document.querySelector("#current-level-title, #current-level, [data-current-level]"),
  studentsTableBody: document.querySelector("#students-table-body, #students-tbody, table tbody"),
  tableEmptyState: document.querySelector("#table-empty-state, #empty-state"),
  dashboardError: document.querySelector("#dashboard-error, #message-box"),
  logoutButton: document.querySelector("#logout-btn, [data-action='logout']"),

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
};

let currentLevel =
  document.querySelector(".level-btn.is-active, .level-btn.active, .level-button.is-active")?.dataset
    .level || "السنة الأولى";
// Prompt 14 source of truth: complete API data for the selected level.
let currentStudents = [];
let subscriptionStudentId = null;
let toastTimer = null;

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

function paymentStageMeta(student) {
  const stage = student.paymentStage || (student.paymentStatus ? "PAID" : "UNPAID");
  return stage === "PAID"
    ? { label: "اشتراك مدفوع", className: "is-paid" }
    : { label: "اشتراك مجاني", className: "is-unpaid" };
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
}

function truncateText(value, maxLength = 55) {
  const text = String(value || "").trim();
  if (!text) {
    return "—";
  }

  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
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

    const cardCell = document.createElement("td");
    cardCell.className = "card-photo-cell";
    if (student.cardPhotoUrl) {
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
      createCell(student.studentName),
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
    applyFilters();
  } catch (error) {
    if (!/انتهت الجلسة/.test(error.message)) {
      console.error("Unable to fetch teacher roster:", error);
      showDashboardError(error.message || "تعذر تحميل قائمة التلاميذ.");
    }
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
    amountDue: null,
    // مواد الحصص تبقى مفعلة في الخلفية لتوافق البث المباشر، لكنها لا تظهر
    // كخيار اشتراك في لوحة الأستاذ أو الطالب.
    mathEnrollment: true,
    physicsEnrollment: true,
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

function openSubscriptionModal(studentId) {
  const student = currentStudents.find((item) => item.id === studentId);
  if (!student || !elements.subscriptionModal) {
    return;
  }

  subscriptionStudentId = studentId;
  elements.subscriptionStudentName.textContent = student.studentName;
  elements.subscriptionPaymentStage.value =
    student.paymentStage === "PAID" || student.paymentStatus ? "PAID" : "UNPAID";
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

  const paymentStage = elements.subscriptionPaymentStage.value;

  const submitButton = elements.subscriptionForm?.querySelector("button[type='submit']");
  if (submitButton) submitButton.disabled = true;

  try {
    await updateStudent(subscriptionStudentId, {
      paymentStage,
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

if (!getTeacherToken()) {
  // getTeacherToken has already redirected; no protected initialization occurs.
} else {
  elements.levelButtons.forEach((button) => {
    button.addEventListener("click", () => fetchStudents(button.dataset.level));
  });

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
