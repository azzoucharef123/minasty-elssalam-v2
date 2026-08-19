const express = require("express");
const {
  teacherLogin,
  parentLogin,
  logout,
  listSessions,
  revokeSession,
  changeParentPin,
  requestParentPinReset,
  listParentPinResetRequests,
  issueTemporaryParentPin,
} = require("../controllers/authController");
const { verifyToken, isTeacher } = require("../middleware/authMiddleware");
const { authRateLimit } = require("../middleware/rateLimit");

const router = express.Router();

router.post("/teacher", authRateLimit, teacherLogin);
router.post("/parent", authRateLimit, parentLogin);
router.post("/parent/forgot", authRateLimit, requestParentPinReset);
router.get("/parent/forgot-requests", verifyToken, isTeacher, listParentPinResetRequests);
router.put("/parent/forgot-requests/:id/issue", verifyToken, isTeacher, issueTemporaryParentPin);
router.post("/logout", verifyToken, logout);
router.get("/sessions", verifyToken, listSessions);
router.delete("/sessions/:id", verifyToken, revokeSession);
router.put("/parent/pin", verifyToken, changeParentPin);

module.exports = router;
