const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function check() {
  console.log("--- Student Levels ---");
  const studentLevels = await prisma.student.groupBy({
    by: ['level'],
    _count: { level: true }
  });
  console.table(studentLevels);

  console.log("\n--- Lesson Video Levels ---");
  const lessonLevels = await prisma.lessonVideo.groupBy({
    by: ['level'],
    _count: { level: true }
  });
  console.table(lessonLevels);

  console.log("\n--- Scheduled Class Levels ---");
  const scheduledLevels = await prisma.scheduledClass.groupBy({
    by: ['level'],
    _count: { level: true }
  });
  console.table(scheduledLevels);

  await prisma.$disconnect();
}

check().catch(console.error);
