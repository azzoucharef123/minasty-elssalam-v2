"use strict";

/**
 * Student live-viewer controller.
 *
 * This page intentionally represents only one remote peer: the teacher. It
 * never receives, renders, or requests a list of any other students.
 */

const socket = io();

const rtcConfig = {
  iceServers: [
    {
      urls: [
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302",
        "stun:stun.cloudflare.com:3478",
      ],
    },
  ],
};

// Required viewer state for this phase.
let pc;
let localAudioStream;
let remoteMediaStream;
const pendingRemoteAudioTracks = [];

let teacherSocketId = null;
let joinedClass = false;
let isJoining = false;
let isMakingRenegotiationOffer = false;
let microphoneOfferSent = false;
let microphoneNegotiated = false;
let microphonePermissionGranted = false;
// Browser permission and teacher permission are intentionally separate: the
// first is prepared on entry, while the second alone enables transmission.
let microphonePrepared = false;
let isPreparingMicrophone = false;
let isRequestingMicrophone = false;
let isAttemptingTeacherAudio = false;
let handResetTimer = null;
let didLoseSocketConnection = false;
let isRecoveringStream = false;
let recoveryAttempts = 0;
let recoveryTimer = null;
const MAX_RECOVERY_ATTEMPTS = 8;
const pendingIceCandidates = [];
// Direct audio-only peer connections between approved speaking students and
// their classmates. This channel is independent from the teacher broadcast.
const studentAudioMeshPeers = new Map();
const studentAudioMeshSenders = new Map();
const pendingStudentAudioMeshRecipients = new Set();
const pendingStudentAudioMeshIce = new Map();
const MAX_QUESTION_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_QUESTION_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
let selectedQuestionImageFile = null;
let selectedQuestionImagePreviewUrl = null;
const renderedQuestionImageUrls = new Set();
const directClassEntryRequested =
  sessionStorage.getItem("joinLiveClassImmediately") === "true" ||
  new URLSearchParams(window.location.search).get("join") === "direct";
let initialAutoJoinPending = directClassEntryRequested;
// After the teacher ends a class, the viewer stays in a passive lobby and
// automatically re-enters the next class for the same level.
let waitingForNextClass = false;

// The viewer stores teacher-provided normalized segments only; there is no
// student drawing input or outbound drawing event anywhere in this client.
const receivedAnnotationSegments = [];

const elements = {
  remoteVideo: document.getElementById("remote-video"),
  enableAudioButton: document.getElementById("enable-audio-btn"),
  placeholder: document.getElementById("video-placeholder"),
  placeholderTitle: document.getElementById("placeholder-title"),
  placeholderDescription: document.getElementById("placeholder-description"),
  classLevelLabel: document.getElementById("class-level-label"),
  joinButton: document.getElementById("join-class-btn"),
  raiseHandButton: document.getElementById("raise-hand-btn"),
  handWaitingActions: document.getElementById("hand-waiting-actions"),
  lowerHandButton: document.getElementById("lower-hand-btn"),
  toggleMicButton: document.getElementById("toggle-mic-btn"),
  studentCanvas: document.getElementById("student-canvas"),
  chatBox: document.getElementById("chat-box"),
  chatEmpty: document.getElementById("chat-empty"),
  chatForm: document.getElementById("chat-form"),
  chatInput: document.getElementById("chat-input"),
  chatSendButton: document.getElementById("chat-send-btn"),
  captureQuestionButton: document.getElementById("capture-question-btn"),
  questionImageInput: document.getElementById("question-image-input"),
  questionImagePreview: document.getElementById("question-image-preview"),
  questionImagePreviewImage: document.getElementById("question-image-preview-img"),
  removeQuestionImageButton: document.getElementById("remove-question-image-btn"),
  subscriptionUpgradeModal: document.getElementById("subscription-upgrade-modal"),
  subscriptionUpgradeTitle: document.getElementById("subscription-upgrade-title"),
  subscriptionUpgradeHeadMessage: document.getElementById("subscription-upgrade-head-message"),
  subscriptionUpgradeMessage: document.getElementById("subscription-upgrade-message"),
  subscriptionDeclineButton: document.getElementById("subscription-decline-btn"),
};

function openSubscriptionUpgradeModal(reason = "university") {
  if (!elements.subscriptionUpgradeModal) {
    return;
  }

  const isSubjectUpgrade = reason === "PHYSICS" || reason === "MATH";
  const requiredSubject = reason === "PHYSICS" ? "الفيزياء" : "الرياضيات";
  const currentSubject = reason === "PHYSICS" ? "الرياضيات" : "الفيزياء";
  if (elements.subscriptionUpgradeTitle) {
    elements.subscriptionUpgradeTitle.textContent = isSubjectUpgrade
      ? `حصة اليوم ${requiredSubject}`
      : "هذه الحصة مخصصة للاشتراك المدفوع";
  }
  if (elements.subscriptionUpgradeHeadMessage) {
    elements.subscriptionUpgradeHeadMessage.textContent = isSubjectUpgrade
      ? `حصة اليوم ${requiredSubject} وأنت مشترك في ${currentSubject} فقط.`
      : "أنت مشترك في المجاني فقط وهذه الحصة المدفوعة الآن للطلبة ذوي الاشتراك المدفوع.";
  }
  if (elements.subscriptionUpgradeMessage) {
    elements.subscriptionUpgradeMessage.textContent = isSubjectUpgrade
      ? `إذا كنت تريد الاشتراك في ${requiredSubject}، اتصل بالأستاذ مباشرة على الرقم 0556960950.`
      : "للترقية إلى الاشتراك المدفوع، اضغط على الزر الأخضر واتصل بالأستاذ مباشرة على الرقم 0556960950.";
  }
  if (elements.subscriptionDeclineButton) {
    elements.subscriptionDeclineButton.textContent = isSubjectUpgrade
      ? `لا أريد الاشتراك في ${requiredSubject}`
      : "لا أريد الاشتراك";
  }

  elements.subscriptionUpgradeModal.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeSubscriptionUpgradeModal() {
  if (!elements.subscriptionUpgradeModal) {
    return;
  }

  elements.subscriptionUpgradeModal.hidden = true;
  document.body.style.overflow = "";
}

/**
 * Read the current student's identity from the session keys used by the portal.
 * The direct keys are the canonical format; object fallbacks keep the viewer
 * compatible with a dashboard that stores the logged-in student as JSON.
 */
function readStoredStudent() {
  const recordKeys = ["student", "currentStudent", "loggedInStudent"];
  let storedRecord = null;

  for (const key of recordKeys) {
    const rawValue = sessionStorage.getItem(key);
    if (!rawValue) {
      continue;
    }

    try {
      const parsedValue = JSON.parse(rawValue);
      if (parsedValue && typeof parsedValue === "object") {
        storedRecord = parsedValue;
        break;
      }
    } catch {
      // A non-JSON legacy value is harmless; canonical direct keys are checked below.
    }
  }

  const studentName =
    sessionStorage.getItem("studentName") ||
    sessionStorage.getItem("currentStudentName") ||
    storedRecord?.studentName ||
    storedRecord?.name ||
    "";

  const level =
    sessionStorage.getItem("level") ||
    sessionStorage.getItem("studentLevel") ||
    sessionStorage.getItem("currentStudentLevel") ||
    storedRecord?.level ||
    "";

  const studentId = sessionStorage.getItem("studentId") || storedRecord?.id || "";

  return {
    studentId: String(studentId).trim(),
    studentName: String(studentName).trim(),
    level: String(level).trim(),
  };
}

const { studentId, studentName, level } = readStoredStudent();
// The classroom is entered from the parent dashboard. Once identity is known,
// keep the viewer hands-free even after a teacher ends and later restarts class.
initialAutoJoinPending = initialAutoJoinPending || Boolean(studentId && level);

/**
 * Keep status text accessible and use explicit modes rather than injecting
 * server-provided strings as markup.
 */
function consumeDirectClassEntry() {
  initialAutoJoinPending = false;
  sessionStorage.removeItem("joinLiveClassImmediately");

  if (window.location.search) {
    window.history.replaceState({}, document.title, "./student-live.html");
  }
}

function waitForNextLiveClass(message = "بانتظار بدء الأستاذ للحصة التالية…") {
  waitingForNextClass = true;
  initialAutoJoinPending = false;
  elements.joinButton.hidden = true;
  elements.joinButton.disabled = true;
  elements.raiseHandButton.hidden = true;
  updateChatControls();
  setPlaceholder("بانتظار الحصة التالية", "ستفتح الحصة تلقائياً فور أن يبدأ الأستاذ البث.");
  setViewerStatus(message, "warning");

  if (socket.connected && level) {
    socket.emit("join_level_lobby", { level }, (response) => {
      if (waitingForNextClass && response?.isClassLive) {
        waitingForNextClass = false;
        void joinClass({ prepareMicrophone: true });
      }
    });
  }
}

function joinClassAutomaticallyFromLobby() {
  if (!waitingForNextClass || joinedClass || isJoining) {
    return;
  }

  waitingForNextClass = false;
  void joinClass({ prepareMicrophone: true });
}

function setViewerStatus() {
  // The visual status tray was removed to keep the learner interface compact.
  // Connection and classroom operations continue without rendering a bottom notice.
}

function setPlaceholder(title, description) {
  elements.placeholderTitle.textContent = title;
  elements.placeholderDescription.textContent = description;
  elements.placeholder.hidden = false;
}

/**
 * Creates a local, accessible warning layer on the theater stage. It contains
 * no peer identifiers or attendee information, preserving viewer privacy.
 */
function showConnectionOverlay(message, tone = "error") {
  const videoFrame = elements.remoteVideo?.closest(".video-frame");
  if (!videoFrame) {
    return;
  }

  let overlay = document.getElementById("connection-loss-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "connection-loss-overlay";
    overlay.setAttribute("role", "alert");
    overlay.setAttribute("aria-live", "assertive");
    Object.assign(overlay.style, {
      position: "absolute",
      inset: "0",
      zIndex: "4",
      display: "grid",
      placeItems: "center",
      padding: "1.5rem",
      color: "#ffffff",
      background: "rgba(15, 23, 42, 0.88)",
      fontWeight: "800",
      fontSize: "clamp(0.95rem, 2vw, 1.2rem)",
      textAlign: "center",
      lineHeight: "1.9",
      backdropFilter: "blur(4px)",
    });
    videoFrame.append(overlay);
  }

  overlay.textContent = message;
  overlay.style.background =
    tone === "warning" ? "rgba(146, 64, 14, 0.9)" : "rgba(127, 29, 29, 0.9)";
  overlay.hidden = false;
}

function hideConnectionOverlay() {
  const overlay = document.getElementById("connection-loss-overlay");
  if (overlay) {
    overlay.hidden = true;
  }
}

function clampUnit(value) {
  return Math.min(1, Math.max(0, Number(value)));
}

function getStudentAnnotationContext() {
  return elements.studentCanvas?.getContext("2d") || null;
}

function getStudentCanvasCssSize() {
  return {
    width: Math.round(elements.remoteVideo?.clientWidth || 0),
    height: Math.round(elements.remoteVideo?.clientHeight || 0),
  };
}

function drawStudentSegment(segment) {
  const context = getStudentAnnotationContext();
  const { width, height } = getStudentCanvasCssSize();
  if (!context || width < 1 || height < 1) {
    return;
  }

  context.save();
  context.beginPath();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = segment.color;
  context.lineWidth = Number(segment.lineWidth);
  context.moveTo(clampUnit(segment.x0) * width, clampUnit(segment.y0) * height);
  context.lineTo(clampUnit(segment.x1) * width, clampUnit(segment.y1) * height);
  context.stroke();
  context.restore();
}

function redrawStudentBoard() {
  const context = getStudentAnnotationContext();
  const { width, height } = getStudentCanvasCssSize();
  if (!context || width < 1 || height < 1) {
    return;
  }

  context.clearRect(0, 0, width, height);
  receivedAnnotationSegments.forEach(drawStudentSegment);
}

function resizeStudentCanvas() {
  const canvas = elements.studentCanvas;
  const { width, height } = getStudentCanvasCssSize();
  if (!canvas || width < 1 || height < 1) {
    return;
  }

  const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
  const backingWidth = Math.round(width * pixelRatio);
  const backingHeight = Math.round(height * pixelRatio);

  if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
    canvas.width = backingWidth;
    canvas.height = backingHeight;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    getStudentAnnotationContext()?.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }

  redrawStudentBoard();
}

function clearStudentBoard() {
  receivedAnnotationSegments.length = 0;
  const context = getStudentAnnotationContext();
  const { width, height } = getStudentCanvasCssSize();
  context?.clearRect(0, 0, width, height);
}

function isValidAnnotationSegment(data) {
  return (
    data &&
    typeof data.color === "string" &&
    /^#[0-9a-fA-F]{6}$/.test(data.color) &&
    [data.x0, data.y0, data.x1, data.y1].every(
      (value) => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 1
    ) &&
    Number.isFinite(Number(data.lineWidth)) &&
    Number(data.lineWidth) >= 1 &&
    Number(data.lineWidth) <= 12
  );
}

function initializeStudentCanvas() {
  elements.remoteVideo?.addEventListener("loadedmetadata", resizeStudentCanvas);
  window.addEventListener("resize", resizeStudentCanvas);
  resizeStudentCanvas();
}

const MAX_CHAT_MESSAGE_LENGTH = 800;

function normalizeChatMessage(value) {
  return typeof value === "string" ? value.trim().slice(0, MAX_CHAT_MESSAGE_LENGTH) : "";
}

const CHAT_URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>]+/giu;

function parseChatUrl(value) {
  const trimmed = String(value || "").replace(/[.,!؟،؛:;)]*$/u, "");
  const withProtocol = /^www\./iu.test(trimmed) ? `https://${trimmed}` : trimmed;

  try {
    const parsed = new URL(withProtocol);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed : null;
  } catch {
    return null;
  }
}

function isFacebookUrl(parsedUrl) {
  const host = parsedUrl.hostname.toLowerCase().replace(/^www\./u, "");
  return host === "facebook.com" || host.endsWith(".facebook.com") || host === "fb.watch" || host === "fb.com";
}

function openChatLinkInSeparateView(event, url) {
  const parsedUrl = parseChatUrl(url);
  if (!parsedUrl) {
    return;
  }

  // Never replace the live-class page. Opening a separate browser view keeps
  // the WebRTC page and its current peer connection intact behind the link.
  event.preventDefault();
  const openedWindow = window.open(parsedUrl.href, "_blank", "noopener,noreferrer");

  if (!openedWindow) {
    // Some mobile browsers ignore window features but still honor a normal
    // anchor target. Reuse the existing user gesture without navigating away
    // from the classroom page.
    const temporaryLink = document.createElement("a");
    temporaryLink.href = parsedUrl.href;
    temporaryLink.target = "_blank";
    temporaryLink.rel = "noopener noreferrer";
    document.body.append(temporaryLink);
    temporaryLink.click();
    temporaryLink.remove();
  }
}

function appendChatBodyWithLinks(container, message) {
  const text = String(message || "");
  let cursor = 0;

  for (const match of text.matchAll(CHAT_URL_PATTERN)) {
    const rawUrl = match[0];
    const displayUrl = rawUrl.replace(/[.,!؟،؛:;)]*$/u, "");
    const matchIndex = match.index ?? 0;
    const parsedUrl = parseChatUrl(displayUrl);

    if (!parsedUrl) {
      continue;
    }

    if (matchIndex > cursor) {
      container.append(document.createTextNode(text.slice(cursor, matchIndex)));
    }

    const link = document.createElement("a");
    link.className = "chat-external-link";
    link.href = parsedUrl.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = displayUrl;
    link.title = isFacebookUrl(parsedUrl)
      ? "فتح منشور Facebook في تبويب مستقل مع إبقاء الحصة مفتوحة"
      : "فتح الرابط في تبويب مستقل";
    link.addEventListener("click", (event) => openChatLinkInSeparateView(event, parsedUrl.href));
    container.append(link);
    if (displayUrl.length < rawUrl.length) {
      container.append(document.createTextNode(rawUrl.slice(displayUrl.length)));
    }
    cursor = matchIndex + rawUrl.length;
  }

  if (cursor < text.length || !container.childNodes.length) {
    container.append(document.createTextNode(text.slice(cursor)));
  }
}

function isViewingLatestMessages(container, threshold = 36) {
  return container.scrollHeight - container.scrollTop - container.clientHeight <= threshold;
}

function appendStudentChatMessage({ sender, message = "", kind, imageUrl = null }) {
  const safeMessage = normalizeChatMessage(message);
  if ((!safeMessage && !imageUrl) || !elements.chatBox) {
    return;
  }

  // Match modern messengers: follow the newest message only while the viewer
  // is already at the bottom. Scrolling upward keeps older messages in place.
  const shouldFollowNewestMessage = isViewingLatestMessages(elements.chatBox);
  elements.chatEmpty?.remove();

  const bubble = document.createElement("article");
  bubble.className = `student-chat-message ${kind === "teacher" ? "teacher-reply" : "own-message"}`;

  const senderLabel = document.createElement("strong");
  senderLabel.className = "student-chat-sender";
  senderLabel.textContent = sender;

  bubble.append(senderLabel);

  if (safeMessage) {
    const body = document.createElement("span");
    body.className = "student-chat-body";
    appendChatBodyWithLinks(body, safeMessage);
    bubble.append(body);
  }

  if (imageUrl) {
    const image = document.createElement("img");
    image.className = "student-chat-image";
    image.src = imageUrl;
    image.alt = "صورة سؤال أو واجب مرفقة";
    image.loading = "lazy";
    image.addEventListener("click", () => openChatLinkInSeparateView({ preventDefault() {} }, imageUrl));
    bubble.append(image);
  }
  elements.chatBox.append(bubble);

  if (shouldFollowNewestMessage) {
    requestAnimationFrame(() => {
      elements.chatBox.scrollTop = elements.chatBox.scrollHeight;
    });
  }
}

function clearStudentChat() {
  if (!elements.chatBox) {
    return;
  }

  renderedQuestionImageUrls.forEach((url) => URL.revokeObjectURL(url));
  renderedQuestionImageUrls.clear();
  elements.chatBox.replaceChildren();
  const empty = document.createElement("p");
  empty.id = "chat-empty";
  empty.className = "student-chat-empty";
  empty.textContent = "اكتب سؤالك وسيظهر رد الأستاذ هنا.";
  elements.chatBox.append(empty);
  elements.chatEmpty = empty;
}

function updateChatControls() {
  const canSend = joinedClass && !isJoining && !isRecoveringStream && socket.connected;
  const hasQuestionImage = Boolean(selectedQuestionImageFile);
  elements.chatInput.disabled = !canSend;
  elements.questionImageInput.disabled = !canSend;
  elements.captureQuestionButton.disabled = !canSend;
  elements.chatSendButton.disabled = !canSend || (!normalizeChatMessage(elements.chatInput.value) && !hasQuestionImage);
}

function clearSelectedQuestionImage() {
  if (selectedQuestionImagePreviewUrl) {
    URL.revokeObjectURL(selectedQuestionImagePreviewUrl);
  }
  selectedQuestionImagePreviewUrl = null;
  selectedQuestionImageFile = null;
  if (elements.questionImageInput) elements.questionImageInput.value = "";
  if (elements.questionImagePreviewImage) elements.questionImagePreviewImage.src = "";
  if (elements.questionImagePreview) elements.questionImagePreview.hidden = true;
  updateChatControls();
}

function selectQuestionImage(file) {
  if (!file) return;

  if (!ACCEPTED_QUESTION_IMAGE_TYPES.has(file.type)) {
    setViewerStatus("صورة السؤال يجب أن تكون بصيغة JPG أو PNG أو WEBP.", "error");
    clearSelectedQuestionImage();
    return;
  }
  if (file.size > MAX_QUESTION_IMAGE_SIZE_BYTES) {
    setViewerStatus("حجم صورة السؤال يجب ألا يتجاوز 5 ميغابايت.", "error");
    clearSelectedQuestionImage();
    return;
  }

  if (selectedQuestionImagePreviewUrl) URL.revokeObjectURL(selectedQuestionImagePreviewUrl);
  selectedQuestionImageFile = file;
  selectedQuestionImagePreviewUrl = URL.createObjectURL(file);
  elements.questionImagePreviewImage.src = selectedQuestionImagePreviewUrl;
  elements.questionImagePreview.hidden = false;
  updateChatControls();
}

async function uploadQuestionImage(file) {
  const token = sessionStorage.getItem("parentToken");
  if (!token) throw new Error("انتهت جلسة الدخول. أعد الدخول للمتابعة.");

  const formData = new FormData();
  formData.append("image", file, file.name || "question.jpg");
  formData.append("studentId", studentId);
  formData.append("level", level);

  const response = await fetch("/api/live-chat/question-image", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.data?.imageId) {
    throw new Error(payload.error || "تعذر رفع صورة السؤال.");
  }
  return payload.data.imageId;
}

async function sendStudentChatMessage(event) {
  event.preventDefault();

  const message = normalizeChatMessage(elements.chatInput.value);
  const imageFile = selectedQuestionImageFile;
  if (!joinedClass || isJoining || (!message && !imageFile)) {
    return;
  }

  elements.chatSendButton.disabled = true;
  elements.captureQuestionButton.disabled = true;

  try {
    let imageId = null;
    let localImageUrl = null;
    if (imageFile) {
      imageId = await uploadQuestionImage(imageFile);
      localImageUrl = URL.createObjectURL(imageFile);
      renderedQuestionImageUrls.add(localImageUrl);
    }

    await emitWithAcknowledgement("student_send_message", {
      level,
      studentName,
      message,
      imageId,
    });

    appendStudentChatMessage({ sender: "أنا", message, kind: "student", imageUrl: localImageUrl });
    elements.chatInput.value = "";
    clearSelectedQuestionImage();
    // Keep the question controls unobstructed after sending. The chat itself
    // confirms delivery by displaying the submitted question or image.
  } catch (error) {
    console.error("Unable to send student chat message:", error);
    setViewerStatus(error.message || "تعذر إرسال السؤال.", "error");
  } finally {
    updateChatControls();
  }
}

function setButtonLabel(button, label) {
  const labelElement = button.querySelector("span");
  if (labelElement) {
    labelElement.textContent = label;
  }
}

function setRaisedHandState({ waiting = false } = {}) {
  const canRequest = joinedClass && !microphonePermissionGranted;
  elements.raiseHandButton.hidden = !canRequest || waiting;
  elements.raiseHandButton.disabled = !canRequest;
  elements.handWaitingActions.hidden = !waiting;
}

function updateMicControl() {
  // Microphone state is intentionally controlled by the teacher only. The
  // student never receives a visible control that can mute an approved track.
  elements.toggleMicButton.style.display = "none";
  elements.toggleMicButton.disabled = true;
}

function clearHandResetTimer() {
  if (handResetTimer) {
    window.clearTimeout(handResetTimer);
    handResetTimer = null;
  }
}

function stopLocalAudio() {
  if (localAudioStream) {
    localAudioStream.getTracks().forEach((track) => track.stop());
  }

  localAudioStream = undefined;
  microphonePermissionGranted = false;
  microphonePrepared = false;
  isPreparingMicrophone = false;
  isRequestingMicrophone = false;
  updateMicControl();
}

/**
 * Runs only from the learner's intentional join click when possible. It asks
 * the browser for microphone access once, immediately turns the local track
 * off, and keeps it private until the teacher explicitly opens the mic.
 */
async function prepareStudentMicrophone() {
  if (microphonePrepared || isPreparingMicrophone || !navigator.mediaDevices?.getUserMedia) {
    return;
  }

  isPreparingMicrophone = true;
  try {
    localAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localAudioStream.getAudioTracks().forEach((track) => {
      track.enabled = false;
    });
    microphonePrepared = true;
    setViewerStatus("تم تجهيز المايك للحصة. لن يعمل إلا عند سماح الأستاذ.", "live");
  } catch (error) {
    microphonePrepared = false;
    if (error?.name === "NotAllowedError") {
      setViewerStatus("يمكنك متابعة الحصة بصوت الأستاذ. لن يعمل مايكك إلا بعد السماح للمتصفح.", "warning");
    } else if (error?.name === "NotFoundError") {
      setViewerStatus("لم يتم العثور على مايك متاح. ستتابع الحصة بصوت الأستاذ.", "warning");
    }
  } finally {
    isPreparingMicrophone = false;
    updateMicControl();
  }
}

function updateRemoteAudioControl() {
  const hasLiveRemoteAudio = Boolean(
    remoteMediaStream?.getAudioTracks().some((track) => track.readyState === "live")
  );

  if (!elements.enableAudioButton) {
    return;
  }

  elements.enableAudioButton.hidden = !hasLiveRemoteAudio || !elements.remoteVideo.muted;
}

async function startTeacherAudio({ userInitiated = false } = {}) {
  if (!remoteMediaStream || isAttemptingTeacherAudio) {
    return false;
  }

  isAttemptingTeacherAudio = true;
  if (elements.enableAudioButton) elements.enableAudioButton.disabled = true;
  elements.remoteVideo.muted = false;

  try {
    await elements.remoteVideo.play();
    if (userInitiated) {
      setViewerStatus("صوت الأستاذ يعمل الآن.", "live");
    }
    return true;
  } catch (error) {
    // Some mobile browsers forbid audible autoplay after navigation. Keep the
    // lesson visible, show one prominent fallback, and never interrupt WebRTC.
    console.warn("Unable to start teacher audio automatically:", error);
    elements.remoteVideo.muted = true;
    if (userInitiated) {
      setViewerStatus("تعذر تشغيل الصوت. اضغط الزر الظاهر داخل البث مرة واحدة.", "warning");
    } else {
      setViewerStatus("صوت الأستاذ جاهز. إن لم يبدأ تلقائياً اضغط الزر الكبير داخل البث مرة واحدة.", "warning");
    }
    return false;
  } finally {
    isAttemptingTeacherAudio = false;
    if (elements.enableAudioButton) elements.enableAudioButton.disabled = false;
    updateRemoteAudioControl();
  }
}

async function enableTeacherAudio() {
  await startTeacherAudio({ userInitiated: true });
}

function resetRemoteMedia() {
  remoteMediaStream = undefined;
  pendingRemoteAudioTracks.length = 0;
  elements.remoteVideo.srcObject = null;
  elements.remoteVideo.muted = true;
  isAttemptingTeacherAudio = false;
  updateRemoteAudioControl();
}

function addUniqueTrack(stream, track) {
  const alreadyAdded = stream.getTracks().some((currentTrack) => currentTrack.id === track.id);
  if (!alreadyAdded) {
    stream.addTrack(track);
  }
}

function attachTeacherTrack(event) {
  const track = event.track;
  if (!track) {
    return;
  }

  // The teacher sends exactly one display-video track. Do not assign an audio
  // only MediaStream to the video element first: some browsers then leave the
  // element in a permanent loading state when the video track arrives later.
  if (track.kind === "audio" && !remoteMediaStream) {
    pendingRemoteAudioTracks.push(track);
    track.addEventListener("ended", updateRemoteAudioControl, { once: true });
    track.addEventListener("unmute", updateRemoteAudioControl);
    return;
  }

  if (track.kind === "video" && !remoteMediaStream) {
    remoteMediaStream = new MediaStream([track]);
    pendingRemoteAudioTracks.splice(0).forEach((audioTrack) => {
      if (audioTrack.readyState === "live") {
        addUniqueTrack(remoteMediaStream, audioTrack);
      }
    });
    elements.remoteVideo.srcObject = remoteMediaStream;
    // Attempt audible playback first. When a browser allows it, the learner
    // hears the teacher without discovering a separate audio button.
    elements.remoteVideo.muted = false;
  } else if (remoteMediaStream) {
    addUniqueTrack(remoteMediaStream, track);
  }

  if (track.kind === "video") {
    requestAnimationFrame(resizeStudentCanvas);
    clearRecoveryTimer();
    recoveryAttempts = 0;
    isRecoveringStream = false;
    elements.placeholder.hidden = true;
    hideConnectionOverlay();
    updateChatControls();
    setViewerStatus("صورة الحصة المباشرة متصلة.", "live");
  }

  track.addEventListener("ended", () => {
    remoteMediaStream?.removeTrack(track);
    updateRemoteAudioControl();
  }, { once: true });
  track.addEventListener("unmute", updateRemoteAudioControl);
  updateRemoteAudioControl();

  // First try the teacher's voice automatically. A single, highly visible
  // fallback is kept only for browsers that enforce an audible-autoplay block.
  void startTeacherAudio();
}

function clearRecoveryTimer() {
  if (recoveryTimer) {
    window.clearTimeout(recoveryTimer);
    recoveryTimer = null;
  }
}

function scheduleClassRecovery(delayMs = 1_000) {
  if (!joinedClass || recoveryTimer || recoveryAttempts >= MAX_RECOVERY_ATTEMPTS) {
    return;
  }

  recoveryTimer = window.setTimeout(() => {
    recoveryTimer = null;
    void joinClass({ rejoin: true });
  }, delayMs);
}

/** Keep the same viewer page alive while a fresh WebRTC offer is requested. */
function beginStreamRecovery(message) {
  if (!joinedClass && !isJoining) {
    return;
  }

  clearHandResetTimer();
  closePeerConnection();
  resetRemoteMedia();
  isJoining = false;
  joinedClass = true;
  isRecoveringStream = true;
  elements.joinButton.hidden = true;
  elements.joinButton.disabled = true;
  setButtonLabel(elements.joinButton, "جارٍ استعادة البث…");
  elements.raiseHandButton.hidden = true;
  updateChatControls();
  setPlaceholder("جارٍ استعادة الحصة", message || "سيُعاد الاتصال بالبث تلقائياً دون تحديث الصفحة.");
  setViewerStatus(message || "انقطع البث مؤقتاً. جارٍ استعادته تلقائياً…", "warning");
  showConnectionOverlay(message || "انقطع البث مؤقتاً. جارٍ استعادته تلقائياً…", "warning");
  scheduleClassRecovery(Math.min(1_000 * (2 ** recoveryAttempts), 8_000));
}

function attachStudentMeshAudioTrack(event) {
  const track = event.track;
  if (!track || track.kind !== "audio") {
    return;
  }

  if (!remoteMediaStream) {
    pendingRemoteAudioTracks.push(track);
  } else {
    addUniqueTrack(remoteMediaStream, track);
  }

  track.addEventListener("ended", () => {
    remoteMediaStream?.removeTrack(track);
    updateRemoteAudioControl();
  }, { once: true });
  track.addEventListener("unmute", updateRemoteAudioControl);
  updateRemoteAudioControl();
  void startTeacherAudio();
}

function closeStudentAudioMeshPeer(peerSocketId) {
  const meshPeer = studentAudioMeshPeers.get(peerSocketId);
  if (meshPeer) {
    meshPeer.onicecandidate = null;
    meshPeer.ontrack = null;
    meshPeer.onconnectionstatechange = null;
    if (meshPeer.signalingState !== "closed") {
      meshPeer.close();
    }
  }

  studentAudioMeshPeers.delete(peerSocketId);
  studentAudioMeshSenders.delete(peerSocketId);
  pendingStudentAudioMeshIce.delete(peerSocketId);
  pendingStudentAudioMeshRecipients.delete(peerSocketId);
}

function closeAllStudentAudioMeshPeers() {
  Array.from(studentAudioMeshPeers.keys()).forEach(closeStudentAudioMeshPeer);
  pendingStudentAudioMeshRecipients.clear();
  pendingStudentAudioMeshIce.clear();
}

function createStudentAudioMeshPeer(peerSocketId) {
  const existingPeer = studentAudioMeshPeers.get(peerSocketId);
  if (existingPeer && existingPeer.signalingState !== "closed") {
    return existingPeer;
  }

  closeStudentAudioMeshPeer(peerSocketId);
  const meshPeer = new RTCPeerConnection(rtcConfig);
  studentAudioMeshPeers.set(peerSocketId, meshPeer);

  meshPeer.onicecandidate = (event) => {
    if (!event.candidate || !socket.connected) {
      return;
    }
    socket.emit("student_audio_mesh_ice", {
      targetSocketId: peerSocketId,
      candidate: event.candidate.toJSON(),
    });
  };

  meshPeer.ontrack = attachStudentMeshAudioTrack;
  meshPeer.onconnectionstatechange = () => {
    if (meshPeer.connectionState === "failed" || meshPeer.connectionState === "closed") {
      closeStudentAudioMeshPeer(peerSocketId);
    }
  };

  return meshPeer;
}

async function flushStudentAudioMeshIce(peerSocketId) {
  const meshPeer = studentAudioMeshPeers.get(peerSocketId);
  const queuedCandidates = pendingStudentAudioMeshIce.get(peerSocketId) || [];
  if (!meshPeer?.remoteDescription || !queuedCandidates.length) {
    return;
  }

  pendingStudentAudioMeshIce.delete(peerSocketId);
  for (const candidate of queuedCandidates) {
    try {
      if (candidate) {
        await meshPeer.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } catch (error) {
      console.warn("Unable to apply classmate audio ICE candidate:", error);
    }
  }
}

async function openStudentAudioMeshRecipient(peerSocketId) {
  const audioTrack = localAudioStream?.getAudioTracks().find((track) => track.readyState === "live");
  if (!microphonePermissionGranted || !audioTrack || !peerSocketId || !socket.connected) {
    return false;
  }

  const meshPeer = createStudentAudioMeshPeer(peerSocketId);
  let sender = studentAudioMeshSenders.get(peerSocketId);
  if (!sender) {
    sender = meshPeer.addTrack(audioTrack, localAudioStream);
    studentAudioMeshSenders.set(peerSocketId, sender);
  } else if (sender.track?.id !== audioTrack.id) {
    await sender.replaceTrack(audioTrack);
  }

  if (meshPeer.signalingState !== "stable") {
    pendingStudentAudioMeshRecipients.add(peerSocketId);
    return false;
  }

  const offer = await meshPeer.createOffer();
  await meshPeer.setLocalDescription(offer);
  await emitWithAcknowledgement("student_audio_mesh_offer", {
    targetSocketId: peerSocketId,
    sdp: meshPeer.localDescription,
  });
  return true;
}

function disableStudentAudioMeshSenders() {
  for (const sender of studentAudioMeshSenders.values()) {
    sender.replaceTrack(null).catch(() => {});
  }
}

async function openPendingStudentAudioMeshRecipients() {
  const recipients = Array.from(pendingStudentAudioMeshRecipients);
  pendingStudentAudioMeshRecipients.clear();

  for (const peerSocketId of recipients) {
    try {
      await openStudentAudioMeshRecipient(peerSocketId);
    } catch (error) {
      console.warn("Unable to open classmate audio channel:", error);
      pendingStudentAudioMeshRecipients.add(peerSocketId);
    }
  }
}

function closePeerConnection() {
  closeAllStudentAudioMeshPeers();
  if (pc) {
    pc.onicecandidate = null;
    pc.ontrack = null;
    pc.onnegotiationneeded = null;
    pc.onconnectionstatechange = null;
    pc.oniceconnectionstatechange = null;

    if (pc.signalingState !== "closed") {
      pc.close();
    }
  }

  pc = undefined;
  teacherSocketId = null;
  pendingIceCandidates.length = 0;
  isMakingRenegotiationOffer = false;
  microphoneOfferSent = false;
  microphoneNegotiated = false;
}

/**
 * The page is returned to its private idle state when the teacher ends class,
 * the socket disconnects, or the browser starts unloading.
 */
function resetViewerState({ message, mode = "neutral", showJoin = true } = {}) {
  clearHandResetTimer();
  clearRecoveryTimer();
  isRecoveringStream = false;
  recoveryAttempts = 0;
  closePeerConnection();
  stopLocalAudio();
  clearStudentBoard();
  joinedClass = false;
  isJoining = false;

  resetRemoteMedia();
  // The learner never needs a manual join control inside the live classroom.
  // The button remains hidden for backwards-compatible controller references.
  elements.joinButton.hidden = true;
  elements.joinButton.disabled = true;

  elements.raiseHandButton.hidden = true;
  setRaisedHandState({ waiting: false });
  updateMicControl();
  clearStudentChat();
  updateChatControls();

  setPlaceholder(
    mode === "error" ? "تعذر استمرار الحصة" : "الحصة ليست نشطة الآن",
    message || "يمكنك المحاولة مرة أخرى عند بدء الأستاذ للحصة."
  );
  setViewerStatus(message || "جاهز للانضمام", mode);
}

/**
 * Use acknowledgements for join and microphone renegotiation events so the UI
 * can recover if the server rejects a room/role transition.
 */
function emitWithAcknowledgement(eventName, payload, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    if (!socket.connected) {
      reject(new Error("الاتصال بخادم الحصص غير متاح حالياً."));
      return;
    }

    const timeoutId = window.setTimeout(() => {
      reject(new Error("انتهت مهلة الاستجابة من الخادم."));
    }, timeoutMs);

    socket.emit(eventName, payload, (response) => {
      window.clearTimeout(timeoutId);

      if (response?.ok) {
        resolve(response);
        return;
      }

      reject(
        new Error(
          response?.message || response?.error || "تعذر تنفيذ الطلب من الخادم."
        )
      );
    });
  });
}

async function negotiateStudentMicrophone() {
  if (
    !microphonePermissionGranted ||
    !localAudioStream?.getAudioTracks().length ||
    !teacherSocketId ||
    !pc ||
    microphoneOfferSent ||
    microphoneNegotiated ||
    isMakingRenegotiationOffer ||
    pc.signalingState !== "stable"
  ) {
    return;
  }

  isMakingRenegotiationOffer = true;

  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await emitWithAcknowledgement("webrtc_renegotiation_offer", {
      targetSocketId: teacherSocketId,
      sdp: pc.localDescription,
    });

    microphoneOfferSent = true;
    setViewerStatus("جارٍ ربط مايكك بالأستاذ…", "warning");
  } catch (error) {
    console.error("Unable to negotiate the approved microphone track:", error);
    microphoneOfferSent = false;
    setViewerStatus("تعذر تشغيل المايك مع الحصة. حاول رفع اليد مرة أخرى.", "error");
  } finally {
    isMakingRenegotiationOffer = false;
  }
}

function createViewerPeerConnection() {
  closePeerConnection();

  pc = new RTCPeerConnection(rtcConfig);

  pc.onicecandidate = (event) => {
    if (!event.candidate || !teacherSocketId || !socket.connected) {
      return;
    }

    socket.emit("webrtc_ice_candidate", {
      targetSocketId: teacherSocketId,
      candidate: event.candidate.toJSON(),
    });
  };

  /**
   * A teacher may send the display, camera, and microphone as separate streams.
   * Merge every received track into a single playback stream so the student
   * always gets the display and all available audio tracks, independent of the
   * browser's ontrack event ordering.
   */
  pc.ontrack = attachTeacherTrack;

  // Browsers may coalesce or delay negotiationneeded. The track-addition path
  // calls negotiateStudentMicrophone directly as the reliable primary route;
  // this handler remains a safe fallback.
  pc.onnegotiationneeded = () => {
    void negotiateStudentMicrophone();
  };

  pc.onconnectionstatechange = () => {
    if (!pc) {
      return;
    }

    if (pc.connectionState === "failed") {
      beginStreamRecovery("انقطع اتصال البث. جارٍ استعادته تلقائياً…");
    }
  };

  pc.oniceconnectionstatechange = () => {
    if (!pc) {
      return;
    }

    const { iceConnectionState } = pc;

    if (iceConnectionState === "connected" || iceConnectionState === "completed") {
      clearRecoveryTimer();
      recoveryAttempts = 0;
      isRecoveringStream = false;
      hideConnectionOverlay();
      updateChatControls();
      return;
    }

    if (iceConnectionState === "disconnected") {
      showConnectionOverlay("اتصال البث غير مستقر. جارٍ محاولة الاستعادة…", "warning");
      setViewerStatus("اتصال البث غير مستقر. جارٍ محاولة الاستعادة…", "warning");
      scheduleClassRecovery(3_000);
      return;
    }

    if (iceConnectionState === "failed") {
      beginStreamRecovery("فشل اتصال البث. جارٍ إعادة الاتصال تلقائياً…");
    }
  };

  return pc;
}

async function flushPendingIceCandidates() {
  if (!pc || !pc.remoteDescription) {
    return;
  }

  const queuedCandidates = pendingIceCandidates.splice(0);

  for (const candidate of queuedCandidates) {
    try {
      if (candidate) {
        await pc.addIceCandidate(candidate);
      }
    } catch (error) {
      console.warn("Unable to apply a queued teacher ICE candidate:", error);
    }
  }
}

/**
 * Request microphone access only after explicit server-delivered teacher
 * approval. The audio track is never requested at join time.
 */
async function enableApprovedMicrophone() {
  if (!microphonePermissionGranted || isRequestingMicrophone) {
    return;
  }

  if (!pc || !teacherSocketId) {
    setViewerStatus("سيُفعّل المايك فور اتصال البث.", "warning");
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    setViewerStatus("هذا المتصفح لا يدعم تشغيل المايك للحصة.", "error");
    return;
  }

  const existingTrack = localAudioStream?.getAudioTracks()[0];
  if (existingTrack) {
    existingTrack.enabled = true;
    const isAlreadyAttached = pc.getSenders().some((sender) => sender.track?.id === existingTrack.id);
    if (!isAlreadyAttached) {
      pc.addTrack(existingTrack, localAudioStream);
    }
    updateMicControl();
    await negotiateStudentMicrophone();
    await openPendingStudentAudioMeshRecipients();
    return;
  }

  isRequestingMicrophone = true;
  updateMicControl();

  try {
    localAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    microphonePrepared = true;

    // The peer might have been closed while the permission prompt was open.
    if (!pc || !teacherSocketId || !joinedClass) {
      stopLocalAudio();
      return;
    }

    localAudioStream.getAudioTracks().forEach((track) => {
      pc.addTrack(track, localAudioStream);
    });

    updateMicControl();
    // Do not depend only on negotiationneeded: explicitly create the offer so
    // the approved microphone works consistently across browsers.
    await negotiateStudentMicrophone();
    await openPendingStudentAudioMeshRecipients();
  } catch (error) {
    console.error("Unable to access student microphone:", error);
    microphonePermissionGranted = false;
    updateMicControl();

    if (error?.name === "NotAllowedError") {
      setViewerStatus("لم تسمح للمتصفح بالوصول إلى المايك.", "error");
    } else if (error?.name === "NotFoundError") {
      setViewerStatus("لم يتم العثور على مايك متاح.", "error");
    } else {
      setViewerStatus("تعذر تشغيل المايك الآن.", "error");
    }
  } finally {
    isRequestingMicrophone = false;
    updateMicControl();
  }
}

async function joinClass({ rejoin = false, prepareMicrophone = false } = {}) {
  // A user-initiated click is the best moment to obtain browser mic permission.
  // Automatic recovery and direct reconnects never request it unexpectedly.
  if (!rejoin && prepareMicrophone) {
    await prepareStudentMicrophone();
  }

  if ((joinedClass && !isRecoveringStream) || isJoining) {
    return;
  }

  if (!socket.connected) {
    if (rejoin || isRecoveringStream) {
      scheduleClassRecovery(1_000);
      return;
    }
    if (initialAutoJoinPending) {
      elements.joinButton.hidden = true;
      setViewerStatus("جارٍ الاتصال بالخادم للدخول إلى الحصة…", "warning");
      return;
    }
    setViewerStatus("تعذر الانضمام لأن الاتصال بالخادم غير متاح.", "error");
    return;
  }

  // Mark the local state before emitting. The server may notify the teacher,
  // who can send a direct WebRTC offer before the room-join acknowledgement
  // returns to this browser.
  joinedClass = true;
  isJoining = true;
  if (!rejoin) {
    clearStudentChat();
  }
  updateChatControls();
  hideConnectionOverlay();
  elements.joinButton.disabled = true;
  setButtonLabel(elements.joinButton, rejoin ? "جارٍ استعادة البث…" : "جارٍ الانضمام…");
  setPlaceholder(
    rejoin ? "جارٍ استعادة الحصة" : "بانتظار البث المباشر",
    rejoin ? "يتم طلب بث جديد من الأستاذ تلقائياً." : "تم إرسال طلب الانضمام إلى الأستاذ."
  );
  setViewerStatus(rejoin ? "جارٍ استعادة اتصال البث…" : "بانتظار البث من الأستاذ…", "warning");

  try {
    await emitWithAcknowledgement("student_join_room", { level, studentId, rejoin });

    isJoining = false;
    isRecoveringStream = false;
    recoveryAttempts = 0;
    consumeDirectClassEntry();
    clearRecoveryTimer();
    elements.joinButton.hidden = true;
    elements.raiseHandButton.hidden = false;
    setRaisedHandState({ waiting: false });
    updateChatControls();
    setViewerStatus(rejoin ? "تمت إعادة الانضمام. جارٍ استقبال البث…" : "انضممت إلى الحصة. جارٍ استقبال بث الأستاذ…", "warning");
  } catch (error) {
    console.error("Unable to join classroom:", error);
    isJoining = false;
    const joinErrorMessage = error.message || "تعذر الانضمام إلى الحصة.";
    const isLiveAccessBlocked = joinErrorMessage.includes("لم تقم بالدفع");
    const deniedSubject = joinErrorMessage.includes("فيزياء")
      ? "PHYSICS"
      : joinErrorMessage.includes("رياضيات")
        ? "MATH"
        : null;
    const isSubscriptionUpgradeBlocked =
      joinErrorMessage.includes("مخصصة لأصحاب الاشتراك المدفوع") || Boolean(deniedSubject);
    const isIdentityBlocked =
      joinErrorMessage.includes("انتظار تأكيد هوية البطاقة") ||
      joinErrorMessage.includes("رفع بطاقة جديدة");
    const isTemporaryRecovery = rejoin || isRecoveringStream || joinErrorMessage.includes("يعيد الاتصال");

    if (
      isTemporaryRecovery &&
      !isLiveAccessBlocked &&
      !isSubscriptionUpgradeBlocked &&
      !isIdentityBlocked &&
      recoveryAttempts < MAX_RECOVERY_ATTEMPTS
    ) {
      recoveryAttempts += 1;
      joinedClass = true;
      isRecoveringStream = true;
      elements.joinButton.hidden = true;
      setViewerStatus("الأستاذ يعيد الاتصال. جارٍ إعادة المحاولة تلقائياً…", "warning");
      showConnectionOverlay("الأستاذ يعيد الاتصال. جارٍ إعادة المحاولة تلقائياً…", "warning");
      scheduleClassRecovery(Math.min(1_000 * (2 ** recoveryAttempts), 8_000));
      return;
    }

    joinedClass = false;
    isRecoveringStream = false;

    // `room_unavailable` already switches the page into its automatic waiting
    // lobby. Do not overwrite that state with a manual join button here.
    if (waitingForNextClass) {
      return;
    }

    updateChatControls();
    setViewerStatus(joinErrorMessage, "error");
    setPlaceholder(
      isSubscriptionUpgradeBlocked
        ? "ترقية الاشتراك مطلوبة"
        : isLiveAccessBlocked || isIdentityBlocked
          ? "دخول الحصة غير متاح"
          : "الحصة غير متاحة",
      isLiveAccessBlocked || isSubscriptionUpgradeBlocked || isIdentityBlocked
        ? joinErrorMessage
        : "بانتظار بدء الأستاذ للحصة تلقائياً."
    );

    if (isSubscriptionUpgradeBlocked) {
      openSubscriptionUpgradeModal(deniedSubject || "university");
      return;
    }

    if (!isLiveAccessBlocked && !isIdentityBlocked) {
      waitForNextLiveClass("الحصة غير نشطة الآن. ستنضم تلقائياً عند بدء الأستاذ للحصة.");
    }
  }
}

function raiseHand() {
  if (!joinedClass || !socket.connected) {
    return;
  }

  clearHandResetTimer();
  setRaisedHandState({ waiting: true });
  setViewerStatus("تم إرسال طلب التحدث إلى الأستاذ.", "warning");

  socket.emit("student_raise_hand", { level, studentName }, (response) => {
    if (!response?.ok) {
      setRaisedHandState({ waiting: false });
      setViewerStatus(
        response?.message || response?.error || "تعذر إرسال طلب التحدث.",
        "error"
      );
      return;
    }

    // يبقى الطلب ظاهراً حتى يوافق الأستاذ أو يختار التلميذ «تنزيل اليد».
  });
}

function lowerHand() {
  if (!joinedClass || !socket.connected) {
    return;
  }

  clearHandResetTimer();
  setRaisedHandState({ waiting: false });
  socket.emit("student_lower_hand", { level }, () => {});
  setViewerStatus("تم تنزيل اليد. يمكنك رفعها من جديد عند الحاجة.", "neutral");
}

// --- Socket.io classroom and direct signaling events. ---

socket.on("connect", () => {
  if (didLoseSocketConnection) {
    didLoseSocketConnection = false;
    if (joinedClass || isRecoveringStream) {
      setViewerStatus("عاد الاتصال بالخادم. جارٍ استعادة الحصة تلقائياً…", "warning");
      scheduleClassRecovery(250);
      return;
    }
  }

  if (waitingForNextClass) {
    waitForNextLiveClass();
    return;
  }

  if (initialAutoJoinPending && !joinedClass && !isJoining) {
    elements.joinButton.hidden = true;
    setViewerStatus("جارٍ الدخول إلى الحصة مباشرة…", "warning");
    void joinClass({ prepareMicrophone: true });
    return;
  }

  if (!joinedClass && !isJoining) {
    setViewerStatus("جاهز للانضمام", "neutral");
  }
});

socket.on("connect_error", () => {
  setViewerStatus("تعذر الاتصال بخادم الحصص المباشرة.", "error");
});

socket.on("room_joined", (data = {}) => {
  if (data.role === "student") {
    waitingForNextClass = false;
    teacherSocketId = data.teacherSocketId || teacherSocketId;
    clearStudentBoard();
    requestAnimationFrame(resizeStudentCanvas);
  }
});

// Passive waiting viewers receive this from their level lobby when the teacher
// starts the next class. Rejoin occurs inside the current page with no button.
socket.on("live_class_started", (data = {}) => {
  if (data.level === level) {
    joinClassAutomaticallyFromLobby();
  }
});

socket.on("live_class_resumed", (data = {}) => {
  if (data.level === level) {
    joinClassAutomaticallyFromLobby();
  }
});

socket.on("receive_draw_data", (data = {}) => {
  if (!joinedClass || !isValidAnnotationSegment(data)) {
    return;
  }

  const segment = {
    x0: clampUnit(data.x0),
    y0: clampUnit(data.y0),
    x1: clampUnit(data.x1),
    y1: clampUnit(data.y1),
    color: data.color,
    lineWidth: Number(data.lineWidth),
  };

  receivedAnnotationSegments.push(segment);
  drawStudentSegment(segment);
});

socket.on("board_cleared", () => {
  clearStudentBoard();
});

socket.on("teacher_message_received", (data = {}) => {
  if (!joinedClass || !data?.message) {
    return;
  }

  appendStudentChatMessage({
    sender: "الأستاذ",
    message: data.message,
    kind: "teacher",
  });
});

socket.on("room_unavailable", (data = {}) => {
  resetViewerState({
    message: data.message || "لا توجد حصة مباشرة نشطة لهذا المستوى حالياً.",
    mode: "neutral",
    showJoin: false,
  });
  waitForNextLiveClass("لا توجد حصة الآن. ستفتح تلقائياً عند بدء الأستاذ للحصة.");
});

/**
 * Exact WebRTC viewer answer sequence: build a connection, set the teacher's
 * offer as remote SDP, set an answer as local SDP, then relay the answer to the
 * only authorized remote peer: `fromSocketId`.
 */
socket.on("classroom_track_state", (data = {}) => {
  if (!joinedClass || data.type !== "student_audio") {
    return;
  }

  // The actual audio sender arrives through the teacher's immediately following
  // renegotiation offer. This room-wide signal is only a lightweight state hint;
  // it never requires the learner to refresh or press Join again.
  if (data.enabled) {
    setViewerStatus("جارٍ توصيل صوت تلميذ بالحصة…", "live");
  }
});

socket.on("webrtc_offer", async (data = {}) => {
  const { fromSocketId, sdp } = data;

  if (!joinedClass || !fromSocketId || !sdp) {
    return;
  }

  try {
    const canReuseExistingConnection =
      pc &&
      teacherSocketId === fromSocketId &&
      pc.signalingState === "stable" &&
      pc.connectionState !== "closed";

    // createViewerPeerConnection() closes stale state and therefore clears the
    // stored target socket ID. Assign the teacher ID only *after* that cleanup;
    // otherwise the student's SDP answer is sent with a null target and the
    // teacher never completes the WebRTC handshake.
    const peerConnection = canReuseExistingConnection ? pc : createViewerPeerConnection();
    teacherSocketId = fromSocketId;

    // ICE restarts arrive as a fresh teacher offer. Reusing the existing peer
    // preserves the rendered screen and audio instead of briefly blanking the
    // classroom while the network route is recovered.
    await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
    await flushPendingIceCandidates();

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    await emitWithAcknowledgement("webrtc_answer", {
      targetSocketId: teacherSocketId,
      sdp: peerConnection.localDescription,
    });

    // A permission event can theoretically arrive before the direct offer.
    // In that rare case, request and attach the mic after the initial answer.
    if (microphonePermissionGranted) {
      await enableApprovedMicrophone();
    }
  } catch (error) {
    console.error("Unable to answer teacher WebRTC offer:", error);
    beginStreamRecovery("تعذر اتصال البث. جارٍ إعادة المحاولة تلقائياً…");
  }
});

socket.on("webrtc_ice_candidate", async (data = {}) => {
  const { fromSocketId, candidate } = data;

  // Discard any unexpected candidate rather than accepting signaling from an
  // unrecognized client. This preserves the one-teacher viewer topology.
  if (!fromSocketId || (teacherSocketId && fromSocketId !== teacherSocketId)) {
    return;
  }

  if (!pc || !pc.remoteDescription) {
    pendingIceCandidates.push(candidate);
    return;
  }

  try {
    if (candidate) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  } catch (error) {
    console.warn("Unable to add teacher ICE candidate:", error);
  }
});

socket.on("webrtc_renegotiation_answer", async (data = {}) => {
  const { fromSocketId, sdp } = data;

  if (!pc || !sdp || fromSocketId !== teacherSocketId) {
    return;
  }

  try {
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    await flushPendingIceCandidates();
    microphoneNegotiated = true;
    microphoneOfferSent = true;
    updateMicControl();
    setViewerStatus("صوت المايك متصل بالحصة.", "live");
  } catch (error) {
    console.error("Unable to apply microphone renegotiation answer:", error);
    setViewerStatus("تعذر تشغيل صوت المايك مع الحصة.", "error");
  }
});

socket.on("student_audio_mesh_open", async (data = {}) => {
  const recipients = Array.isArray(data.recipients) ? data.recipients : [];
  for (const peerSocketId of recipients) {
    if (peerSocketId) {
      pendingStudentAudioMeshRecipients.add(peerSocketId);
    }
  }

  if (microphonePermissionGranted) {
    await openPendingStudentAudioMeshRecipients();
  }
});

socket.on("student_audio_mesh_offer", async (data = {}) => {
  const { fromSocketId, sdp } = data;
  if (!fromSocketId || !sdp) {
    return;
  }

  try {
    const meshPeer = createStudentAudioMeshPeer(fromSocketId);
    if (meshPeer.signalingState !== "stable") {
      return;
    }

    await meshPeer.setRemoteDescription(new RTCSessionDescription(sdp));
    await flushStudentAudioMeshIce(fromSocketId);
    const answer = await meshPeer.createAnswer();
    await meshPeer.setLocalDescription(answer);
    await emitWithAcknowledgement("student_audio_mesh_answer", {
      targetSocketId: fromSocketId,
      sdp: meshPeer.localDescription,
    });
  } catch (error) {
    console.warn("Unable to answer a classmate audio offer:", error);
    closeStudentAudioMeshPeer(fromSocketId);
  }
});

socket.on("student_audio_mesh_answer", async (data = {}) => {
  const { fromSocketId, sdp } = data;
  const meshPeer = studentAudioMeshPeers.get(fromSocketId);
  if (!meshPeer || !sdp || meshPeer.signalingState === "closed") {
    return;
  }

  try {
    await meshPeer.setRemoteDescription(new RTCSessionDescription(sdp));
    await flushStudentAudioMeshIce(fromSocketId);
  } catch (error) {
    console.warn("Unable to apply a classmate audio answer:", error);
    closeStudentAudioMeshPeer(fromSocketId);
  }
});

socket.on("student_audio_mesh_ice", async (data = {}) => {
  const { fromSocketId, candidate } = data;
  if (!fromSocketId || candidate === undefined) {
    return;
  }

  const meshPeer = studentAudioMeshPeers.get(fromSocketId);
  if (!meshPeer || !meshPeer.remoteDescription) {
    const queuedCandidates = pendingStudentAudioMeshIce.get(fromSocketId) || [];
    queuedCandidates.push(candidate);
    pendingStudentAudioMeshIce.set(fromSocketId, queuedCandidates);
    return;
  }

  try {
    if (candidate) {
      await meshPeer.addIceCandidate(new RTCIceCandidate(candidate));
    }
  } catch (error) {
    console.warn("Unable to add classmate audio ICE candidate:", error);
  }
});

socket.on("student_audio_mesh_closed", (data = {}) => {
  const speakerSocketId = data.speakerSocketId;
  if (!speakerSocketId) {
    return;
  }

  if (speakerSocketId === socket.id) {
    disableStudentAudioMeshSenders();
    closeAllStudentAudioMeshPeers();
    return;
  }
  closeStudentAudioMeshPeer(speakerSocketId);
});

socket.on("permission_granted", async () => {
  if (!joinedClass) {
    return;
  }

  microphonePermissionGranted = true;
  clearHandResetTimer();
  // Resolve the student's request immediately. The waiting controls disappear
  // and the teacher-owned microphone track is opened without a self-mute UI.
  setRaisedHandState({ waiting: false });
  elements.raiseHandButton.hidden = true;
  elements.handWaitingActions.hidden = true;
  updateMicControl();
  await enableApprovedMicrophone();
});

socket.on("microphone_revoked", () => {
  clearHandResetTimer();
  microphonePermissionGranted = false;

  const audioTrack = localAudioStream?.getAudioTracks()[0];
  if (audioTrack) {
    audioTrack.enabled = false;
  }
  disableStudentAudioMeshSenders();

  setRaisedHandState({ waiting: false });
  elements.handWaitingActions.hidden = true;
  updateMicControl();
  setViewerStatus("أغلق الأستاذ المايك. يمكنك رفع اليد عند الحاجة.", "neutral");
});

socket.on("teacher_reconnecting", () => {
  beginStreamRecovery("غادر الأستاذ الاستوديو أو انقطع اتصاله. الحصة محفوظة وجارٍ انتظار عودته تلقائياً…");
});

socket.on("teacher_reconnected", () => {
  beginStreamRecovery("عاد الأستاذ. جارٍ ربط البث من جديد…");
  scheduleClassRecovery(100);
});

socket.on("room_recovering", (data = {}) => {
  beginStreamRecovery(data.message || "الحصة محفوظة. جارٍ انتظار عودة الأستاذ دون تحديث الصفحة…");
});

socket.on("teacher_disconnected", () => {
  beginStreamRecovery("انقطع اتصال الأستاذ. الحصة محفوظة وجارٍ الانتظار دون تحديث الصفحة…");
});

socket.on("class_ended", (data = {}) => {
  const teacherDisconnected = data.reason === "teacher_disconnected";

  resetViewerState({
    message: teacherDisconnected
      ? "انقطع اتصال الأستاذ، لذلك أُغلقت الحصة."
      : "أنهى الأستاذ الحصة المباشرة.",
    mode: "neutral",
    showJoin: false,
  });

  if (teacherDisconnected) {
    showConnectionOverlay("انقطع اتصال الأستاذ. جاري الانتظار...");
  } else {
    hideConnectionOverlay();
  }

  waitForNextLiveClass("انتهت الحصة. ستفتح الحصة التالية تلقائياً عند بدء الأستاذ.");
});

socket.on("classroom_error", (data = {}) => {
  if (data.message) {
    setViewerStatus(data.message, "error");
  }
});

socket.on("disconnect", () => {
  didLoseSocketConnection = true;

  if (joinedClass || isJoining || pc) {
    beginStreamRecovery("انقطع الاتصال بالخادم. جارٍ إعادة الاتصال تلقائياً…");
  }

  // Socket.io reconnects automatically; the connect handler asks the server
  // for a fresh WebRTC offer while preserving this same viewer page.
  showConnectionOverlay("انقطع الاتصال بالخادم. جارٍ إعادة الاتصال تلقائياً…", "warning");
});

// --- Viewer controls ---

// No manual join action is exposed in the viewer. The element is retained only
// for compatibility with existing page markup and remains hidden at all times.
elements.enableAudioButton?.addEventListener("click", enableTeacherAudio);
elements.remoteVideo?.addEventListener("volumechange", updateRemoteAudioControl);
elements.raiseHandButton.addEventListener("click", raiseHand);
elements.lowerHandButton?.addEventListener("click", lowerHand);
elements.chatForm.addEventListener("submit", sendStudentChatMessage);
elements.chatInput.addEventListener("input", updateChatControls);
elements.captureQuestionButton?.addEventListener("click", () => {
  if (!elements.captureQuestionButton.disabled) {
    elements.questionImageInput?.click();
  }
});
elements.questionImageInput?.addEventListener("change", () => {
  selectQuestionImage(elements.questionImageInput.files?.[0]);
});
elements.removeQuestionImageButton?.addEventListener("click", clearSelectedQuestionImage);
elements.subscriptionDeclineButton?.addEventListener("click", () => {
  closeSubscriptionUpgradeModal();
  window.location.assign("./index.html");
});
initializeStudentCanvas();

window.addEventListener("pagehide", () => {
  clearHandResetTimer();
  clearRecoveryTimer();
  clearSelectedQuestionImage();
  closeSubscriptionUpgradeModal();
  closePeerConnection();
  stopLocalAudio();
  clearStudentBoard();
});

if (!studentId || !studentName || !level) {
  // The viewer must be entered from the authenticated parent flow, not by
  // manually opening the URL without the student identity/session context.
  window.location.replace("./parent-login.html");
} else {
  elements.classLevelLabel.textContent = level;
  setPlaceholder("جاري الدخول إلى الحصة", "سيظهر بث الأستاذ تلقائيًا عند توفر الحصة.");
  updateMicControl();
  updateChatControls();
  setViewerStatus("جاري الاتصال بالحصة…", "neutral");

  // The parent dashboard may have already obtained this browser permission in
  // the exact classroom-entry click. Reopen a disabled local track now without
  // another prompt so teacher approval can work immediately later.
  const micWasPreparedDuringEntry = sessionStorage.getItem("studentMicPreflight") === "granted";
  sessionStorage.removeItem("studentMicPreflight");
  if (micWasPreparedDuringEntry) {
    void prepareStudentMicrophone();
  }

  // The viewer is opened only from a verified parent/student session. Join
  // automatically so the learner receives the teacher's live screen and audio
  // without having to discover or press an extra button.
  // Whether the viewer was opened from the direct button or restored normally,
  // wait for Socket.io instead of failing early when the page loads faster than
  // the signaling connection.
  initialAutoJoinPending = true;
  if (directClassEntryRequested) {
    elements.joinButton.hidden = true;
    setViewerStatus("جارٍ الدخول إلى الحصة مباشرة…", "warning");
  }

  window.setTimeout(() => {
    void joinClass();
  }, 0);
}
