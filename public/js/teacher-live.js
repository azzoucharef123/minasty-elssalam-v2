"use strict";

/**
 * Teacher live-streaming controller.
 *
 * Every connected student receives a distinct RTCPeerConnection. The teacher's
 * display stream and optional camera/microphone stream are added to each of
 * those connections, while Socket.io forwards the SDP and ICE messages to the
 * exact target socket ID.
 */

// Socket.io is served by the Express server at /socket.io/socket.io.js.
const socket = io();

// STUN helps browsers discover a viable peer-to-peer route. A TURN server is
// still recommended for a production deployment where restrictive networks
// may block direct WebRTC connections.
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

// Required broadcaster state requested for this phase.
const peerConnections = Object.create(null);
let screenStream;
let cameraStream;

// Extra state used to make negotiation and cleanup predictable.
const pendingIceCandidates = Object.create(null);
const attendeeElements = new Map();
const iceDisconnectTimers = Object.create(null);
const ICE_DISCONNECT_GRACE_MS = 8_000;
let activeLevel = null;
let classActive = false;
let isStarting = false;
let isEnding = false;

// Annotation data is retained as normalized segments so a resize can redraw
// the same board correctly without depending on the previous canvas bitmap.
const annotationSegments = [];
let isDrawingAnnotation = false;
let previousAnnotationPoint = null;

const elements = {
  localVideo: document.getElementById("local-video"),
  cameraVideo: document.getElementById("camera-video"),
  cameraPip: document.getElementById("camera-pip"),
  stageEmptyState: document.getElementById("stage-empty-state"),
  attendeesList: document.getElementById("attendees-list"),
  attendeesEmpty: document.getElementById("attendees-empty"),
  attendeeCount: document.getElementById("attendee-count"),
  levelSelect: document.getElementById("level-select"),
  startButton: document.getElementById("start-class-btn"),
  toggleMicButton: document.getElementById("toggle-mic-btn"),
  toggleCameraButton: document.getElementById("toggle-camera-btn"),
  endClassButton: document.getElementById("end-class-btn"),
  liveStatus: document.getElementById("live-status"),
  liveStatusText: document.getElementById("live-status-text"),
  teacherCanvas: document.getElementById("teacher-canvas"),
  annotationColor: document.getElementById("annotation-color"),
  annotationLineWidth: document.getElementById("annotation-line-width"),
  clearBoardButton: document.getElementById("clear-board-btn"),
  chatBox: document.getElementById("chat-box"),
  chatEmpty: document.getElementById("chat-empty"),
  chatForm: document.getElementById("chat-form"),
  chatInput: document.getElementById("chat-input"),
  chatSendButton: document.getElementById("chat-send-btn"),
};

/**
 * Write a short, accessible status without rendering server/user text as HTML.
 * Supported modes are: neutral, live, and error.
 */
function setStudioStatus(message, mode = "neutral") {
  elements.liveStatusText.textContent = message;
  elements.liveStatus.classList.toggle("is-live", mode === "live");
  elements.liveStatus.classList.toggle("is-error", mode === "error");
}

const MAX_CHAT_MESSAGE_LENGTH = 800;

function normalizeChatMessage(value) {
  return typeof value === "string" ? value.trim().slice(0, MAX_CHAT_MESSAGE_LENGTH) : "";
}

/** Render all chat text through textContent to prevent injected markup. */
function appendTeacherChatMessage({ sender, message, kind }) {
  const safeMessage = normalizeChatMessage(message);
  if (!safeMessage || !elements.chatBox) {
    return;
  }

  elements.chatEmpty?.remove();

  const bubble = document.createElement("article");
  bubble.className = `chat-message ${kind === "teacher" ? "teacher-message" : "student-message"}`;

  const senderLabel = document.createElement("strong");
  senderLabel.className = "chat-message-sender";
  senderLabel.textContent = sender;

  const body = document.createElement("span");
  body.className = "chat-message-body";
  body.textContent = safeMessage;

  bubble.append(senderLabel, body);
  elements.chatBox.append(bubble);
  elements.chatBox.scrollTop = elements.chatBox.scrollHeight;
}

function clearTeacherChat() {
  if (!elements.chatBox) {
    return;
  }

  elements.chatBox.replaceChildren();
  const empty = document.createElement("p");
  empty.id = "chat-empty";
  empty.className = "chat-empty";
  empty.textContent = "لا توجد رسائل بعد.";
  elements.chatBox.append(empty);
  elements.chatEmpty = empty;
}

async function sendTeacherChatMessage(event) {
  event.preventDefault();

  const message = normalizeChatMessage(elements.chatInput.value);
  if (!classActive || !activeLevel || !message) {
    return;
  }

  elements.chatSendButton.disabled = true;

  try {
    await emitWithAcknowledgement("teacher_send_message", {
      level: activeLevel,
      message,
    });

    appendTeacherChatMessage({ sender: "أنا", message, kind: "teacher" });
    elements.chatInput.value = "";
  } catch (error) {
    console.error("Unable to send teacher chat message:", error);
    setStudioStatus(error.message || "تعذر إرسال الرسالة.", "error");
  } finally {
    updateControls();
  }
}

function setButtonLabel(button, label) {
  const labelElement = button.querySelector("span");
  if (labelElement) {
    labelElement.textContent = label;
  }
}

/** Clamp a normalized annotation coordinate to the valid canvas range. */
function clampUnit(value) {
  return Math.min(1, Math.max(0, Number(value)));
}

function getTeacherAnnotationContext() {
  return elements.teacherCanvas?.getContext("2d") || null;
}

function getTeacherCanvasCssSize() {
  const width = Math.round(elements.localVideo?.clientWidth || 0);
  const height = Math.round(elements.localVideo?.clientHeight || 0);
  return { width, height };
}

function drawTeacherSegment(segment) {
  const context = getTeacherAnnotationContext();
  const { width, height } = getTeacherCanvasCssSize();
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

function redrawTeacherBoard() {
  const context = getTeacherAnnotationContext();
  const { width, height } = getTeacherCanvasCssSize();
  if (!context || width < 1 || height < 1) {
    return;
  }

  context.clearRect(0, 0, width, height);
  annotationSegments.forEach(drawTeacherSegment);
}

/** Match the backing store to the displayed video while retaining existing ink. */
function resizeTeacherCanvas() {
  const canvas = elements.teacherCanvas;
  const { width, height } = getTeacherCanvasCssSize();
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
    const context = getTeacherAnnotationContext();
    context?.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }

  redrawTeacherBoard();
}

function getNormalizedTeacherPoint(event) {
  const rect = elements.teacherCanvas.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return null;
  }

  return {
    x: clampUnit((event.clientX - rect.left) / rect.width),
    y: clampUnit((event.clientY - rect.top) / rect.height),
  };
}

function makeAnnotationSegment(start, end) {
  return {
    x0: start.x,
    y0: start.y,
    x1: end.x,
    y1: end.y,
    color: elements.annotationColor.value,
    lineWidth: Number(elements.annotationLineWidth.value),
  };
}

function broadcastTeacherSegment(segment) {
  if (!classActive || !activeLevel || !socket.connected) {
    return;
  }

  socket.emit("draw_data", { level: activeLevel, ...segment });
}

function handleAnnotationMouseDown(event) {
  if (!classActive || isEnding || event.button !== 0) {
    return;
  }

  const point = getNormalizedTeacherPoint(event);
  if (!point) {
    return;
  }

  isDrawingAnnotation = true;
  previousAnnotationPoint = point;
  event.preventDefault();
}

function handleAnnotationMouseMove(event) {
  if (!isDrawingAnnotation || !previousAnnotationPoint) {
    return;
  }

  const point = getNormalizedTeacherPoint(event);
  if (!point) {
    return;
  }

  const segment = makeAnnotationSegment(previousAnnotationPoint, point);
  annotationSegments.push(segment);
  drawTeacherSegment(segment);
  broadcastTeacherSegment(segment);
  previousAnnotationPoint = point;
  event.preventDefault();
}

function stopAnnotationDrawing() {
  isDrawingAnnotation = false;
  previousAnnotationPoint = null;
}

function clearTeacherBoard({ broadcast = false } = {}) {
  annotationSegments.length = 0;
  const context = getTeacherAnnotationContext();
  const { width, height } = getTeacherCanvasCssSize();
  context?.clearRect(0, 0, width, height);
  stopAnnotationDrawing();

  if (broadcast && classActive && activeLevel && socket.connected) {
    socket.emit("clear_board", { level: activeLevel });
  }
}

function initializeTeacherCanvas() {
  const canvas = elements.teacherCanvas;
  if (!canvas) {
    return;
  }

  canvas.addEventListener("mousedown", handleAnnotationMouseDown);
  canvas.addEventListener("mousemove", handleAnnotationMouseMove);
  canvas.addEventListener("mouseup", stopAnnotationDrawing);
  canvas.addEventListener("mouseout", stopAnnotationDrawing);
  canvas.addEventListener("mouseleave", stopAnnotationDrawing);
  elements.clearBoardButton?.addEventListener("click", () => {
    clearTeacherBoard({ broadcast: true });
  });
  elements.localVideo?.addEventListener("loadedmetadata", resizeTeacherCanvas);
  window.addEventListener("resize", resizeTeacherCanvas);
  resizeTeacherCanvas();
}

function getAllAudioTracks() {
  return [screenStream, cameraStream]
    .filter(Boolean)
    .flatMap((stream) => stream.getAudioTracks());
}

function getCameraVideoTracks() {
  return cameraStream ? cameraStream.getVideoTracks() : [];
}

function updateControls() {
  const hasAudio = getAllAudioTracks().length > 0;
  const hasCamera = getCameraVideoTracks().length > 0;

  elements.startButton.disabled = isStarting || isEnding || classActive;
  elements.levelSelect.disabled = isStarting || isEnding || classActive;
  elements.toggleMicButton.disabled = !classActive || !hasAudio || isEnding;
  elements.toggleCameraButton.disabled = !classActive || !hasCamera || isEnding;
  elements.endClassButton.disabled = !classActive || isEnding;
  elements.clearBoardButton.disabled = !classActive || isEnding;
  elements.teacherCanvas.style.pointerEvents = classActive && !isEnding ? "auto" : "none";
  elements.chatInput.disabled = !classActive || isEnding;
  elements.chatSendButton.disabled = !classActive || isEnding || !normalizeChatMessage(elements.chatInput.value);

  elements.startButton.classList.toggle("is-live", classActive);
  setButtonLabel(
    elements.startButton,
    classActive ? "الحصة المباشرة نشطة" : "بدء الحصة المباشرة"
  );

  const audioIsEnabled = hasAudio && getAllAudioTracks().some((track) => track.enabled);
  setButtonLabel(elements.toggleMicButton, audioIsEnabled ? "إيقاف المايك" : "تشغيل المايك");

  const cameraIsEnabled =
    hasCamera && getCameraVideoTracks().some((track) => track.enabled);
  setButtonLabel(
    elements.toggleCameraButton,
    cameraIsEnabled ? "إيقاف الكاميرا" : "تشغيل الكاميرا"
  );
}

function updateAttendeeCount() {
  const count = attendeeElements.size;
  elements.attendeeCount.textContent = String(count);
  elements.attendeeCount.setAttribute("aria-label", `عدد الحضور: ${count}`);
  elements.attendeesEmpty.hidden = count > 0;
}

function displayInitials(name) {
  const words = String(name || "تلميذ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return words
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join("") || "ت";
}

/** Add or refresh a student item without exposing their socket ID visibly. */
function upsertAttendee(socketId, studentName = "تلميذ") {
  let item = attendeeElements.get(socketId);

  if (item) {
    item.querySelector(".attendee-name").textContent = studentName;
    item.querySelector(".attendee-avatar").textContent = displayInitials(studentName);
    return item;
  }

  item = document.createElement("li");
  item.className = "attendee-item";
  item.dataset.socketId = socketId;

  const avatar = document.createElement("span");
  avatar.className = "attendee-avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = displayInitials(studentName);

  const details = document.createElement("div");
  details.className = "attendee-details";

  const name = document.createElement("strong");
  name.className = "attendee-name";
  name.textContent = studentName;

  const state = document.createElement("span");
  state.className = "attendee-state";

  const stateDot = document.createElement("span");
  stateDot.className = "attendee-state-dot";
  stateDot.setAttribute("aria-hidden", "true");

  const stateLabel = document.createElement("span");
  stateLabel.textContent = "متصل الآن";

  state.append(stateDot, stateLabel);
  details.append(name, state);
  item.append(avatar, details);

  elements.attendeesList.append(item);
  attendeeElements.set(socketId, item);
  updateAttendeeCount();

  return item;
}

function removeAttendee(socketId) {
  const item = attendeeElements.get(socketId);
  if (item) {
    item.remove();
    attendeeElements.delete(socketId);
    updateAttendeeCount();
  }
}

function clearAttendees() {
  attendeeElements.forEach((item) => item.remove());
  attendeeElements.clear();
  updateAttendeeCount();
}

function clearIceDisconnectTimer(socketId) {
  if (iceDisconnectTimers[socketId]) {
    window.clearTimeout(iceDisconnectTimers[socketId]);
    delete iceDisconnectTimers[socketId];
  }
}

/**
 * Use one cleanup path for server-reported departures and local ICE failures.
 * It closes the RTCPeerConnection, clears pending candidates/timers, and removes
 * the matching attendance row so no ghost viewer remains in the studio.
 */
function removeStudentConnection(socketId, { statusMessage } = {}) {
  clearIceDisconnectTimer(socketId);
  closePeerConnection(socketId);
  removeAttendee(socketId);

  if (statusMessage && classActive) {
    setStudioStatus(statusMessage, "error");
  }
}

/**
 * Close one peer connection and remove all associated candidate state. This is
 * called both when a student disconnects and while ending the entire class.
 */
function closePeerConnection(socketId) {
  clearIceDisconnectTimer(socketId);
  const peerConnection = peerConnections[socketId];

  if (peerConnection) {
    peerConnection.onicecandidate = null;
    peerConnection.onconnectionstatechange = null;
    peerConnection.oniceconnectionstatechange = null;

    if (peerConnection.signalingState !== "closed") {
      peerConnection.close();
    }

    delete peerConnections[socketId];
  }

  delete pendingIceCandidates[socketId];
}

function closeAllPeerConnections() {
  Object.keys(peerConnections).forEach(closePeerConnection);
  Object.keys(pendingIceCandidates).forEach((socketId) => {
    delete pendingIceCandidates[socketId];
  });
}

/**
 * Add the classroom display and one reliable audio source to a new connection.
 * The camera preview remains local to the teacher. Sending a second video track
 * to viewers can make browsers select the camera instead of the shared screen,
 * leaving the classroom display blank or inconsistent. Prefer microphone audio;
 * use display/tab audio only when a microphone track is unavailable.
 */
function addTeacherTracks(peerConnection) {
  if (!screenStream) {
    return;
  }

  screenStream.getVideoTracks().forEach((track) => {
    peerConnection.addTrack(track, screenStream);
  });

  const microphoneTracks = cameraStream?.getAudioTracks() || [];
  const displayAudioTracks = screenStream.getAudioTracks();
  const audioTracks = microphoneTracks.length > 0 ? microphoneTracks : displayAudioTracks;
  const audioSourceStream = microphoneTracks.length > 0 ? cameraStream : screenStream;

  audioTracks.forEach((track) => {
    peerConnection.addTrack(track, audioSourceStream);
  });
}

/**
 * Create a fresh connection for one student. If a stale connection exists for
 * the same socket ID, close it first so renegotiation cannot reuse bad state.
 */
function createPeerConnection(studentSocketId) {
  closePeerConnection(studentSocketId);

  const peerConnection = new RTCPeerConnection(rtcConfig);
  peerConnections[studentSocketId] = peerConnection;
  pendingIceCandidates[studentSocketId] = [];

  addTeacherTracks(peerConnection);

  peerConnection.onicecandidate = (event) => {
    // `null` means ICE gathering is complete; it does not need a relay.
    if (!event.candidate || !classActive || !socket.connected) {
      return;
    }

    socket.emit("webrtc_ice_candidate", {
      targetSocketId: studentSocketId,
      candidate: event.candidate.toJSON(),
    });
  };

  peerConnection.onconnectionstatechange = () => {
    if (peerConnection.connectionState === "failed") {
      console.warn(`WebRTC connection failed for student ${studentSocketId}.`);
      removeStudentConnection(studentSocketId, {
        statusMessage: "انقطع اتصال أحد التلاميذ وتمت إزالة جلسته.",
      });
    }
  };

  peerConnection.oniceconnectionstatechange = () => {
    const { iceConnectionState } = peerConnection;

    if (iceConnectionState === "connected" || iceConnectionState === "completed") {
      clearIceDisconnectTimer(studentSocketId);
      return;
    }

    if (iceConnectionState === "failed") {
      console.warn(`ICE failed for student ${studentSocketId}.`);
      removeStudentConnection(studentSocketId, {
        statusMessage: "فشل اتصال أحد التلاميذ وتمت إزالة جلسته.",
      });
      return;
    }

    if (iceConnectionState === "disconnected" && !iceDisconnectTimers[studentSocketId]) {
      // Short network interruptions are common. Give ICE a brief recovery
      // window before closing the peer and removing the attendee.
      iceDisconnectTimers[studentSocketId] = window.setTimeout(() => {
        const currentPeer = peerConnections[studentSocketId];
        if (currentPeer?.iceConnectionState === "disconnected") {
          removeStudentConnection(studentSocketId, {
            statusMessage: "لم يعد اتصال أحد التلاميذ مستقراً وتمت إزالة جلسته.",
          });
        }
      }, ICE_DISCONNECT_GRACE_MS);
    }
  };

  return peerConnection;
}

/** Relay each queued ICE candidate only after an answer is applied. */
async function flushPendingIceCandidates(studentSocketId) {
  const peerConnection = peerConnections[studentSocketId];
  const candidates = pendingIceCandidates[studentSocketId] || [];

  if (!peerConnection || !peerConnection.remoteDescription) {
    return;
  }

  pendingIceCandidates[studentSocketId] = [];

  for (const candidate of candidates) {
    try {
      // A null candidate simply marks the end of ICE gathering and does not
      // need to be passed to addIceCandidate in this broadcaster flow.
      if (candidate) {
        await peerConnection.addIceCandidate(candidate);
      }
    } catch (error) {
      console.warn("Unable to add a queued ICE candidate:", error);
    }
  }
}

/**
 * Send an event with an acknowledgement timeout. This prevents a disabled UI
 * if the server is unavailable or a route is rejected by server-side checks.
 */
function emitWithAcknowledgement(eventName, payload, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    if (!socket.connected) {
      reject(new Error("الاتصال بالخادم غير متاح حالياً."));
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

/**
 * Generate and send a distinct SDP offer to the newly joined student. The
 * `makingOffer` flag prevents duplicated student_joined events from creating
 * overlapping offers against the same RTCPeerConnection.
 */
async function createAndSendOffer(studentSocketId) {
  if (!classActive || !screenStream) {
    return;
  }

  let peerConnection = peerConnections[studentSocketId];

  if (!peerConnection) {
    peerConnection = createPeerConnection(studentSocketId);
  }

  if (
    peerConnection.makingOffer ||
    peerConnection.signalingState !== "stable" ||
    peerConnection.connectionState === "closed"
  ) {
    return;
  }

  peerConnection.makingOffer = true;

  try {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    await emitWithAcknowledgement("webrtc_offer", {
      targetSocketId: studentSocketId,
      sdp: peerConnection.localDescription,
    });
  } catch (error) {
    console.error("Unable to create or relay a WebRTC offer:", error);
    setStudioStatus("تعذر ربط أحد التلاميذ بالبث.", "error");
    closePeerConnection(studentSocketId);
  } finally {
    if (peerConnections[studentSocketId]) {
      peerConnections[studentSocketId].makingOffer = false;
    }
  }
}

/** Stop every local media track and clear browser video previews. */
function stopLocalStreams() {
  [screenStream, cameraStream].filter(Boolean).forEach((stream) => {
    stream.getTracks().forEach((track) => {
      // Avoid invoking the screen-share ended handler during intentional cleanup.
      track.onended = null;
      track.stop();
    });
  });

  screenStream = undefined;
  cameraStream = undefined;
  elements.localVideo.srcObject = null;
  elements.cameraVideo.srcObject = null;
  elements.cameraPip.classList.remove("is-active");
  elements.stageEmptyState.hidden = false;
}

/**
 * Stop a class from a deliberate user action, a display-share stop, a server
 * class-ended event, or a socket disconnect. The method is idempotent so
 * multiple events during shutdown cannot cause duplicate room-end requests.
 */
async function endLiveClass({ notifyServer = true, statusMessage } = {}) {
  if (isEnding) {
    return;
  }

  const levelToEnd = activeLevel;
  const hadActiveClass = classActive;
  isEnding = true;
  classActive = false;
  updateControls();

  try {
    if (notifyServer && hadActiveClass && levelToEnd && socket.connected) {
      try {
        await emitWithAcknowledgement("teacher_end_class", { level: levelToEnd }, 5_000);
      } catch (error) {
        // The server's disconnect handler closes the class if the connection is
        // lost, so local privacy cleanup must proceed even when this ACK fails.
        console.warn("Unable to confirm class termination with server:", error);
      }
    }
  } finally {
    closeAllPeerConnections();
    clearAttendees();
    clearTeacherBoard({ broadcast: false });
    clearTeacherChat();
    stopLocalStreams();
    activeLevel = null;
    isEnding = false;
    updateControls();
    setStudioStatus(statusMessage || "تم إنهاء الحصة المباشرة.", "neutral");
  }
}

function getMediaErrorMessage(error, source) {
  if (error?.name === "NotAllowedError") {
    return `لم تسمح للمتصفح بالوصول إلى ${source}.`;
  }

  if (error?.name === "NotFoundError") {
    return `لم يتم العثور على جهاز مناسب لـ${source}.`;
  }

  if (error?.name === "NotReadableError") {
    return `يتعذر استخدام ${source} لأنه مستخدم من تطبيق آخر.`;
  }

  return `تعذر تشغيل ${source}. حاول مرة أخرى.`;
}

/**
 * Acquire display media first, then attempt optional camera/microphone media.
 * The class can safely continue with only the screen stream when camera access
 * is denied or a camera device is unavailable.
 */
async function startLiveClass() {
  if (classActive || isStarting || isEnding) {
    return;
  }

  if (!navigator.mediaDevices?.getDisplayMedia) {
    setStudioStatus("هذا المتصفح لا يدعم مشاركة الشاشة المطلوبة للبث.", "error");
    return;
  }

  if (!socket.connected) {
    setStudioStatus("تعذر بدء الحصة لأن الاتصال بالخادم غير متاح.", "error");
    return;
  }

  const selectedLevel = elements.levelSelect.value;
  isStarting = true;
  updateControls();
  setStudioStatus("بانتظار اختيار الشاشة للمشاركة…", "neutral");

  let cameraUnavailableMessage = "";

  try {
    // Screen sharing is mandatory for the broadcaster experience.
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 30, max: 30 } },
      audio: true,
    });

    if (screenStream.getVideoTracks().length === 0) {
      throw new Error("لم يتم اختيار شاشة للمشاركة.");
    }

    elements.localVideo.srcObject = screenStream;
    clearTeacherBoard({ broadcast: false });
    clearTeacherChat();
    requestAnimationFrame(resizeTeacherCanvas);
    elements.stageEmptyState.hidden = true;

    // If the user clicks the browser's native “Stop sharing” action, close the
    // classroom immediately instead of streaming a frozen or black screen.
    const displayTrack = screenStream.getVideoTracks()[0];
    displayTrack.onended = () => {
      if (classActive && !isEnding) {
        endLiveClass({
          notifyServer: true,
          statusMessage: "تم إيقاف مشاركة الشاشة، لذلك أُغلقت الحصة.",
        });
      }
    };

    // Camera/mic is intentionally optional. Failure is shown but does not
    // discard the successfully approved screen-share session.
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        elements.cameraVideo.srcObject = cameraStream;
        elements.cameraPip.classList.add("is-active");
      } catch (error) {
        cameraUnavailableMessage = getMediaErrorMessage(error, "الكاميرا أو المايك");
        console.warn("Camera/microphone is unavailable:", error);
      }
    }

    // Set state before emitting. This prevents a very fast student_joined event
    // from being ignored between the server joining the teacher room and its ACK.
    activeLevel = selectedLevel;
    classActive = true;

    await emitWithAcknowledgement("teacher_start_room", { level: selectedLevel });

    const baseMessage = `الحصة مباشرة الآن — ${selectedLevel}`;
    setStudioStatus(
      cameraUnavailableMessage ? `${baseMessage} (بدون كاميرا/مايك)` : baseMessage,
      "live"
    );
  } catch (error) {
    console.error("Unable to start live class:", error);
    classActive = false;
    activeLevel = null;
    closeAllPeerConnections();
    clearAttendees();
    stopLocalStreams();
    setStudioStatus(
      error?.message || getMediaErrorMessage(error, "مشاركة الشاشة"),
      "error"
    );
  } finally {
    isStarting = false;
    updateControls();
  }
}

function toggleMicrophone() {
  const audioTracks = getAllAudioTracks();
  if (!classActive || audioTracks.length === 0) {
    return;
  }

  const shouldEnable = !audioTracks.some((track) => track.enabled);
  audioTracks.forEach((track) => {
    track.enabled = shouldEnable;
  });

  setStudioStatus(shouldEnable ? "تم تشغيل المايك." : "تم إيقاف المايك.", "live");
  updateControls();
}

function toggleCamera() {
  const videoTracks = getCameraVideoTracks();
  if (!classActive || videoTracks.length === 0) {
    return;
  }

  const shouldEnable = !videoTracks.some((track) => track.enabled);
  videoTracks.forEach((track) => {
    track.enabled = shouldEnable;
  });

  setStudioStatus(shouldEnable ? "تم تشغيل الكاميرا." : "تم إيقاف الكاميرا.", "live");
  updateControls();
}

function markHandRaised(socketId, studentName) {
  const attendee = upsertAttendee(socketId, studentName);
  attendee.classList.add("is-hand-raised");

  if (!attendee.querySelector(".attendee-hand")) {
    const handLabel = document.createElement("span");
    handLabel.className = "attendee-hand";
    handLabel.textContent = "طلب التحدث";
    attendee.querySelector(".attendee-details").append(handLabel);
  }

  if (!attendee.querySelector(".attendee-mic-button")) {
    const approveButton = document.createElement("button");
    approveButton.type = "button";
    approveButton.className = "attendee-mic-button";
    approveButton.textContent = "قبول المايك";
    approveButton.addEventListener("click", () => {
      approveStudentMicrophone(socketId, approveButton);
    });
    attendee.append(approveButton);
  }
}

async function approveStudentMicrophone(socketId, button) {
  if (!classActive) {
    return;
  }

  button.disabled = true;
  button.textContent = "جارٍ القبول…";

  try {
    await emitWithAcknowledgement("teacher_approve_mic", {
      targetSocketId: socketId,
    });

    const attendee = attendeeElements.get(socketId);
    attendee?.classList.remove("is-hand-raised");
    attendee?.querySelector(".attendee-hand")?.remove();
    button.remove();
    setStudioStatus("تم منح إذن المايك للتلميذ.", "live");
  } catch (error) {
    console.error("Unable to approve student microphone:", error);
    button.disabled = false;
    button.textContent = "قبول المايك";
    setStudioStatus(error.message || "تعذر منح إذن المايك.", "error");
  }
}

// --- Classroom and signaling events from the Phase 7 Socket.io backend. ---

socket.on("connect", () => {
  if (!classActive) {
    setStudioStatus("الاستوديو جاهز", "neutral");
  }
});

socket.on("connect_error", () => {
  setStudioStatus("تعذر الاتصال بخادم الحصص المباشرة.", "error");
});

socket.on("room_ready", (data) => {
  if (data?.role === "teacher" && classActive) {
    setStudioStatus(`الحصة مباشرة الآن — ${data.level}`, "live");
  }
});

socket.on("student_joined", async (data = {}) => {
  const { socketId, studentName } = data;

  if (!classActive || !socketId) {
    return;
  }

  upsertAttendee(socketId, studentName || "تلميذ");
  await createAndSendOffer(socketId);
});

socket.on("webrtc_answer", async (data = {}) => {
  const { fromSocketId, sdp } = data;
  const peerConnection = peerConnections[fromSocketId];

  if (!peerConnection || !sdp) {
    return;
  }

  try {
    await peerConnection.setRemoteDescription(sdp);
    await flushPendingIceCandidates(fromSocketId);
  } catch (error) {
    console.error("Unable to apply a student WebRTC answer:", error);
    closePeerConnection(fromSocketId);
  }
});

/**
 * A teacher-approved student may add a microphone track after the initial
 * viewer connection is stable. Receive the student's follow-up offer, create
 * the matching answer, and relay it only to that same student.
 */
socket.on("webrtc_renegotiation_offer", async (data = {}) => {
  const { fromSocketId, sdp } = data;
  const peerConnection = peerConnections[fromSocketId];

  if (
    !classActive ||
    !peerConnection ||
    !sdp ||
    peerConnection.signalingState === "closed"
  ) {
    return;
  }

  try {
    // The student only creates this offer after the initial answer has settled.
    // If a stale/repeated offer arrives during another transition, ignore it
    // rather than corrupting the existing screen-stream connection.
    if (peerConnection.signalingState !== "stable") {
      return;
    }

    await peerConnection.setRemoteDescription(sdp);
    await flushPendingIceCandidates(fromSocketId);

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    await emitWithAcknowledgement("webrtc_renegotiation_answer", {
      targetSocketId: fromSocketId,
      sdp: peerConnection.localDescription,
    });
  } catch (error) {
    console.error("Unable to answer the student microphone renegotiation:", error);
    setStudioStatus("تعذر تشغيل صوت أحد التلاميذ.", "error");
  }
});

socket.on("webrtc_ice_candidate", async (data = {}) => {
  const { fromSocketId, candidate } = data;
  const peerConnection = peerConnections[fromSocketId];

  if (!fromSocketId || candidate === undefined) {
    return;
  }

  // ICE can arrive before the answer; queue it instead of throwing an
  // InvalidStateError from addIceCandidate.
  if (!peerConnection || !peerConnection.remoteDescription) {
    (pendingIceCandidates[fromSocketId] ||= []).push(candidate);
    return;
  }

  try {
    if (candidate) {
      await peerConnection.addIceCandidate(candidate);
    }
  } catch (error) {
    console.warn("Unable to add a student ICE candidate:", error);
  }
});

socket.on("hand_raised", (data = {}) => {
  if (!data.socketId || !classActive) {
    return;
  }

  markHandRaised(data.socketId, data.studentName || "تلميذ");
  setStudioStatus("هناك طلب جديد للتحدث.", "live");
});

socket.on("student_message_received", (data = {}) => {
  if (!classActive || !data?.message) {
    return;
  }

  appendTeacherChatMessage({
    sender: data.studentName || "تلميذ",
    message: data.message,
    kind: "student",
  });
});

socket.on("student_left", (data = {}) => {
  if (!data.socketId) {
    return;
  }

  removeStudentConnection(data.socketId);
});

socket.on("class_ended", (data = {}) => {
  if (!classActive || isEnding) {
    return;
  }

  endLiveClass({
    notifyServer: false,
    statusMessage:
      data.reason === "teacher_disconnected"
        ? "انقطع اتصال الأستاذ؛ تم إغلاق الحصة."
        : "تم إنهاء الحصة المباشرة.",
  });
});

socket.on("classroom_error", (data = {}) => {
  if (data.message) {
    setStudioStatus(data.message, "error");
  }
});

socket.on("disconnect", () => {
  if (classActive || screenStream || cameraStream) {
    endLiveClass({
      notifyServer: false,
      statusMessage: "انقطع الاتصال بالخادم؛ تم إيقاف البث للحفاظ على الخصوصية.",
    });
  }
});

// --- User controls ---

elements.startButton.addEventListener("click", startLiveClass);
elements.toggleMicButton.addEventListener("click", toggleMicrophone);
elements.toggleCameraButton.addEventListener("click", toggleCamera);
elements.endClassButton.addEventListener("click", () => {
  endLiveClass({ notifyServer: true });
});
elements.chatForm.addEventListener("submit", sendTeacherChatMessage);
elements.chatInput.addEventListener("input", updateControls);
initializeTeacherCanvas();

// Attempt a final room-end notification on page exit. The backend's disconnect
// handler is the reliable fallback if the browser cannot complete this emit.
window.addEventListener("pagehide", () => {
  if (classActive && activeLevel && socket.connected) {
    socket.emit("teacher_end_class", { level: activeLevel });
  }

  classActive = false;
  closeAllPeerConnections();
  clearTeacherBoard({ broadcast: false });
  stopLocalStreams();
});

updateAttendeeCount();
updateControls();
