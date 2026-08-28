"use strict";

const crypto = require("crypto");
const prisma = require("../lib/prisma");

const MESSENGER_REQUEST_TIMEOUT_MS = 8_000;
const MESSENGER_LINK_TTL_MS = 10 * 60 * 1000;
const MESSENGER_FALLBACK_CODE_TTL_MS = 10 * 60 * 1000;
const MESSENGER_MAX_TEXT_LENGTH = 2_000;
const MESSENGER_STANDARD_WINDOW_MS = 24 * 60 * 60 * 1_000;
const LINK_REF_PREFIX = "minasaty_link:";
const DEFAULT_MESSENGER_SETTINGS = Object.freeze({
  enabled: true,
  dailyWarningLimit: 800,
  dailyHardLimit: 1_000,
  minIntervalMs: 1_000,
  maxRetries: 3,
  appendConfirmationRequest: true,
  requireRecentInteractionHours: 24,
  pauseOnRateLimit: true,
});
let messengerSettingsCache = null;
let messengerSettingsCacheAt = 0;
let lastMessengerSendAt = 0;

function getMessengerConfig() {
  const pageId = String(process.env.META_PAGE_ID || "").trim();
  const pageAccessToken = String(process.env.META_PAGE_ACCESS_TOKEN || "").trim();
  const appSecret = String(process.env.META_APP_SECRET || "").trim();
  const verifyToken = String(process.env.META_WEBHOOK_VERIFY_TOKEN || "").trim();
  const graphApiVersion = String(process.env.META_GRAPH_API_VERSION || "v26.0").trim();
  const pageName = String(process.env.META_MESSENGER_PAGE_NAME || "أستاذ الفيزياء و الرياضيات").trim();
  const pageHandle = String(process.env.META_PAGE_MME_NAME || pageId).trim();

  return {
    pageId,
    pageAccessToken,
    appSecret,
    verifyToken,
    graphApiVersion,
    pageName,
    pageHandle,
    configured: Boolean(pageId && pageAccessToken && appSecret && verifyToken),
    missing: [
      !pageId && "META_PAGE_ID",
      !pageAccessToken && "META_PAGE_ACCESS_TOKEN",
      !appSecret && "META_APP_SECRET",
      !verifyToken && "META_WEBHOOK_VERIFY_TOKEN",
    ].filter(Boolean),
  };
}

function getMessengerStatus() {
  const config = getMessengerConfig();
  return {
    configured: config.configured,
    pageName: config.pageName,
    standardWindowHours: 24,
    message: config.configured
      ? `Messenger مهيأ لصفحة «${config.pageName}».`
      : "Messenger غير مهيأ حاليًا — بانتظار إعداد بيانات Meta على الخادم.",
  };
}

function normalizeMessengerSettings(record = {}) {
  const dailyHardLimit = Math.min(100_000, Math.max(1, Number(record.dailyHardLimit) || DEFAULT_MESSENGER_SETTINGS.dailyHardLimit));
  return {
    enabled: record.enabled !== false,
    dailyWarningLimit: Math.min(dailyHardLimit, Math.max(1, Number(record.dailyWarningLimit) || DEFAULT_MESSENGER_SETTINGS.dailyWarningLimit)),
    dailyHardLimit,
    minIntervalMs: Math.min(60_000, Math.max(250, Number(record.minIntervalMs) || DEFAULT_MESSENGER_SETTINGS.minIntervalMs)),
    maxRetries: Math.min(5, Math.max(0, Number.isInteger(record.maxRetries) ? record.maxRetries : DEFAULT_MESSENGER_SETTINGS.maxRetries)),
    appendConfirmationRequest: record.appendConfirmationRequest !== false,
    requireRecentInteractionHours: Math.min(24, Math.max(1, Number(record.requireRecentInteractionHours) || DEFAULT_MESSENGER_SETTINGS.requireRecentInteractionHours)),
    pauseOnRateLimit: record.pauseOnRateLimit !== false,
  };
}

async function getMessengerSettings() {
  const now = Date.now();
  if (messengerSettingsCache && now - messengerSettingsCacheAt < 5_000) return messengerSettingsCache;
  try {
    const record = await prisma.messengerSettings.findUnique({ where: { id: 1 } });
    messengerSettingsCache = normalizeMessengerSettings(record || DEFAULT_MESSENGER_SETTINGS);
  } catch (error) {
    if (error?.code !== "P2021") throw error;
    messengerSettingsCache = normalizeMessengerSettings(DEFAULT_MESSENGER_SETTINGS);
  }
  messengerSettingsCacheAt = now;
  return messengerSettingsCache;
}

function invalidateMessengerSettingsCache() {
  messengerSettingsCache = null;
  messengerSettingsCacheAt = 0;
}

async function saveMessengerSettings(input = {}) {
  const settings = normalizeMessengerSettings(input);
  try {
    const saved = await prisma.messengerSettings.upsert({
      where: { id: 1 },
      create: { id: 1, ...settings },
      update: settings,
    });
    invalidateMessengerSettingsCache();
    return normalizeMessengerSettings(saved);
  } catch (error) {
    if (error?.code === "P2021") return settings;
    throw error;
  }
}

async function getMessengerQuotaStatus() {
  const config = getMessengerConfig();
  const settings = await getMessengerSettings();
  const quotaDate = utcDayStart();
  let quota = null;
  try {
    quota = await prisma.messengerQuota.findUnique({
      where: { pageId_quotaDate: { pageId: config.pageId, quotaDate } },
      select: { attemptedCount: true, sentCount: true, failedCount: true, skippedCount: true, paused: true, pauseReason: true },
    });
  } catch (error) {
    if (error?.code !== "P2021") throw error;
  }
  const attemptedCount = Number(quota?.attemptedCount || 0);
  return {
    ...settings,
    quotaDate: quotaDate.toISOString().slice(0, 10),
    attemptedCount,
    sentCount: Number(quota?.sentCount || 0),
    failedCount: Number(quota?.failedCount || 0),
    skippedCount: Number(quota?.skippedCount || 0),
    remainingCount: Math.max(0, settings.dailyHardLimit - attemptedCount),
    warningReached: attemptedCount >= settings.dailyWarningLimit,
    paused: Boolean(quota?.paused),
    pauseReason: quota?.pauseReason || null,
  };
}

async function waitForMessengerRate(settings) {
  const waitMs = Math.max(0, lastMessengerSendAt + settings.minIntervalMs - Date.now());
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  lastMessengerSendAt = Date.now();
}

function utcDayStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

async function reserveMessengerQuota(settings) {
  const config = getMessengerConfig();
  const quotaDate = utcDayStart();
  try {
    await prisma.messengerQuota.upsert({
      where: { pageId_quotaDate: { pageId: config.pageId, quotaDate } },
      create: { pageId: config.pageId, quotaDate },
      update: {},
    });
    const result = await prisma.messengerQuota.updateMany({
      where: { pageId: config.pageId, quotaDate, paused: false, attemptedCount: { lt: settings.dailyHardLimit } },
      data: { attemptedCount: { increment: 1 } },
    });
    return { reserved: result.count > 0, quotaDate };
  } catch (error) {
    if (error?.code === "P2021") return { reserved: true, quotaDate };
    throw error;
  }
}

async function recordMessengerQuotaResult(quotaDate, field, settings, reason = null) {
  const config = getMessengerConfig();
  const data = { [field]: { increment: 1 } };
  const rateLimited = typeof reason === "object"
    ? Boolean(reason.rateLimited)
    : /RATE_LIMIT|HTTP_429|HTTP_613/.test(String(reason || ""));
  if (field === "failedCount" && settings.pauseOnRateLimit && rateLimited) {
    data.paused = true;
    data.pauseReason = (typeof reason === "object" ? reason.publicReason : String(reason || "RATE_LIMIT")).slice(0, 160);
  }
  try {
    await prisma.messengerQuota.update({ where: { pageId_quotaDate: { pageId: config.pageId, quotaDate } }, data });
  } catch (error) {
    if (error?.code !== "P2021" && error?.code !== "P2025") throw error;
  }
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function createFallbackCode() {
  return String(crypto.randomInt(10_000_000, 100_000_000));
}

function normalizeFallbackCode(value) {
  const text = String(value || "");
  const match = text.match(/(?:^|\s)(?:تم|تمام|done)\s*[:\-]?\s*(\d{8})(?:\s|$)/iu);
  return match?.[1] || "";
}

function safeEqualText(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  return leftBuffer.length > 0
    && leftBuffer.length === rightBuffer.length
    && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyWebhookToken(value) {
  const expected = getMessengerConfig().verifyToken;
  return Boolean(expected) && safeEqualText(value, expected);
}

function verifyWebhookSignature(rawBody, signature) {
  const appSecret = getMessengerConfig().appSecret;
  if (!appSecret || !Buffer.isBuffer(rawBody)) return false;
  const supplied = String(signature || "").trim();
  if (!/^sha256=[0-9a-f]{64}$/i.test(supplied)) return false;
  const expected = `sha256=${crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  return safeEqualText(supplied.toLowerCase(), expected);
}

function normalizeRef(value) {
  const ref = typeof value === "string" ? value.trim() : "";
  if (!ref.startsWith(LINK_REF_PREFIX)) return "";
  const rawState = ref.slice(LINK_REF_PREFIX.length);
  return /^[A-Za-z0-9_-]{32}$/.test(rawState) ? rawState : "";
}

function getEventType(event = {}) {
  if (event.message) return "message";
  if (event.postback) return "postback";
  if (event.referral) return "referral";
  if (event.account_linking) return "account_linking";
  if (event.optin) return "optin";
  return "unknown";
}

function getEventKey(entryId, event = {}) {
  const explicitId = String(event.message?.mid || event.delivery?.mids?.[0] || "").trim();
  if (explicitId) return `message:${explicitId}`;
  const eventType = getEventType(event);
  const senderId = String(event.sender?.id || "").trim();
  const timestamp = String(event.timestamp || "").trim();
  const payload = String(event.postback?.payload || event.account_linking?.status || "").trim();
  const ref = String(event.postback?.referral?.ref || event.referral?.ref || "").trim();
  return sha256(`${entryId}|${eventType}|${senderId}|${timestamp}|${payload}|${ref}`);
}

function extractReferralState(event = {}) {
  return normalizeRef(event.postback?.referral?.ref)
    || normalizeRef(event.referral?.ref)
    || normalizeRef(event.postback?.ref);
}

function buildMessengerLink(rawState) {
  const { pageHandle } = getMessengerConfig();
  return `https://m.me/${encodeURIComponent(pageHandle)}?ref=${encodeURIComponent(`${LINK_REF_PREFIX}${rawState}`)}`;
}

async function createMessengerLink(parentPhone) {
  const config = getMessengerConfig();
  if (!config.pageId || !config.pageHandle) {
    throw new Error("MESSENGER_PAGE_NOT_CONFIGURED");
  }

  const rawState = crypto.randomBytes(24).toString("base64url");
  const stateHash = sha256(rawState);
  const fallbackCode = createFallbackCode();
  const fallbackCodeHash = sha256(fallbackCode);
  const expiresAt = new Date(Date.now() + MESSENGER_LINK_TTL_MS);
  const fallbackCodeExpiresAt = new Date(Date.now() + MESSENGER_FALLBACK_CODE_TTL_MS);

  await prisma.messengerLink.upsert({
    where: { parentPhone: String(parentPhone) },
    update: {
      pageId: config.pageId,
      status: "PENDING",
      psid: null,
      linkedAt: null,
      linkStateHash: stateHash,
      linkStateExpiresAt: expiresAt,
      fallbackCodeHash,
      fallbackCodeExpiresAt,
    },
    create: {
      parentPhone: String(parentPhone),
      pageId: config.pageId,
      status: "PENDING",
      linkStateHash: stateHash,
      linkStateExpiresAt: expiresAt,
      fallbackCodeHash,
      fallbackCodeExpiresAt,
    },
  });

  const url = buildMessengerLink(rawState);
  return {
    url,
    // Keep the legacy key for already-open parent pages during deployment.
    link: url,
    expiresAt,
    fallbackCode,
    fallbackCodeExpiresAt,
    pageName: config.pageName,
    instructions: `افتح الرابط ثم اضغط «بدء الاستخدام» أو أرسل رسالة إلى صفحة «${config.pageName}». إذا لم يكتمل الربط تلقائيًا، أرسل «تم ${fallbackCode}» إلى الصفحة. لا ترسل PIN حساب Minasaty إلى Messenger.`,
  };
}

async function markLinkFromEvent({ pageId, psid, rawState }) {
  if (!pageId || !psid || !rawState) return { linked: false, reason: "LINK_STATE_MISSING" };
  const stateHash = sha256(rawState);
  const now = new Date();
  const pending = await prisma.messengerLink.findFirst({
    where: {
      pageId,
      linkStateHash: stateHash,
      linkStateExpiresAt: { gt: now },
      status: "PENDING",
    },
    select: { id: true, parentPhone: true },
  });
  if (!pending) return { linked: false, reason: "LINK_STATE_INVALID_OR_EXPIRED" };

  try {
    await prisma.messengerLink.update({
      where: { id: pending.id },
      data: {
        psid,
        status: "LINKED",
        linkedAt: now,
        lastInteractionAt: now,
        linkStateHash: null,
        linkStateExpiresAt: null,
      },
    });
    return { linked: true, parentPhone: pending.parentPhone };
  } catch (error) {
    if (error?.code === "P2002") {
      return { linked: false, reason: "MESSENGER_PSId_ALREADY_LINKED" };
    }
    throw error;
  }
}

async function markLinkFromFallbackCode({ pageId, psid, code }) {
  if (!pageId || !psid || !code) return { linked: false, reason: "FALLBACK_CODE_MISSING" };
  const codeHash = sha256(code);
  const now = new Date();
  const pending = await prisma.messengerLink.findFirst({
    where: {
      pageId,
      fallbackCodeHash: codeHash,
      fallbackCodeExpiresAt: { gt: now },
      status: "PENDING",
    },
    select: { id: true, parentPhone: true },
  });
  if (!pending) return { linked: false, reason: "FALLBACK_CODE_INVALID_OR_EXPIRED" };

  try {
    await prisma.messengerLink.update({
      where: { id: pending.id },
      data: {
        psid,
        status: "LINKED",
        linkedAt: now,
        lastInteractionAt: now,
        linkStateHash: null,
        linkStateExpiresAt: null,
        fallbackCodeHash: null,
        fallbackCodeExpiresAt: null,
      },
    });
    return { linked: true, parentPhone: pending.parentPhone };
  } catch (error) {
    if (error?.code === "P2002") {
      return { linked: false, reason: "MESSENGER_PSID_ALREADY_LINKED" };
    }
    throw error;
  }
}

async function updateLinkedInteraction(pageId, psid) {
  if (!pageId || !psid) return;
  await prisma.messengerLink.updateMany({
    where: { pageId, psid, status: "LINKED" },
    data: { lastInteractionAt: new Date() },
  });
}

async function messengerApi(path, body = {}) {
  const config = getMessengerConfig();
  if (!config.pageAccessToken || !config.pageId) {
    return { sent: false, skipped: true, reason: "MESSENGER_NOT_CONFIGURED" };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MESSENGER_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`https://graph.facebook.com/${config.graphApiVersion}/${path}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...body, access_token: config.pageAccessToken }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.error) {
      const httpStatus = Number(response.status) || 0;
      const graphCode = Number(payload.error?.code) || 0;
      const graphSubcode = Number(payload.error?.error_subcode) || 0;
      const rateLimited = httpStatus === 429 || graphCode === 613;
      const retryable = rateLimited || httpStatus >= 500;
      const error = new Error(`MESSENGER_HTTP_${httpStatus}`);
      error.httpStatus = httpStatus;
      error.messengerCode = graphCode;
      error.messengerSubcode = graphSubcode;
      error.rateLimited = rateLimited;
      error.retryable = retryable;
      error.publicReason = rateLimited ? "MESSENGER_RATE_LIMIT" : `MESSENGER_HTTP_${httpStatus}`;
      throw error;
    }
    return payload;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function sendMessengerMessage({ psid, text, messagingType = "UPDATE" } = {}) {
  const recipient = String(psid || "").trim();
  const message = String(text || "").trim().slice(0, MESSENGER_MAX_TEXT_LENGTH);
  if (!recipient || !message) {
    return { sent: false, skipped: true, reason: "MESSENGER_RECIPIENT_OR_TEXT_MISSING" };
  }
  const payload = await messengerApi(`${getMessengerConfig().pageId}/messages`, {
    recipient: { id: recipient },
    messaging_type: messagingType === "RESPONSE" ? "RESPONSE" : "UPDATE",
    message: { text: message },
  });
  return { sent: true, messageId: payload.message_id || null };
}

async function sendMessengerToParent(parentPhone, payload = {}) {
  const settings = await getMessengerSettings();
  if (!settings.enabled) return { sent: false, skipped: true, reason: "MESSENGER_DISABLED" };
  const link = await prisma.messengerLink.findUnique({
    where: { parentPhone: String(parentPhone || "") },
    select: { psid: true, status: true, lastInteractionAt: true },
  });
  if (link?.status !== "LINKED" || !link.psid) {
    return { sent: false, skipped: true, reason: "MESSENGER_PARENT_NOT_LINKED" };
  }
  const lastInteractionAt = link.lastInteractionAt?.getTime?.() || 0;
  const windowMs = Math.min(MESSENGER_STANDARD_WINDOW_MS, settings.requireRecentInteractionHours * 60 * 60 * 1_000);
  if (!lastInteractionAt || Date.now() - lastInteractionAt > windowMs) {
    return { sent: false, skipped: true, reason: "MESSENGER_WINDOW_EXPIRED" };
  }
  const quota = await reserveMessengerQuota(settings);
  if (!quota.reserved) return { sent: false, skipped: true, reason: "MESSENGER_DAILY_LIMIT_REACHED" };
  const rawText = String(payload.text || "").trim();
  const text = settings.appendConfirmationRequest
    ? `${rawText}\n\nأرسل «تم» إذا تلقيت هذه الرسالة.`.trim()
    : rawText;
  let attempt = 0;
  while (true) {
    await waitForMessengerRate(settings);
    try {
      const result = await sendMessengerMessage({ psid: link.psid, messagingType: "UPDATE", ...payload, text });
      await recordMessengerQuotaResult(quota.quotaDate, result.sent ? "sentCount" : "skippedCount", settings, result.reason);
      return result;
    } catch (error) {
      if (error?.retryable && attempt < settings.maxRetries) {
        attempt += 1;
        const delayMs = Math.min(8_000, 500 * (2 ** (attempt - 1)) + Math.floor(Math.random() * 250));
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      await recordMessengerQuotaResult(quota.quotaDate, "failedCount", settings, error);
      throw error;
    }
  }
}

async function handleMessengerWebhook(body = {}) {
  const config = getMessengerConfig();
  if (body?.object !== "page" || !Array.isArray(body.entry)) {
    return { handled: false, reason: "NOT_PAGE_WEBHOOK" };
  }

  let processed = 0;
  for (const entry of body.entry) {
    const entryPageId = String(entry?.id || "").trim();
    if (!entryPageId || entryPageId !== config.pageId || !Array.isArray(entry.messaging)) continue;
    for (const event of entry.messaging) {
      const senderPsid = String(event?.sender?.id || "").trim();
      if (!senderPsid) continue;
      const eventType = getEventType(event);
      const eventKey = getEventKey(entryPageId, event);
      try {
        await prisma.messengerWebhookEvent.create({
          data: { eventKey, pageId: entryPageId, eventType },
        });
      } catch (error) {
        if (error?.code === "P2002") continue;
        throw error;
      }

      const rawState = extractReferralState(event);
      const fallbackCode = !rawState ? normalizeFallbackCode(event.message?.text) : "";
      const linkResult = rawState
        ? await markLinkFromEvent({ pageId: entryPageId, psid: senderPsid, rawState })
        : fallbackCode
          ? await markLinkFromFallbackCode({ pageId: entryPageId, psid: senderPsid, code: fallbackCode })
          : { linked: false };
      if (!linkResult.linked) {
        await updateLinkedInteraction(entryPageId, senderPsid);
      }
      if (linkResult.linked) {
        await sendMessengerMessage({
          psid: senderPsid,
          messagingType: "RESPONSE",
          text: "تم ربط Messenger بحساب Minasaty بنجاح. ستصلك هنا التنبيهات المسموح بها من المنصة.",
        }).catch((error) => console.warn("Messenger link confirmation failed:", error.message));
      }
      processed += 1;
    }
  }
  return { handled: true, processed };
}

module.exports = {
  getMessengerConfig,
  getMessengerStatus,
  getMessengerSettings,
  saveMessengerSettings,
  getMessengerQuotaStatus,
  normalizeMessengerSettings,
  invalidateMessengerSettingsCache,
  reserveMessengerQuota,
  utcDayStart,
  verifyWebhookToken,
  verifyWebhookSignature,
  createMessengerLink,
  sendMessengerMessage,
  sendMessengerToParent,
  handleMessengerWebhook,
};
