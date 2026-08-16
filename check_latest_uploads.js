const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function check() {
  console.log("--- Checking Latest Scheduled Classes ---");
  const latestSessions = await prisma.scheduledClass.findMany({
    orderBy: { scheduledAt: 'desc' },
    take: 5
  });
  
  console.table(latestSessions.map(s => ({
    id: s.id,
    level: s.level,
    subject: s.subject,
    scheduledAt: s.scheduledAt,
    status: s.status,
    youtubeVideoId: s.youtubeVideoId || 'NONE',
    driveLink: s.driveLink ? 'YES' : 'NO'
  })));

  console.log("\n--- Checking YouTube Credentials ---");
  const creds = await prisma.youTubeCredential.findUnique({ where: { id: "singleton" } });
  console.log("Credentials exist:", !!creds);
  if (creds) {
    console.log("Expiry Date:", new Date(Number(creds.expiryDate)));
  }

  console.log("\n--- Checking YouTube Videos in Channel ---");
  try {
    const { listRecentVideos } = require("./services/youtubeService");
    const videos = await listRecentVideos(5);
    console.table(videos.map(v => ({
      id: v.id,
      title: v.title,
      privacy: v.privacyStatus,
      published: v.publishedAt
    })));
  } catch (err) {
    console.error("YouTube List Error:", err.message);
  }

  await prisma.$disconnect();
}

check().catch(console.error);
