"use strict";

const prisma = require("../lib/prisma");

const LEVELS = new Set([
  "السنة الأولى",
  "السنة الثانية",
  "السنة الثالثة",
  "السنة الرابعة",
  "طالب جامعي",
]);
const UNIVERSITY_LEVEL = "طالب جامعي";
const SECONDARY_TYPES = new Set(["MATH", "PHYSICS"]);
const UNIVERSITY_TYPES = new Set(["PAID", "FREE"]);

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isValidLevel(level) {
  return LEVELS.has(level);
}

function isValidClassType(level, subject) {
  return level === UNIVERSITY_LEVEL
    ? UNIVERSITY_TYPES.has(subject)
    : SECONDARY_TYPES.has(subject);
}

function parseScheduledAt(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const scheduledAt = new Date(value);
  return Number.isFinite(scheduledAt.getTime()) ? scheduledAt : null;
}

function notifyScheduleChange(req, level) {
  const io = req.app.get("io");
  io?.to(`${level}_lobby`).emit("class_schedule_updated", { level });
}

function notifyAbsenceChange(req, absence) {
  const io = req.app.get("io");
  io?.to(`${absence.level}_lobby`).emit("teacher_absence_updated", {
    level: absence.level,
    isAbsent: absence.isAbsent,
    updatedAt: absence.updatedAt,
  });
}

async function getLevelSchedule(req, res) {
  try {
    const level = normalizeText(req.params.level);
    if (!isValidLevel(level)) {
      return res.status(400).json({ error: "المستوى الدراسي غير صالح." });
    }

    const [scheduledClasses, absence] = await Promise.all([
      prisma.scheduledClass.findMany({
        where: { level },
        orderBy: { scheduledAt: "asc" },
      }),
      prisma.teacherAbsence.findUnique({ where: { level } }),
    ]);

    return res.status(200).json({
      status: "success",
      level,
      scheduledClasses,
      teacherAbsent: Boolean(absence?.isAbsent),
      absenceUpdatedAt: absence?.updatedAt || null,
    });
  } catch (error) {
    console.error("Unable to load class schedule:", error);
    return res.status(500).json({ error: "تعذر تحميل برنامج الحصص حالياً." });
  }
}

async function createScheduledClass(req, res) {
  try {
    const level = normalizeText(req.body?.level);
    const subject = normalizeText(req.body?.subject);
    const scheduledAt = parseScheduledAt(req.body?.scheduledAt);

    if (!isValidLevel(level)) {
      return res.status(400).json({ error: "المستوى الدراسي غير صالح." });
    }
    if (!isValidClassType(level, subject)) {
      return res.status(400).json({
        error: level === UNIVERSITY_LEVEL
          ? "اختر نوع اشتراك صالحًا: مدفوع أو مجاني."
          : "اختر مادة صالحة: الرياضيات أو الفيزياء.",
      });
    }
    if (!scheduledAt) {
      return res.status(400).json({ error: "حدد تاريخًا وتوقيتًا صالحين للحصة." });
    }

    const scheduledClass = await prisma.scheduledClass.create({
      data: { level, subject, scheduledAt },
    });
    notifyScheduleChange(req, level);

    return res.status(201).json({
      status: "success",
      message: "تمت برمجة الحصة بنجاح.",
      data: scheduledClass,
    });
  } catch (error) {
    console.error("Unable to create scheduled class:", error);
    return res.status(500).json({ error: "تعذر برمجة الحصة حالياً." });
  }
}

async function updateScheduledClass(req, res) {
  try {
    const existing = await prisma.scheduledClass.findUnique({
      where: { id: req.params.id },
      select: { id: true, level: true },
    });
    if (!existing) {
      return res.status(404).json({ error: "الحصة المجدولة غير موجودة." });
    }

    const level = normalizeText(req.body?.level || existing.level);
    const subject = normalizeText(req.body?.subject);
    const scheduledAt = parseScheduledAt(req.body?.scheduledAt);

    if (!isValidLevel(level)) {
      return res.status(400).json({ error: "المستوى الدراسي غير صالح." });
    }
    if (!isValidClassType(level, subject)) {
      return res.status(400).json({ error: "نوع الحصة غير مناسب للمستوى المحدد." });
    }
    if (!scheduledAt) {
      return res.status(400).json({ error: "حدد تاريخًا وتوقيتًا صالحين للحصة." });
    }

    const scheduledClass = await prisma.scheduledClass.update({
      where: { id: existing.id },
      data: { level, subject, scheduledAt },
    });
    notifyScheduleChange(req, existing.level);
    if (existing.level !== level) {
      notifyScheduleChange(req, level);
    }

    return res.status(200).json({
      status: "success",
      message: "تم تعديل الحصة المجدولة.",
      data: scheduledClass,
    });
  } catch (error) {
    console.error("Unable to update scheduled class:", error);
    return res.status(500).json({ error: "تعذر تعديل الحصة حالياً." });
  }
}

async function deleteScheduledClass(req, res) {
  try {
    const existing = await prisma.scheduledClass.findUnique({
      where: { id: req.params.id },
      select: { id: true, level: true },
    });
    if (!existing) {
      return res.status(404).json({ error: "الحصة المجدولة غير موجودة." });
    }

    await prisma.scheduledClass.delete({ where: { id: existing.id } });
    notifyScheduleChange(req, existing.level);
    return res.status(200).json({ status: "success", message: "تم حذف الحصة المجدولة." });
  } catch (error) {
    console.error("Unable to delete scheduled class:", error);
    return res.status(500).json({ error: "تعذر حذف الحصة حالياً." });
  }
}

async function updateTeacherAbsence(req, res) {
  try {
    const level = normalizeText(req.params.level);
    const isAbsent = req.body?.isAbsent === true;
    if (!isValidLevel(level)) {
      return res.status(400).json({ error: "المستوى الدراسي غير صالح." });
    }

    const absence = await prisma.teacherAbsence.upsert({
      where: { level },
      create: { level, isAbsent },
      update: { isAbsent },
    });
    notifyAbsenceChange(req, absence);

    return res.status(200).json({
      status: "success",
      message: isAbsent ? "تم تفعيل حالة غياب الأستاذ لهذا المستوى." : "تم إلغاء حالة غياب الأستاذ لهذا المستوى.",
      data: absence,
    });
  } catch (error) {
    console.error("Unable to update teacher absence:", error);
    return res.status(500).json({ error: "تعذر تحديث حالة غياب الأستاذ حالياً." });
  }
}

module.exports = {
  getLevelSchedule,
  createScheduledClass,
  updateScheduledClass,
  deleteScheduledClass,
  updateTeacherAbsence,
};
