"use strict";

const fs = require("fs");
const path = require("path");
const { Prisma } = require("@prisma/client");
const { normalizeParentPhone } = require("../utils/phone");
const {
  normalizeParentPin,
  hashParentPin,
  verifyParentPin,
} = require("../utils/parentPin");
const prisma = require("../lib/prisma");
const { removeImageFile } = require("./liveChatController");

const uploadDirectory =
  process.env.UPLOAD_DIR || path.join(__dirname, "..", "public", "uploads");

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const PAYMENT_STAGES = new Set(["PAID", "UNPAID", "PROMISED"]);
const MAX_AMOUNT_DUE = 10_000_000;

class RequestValidationError extends Error {}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Parse an optional URL query value as a positive safe integer. The page-size
 * ceiling prevents clients from bypassing the pagination contract.
 */
function parsePositiveInteger(value, fallback, label, maximum = Number.MAX_SAFE_INTEGER) {
  if (value === undefined || value === "") {
    return fallback;
  }

  if (Array.isArray(value) || !/^\d+$/.test(String(value))) {
    throw new RequestValidationError(`${label} يجب أن يكون رقماً صحيحاً موجباً.`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new RequestValidationError(
      `${label} يجب أن يكون بين 1 و${maximum.toLocaleString("en-US")}.`
    );
  }

  return parsed;
}

function parsePagination(query) {
  const page = parsePositiveInteger(query.page, DEFAULT_PAGE, "رقم الصفحة");
  const limit = parsePositiveInteger(query.limit, DEFAULT_LIMIT, "حجم الصفحة", MAX_LIMIT);
  const skip = (page - 1) * limit;

  if (!Number.isSafeInteger(skip)) {
    throw new RequestValidationError("رقم الصفحة كبير جداً.");
  }

  return { page, limit, skip };
}

/** POST /api/students/register — public student registration. */
async function registerStudent(req, res) {
  try {
    const studentName = normalizeText(req.body?.studentName);
    const parentPhone = normalizeParentPhone(req.body?.parentPhone);
    const parentPin = normalizeParentPin(req.body?.parentPin);
    const level = normalizeText(req.body?.level);
    const uploadedCardFile = req.file;

    if (!studentName || !parentPhone || !parentPin || !level) {
      if (uploadedCardFile?.filename) {
        await removeUploadedCard(uploadedCardFile.filename);
      }
      return res.status(400).json({
        error: "الاسم ورقم الهاتف وكلمة المرور من 4 أرقام والمستوى الدراسي حقول مطلوبة.",
      });
    }

    const existingStudent = await prisma.student.findFirst({
      where: {
        studentName,
        parentPhone,
        level,
      },
      select: { id: true },
    });

    if (existingStudent) {
      if (uploadedCardFile?.filename) {
        await removeUploadedCard(uploadedCardFile.filename);
      }
      return res.status(400).json({
        error: "هذا التلميذ مسجل بالفعل في هذا المستوى الدراسي بهذا الرقم.",
      });
    }
    const isUniversityStudent = level === "طالب جامعي";

    if (isUniversityStudent && !uploadedCardFile) {
      return res.status(400).json({
        error: "صورة بطاقة الطالب الجامعي مطلوبة لإكمال التسجيل.",
      });
    }

    if (!isUniversityStudent && uploadedCardFile) {
      await removeUploadedCard(uploadedCardFile.filename);
      return res.status(400).json({
        error: "رفع صورة البطاقة متاح للطلاب الجامعيين فقط.",
      });
    }

    const existingCredential = await prisma.parentCredential.findUnique({
      where: { parentPhone },
      select: { pinHash: true },
    });

    if (existingCredential) {
      const pinMatches = await verifyParentPin(parentPin, existingCredential.pinHash);
      if (!pinMatches) {
        if (uploadedCardFile?.filename) {
          await removeUploadedCard(uploadedCardFile.filename);
        }
        return res.status(401).json({
          error: "كلمة المرور لهذا الرقم غير صحيحة. استخدم كلمة المرور ذات 4 أرقام التي أنشأتها سابقًا.",
        });
      }
    }

    const student = await prisma.$transaction(async (tx) => {
      if (!existingCredential) {
        await tx.parentCredential.create({
          data: {
            parentPhone,
            pinHash: await hashParentPin(parentPin),
          },
        });
      }

      return tx.student.create({
        data: {
          studentName,
          parentPhone,
          level,
          paymentStatus: false,
          paymentStage: "UNPAID",
          amountDue: null,
          mathEnrollment: true,
          physicsEnrollment: true,
          liveAccessEnabled: false,
          mathNote: "",
          physicsNote: "",
          cardPhotoUrl: uploadedCardFile?.filename || null,
        },
      });
    });

    return res.status(201).json({
      status: "success",
      data: student,
    });
  } catch (error) {
    // A concurrent registration can still race the pre-check; retain the same
    // client-safe response for Prisma's unique constraint violation.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(400).json({ error: "هذا التلميذ مسجل بالفعل في هذا المستوى الدراسي بهذا الرقم." });
    }

    if (req.file?.filename) {
      await removeUploadedCard(req.file.filename);
    }

    console.error("Student registration failed:", error);
    return res.status(500).json({ error: "تعذر تسجيل التلميذ حالياً." });
  }
}

/** GET /api/students/parent/:phone — ownership is enforced by middleware. */
async function getStudentForParent(req, res) {
  try {
    const parentPhone = normalizeParentPhone(req.params.phone);
    const students = await prisma.student.findMany({
      where: { parentPhone },
      orderBy: { createdAt: "desc" },
    });

    if (!students || students.length === 0) {
      return res.status(404).json({ error: "رقم الهاتف غير مسجل." });
    }

    // Return the array of students for the parent to choose from.
    return res.status(200).json(students);
  } catch (error) {
    console.error("Parent students lookup failed:", error);
    return res.status(500).json({ error: "تعذر تحميل بيانات التلاميذ حالياً." });
  }
}

/**
 * GET /api/students/level/:level?page=1&limit=50
 *
 * Returns a stable, bounded teacher roster page and total count metadata. Both
 * database operations use the same level condition and run concurrently.
 */
async function getStudentCard(req, res) {
  try {
    const student = await prisma.student.findUnique({
      where: { id: req.params.id },
      select: { cardPhotoUrl: true },
    });

    if (!student?.cardPhotoUrl) {
      return res.status(404).json({ error: "لا توجد صورة بطاقة لهذا الطالب." });
    }

    const filename = path.basename(student.cardPhotoUrl);
    const filePath = path.join(uploadDirectory, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "صورة البطاقة غير متاحة حالياً." });
    }

    return res.sendFile(filePath);
  } catch (error) {
    console.error("Student card lookup failed:", error);
    return res.status(500).json({ error: "تعذر عرض صورة البطاقة حالياً." });
  }
}

async function getStudentsByLevel(req, res) {
  try {
    const level = normalizeText(req.params.level);
    if (!level) {
      return res.status(400).json({ error: "المستوى الدراسي مطلوب." });
    }

    const { page, limit, skip } = parsePagination(req.query);
    const where = { level };

    const [totalRecords, students] = await Promise.all([
      prisma.student.count({ where }),
      prisma.student.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return res.status(200).json({
      status: "success",
      data: students,
      meta: {
        totalRecords,
        currentPage: page,
        totalPages: Math.ceil(totalRecords / limit),
        limit,
      },
    });
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return res.status(400).json({ error: error.message });
    }

    console.error("Paginated level roster lookup failed:", error);
    return res.status(500).json({ error: "تعذر تحميل قائمة التلاميذ حالياً." });
  }
}

async function removeUploadedCard(filename) {
  if (!filename) {
    return;
  }

  const safeFilename = path.basename(filename);
  const filePath = path.join(uploadDirectory, safeFilename);

  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn("Unable to remove student card file:", error.message);
    }
  }
}

function notifyAccountStatus(req, student) {
  const io = req.app.get("io");
  io?.to(`${student.level}_lobby`).emit("student_account_status_updated", {
    studentId: student.id,
    accountActive: student.accountActive,
    cardReuploadRequested: student.cardReuploadRequested,
  });
}

/** PUT /api/students/:id/request-card-reupload — teacher-only. */
async function requestStudentCardReupload(req, res) {
  try {
    const student = await prisma.student.findUnique({
      where: { id: req.params.id },
      select: { id: true, level: true },
    });

    if (!student) {
      return res.status(404).json({ error: "التلميذ غير موجود." });
    }

    if (student.level !== "طالب جامعي") {
      return res.status(400).json({ error: "إعادة رفع البطاقة متاحة للطالب الجامعي فقط." });
    }

    const updatedStudent = await prisma.student.update({
      where: { id: student.id },
      data: { accountActive: false, cardReuploadRequested: true },
    });
    notifyAccountStatus(req, updatedStudent);

    return res.status(200).json({
      status: "success",
      message: "تم إرسال طلب إعادة رفع البطاقة للطالب.",
      data: updatedStudent,
    });
  } catch (error) {
    console.error("Card reupload request failed:", error);
    return res.status(500).json({ error: "تعذر إرسال طلب إعادة رفع البطاقة حالياً." });
  }
}

/** POST /api/students/:id/card-photo — owning parent uploads a replacement card. */
async function replaceStudentCard(req, res) {
  const uploadedCardFile = req.file;

  try {
    if (!uploadedCardFile?.filename) {
      return res.status(400).json({ error: "اختر صورة بطاقة بصيغة JPG أو PNG أولاً." });
    }

    const student = await prisma.student.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        parentPhone: true,
        level: true,
        cardPhotoUrl: true,
        cardReuploadRequested: true,
      },
    });

    if (!student || student.parentPhone !== req.user?.phone) {
      await removeUploadedCard(uploadedCardFile.filename);
      return res.status(403).json({ error: "لا تملك صلاحية تحديث بطاقة هذا الطالب." });
    }

    if (student.level !== "طالب جامعي" || !student.cardReuploadRequested) {
      await removeUploadedCard(uploadedCardFile.filename);
      return res.status(400).json({ error: "لم يطلب الأستاذ إعادة رفع بطاقة هذا الطالب." });
    }

    const updatedStudent = await prisma.student.update({
      where: { id: student.id },
      data: {
        cardPhotoUrl: uploadedCardFile.filename,
        accountActive: true,
        cardReuploadRequested: false,
      },
    });
    await removeUploadedCard(student.cardPhotoUrl);
    notifyAccountStatus(req, updatedStudent);

    return res.status(200).json({
      status: "success",
      message: "تم رفع البطاقة الجديدة بنجاح.",
      data: updatedStudent,
    });
  } catch (error) {
    if (uploadedCardFile?.filename) {
      await removeUploadedCard(uploadedCardFile.filename);
    }
    console.error("Student card replacement failed:", error);
    return res.status(500).json({ error: "تعذر رفع البطاقة الجديدة حالياً." });
  }
}

/** DELETE /api/students/:id — teacher-only user deletion. */
async function deleteStudent(req, res) {
  try {
    const student = await prisma.student.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        cardPhotoUrl: true,
        studentName: true,
        questionImages: { select: { fileName: true } },
      },
    });

    if (!student) {
      return res.status(404).json({ error: "التلميذ غير موجود." });
    }

    await prisma.student.delete({ where: { id: student.id } });
    await removeUploadedCard(student.cardPhotoUrl);
    await Promise.all(student.questionImages.map((image) => removeImageFile(image.fileName)));

    return res.status(200).json({
      status: "success",
      message: `تم حذف المستخدم ${student.studentName} بنجاح.`,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return res.status(404).json({ error: "التلميذ غير موجود." });
    }

    console.error("Student deletion failed:", error);
    return res.status(500).json({ error: "تعذر حذف المستخدم حالياً." });
  }
}

/** PUT /api/students/:id — teacher-only authorization is enforced by middleware. */
async function updateStudentStatusAndNotes(req, res) {
  try {
    const { id } = req.params;
    const {
      paymentStage,
      amountDue,
      mathEnrollment,
      physicsEnrollment,
      liveAccessEnabled,
      mathNote,
      physicsNote,
    } = req.body || {};
    const normalizedAmount = amountDue === null || amountDue === "" ? null : Number(amountDue);

    if (
      !PAYMENT_STAGES.has(paymentStage) ||
      (normalizedAmount !== null &&
        (!Number.isSafeInteger(normalizedAmount) ||
          normalizedAmount < 0 ||
          normalizedAmount > MAX_AMOUNT_DUE)) ||
      typeof mathEnrollment !== "boolean" ||
      typeof physicsEnrollment !== "boolean" ||
      (!mathEnrollment && !physicsEnrollment) ||
      typeof liveAccessEnabled !== "boolean" ||
      typeof mathNote !== "string" ||
      typeof physicsNote !== "string"
    ) {
      return res.status(400).json({
        error: "بيانات الاشتراك والدفع والمبلغ وصلاحية الحصة أو الملاحظات غير صحيحة. يجب اختيار مادة واحدة على الأقل.",
      });
    }

    const student = await prisma.student.update({
      where: { id },
      data: {
        paymentStatus: paymentStage === "PAID",
        paymentStage,
        amountDue: normalizedAmount,
        mathEnrollment,
        physicsEnrollment,
        liveAccessEnabled,
        mathNote: mathNote.trim(),
        physicsNote: physicsNote.trim(),
      },
    });

    // Parent dashboards observing this level receive only the changed student
    // identifier and current class-access flag. They then refresh their own
    // authenticated data without a manual page reload.
    const io = req.app.get("io");
    io?.to(`${student.level}_lobby`).emit("student_live_access_updated", {
      studentId: student.id,
      liveAccessEnabled: student.liveAccessEnabled,
    });

    return res.status(200).json({
      status: "success",
      data: student,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return res.status(404).json({ error: "التلميذ غير موجود." });
    }

    console.error("Student update failed:", error);
    return res.status(500).json({ error: "تعذر تحديث بيانات التلميذ حالياً." });
  }
}

module.exports = {
  registerStudent,
  getStudentForParent,
  getStudentCard,
  getStudentsByLevel,
  updateStudentStatusAndNotes,
  requestStudentCardReupload,
  replaceStudentCard,
  deleteStudent,
};
