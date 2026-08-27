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

test("teacher classroom control requires an authenticated teacher session", () => {
  const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
  const teacherLive = fs.readFileSync(path.join(root, "public/js/teacher-live-v2.js"), "utf8");
  assert.match(server, /async function requireTeacherSocketSession\s*\(/);
  const startHandler = server.match(/socket\.on\("teacher_start_room"[\s\S]*?socket\.on\("student_join_room"/)?.[0] || "";
  const endHandler = server.match(/socket\.on\("teacher_end_class"[\s\S]*?socket\.on\("disconnect"/)?.[0] || "";
  assert.match(startHandler, /requireTeacherSocketSession\(socket, "teacher_start_room"/);
  assert.match(endHandler, /requireTeacherSocketSession\(socket, "teacher_end_class"/);
  assert.match(teacherLive, /auth:\s*\{\s*token:\s*teacherSocketToken\s*\}/);
});

test("teacher question image modal supports bounded wheel zoom", () => {
  const teacherLive = fs.readFileSync(path.join(root, "public/js/teacher-live-v2.js"), "utf8");
  const teacherHtml = fs.readFileSync(path.join(root, "public/teacher-live.html"), "utf8");
  assert.match(teacherLive, /QUESTION_IMAGE_MAX_ZOOM\s*=\s*4/);
  assert.match(teacherLive, /handleQuestionImageWheel/);
  assert.match(teacherLive, /startQuestionImageDrag/);
  assert.match(teacherLive, /moveQuestionImageDrag/);
  assert.match(teacherLive, /addEventListener\("pointerdown", startQuestionImageDrag\)/);
  assert.match(teacherLive, /addEventListener\("pointermove", moveQuestionImageDrag\)/);
  assert.match(teacherLive, /addEventListener\("wheel", handleQuestionImageWheel, \{ passive: false \}\)/);
  assert.match(teacherLive, /resetQuestionImageZoom\(\)/);
  assert.match(teacherHtml, /id="question-image-modal-viewport"/);
  assert.match(teacherHtml, /question-image-zoom-label/);
});

test("teacher live chat supports pasted image messages safely", () => {
  const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
  const teacherLive = fs.readFileSync(path.join(root, "public/js/teacher-live-v2.js"), "utf8");
  const teacherHtml = fs.readFileSync(path.join(root, "public/teacher-live.html"), "utf8");
  const studentLive = fs.readFileSync(path.join(root, "public/js/student-live.js"), "utf8");
  assert.match(server, /normalizeTeacherChatImageData\s*\(/);
  assert.ok(server.includes("image\\/(?:jpeg|png|webp)"));
  assert.match(server, /teacher_message_received/);
  assert.match(teacherLive, /addEventListener\("paste"/);
  assert.match(teacherLive, /chatImagePreview/);
  assert.match(teacherLive, /imageData/);
  assert.match(teacherHtml, /id="chat-image-preview"/);
  assert.match(teacherHtml, /id="chat-image-remove-btn"/);
  assert.match(studentLive, /const imageData = data\?\.imageData/);
  assert.match(studentLive, /imageUrl: imageData/);
});

test("teacher can edit student contact data through a protected UI action", () => {
  const routes = fs.readFileSync(path.join(root, "routes/studentRoutes.js"), "utf8");
  const controller = fs.readFileSync(path.join(root, "controllers/studentController.js"), "utf8");
  const dashboard = fs.readFileSync(path.join(root, "public/js/teacher-dashboard.js"), "utf8");
  const html = fs.readFileSync(path.join(root, "public/teacher-dashboard.html"), "utf8");
  assert.match(routes, /router\.put\("\/:id\/contact", verifyToken, isTeacher, updateStudentContact\)/);
  assert.match(controller, /async function updateStudentContact\s*\(/);
  assert.match(controller, /tx\.student\.updateMany\(/);
  assert.match(dashboard, /تعديل الاسم ورقم الهاتف/);
  assert.match(dashboard, /\/api\/students\/\$\{encodeURIComponent\(studentId\)\}\/contact/);
  assert.match(html, /id="student-contact-modal"/);
});
