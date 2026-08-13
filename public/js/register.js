"use strict";

const registerForm = document.getElementById("register-form");
const submitBtn = document.getElementById("submit-btn");
const message = document.getElementById("register-message");
const confirmation = document.getElementById("registration-confirmation");
const confirmationText = document.getElementById("registration-confirmation-text");
const registerAnotherBtn = document.getElementById("register-another-btn");
const goToDashboardBtn = document.getElementById("go-to-dashboard-btn");

let lastRegisteredPhone = "";

function showRegistrationError(text) {
  message.textContent = text;
  message.classList.add("is-error");
  message.hidden = false;
}

if (registerForm && submitBtn && message && confirmation && confirmationText) {
  registerAnotherBtn?.addEventListener("click", () => {
    confirmation.hidden = true;
    registerForm.reset();
    if (lastRegisteredPhone) {
      const phoneInput = document.getElementById("parent-phone");
      if (phoneInput) phoneInput.value = lastRegisteredPhone;
    }
    submitBtn.disabled = false;
    submitBtn.textContent = "إتمام التسجيل";
    const nameInput = document.getElementById("student-name");
    nameInput?.focus();
  });

  goToDashboardBtn?.addEventListener("click", () => {
    if (lastRegisteredPhone) {
      sessionStorage.setItem("pendingParentPhone", lastRegisteredPhone);
      window.location.replace("./parent-login.html?autologin=1");
    } else {
      window.location.assign("./parent-login.html");
    }
  });

  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(registerForm);
    const payload = {
      studentName: String(formData.get("studentName") || "").trim(),
      parentPhone: String(formData.get("parentPhone") || "").trim(),
      level: String(formData.get("level") || "").trim(),
    };

    if (!payload.studentName || !payload.parentPhone || !payload.level) {
      showRegistrationError("يرجى ملء جميع الحقول.");
      return;
    }

    message.hidden = true;
    message.textContent = "";
    message.classList.remove("is-error");
    submitBtn.disabled = true;
    const originalText = submitBtn.textContent;
    submitBtn.textContent = "جاري التسجيل...";

    try {
      const response = await fetch("/api/students/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "تعذر إتمام التسجيل.");
      }

      lastRegisteredPhone = data?.data?.parentPhone || payload.parentPhone;
      confirmationText.textContent = `تم تأكيد تسجيل ${payload.studentName} بنجاح. يمكنك الآن تسجيل تلميذ آخر بنفس الرقم أو الدخول لمتابعة التقدم.`;
      confirmation.hidden = false;
    } catch (error) {
      console.error("Student registration failed:", error);
      showRegistrationError(error.message || "حدث خطأ في الاتصال.");
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  });
} else {
  console.error("Registration page markup is incomplete.");
}
