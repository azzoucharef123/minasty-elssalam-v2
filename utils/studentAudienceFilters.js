"use strict";

const ACADEMIC_LEVEL_ALIASES = Object.freeze({
  "السنة الأولى": "السنة الأولى متوسط",
  "السنة الثانية": "السنة الثانية متوسط",
  "السنة الثالثة": "السنة الثالثة متوسط",
  "السنة الرابعة": "السنة الرابعة متوسط",
  "السنة الأولى متوسط": "السنة الأولى متوسط",
  "السنة الثانية متوسط": "السنة الثانية متوسط",
  "السنة الثالثة متوسط": "السنة الثالثة متوسط",
  "السنة الرابعة متوسط": "السنة الرابعة متوسط",
  "طالب جامعي": "طالب جامعي",
});

const PAYMENT_FILTERS = new Set(["ALL", "FREE", "UNPAID", "PAID", "PROMISED"]);
const SUBJECT_FILTERS = new Set(["ALL", "MATH", "PHYSICS", "BOTH"]);

function normalizeLevel(value) {
  return typeof value === "string" ? value.trim() : "";
}

function academicLevelCandidates(value) {
  const normalized = normalizeLevel(value);
  const canonical = ACADEMIC_LEVEL_ALIASES[normalized] || normalized;
  return [...new Set([
    canonical,
    ...Object.entries(ACADEMIC_LEVEL_ALIASES)
      .filter(([, target]) => target === canonical)
      .map(([alias]) => alias),
  ].filter(Boolean))];
}

function normalizeFilter(value, allowed, fallback = "ALL") {
  const normalized = String(value || fallback).trim().toUpperCase();
  return allowed.has(normalized) ? normalized : fallback;
}

/**
 * Build one authoritative Prisma where clause for teacher audience selection.
 * FREE is deliberately distinct from UNPAID: it means an account with no
 * selected paid subject. UNPAID means an unpaid account that has at least one
 * subject selected and is therefore awaiting payment.
 */
function buildStudentAudienceWhere({ level, paymentFilter = "ALL", subjectFilter = "ALL", includeActiveOnly = false } = {}) {
  const where = { level: { in: academicLevelCandidates(level) } };
  if (includeActiveOnly) where.accountActive = true;

  const normalizedPayment = normalizeFilter(paymentFilter, PAYMENT_FILTERS);
  const normalizedSubject = normalizeFilter(subjectFilter, SUBJECT_FILTERS);

  if (normalizedPayment === "FREE") {
    where.paymentStage = "UNPAID";
    where.mathEnrollment = false;
    where.physicsEnrollment = false;
  } else if (normalizedPayment === "UNPAID") {
    where.paymentStage = "UNPAID";
    where.OR = [{ mathEnrollment: true }, { physicsEnrollment: true }];
  } else if (normalizedPayment === "PAID") {
    where.paymentStage = "PAID";
  } else if (normalizedPayment === "PROMISED") {
    where.paymentStage = "PROMISED";
  }

  if (normalizedSubject === "MATH") where.mathEnrollment = true;
  if (normalizedSubject === "PHYSICS") where.physicsEnrollment = true;
  if (normalizedSubject === "BOTH") {
    where.mathEnrollment = true;
    where.physicsEnrollment = true;
  }

  return where;
}

module.exports = {
  ACADEMIC_LEVEL_ALIASES,
  PAYMENT_FILTERS,
  SUBJECT_FILTERS,
  academicLevelCandidates,
  buildStudentAudienceWhere,
  normalizeFilter,
};
