"use strict";

const prisma = require("../lib/prisma");

const MAX_MESSAGE_LENGTH = 4_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeMessage(value) {
  return typeof value === "string" ? value.trim() : "";
}

function serializeMessage(message, studentName) {
  return {
    id: message.id,
    studentId: message.studentId,
    senderId: message.senderId,
    receiverId: message.receiverId,
    senderRole: message.senderRole,
    receiverRole: message.receiverRole,
    content: message.content,
    createdAt: message.createdAt,
    isRead: message.isRead,
    senderName: message.senderRole === "teacher" ? "الأستاذ" : studentName,
  };
}

async function getStudentForAccess(req, studentId) {
  if (!UUID_PATTERN.test(String(studentId)) || !["teacher", "parent"].includes(req.user?.role)) return null;

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, studentName: true, parentPhone: true, level: true },
  });
  if (!student) return null;
  if (req.user.role === "parent" && req.user.phone !== student.parentPhone) return null;
  return student;
}

function messageRoles(req) {
  return req.user.role === "teacher"
    ? { senderRole: "teacher", receiverRole: "student" }
    : { senderRole: "student", receiverRole: "teacher" };
}

function emitMessage(req, message, student) {
  const namespace = req.app.get("privateMessagesNamespace");
  if (!namespace) return;
  const payload = serializeMessage(message, student.studentName);
  namespace.to("teacher").emit("private_message_created", payload);
  namespace.to(`student:${student.id}`).emit("private_message_created", payload);
}

async function listTeacherConversations(req, res) {
  if (req.user?.role !== "teacher") {
    return res.status(403).json({ error: "هذه العملية متاحة للأستاذ فقط." });
  }

  try {
    const students = await prisma.student.findMany({
      where: { messages: { some: {} } },
      select: {
        id: true,
        studentName: true,
        level: true,
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, content: true, createdAt: true, senderRole: true, isRead: true },
        },
      },
    });

    const conversations = students
      .map((student) => ({
        id: student.id,
        studentName: student.studentName,
        level: student.level,
        lastMessage: student.messages[0] || null,
      }))
      .sort((a, b) => new Date(b.lastMessage?.createdAt || 0) - new Date(a.lastMessage?.createdAt || 0));

    return res.json({ conversations });
  } catch (error) {
    console.error("Unable to list private-message conversations:", error);
    return res.status(500).json({ error: "تعذر تحميل قائمة الرسائل." });
  }
}

async function getUnreadCount(req, res) {
  try {
    if (req.user?.role === "teacher") {
      const count = await prisma.message.count({ where: { receiverRole: "teacher", isRead: false } });
      return res.json({ count });
    }

    if (req.user?.role === "parent") {
      const students = await prisma.student.findMany({
        where: { parentPhone: req.user.phone },
        select: { id: true },
      });
      const count = await prisma.message.count({
        where: { studentId: { in: students.map((student) => student.id) }, receiverRole: "student", isRead: false },
      });
      return res.json({ count });
    }

    return res.status(403).json({ error: "لا تملك صلاحية الوصول إلى الرسائل." });
  } catch (error) {
    console.error("Unable to count unread private messages:", error);
    return res.status(500).json({ error: "تعذر حساب الرسائل غير المقروءة." });
  }
}

async function listMessages(req, res) {
  const student = await getStudentForAccess(req, req.params.studentId);
  if (!student) return res.status(403).json({ error: "لا تملك صلاحية الوصول إلى هذه المحادثة." });

  try {
    const messages = await prisma.message.findMany({
      where: { studentId: student.id },
      orderBy: { createdAt: "asc" },
    });
    return res.json({ student, messages: messages.map((message) => serializeMessage(message, student.studentName)) });
  } catch (error) {
    console.error("Unable to list private messages:", error);
    return res.status(500).json({ error: "تعذر تحميل سجل الرسائل." });
  }
}

async function sendMessage(req, res) {
  const student = await getStudentForAccess(req, req.params.studentId);
  if (!student) return res.status(403).json({ error: "لا تملك صلاحية إرسال رسالة في هذه المحادثة." });

  const content = normalizeMessage(req.body?.content);
  if (!content || content.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: `الرسالة مطلوبة ولا تتجاوز ${MAX_MESSAGE_LENGTH} حرف.` });
  }

  const roles = messageRoles(req);
  try {
    const message = await prisma.message.create({
      data: {
        studentId: student.id,
        senderId: req.user.role === "teacher" ? "teacher" : student.id,
        receiverId: req.user.role === "teacher" ? student.id : "teacher",
        senderRole: roles.senderRole,
        receiverRole: roles.receiverRole,
        content,
      },
    });
    emitMessage(req, message, student);
    return res.status(201).json({ message: serializeMessage(message, student.studentName) });
  } catch (error) {
    console.error("Unable to save private message:", error);
    return res.status(500).json({ error: "تعذر حفظ الرسالة." });
  }
}

async function markMessagesRead(req, res) {
  const student = await getStudentForAccess(req, req.params.studentId);
  if (!student) return res.status(403).json({ error: "لا تملك صلاحية تعديل هذه المحادثة." });

  try {
    const receiverRole = req.user.role === "teacher" ? "teacher" : "student";
    const result = await prisma.message.updateMany({
      where: { studentId: student.id, receiverRole, isRead: false },
      data: { isRead: true },
    });
    return res.json({ updated: result.count });
  } catch (error) {
    console.error("Unable to mark private messages read:", error);
    return res.status(500).json({ error: "تعذر تحديث حالة قراءة الرسائل." });
  }
}

module.exports = {
  MAX_MESSAGE_LENGTH,
  listTeacherConversations,
  getUnreadCount,
  listMessages,
  sendMessage,
  markMessagesRead,
};
