"use strict";

const registerForm = document.getElementById("register-form");
const submitBtn = document.getElementById("submit-btn");
const message = document.getElementById("register-message");
const confirmation = document.getElementById("registration-confirmation");
const confirmationText = document.getElementById("registration-confirmation-text");
const registerAnotherBtn = document.getElementById("register-another-btn");
const goToDashboardBtn = document.getElementById("go-to-dashboard-btn");
const levelInput = document.getElementById("student-level");
const universityCardField = document.getElementById("university-card-field");
const cardPhotoInput = document.getElementById("card-photo");

let lastRegisteredPhone = "";

function syncUniversityCardField() {
  const isUniversityStudent = levelInput?.value === "طالب جامعي";
  if (universityCardField) {
    universityCardField.hidden = !isUniversityStudent;
  }
  if (cardPhotoInput) {
    cardPhotoInput.required = isUniversityStudent;
    if (!isUniversityStudent) {
      cardPhotoInput.value = "";
    }
  }
}

function showRegistrationError(text) {
  message.textContent = text;
  message.classList.add("is-error");
  message.hidden = false;
}

if (registerForm && submitBtn && message && confirmation && confirmationText) {
  levelInput?.addEventListener("change", syncUniversityCardField);
  syncUniversityCardField();

  registerAnotherBtn?.addEventListener("click", () => {
    confirmation.hidden = true;
    registerForm.reset();
    syncUniversityCardField();
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

    const cardFile = cardPhotoInput?.files?.[0] || null;
    const isUniversityStudent = payload.level === "طالب جامعي";

    if (!payload.studentName || !payload.parentPhone || !payload.level) {
      showRegistrationError("يرجى ملء جميع الحقول.");
      return;
    }

    if (isUniversityStudent && !cardFile) {
      showRegistrationError("يرجى إرفاق صورة بطاقة الطالب الجامعي لإكمال التسجيل.");
      cardPhotoInput?.focus();
      return;
    }

    if (cardFile) {
      const allowedTypes = ["image/jpeg", "image/png"];
      if (!allowedTypes.includes(cardFile.type)) {
        showRegistrationError("صورة البطاقة يجب أن تكون بصيغة JPG أو PNG.");
        return;
      }
      if (cardFile.size > 5 * 1024 * 1024) {
        showRegistrationError("حجم صورة البطاقة يجب ألا يتجاوز 5 ميغابايت.");
        return;
      }
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
        body: formData,
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
