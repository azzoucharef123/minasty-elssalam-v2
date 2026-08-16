"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const { verifyToken, isTeacher } = require("../middleware/authMiddleware");
const prisma = require("../lib/prisma");
const {
  getAuthorizationUrl,
  exchangeCode,
  getConnectionStatus,
  listRecentVideos,
  uploadVideo,
} = require("../services/youtubeService");

const router = express.Router();
const uploadDirectory = String(process.env.YOUTUBE_UPLOAD_DIR || "/tmp/minasaty-youtube");
fs.mkdirSync(uploadDirectory, { recursive: true });
const upload = multer({
  dest: uploadDirectory,
  limits: { fileSize: 1_500 * 1024 * 1024 },
  fileFilter(_req, file, callback) {
    callback(null, /^video\//i.test(file.mimetype) || file.mimetype === "application/octet-stream");
  },
});

function getJwtSecret() {
  const secret = String(process.env.JWT_SECRET || "");
  if (secret.length < 32) throw new Error("JWT_SECRET is missing or too short.");
  return secret;
}

function makeState() {
  return jwt.sign(
    { role: "teacher", purpose: "youtube_oauth", nonce: crypto.randomUUID() },
    getJwtSecret(),
    { algorithm: "HS256", expiresIn: "10m" }
  );
}

function verifyState(state) {
  const payload = jwt.verify(String(state || ""), getJwtSecret(), { algorithms: ["HS256"] });
  if (payload.role !== "teacher" || payload.purpose !== "youtube_oauth") throw new Error("YOUTUBE_OAUTH_STATE_INVALID");
  return payload;
}

function originForResponse(req) {
  const configured = String(process.env.CLIENT_ORIGIN || "").split(",")[0].trim();
  const forwardedProtocol = String(req.get("x-forwarded-proto") || "").split(",")[0].trim();
  const protocol = forwardedProtocol || req.protocol;
  return configured || `${protocol}://${req.get("host")}`;
}

async function attachVideoToNearestScheduledClass({ req, level, subject, videoId, recordedAt }) {
  const normalizedLevel = String(level || "").trim();
  const normalizedSubject = String(subject || "").trim();
  if (!normalizedLevel || !normalizedSubject || !videoId) return null;

  const recordedDate = new Date(recordedAt || Date.now());
  const timestamp = Number.isFinite(recordedDate.getTime()) ? recordedDate : new Date();
  const windowStart = new Date(timestamp.getTime() - 36 * 60 * 60 * 1000);
  const windowEnd = new Date(timestamp.getTime() + 36 * 60 * 60 * 1000);
  const candidates = await prisma.scheduledClass.findMany({
    where: {
      level: normalizedLevel,
      subject: normalizedSubject,
      status: "PENDING",
      scheduledAt: { gte: windowStart, lte: windowEnd },
    },
    orderBy: { scheduledAt: "asc" },
    take: 25,
  });
  if (!candidates.length) return null;

  const nearest = candidates.sort((left, right) =>
    Math.abs(new Date(left.scheduledAt).getTime() - timestamp.getTime()) -
    Math.abs(new Date(right.scheduledAt).getTime() - timestamp.getTime())
  )[0];
  const updated = await prisma.scheduledClass.update({
    where: { id: nearest.id },
    data: { status: "COMPLETED", youtubeVideoId: videoId, driveLink: null, notes: null },
  });
  req.app.get("io")?.to(`${normalizedLevel}_lobby`).emit("class_registry_updated", {
    level: normalizedLevel,
    classId: updated.id,
  });
  return { id: updated.id, scheduledAt: updated.scheduledAt };
}

router.get("/status", verifyToken, isTeacher, async (_req, res) => {
  try {
    return res.status(200).json({ status: "success", data: await getConnectionStatus() });
  } catch (error) {
    console.error("Unable to read YouTube connection status:", error);
    return res.status(503).json({ error: "تعذر قراءة حالة ربط YouTube حالياً." });
  }
});

router.get("/connect", verifyToken, isTeacher, (req, res) => {
  try {
    return res.status(200).json({ status: "success", authorizationUrl: getAuthorizationUrl(makeState()) });
  } catch (error) {
    console.error("Unable to start YouTube OAuth:", error);
    return res.status(503).json({ error: error.code === "YOUTUBE_NOT_CONFIGURED" ? "أضف بيانات YouTube OAuth إلى متغيرات Railway أولاً." : "تعذر بدء ربط قناة YouTube." });
  }
});

router.get("/callback", async (req, res) => {
  const origin = originForResponse(req);
  try {
    verifyState(req.query.state);
    await exchangeCode(req.query.code);
    return res.type("html").send(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>تم ربط YouTube</title><body style="font-family:Arial,sans-serif;text-align:center;padding:3rem"><h1>تم ربط قناة YouTube بنجاح</h1><p>يمكنك إغلاق هذه النافذة والعودة إلى لوحة الأستاذ.</p><script>window.opener?.postMessage({type:"youtube-connected"},${JSON.stringify(origin)});setTimeout(()=>window.close(),800);</script></body></html>`);
  } catch (error) {
    console.error("YouTube OAuth callback failed:", error);
    return res.status(400).type("html").send(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>تعذر ربط YouTube</title><body style="font-family:Arial,sans-serif;text-align:center;padding:3rem"><h1>تعذر ربط قناة YouTube</h1><p>تحقق من إعدادات OAuth ثم حاول مرة أخرى.</p><script>window.opener?.postMessage({type:"youtube-connect-failed"},${JSON.stringify(origin)});</script></body></html>`);
  }
});

router.get("/videos", verifyToken, isTeacher, async (req, res) => {
  try {
    return res.status(200).json({ status: "success", data: await listRecentVideos(req.query.limit) });
  } catch (error) {
    console.error("Unable to list YouTube videos:", error);
    const status = error.code === "YOUTUBE_NOT_CONNECTED" ? 409 : 503;
    return res.status(status).json({ error: error.message || "تعذر جلب فيديوهات قناة YouTube." });
  }
});

router.post("/upload", verifyToken, isTeacher, upload.single("video"), async (req, res) => {
  const uploadedPath = req.file?.path;
  try {
    if (!req.file) return res.status(400).json({ error: "أرسل ملف تسجيل فيديو صالحاً." });
    const level = String(req.body?.level || "").trim();
    const subject = String(req.body?.subject || "").trim();
    const recordedAt = String(req.body?.recordedAt || "").trim();
    const title = String(req.body?.title || `حصة ${subject || "مباشرة"} - ${level || "الأكاديمية"} - ${new Date().toLocaleDateString("ar-DZ")}`).slice(0, 100);
    const description = String(req.body?.description || `تسجيل من أكاديمية التفوق للفيزياء والرياضيات\nالمستوى: ${level}\nالمادة: ${subject}`).slice(0, 5000);
    const result = await uploadVideo({ stream: fs.createReadStream(req.file.path), mimeType: req.file.mimetype || "video/webm", title, description });
    const registryClass = await attachVideoToNearestScheduledClass({ req, level, subject, videoId: result.id, recordedAt }).catch((error) => {
      console.error("Unable to attach uploaded YouTube video to the class registry:", error);
      return null;
    });
    return res.status(201).json({ status: "success", data: { ...result, registryClass } });
  } catch (error) {
    console.error("Unable to upload video to YouTube:", error);
    const status = error.code === "YOUTUBE_NOT_CONNECTED" ? 409 : 503;
    return res.status(status).json({ error: error.message || "تعذر رفع التسجيل إلى YouTube." });
  } finally {
    if (uploadedPath) fs.promises.unlink(uploadedPath).catch(() => {});
  }
});

module.exports = router;
