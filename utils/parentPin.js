"use strict";

const crypto = require("crypto");
const { promisify } = require("util");

const scrypt = promisify(crypto.scrypt);
const PIN_PATTERN = /^\d{4}$/;

function normalizeParentPin(value) {
  const pin = String(value || "")
    .trim()
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));

  return PIN_PATTERN.test(pin) ? pin : "";
}

async function hashParentPin(pin) {
  const normalizedPin = normalizeParentPin(pin);
  if (!normalizedPin) {
    throw new Error("PIN must contain exactly four digits.");
  }

  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = await scrypt(normalizedPin, salt, 64);
  return `${salt}:${derivedKey.toString("hex")}`;
}

async function verifyParentPin(pin, storedHash) {
  const normalizedPin = normalizeParentPin(pin);
  if (!normalizedPin || typeof storedHash !== "string") {
    return false;
  }

  const [salt, storedKeyHex] = storedHash.split(":");
  if (!salt || !storedKeyHex) {
    return false;
  }

  try {
    const storedKey = Buffer.from(storedKeyHex, "hex");
    const derivedKey = await scrypt(normalizedPin, salt, 64);

    return (
      storedKey.length === derivedKey.length &&
      crypto.timingSafeEqual(storedKey, derivedKey)
    );
  } catch (error) {
    return false;
  }
}

module.exports = {
  normalizeParentPin,
  hashParentPin,
  verifyParentPin,
};
