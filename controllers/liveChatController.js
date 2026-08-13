"use strict";

const fs = require("fs");
const path = require("path");
const { Prisma } = require("@prisma/client");
const prisma = require("../lib/prisma");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const imageUploadDirectory = path.join(
  process.env.UPLOAD_DIR || path.join(__dirname, "..", "public", "uploads"),
  "live-question-images"
);

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isValidStudentId(value) {
  return UUID_PATTERN.test(value);
}

async function removeImageFile(filename) {
  if (!filename) return;

  try {
    await fs.promises.unlink(path.join(imageUploadDirectory, path.basename(filename)));
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn("Unable to remove live question image:", error.message);
    }
  }
}

/** POST /api/live-chat/question-image — parent-authenticated image upload. */
async function uploadQuestionImage(req, res) {
  const uploadedFile = req.file;

  try {
    const studentId = normalizeText(req.body?.studentId);
    const level = normalizeText(req.body?.level);

    if (!uploadedFile || !isValidStudentId(studentId) || !level) {
      if (uploadedFile?.filename) await removeImageFile(uploadedFile.filename);
      return res.status(400).json({ error: "صورة السؤال وبيانات التلميذ مطلوبة." });
    }

    if (req.user?.role !== "parent" || !req.user.phone) {
      if (uploadedFile?.filename) await removeImageFile(uploadedFile.filename);
      return res.status(403).json({ error: "رفع صور الأسئلة متاح لحساب الولي فقط." });
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, parentPhone: true, level: true },
    });

    if (!student || student.parentPhone !== req.user.phone || student.level !== level) {
      if (uploadedFile?.filename) await removeImageFile(uploadedFile.filename);
      return res.status(403).json({ error: "لا تملك صلاحية رفع صورة لهذا التلميذ." });
    }

    const image = await prisma.liveQuestionImage.create({
      data: {
        studentId: student.id,
        level: student.level,
        fileName: uploadedFile.filename,
        mimeType: uploadedFile.mimetype,
      },
      select: { id: true, createdAt: true },
    });

    return res.status(201).json({
      status: "success",
      data: { imageId: image.id, createdAt: image.createdAt },
    });
  } catch (error) {
    if (uploadedFile?.filename) await removeImageFile(uploadedFile.filename);

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(409).json({ error: "تعذر حفظ صورة السؤال. حاول التصوير مرة أخرى." });
    }

    console.error("Live question image upload failed:", error);
    return res.status(500).json({ error: "تعذر رفع صورة السؤال حالياً." });
  }
}

/** GET /api/live-chat/question-image/:id — accessible only to teacher or image owner. */
async function getQuestionImage(req, res) {
  try {
    const imageId = normalizeText(req.params.id);
    if (!isValidStudentId(imageId)) {
      return res.status(400).json({ error: "معرّف الصورة غير صالح." });
    }

    const image = await prisma.liveQuestionImage.findUnique({
      where: { id: imageId },
      include: { student: { select: { parentPhone: true } } },
    });

    if (!image) {
      return res.status(404).json({ error: "صورة السؤال غير موجودة." });
    }

    const isTeacher = req.user?.role === "teacher";
    const isOwningParent = req.user?.role === "parent" && req.user.phone === image.student.parentPhone;
    if (!isTeacher && !isOwningParent) {
      return res.status(403).json({ error: "لا تملك صلاحية عرض هذه الصورة." });
    }

    const imagePath = path.join(imageUploadDirectory, path.basename(image.fileName));
    if (!fs.existsSync(imagePath)) {
      return res.status(404).json({ error: "ملف صورة السؤال لم يعد متاحاً." });
    }

    res.setHeader("Cache-Control", "private, max-age=300");
    res.type(image.mimeType);
    return res.sendFile(imagePath);
  } catch (error) {
    console.error("Live question image retrieval failed:", error);
    return res.status(500).json({ error: "تعذر عرض صورة السؤال حالياً." });
  }
}

module.exports = {
  imageUploadDirectory,
  removeImageFile,
  uploadQuestionImage,
  getQuestionImage,
};
