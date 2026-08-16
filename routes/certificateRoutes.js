"use strict";

const express = require("express");
const multer = require("multer");
const { verifyToken, isTeacher } = require("../middleware/authMiddleware");
const {
  listCertificates,
  createCertificate,
  getCertificateImage,
  deleteCertificate,
} = require("../controllers/certificateController");

const router = express.Router();
const MAX_CERTIFICATE_SIZE_BYTES = 10 * 1024 * 1024;
const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: MAX_CERTIFICATE_SIZE_BYTES },
  fileFilter: (_req, file, callback) => {
    if (!allowedTypes.has(file.mimetype)) {
      return callback(new Error("يسمح برفع الشهادة بصيغة PNG أو JPG أو WebP فقط."), false);
    }
    return callback(null, true);
  },
});

router.get("/student/:studentId", verifyToken, listCertificates);
router.get("/:id/image", verifyToken, getCertificateImage);
router.post("/student/:studentId", verifyToken, isTeacher, upload.single("image"), createCertificate);
router.delete("/:id", verifyToken, isTeacher, deleteCertificate);

router.use((error, _req, res, next) => {
  if (!error) return next();
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "الحد الأقصى لحجم صورة الشهادة هو 10 ميغابايت." });
    }
    return res.status(400).json({ error: "تعذر معالجة صورة الشهادة المرفوعة." });
  }
  return res.status(400).json({ error: error.message || "تعذر معالجة صورة الشهادة." });
});

module.exports = router;

