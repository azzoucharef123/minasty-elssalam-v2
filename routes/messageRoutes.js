"use strict";

const express = require("express");
const { verifyToken } = require("../middleware/authMiddleware");
const {
  listTeacherConversations,
  getUnreadCount,
  listMessages,
  sendMessage,
  markMessagesRead,
} = require("../controllers/messageController");

const router = express.Router();

router.use(verifyToken);
router.get("/conversations", listTeacherConversations);
router.get("/unread-count", getUnreadCount);
router.get("/:studentId", listMessages);
router.post("/:studentId", sendMessage);
router.put("/:studentId/read", markMessagesRead);

module.exports = router;
