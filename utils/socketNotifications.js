"use strict";

const MAX_TITLE_LENGTH = 160;
const MAX_BODY_LENGTH = 2000;
const MAX_LINK_LENGTH = 500;
const MAX_ICON_LENGTH = 500;
const MAX_TAG_LENGTH = 120;

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function notificationRoom(role, recipientId) {
  const safeRole = cleanText(role, 40).toLowerCase();
  const safeRecipientId = cleanText(recipientId, 180);
  return safeRole && safeRecipientId
    ? `browser-notifications:${encodeURIComponent(safeRole)}:${encodeURIComponent(safeRecipientId)}`
    : "";
}

function notificationSessionRoom(sessionId) {
  const safeSessionId = cleanText(sessionId, 180);
  return safeSessionId ? `browser-notifications-session:${encodeURIComponent(safeSessionId)}` : "";
}

function notificationPayload(input = {}) {
  const title = cleanText(input.title, MAX_TITLE_LENGTH) || "أكاديمية التفوق";
  const body = cleanText(input.body, MAX_BODY_LENGTH);
  const link = cleanText(input.link, MAX_LINK_LENGTH) || "/parent-dashboard.html";
  const icon = cleanText(input.icon, MAX_ICON_LENGTH) || "/assets/teacher-azzeddine-charef.jpg";
  const tag = cleanText(input.tag, MAX_TAG_LENGTH) || `minasaty-${Date.now()}`;
  const data = input.data && typeof input.data === "object" ? input.data : {};

  return { title, body, link, icon, tag, data, timestamp: Date.now() };
}

function createSocketNotificationSender(io) {
  if (!io || typeof io.emit !== "function") {
    throw new Error("Socket.io instance is required.");
  }

  return function sendSocketNotification(input = {}) {
    const payload = notificationPayload(input);
    const broadcast = input.broadcast === true;
    let target = "broadcast";

    if (broadcast) {
      io.emit("push_notification", payload);
      return { delivered: true, target, payload };
    }

    if (typeof input.socketId === "string" && input.socketId.trim()) {
      target = input.socketId.trim();
      io.to(target).emit("push_notification", payload);
      return { delivered: true, target, payload };
    }

    const sessionRoom = notificationSessionRoom(input.sessionId);
    if (sessionRoom) {
      target = sessionRoom;
      io.to(sessionRoom).emit("push_notification", payload);
      return { delivered: true, target, payload };
    }

    const room = notificationRoom(input.role, input.recipientId ?? input.userId);
    if (!room) {
      return { delivered: false, target: null, payload };
    }

    target = room;
    io.to(room).emit("push_notification", payload);
    return { delivered: true, target, payload };
  };
}

module.exports = { createSocketNotificationSender, notificationRoom, notificationSessionRoom, notificationPayload };
