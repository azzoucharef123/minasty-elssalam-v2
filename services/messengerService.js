"use strict";

const crypto = require("crypto");
const prisma = require("../lib/prisma");

const MESSENGER_REQUEST_TIMEOUT_MS = 8_000;
const MESSENGER_LINK_TTL_MS = 10 * 60 * 1000;
const MESSENGER_MAX_TEXT_LENGTH = 2_000;
const MESSENGER_STANDARD_WINDOW_MS = 24 * 60 * 60 * 1_000;
const LINK_REF_PREFIX = "minasaty_link:";

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

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
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
  const expiresAt = new Date(Date.now() + MESSENGER_LINK_TTL_MS);

  await prisma.messengerLink.upsert({
    where: { parentPhone: String(parentPhone) },
    update: {
      pageId: config.pageId,
      status: "PENDING",
      psid: null,
      linkedAt: null,
      linkStateHash: stateHash,
      linkStateExpiresAt: expiresAt,
    },
    create: {
      parentPhone: String(parentPhone),
      pageId: config.pageId,
      status: "PENDING",
      linkStateHash: stateHash,
      linkStateExpiresAt: expiresAt,
    },
  });

  return {
    link: buildMessengerLink(rawState),
    expiresAt,
    pageName: config.pageName,
    instructions: `افتح الرابط ثم اضغط «بدء الاستخدام» أو أرسل رسالة إلى صفحة «${config.pageName}». لا ترسل PIN حساب Minasaty إلى Messenger.`,
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
      const error = new Error(`MESSENGER_HTTP_${response.status}`);
      error.messengerCode = String(payload.error?.code || "");
      throw error;
    }
    return payload;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function sendMessengerMessage({ psid, text } = {}) {
  const recipient = String(psid || "").trim();
  const message = String(text || "").trim().slice(0, MESSENGER_MAX_TEXT_LENGTH);
  if (!recipient || !message) {
    return { sent: false, skipped: true, reason: "MESSENGER_RECIPIENT_OR_TEXT_MISSING" };
  }
  const payload = await messengerApi(`${getMessengerConfig().pageId}/messages`, {
    recipient: { id: recipient },
    message: { text: message },
  });
  return { sent: true, messageId: payload.message_id || null };
}

async function sendMessengerToParent(parentPhone, payload = {}) {
  const link = await prisma.messengerLink.findUnique({
    where: { parentPhone: String(parentPhone || "") },
    select: { psid: true, status: true, lastInteractionAt: true },
  });
  if (link?.status !== "LINKED" || !link.psid) {
    return { sent: false, skipped: true, reason: "MESSENGER_PARENT_NOT_LINKED" };
  }
  const lastInteractionAt = link.lastInteractionAt?.getTime?.() || 0;
  if (!lastInteractionAt || Date.now() - lastInteractionAt > MESSENGER_STANDARD_WINDOW_MS) {
    return { sent: false, skipped: true, reason: "MESSENGER_WINDOW_EXPIRED" };
  }
  return sendMessengerMessage({ psid: link.psid, ...payload });
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
      const linkResult = rawState
        ? await markLinkFromEvent({ pageId: entryPageId, psid: senderPsid, rawState })
        : { linked: false };
      if (!linkResult.linked) {
        await updateLinkedInteraction(entryPageId, senderPsid);
      }
      if (linkResult.linked) {
        await sendMessengerMessage({
          psid: senderPsid,
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
  verifyWebhookToken,
  verifyWebhookSignature,
  createMessengerLink,
  sendMessengerMessage,
  sendMessengerToParent,
  handleMessengerWebhook,
};
