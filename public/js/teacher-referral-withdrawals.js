(() => {
  const tableBody = document.getElementById("teacher-referral-withdrawals-table-body");
  const emptyState = document.getElementById("teacher-referral-withdrawals-empty");
  const feedback = document.getElementById("teacher-referral-withdrawals-feedback");
  const statusSelect = document.getElementById("teacher-referral-withdrawal-status");
  const refreshButton = document.getElementById("teacher-referral-withdrawal-refresh");
  const pendingCount = document.getElementById("teacher-referral-pending-count");
  const pendingTotal = document.getElementById("teacher-referral-pending-total");
  const activityList = document.getElementById("teacher-referral-activity-list");
  const activityCount = document.getElementById("teacher-referral-activity-count");
  if (!tableBody || !statusSelect || !activityList) return;

  const formatter = new Intl.NumberFormat("ar-DZ");
  let loaded = false;

  const statusLabels = {
    PENDING: "معلقة",
    PAID: "مدفوعة",
    REJECTED: "مرفوضة",
  };

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  }

  function setFeedback(text = "", isError = false) {
    if (!feedback) return;
    feedback.textContent = text;
    feedback.hidden = !text;
    feedback.classList.toggle("is-error", isError);
  }

  function formatDate(value) {
    return value ? new Date(value).toLocaleString("ar-DZ") : "—";
  }

  function renderRows(items) {
    tableBody.innerHTML = (items || []).map((item) => {
      const status = String(item.status || "PENDING").toUpperCase();
      const actions = status === "PENDING"
        ? `<div class="teacher-referral-withdrawal-actions"><button class="teacher-withdrawal-approve" type="button" data-withdrawal-id="${escapeHtml(item.id)}" data-decision="APPROVE">قبول وتأكيد التحويل</button><button class="teacher-withdrawal-reject" type="button" data-withdrawal-id="${escapeHtml(item.id)}" data-decision="REJECT">رفض</button></div>`
        : `<span class="teacher-withdrawal-reviewed">${escapeHtml(item.reviewNote || statusLabels[status] || status)}</span>`;
      return `<tr><td dir="ltr">${escapeHtml(item.referrerPhone)}</td><td><strong>${formatter.format(Number(item.amountDzd || 0))} دج</strong></td><td dir="ltr" class="teacher-baridimob-account">${escapeHtml(item.baridiMobAccount)}</td><td>${escapeHtml(item.baridiMobName)}</td><td>${formatter.format(Number(item.commissionCount || 0))}</td><td>${escapeHtml(formatDate(item.requestedAt))}</td><td>${actions}</td></tr>`;
    }).join("");
    emptyState.hidden = Boolean(items?.length);
  }

  function renderSummary(items) {
    const pending = (items || []).filter((item) => String(item.status).toUpperCase() === "PENDING");
    const total = pending.reduce((sum, item) => sum + Number(item.amountDzd || 0), 0);
    if (pendingCount) pendingCount.textContent = `${formatter.format(pending.length)} معلقة`;
    if (pendingTotal) pendingTotal.textContent = `${formatter.format(total)} دج`;
  }

  function renderActivity(items) {
    const activeItems = (items || []).filter((item) => Number(item.registeredCount) > 0);
    if (activityCount) activityCount.textContent = `${formatter.format(activeItems.length)} صاحب رابط نشط`;
    if (!activeItems.length) {
      activityList.innerHTML = `<p class="teacher-referral-activity-empty">لا توجد تسجيلات عبر روابط الإحالة حتى الآن.</p>`;
      return;
    }
    activityList.innerHTML = activeItems.map((item) => {
      const referrerName = item.referrerNames?.map((entry) => entry.studentName).filter(Boolean).join("، ") || "اسم صاحب الرابط غير متوفر";
      const referrals = (item.referrals || []).map((referral) => {
        const commissionCount = Number(referral.commissionCount || 0);
        const status = referral.upgraded
          ? `${commissionCount > 1 ? `${commissionCount} عمولات` : `رقّى ${referral.upgradeType === "BOTH" ? "المادتين" : "مادة واحدة"}`} · ${formatter.format(Number(referral.commissionAmountDzd || 0))} دج`
          : "سجّل فقط";
        const statusClass = referral.upgraded ? "is-upgraded" : "is-registered";
        const levelDetails = (referral.levels || []).map((level) => {
          const students = (level.students || []).map((student) => {
            const paymentLabel = student.paymentStatus || student.paymentStage === "PAID" ? "مدفوع" : "غير مدفوع";
            return `<li><span>${escapeHtml(student.studentName || "اسم غير متوفر")}</span><small class="${student.paymentStatus || student.paymentStage === "PAID" ? "is-paid" : "is-unpaid"}">${paymentLabel}</small></li>`;
          }).join("");
          const commission = level.commission;
          const commissionLabel = commission
            ? `عمولة ${formatter.format(Number(commission.amountDzd || 0))} دج`
            : "لا توجد عمولة بعد";
          return `<section class="teacher-referral-level-detail"><header><strong>${escapeHtml(level.level)}</strong><span>${formatter.format(Number(level.studentCount || 0))} تلميذ · ${escapeHtml(commissionLabel)}</span></header><ul>${students || `<li><span>لا يوجد تلميذ</span></li>`}</ul></section>`;
        }).join("");
        const fallbackNames = referral.names?.map((entry) => `${entry.studentName}${entry.level ? ` — ${entry.level}` : ""}`).join("، ") || "لا توجد تفاصيل تلاميذ";
        return `<li><div class="teacher-referral-referral-copy"><strong dir="ltr">${escapeHtml(referral.parentPhone)}</strong><small>سجّل ${escapeHtml(formatDate(referral.registeredAt))}</small><div class="teacher-referral-level-list">${levelDetails || `<p>${escapeHtml(fallbackNames)}</p>`}</div></div><b class="${statusClass}">${escapeHtml(status)}</b></li>`;
      }).join("");
      return `<details class="teacher-referral-activity-card"><summary><span><strong>${escapeHtml(referrerName)}</strong><small dir="ltr">${escapeHtml(item.referrerPhone)}</small></span><span class="teacher-referral-activity-stats"><b>${formatter.format(item.registeredCount)} مسجل</b><b>${formatter.format(item.upgradedCount)} رقّى</b><b>${formatter.format(item.totalCommissionDzd)} دج</b></span></summary><ul>${referrals}</ul></details>`;
    }).join("");
  }

  async function loadTeacherReferralActivity() {
    if (typeof teacherFetch !== "function") return;
    try {
      const response = await teacherFetch("/api/referrals/teacher/activity", { headers: { Accept: "application/json" } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.status !== "success") throw new Error(payload.error || "تعذر تحميل نشاط الإحالات.");
      renderActivity(payload.data || []);
    } catch (error) {
      activityList.innerHTML = `<p class="teacher-referral-activity-empty is-error">${escapeHtml(error.message || "تعذر تحميل نشاط الإحالات.")}</p>`;
    }
  }

  async function loadTeacherReferralWithdrawals() {
    if (typeof teacherFetch !== "function") return;
    setFeedback("جارٍ تحميل طلبات السحب…");
    try {
      const status = encodeURIComponent(statusSelect.value || "PENDING");
      const response = await teacherFetch(`/api/referrals/teacher/withdrawals?status=${status}`, { headers: { Accept: "application/json" } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.status !== "success") throw new Error(payload.error || "تعذر تحميل طلبات السحب.");
      renderRows(payload.data || []);
      if (statusSelect.value === "PENDING") renderSummary(payload.data || []);
      setFeedback("");
      loaded = true;
      void loadTeacherReferralActivity();
    } catch (error) {
      setFeedback(error.message || "تعذر تحميل طلبات السحب.", true);
    }
  }

  async function reviewWithdrawal(button) {
    const id = button.dataset.withdrawalId;
    const decision = button.dataset.decision;
    let note = "";
    if (decision === "APPROVE") {
      if (!window.confirm("هل تحققت من التحويل إلى حساب BaridiMob وأرسلته فعليًا؟ سيتم تسجيل الطلب كمدفوع.")) return;
    } else {
      note = window.prompt("اكتب سبب رفض طلب السحب:", "");
      if (note === null) return;
      if (note.trim().length < 3) {
        setFeedback("اكتب سببًا واضحًا لرفض الطلب.", true);
        return;
      }
    }

    document.querySelectorAll("[data-withdrawal-id]").forEach((item) => { item.disabled = true; });
    try {
      const response = await teacherFetch(`/api/referrals/teacher/withdrawals/${encodeURIComponent(id)}/review`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ decision, note: note.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.status !== "success") throw new Error(payload.error || "تعذر تحديث طلب السحب.");
      setFeedback(payload.message || "تم تحديث الطلب.");
      await loadTeacherReferralWithdrawals();
    } catch (error) {
      setFeedback(error.message || "تعذر تحديث طلب السحب.", true);
      document.querySelectorAll("[data-withdrawal-id]").forEach((item) => { item.disabled = false; });
    }
  }

  tableBody.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-withdrawal-id]");
    if (button) void reviewWithdrawal(button);
  });
  statusSelect.addEventListener("change", () => void loadTeacherReferralWithdrawals());
  refreshButton?.addEventListener("click", () => void loadTeacherReferralWithdrawals());
  window.loadTeacherReferralWithdrawals = loadTeacherReferralWithdrawals;

  if (window.location.hash === "#referral-withdrawals-panel") void loadTeacherReferralWithdrawals();
})();
