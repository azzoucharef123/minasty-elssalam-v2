const { PrismaClient } = require("@prisma/client");
const { google } = require("googleapis");
const crypto = require("crypto");
const prisma = new PrismaClient();

const TOKEN_ALGORITHM = "aes-256-gcm";

function getEncryptionKey() {
  const source = String(process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY || process.env.JWT_SECRET || "youtube-token-encryption-fallback");
  return crypto.createHash("sha256").update(source).digest();
}

function decrypt(value) {
  const raw = String(value || "");
  if (!raw) return "";
  const [ivText, tagText, ciphertextText] = raw.split(".");
  if (!ivText || !tagText || !ciphertextText) return "";
  try {
    const decipher = crypto.createDecipheriv(TOKEN_ALGORITHM, getEncryptionKey(), Buffer.from(ivText, "base64url"));
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertextText, "base64url")), decipher.final()]).toString("utf8");
  } catch (e) { return ""; }
}

async function fix() {
  console.log("--- Starting YouTube Embedding Fix ---");
  
  const cred = await prisma.youTubeCredential.findUnique({ where: { id: "singleton" } });
  if (!cred) {
    console.error("No YouTube credentials found.");
    return;
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    access_token: decrypt(cred.accessToken),
    refresh_token: decrypt(cred.refreshToken),
    expiry_date: Number(cred.expiryDate),
  });

  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  // 1. Get recent videos from YouTube
  console.log("Fetching recent videos from YouTube...");
  const channelRes = await youtube.channels.list({ part: "contentDetails", mine: true });
  const uploadsId = channelRes.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  
  if (uploadsId) {
    const playlistRes = await youtube.playlistItems.list({
      part: "contentDetails",
      playlistId: uploadsId,
      maxResults: 10
    });

    const videoIds = (playlistRes.data.items || []).map(item => item.contentDetails.videoId);
    console.log(`Found ${videoIds.length} recent videos. Updating embedding settings...`);

    for (const id of videoIds) {
      try {
        await youtube.videos.update({
          part: "status",
          requestBody: {
            id: id,
            status: {
              embeddable: true,
              privacyStatus: "unlisted"
            }
          }
        });
        console.log(`✅ Video ${id}: Embedding ENABLED.`);
      } catch (err) {
        console.error(`❌ Video ${id}: Failed to update.`, err.message);
      }
    }
  }

  // 2. Update database URLs to the new format
  console.log("\nUpdating database URLs to the new format...");
  
  const scheduledClasses = await prisma.scheduledClass.findMany({
    where: { youtubeVideoId: { not: null } }
  });

  for (const sc of scheduledClasses) {
    const newUrl = `https://www.youtube.com/embed/${sc.youtubeVideoId}?rel=0&modestbranding=1&playsinline=1&fs=1&enablejsapi=1&origin=https://dr.africacold.fr`;
    // We don't have a direct field for embedUrl in ScheduledClass, it's generated on the fly or used from youtubeVideoId
    // But let's check LessonVideo which DOES have driveUrl
  }

  const lessonVideos = await prisma.lessonVideo.findMany({
    where: { driveUrl: { contains: "youtube.com" } }
  });

  for (const lv of lessonVideos) {
    const videoIdMatch = lv.driveUrl.match(/\/embed\/([A-Za-z0-9_-]{11})/);
    if (videoIdMatch) {
      const videoId = videoIdMatch[1];
      const newUrl = `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&playsinline=1&fs=1&enablejsapi=1&origin=https://dr.africacold.fr`;
      await prisma.lessonVideo.update({
        where: { id: lv.id },
        data: { driveUrl: newUrl }
      });
      console.log(`✅ LessonVideo ${lv.id}: URL updated.`);
    }
  }

  console.log("--- Fix Completed ---");
  await prisma.$disconnect();
}

fix().catch(console.error);
