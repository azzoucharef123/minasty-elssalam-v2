"use strict";

const express = require("express");
const { verifyToken, isTeacher } = require("../middleware/authMiddleware");
const {
  getLevelSchedule,
  getCalendarIcs,
  createScheduledClass,
  updateScheduledClass,
  deleteScheduledClass,
  updateTeacherAbsence,
} = require("../controllers/scheduleController");

const router = express.Router();

// Parents can read the schedule for their child's level; all changes stay teacher-only.
router.get("/calendar/:level.ics", verifyToken, getCalendarIcs);
router.get("/:level", verifyToken, getLevelSchedule);
router.post("/", verifyToken, isTeacher, createScheduledClass);
router.put("/:id", verifyToken, isTeacher, updateScheduledClass);
router.delete("/:id", verifyToken, isTeacher, deleteScheduledClass);
router.put("/absence/:level", verifyToken, isTeacher, updateTeacherAbsence);

module.exports = router;
