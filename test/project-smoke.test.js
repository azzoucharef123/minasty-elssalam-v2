const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const schema = fs.readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
const routes = fs.readFileSync(path.join(root, "routes/academicRoutes.js"), "utf8");

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

test("production server does not log registration bodies", () => {
  const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
  assert.equal(server.includes("Register request body:"), false);
});
