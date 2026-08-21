const params = new URLSearchParams(window.location.search);
const level = params.get("level") || sessionStorage.getItem("studentLevel") || sessionStorage.getItem("level") || "";
const subject = params.get("subject") || "";
const scheduledAt = params.get("scheduledAt") || "";
const studentName = params.get("studentName") || sessionStorage.getItem("studentName") || "";

const levelLabels = {
  "السنة الأولى": "السنة الأولى متوسط",
  "السنة الثانية": "السنة الثانية متوسط",
  "السنة الثالثة": "السنة الثالثة متوسط",
  "السنة الرابعة": "السنة الرابعة متوسط",
  "طالب جامعي": "طالب جامعي",
};
const subjectLabels = {
  MATH: "الرياضيات",
  PHYSICS: "الفيزياء",
  BOTH: "الرياضيات والفيزياء",
  FREE: "الحصة المجانية",
};

function formatScheduledAt(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "لا توجد حصة قادمة مبرمجة حاليًا";
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

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

const levelLabel = levelLabels[level] || level || "المستوى الدراسي";
const subjectLabel = subjectLabels[subject] || subject || "حسب برنامج المستوى";
setText("class-level-label", levelLabel);
setText("class-subject-label", subjectLabel);
setText("student-participation-count", "صفحة الموعد القادمة");
setText("times-level-student-context", studentName ? `${studentName} — ${levelLabel}` : levelLabel);
setText("student-times-level-time", formatScheduledAt(scheduledAt));
setText("student-times-level-subject", `${levelLabel} — ${subjectLabel}`);

const disabledButtons = [...document.querySelectorAll("button:not(#student-exit-class-btn)")];
disabledButtons.forEach((button) => {
  button.disabled = true;
  button.setAttribute("aria-disabled", "true");
  button.setAttribute("tabindex", "-1");
});

document.getElementById("student-exit-class-btn")?.addEventListener("click", () => {
  if (window.history.length > 1) {
    window.history.back();
    return;
  }
  window.location.assign("./parent-dashboard.html");
});
