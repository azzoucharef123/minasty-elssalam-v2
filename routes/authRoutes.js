const express = require("express");
const { teacherLogin, parentLogin, logout } = require("../controllers/authController");
const { verifyToken } = require("../middleware/authMiddleware");
const { authRateLimit } = require("../middleware/rateLimit");

const router = express.Router();

router.post("/teacher", authRateLimit, teacherLogin);
router.post("/parent", authRateLimit, parentLogin);
router.post("/logout", verifyToken, logout);

module.exports = router;
