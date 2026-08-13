"use strict";

const ARABIC_DIGIT_MAP = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};

const ALGERIAN_PARENT_PHONE_PATTERN = /^0[567]\d{8}$/;

/**
 * Returns the database representation of a guardian's number only when it is
 * an Algerian local mobile number with exactly ten digits: 05/06/07xxxxxxxx.
 */
function normalizeParentPhone(value) {
  if (typeof value !== "string") {
    return "";
  }

  const localized = value
    .trim()
    .replace(/[٠-٩۰-۹]/g, (digit) => ARABIC_DIGIT_MAP[digit]);

  // Permit visual separators only; country-code and non-numeric formats are
  // deliberately rejected so every login uses the same local 10-digit form.
  if (!/^[0-9\s().-]+$/.test(localized)) {
    return "";
  }

  const phone = localized.replace(/[\s().-]/g, "");
  return ALGERIAN_PARENT_PHONE_PATTERN.test(phone) ? phone : "";
}

module.exports = { normalizeParentPhone };
