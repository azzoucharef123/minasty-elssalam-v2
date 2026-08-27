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

test("teacher live streaming targets adaptive quality and 1080p60 recording", () => {
  const teacherLive = fs.readFileSync(path.join(root, "public/js/teacher-live-v2.js"), "utf8");
  assert.match(teacherLive, /frameRate:\s*\{\s*ideal:\s*60,\s*max:\s*60\s*\}/);
  assert.match(teacherLive, /QUESTION_IMAGE_MAX_ZOOM\s*=\s*4/);
  assert.match(teacherLive, /getAdaptiveVideoQualityProfile\s*\(/);
  assert.match(teacherLive, /scaleResolutionDownBy:\s*2\.5/);
  assert.match(teacherLive, /maxBitrate:\s*6_000_000/);
  assert.match(teacherLive, /videoBitsPerSecond:\s*12_000_000/);
  assert.match(teacherLive, /maxFramerate:\s*60/);
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

test("teacher class registry selects term before month and subject", () => {
  const teacherHtml = fs.readFileSync(path.join(root, "public/teacher-dashboard.html"), "utf8");
  const registry = fs.readFileSync(path.join(root, "public/js/class-registry-teacher.js"), "utf8");
  const filters = teacherHtml.slice(teacherHtml.indexOf("class-registry-filters"), teacherHtml.indexOf("class-registry-list"));
  const termIndex = filters.indexOf("id=\"class-registry-term\"");
  const monthIndex = filters.indexOf("id=\"class-registry-month\"");
  const subjectIndex = filters.indexOf("id=\"class-registry-subject\"");
  assert.ok(termIndex >= 0 && termIndex < monthIndex && monthIndex < subjectIndex);
  assert.match(filters, /id="class-registry-month" disabled/);
  assert.match(filters, /id="class-registry-subject" disabled/);
  assert.match(registry, /const TERMS = Object\.freeze\(/);
  assert.match(registry, /selectedTerm = term\.value/);
  assert.match(registry, /selectedMonth = month\.value/);
  assert.match(registry, /!selectedTerm/);
  assert.match(registry, /!selectedMonth/);
});

test("teacher dashboard keeps level selection above an internal scrollable section nav", () => {
  const teacherHtml = fs.readFileSync(path.join(root, "public/teacher-dashboard.html"), "utf8");
  const appCss = fs.readFileSync(path.join(root, "public/css/app.css"), "utf8");
  const levelIndex = teacherHtml.indexOf("id=\"teacher-level-strip\"");
  const frameIndex = teacherHtml.indexOf("id=\"teacher-main-frame\"");
  assert.ok(levelIndex >= 0 && levelIndex < frameIndex);
  assert.match(teacherHtml, /class="teacher-main-frame" id="teacher-main-frame"/);
  assert.match(teacherHtml, /class="teacher-tab-content"/);
  assert.doesNotMatch(teacherHtml, /class="teacher-sidebar"/);
  assert.doesNotMatch(teacherHtml, /class="teacher-profile-card"/);
  for (const tab of ["students", "notifications", "schedule", "registry", "assignments", "lessons", "quiz", "electronic-payments", "manual-payments", "referral-withdrawals", "forgot-pin-requests"]) {
    assert.match(teacherHtml, new RegExp(`data-dashboard-tab="${tab}"`));
  }
  assert.match(appCss, /teacher-main-frame[\s\S]*grid-template-columns/);
  assert.match(appCss, /teacher-main-frame[\s\S]*direction: rtl/);
  assert.match(appCss, /teacher-tabs-nav[\s\S]*overflow-y: auto/);
  assert.match(appCss, /teacher-dashboard-shell \{\s*margin-right: 0;/);
});

test("telegram admin alerts are dormant without credentials and cover key parent events", () => {
  const service = fs.readFileSync(path.join(root, "services/telegramService.js"), "utf8");
  const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
  const academicController = fs.readFileSync(path.join(root, "controllers/academicController.js"), "utf8");
  const studentController = fs.readFileSync(path.join(root, "controllers/studentController.js"), "utf8");
  const messageController = fs.readFileSync(path.join(root, "controllers/messageController.js"), "utf8");
  const paymentController = fs.readFileSync(path.join(root, "controllers/paymentController.js"), "utf8");
  const referralController = fs.readFileSync(path.join(root, "controllers/referralController.js"), "utf8");
  const envExample = fs.readFileSync(path.join(root, ".env.example"), "utf8");
  assert.match(service, /TELEGRAM_BOT_TOKEN/);
  assert.match(service, /TELEGRAM_ADMIN_CHAT_ID/);
  assert.match(service, /TELEGRAM_NOT_CONFIGURED/);
  assert.match(server, /sendTelegramNotification/);
  assert.match(academicController, /getTeacherTelegramStatus/);
  assert.match(academicController, /notifyTelegram\(req/);
  assert.match(studentController, /notifyTelegram\(req/);
  assert.match(messageController, /notifyTelegram\(req/);
  assert.match(paymentController, /sendTelegramNotification\(/);
  assert.match(referralController, /notifyTelegram\(req/);
  assert.match(envExample, /TELEGRAM_BOT_TOKEN=/);
  assert.match(envExample, /TELEGRAM_ADMIN_CHAT_ID=/);
});

test("teacher notifications include a dormant SMS channel safely", () => {
  const schema = fs.readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
  const controller = fs.readFileSync(path.join(root, "controllers/academicController.js"), "utf8");
  const routes = fs.readFileSync(path.join(root, "routes/academicRoutes.js"), "utf8");
  const service = fs.readFileSync(path.join(root, "services/smsService.js"), "utf8");
  const dashboard = fs.readFileSync(path.join(root, "public/js/teacher-dashboard.js"), "utf8");
  const html = fs.readFileSync(path.join(root, "public/teacher-dashboard.html"), "utf8");
  assert.match(schema, /deliveryChannel\s+String\s+@default\("BROWSER"\)/);
  assert.match(schema, /smsSentCount\s+Int\s+@default\(0\)/);
  assert.match(controller, /ANNOUNCEMENT_CHANNELS/);
  assert.match(controller, /SMS_NOT_CONFIGURED/);
  assert.match(controller, /sendSms\(/);
  assert.match(routes, /teacher-announcements\/sms-status/);
  assert.match(service, /function getSmsStatus\s*\(/);
  assert.match(service, /SMS_API_KEY/);
  assert.match(dashboard, /notificationDeliveryChannel\s*\(/);
  assert.match(dashboard, /teacher-announcements\/sms-status/);
  assert.match(dashboard, /deliveryChannel: notificationDeliveryChannel\(\)/);
  assert.match(html, /name="notification-channel"[^>]+value="SMS"/);
  assert.match(html, /id="teacher-notification-channel-status"/);
});

test("teacher live chat supports pasted image messages safely", () => {
  const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
  const teacherLive = fs.readFileSync(path.join(root, "public/js/teacher-live-v2.js"), "utf8");
  const teacherHtml = fs.readFileSync(path.join(root, "public/teacher-live.html"), "utf8");
  const studentLive = fs.readFileSync(path.join(root, "public/js/student-live.js"), "utf8");
  assert.match(server, /normalizeTeacherChatImageData\s*\(/);
  assert.ok(server.includes("image\\/(?:jpeg|png|webp)"));
  assert.match(server, /teacher_message_received/);
  assert.match(server, /student_message_received[\s\S]*studentId: socket\.data\.studentId[\s\S]*socketId: socket\.id/);
  assert.match(teacherLive, /addEventListener\("paste"/);
  assert.match(teacherLive, /chatImagePreview/);
  assert.match(teacherLive, /imageData/);
  assert.match(teacherHtml, /id="chat-image-preview"/);
  assert.match(teacherHtml, /id="chat-image-remove-btn"/);
  assert.match(studentLive, /const imageData = data\?\.imageData/);
  assert.match(studentLive, /imageUrl: imageData/);
  assert.match(teacherLive, /openStudentChatMicMenu/);
  assert.match(teacherLive, /student-chat-mic-menu/);
  assert.match(teacherLive, /فتح الـ microphone/);
  assert.match(teacherLive, /غلق الـ microphone/);
  assert.match(teacherLive, /reorderOpenMicrophoneAttendees/);
  assert.match(teacherLive, /classList\.contains\("is-mic-open"\)/);
  assert.match(teacherLive, /secondOpen - firstOpen/);
  assert.match(teacherLive, /classList\.toggle\("is-mic-open", Boolean\(enabled\)\)/);
  assert.match(teacherHtml, /id="chat-box"/);
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
