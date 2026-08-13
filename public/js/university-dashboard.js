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
  amountDue: document.getElementById("university-amount-due"),
  subjects: document.getElementById("university-subjects"),
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
  if (stage === "PAID") return { text: "تم الدفع بنجاح", className: "success" };
  if (stage === "PROMISED") return { text: "اتصل بالأستاذ وسيدفع", className: "pending" };
  return { text: "في انتظار الدفع", className: "pending" };
}

function renderStudent(student) {
  currentStudent = student;
  persistStudent(student);

  elements.avatar.textContent = getInitials(student.studentName);
  elements.name.textContent = student.studentName;

  const cardIsReady = Boolean(student.cardPhotoUrl);
  elements.cardStatus.textContent = cardIsReady ? "تم رفع البطاقة" : "البطاقة غير مرفقة";
  elements.cardStatus.className = cardIsReady ? "success" : "danger";

  const payment = paymentLabel(student);
  elements.paymentStatus.textContent = payment.text;
  elements.paymentStatus.className = payment.className;

  const amount = Number.isInteger(student.amountDue);
  elements.amountDue.textContent = amount
    ? `${student.amountDue.toLocaleString("ar-DZ")} دج`
    : "لا يوجد";

  elements.subjects.replaceChildren();
  const subjects = [];
  if (student.mathEnrollment) subjects.push("الرياضيات");
  if (student.physicsEnrollment) subjects.push("الفيزياء");
  (subjects.length ? subjects : ["لم تُحدد المواد بعد"]).forEach((subject) => {
    const tag = document.createElement("span");
    tag.className = "university-subject";
    tag.textContent = subject;
    elements.subjects.append(tag);
  });

  elements.liveStatus.textContent = student.liveAccessEnabled ? "الدخول مفعّل" : "بانتظار تفعيل الأستاذ";
  elements.liveStatus.className = student.liveAccessEnabled ? "success" : "pending";
  elements.liveButton.disabled = !student.liveAccessEnabled;
  elements.liveButton.title = student.liveAccessEnabled
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
