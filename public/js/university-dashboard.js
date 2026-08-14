"use strict";

const tokenKey = "parentToken";
const elements = {
  error: document.getElementById("university-error"),
  loading: document.getElementById("university-loading"),
  content: document.getElementById("university-content"),
  avatar: document.getElementById("university-avatar"),
  name: document.getElementById("university-student-name"),
  cardStatus: document.getElementById("university-card-status"),
  paymentStatus: document.getElementById("university-payment-status"),
  liveStatus: document.getElementById("university-live-status"),
  liveButton: document.getElementById("university-live-button"),
  logout: document.getElementById("university-logout"),
};

let currentStudent = null;

function showError(message) {
  if (!elements.error) return;
  elements.error.textContent = message;
  elements.error.hidden = !message;
}

function clearSession() {
  [
    "parentToken",
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
  ].forEach((key) => sessionStorage.removeItem(key));
}

function redirectToLogin() {
  clearSession();
  window.location.replace("./parent-login.html");
}

function getInitials(value) {
  const words = String(value || "طالب").trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word.charAt(0)).join("") || "ط";
}

function persistStudent(student) {
  sessionStorage.setItem("selectedStudentId", student.id);
  sessionStorage.setItem("studentName", student.studentName);
  sessionStorage.setItem("level", student.level);
  sessionStorage.setItem("studentLevel", student.level);
  sessionStorage.setItem("studentId", student.id);
  sessionStorage.setItem("currentStudent", JSON.stringify(student));
}

async function parentFetch(url, options = {}) {
  const token = sessionStorage.getItem(tokenKey);
  if (!token) {
    redirectToLogin();
    throw new Error("انتهت جلسة الدخول.");
  }

  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(url, { ...options, headers });
  if (response.status === 401 || response.status === 403) {
    redirectToLogin();
    throw new Error("انتهت جلسة الدخول.");
  }
  return response;
}

function paymentLabel(student) {
  const stage = student.paymentStage || (student.paymentStatus ? "PAID" : "UNPAID");
  return stage === "PAID"
    ? { text: "اشتراك مدفوع", className: "success" }
    : { text: "اشتراك مجاني", className: "pending" };
}

function renderStudent(student) {
  currentStudent = student;
  persistStudent(student);

  elements.avatar.textContent = getInitials(student.studentName);
  elements.name.textContent = student.studentName;

  const cardIsReady = Boolean(student.cardPhotoUrl);
  const identityPending =
    student.accountActive === false &&
    !student.cardReuploadRequested &&
    cardIsReady;
  elements.cardStatus.textContent = student.cardReuploadRequested
    ? "يجب إعادة رفع البطاقة"
    : identityPending
      ? "في انتظار تأكيد هوية البطاقة"
      : cardIsReady
        ? "تم تأكيد البطاقة"
        : "البطاقة غير مرفقة";
  elements.cardStatus.className = identityPending
    ? "pending"
    : student.cardReuploadRequested || !cardIsReady
      ? "danger"
      : "success";

  const payment = paymentLabel(student);
  elements.paymentStatus.textContent = payment.text;
  elements.paymentStatus.className = payment.className;

  const accountReady = student.accountActive !== false && !student.cardReuploadRequested;
  elements.liveStatus.textContent = !accountReady
    ? student.cardReuploadRequested
      ? "يجب رفع بطاقة جديدة"
      : "في انتظار تأكيد الهوية"
    : student.liveAccessEnabled
      ? "الدخول مفعّل"
      : "بانتظار تفعيل الأستاذ";
  elements.liveStatus.className = accountReady && student.liveAccessEnabled ? "success" : "pending";
  elements.liveButton.disabled = !student.liveAccessEnabled || !accountReady;
  elements.liveButton.title = !accountReady
    ? "يجب أن يؤكد الأستاذ هوية البطاقة أولاً"
    : student.liveAccessEnabled
      ? "فتح الحصة المباشرة"
      : "يجب أن يفعّل الأستاذ دخولك أولاً";
}

async function loadDashboard() {
  const phone = sessionStorage.getItem("parentPhone");
  if (!phone || !sessionStorage.getItem(tokenKey)) {
    redirectToLogin();
    return;
  }

  try {
    const response = await parentFetch(`/api/students/parent/${encodeURIComponent(phone)}`, {
      headers: { Accept: "application/json" },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "تعذر تحميل بيانات الطالب الجامعي.");

    const students = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.students)
        ? payload.students
        : payload?.id
          ? [payload]
          : [];
    const universityStudents = students.filter((student) => student.level === "طالب جامعي");
    if (!universityStudents.length) {
      throw new Error("لا يوجد طالب جامعي مرتبط بهذا الحساب.");
    }

    const selectedId = sessionStorage.getItem("selectedStudentId");
    const student = universityStudents.find((item) => item.id === selectedId) || universityStudents[0];
    sessionStorage.setItem("parentStudents", JSON.stringify(students));
    renderStudent(student);
    elements.content.hidden = false;
  } catch (error) {
    if (!/انتهت جلسة/.test(error.message)) showError(error.message || "تعذر تحميل لوحة الطالب الجامعي.");
  } finally {
    elements.loading.hidden = true;
  }
}

function enterLiveClass() {
  if (currentStudent?.accountActive === false || currentStudent?.cardReuploadRequested) {
    showError(
      currentStudent?.cardReuploadRequested
        ? "يجب رفع بطاقة جديدة أولاً."
        : "حسابك في انتظار تأكيد هوية البطاقة من الأستاذ."
    );
    return;
  }

  if (!currentStudent?.liveAccessEnabled) {
    showError("لم يفعّل الأستاذ دخولك إلى الحصة بعد.");
    return;
  }
  persistStudent(currentStudent);
  window.location.assign("./student-live.html");
}

elements.liveButton?.addEventListener("click", enterLiveClass);
elements.logout?.addEventListener("click", () => {
  clearSession();
  window.location.replace("./parent-login.html");
});

loadDashboard();
