const express = require("express");
const { teacherLogin, parentLogin, logout, listSessions, revokeSession } = require("../controllers/authController");
const { verifyToken } = require("../middleware/authMiddleware");
const { authRateLimit } = require("../middleware/rateLimit");

const router = express.Router();

router.post("/teacher", authRateLimit, teacherLogin);
router.post("/parent", authRateLimit, parentLogin);
router.post("/logout", verifyToken, logout);
router.get("/sessions", verifyToken, listSessions);
router.delete("/sessions/:id", verifyToken, revokeSession);

module.exports = router;
