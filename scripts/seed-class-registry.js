"use strict";

const prisma = require("../lib/prisma");

// The database keeps the platform's canonical values (the UI displays the
// full Arabic level labels such as السنة الأولى متوسط).
const EXPLICIT_SESSIONS = [
  {
    level: "السنة الأولى", subject: "PHYSICS", hour: 18,
    dates: ["2026-09-06", "2026-09-13", "2026-09-20", "2026-09-27", "2026-10-04", "2026-10-11", "2026-10-18", "2026-10-25", "2026-11-01", "2026-11-08", "2026-11-15", "2026-11-22", "2027-01-03", "2027-01-10", "2027-01-17", "2027-01-24", "2027-02-07", "2027-02-14", "2027-02-21", "2027-02-28", "2027-04-04", "2027-04-11", "2027-04-18", "2027-04-25", "2027-05-02", "2027-05-09", "2027-05-16", "2027-05-23"],
  },
  {
    level: "السنة الأولى", subject: "MATH", hour: 18,
    dates: ["2026-09-03", "2026-09-10", "2026-09-17", "2026-09-24", "2026-10-01", "2026-10-08", "2026-10-15", "2026-10-22", "2026-11-05", "2026-11-12", "2026-11-19", "2026-11-26", "2027-01-07", "2027-01-14", "2027-01-21", "2027-01-28", "2027-02-04", "2027-02-11", "2027-02-18", "2027-02-25", "2027-04-01", "2027-04-08", "2027-04-15", "2027-04-22", "2027-05-06", "2027-05-13", "2027-05-20", "2027-05-27"],
  },
  {
    level: "السنة الثانية", subject: "PHYSICS", hour: 18,
    dates: ["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23", "2027-01-04", "2027-01-11", "2027-01-18", "2027-01-25", "2027-02-01", "2027-02-08", "2027-02-15", "2027-02-22", "2027-04-05", "2027-04-12", "2027-04-19", "2027-04-26", "2027-05-03", "2027-05-10", "2027-05-17", "2027-05-24"],
  },
  {
    level: "السنة الثانية", subject: "MATH", hour: 18,
    dates: ["2026-09-04", "2026-09-11", "2026-09-18", "2026-09-25", "2026-10-02", "2026-10-09", "2026-10-16", "2026-10-23", "2026-11-06", "2026-11-13", "2026-11-20", "2026-11-27", "2027-01-01", "2027-01-08", "2027-01-15", "2027-01-22", "2027-02-05", "2027-02-12", "2027-02-19", "2027-02-26", "2027-04-02", "2027-04-09", "2027-04-16", "2027-04-23", "2027-05-07", "2027-05-14", "2027-05-21", "2027-05-28"],
  },
  {
    level: "السنة الثالثة", subject: "PHYSICS", hour: 18,
    dates: ["2026-09-01", "2026-09-08", "2026-09-15", "2026-09-22", "2026-10-06", "2026-10-13", "2026-10-20", "2026-10-27", "2026-11-03", "2026-11-10", "2026-11-17", "2026-11-24", "2027-01-05", "2027-01-12", "2027-01-19", "2027-01-26", "2027-02-02", "2027-02-09", "2027-02-16", "2027-02-23", "2027-04-06", "2027-04-13", "2027-04-20", "2027-04-27", "2027-05-04", "2027-05-11", "2027-05-18", "2027-05-25"],
  },
  {
    level: "السنة الثالثة", subject: "MATH", hour: 10,
    dates: ["2026-09-05", "2026-09-12", "2026-09-19", "2026-09-26", "2026-10-03", "2026-10-10", "2026-10-17", "2026-10-24", "2026-11-07", "2026-11-14", "2026-11-21", "2026-11-28", "2027-01-02", "2027-01-09", "2027-01-16", "2027-01-23", "2027-02-06", "2027-02-13", "2027-02-20", "2027-02-27", "2027-04-03", "2027-04-10", "2027-04-17", "2027-04-24", "2027-05-01", "2027-05-08", "2027-05-15", "2027-05-22"],
  },
  {
    level: "السنة الرابعة", subject: "PHYSICS", hour: 18,
    dates: ["2026-09-02", "2026-09-09", "2026-09-16", "2026-09-23", "2026-10-07", "2026-10-14", "2026-10-21", "2026-10-28", "2026-11-04", "2026-11-11", "2026-11-18", "2026-11-25", "2027-01-06", "2027-01-13", "2027-01-20", "2027-01-27", "2027-02-03", "2027-02-10", "2027-02-17", "2027-02-24", "2027-04-07", "2027-04-14", "2027-04-21", "2027-04-28", "2027-05-05", "2027-05-12", "2027-05-19", "2027-05-26"],
  },
  {
    level: "السنة الرابعة", subject: "MATH", hour: 18,
    dates: ["2026-09-05", "2026-09-12", "2026-09-19", "2026-09-26", "2026-10-03", "2026-10-10", "2026-10-17", "2026-10-24", "2026-11-07", "2026-11-14", "2026-11-21", "2026-11-28", "2027-01-02", "2027-01-09", "2027-01-16", "2027-01-23", "2027-02-06", "2027-02-13", "2027-02-20", "2027-02-27", "2027-04-03", "2027-04-10", "2027-04-17", "2027-04-24", "2027-05-01", "2027-05-08", "2027-05-15", "2027-05-22"],
  },
];

const MONTH_NAMES = Object.freeze({ "01": "جانفي", "02": "فيفري", "04": "أبريل", "05": "ماي", "09": "سبتمبر", "10": "أكتوبر", "11": "نوفمبر" });

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

async function cleanupOutOfPolicySessions(expected) {
  const expectedKeys = new Set(expected.map((item) => `${item.level}|${item.subject}|${item.scheduledAt.toISOString()}`));
  const candidates = await prisma.scheduledClass.findMany({
    where: {
      level: { in: [...new Set(expected.map((item) => item.level))] },
      scheduledAt: { gte: new Date("2026-09-01T00:00:00.000Z"), lt: new Date("2027-06-01T00:00:00.000Z") },
    },
    select: { id: true, level: true, subject: true, scheduledAt: true, status: true, driveLink: true, youtubeVideoId: true, notes: true },
  });

  let deleted = 0;
  for (const item of candidates) {
    const key = `${item.level}|${item.subject}|${item.scheduledAt.toISOString()}`;
    const isSafeToDelete = item.status === "PENDING" && !item.driveLink && !item.youtubeVideoId && !item.notes;
    if (!expectedKeys.has(key) && isSafeToDelete) {
      await prisma.scheduledClass.delete({ where: { id: item.id } });
      deleted += 1;
    }
  }
  return deleted;
}

async function seedClassRegistry() {
  const backfilled = await backfillMonthKeys();
  const expected = buildExpectedSessions();
  const deleted = await cleanupOutOfPolicySessions(expected);
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

  return { expected: expected.length, created, skipped, backfilled, deleted };
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

module.exports = { buildExpectedSessions, seedClassRegistry, cleanupOutOfPolicySessions };
