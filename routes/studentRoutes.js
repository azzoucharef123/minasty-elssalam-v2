"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const multer = require("multer");
const {
  registerStudent,
  getStudentForParent,
  getStudentCard,
  getStudentsByLevel,
  updateStudentStatusAndNotes,
  deleteStudent,
} = require("../controllers/studentController");
const {
  verifyToken,
  isTeacher,
  isParentAccessingOwnRecord,
} = require("../middleware/authMiddleware");

const router = express.Router();
const uploadDirectory =
  process.env.UPLOAD_DIR || path.join(__dirname, "..", "public", "uploads");
const MAX_CARD_SIZE_BYTES = 5 * 1024 * 1024;
const acceptedCardTypes = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
]);

fs.mkdirSync(uploadDirectory, { recursive: true });

const cardStorage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, uploadDirectory),
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, `student-card-${Date.now()}-${crypto.randomUUID()}${extension}`);
  },
});

function cardFileFilter(_req, file, callback) {
  const extension = path.extname(file.originalname).toLowerCase();
  const expectedMimeType = acceptedCardTypes.get(extension);

  if (!expectedMimeType || file.mimetype !== expectedMimeType) {
    return callback(new Error("يسمح برفع صورة البطاقة بصيغة PNG أو JPG/JPEG فقط."), false);
  }

  return callback(null, true);
}

const cardUpload = multer({
  storage: cardStorage,
  fileFilter: cardFileFilter,
  limits: { files: 1, fileSize: MAX_CARD_SIZE_BYTES },
});

// Public: a new family must be able to register before an account exists.
router.post("/register", cardUpload.single("cardPhoto"), registerStudent);

// Parent-only: the signed phone claim must equal the requested URL phone.
router.get("/parent/:phone", verifyToken, isParentAccessingOwnRecord, getStudentForParent);

// Teacher-only: card photos are never exposed publicly.
router.get("/:id/card-photo", verifyToken, isTeacher, getStudentCard);

// Teacher-only: roster access is never available to parent tokens.
router.get("/level/:level", verifyToken, isTeacher, getStudentsByLevel);

// Teacher-only: payment and teacher-note updates are administrative actions.
router.put("/:id", verifyToken, isTeacher, updateStudentStatusAndNotes);
router.delete("/:id", verifyToken, isTeacher, deleteStudent);

router.use((error, _req, res, next) => {
  if (!error) {
    return next();
  }

  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "الحد الأقصى لصورة البطاقة هو 5 ميغابايت." });
    }

    return res.status(400).json({ error: "تعذر معالجة صورة البطاقة المرفوعة." });
  }

  if (error.message === "يسمح برفع صورة البطاقة بصيغة PNG أو JPG/JPEG فقط.") {
    return res.status(400).json({ error: error.message });
  }

  return next(error);
});

module.exports = router;
