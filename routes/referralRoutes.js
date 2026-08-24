const express = require("express");
const { getParentReferralSummary, getParentBaridiMob, updateParentBaridiMob } = require("../controllers/referralController");
const { verifyToken } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/me", verifyToken, getParentReferralSummary);
router.get("/baridimob", verifyToken, getParentBaridiMob);
router.put("/baridimob", verifyToken, updateParentBaridiMob);

module.exports = router;
