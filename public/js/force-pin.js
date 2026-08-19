const token = sessionStorage.getItem("parentToken");
const form = document.getElementById("force-pin-form");
const errorElement = document.getElementById("force-pin-error");
const successElement = document.getElementById("force-pin-success");
const submitButton = document.getElementById("force-pin-submit");
const inputs = [
  document.getElementById("current-pin"),
  document.getElementById("new-pin"),
  document.getElementById("confirm-pin"),
];

const arabicDigits = { "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9" };

function normalizePin(value) {
  return String(value || "")
    .replace(/[٠-٩]/g, (digit) => arabicDigits[digit] || digit)
    .replace(/\D/g, "")
    .slice(0, 4);
}

function showMessage(element, message = "") {
  element.textContent = message;
  element.hidden = !message;
}

async function changeTemporaryPin(event) {
  event.preventDefault();
  showMessage(errorElement);
  showMessage(successElement);

  const [currentPin, newPin, confirmPin] = inputs.map((input) => normalizePin(input.value));
  inputs.forEach((input, index) => { input.value = [currentPin, newPin, confirmPin][index]; });

  if (!/^\d{4}$/.test(currentPin) || !/^\d{4}$/.test(newPin) || newPin !== confirmPin) {
    showMessage(errorElement, "أدخل كلمات مرور من أربعة أرقام، وتأكد من تطابق الكلمة الجديدة.");
    return;
  }

  if (!token) {
    showMessage(errorElement, "انتهت الجلسة. سجّل الدخول من جديد.");
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "جارٍ الحفظ…";
  try {
    const response = await fetch("/api/auth/parent/pin", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ currentPin, newPin, confirmPin }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "تعذر تغيير كلمة المرور.");

    sessionStorage.removeItem("forceParentPinChange");
    showMessage(successElement, data.message || "تم تغيير كلمة المرور بنجاح.");
    window.setTimeout(() => window.location.replace("./parent-dashboard.html"), 700);
  } catch (error) {
    showMessage(errorElement, error.message || "تعذر تغيير كلمة المرور.");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "حفظ كلمة المرور الجديدة";
  }
}

if (!token) {
  window.location.replace("./parent-login.html");
} else {
  form?.addEventListener("submit", changeTemporaryPin);
  inputs.forEach((input) => input?.addEventListener("input", () => { input.value = normalizePin(input.value); }));
  inputs[0]?.focus();
}
