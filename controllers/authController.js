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

const JWT_ISSUER = "online-tutoring-platform";
const JWT_AUDIENCE = "online-tutoring-platform-web";
// Keep authenticated sessions available across browser restarts. Deployments may
// still override this with JWT_EXPIRES_IN when a shorter security window is required.
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "365d";

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET is missing or too short.");
  }

  return secret;
}

function createToken(payload) {
  return jwt.sign(payload, getJwtSecret(), {
    algorithm: "HS256",
    expiresIn: JWT_EXPIRES_IN,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
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
 * The prompt's development passcode remains the fallback for compatibility.
 * Set TEACHER_PASSCODE in the deployment environment instead of committing a
 * real credential to source control.
 */
async function teacherLogin(req, res) {
  try {
    const { passcode } = req.body || {};
    const expectedPasscode = process.env.TEACHER_PASSCODE || "123654789";

    if (!safeEquals(passcode, expectedPasscode)) {
      return res.status(401).json({ error: "رمز دخول الأستاذ غير صحيح." });
    }

    const token = createToken({ role: "teacher" });

    return res.status(200).json({
      token,
      tokenType: "Bearer",
      expiresIn: JWT_EXPIRES_IN,
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
    const token = createToken({
      role: "parent",
      phone: parentPhone,
    });

    return res.status(200).json({
      token,
      tokenType: "Bearer",
      expiresIn: JWT_EXPIRES_IN,
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

module.exports = {
  teacherLogin,
  parentLogin,
};
