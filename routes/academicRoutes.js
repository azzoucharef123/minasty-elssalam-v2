const express = require("express");
const { verifyToken } = require("../middleware/authMiddleware");
const {
  listGrades,
  createGrade,
  createAssignment,
  listAssignments,
  submitAssignment,
  listSubmissions,
  gradeSubmission,
  createQuestion,
  createAssessment,
  listAssessments,
  submitAssessment,
  getProgress,
  updateLessonProgress,
  listNotifications,
  markNotificationRead,
  getTeacherAnalytics,
} = require("../controllers/academicController");

const router = express.Router();
router.use(verifyToken);

router.get("/students/:studentId/grades", listGrades);
router.post("/students/:studentId/grades", createGrade);
router.get("/students/:studentId/assignments", listAssignments);
router.post("/students/:studentId/assignments/:assignmentId/submissions", submitAssignment);
router.get("/students/:studentId/progress", getProgress);
router.put("/students/:studentId/progress/lessons/:lessonVideoId", updateLessonProgress);
router.get("/students/:studentId/assessments", listAssessments);
router.post("/students/:studentId/assessments/:assessmentId/submit", submitAssessment);

router.post("/assignments", createAssignment);
router.get("/assignments/:assignmentId/submissions", listSubmissions);
router.put("/submissions/:submissionId/grade", gradeSubmission);
router.post("/questions", createQuestion);
router.post("/assessments", createAssessment);

router.get("/notifications", listNotifications);
router.put("/notifications/:id/read", markNotificationRead);
router.get("/analytics", getTeacherAnalytics);

module.exports = router;
