"use strict";

const prisma = require("../lib/prisma");
const { logAudit } = require("../utils/audit");

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

async function notifyScheduleChange(req, level, action = "SCHEDULE_UPDATED") {
  const io = req.app.get("io");
  io?.to(`${level}_lobby`).emit("class_schedule_updated", { level });
  const students = await prisma.student.findMany({ where: { level }, select: { id: true, parentPhone: true } });
  await prisma.notification.createMany({ data: students.map((student) => ({ studentId: student.id, recipientRole: "parent", recipientId: student.parentPhone, type: "SCHEDULE", title: "تحديث برنامج الحصص", body: "تم تعديل برنامج الحصص الخاص بمستواك الدراسي.", link: "./parent-dashboard.html" })) }).catch(() => {});
  void logAudit(req, { action, entityType: "ScheduledClass", metadata: { level } });
}

async function notifyAbsenceChange(req, absence) {
  const io = req.app.get("io");
  io?.to(`${absence.level}_lobby`).emit("teacher_absence_updated", {
    level: absence.level,
    isAbsent: absence.isAbsent,
    updatedAt: absence.updatedAt,
  });
  if (absence.isAbsent) {
    const students = await prisma.student.findMany({ where: { level: absence.level }, select: { id: true, parentPhone: true } });
    await prisma.notification.createMany({ data: students.map((student) => ({ studentId: student.id, recipientRole: "parent", recipientId: student.parentPhone, type: "ABSENCE", title: "إعلان غياب الأستاذ", body: "الأستاذ غائب اليوم لظروف خاصة.", link: "./parent-dashboard.html" })) }).catch(() => {});
  }
  void logAudit(req, { action: absence.isAbsent ? "TEACHER_ABSENCE_ENABLED" : "TEACHER_ABSENCE_DISABLED", entityType: "TeacherAbsence", entityId: absence.level, metadata: { level: absence.level } });
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
    void notifyScheduleChange(req, level, "SCHEDULE_CREATED");

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
    void notifyScheduleChange(req, existing.level, "SCHEDULE_UPDATED");
    if (existing.level !== level) {
      void notifyScheduleChange(req, level, "SCHEDULE_UPDATED");
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
    void notifyScheduleChange(req, existing.level, "SCHEDULE_DELETED");
    return res.status(200).json({ status: "success", message: "تم حذف الحصة المجدولة." });
  } catch (error) {
    console.error("Unable to delete scheduled class:", error);
    return res.status(500).json({ error: "تعذر حذف الحصة حالياً." });
  }
}

async function getCalendarIcs(req, res) {
  try {
    const level = normalizeText(req.params.level);
    if (!isValidLevel(level)) return res.status(400).json({ error: "المستوى الدراسي غير صالح." });
    const classes = await prisma.scheduledClass.findMany({ where: { level }, orderBy: { scheduledAt: "asc" } });
    const escapeIcs = (value) => String(value).replace(/([\\,;])/g, "\\$1").replace(/\r?\n/g, "\\n");
    const formatUtc = (date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Akademiat Altawafuq//AR", "CALSCALE:GREGORIAN"];
    for (const item of classes) {
      lines.push("BEGIN:VEVENT", `UID:${item.id}@dr.africacold.fr`, `DTSTAMP:${formatUtc(item.createdAt)}`, `DTSTART:${formatUtc(item.scheduledAt)}`, `DTEND:${formatUtc(new Date(item.scheduledAt.getTime() + 60 * 60 * 1000))}`, `SUMMARY:${escapeIcs(`أكاديمية التفوق - ${item.subject}`)}`, `DESCRIPTION:${escapeIcs(`حصة المستوى ${item.level}`)}`, "END:VEVENT");
    }
    lines.push("END:VCALENDAR");
    res.type("text/calendar; charset=utf-8");
    return res.send(lines.join("\r\n"));
  } catch (error) {
    console.error("Calendar export failed:", error);
    return res.status(500).json({ error: "تعذر تصدير التقويم حالياً." });
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
    void notifyAbsenceChange(req, absence);

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
  getCalendarIcs,
  createScheduledClass,
  updateScheduledClass,
  deleteScheduledClass,
  updateTeacherAbsence,
};
