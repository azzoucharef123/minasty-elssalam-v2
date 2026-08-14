"use strict";

const prisma = require("../lib/prisma");

const MAX_TITLE_LENGTH = 160;
const VALID_LEVELS = new Set([
  "السنة الأولى",
  "السنة الثانية",
  "السنة الثالثة",
  "السنة الرابعة",
  "طالب جامعي",
]);
const DRIVE_FILE_ID_PATTERN = /^[A-Za-z0-9_-]{20,200}$/;

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeLevel(value) {
  const level = normalizeText(value);
  return VALID_LEVELS.has(level) ? level : "";
}

function extractGoogleDriveFileId(value) {
  const rawUrl = normalizeText(value);
  if (!rawUrl) {
    return "";
  }

  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "drive.google.com" && host !== "docs.google.com") {
      return "";
    }

    const pathMatch = parsed.pathname.match(/\/file\/d\/([A-Za-z0-9_-]{20,200})/);
    const queryId = parsed.searchParams.get("id");
    const fileId = pathMatch?.[1] || queryId || "";
    return DRIVE_FILE_ID_PATTERN.test(fileId) ? fileId : "";
  } catch {
    return "";
  }
}

function serializeLessonVideo(video) {
  return {
    id: video.id,
    title: video.title,
    level: video.level,
    driveUrl: video.driveUrl,
    previewUrl: `https://drive.google.com/file/d/${video.driveFileId}/preview`,
    createdAt: video.createdAt,
    updatedAt: video.updatedAt,
  };
}

async function parentCanAccessLevel(parentPhone, level) {
  if (!parentPhone || !level) {
    return false;
  }

  const student = await prisma.student.findFirst({
    where: { parentPhone, level },
    select: { id: true },
  });
  return Boolean(student);
}

/** Teacher-only: add a Google Drive video link to a study level. */
async function createLessonVideo(req, res) {
  const level = normalizeLevel(req.body?.level);
  const title = normalizeText(req.body?.title);
  const driveFileId = extractGoogleDriveFileId(req.body?.driveUrl);

  if (!level || !title || title.length > MAX_TITLE_LENGTH || !driveFileId) {
    return res.status(400).json({
      error: "أدخل عنوان الحصة ورابط فيديو Google Drive صحيحًا للمستوى المحدد.",
    });
  }

  try {
    const lessonVideo = await prisma.lessonVideo.create({
      data: {
        title,
        level,
        driveFileId,
        driveUrl: `https://drive.google.com/file/d/${driveFileId}/view`,
      },
    });

    return res.status(201).json({ status: "success", data: serializeLessonVideo(lessonVideo) });
  } catch (error) {
    if (error?.code === "P2002") {
      return res.status(409).json({ error: "رابط هذه الحصة مضاف بالفعل إلى هذا المستوى." });
    }
    console.error("Unable to create lesson video:", error);
    return res.status(500).json({ error: "تعذر حفظ رابط الحصة الآن." });
  }
}

/** Teacher may list any level; a parent may list levels belonging to their children only. */
async function getLessonVideosByLevel(req, res) {
  const level = normalizeLevel(req.params.level);
  if (!level) {
    return res.status(400).json({ error: "المستوى الدراسي غير صالح." });
  }

  try {
    if (req.user?.role === "parent") {
      const allowed = await parentCanAccessLevel(req.user.phone, level);
      if (!allowed) {
        return res.status(403).json({ error: "لا تملك صلاحية الاطلاع على مستودع هذا المستوى." });
      }
    } else if (req.user?.role !== "teacher") {
      return res.status(403).json({ error: "لا تملك صلاحية الاطلاع على مستودع الدروس." });
    }

    const videos = await prisma.lessonVideo.findMany({
      where: { level },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({
      status: "success",
      data: videos.map(serializeLessonVideo),
    });
  } catch (error) {
    console.error("Unable to list lesson videos:", error);
    return res.status(500).json({ error: "تعذر تحميل مستودع الدروس الآن." });
  }
}

/** Teacher-only: remove a lesson entry. This never deletes the original Drive video. */
async function deleteLessonVideo(req, res) {
  const videoId = normalizeText(req.params.id);
  if (!/^[a-f0-9-]{36}$/i.test(videoId)) {
    return res.status(400).json({ error: "معرّف الحصة غير صالح." });
  }

  try {
    const deleted = await prisma.lessonVideo.deleteMany({ where: { id: videoId } });
    if (!deleted.count) {
      return res.status(404).json({ error: "لم يتم العثور على رابط الحصة." });
    }

    return res.status(200).json({ status: "success" });
  } catch (error) {
    console.error("Unable to delete lesson video:", error);
    return res.status(500).json({ error: "تعذر حذف رابط الحصة الآن." });
  }
}

module.exports = {
  createLessonVideo,
  getLessonVideosByLevel,
  deleteLessonVideo,
};
