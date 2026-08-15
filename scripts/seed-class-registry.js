"use strict";

const prisma = require("../lib/prisma");

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

function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function firstMatchingDate(year, monthIndex, weekday) {
  const date = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0));
  const offset = (weekday - date.getUTCDay() + 7) % 7;
  date.setUTCDate(1 + offset);
  return date;
}

function buildDate(year, monthIndex, weekday, hour) {
  const date = firstMatchingDate(year, monthIndex, weekday);
  date.setUTCHours(hour - 1, 0, 0, 0); // Algeria is UTC+1 for these months.
  return date;
}

async function main() {
  const existing = await prisma.scheduledClass.findMany({ select: { id: true, scheduledAt: true, monthKey: true } });
  for (const item of existing) {
    if (!item.monthKey) {
      await prisma.scheduledClass.update({ where: { id: item.id }, data: { monthKey: monthKey(item.scheduledAt), status: "PENDING" } });
    }
  }

  let created = 0;
  let skipped = 0;
  for (const rule of RULES) {
    for (let monthIndex = 8; monthIndex <= 10; monthIndex += 1) {
      const year = 2026;
      for (let date = buildDate(year, monthIndex, rule.weekday, rule.hour); date.getUTCMonth() === monthIndex; date.setUTCDate(date.getUTCDate() + 7)) {
        const duplicate = await prisma.scheduledClass.findFirst({ where: { level: rule.level, subject: rule.subject, scheduledAt: date } });
        if (duplicate) {
          skipped += 1;
          continue;
        }
        await prisma.scheduledClass.create({ data: { level: rule.level, subject: rule.subject, scheduledAt: date, monthKey: monthKey(date), status: "PENDING" } });
        created += 1;
      }
    }
  }
  console.log(JSON.stringify({ created, skipped }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
