const express = require("express");
const { verifyToken, isTeacher } = require("../middleware/authMiddleware");
const {
  startSofizPayPayment,
  getSofizPayPaymentStatus,
  getTeacherElectronicPayments,
  dismissTeacherElectronicPayment,
  receiveSofizPayWebhook,
} = require("../controllers/paymentController");

const router = express.Router();

// SofizPay sends this server-to-server notification without the parent's JWT.
router.post("/sofizpay/webhook", express.json({ limit: "64kb" }), receiveSofizPayWebhook);

// Teacher-only view of confirmed electronic payments, filtered by academic level.
router.get("/teacher/electronic", verifyToken, isTeacher, getTeacherElectronicPayments);
router.delete("/teacher/electronic/:id", verifyToken, isTeacher, dismissTeacherElectronicPayment);

// The parent must own the student and the server verifies payment before access changes.
router.post("/sofizpay/start", verifyToken, startSofizPayPayment);
router.get("/sofizpay/status", verifyToken, getSofizPayPaymentStatus);

module.exports = router;
