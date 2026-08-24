const crypto = require("crypto");

const REFERRAL_CODE_LENGTH = 8;
const REFERRAL_CODE_ATTEMPTS = 8;

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
  const host = String(req?.get?.("host") || "dr.africacold.fr").trim();
  return `${protocol}://${host}`.replace(/\/$/, "");
}

function buildReferralLink(req, referralCode) {
  return `${getPublicSiteUrl(req)}/register.html?ref=${encodeURIComponent(referralCode)}`;
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
  buildReferralLink,
};
