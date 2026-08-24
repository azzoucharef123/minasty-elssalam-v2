(() => {
  const token = sessionStorage.getItem("parentToken");
  const form = document.getElementById("baridimob-form");
  const accountInput = document.getElementById("baridiMobAccount");
  const nameInput = document.getElementById("baridiMobName");
  const messageElement = document.getElementById("baridimob-message");
  const logoutButton = document.getElementById("baridimob-logout");

  function showMessage(text = "", isError = false) {
    if (!messageElement) return;
    messageElement.textContent = text;
    messageElement.hidden = !text;
    messageElement.style.background = isError ? "#fee2e2" : "#dcfce7";
    messageElement.style.color = isError ? "#991b1b" : "#166534";
  }

  function normalizeDigits(value) {
    const arabicDigits = { "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9", "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9" };
    return String(value || "").replace(/[٠-٩۰-۹]/g, (digit) => arabicDigits[digit] || digit).replace(/\D/g, "").slice(0, 30);
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 428 && data.code === "PARENT_PIN_CHANGE_REQUIRED") {
      sessionStorage.setItem("forceParentPinChange", "1");
      window.location.replace("./force-pin.html");
      throw new Error("يجب تغيير كلمة المرور المؤقتة قبل استعمال المنصة.");
    }
    if (!response.ok) throw new Error(data.error || "تعذر تنفيذ العملية.");
    return data;
  }

  async function loadDetails() {
    try {
      const result = await api("/api/referrals/baridimob");
      accountInput.value = result.data?.baridiMobAccount || "";
      nameInput.value = result.data?.baridiMobName || "";
    } catch (error) {
      showMessage(error.message, true);
    }
  }

  accountInput?.addEventListener("input", () => {
    accountInput.value = normalizeDigits(accountInput.value);
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const baridiMobAccount = normalizeDigits(accountInput.value);
    const baridiMobName = String(nameInput.value || "").trim().replace(/\s+/g, " ");
    accountInput.value = baridiMobAccount;
    nameInput.value = baridiMobName;

    if (!/^\d{10,30}$/.test(baridiMobAccount)) {
      showMessage("رقم حساب BaridiMob يجب أن يتكون من 10 إلى 30 رقمًا.", true);
      accountInput.focus();
      return;
    }
    if (baridiMobName.length < 3) {
      showMessage("أدخل الاسم واللقب كما يظهران في حساب BaridiMob.", true);
      nameInput.focus();
      return;
    }

    const submitButton = form.querySelector("button[type=submit]");
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "جارٍ الحفظ…";
    }
    try {
      const result = await api("/api/referrals/baridimob", {
        method: "PUT",
        body: JSON.stringify({ baridiMobAccount, baridiMobName }),
      });
      showMessage(result.message || "تم حفظ معلومات BaridiMob بنجاح.");
    } catch (error) {
      showMessage(error.message, true);
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "حفظ معلومات BaridiMob";
      }
    }
  });

  logoutButton?.addEventListener("click", () => {
    void window.revokeServerSession?.();
    sessionStorage.clear();
    localStorage.clear();
    window.location.replace("./parent-login.html");
  });

  if (!token) {
    window.location.replace("./parent-login.html");
  } else {
    void loadDetails();
  }
})();
