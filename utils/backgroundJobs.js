const prisma = require("../lib/prisma");

let lastWeeklyReportKey = "";

async function sendOptionalPush(role, recipientId, payload) {
  try {
    const { sendPushToRecipient } = require("./push");
    await sendPushToRecipient(role, recipientId, payload);
  } catch {
    // Push is optional; a missing VAPID configuration must not stop jobs.
  }
}

function weekKey(date = new Date()) {
  const first = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - first) / 86400000) + first.getUTCDay() + 1) / 7);
  return `${date.getUTCFullYear()}-${week}`;
}

async function sendClassReminders(now = new Date()) {
  const from = new Date(now.getTime() + 55 * 60 * 1000);
  const to = new Date(now.getTime() + 65 * 60 * 1000);
  const classes = await prisma.scheduledClass.findMany({ where: { scheduledAt: { gte: from, lte: to } }, take: 100 });
  for (const scheduledClass of classes) {
    const students = await prisma.student.findMany({ where: { level: scheduledClass.level }, select: { id: true, parentPhone: true } });
    if (!students.length) continue;
    const reminderBody = `تبدأ حصة ${scheduledClass.subject} خلال ساعة تقريبًا.`;
    await prisma.notification.createMany({
      data: students.map((student) => ({
        studentId: student.id,
        recipientRole: "parent",
        recipientId: student.parentPhone,
        type: "CLASS_REMINDER",
        title: "تذكير بالحصة",
        body: reminderBody,
        link: "./parent-dashboard.html",
        dedupeKey: `CLASS_REMINDER:${scheduledClass.id}:${student.id}`,
      })),
      skipDuplicates: true,
    });
    await Promise.allSettled(students.map((student) => sendOptionalPush("parent", student.parentPhone, {
      title: "تذكير بالحصة",
      body: reminderBody,
      link: "./parent-dashboard.html",
    })));
  }
}

async function sendWeeklyReports(now = new Date()) {
  const key = weekKey(now);
  if (key === lastWeeklyReportKey || now.getUTCDay() !== 0 || now.getUTCHours() !== 18) return;
  lastWeeklyReportKey = key;
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const students = await prisma.student.findMany({ select: { id: true, parentPhone: true, studentName: true } });
  for (const student of students) {
    const [attendance, grades, submissions, completed] = await Promise.all([
      prisma.attendance.count({ where: { studentId: student.id, joinedAt: { gte: since } } }),
      prisma.grade.findMany({ where: { studentId: student.id, gradedAt: { gte: since } }, select: { score: true, maxScore: true } }),
      prisma.assignmentSubmission.count({ where: { studentId: student.id, submittedAt: { gte: since } } }),
      prisma.lessonProgress.count({ where: { studentId: student.id, completed: true, updatedAt: { gte: since } } }),
    ]);
    const average = grades.length ? Math.round(grades.reduce((sum, item) => sum + (item.score / item.maxScore) * 100, 0) / grades.length) : null;
    await prisma.notification.create({
      data: {
        studentId: student.id,
        recipientRole: "parent",
        recipientId: student.parentPhone,
        type: "WEEKLY_REPORT",
        title: `تقرير أسبوعي: ${student.studentName}`,
        body: `الحضور: ${attendance}، الواجبات: ${submissions}، الدروس المكتملة: ${completed}، متوسط العلامات: ${average == null ? "لا توجد علامات جديدة" : `${average}%`}.`,
        link: "./academic-center.html",
        dedupeKey: `WEEKLY_REPORT:${student.id}:${key}`,
      },
    }).catch((error) => { if (error?.code !== "P2002") throw error; });
  }
}

async function cleanExpiredSessions() {
  await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}

async function processTeacherAnnouncements() {
  try {
    const { processScheduledTeacherAnnouncements } = require("../controllers/academicController");
    await processScheduledTeacherAnnouncements();
  } catch (error) {
    console.error("Teacher announcements background job failed:", error.message);
  }
}

async function reconcileSofizPayPayments() {
  try {
    const { reconcilePendingSofizPayPayments } = require("../controllers/paymentController");
    await reconcilePendingSofizPayPayments();
  } catch (error) {
    console.error("SofizPay background reconciliation failed:", error.message);
  }
}

function startBackgroundJobs() {
  const run = () => Promise.allSettled([
    sendClassReminders(),
    sendWeeklyReports(),
    cleanExpiredSessions(),
    reconcileSofizPayPayments(),
    processTeacherAnnouncements(),
  ]).catch(() => {});
  void run();
  const timer = setInterval(run, 60 * 1000);
  timer.unref();
  return () => clearInterval(timer);
}

module.exports = { sendClassReminders, sendWeeklyReports, cleanExpiredSessions, reconcileSofizPayPayments, processTeacherAnnouncements, startBackgroundJobs };
