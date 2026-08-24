const prisma = require("../lib/prisma");
const { ensureReferralProfile, buildReferralLink } = require("../utils/referral");

const MIN_WITHDRAWAL_DZD = 1000;

function isTeacher(req) {
  return req.user?.role === "teacher";
}

function normalizeArabicDigits(value) {
  const digits = { "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9", "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9" };
  return String(value || "").replace(/[٠-٩۰-۹]/g, (digit) => digits[digit] || digit).replace(/\D/g, "");
}

function normalizeBaridiMobName(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 120) : "";
}

async function getParentReferralSummary(req, res) {
  if (req.user?.role !== "parent" || !req.user.phone) {
    return res.status(403).json({ error: "هذه البيانات متاحة للولي فقط." });
  }

  try {
    const parentPhone = String(req.user.phone);
    const profile = await ensureReferralProfile(prisma, parentPhone, null);
    const [registeredCount, commissionSummary] = await Promise.all([
      prisma.referralProfile.count({ where: { referredByPhone: parentPhone } }),
      prisma.referralCommission.aggregate({
        where: { referrerPhone: parentPhone },
        _count: { _all: true },
        _sum: { amountDzd: true },
      }),
    ]);

    return res.json({
      status: "success",
      data: {
        referralCode: profile.referralCode,
        referralLink: buildReferralLink(req, profile.referralCode),
        totalEarnings: commissionSummary._sum.amountDzd || 0,
        registeredCount,
        upgradedCount: commissionSummary._count._all || 0,
      },
    });
  } catch (error) {
    console.error("Parent referral summary failed:", error);
    return res.status(500).json({ error: "تعذر تحميل بيانات الإحالة حاليًا." });
  }
}

async function getParentBaridiMob(req, res) {
  if (req.user?.role !== "parent" || !req.user.phone) {
    return res.status(403).json({ error: "هذه البيانات متاحة للولي فقط." });
  }

  try {
    const credential = await prisma.parentCredential.findUnique({
      where: { parentPhone: String(req.user.phone) },
      select: { baridiMobAccount: true, baridiMobName: true },
    });
    return res.json({
      status: "success",
      data: {
        baridiMobAccount: credential?.baridiMobAccount || "",
        baridiMobName: credential?.baridiMobName || "",
      },
    });
  } catch (error) {
    console.error("BaridiMob details lookup failed:", error);
    return res.status(500).json({ error: "تعذر تحميل معلومات BaridiMob حاليًا." });
  }
}

async function updateParentBaridiMob(req, res) {
  if (req.user?.role !== "parent" || !req.user.phone) {
    return res.status(403).json({ error: "هذه العملية متاحة للولي فقط." });
  }

  const baridiMobAccount = normalizeArabicDigits(req.body?.baridiMobAccount);
  const baridiMobName = normalizeBaridiMobName(req.body?.baridiMobName);
  if (!/^\d{10,30}$/.test(baridiMobAccount)) {
    return res.status(400).json({ error: "رقم حساب BaridiMob يجب أن يتكون من 10 إلى 30 رقمًا." });
  }
  if (baridiMobName.length < 3) {
    return res.status(400).json({ error: "أدخل الاسم واللقب كما يظهران في حساب BaridiMob." });
  }

  try {
    await prisma.parentCredential.update({
      where: { parentPhone: String(req.user.phone) },
      data: { baridiMobAccount, baridiMobName },
    });
    return res.json({ status: "success", message: "تم حفظ معلومات BaridiMob بنجاح." });
  } catch (error) {
    console.error("BaridiMob details update failed:", error);
    return res.status(500).json({ error: "تعذر حفظ معلومات BaridiMob حاليًا." });
  }
}

async function getParentReferralBalance(req, res) {
  if (req.user?.role !== "parent" || !req.user.phone) {
    return res.status(403).json({ error: "هذه البيانات متاحة للولي فقط." });
  }

  try {
    const parentPhone = String(req.user.phone);
    const [pending, latestWithdrawals] = await Promise.all([
      prisma.referralCommission.findMany({
        where: { referrerPhone: parentPhone, status: "PENDING" },
        select: { amountDzd: true },
      }),
      prisma.referralWithdrawal.findMany({
        where: { referrerPhone: parentPhone },
        orderBy: { requestedAt: "desc" },
        take: 10,
        select: { id: true, amountDzd: true, status: true, requestedAt: true, reviewedAt: true, paidAt: true, reviewNote: true, baridiMobAccount: true, baridiMobName: true },
      }),
    ]);
    const availableBalance = pending.reduce((total, commission) => total + Number(commission.amountDzd || 0), 0);
    return res.json({
      status: "success",
      data: { availableBalance, minimumWithdrawal: MIN_WITHDRAWAL_DZD, withdrawals: latestWithdrawals },
    });
  } catch (error) {
    console.error("Parent referral balance failed:", error);
    return res.status(500).json({ error: "تعذر تحميل رصيد الإحالة حاليًا." });
  }
}

async function requestParentReferralWithdrawal(req, res) {
  if (req.user?.role !== "parent" || !req.user.phone) {
    return res.status(403).json({ error: "هذه العملية متاحة للولي فقط." });
  }

  try {
    const parentPhone = String(req.user.phone);
    const credential = await prisma.parentCredential.findUnique({
      where: { parentPhone },
      select: { baridiMobAccount: true, baridiMobName: true },
    });
    if (!credential?.baridiMobAccount || !credential?.baridiMobName) {
      return res.status(400).json({ code: "BARIDIMOB_REQUIRED", error: "أضف معلومات حساب BaridiMob قبل طلب السحب." });
    }

    const withdrawal = await prisma.$transaction(async (tx) => {
      const commissions = await tx.referralCommission.findMany({
        where: { referrerPhone: parentPhone, status: "PENDING" },
        select: { id: true, amountDzd: true },
      });
      const amountDzd = commissions.reduce((total, commission) => total + Number(commission.amountDzd || 0), 0);
      if (amountDzd < MIN_WITHDRAWAL_DZD) {
        const error = new Error("MINIMUM_WITHDRAWAL_NOT_REACHED");
        error.code = "MINIMUM_WITHDRAWAL_NOT_REACHED";
        error.availableBalance = amountDzd;
        throw error;
      }

      const created = await tx.referralWithdrawal.create({
        data: {
          referrerPhone: parentPhone,
          amountDzd,
          baridiMobAccount: credential.baridiMobAccount,
          baridiMobName: credential.baridiMobName,
          status: "PENDING",
        },
      });
      const locked = await tx.referralCommission.updateMany({
        where: { id: { in: commissions.map((commission) => commission.id) }, status: "PENDING" },
        data: { status: "WITHDRAWAL_PENDING", withdrawalId: created.id },
      });
      if (locked.count !== commissions.length) {
        throw new Error("WITHDRAWAL_CONCURRENCY_CONFLICT");
      }
      return created;
    });

    return res.status(201).json({
      status: "success",
      message: "تم إرسال طلب السحب. سيُراجع الأستاذ الطلب قبل تنفيذ التحويل.",
      data: { id: withdrawal.id, amountDzd: withdrawal.amountDzd, status: withdrawal.status, requestedAt: withdrawal.requestedAt },
    });
  } catch (error) {
    if (error?.code === "MINIMUM_WITHDRAWAL_NOT_REACHED") {
      return res.status(400).json({ error: `الحد الأدنى للسحب هو ${MIN_WITHDRAWAL_DZD} دج. رصيدك المتاح حاليًا ${error.availableBalance || 0} دج.` });
    }
    console.error("Parent referral withdrawal request failed:", error);
    return res.status(500).json({ error: "تعذر إنشاء طلب السحب حاليًا." });
  }
}

async function getTeacherReferralWithdrawals(req, res) {
  if (!isTeacher(req)) return res.status(403).json({ error: "هذه البيانات متاحة للأستاذ فقط." });
  const status = String(req.query.status || "ALL").trim().toUpperCase();
  const validStatuses = new Set(["ALL", "PENDING", "PAID", "REJECTED"]);
  if (!validStatuses.has(status)) return res.status(400).json({ error: "حالة طلب السحب غير صالحة." });

  try {
    const withdrawals = await prisma.referralWithdrawal.findMany({
      where: status === "ALL" ? undefined : { status },
      orderBy: { requestedAt: "desc" },
      take: 200,
      select: {
        id: true,
        referrerPhone: true,
        amountDzd: true,
        baridiMobAccount: true,
        baridiMobName: true,
        status: true,
        requestedAt: true,
        reviewedAt: true,
        paidAt: true,
        reviewNote: true,
        _count: { select: { commissions: true } },
      },
    });
    return res.json({ status: "success", data: withdrawals.map((item) => ({ ...item, commissionCount: item._count.commissions })) });
  } catch (error) {
    console.error("Teacher referral withdrawals lookup failed:", error);
    return res.status(500).json({ error: "تعذر تحميل طلبات السحب حاليًا." });
  }
}

async function reviewTeacherReferralWithdrawal(req, res) {
  if (!isTeacher(req)) return res.status(403).json({ error: "هذه العملية متاحة للأستاذ فقط." });
  const decision = String(req.body?.decision || "").trim().toUpperCase();
  const reviewNote = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 500) : "";
  if (!["APPROVE", "REJECT"].includes(decision)) return res.status(400).json({ error: "اختر قبول أو رفض الطلب." });
  if (decision === "REJECT" && reviewNote.length < 3) return res.status(400).json({ error: "اكتب سبب رفض الطلب." });

  try {
    const withdrawal = await prisma.$transaction(async (tx) => {
      const current = await tx.referralWithdrawal.findUnique({ where: { id: req.params.id }, select: { id: true, status: true } });
      if (!current) {
        const error = new Error("WITHDRAWAL_NOT_FOUND");
        error.code = "WITHDRAWAL_NOT_FOUND";
        throw error;
      }
      if (current.status !== "PENDING") {
        const error = new Error("WITHDRAWAL_ALREADY_REVIEWED");
        error.code = "WITHDRAWAL_ALREADY_REVIEWED";
        throw error;
      }

      const now = new Date();
      const nextStatus = decision === "APPROVE" ? "PAID" : "REJECTED";
      const updated = await tx.referralWithdrawal.update({
        where: { id: current.id },
        data: { status: nextStatus, reviewedAt: now, paidAt: decision === "APPROVE" ? now : null, reviewNote: reviewNote || (decision === "APPROVE" ? "تم قبول الطلب وتأكيد التحويل من طرف الأستاذ." : null) },
      });
      await tx.referralCommission.updateMany({
        where: { withdrawalId: current.id, status: "WITHDRAWAL_PENDING" },
        data: decision === "APPROVE" ? { status: "PAID" } : { status: "PENDING", withdrawalId: null },
      });
      return updated;
    });

    return res.json({ status: "success", message: decision === "APPROVE" ? "تم قبول الطلب وتسجيله كمدفوع." : "تم رفض الطلب وإعادة الرصيد إلى الرصيد المتاح.", data: withdrawal });
  } catch (error) {
    if (error?.code === "WITHDRAWAL_NOT_FOUND") return res.status(404).json({ error: "طلب السحب غير موجود." });
    if (error?.code === "WITHDRAWAL_ALREADY_REVIEWED") return res.status(409).json({ error: "تمت مراجعة طلب السحب هذا مسبقًا." });
    console.error("Teacher referral withdrawal review failed:", error);
    return res.status(500).json({ error: "تعذر تحديث طلب السحب حاليًا." });
  }
}

module.exports = { getParentReferralSummary, getParentBaridiMob, updateParentBaridiMob, getParentReferralBalance, requestParentReferralWithdrawal, getTeacherReferralWithdrawals, reviewTeacherReferralWithdrawal };
