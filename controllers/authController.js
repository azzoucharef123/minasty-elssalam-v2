"use strict";

const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { normalizeParentPhone } = require("../utils/phone");
const {
  normalizeParentPin,
  hashParentPin,
  verifyParentPin,
} = require("../utils/parentPin");
const prisma = require("../lib/prisma");
const { issueSession, JWT_EXPIRES_IN, revokeSessionByTokenId } = require("../utils/sessionAuth");

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET is missing or too short.");
  }

  return secret;
}

async function createToken(payload, req) {
  return issueSession(payload, req);
}

/** Compare passcodes without leaking matching-prefix timing information. */
function safeEquals(receivedValue, expectedValue) {
  if (typeof receivedValue !== "string" || typeof expectedValue !== "string") {
    return false;
  }

  const received = Buffer.from(receivedValue);
  const expected = Buffer.from(expectedValue);

  return (
    received.length === expected.length &&
    crypto.timingSafeEqual(received, expected)
  );
}

/**
 * POST /api/auth/teacher
 * Body: { passcode }
 *
 * TEACHER_PASSCODE must be supplied by the deployment environment. There is
 * deliberately no development fallback in the running application.
 */
async function teacherLogin(req, res) {
  try {
    const { passcode } = req.body || {};
    const expectedPasscode = String(process.env.TEACHER_PASSCODE || "").trim();
    if (!expectedPasscode) {
      return res.status(503).json({ error: "لم يتم إعداد دخول الأستاذ على الخادم." });
    }

    if (!safeEquals(passcode, expectedPasscode)) {
      return res.status(401).json({ error: "رمز دخول الأستاذ غير صحيح." });
    }

    const session = await createToken({ role: "teacher" }, req);

    return res.status(200).json({
      token: session.token,
      tokenType: "Bearer",
      expiresIn: session.expiresIn,
      role: "teacher",
    });
  } catch (error) {
    console.error("Teacher login failed:", error);

    return res.status(500).json({
      error: "تعذر إتمام تسجيل الدخول حالياً. تحقق من إعدادات الخادم.",
    });
  }
}

/**
 * POST /api/auth/parent
 * Body: { parentPhone, parentPin }
 *
 * The parent JWT is bound to both their phone number and the matching student
 * UUID. Protected routes use the signed phone claim to prevent URL changes
 * from exposing another child's record.
 */
async function parentLogin(req, res) {
  try {
    const parentPhone = normalizeParentPhone(req.body?.parentPhone);
    const parentPin = normalizeParentPin(req.body?.parentPin);

    if (!parentPhone) {
      return res.status(400).json({
        error: "رقم الهاتف يجب أن يتكون من 10 أرقام ويبدأ بـ 05 أو 06 أو 07.",
      });
    }

    if (!parentPin) {
      return res.status(400).json({
        error: "كلمة المرور يجب أن تتكون من 4 أرقام فقط.",
      });
    }

    const students = await prisma.student.findMany({
      where: { parentPhone },
      select: {
        id: true,
        studentName: true,
        parentPhone: true,
        level: true,
        paymentStage: true,
        amountDue: true,
        mathEnrollment: true,
        physicsEnrollment: true,
        liveAccessEnabled: true,
        cardPhotoUrl: true,
        paymentReceiptUrl: true,
        paymentReceiptPending: true,
        paymentReceiptSubmittedAt: true,
        accountActive: true,
        cardReuploadRequested: true,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!students || students.length === 0) {
      return res.status(404).json({ error: "رقم الهاتف غير مسجل." });
    }

    const credential = await prisma.parentCredential.findUnique({
      where: { parentPhone },
      select: { pinHash: true },
    });

    // Parents registered before PIN support choose their four-digit PIN on the
    // first successful post-update login. Existing sessions remain valid.
    if (!credential) {
      await prisma.parentCredential.create({
        data: {
          parentPhone,
          pinHash: await hashParentPin(parentPin),
        },
      });
    } else if (!(await verifyParentPin(parentPin, credential.pinHash))) {
      return res.status(401).json({ error: "كلمة المرور غير صحيحة." });
    }

    // Token now represents the parent session for all their students.
    const session = await createToken({
      role: "parent",
      phone: parentPhone,
    }, req);

    return res.status(200).json({
      token: session.token,
      tokenType: "Bearer",
      expiresIn: session.expiresIn,
      role: "parent",
      parentPhone,
      students: students.map((s) => ({
        id: s.id,
        studentName: s.studentName,
        level: s.level,
        paymentStage: s.paymentStage,
        amountDue: s.amountDue,
        mathEnrollment: s.mathEnrollment,
        physicsEnrollment: s.physicsEnrollment,
        liveAccessEnabled: s.liveAccessEnabled,
        cardPhotoUrl: s.cardPhotoUrl,
        paymentReceiptUrl: s.paymentReceiptUrl,
        paymentReceiptPending: s.paymentReceiptPending,
        paymentReceiptSubmittedAt: s.paymentReceiptSubmittedAt,
        accountActive: s.accountActive,
        cardReuploadRequested: s.cardReuploadRequested,
      })),
    });
  } catch (error) {
    console.error("Parent login failed:", error);

    return res.status(500).json({
      error: "تعذر إتمام تسجيل الدخول حالياً. تحقق من إعدادات الخادم.",
    });
  }
}

function sessionOwnerWhere(req) {
  return req.user?.role === "parent"
    ? { role: "parent", subjectId: req.user.phone }
    : { role: "teacher" };
}

async function listSessions(req, res) {
  const sessions = await prisma.session.findMany({
    where: { ...sessionOwnerWhere(req), revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, role: true, userAgent: true, ipAddress: true, createdAt: true, lastSeenAt: true, expiresAt: true, tokenId: true },
    orderBy: { lastSeenAt: "desc" },
  });
  return res.json({ status: "success", data: sessions.map((session) => ({ ...session, current: session.tokenId === req.user?.sessionId })) });
}

async function revokeSession(req, res) {
  const sessionId = String(req.params.id || "");
  const result = await prisma.session.updateMany({ where: { id: sessionId, ...sessionOwnerWhere(req), revokedAt: null }, data: { revokedAt: new Date() } });
  if (!result.count) return res.status(404).json({ error: "الجلسة غير موجودة أو أُبطلت بالفعل." });
  void prisma.auditLog.create({ data: { actorRole: req.user?.role || "unknown", actorId: req.user?.sessionId || null, action: "SESSION_REVOKED", entityType: "Session", entityId: sessionId, metadata: "{}" } }).catch(() => {});
  return res.json({ status: "success" });
}

async function changeParentPin(req, res) {
  if (req.user?.role !== "parent" || !req.user.phone) return res.status(403).json({ error: "هذه العملية متاحة للولي فقط." });
  const currentPin = normalizeParentPin(req.body?.currentPin);
  const newPin = normalizeParentPin(req.body?.newPin);
  const confirmPin = normalizeParentPin(req.body?.confirmPin);
  if (!currentPin || !newPin || newPin !== confirmPin) return res.status(400).json({ error: "أدخل PIN الحالي وPIN جديدًا مطابقًا للتأكيد." });
  const credential = await prisma.parentCredential.findUnique({ where: { parentPhone: req.user.phone } });
  if (!credential || !(await verifyParentPin(currentPin, credential.pinHash))) return res.status(401).json({ error: "PIN الحالي غير صحيح." });
  await prisma.parentCredential.update({ where: { parentPhone: req.user.phone }, data: { pinHash: await hashParentPin(newPin) } });
  void prisma.session.updateMany({ where: { role: "parent", subjectId: req.user.phone, revokedAt: null, NOT: { tokenId: req.user.sessionId } }, data: { revokedAt: new Date() } });
  void prisma.auditLog.create({ data: { actorRole: "parent", actorId: req.user.sessionId, action: "PARENT_PIN_CHANGED", entityType: "ParentCredential", entityId: req.user.phone, metadata: "{}" } }).catch(() => {});
  return res.json({ status: "success", message: "تم تغيير PIN وإبطال الجلسات الأخرى." });
}

async function logout(req, res) {
  try {
    await revokeSessionByTokenId(req.user?.sessionId);
    return res.status(200).json({ status: "success" });
  } catch (error) {
    console.error("Logout failed:", error);
    return res.status(500).json({ error: "تعذر تسجيل الخروج من الخادم حالياً." });
  }
}

module.exports = {
  teacherLogin,
  parentLogin,
  logout,
  listSessions,
  revokeSession,
  changeParentPin,
};
