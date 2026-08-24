"use strict";

const ARABIC_DIGITS = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};

const parentLoginForm = document.querySelector("#parent-login-form, #login-form, form");
const parentPhoneInput = document.querySelector(
  "#parent-phone, #parentPhone, #phone, input[type='tel'], input[name='parentPhone']"
);
const parentPinInput = document.querySelector("#parent-pin, input[name='parentPin']");
const parentLoginError = document.getElementById("login-error");
const parentLoginModal = document.getElementById("parent-login-modal");
const parentLoginModalCloseButtons = Array.from(document.querySelectorAll("[data-close-parent-modal]"));
const parentLoginModalCloseButton = parentLoginModal?.querySelector(".parent-login-modal-close");
const parentSubmitButton = parentLoginForm?.querySelector("button[type='submit'], input[type='submit']");
const forgotParentPinButton = document.getElementById("forgot-parent-pin-btn");
const forgotParentPinMessage = document.getElementById("forgot-parent-pin-message");
const forgotPinModal = document.getElementById("forgot-pin-modal");
const forgotPinForm = document.getElementById("forgot-pin-form");
const forgotPinPhoneInput = document.getElementById("forgot-parent-phone");
const forgotPinSubmitButton = document.getElementById("forgot-pin-submit");
const forgotPinModalMessage = document.getElementById("forgot-pin-modal-message");
const forgotPinSuccessModal = document.getElementById("forgot-pin-success-modal");
const loginQuery = new URLSearchParams(window.location.search);
const shouldAutoLogin = loginQuery.get("autologin") === "1";

function normalizeDigits(value, maximumLength) {
  return String(value || "")
    .replace(/[٠-٩۰-۹]/g, (digit) => ARABIC_DIGITS[digit] || digit)
    .replace(/\D/g, "")
    .slice(0, maximumLength);
}

function isValidParentPhone(value) {
  return /^0[567]\d{8}$/.test(value);
}

function setParentLoginError(message = "") {
  if (!parentLoginError) {
    return;
  }

  parentLoginError.textContent = message;
  parentLoginError.hidden = !message;
}

function openParentLoginModal() {
  if (!parentLoginModal) {
    setParentLoginError("رقم الهاتف غير مسجل.");
    return;
  }

  parentLoginModal.hidden = false;
  document.body.classList.add("parent-login-modal-open");
  parentLoginModalCloseButton?.focus();
}

function closeParentLoginModal() {
  if (!parentLoginModal) {
    return;
  }

  parentLoginModal.hidden = true;
  document.body.classList.remove("parent-login-modal-open");
  parentPhoneInput?.focus();
}

function setForgotPinMessage(message = "", isError = false) {
  if (!forgotParentPinMessage) return;
  forgotParentPinMessage.textContent = message;
  forgotParentPinMessage.hidden = !message;
  forgotParentPinMessage.classList.toggle("is-error", isError);
}

function setForgotPinModalMessage(message = "") {
  if (!forgotPinModalMessage) return;
  forgotPinModalMessage.textContent = message;
  forgotPinModalMessage.hidden = !message;
}

function openForgotPinModal() {
  if (!forgotPinModal) return;
  forgotPinModal.hidden = false;
  forgotPinSuccessModal && (forgotPinSuccessModal.hidden = true);
  document.body.classList.add("parent-login-modal-open");
  setForgotPinModalMessage();
  const sourcePhone = normalizeDigits(parentPhoneInput?.value, 10);
  if (forgotPinPhoneInput && sourcePhone) forgotPinPhoneInput.value = sourcePhone;
  window.setTimeout(() => forgotPinPhoneInput?.focus(), 0);
}

function closeForgotPinModal() {
  if (!forgotPinModal) return;
  forgotPinModal.hidden = true;
  if (parentLoginModal?.hidden !== false && forgotPinSuccessModal?.hidden !== false) {
    document.body.classList.remove("parent-login-modal-open");
  }
}

function openForgotPinSuccessModal() {
  closeForgotPinModal();
  if (!forgotPinSuccessModal) return;
  forgotPinSuccessModal.hidden = false;
  document.body.classList.add("parent-login-modal-open");
  forgotPinSuccessModal.querySelector("[data-close-forgot-pin-success]")?.focus();
}

function closeForgotPinSuccessModal() {
  if (!forgotPinSuccessModal) return;
  forgotPinSuccessModal.hidden = true;
  if (parentLoginModal?.hidden !== false && forgotPinModal?.hidden !== false) {
    document.body.classList.remove("parent-login-modal-open");
  }
  parentPhoneInput?.focus();
}

async function submitForgottenParentPin(event) {
  event.preventDefault();
  setForgotPinModalMessage();
  const parentPhone = normalizeDigits(forgotPinPhoneInput?.value, 10);
  if (forgotPinPhoneInput) forgotPinPhoneInput.value = parentPhone;
  if (!isValidParentPhone(parentPhone)) {
    setForgotPinModalMessage("أدخل رقم الهاتف المسجل أولًا.");
    forgotPinPhoneInput?.focus();
    return;
  }

  if (forgotPinSubmitButton) forgotPinSubmitButton.disabled = true;
  try {
    const response = await fetch("/api/auth/parent/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ parentPhone }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "تعذر تسجيل الطلب.");
    setForgotPinMessage();
    openForgotPinSuccessModal();
  } catch (error) {
    setForgotPinModalMessage(error.message || "تعذر تسجيل الطلب.");
  } finally {
    if (forgotPinSubmitButton) forgotPinSubmitButton.disabled = false;
  }
}

function requestForgottenParentPin() {
  openForgotPinModal();
}

function setParentSubmitting(isSubmitting) {
  if (!parentSubmitButton) {
    return;
  }

  parentSubmitButton.disabled = isSubmitting;
  if (parentSubmitButton.tagName === "BUTTON") {
    parentSubmitButton.textContent = isSubmitting ? "جارٍ الدخول…" : "دخول";
  }
}

function clearParentSession() {
  [
    "parentToken",
    "parentPhone",
    "studentName",
    "level",
    "studentLevel",
    "currentStudent",
    "pendingParentPhone",
    "forceParentPinChange",
  ].forEach((key) => sessionStorage.removeItem(key));
}

async function handleParentLogin(event) {
  event.preventDefault();
  closeParentLoginModal();
  setParentLoginError();

  const parentPhone = normalizeDigits(parentPhoneInput?.value, 10);
  const parentPin = normalizeDigits(parentPinInput?.value, 4);
  parentPhoneInput.value = parentPhone;
  parentPinInput.value = parentPin;

  if (!isValidParentPhone(parentPhone)) {
    setParentLoginError("رقم الهاتف خاطئ: يجب أن يتكون من 10 أرقام ويبدأ بـ 05 أو 06 أو 07.");
    parentPhoneInput?.focus();
    return;
  }

  if (!/^\d{4}$/.test(parentPin)) {
    setParentLoginError("كلمة المرور يجب أن تتكون من 4 أرقام فقط.");
    parentPinInput?.focus();
    return;
  }

  setParentSubmitting(true);

  try {
    const response = await fetch("/api/auth/parent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentPhone, parentPin }),
    });
    const data = await response.json().catch(() => ({}));

    if (response.status === 404) {
      openParentLoginModal();
      return;
    }

    if (!response.ok || !data.token) {
      throw new Error(data.error || "تعذر تسجيل الدخول. حاول مرة أخرى.");
    }

    clearParentSession();
    sessionStorage.setItem("parentToken", data.token);
    sessionStorage.setItem("parentPhone", data.parentPhone || parentPhone);
    sessionStorage.setItem("userRole", "parent");
    if (data.mustChangePin) {
      sessionStorage.setItem("forceParentPinChange", "1");
      window.location.replace("./force-pin.html");
    } else {
      sessionStorage.removeItem("forceParentPinChange");
      window.location.replace("./parent-dashboard.html");
    }
  } catch (error) {
    console.error("Parent JWT login failed:", error);
    setParentLoginError(error.message || "تعذر الاتصال بالخادم. حاول مرة أخرى.");
  } finally {
    setParentSubmitting(false);
  }
}

forgotParentPinButton?.addEventListener("click", () => requestForgottenParentPin());
forgotPinForm?.addEventListener("submit", submitForgottenParentPin);
forgotPinPhoneInput?.addEventListener("input", () => {
  forgotPinPhoneInput.value = normalizeDigits(forgotPinPhoneInput.value, 10);
});

document.querySelectorAll("[data-close-forgot-pin-modal]").forEach((button) => {
  button.addEventListener("click", closeForgotPinModal);
});
document.querySelectorAll("[data-close-forgot-pin-success]").forEach((button) => {
  button.addEventListener("click", closeForgotPinSuccessModal);
});

parentLoginModalCloseButtons.forEach((button) => {
  button.addEventListener("click", closeParentLoginModal);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && parentLoginModal && !parentLoginModal.hidden) {
    closeParentLoginModal();
    return;
  }
  if (event.key === "Escape" && forgotPinModal && !forgotPinModal.hidden) {
    closeForgotPinModal();
    return;
  }
  if (event.key === "Escape" && forgotPinSuccessModal && !forgotPinSuccessModal.hidden) {
    closeForgotPinSuccessModal();
  }
});

if (parentLoginForm && parentPhoneInput && parentPinInput) {
  parentLoginForm.addEventListener("submit", handleParentLogin);

  parentPhoneInput.addEventListener("input", () => {
    parentPhoneInput.value = normalizeDigits(parentPhoneInput.value, 10);
  });

  parentPinInput.addEventListener("input", () => {
    parentPinInput.value = normalizeDigits(parentPinInput.value, 4);
  });

  // After registration, prefill only the guardian number. The PIN is never kept
  // in browser storage and must be entered by the parent.
  if (shouldAutoLogin) {
    const pendingParentPhone = sessionStorage.getItem("pendingParentPhone");
    if (pendingParentPhone) {
      sessionStorage.removeItem("pendingParentPhone");
      parentPhoneInput.value = normalizeDigits(pendingParentPhone, 10);
      setParentLoginError("أدخل كلمة المرور ذات 4 أرقام لإتمام الدخول.");
      window.setTimeout(() => parentPinInput.focus(), 120);
    }
  }
} else {
  console.error("Parent login markup is missing the form, phone input, or PIN input.");
}
