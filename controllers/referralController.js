const prisma = require("../lib/prisma");
const { ensureReferralProfile, buildReferralLink } = require("../utils/referral");

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

module.exports = { getParentReferralSummary, getParentBaridiMob, updateParentBaridiMob };
