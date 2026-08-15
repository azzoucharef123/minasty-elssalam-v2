"use strict";

require("dotenv").config();

const http = require("http");
const express = require("express");
const jwt = require("jsonwebtoken");
const { WebSocketServer } = require("ws");
const { spawn } = require("child_process");

const app = express();
app.get("/health", (_req, res) => res.json({ status: "ok", service: "facebook-relay" }));
app.get("/", (_req, res) => res.status(200).send("Facebook relay is running."));

const httpServer = http.createServer(app);
const wsServer = new WebSocketServer({ server: httpServer, path: "/ingest" });
const sessions = new Map();
const MAX_URL_LENGTH = 600;
const MAX_KEY_LENGTH = 600;
const TOKEN_ISSUER = "online-tutoring-platform";
const TOKEN_AUDIENCE = "facebook-relay";

function getSecret() {
  const secret = process.env.RELAY_JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error("RELAY_JWT_SECRET is missing or too short.");
  return secret;
}

function isSafeRtmpsUrl(value) {
  return typeof value === "string" && value.length <= MAX_URL_LENGTH && /^rtmps:\/\/[^\s]+$/i.test(value);
}

function isSafeStreamKey(value) {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_KEY_LENGTH && !/[\s\r\n]/.test(value);
}

function sendJson(socket, payload) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload));
}

function stopSession(session, reason = "stopped") {
  if (!session) return;
  session.closed = true;
  if (session.ffmpeg && !session.ffmpeg.killed) {
    try { session.ffmpeg.stdin.end(); } catch (_) { /* already closed */ }
    const timer = setTimeout(() => {
      if (session.ffmpeg && !session.ffmpeg.killed) session.ffmpeg.kill("SIGTERM");
    }, 5_000);
    timer.unref?.();
  }
  sendJson(session.socket, { type: reason === "stopped" ? "stopped" : "error", reason });
  if (sessions.get(session.roomId) === session) sessions.delete(session.roomId);
}

function startFfmpeg(session, serverUrl, streamKey) {
  const outputUrl = `${serverUrl.replace(/\/$/, "")}/${streamKey}`;
  const args = [
    "-hide_banner",
    "-loglevel", "warning",
    "-fflags", "+genpts",
    "-f", "webm",
    "-analyzeduration", "1M",
    "-probesize", "1M",
    "-i", "pipe:0",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-tune", "zerolatency",
    "-pix_fmt", "yuv420p",
    "-r", "30",
    "-g", "60",
    "-keyint_min", "60",
    "-b:v", "2500k",
    "-maxrate", "3000k",
    "-bufsize", "6000k",
    "-c:a", "aac",
    "-ar", "44100",
    "-b:a", "128k",
    "-f", "flv",
    outputUrl,
  ];

  const ffmpeg = spawn("ffmpeg", args, { stdio: ["pipe", "ignore", "pipe"] });
  session.ffmpeg = ffmpeg;
  ffmpeg.stderr.on("data", (chunk) => {
    const line = String(chunk).trim();
    if (line) console.warn(`[FFmpeg ${session.roomId}] ${line.slice(-900)}`);
  });
  ffmpeg.on("error", (error) => {
    console.error(`[FFmpeg ${session.roomId}] process error:`, error.message);
    sendJson(session.socket, { type: "error", reason: "تعذر تشغيل محول Facebook على الخادم." });
  });
  ffmpeg.on("close", (code, signal) => {
    if (!session.closed) {
      console.warn(`[FFmpeg ${session.roomId}] exited code=${code} signal=${signal || "none"}`);
      sendJson(session.socket, { type: "error", reason: "توقف اتصال Facebook بالبث." });
    }
    session.closed = true;
    if (sessions.get(session.roomId) === session) sessions.delete(session.roomId);
  });
}

wsServer.on("connection", (socket) => {
  let session = null;
  let initialized = false;

  socket.on("message", (raw, isBinary) => {
    if (!initialized) {
      if (isBinary) return stopSession(session, "invalid_start");
      try {
        const data = JSON.parse(String(raw));
        if (data.type !== "start" || typeof data.token !== "string") throw new Error("invalid start");
        const decoded = jwt.verify(data.token, getSecret(), {
          algorithms: ["HS256"],
          issuer: TOKEN_ISSUER,
          audience: TOKEN_AUDIENCE,
        });
        const roomId = String(decoded.roomId || "").trim();
        if (!roomId || !isSafeRtmpsUrl(data.serverUrl) || !isSafeStreamKey(data.streamKey)) throw new Error("invalid relay data");
        if (sessions.has(roomId)) {
          sendJson(socket, { type: "error", reason: "يوجد بث Facebook نشط لهذه الغرفة بالفعل." });
          socket.close(1008, "room already streaming");
          return;
        }
        session = { roomId, socket, ffmpeg: null, closed: false };
        sessions.set(roomId, session);
        initialized = true;
        startFfmpeg(session, data.serverUrl, data.streamKey);
        sendJson(socket, { type: "ready" });
      } catch (error) {
        console.warn("Relay start rejected:", error.message);
        sendJson(socket, { type: "error", reason: "بيانات اتصال Facebook غير صالحة أو انتهت صلاحيتها." });
        socket.close(1008, "invalid relay start");
      }
      return;
    }

    if (!session || session.closed) return;
    if (!isBinary) {
      try {
        const data = JSON.parse(String(raw));
        if (data.type === "stop") stopSession(session, "stopped");
      } catch (_) { /* ignore malformed control messages after start */ }
      return;
    }

    if (session.ffmpeg?.stdin?.writable) session.ffmpeg.stdin.write(raw);
  });

  socket.on("close", () => {
    if (session && !session.closed) stopSession(session, "disconnected");
  });
  socket.on("error", () => {
    if (session && !session.closed) stopSession(session, "disconnected");
  });
});

const port = Number(process.env.PORT || 8080);
httpServer.listen(port, () => console.info(`Facebook relay listening on ${port}`));
