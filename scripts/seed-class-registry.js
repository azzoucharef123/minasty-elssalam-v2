"use strict";

const prisma = require("../lib/prisma");

// The database keeps the platform's canonical values (the UI displays the
// full Arabic level labels such as السنة الأولى متوسط).
const EXPLICIT_SESSIONS = [
  {
    level: "السنة الأولى",
    subject: "PHYSICS",
    hour: 18,
    dates: [
      "2026-09-06", "2026-09-13", "2026-09-20", "2026-09-27",
      "2026-10-04", "2026-10-11", "2026-10-18", "2026-10-25",
      "2026-11-01", "2026-11-08", "2026-11-15", "2026-11-22", "2026-11-29",
    ],
  },
  {
    level: "السنة الأولى",
    subject: "MATH",
    hour: 18,
    dates: [
      "2026-09-03", "2026-09-10", "2026-09-17", "2026-09-24",
      "2026-10-01", "2026-10-08", "2026-10-15", "2026-10-22", "2026-10-29",
      "2026-11-05", "2026-11-12", "2026-11-19", "2026-11-26",
    ],
  },
  {
    level: "السنة الثانية",
    subject: "PHYSICS",
    hour: 18,
    dates: [
      "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28",
      "2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26",
      "2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23", "2026-11-30",
    ],
  },
  {
    level: "السنة الثانية",
    subject: "MATH",
    hour: 18,
    dates: [
      "2026-09-04", "2026-09-11", "2026-09-18", "2026-09-25",
      "2026-10-02", "2026-10-09", "2026-10-16", "2026-10-23", "2026-10-30",
      "2026-11-06", "2026-11-13", "2026-11-20", "2026-11-27",
    ],
  },
  {
    level: "السنة الثالثة",
    subject: "PHYSICS",
    hour: 18,
    dates: [
      "2026-09-01", "2026-09-08", "2026-09-15", "2026-09-22", "2026-09-29",
      "2026-10-06", "2026-10-13", "2026-10-20", "2026-10-27",
      "2026-11-03", "2026-11-10", "2026-11-17", "2026-11-24",
    ],
  },
  {
    level: "السنة الثالثة",
    subject: "MATH",
    hour: 10,
    dates: [
      "2026-09-05", "2026-09-12", "2026-09-19", "2026-09-26",
      "2026-10-03", "2026-10-10", "2026-10-17", "2026-10-24", "2026-10-31",
      "2026-11-07", "2026-11-14", "2026-11-21", "2026-11-28",
    ],
  },
  {
    level: "السنة الرابعة",
    subject: "PHYSICS",
    hour: 18,
    dates: [
      "2026-09-02", "2026-09-09", "2026-09-16", "2026-09-23", "2026-09-30",
      "2026-10-07", "2026-10-14", "2026-10-21", "2026-10-28",
      "2026-11-04", "2026-11-11", "2026-11-18", "2026-11-25",
    ],
  },
  {
    level: "السنة الرابعة",
    subject: "MATH",
    hour: 18,
    dates: [
      "2026-09-05", "2026-09-12", "2026-09-19", "2026-09-26",
      "2026-10-03", "2026-10-10", "2026-10-17", "2026-10-24", "2026-10-31",
      "2026-11-07", "2026-11-14", "2026-11-21", "2026-11-28",
    ],
  },
];

const MONTH_NAMES = Object.freeze({ "09": "سبتمبر", "10": "أكتوبر", "11": "نوفمبر" });

function toAlgeriaDate(dateString, hour) {
  // Algeria is UTC+1 for the requested months. The stored UTC value therefore
  // represents the exact local class time in Africa/Algiers.
  return new Date(`${dateString}T${String(hour).padStart(2, "0")}:00:00+01:00`);
}

function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthNameFromDateString(dateString) {
  return MONTH_NAMES[dateString.slice(5, 7)] || "";
}

function buildExpectedSessions() {
  return EXPLICIT_SESSIONS.flatMap((group) => group.dates.map((dateString) => {
    const scheduledAt = toAlgeriaDate(dateString, group.hour);
    return {
      level: group.level,
      subject: group.subject,
      scheduledAt,
      monthKey: monthKey(scheduledAt),
      monthName: monthNameFromDateString(dateString),
      status: "PENDING",
      driveLink: null,
      notes: null,
    };
  }));
}

async function backfillMonthKeys() {
  const existing = await prisma.scheduledClass.findMany({
    where: { OR: [{ monthKey: "" }, { monthName: "" }] },
    select: { id: true, scheduledAt: true },
  });
  for (const item of existing) {
    await prisma.scheduledClass.update({
      where: { id: item.id },
      data: { monthKey: monthKey(item.scheduledAt), monthName: monthNameFromDateString(item.scheduledAt.toISOString().slice(0, 10)) },
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
        monthName: session.monthName,
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
    console.log(JSON.stringify({
      expected: expected.length,
      byLevel: expected.reduce((counts, item) => {
        counts[item.level] = (counts[item.level] || 0) + 1;
        return counts;
      }, {}),
      first: expected[0],
      last: expected.at(-1),
    }, null, 2));
  } else {
    seedClassRegistry()
      .then((result) => console.log(JSON.stringify(result, null, 2)))
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
