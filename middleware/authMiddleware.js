const { verifySessionToken } = require("../utils/sessionAuth");

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
    return next();
  } catch (error) {
    console.warn("JWT verification rejected:", error.name || error.message);
    return res.status(403).json({
      error: "رمز الدخول غير صالح أو منتهي الصلاحية.",
    });
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
  isParentAccessingOwnRecord,
};
