"use strict";

const express = require("express");
const prisma = require("../lib/prisma");
const { createTeacherMessengerCampaign } = require("../controllers/academicController");
const { verifyToken, isTeacher } = require("../middleware/authMiddleware");
const {
  createMessengerLink,
  getMessengerConfig,
  getMessengerStatus,
  getMessengerSettings,
  saveMessengerSettings,
  getMessengerQuotaStatus,
  handleMessengerWebhook,
  verifyWebhookSignature,
  verifyWebhookToken,
} = require("../services/messengerService");

const router = express.Router();

function requireParent(req, res, next) {
  if (req.user?.role !== "parent" || !req.user.phone) {
    return res.status(403).json({ error: "هذه العملية متاحة لحساب الولي فقط." });
  }
  return next();
}

function requireTeacher(req, res, next) {
  if (req.user?.role !== "teacher") {
    return res.status(403).json({ error: "هذه العملية متاحة لحساب الأستاذ فقط." });
  }
  return next();
}

router.get("/teacher/settings", verifyToken, isTeacher, requireTeacher, async (req, res) => {
  const service = getMessengerStatus();
  const settings = await getMessengerSettings();
  const quota = await getMessengerQuotaStatus();
  return res.json({ status: "success", data: { ...service, settings, quota } });
});

router.put("/teacher/settings", verifyToken, isTeacher, requireTeacher, async (req, res) => {
  const input = req.body && typeof req.body === "object" ? req.body : {};
  const settings = await saveMessengerSettings({
    enabled: input.enabled,
    dailyWarningLimit: input.dailyWarningLimit,
    dailyHardLimit: input.dailyHardLimit,
    minIntervalMs: input.minIntervalMs,
    maxRetries: input.maxRetries,
    appendConfirmationRequest: input.appendConfirmationRequest,
    requireRecentInteractionHours: input.requireRecentInteractionHours,
    pauseOnRateLimit: input.pauseOnRateLimit,
  });
  return res.json({ status: "success", data: settings, message: "تم حفظ إعدادات Messenger الآمنة." });
});

router.post("/teacher/campaigns", verifyToken, isTeacher, requireTeacher, createTeacherMessengerCampaign);

router.get("/status", verifyToken, requireParent, async (req, res) => {
  const link = await prisma.messengerLink.findUnique({
    where: { parentPhone: req.user.phone },
    select: { status: true, linkedAt: true, lastInteractionAt: true, pageId: true },
  });
  const service = getMessengerStatus();
  const linked = link?.status === "LINKED";
  return res.json({
    configured: service.configured,
    pageName: service.pageName,
    linked,
    status: link?.status || "UNLINKED",
    linkedAt: linked ? link.linkedAt : null,
    lastInteractionAt: linked ? link.lastInteractionAt : null,
    pageConnected: Boolean(link?.pageId),
    message: linked
      ? `تم ربط Messenger بصفحة «${service.pageName}».`
      : service.configured
        ? `اربط Messenger لتصلك التنبيهات المسموح بها من صفحة «${service.pageName}».`
        : "ربط Messenger غير متاح حاليًا لأن بيانات Meta لم تُضف إلى الخادم بعد.",
  });
});

router.post("/link/start", verifyToken, requireParent, async (req, res) => {
  const config = getMessengerConfig();
  if (!config.pageId || !config.pageHandle) {
    return res.status(503).json({
      error: "لم يتم إعداد صفحة Messenger بعد. أضف META_PAGE_ID وMETA_PAGE_MME_NAME إلى إعدادات الخادم.",
      code: "MESSENGER_PAGE_NOT_CONFIGURED",
    });
  }
  try {
    const data = await createMessengerLink(req.user.phone);
    return res.json(data);
  } catch (error) {
    console.warn("Unable to create Messenger link:", error.message);
    return res.status(502).json({
      error: "تعذر إنشاء رابط Messenger حاليًا. حاول مرة أخرى لاحقًا.",
      code: "MESSENGER_LINK_UNAVAILABLE",
    });
  }
});

router.delete("/link", verifyToken, requireParent, async (req, res) => {
  await prisma.messengerLink.updateMany({
    where: { parentPhone: req.user.phone },
    data: {
      psid: null,
      status: "UNLINKED",
      linkedAt: null,
      lastInteractionAt: null,
      linkStateHash: null,
      linkStateExpiresAt: null,
    },
  });
  return res.json({ linked: false, message: "تم فصل Messenger عن حساب Minasaty." });
});

router.get("/webhook", (req, res) => {
  const mode = String(req.query["hub.mode"] || "");
  const token = String(req.query["hub.verify_token"] || "");
  const challenge = String(req.query["hub.challenge"] || "");
  if (mode === "subscribe" && challenge && verifyWebhookToken(token)) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

router.post("/webhook", (req, res) => {
  if (!verifyWebhookSignature(req.rawBody, req.get("x-hub-signature-256"))) {
    return res.sendStatus(403);
  }

  // Acknowledge immediately so Meta does not retry while a database write or
  // optional confirmation message is in progress. The handler is idempotent.
  res.status(200).send("EVENT_RECEIVED");
  void handleMessengerWebhook(req.body).catch((error) => {
    console.error("Messenger webhook processing failed:", error.message);
  });
});

module.exports = router;
