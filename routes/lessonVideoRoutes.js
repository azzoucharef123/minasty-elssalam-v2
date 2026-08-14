"use strict";

const express = require("express");
const { verifyToken, isTeacher } = require("../middleware/authMiddleware");
const {
  createLessonVideo,
  getLessonVideosByLevel,
  deleteLessonVideo,
} = require("../controllers/lessonVideoController");

const router = express.Router();

router.get("/:level", verifyToken, getLessonVideosByLevel);
router.post("/", verifyToken, isTeacher, createLessonVideo);
router.delete("/:id", verifyToken, isTeacher, deleteLessonVideo);

module.exports = router;
