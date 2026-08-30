const crypto = require("crypto");

const REFERRAL_CODE_LENGTH = 8;
const REFERRAL_CODE_ATTEMPTS = 8;
const REFERRAL_COMMISSION_AMOUNTS = Object.freeze({ MATH: 100, PHYSICS: 100, BOTH: 250 });

function normalizeReferralCode(value) {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z0-9]{6,20}$/.test(code) ? code : "";
}

function createReferralCode() {
  return crypto.randomBytes(8).toString("hex").slice(0, REFERRAL_CODE_LENGTH).toUpperCase();
}

function getPublicSiteUrl(req) {
  const configured = String(process.env.APP_BASE_URL || process.env.PUBLIC_SITE_URL || "").trim();
  if (configured) return configured.replace(/\/$/, "");

  const forwardedProtocol = String(req?.get?.("x-forwarded-proto") || "").split(",")[0].trim();
  const protocol = forwardedProtocol || req?.protocol || "https";
  const host = String(req?.get?.("host") || "minasaty-app-2026.azurewebsites.net").trim();
  return `${protocol}://${host}`.replace(/\/$/, "");
}

function buildReferralLink(req, referralCode) {
  return `${getPublicSiteUrl(req)}/index.html?ref=${encodeURIComponent(referralCode)}`;
}

async function generateUniqueReferralCode(tx) {
  for (let attempt = 0; attempt < REFERRAL_CODE_ATTEMPTS; attempt += 1) {
    const code = createReferralCode();
    const existing = await tx.referralProfile.findUnique({
      where: { referralCode: code },
      select: { id: true },
    });
    if (!existing) return code;
  }
  throw new Error("Unable to generate a unique referral code.");
}

function normalizeReferralLevel(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

async function awardReferralCommission(tx, { referredParentPhone, subscriptionType, level }) {
  const parentPhone = String(referredParentPhone || "").trim();
  const referralLevel = normalizeReferralLevel(level);
  const upgradeType = String(subscriptionType || "").trim().toUpperCase();
  const amountDzd = REFERRAL_COMMISSION_AMOUNTS[upgradeType];
  // A level is required so a later upgrade at another level can earn its own
  // commission while retries at the same level remain idempotent.
  if (!parentPhone || !referralLevel || !amountDzd) return null;

  const referredProfile = await tx.referralProfile.findUnique({
    where: { parentPhone },
    select: { referredByPhone: true },
  });
  const referrerPhone = String(referredProfile?.referredByPhone || "").trim();
  if (!referrerPhone || referrerPhone === parentPhone) return null;

  await tx.referralCommission.createMany({
    data: {
      referrerPhone,
      referredParentPhone: parentPhone,
      level: referralLevel,
      upgradeType,
      amountDzd,
      status: "PENDING",
    },
    skipDuplicates: true,
  });

  // The composite unique constraint makes retries and concurrent
  // webhook/manual approvals idempotent per referred phone and level.
  return tx.referralCommission.findUnique({
    where: { referredParentPhone_level: { referredParentPhone: parentPhone, level: referralLevel } },
  });
}

async function ensureReferralProfile(tx, parentPhone, referredByCode) {
  const existing = await tx.referralProfile.findUnique({
    where: { parentPhone },
    select: { id: true, referralCode: true, referredByPhone: true },
  });
  if (existing) return existing;

  let referredByPhone = null;
  const normalizedCode = normalizeReferralCode(referredByCode);
  if (normalizedCode) {
    const referrer = await tx.referralProfile.findUnique({
      where: { referralCode: normalizedCode },
      select: { parentPhone: true },
    });
    if (referrer && referrer.parentPhone !== parentPhone) {
      referredByPhone = referrer.parentPhone;
    }
  }

  return tx.referralProfile.create({
    data: {
      parentPhone,
      referralCode: await generateUniqueReferralCode(tx),
      referredByPhone,
    },
  });
}

module.exports = {
  normalizeReferralCode,
  generateUniqueReferralCode,
  ensureReferralProfile,
  awardReferralCommission,
  normalizeReferralLevel,
  buildReferralLink,
};
