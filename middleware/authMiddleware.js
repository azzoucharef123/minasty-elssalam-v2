const { verifySessionToken } = require("../utils/sessionAuth");
const prisma = require("../lib/prisma");

/**
 * Extracts and verifies a JWT from Authorization: Bearer <token> and, for
 * session-aware tokens, checks that the server-side session is still active.
 */
async function verifyToken(req, res, next) {
  const authorizationHeader = req.get("authorization") || "";
  const [scheme, token] = authorizationHeader.split(/\s+/);

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return res.status(401).json({
      error: "يلزم إرسال رمز دخول صالح بصيغة Bearer للوصول إلى هذا المورد.",
    });
  }

  try {
    req.user = await verifySessionToken(token);
    return requireParentPinChangeComplete(req, res, next);
  } catch (error) {
    console.warn("JWT verification rejected:", error.name || error.message);
    return res.status(403).json({
      error: "رمز الدخول غير صالح أو منتهي الصلاحية.",
    });
  }
}

async function requireParentPinChangeComplete(req, res, next) {
  if (req.user?.role !== "parent") return next();

  // The forced PIN-change endpoint must remain reachable with the temporary-login session.
  const requestPath = req.originalUrl || req.url || "";
  const isPinChangeRoute = req.method === "PUT" && /\/api\/auth\/parent\/pin(?:\/?(?:\?.*)?)$/.test(requestPath);
  const isLogoutRoute = req.method === "POST" && /\/api\/auth\/logout(?:\/?(?:\?.*)?)$/.test(requestPath);
  if (isPinChangeRoute || isLogoutRoute) return next();

  try {
    const credential = await prisma.parentCredential.findUnique({
      where: { parentPhone: req.user.phone },
      select: { mustChangePin: true, temporaryPinExpiresAt: true },
    });

    if (credential?.mustChangePin) {
      if (credential.temporaryPinExpiresAt && credential.temporaryPinExpiresAt <= new Date()) {
        return res.status(401).json({
          error: "انتهت صلاحية كلمة المرور المؤقتة. اطلب كلمة مرور مؤقتة جديدة من الأستاذ.",
          code: "TEMPORARY_PIN_EXPIRED",
        });
      }

      return res.status(428).json({
        error: "يجب تغيير كلمة المرور المؤقتة قبل استعمال المنصة.",
        code: "PARENT_PIN_CHANGE_REQUIRED",
        redirect: "/force-pin.html",
      });
    }

    return next();
  } catch (error) {
    console.error("Parent temporary PIN guard failed:", error);
    return res.status(503).json({ error: "تعذر التحقق من حالة كلمة المرور مؤقتًا." });
  }
}

function isTeacher(req, res, next) {
  if (req.user?.role !== "teacher") {
    return res.status(403).json({
      error: "هذه العملية متاحة للأستاذ فقط.",
    });
  }
  return next();
}

function isParentAccessingOwnRecord(req, res, next) {
  const requestedPhone = typeof req.params.phone === "string" ? req.params.phone.trim() : "";
  if (req.user?.role !== "parent" || !req.user.phone || req.user.phone !== requestedPhone) {
    return res.status(403).json({
      error: "لا تملك صلاحية الوصول إلى بيانات هذا التلميذ.",
    });
  }
  return next();
}

module.exports = {
  verifyToken,
  isTeacher,
  requireParentPinChangeComplete,
  isParentAccessingOwnRecord,
};
