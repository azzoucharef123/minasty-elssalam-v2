"use strict";

const prisma = require("../lib/prisma");

// These are the platform's canonical database values. The UI displays the
// full Arabic labels: السنة الأولى متوسط ... السنة الرابعة متوسط.
const RULES = [
  { level: "السنة الأولى", subject: "PHYSICS", weekday: 0, hour: 18 },
  { level: "السنة الأولى", subject: "MATH", weekday: 4, hour: 18 },
  { level: "السنة الثانية", subject: "PHYSICS", weekday: 1, hour: 18 },
  { level: "السنة الثانية", subject: "MATH", weekday: 5, hour: 18 },
  { level: "السنة الثالثة", subject: "PHYSICS", weekday: 2, hour: 18 },
  { level: "السنة الثالثة", subject: "MATH", weekday: 6, hour: 10 },
  { level: "السنة الرابعة", subject: "PHYSICS", weekday: 3, hour: 18 },
  { level: "السنة الرابعة", subject: "MATH", weekday: 6, hour: 18 },
];

const START_DATE = new Date(Date.UTC(2026, 8, 1));
const END_DATE = new Date(Date.UTC(2026, 10, 30));

function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthName(monthIndex) {
  return { 8: "سبتمبر", 9: "أكتوبر", 10: "نوفمبر" }[monthIndex] || "";
}

function classDateForDay(day, hour) {
  const date = new Date(day);
  // Algeria is UTC+1 during September-November 2026.
  date.setUTCHours(hour - 1, 0, 0, 0);
  return date;
}

function buildExpectedSessions() {
  const sessions = [];
  for (let day = new Date(START_DATE); day <= END_DATE; day.setUTCDate(day.getUTCDate() + 1)) {
    const weekday = day.getUTCDay();
    for (const rule of RULES) {
      if (rule.weekday !== weekday) continue;
      const scheduledAt = classDateForDay(day, rule.hour);
      sessions.push({
        level: rule.level,
        subject: rule.subject,
        scheduledAt,
        monthKey: monthKey(scheduledAt),
        monthName: monthName(scheduledAt.getUTCMonth()),
        status: "PENDING",
        driveLink: null,
        notes: null,
      });
    }
  }
  return sessions;
}

async function backfillMonthKeys() {
  const existing = await prisma.scheduledClass.findMany({
    where: { monthKey: "" },
    select: { id: true, scheduledAt: true },
  });
  for (const item of existing) {
    await prisma.scheduledClass.update({
      where: { id: item.id },
      data: { monthKey: monthKey(item.scheduledAt) },
    });
  }
  return existing.length;
}

async function seedClassRegistry() {
  const backfilled = await backfillMonthKeys();
  const expected = buildExpectedSessions();
  let created = 0;
  let skipped = 0;

  for (const session of expected) {
    const duplicate = await prisma.scheduledClass.findFirst({
      where: {
        level: session.level,
        subject: session.subject,
        scheduledAt: session.scheduledAt,
      },
      select: { id: true },
    });

    if (duplicate) {
      skipped += 1;
      continue;
    }

    await prisma.scheduledClass.create({
      data: {
        level: session.level,
        subject: session.subject,
        scheduledAt: session.scheduledAt,
        monthKey: session.monthKey,
        status: session.status,
        driveLink: session.driveLink,
        notes: session.notes,
      },
    });
    created += 1;
  }

  return { expected: expected.length, created, skipped, backfilled };
}

if (require.main === module) {
  if (process.argv.includes("--dry-run")) {
    const expected = buildExpectedSessions();
    console.log(JSON.stringify({ expected: expected.length, first: expected[0], last: expected.at(-1) }, null, 2));
  } else {
    seedClassRegistry()
      .then((result) => {
        console.log(JSON.stringify(result, null, 2));
      })
      .catch((error) => {
        console.error(error);
        process.exitCode = 1;
      })
      .finally(async () => {
        await prisma.$disconnect();
      });
  }
}

module.exports = { buildExpectedSessions, seedClassRegistry };
