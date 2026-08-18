const express = require("express");
const { verifyToken } = require("../middleware/authMiddleware");
const {
  startSofizPayPayment,
  getSofizPayPaymentStatus,
  receiveSofizPayWebhook,
} = require("../controllers/paymentController");

const router = express.Router();

// SofizPay sends this server-to-server notification without the parent's JWT.
router.post("/sofizpay/webhook", express.json({ limit: "64kb" }), receiveSofizPayWebhook);

// The parent must own the student and the server verifies payment before access changes.
router.post("/sofizpay/start", verifyToken, startSofizPayPayment);
router.get("/sofizpay/status", verifyToken, getSofizPayPaymentStatus);

module.exports = router;
