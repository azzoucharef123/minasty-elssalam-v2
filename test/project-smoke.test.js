const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const schema = fs.readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
const routes = fs.readFileSync(path.join(root, "routes/academicRoutes.js"), "utf8");
const studentController = fs.readFileSync(path.join(root, "controllers/studentController.js"), "utf8");
const parentDashboard = fs.readFileSync(path.join(root, "public/js/parent-dashboard.js"), "utf8");

test("selected academic models exist", () => {
  for (const model of ["Session", "AuditLog", "Notification", "NotificationCampaign", "PaymentEvent", "Grade", "Assignment", "Question", "Assessment", "LessonProgress", "ClassParticipation"]) {
    assert.match(schema, new RegExp(`model ${model}\\b`));
  }
});

test("academic API exposes the selected core workflows", () => {
  for (const endpoint of ["/grades", "/assignments", "/progress", "/assessments", "/notifications", "/teacher-announcements", "/analytics", "/audit-logs", "/students/bulk"]) {
    assert.match(routes, new RegExp(endpoint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("pending subscription type belongs to each student", () => {
  const studentBlock = schema.match(/model Student \{([\s\S]*?)\n\}/)?.[1] || "";
  const parentCredentialBlock = schema.match(/model ParentCredential \{([\s\S]*?)\n\}/)?.[1] || "";
  assert.match(studentBlock, /pendingSubscriptionType\s+String\?/);
  assert.doesNotMatch(parentCredentialBlock, /pendingSubscriptionType/);
});

test("free secondary accounts start without a selected subject", () => {
  assert.match(studentBlockFromSchema(schema), /mathEnrollment\s+Boolean\s+@default\(false\)/);
  assert.match(studentBlockFromSchema(schema), /physicsEnrollment\s+Boolean\s+@default\(false\)/);
  assert.match(studentController, /mathEnrollment: isUniversityStudent/);
  assert.match(studentController, /physicsEnrollment: isUniversityStudent/);
  assert.match(parentDashboard, /لم تختَر المواد بعد/);
});

function studentBlockFromSchema(schemaText) {
  return schemaText.match(/model Student \{([\s\S]*?)\n\}/)?.[1] || "";
}

test("production server does not log registration bodies", () => {
  const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
  assert.equal(server.includes("Register request body:"), false);
});
