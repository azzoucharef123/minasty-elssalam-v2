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
const SECONDARY_REPOSITORY_TYPES = new Set(["MATH", "PHYSICS"]);
const UNIVERSITY_REPOSITORY_TYPES = new Set(["FREE", "PAID"]);
const LEGACY_REPOSITORY_TYPE = "UNCLASSIFIED";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeLevel(value) {
  const level = normalizeText(value);
  return VALID_LEVELS.has(level) ? level : "";
}

function normalizeRepositoryType(value) {
  const repositoryType = normalizeText(value).toUpperCase();
  return repositoryType;
}

function repositoryTypeLabel(level, repositoryType) {
  if (level === "طالب جامعي") {
    return repositoryType === "PAID" ? "اشتراك مدفوع" : "اشتراك مجاني";
  }
  return repositoryType === "PHYSICS" ? "الفيزياء" : "الرياضيات";
}

function isValidRepositoryType(level, repositoryType) {
  const allowedTypes = level === "طالب جامعي" ? UNIVERSITY_REPOSITORY_TYPES : SECONDARY_REPOSITORY_TYPES;
  return allowedTypes.has(repositoryType);
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
  const repositoryType = video.repositoryType || LEGACY_REPOSITORY_TYPE;
  return {
    id: video.id,
    title: video.title,
    level: video.level,
    repositoryType,
    repositoryTypeLabel: repositoryType === LEGACY_REPOSITORY_TYPE
      ? "قديم — غير مصنف"
      : repositoryTypeLabel(video.level, repositoryType),
    driveUrl: video.driveUrl,
    previewUrl: `https://drive.google.com/file/d/${video.driveFileId}/preview`,
    createdAt: video.createdAt,
    updatedAt: video.updatedAt,
  };
}

async function getParentStudentForLevel(parentPhone, level, studentId) {
  if (!parentPhone || !level) {
    return null;
  }

  return prisma.student.findFirst({
    where: {
      parentPhone,
      level,
      ...(studentId ? { id: studentId } : {}),
    },
    select: {
      id: true,
      level: true,
      paymentStage: true,
      paymentStatus: true,
      mathEnrollment: true,
      physicsEnrollment: true,
    },
  });
}

function getStudentRepositoryTypes(student) {
  if (!student) return [];
  if (student.level === "طالب جامعي") {
    return student.paymentStage === "PAID" || student.paymentStatus === true
      ? ["FREE", "PAID"]
      : ["FREE"];
  }

  return [
    student.mathEnrollment ? "MATH" : null,
    student.physicsEnrollment ? "PHYSICS" : null,
  ].filter(Boolean);
}

/** Teacher-only: add a Google Drive video link to a study level. */
async function createLessonVideo(req, res) {
  const level = normalizeLevel(req.body?.level);
  const title = normalizeText(req.body?.title);
  const repositoryType = normalizeRepositoryType(req.body?.repositoryType);
  const driveFileId = extractGoogleDriveFileId(req.body?.driveUrl);

  if (!level || !title || title.length > MAX_TITLE_LENGTH || !driveFileId || !isValidRepositoryType(level, repositoryType)) {
    return res.status(400).json({
      error: level === "طالب جامعي"
        ? "اختر نوع المستودع: اشتراك مجاني أو اشتراك مدفوع، ثم أدخل عنوان الحصة والرابط الصحيح."
        : "اختر مادة الحصة: الرياضيات أو الفيزياء، ثم أدخل العنوان والرابط الصحيح.",
    });
  }

  try {
    const lessonVideo = await prisma.lessonVideo.create({
      data: {
        title,
        level,
        driveFileId,
        driveUrl: `https://drive.google.com/file/d/${driveFileId}/view`,
        repositoryType,
      },
    });

    return res.status(201).json({ status: "success", data: serializeLessonVideo(lessonVideo) });
  } catch (error) {
    if (error?.code === "P2002") {
      return res.status(409).json({ error: "رابط هذه الحصة مضاف بالفعل إلى هذا التصنيف." });
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
    let where = { level };
    if (req.user?.role === "parent") {
      const student = await getParentStudentForLevel(req.user.phone, level, normalizeText(req.query?.studentId));
      if (!student) {
        return res.status(403).json({ error: "لا تملك صلاحية الاطلاع على مستودع هذا المستوى." });
      }
      const studentPaymentStage = student.paymentStage || (student.paymentStatus ? "PAID" : "UNPAID");
      if (level !== "طالب جامعي" && studentPaymentStage === "UNPAID") {
        return res.status(403).json({ error: "مستودع الدروس متاح بعد تأكيد الدفع أو تسجيل الوعد بالدفع." });
      }
      const accessibleTypes = getStudentRepositoryTypes(student);
      where = { level, repositoryType: { in: accessibleTypes } };
    } else if (req.user?.role !== "teacher") {
      return res.status(403).json({ error: "لا تملك صلاحية الاطلاع على مستودع الدروس." });
    }

    const videos = await prisma.lessonVideo.findMany({
      where,
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
