"use strict";

const express = require("express");
const { verifyToken, isTeacher } = require("../middleware/authMiddleware");
const {
  getLevelSchedule,
  getClassRegistry,
  updateClassRegistry,
  getCalendarIcs,
  createScheduledClass,
  updateScheduledClass,
  deleteScheduledClass,
  getGlobalTeacherAbsence,
  updateGlobalTeacherAbsence,
  updateTeacherAbsence,
} = require("../controllers/scheduleController");

const router = express.Router();

// Parents can read the schedule for their child's level; all changes stay teacher-only.
router.get("/calendar/:level.ics", verifyToken, getCalendarIcs);
router.get("/registry/:level", verifyToken, getClassRegistry);
router.patch("/registry/:id", verifyToken, isTeacher, updateClassRegistry);
router.get("/absence/global", verifyToken, isTeacher, getGlobalTeacherAbsence);
router.get("/:level", verifyToken, getLevelSchedule);
router.post("/", verifyToken, isTeacher, createScheduledClass);
router.put("/:id", verifyToken, isTeacher, updateScheduledClass);
router.delete("/:id", verifyToken, isTeacher, deleteScheduledClass);
router.put("/absence/global", verifyToken, isTeacher, updateGlobalTeacherAbsence);
router.put("/absence/:level", verifyToken, isTeacher, updateTeacherAbsence);

module.exports = router;
