const prisma = require("../lib/prisma");

const modelNames = [
  "student", "message", "scheduledClass", "teacherAbsence", "parentCredential", "liveQuestionImage", "attendance", "material", "lessonVideo", "session", "auditLog", "notification", "paymentEvent", "lessonProgress", "assignment", "assignmentSubmission", "question", "assessment", "assessmentQuestion", "assessmentAttempt", "learningPathItem", "studentBadge", "grade", "publicRoomArchive", "publicRoomAttendance", "analyticsEvent",
];

function serializeValue(value, includeDocuments) {
  if (Buffer.isBuffer(value)) return includeDocuments ? value.toString("base64") : "[document omitted]";
  if (value instanceof Uint8Array) return includeDocuments ? Buffer.from(value).toString("base64") : "[document omitted]";
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => serializeValue(item, includeDocuments));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serializeValue(item, includeDocuments)]));
  return value;
}

async function createDatabaseSnapshot({ includeDocuments = false } = {}) {
  const snapshot = { generatedAt: new Date().toISOString(), includeDocuments, tables: {} };
  for (const modelName of modelNames) {
    if (!prisma[modelName]) continue;
    const rows = await prisma[modelName].findMany();
    snapshot.tables[modelName] = rows.map((row) => serializeValue(row, includeDocuments));
  }
  return snapshot;
}

module.exports = { createDatabaseSnapshot };
