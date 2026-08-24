(() => {
  const token = sessionStorage.getItem("parentToken");
  const messageElement = document.getElementById("withdrawal-message");
  const balanceElement = document.getElementById("withdrawal-available-balance");
  const minimumElement = document.getElementById("withdrawal-minimum");
  const accountElement = document.getElementById("withdrawal-account");
  const nameElement = document.getElementById("withdrawal-name");
  const requestButton = document.getElementById("request-withdrawal");
  const historyElement = document.getElementById("withdrawal-history");
  const logoutButton = document.getElementById("withdrawal-logout");
  const formatter = new Intl.NumberFormat("ar-DZ");

  const statusLabels = {
    PENDING: "قيد المراجعة",
    PAID: "تم التحويل",
    REJECTED: "مرفوض",
    WITHDRAWAL_PENDING: "محجوز لطلب السحب",
  };

  function showMessage(text = "", isError = false) {
    if (!messageElement) return;
    messageElement.textContent = text;
    messageElement.hidden = !text;
    messageElement.style.background = isError ? "#fee2e2" : "#dcfce7";
    messageElement.style.color = isError ? "#991b1b" : "#166534";
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  }

  function maskAccount(value) {
    const account = String(value || "");
    if (account.length <= 6) return account;
    return `${account.slice(0, 3)}••••${account.slice(-3)}`;
  }

  function renderHistory(items) {
    if (!historyElement) return;
    historyElement.innerHTML = (items || []).map((item) => {
      const status = String(item.status || "PENDING").toUpperCase();
      const statusClass = status === "PAID" ? "is-paid" : status === "REJECTED" ? "is-rejected" : "";
      const date = item.requestedAt ? new Date(item.requestedAt).toLocaleString("ar-DZ") : "—";
      const note = item.reviewNote ? `<small>${escapeHtml(item.reviewNote)}</small>` : "";
      return `<article class="withdrawal-history-item"><div><strong>${formatter.format(Number(item.amountDzd || 0))} دج</strong><small>طلب بتاريخ ${escapeHtml(date)}</small>${note}</div><span class="withdrawal-status ${statusClass}">${escapeHtml(statusLabels[status] || status)}</span></article>`;
    }).join("");
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
    const payload = await response.json().catch(() => ({}));
    if (response.status === 428 && payload.code === "PARENT_PIN_CHANGE_REQUIRED") {
      sessionStorage.setItem("forceParentPinChange", "1");
      window.location.replace("./force-pin.html");
      throw new Error("PIN_CHANGE_REQUIRED");
    }
    if (!response.ok) {
      const error = new Error(payload.error || "تعذر تنفيذ العملية.");
      error.code = payload.code;
      throw error;
    }
    return payload;
  }

  async function loadBalance() {
    try {
      const result = await api("/api/referrals/withdrawals");
      const data = result.data || {};
      const available = Number(data.availableBalance || 0);
      const minimum = Number(data.minimumWithdrawal || 1000);
      balanceElement.textContent = `${formatter.format(available)} دج`;
      minimumElement.textContent = `${formatter.format(minimum)} دج`;
      requestButton.disabled = available < minimum;
      renderHistory(data.withdrawals);

      const details = await api("/api/referrals/baridimob");
      const baridi = details.data || {};
      accountElement.textContent = baridi.baridiMobAccount ? maskAccount(baridi.baridiMobAccount) : "غير مضاف";
      nameElement.textContent = baridi.baridiMobName || "غير مضاف";
    } catch (error) {
      if (error.message !== "PIN_CHANGE_REQUIRED") showMessage(error.message, true);
    }
  }

  requestButton?.addEventListener("click", async () => {
    if (!window.confirm("سيتم إرسال طلب تحويل كامل الرصيد المتاح إلى حساب BaridiMob المسجل. هل تريد المتابعة؟")) return;
    requestButton.disabled = true;
    requestButton.textContent = "جارٍ إرسال الطلب…";
    try {
      const result = await api("/api/referrals/withdrawals", { method: "POST" });
      showMessage(result.message || "تم إرسال طلب السحب بنجاح.");
      await loadBalance();
    } catch (error) {
      if (error.message !== "PIN_CHANGE_REQUIRED") showMessage(error.message, true);
    } finally {
      requestButton.textContent = "طلب تحويل الرصيد";
      if (!requestButton.disabled && !messageElement?.classList.contains("is-error")) requestButton.disabled = false;
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
    void loadBalance();
  }
})();
