"use strict";

const TELEGRAM_REQUEST_TIMEOUT_MS = 8_000;
const TELEGRAM_MAX_TEXT_LENGTH = 4_000;

function getTelegramConfig() {
  const botToken = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = String(process.env.TELEGRAM_ADMIN_CHAT_ID || "").trim();
  return {
    botToken,
    chatId,
    configured: Boolean(botToken && chatId),
    missing: [!botToken && "TELEGRAM_BOT_TOKEN", !chatId && "TELEGRAM_ADMIN_CHAT_ID"].filter(Boolean),
  };
}

function getTelegramStatus() {
  const config = getTelegramConfig();
  return {
    configured: config.configured,
    missing: config.missing,
    message: config.configured
      ? "تنبيهات Telegram مهيأة."
      : "تنبيهات Telegram غير مفعّلة — بانتظار بيانات البوت والمحادثة.",
  };
}

function telegramText(title, body = "") {
  return [`[Minasaty] ${String(title || "تنبيه إداري").trim()}`, String(body || "").trim()]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, TELEGRAM_MAX_TEXT_LENGTH);
}

async function sendTelegramNotification({ title, body, text } = {}) {
  const config = getTelegramConfig();
  if (!config.configured) return { sent: false, configured: false, skipped: true, reason: "TELEGRAM_NOT_CONFIGURED" };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TELEGRAM_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: String(text || telegramText(title, body)).slice(0, TELEGRAM_MAX_TEXT_LENGTH),
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok !== true) {
      const error = new Error(`TELEGRAM_HTTP_${response.status}`);
      error.telegramDescription = String(payload.description || "").slice(0, 500);
      throw error;
    }
    return { sent: true, configured: true, messageId: payload.result?.message_id || null };
  } finally {
    clearTimeout(timeoutId);
  }
}

function notifyTelegram(req, payload) {
  const sender = req?.app?.get("sendTelegramNotification");
  if (typeof sender !== "function") return Promise.resolve({ sent: false, configured: false, skipped: true, reason: "TELEGRAM_SENDER_UNAVAILABLE" });
  return Promise.resolve(sender(payload)).catch((error) => {
    console.warn("Optional Telegram notification failed:", error.message);
    return { sent: false, configured: true, skipped: true, reason: "TELEGRAM_SEND_FAILED" };
  });
}

module.exports = {
  getTelegramConfig,
  getTelegramStatus,
  sendTelegramNotification,
  notifyTelegram,
};
