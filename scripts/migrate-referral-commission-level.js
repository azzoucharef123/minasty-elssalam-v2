const prisma = require("../lib/prisma");

/**
 * Backfills commissions created before the phone+level rule existed.
 * The closest PAID event before the commission is preferred; a single
 * unambiguous student level is used as a fallback. Ambiguous rows remain
 * LEGACY rather than being assigned to the wrong level or duplicated.
 */
async function migrateReferralCommissionLevels() {
  const legacyRows = await prisma.referralCommission.findMany({
    where: { level: "LEGACY" },
    orderBy: { createdAt: "asc" },
    select: { id: true, referredParentPhone: true, createdAt: true },
  });

  for (const commission of legacyRows) {
    const students = await prisma.student.findMany({
      where: { parentPhone: commission.referredParentPhone },
      orderBy: { createdAt: "asc" },
      select: { id: true, level: true },
    });
    if (!students.length) continue;

    const studentIds = students.map((student) => student.id);
    const closestPaidEvent = await prisma.paymentEvent.findFirst({
      where: {
        studentId: { in: studentIds },
        stage: "PAID",
        createdAt: { lte: commission.createdAt },
      },
      orderBy: { createdAt: "desc" },
      select: { student: { select: { level: true } } },
    });

    const distinctLevels = [...new Set(students.map((student) => String(student.level || "").trim()).filter(Boolean))];
    const level = String(closestPaidEvent?.student?.level || "").trim() || (distinctLevels.length === 1 ? distinctLevels[0] : "");
    if (!level) {
      console.warn(`Referral commission ${commission.id} remains LEGACY: level is ambiguous.`);
      continue;
    }

    try {
      await prisma.referralCommission.update({ where: { id: commission.id }, data: { level } });
    } catch (error) {
      if (error?.code === "P2002") {
        console.warn(`Referral commission ${commission.id} was not moved because ${commission.referredParentPhone}/${level} already exists.`);
        continue;
      }
      throw error;
    }
  }
}

if (require.main === module) {
  migrateReferralCommissionLevels()
    .catch((error) => {
      console.error("Referral commission level migration failed:", error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

module.exports = { migrateReferralCommissionLevels };
