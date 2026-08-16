const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function check() {
  console.log("--- Lesson Videos ---");
  const lessons = await prisma.lessonVideo.findMany({
    select: {
      id: true,
      title: true,
      level: true,
      repositoryType: true
    }
  });
  console.table(lessons);

  await prisma.$disconnect();
}

check().catch(console.error);
