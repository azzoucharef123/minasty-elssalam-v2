const express = require("express");
const { verifyToken, isTeacher } = require("../middleware/authMiddleware");
const {
  startSofizPayPayment,
  getSofizPayPaymentStatus,
  getTeacherElectronicPayments,
  dismissTeacherElectronicPayment,
  reconcileTeacherElectronicPayment,
  reconcileParentSofizPayPayment,
  receiveSofizPayWebhook,
} = require("../controllers/paymentController");

const router = express.Router();

// SofizPay sends this server-to-server notification without the parent's JWT.
router.post(
  "/sofizpay/webhook",
  express.urlencoded({ extended: false, limit: "64kb" }),
  express.json({ limit: "64kb" }),
  receiveSofizPayWebhook
);

// Teacher-only view of confirmed electronic payments, filtered by academic level.
router.get("/teacher/electronic", verifyToken, isTeacher, getTeacherElectronicPayments);
router.delete("/teacher/electronic/:id", verifyToken, isTeacher, dismissTeacherElectronicPayment);
router.post("/teacher/electronic/:id/reconcile", verifyToken, isTeacher, reconcileTeacherElectronicPayment);

// The parent must own the student and the server verifies payment before access changes.
router.post("/sofizpay/start", verifyToken, startSofizPayPayment);
router.post("/sofizpay/reconcile", verifyToken, reconcileParentSofizPayPayment);
router.get("/sofizpay/status", verifyToken, getSofizPayPaymentStatus);

module.exports = router;
