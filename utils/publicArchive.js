const prisma = require("../lib/prisma");

async function ensurePublicArchive(roomId, startedAt = new Date()) {
  return prisma.publicRoomArchive.upsert({
    where: { roomId },
    create: { roomId, title: "حصة عامة - أكاديمية التفوق", startedAt },
    update: { startedAt: startedAt || undefined },
  });
}

async function recordPublicAttendance({ roomId, socketId, guestName, event }) {
  const archive = await ensurePublicArchive(roomId);
  if (event === "joined") {
    const existing = await prisma.publicRoomAttendance.findFirst({ where: { archiveId: archive.id, socketId, leftAt: null } });
    if (!existing) await prisma.publicRoomAttendance.create({ data: { archiveId: archive.id, socketId, guestName } });
  } else if (event === "approved") {
    await prisma.publicRoomAttendance.updateMany({ where: { archiveId: archive.id, socketId, leftAt: null }, data: { approvedAt: new Date() } });
  } else if (event === "left") {
    await prisma.publicRoomAttendance.updateMany({ where: { archiveId: archive.id, socketId, leftAt: null }, data: { leftAt: new Date() } });
  }
  const attendeeCount = await prisma.publicRoomAttendance.count({ where: { archiveId: archive.id } });
  await prisma.publicRoomArchive.update({ where: { id: archive.id }, data: { attendeeCount } });
}

async function finishPublicArchive(roomId) {
  const archive = await prisma.publicRoomArchive.findUnique({ where: { roomId } });
  if (!archive) return;
  await prisma.publicRoomAttendance.updateMany({ where: { archiveId: archive.id, leftAt: null }, data: { leftAt: new Date() } });
  await prisma.publicRoomArchive.update({ where: { id: archive.id }, data: { endedAt: new Date() } });
}

async function appendPublicChat(roomId, entry) {
  const archive = await ensurePublicArchive(roomId);
  const current = archive.chatArchiveJson ? JSON.parse(archive.chatArchiveJson) : [];
  current.push(entry);
  await prisma.publicRoomArchive.update({ where: { id: archive.id }, data: { chatArchiveJson: JSON.stringify(current.slice(-200)) } });
}

module.exports = { ensurePublicArchive, recordPublicAttendance, finishPublicArchive, appendPublicChat };
