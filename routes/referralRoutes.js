const express = require("express");
const { getParentReferralSummary, getParentBaridiMob, updateParentBaridiMob, getParentReferralBalance, requestParentReferralWithdrawal } = require("../controllers/referralController");
const { verifyToken } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/me", verifyToken, getParentReferralSummary);
router.get("/baridimob", verifyToken, getParentBaridiMob);
router.put("/baridimob", verifyToken, updateParentBaridiMob);
router.get("/withdrawals", verifyToken, getParentReferralBalance);
router.post("/withdrawals", verifyToken, requestParentReferralWithdrawal);

module.exports = router;
