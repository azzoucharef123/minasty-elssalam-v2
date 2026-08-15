"use strict";

const studentChatToken = sessionStorage.getItem("parentToken");
const studentChatId = new URLSearchParams(window.location.search).get("studentId") || sessionStorage.getItem("selectedStudentId") || sessionStorage.getItem("studentId");

if (!studentChatToken || !studentChatId) {
  window.location.replace("./parent-login.html");
}

const studentChatElements = {
  name: document.getElementById("student-chat-name"),
  level: document.getElementById("student-chat-level"),
  messages: document.getElementById("student-chat-messages"),
  form: document.getElementById("student-chat-form"),
  input: document.getElementById("student-chat-input"),
  error: document.getElementById("student-chat-error"),
};

const studentRenderedMessageIds = new Set();

async function studentChatFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${studentChatToken}`,
      Accept: "application/json",
      ...(options.headers || {}),
    },
  });
  if (response.status === 401 || response.status === 403) {
    window.location.replace("./parent-login.html");
    throw new Error("انتهت جلسة الولي أو لا تملك صلاحية هذا الطالب.");
  }
  return response;
}

function showStudentChatError(message) {
  studentChatElements.error.textContent = message;
  studentChatElements.error.hidden = false;
  window.setTimeout(() => { studentChatElements.error.hidden = true; }, 4_000);
}

function renderStudentMessage(message) {
  if (!message?.id || studentRenderedMessageIds.has(message.id)) return;
  studentRenderedMessageIds.add(message.id);
  const bubble = document.createElement("article");
  bubble.className = `chat-bubble ${message.senderRole === "student" ? "from-student" : "from-teacher"}`;
  const content = document.createElement("p");
  content.textContent = message.content;
  const time = document.createElement("time");
  time.textContent = new Intl.DateTimeFormat("ar-DZ", { dateStyle: "short", timeStyle: "short" }).format(new Date(message.createdAt));
  bubble.append(content, time);
  studentChatElements.messages.append(bubble);
  studentChatElements.messages.scrollTop = studentChatElements.messages.scrollHeight;
}

async function markStudentMessagesRead() {
  await studentChatFetch(`/api/messages/${encodeURIComponent(studentChatId)}/read`, { method: "PUT" });
  window.dispatchEvent(new CustomEvent("private-messages-read"));
}

async function loadStudentConversation() {
  try {
    const response = await studentChatFetch(`/api/messages/${encodeURIComponent(studentChatId)}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "تعذر تحميل محادثتك مع الأستاذ.");
    studentChatElements.name.textContent = payload.student.studentName;
    studentChatElements.level.textContent = payload.student.level || "";
    studentChatElements.messages.replaceChildren();
    payload.messages.forEach(renderStudentMessage);
    await markStudentMessagesRead();
  } catch (error) {
    showStudentChatError(error.message || "تعذر تحميل الرسائل.");
  }
}

async function sendStudentMessage(event) {
  event.preventDefault();
  const content = studentChatElements.input.value.trim();
  if (!content) return;
  const button = studentChatElements.form.querySelector("button");
  button.disabled = true;
  try {
    const response = await studentChatFetch(`/api/messages/${encodeURIComponent(studentChatId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "تعذر إرسال الرسالة.");
    studentChatElements.input.value = "";
    renderStudentMessage(payload.message);
  } catch (error) {
    showStudentChatError(error.message || "تعذر إرسال الرسالة.");
  } finally {
    button.disabled = false;
    studentChatElements.input.focus();
  }
}

function connectStudentChatSocket() {
  if (typeof io !== "function") return;
  const socket = io("/private-messages", {
    auth: { token: studentChatToken, studentId: studentChatId },
  });
  socket.on("private_message_created", (message = {}) => {
    if (message.studentId !== studentChatId) return;
    renderStudentMessage(message);
    if (message.senderRole === "teacher") void markStudentMessagesRead();
  });
}

studentChatElements.form?.addEventListener("submit", (event) => { void sendStudentMessage(event); });
void loadStudentConversation();
connectStudentChatSocket();
