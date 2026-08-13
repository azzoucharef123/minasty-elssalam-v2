import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  RecaptchaVerifier,
  getAuth,
  signInWithPhoneNumber,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDN3docm6VxGwPMx96nTU5ynce4tEpbwYo",
  authDomain: "africa-cold-phone-verification.firebaseapp.com",
  projectId: "africa-cold-phone-verification",
  storageBucket: "africa-cold-phone-verification.firebasestorage.app",
  messagingSenderId: "873666713563",
  appId: "1:873666713563:web:85bc0ff2e5b7790a871b9fe",
  measurementId: "G-FV016KBV97",
};

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
const sendCodeBtn = document.getElementById("send-code-btn");
const otpSection = document.getElementById("otp-section");
const verificationCodeInput = document.getElementById("verification-code");
const verifyCodeBtn = document.getElementById("verify-code-btn");
const verificationMessage = document.getElementById("verification-message");
const verificationSuccess = document.getElementById("verification-success");
const registrationDetails = document.getElementById("registration-details");
const levelInput = document.getElementById("student-level");
const universityCardField = document.getElementById("university-card-field");
const cardPhotoInput = document.getElementById("card-photo");

let auth;
let recaptchaVerifier;
let confirmationResult;
let phoneVerified = false;
let verifiedPhoneLocal = "";
let lastRegisteredPhone = "";

function replaceArabicDigits(value) {
  return String(value || "").replace(/[٠-٩۰-۹]/g, (digit) => ARABIC_DIGITS[digit] || digit);
}

function normalizePhoneForFirebase(value) {
  const compactPhone = replaceArabicDigits(value).trim().replace(/[\s().-]/g, "");
  const digits = compactPhone.replace(/[^0-9+]/g, "");
  const withoutPlus = digits.startsWith("+") ? digits.slice(1) : digits;

  if (/^213[5-7]\d{8}$/.test(withoutPlus)) {
    return `+${withoutPlus}`;
  }

  if (/^0[5-7]\d{8}$/.test(withoutPlus)) {
    return `+213${withoutPlus.slice(1)}`;
  }

  if (/^[5-7]\d{8}$/.test(withoutPlus)) {
    return `+213${withoutPlus}`;
  }

  throw new Error("أدخل رقم هاتف جزائري صحيحًا، مثل: 0556960950.");
}

function toLocalAlgerianPhone(internationalPhone) {
  const digits = String(internationalPhone || "").replace(/\D/g, "");
  return /^213[5-7]\d{8}$/.test(digits) ? `0${digits.slice(3)}` : "";
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

function showVerificationMessage(text, isError = false) {
  verificationMessage.textContent = text;
  verificationMessage.classList.toggle("is-error", isError);
  verificationMessage.hidden = false;
}

function clearVerificationMessage() {
  verificationMessage.textContent = "";
  verificationMessage.classList.remove("is-error");
  verificationMessage.hidden = true;
}

function updateSubmitAvailability() {
  submitBtn.disabled = !(phoneVerified && levelInput?.value);
}

function syncUniversityCardField() {
  const isUniversityStudent = levelInput?.value === "طالب جامعي";
  if (universityCardField) {
    universityCardField.hidden = !isUniversityStudent;
  }
  if (cardPhotoInput) {
    cardPhotoInput.required = isUniversityStudent;
    cardPhotoInput.disabled = !phoneVerified || !isUniversityStudent;
    if (!isUniversityStudent) {
      cardPhotoInput.value = "";
    }
  }
}

function unlockRegistrationDetails() {
  registrationDetails.hidden = false;
  levelInput.disabled = false;
  syncUniversityCardField();
  updateSubmitAvailability();
}

function lockRegistrationDetails() {
  registrationDetails.hidden = true;
  levelInput.value = "";
  levelInput.disabled = true;
  universityCardField.hidden = true;
  cardPhotoInput.required = false;
  cardPhotoInput.disabled = true;
  cardPhotoInput.value = "";
  updateSubmitAvailability();
}

function clearRecaptcha() {
  if (recaptchaVerifier) {
    recaptchaVerifier.clear();
    recaptchaVerifier = undefined;
  }
}

function configureRecaptcha() {
  if (recaptchaVerifier) {
    return recaptchaVerifier;
  }

  recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha-container", {
    size: "invisible",
    callback: () => {},
    "expired-callback": () => {
      showVerificationMessage("انتهت صلاحية التحقق الأمني. أعد إرسال الكود.", true);
    },
  });

  return recaptchaVerifier;
}

function translateFirebaseError(error, fallbackText) {
  const code = error?.code || "";
  const messages = {
    "auth/invalid-phone-number": "رقم الهاتف غير صحيح. أدخله بصيغة 0556960950.",
    "auth/missing-phone-number": "أدخل رقم الهاتف أولًا.",
    "auth/captcha-check-failed": "تعذر إتمام التحقق الأمني. أعد المحاولة بعد لحظات.",
    "auth/too-many-requests": "تمت محاولات كثيرة. انتظر قليلًا قبل طلب كود جديد.",
    "auth/quota-exceeded": "تم بلوغ الحد اليومي لرسائل التحقق. حاول لاحقًا أو تواصل مع الأستاذ.",
    "auth/code-expired": "انتهت صلاحية الكود. اطلب كود تحقق جديدًا.",
    "auth/invalid-verification-code": "كود التحقق غير صحيح. راجعه ثم حاول مجددًا.",
    "auth/missing-verification-code": "أدخل كود التحقق المكوّن من 6 أرقام.",
    "auth/network-request-failed": "تعذر الاتصال بخدمة التحقق. تحقق من الإنترنت ثم أعد المحاولة.",
    "auth/operation-not-allowed": "خدمة التحقق بالهاتف غير مفعّلة في Firebase.",
    "auth/unauthorized-domain": "نطاق الموقع غير مصرح به في إعدادات Firebase.",
    "auth/invalid-app-credential": "تعذر التحقق الأمني من reCAPTCHA. أعد تحميل الصفحة ثم حاول.",
    "auth/app-not-authorized": "إعدادات تطبيق Firebase لا تسمح بإرسال رمز التحقق.",
  };
  return messages[code] || `${fallbackText}${code ? ` (${code})` : ""}`;
}

function resetPhoneVerification({ preservePhone = true } = {}) {
  const phone = preservePhone ? phoneInput.value : "";
  phoneVerified = false;
  verifiedPhoneLocal = "";
  confirmationResult = undefined;
  phoneInput.readOnly = false;
  phoneInput.value = phone;
  sendCodeBtn.disabled = false;
  sendCodeBtn.textContent = "إرسال كود التحقق";
  otpSection.hidden = true;
  verificationCodeInput.value = "";
  verificationSuccess.hidden = true;
  clearVerificationMessage();
  clearRecaptcha();
  lockRegistrationDetails();
}

async function sendVerificationCode() {
  clearRegistrationMessage();
  clearVerificationMessage();

  let internationalPhone;
  try {
    internationalPhone = normalizePhoneForFirebase(phoneInput.value);
  } catch (error) {
    showVerificationMessage(error.message, true);
    phoneInput.focus();
    return;
  }

  sendCodeBtn.disabled = true;
  const originalText = sendCodeBtn.textContent;
  sendCodeBtn.textContent = "جاري إرسال الكود...";

  try {
    const appVerifier = configureRecaptcha();
    confirmationResult = await signInWithPhoneNumber(auth, internationalPhone, appVerifier);
    otpSection.hidden = false;
    verificationSuccess.hidden = true;
    showVerificationMessage("تم إرسال كود التحقق. أدخله خلال دقائق لإكمال التسجيل.");
    verificationCodeInput.focus();
  } catch (error) {
    console.error("Phone verification SMS failed:", error);
    showVerificationMessage(translateFirebaseError(error, "تعذر إرسال كود التحقق. أعد المحاولة."), true);
    clearRecaptcha();
  } finally {
    sendCodeBtn.disabled = false;
    sendCodeBtn.textContent = originalText;
  }
}

async function verifySmsCode() {
  clearVerificationMessage();
  const code = replaceArabicDigits(verificationCodeInput.value).replace(/\D/g, "");

  if (!confirmationResult) {
    showVerificationMessage("اطلب كود التحقق أولًا.", true);
    return;
  }

  if (!/^\d{6}$/.test(code)) {
    showVerificationMessage("أدخل كود التحقق المكوّن من 6 أرقام.", true);
    verificationCodeInput.focus();
    return;
  }

  verifyCodeBtn.disabled = true;
  const originalText = verifyCodeBtn.textContent;
  verifyCodeBtn.textContent = "جاري التحقق...";

  try {
    const result = await confirmationResult.confirm(code);
    const localPhone = toLocalAlgerianPhone(result?.user?.phoneNumber);

    if (!localPhone) {
      throw new Error("تعذر مطابقة رقم الهاتف المتحقق منه.");
    }

    phoneVerified = true;
    verifiedPhoneLocal = localPhone;
    phoneInput.value = localPhone;
    phoneInput.readOnly = true;
    sendCodeBtn.disabled = true;
    sendCodeBtn.textContent = "تم إرسال الكود";
    otpSection.hidden = true;
    verificationSuccess.hidden = false;
    showVerificationMessage("تم تأكيد رقم هاتفك بنجاح. يمكنك الآن اختيار المستوى الدراسي.");
    unlockRegistrationDetails();
    levelInput.focus();
  } catch (error) {
    console.error("Phone verification code failed:", error);
    showVerificationMessage(translateFirebaseError(error, error.message || "تعذر التحقق من الكود."), true);
  } finally {
    verifyCodeBtn.disabled = false;
    verifyCodeBtn.textContent = originalText;
  }
}

function initializeRegistration() {
  if (!registerForm || !submitBtn || !message || !confirmation || !confirmationText) {
    console.error("Registration page markup is incomplete.");
    return;
  }

  try {
    auth = getAuth(initializeApp(firebaseConfig));
  } catch (error) {
    console.error("Firebase initialization failed:", error);
    showVerificationMessage("تعذر تشغيل خدمة التحقق حاليًا. أعد تحميل الصفحة ثم حاول مجددًا.", true);
    sendCodeBtn.disabled = true;
    return;
  }

  levelInput.addEventListener("change", () => {
    syncUniversityCardField();
    updateSubmitAvailability();
  });

  phoneInput.addEventListener("input", () => {
    if (phoneVerified) {
      resetPhoneVerification({ preservePhone: true });
      showVerificationMessage("لقد تغيّر الرقم. أرسل كود تحقق للرقم الجديد.");
    }
  });

  sendCodeBtn.addEventListener("click", sendVerificationCode);
  verifyCodeBtn.addEventListener("click", verifySmsCode);

  verificationCodeInput.addEventListener("input", () => {
    verificationCodeInput.value = replaceArabicDigits(verificationCodeInput.value).replace(/\D/g, "").slice(0, 6);
  });

  registerAnotherBtn?.addEventListener("click", () => {
    confirmation.hidden = true;
    registerForm.reset();
    clearRegistrationMessage();

    if (lastRegisteredPhone && lastRegisteredPhone === verifiedPhoneLocal) {
      phoneInput.value = lastRegisteredPhone;
      phoneVerified = true;
      phoneInput.readOnly = true;
      sendCodeBtn.disabled = true;
      sendCodeBtn.textContent = "تم إرسال الكود";
      verificationSuccess.hidden = false;
      showVerificationMessage("رقم الهاتف مؤكد. أكمل بيانات التلميذ التالي.");
      unlockRegistrationDetails();
    } else {
      resetPhoneVerification({ preservePhone: false });
    }

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
    clearRegistrationMessage();

    const formData = new FormData(registerForm);
    const payload = {
      studentName: String(formData.get("studentName") || "").trim(),
      parentPhone: String(formData.get("parentPhone") || "").trim(),
      level: String(formData.get("level") || "").trim(),
    };

    const cardFile = cardPhotoInput?.files?.[0] || null;
    const isUniversityStudent = payload.level === "طالب جامعي";

    if (!phoneVerified || payload.parentPhone !== verifiedPhoneLocal) {
      showRegistrationError("يرجى تأكيد رقم الهاتف بكود التحقق قبل إتمام التسجيل.");
      return;
    }

    if (!payload.studentName || !payload.level) {
      showRegistrationError("يرجى إدخال الاسم واللقب واختيار المستوى الدراسي.");
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

      lastRegisteredPhone = data?.data?.parentPhone || verifiedPhoneLocal;
      confirmationText.textContent = `تم تأكيد تسجيل ${payload.studentName} بنجاح. يمكنك الآن تسجيل تلميذ آخر بنفس الرقم أو الدخول لمتابعة التقدم.`;
      confirmation.hidden = false;
    } catch (error) {
      console.error("Student registration failed:", error);
      showRegistrationError(error.message || "حدث خطأ في الاتصال.");
      updateSubmitAvailability();
      submitBtn.textContent = originalText;
    }
  });

  lockRegistrationDetails();
  syncUniversityCardField();
  updateSubmitAvailability();
}

initializeRegistration();
