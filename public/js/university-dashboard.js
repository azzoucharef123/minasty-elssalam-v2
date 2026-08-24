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
  upgradeCard: document.getElementById("university-upgrade-card"),
  upgradeButton: document.getElementById("upgrade-account-button"),
  paymentTransferPanel: document.getElementById("payment-transfer-panel"),
  paymentReceiptInput: document.getElementById("payment-receipt-input"),
  paymentReceiptSubmit: document.getElementById("payment-receipt-submit"),
  paymentReceiptStatus: document.getElementById("payment-receipt-status"),
  paymentConfirmedNotice: document.getElementById("payment-confirmed-notice"),
  logout: document.getElementById("university-logout"),
};

let currentStudent = null;
let paymentTransferPanelRequested = false;

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
    "forceParentPinChange",
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
  if (response.status === 428) {
    const payload = await response.clone().json().catch(() => ({}));
    if (payload.code === "PARENT_PIN_CHANGE_REQUIRED") {
      sessionStorage.setItem("forceParentPinChange", "1");
      window.location.replace("./force-pin.html");
      throw new Error("يجب تغيير كلمة المرور المؤقتة قبل استعمال المنصة.");
    }
  }
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

function renderPaymentUpgrade(student, isPaidSubscription) {
  const pendingReceipt = Boolean(student.paymentReceiptPending);
  const paymentConfirmed = isPaidSubscription && Boolean(student.paymentReceiptUrl);

  if (elements.upgradeCard) {
    elements.upgradeCard.hidden = isPaidSubscription;
  }
  if (elements.paymentConfirmedNotice) {
    elements.paymentConfirmedNotice.hidden = !paymentConfirmed;
  }

  if (isPaidSubscription) {
    paymentTransferPanelRequested = false;
    return;
  }

  if (elements.upgradeButton) {
    elements.upgradeButton.hidden = pendingReceipt;
  }
  if (elements.paymentTransferPanel) {
    elements.paymentTransferPanel.hidden = !pendingReceipt && !paymentTransferPanelRequested;
  }
  if (elements.paymentReceiptInput) {
    elements.paymentReceiptInput.disabled = pendingReceipt;
  }
  if (elements.paymentReceiptSubmit) {
    elements.paymentReceiptSubmit.disabled = pendingReceipt;
  }
  if (elements.paymentReceiptStatus) {
    elements.paymentReceiptStatus.hidden = !pendingReceipt;
    elements.paymentReceiptStatus.textContent = pendingReceipt
      ? "تم إرسال وصل الدفع بنجاح. الوصل الآن في انتظار تأكيد الأستاذ."
      : "";
  }
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
  const isPaidSubscription = payment.className === "success";
  elements.paymentStatus.textContent = payment.text;
  elements.paymentStatus.className = payment.className;
  renderPaymentUpgrade(student, isPaidSubscription);

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

function openPaymentTransferPanel() {
  paymentTransferPanelRequested = true;
  elements.paymentTransferPanel.hidden = false;
  elements.paymentTransferPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function submitPaymentReceipt() {
  const receipt = elements.paymentReceiptInput?.files?.[0];
  if (!receipt || !currentStudent) {
    showError("اختر صورة وصل الدفع أولاً.");
    return;
  }

  const originalLabel = elements.paymentReceiptSubmit?.textContent;
  if (elements.paymentReceiptSubmit) {
    elements.paymentReceiptSubmit.disabled = true;
    elements.paymentReceiptSubmit.textContent = "جارٍ إرسال الوصل…";
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

    elements.paymentReceiptInput.value = "";
    paymentTransferPanelRequested = true;
    await loadDashboard();
  } catch (error) {
    if (!/انتهت جلسة/.test(error.message)) {
      showError(error.message || "تعذر إرسال وصل الدفع.");
    }
  } finally {
    if (elements.paymentReceiptSubmit && !currentStudent?.paymentReceiptPending) {
      elements.paymentReceiptSubmit.disabled = false;
      elements.paymentReceiptSubmit.textContent = originalLabel || "إرسال وصل الدفع للأستاذ";
    }
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
elements.upgradeButton?.addEventListener("click", openPaymentTransferPanel);
elements.paymentReceiptSubmit?.addEventListener("click", () => {
  void submitPaymentReceipt();
});
elements.logout?.addEventListener("click", () => {
  clearSession();
  window.location.replace("./parent-login.html");
});

loadDashboard();
