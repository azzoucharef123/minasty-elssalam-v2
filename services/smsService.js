"use strict";

const { normalizeParentPhone } = require("../utils/phone");

const SMS_MAX_MESSAGE_LENGTH = 1_000;
const SMS_REQUEST_TIMEOUT_MS = 8_000;

function env(name) {
  return String(process.env[name] || "").trim();
}

function getSmsConfig() {
  const apiUrl = env("SMS_API_URL");
  const apiKey = env("SMS_API_KEY");
  const senderId = env("SMS_SENDER_ID");
  const provider = env("SMS_PROVIDER") || "غير محدد";
  const missing = [
    !apiUrl && "SMS_API_URL",
    !apiKey && "SMS_API_KEY",
    !senderId && "SMS_SENDER_ID",
  ].filter(Boolean);

  return {
    provider,
    apiUrl,
    apiKey,
    senderId,
    missing,
    configured: missing.length === 0,
  };
}

function getSmsStatus() {
  const config = getSmsConfig();
  return {
    configured: config.configured,
    provider: config.provider,
    missing: config.missing,
    message: config.configured
      ? "خدمة SMS مهيأة ويمكن تفعيلها بعد تأكيد إعدادات المزود."
      : "خدمة SMS غير مفعّلة حاليًا — بانتظار بيانات مزود الرسائل.",
  };
}

function smsMessageText(title, body) {
  return [String(title || "").trim(), String(body || "").trim()]
    .filter(Boolean)
    .join("\n")
    .slice(0, SMS_MAX_MESSAGE_LENGTH);
}

async function sendSms({ to, title = "", body = "", message = "" } = {}) {
  const config = getSmsConfig();
  if (!config.configured) {
    return { sent: false, configured: false, skipped: true, reason: "SMS_NOT_CONFIGURED" };
  }

  const phone = normalizeParentPhone(to);
  if (!phone) {
    return { sent: false, configured: true, skipped: true, reason: "INVALID_PHONE" };
  }

  const text = String(message || smsMessageText(title, body)).trim().slice(0, SMS_MAX_MESSAGE_LENGTH);
  if (!text) {
    return { sent: false, configured: true, skipped: true, reason: "EMPTY_MESSAGE" };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SMS_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(config.apiUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        to: phone,
        message: text,
        senderId: config.senderId,
      }),
      signal: controller.signal,
    });
    const responseText = await response.text();
    if (!response.ok) {
      const error = new Error(`SMS_PROVIDER_HTTP_${response.status}`);
      error.providerResponse = responseText.slice(0, 500);
      throw error;
    }
    return { sent: true, configured: true, phone };
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = {
  SMS_MAX_MESSAGE_LENGTH,
  getSmsConfig,
  getSmsStatus,
  sendSms,
};
