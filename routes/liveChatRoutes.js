"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const multer = require("multer");
const { verifyToken } = require("../middleware/authMiddleware");
const {
  imageUploadDirectory,
  uploadQuestionImage,
  getQuestionImage,
} = require("../controllers/liveChatController");

const router = express.Router();
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const acceptedImages = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
]);

fs.mkdirSync(imageUploadDirectory, { recursive: true });

const imageStorage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, imageUploadDirectory),
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, `question-${Date.now()}-${crypto.randomUUID()}${extension}`);
  },
});

function imageFileFilter(_req, file, callback) {
  const extension = path.extname(file.originalname).toLowerCase();
  const expectedMimeType = acceptedImages.get(extension);

  if (!expectedMimeType || file.mimetype !== expectedMimeType) {
    return callback(new Error("يسمح برفع صور JPG أو PNG أو WEBP فقط."), false);
  }

  return callback(null, true);
}

const imageUpload = multer({
  storage: imageStorage,
  fileFilter: imageFileFilter,
  limits: { files: 1, fileSize: MAX_IMAGE_SIZE_BYTES },
});

router.post("/question-image", verifyToken, imageUpload.single("image"), uploadQuestionImage);
router.get("/question-image/:id", verifyToken, getQuestionImage);

router.use((error, _req, res, next) => {
  if (!error) return next();

  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "الحد الأقصى لصورة السؤال هو 5 ميغابايت." });
    }
    return res.status(400).json({ error: "تعذر معالجة صورة السؤال المرفوعة." });
  }

  if (error.message === "يسمح برفع صور JPG أو PNG أو WEBP فقط.") {
    return res.status(400).json({ error: error.message });
  }

  return next(error);
});

module.exports = router;
