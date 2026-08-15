const express = require("express");
const { verifyToken } = require("../middleware/authMiddleware");
const { getPublicKey, subscribe, unsubscribe } = require("../controllers/pushController");

const router = express.Router();
router.get("/public-key", verifyToken, getPublicKey);
router.post("/subscribe", verifyToken, subscribe);
router.delete("/subscribe", verifyToken, unsubscribe);
module.exports = router;
