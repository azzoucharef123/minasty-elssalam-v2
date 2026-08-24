(() => {
  const linkInput = document.getElementById("referral-link-input");
  const copyButton = document.getElementById("copy-referral-link");
  const feedback = document.getElementById("referral-copy-feedback");
  const earnings = document.getElementById("referral-total-earnings");
  const registered = document.getElementById("referral-registered-count");
  const upgraded = document.getElementById("referral-upgraded-count");
  if (!linkInput || !copyButton) return;

  const numberFormatter = new Intl.NumberFormat("ar-DZ");

  function setFeedback(message, isError = false) {
    if (!feedback) return;
    feedback.textContent = message;
    feedback.classList.toggle("is-error", isError);
  }

  function renderSummary(data) {
    if (data?.referralLink) linkInput.value = data.referralLink;
    if (earnings) earnings.textContent = `${numberFormatter.format(Number(data?.totalEarnings || 0))} دج`;
    if (registered) registered.textContent = numberFormatter.format(Number(data?.registeredCount || 0));
    if (upgraded) upgraded.textContent = numberFormatter.format(Number(data?.upgradedCount || 0));
  }

  async function copyReferralLink() {
    const value = linkInput.value;
    if (!value || value === "جارٍ تجهيز الرابط…") return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        linkInput.focus();
        linkInput.select();
        document.execCommand("copy");
        linkInput.setSelectionRange(0, 0);
      }
      setFeedback("تم نسخ رابط الإحالة بنجاح.");
      copyButton.textContent = "تم النسخ";
      window.setTimeout(() => { copyButton.textContent = "نسخ"; }, 1800);
    } catch {
      setFeedback("تعذر النسخ تلقائيًا. اضغط مطولًا على الرابط لنسخه.", true);
    }
  }

  copyButton.addEventListener("click", copyReferralLink);

  const token = sessionStorage.getItem("parentToken");
  const cachedLink = sessionStorage.getItem("referralLink");
  if (cachedLink) linkInput.value = cachedLink;
  if (!token) return;

  fetch("/api/referrals/me", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
  })
    .then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (response.status === 428 && payload.code === "PARENT_PIN_CHANGE_REQUIRED") {
        sessionStorage.setItem("forceParentPinChange", "1");
        window.location.replace("./force-pin.html");
        throw new Error("PIN_CHANGE_REQUIRED");
      }
      if (!response.ok || payload.status !== "success") {
        throw new Error(payload.error || "تعذر تحميل بيانات الإحالة.");
      }
      return payload.data;
    })
    .then((data) => {
      renderSummary(data);
      if (data?.referralCode) sessionStorage.setItem("referralCode", data.referralCode);
      if (data?.referralLink) sessionStorage.setItem("referralLink", data.referralLink);
    })
    .catch((error) => {
      if (error.message !== "PIN_CHANGE_REQUIRED") setFeedback(error.message, true);
    });
})();
