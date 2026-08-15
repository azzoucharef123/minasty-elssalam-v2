const prisma = require("../lib/prisma");

function safeJson(value) {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "{}";
  }
}

function auditActor(req, fallbackRole = "system") {
  return {
    actorRole: String(req?.user?.role || fallbackRole),
    actorId: req?.user?.sessionId ? String(req.user.sessionId) : null,
    ipAddress: typeof req?.ip === "string" ? req.ip.slice(0, 100) : null,
    userAgent: typeof req?.get === "function" ? req.get("user-agent")?.slice(0, 1000) : null,
  };
}

function logAudit(req, { action, entityType, entityId = null, studentId = null, metadata = {}, actorRole } = {}) {
  const actor = auditActor(req, actorRole);
  return prisma.auditLog.create({
    data: {
      ...actor,
      action: String(action || "UNKNOWN").slice(0, 120),
      entityType: String(entityType || "UNKNOWN").slice(0, 120),
      entityId: entityId ? String(entityId).slice(0, 160) : null,
      studentId: studentId || null,
      metadata: safeJson(metadata),
    },
  }).catch((error) => {
    console.error("Audit log write failed:", error.message);
    return null;
  });
}

module.exports = { logAudit };
