const ARABIC_DIGITS = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};

const registerForm = document.getElementById("register-form");
const submitBtn = document.getElementById("submit-btn");
const message = document.getElementById("register-message");
const confirmation = document.getElementById("registration-confirmation");
const confirmationText = document.getElementById("registration-confirmation-text");
const registerAnotherBtn = document.getElementById("register-another-btn");
const goToDashboardBtn = document.getElementById("go-to-dashboard-btn");
const nameInput = document.getElementById("student-name");
const phoneInput = document.getElementById("parent-phone");
const levelInput = document.getElementById("student-level");
const universityCardField = document.getElementById("university-card-field");
const cardPhotoInput = document.getElementById("card-photo");

let lastRegisteredPhone = "";

function replaceArabicDigits(value) {
  return String(value || "").replace(/[٠-٩۰-۹]/g, (digit) => ARABIC_DIGITS[digit] || digit);
}

function showRegistrationError(text) {
  message.textContent = text;
  message.classList.add("is-error");
  message.hidden = false;
}

function clearRegistrationMessage() {
  message.textContent = "";
  message.classList.remove("is-error");
  message.hidden = true;
}

function syncUniversityCardField() {
  const isUniversityStudent = levelInput?.value === "طالب جامعي";

  if (universityCardField) {
    universityCardField.hidden = !isUniversityStudent;
  }

  if (cardPhotoInput) {
    cardPhotoInput.required = isUniversityStudent;
    cardPhotoInput.disabled = !isUniversityStudent;

    if (!isUniversityStudent) {
      cardPhotoInput.value = "";
    }
  }
}

function resetRegistrationForm({ keepPhone = false } = {}) {
  const phone = keepPhone ? lastRegisteredPhone : "";
  registerForm.reset();
  phoneInput.value = phone;
  syncUniversityCardField();
  clearRegistrationMessage();
  submitBtn.disabled = false;
  submitBtn.textContent = "إتمام التسجيل";
}

function initializeRegistration() {
  if (!registerForm || !submitBtn || !message || !confirmation || !confirmationText) {
    console.error("Registration page markup is incomplete.");
    return;
  }

  levelInput?.addEventListener("change", syncUniversityCardField);

  registerAnotherBtn?.addEventListener("click", () => {
    confirmation.hidden = true;
    resetRegistrationForm({ keepPhone: true });
    nameInput?.focus();
  });

  goToDashboardBtn?.addEventListener("click", () => {
    if (lastRegisteredPhone) {
      sessionStorage.setItem("pendingParentPhone", lastRegisteredPhone);
      window.location.replace("./parent-login.html?autologin=1");
      return;
    }

    window.location.assign("./parent-login.html");
  });

  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearRegistrationMessage();

    const formData = new FormData(registerForm);
    const payload = {
      studentName: String(formData.get("studentName") || "").trim(),
      parentPhone: replaceArabicDigits(formData.get("parentPhone")).trim(),
      level: String(formData.get("level") || "").trim(),
    };

    phoneInput.value = payload.parentPhone;

    const cardFile = cardPhotoInput?.files?.[0] || null;
    const isUniversityStudent = payload.level === "طالب جامعي";

    if (!payload.studentName || !payload.parentPhone || !payload.level) {
      showRegistrationError("يرجى إدخال الاسم واللقب ورقم الهاتف واختيار المستوى الدراسي.");
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

  resetRegistrationForm();
}

initializeRegistration();
