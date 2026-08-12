"use strict";

/**
 * Student live-viewer controller.
 *
 * This page intentionally represents only one remote peer: the teacher. It
 * never receives, renders, or requests a list of any other students.
 */

const socket = io();

const rtcConfig = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

// Required viewer state for this phase.
let pc;
let localAudioStream;

let teacherSocketId = null;
let joinedClass = false;
let isJoining = false;
let isMakingRenegotiationOffer = false;
let microphonePermissionGranted = false;
let isRequestingMicrophone = false;
let handResetTimer = null;
let didLoseSocketConnection = false;
const pendingIceCandidates = [];

// The viewer stores teacher-provided normalized segments only; there is no
// student drawing input or outbound drawing event anywhere in this client.
const receivedAnnotationSegments = [];

const elements = {
  remoteVideo: document.getElementById("remote-video"),
  placeholder: document.getElementById("video-placeholder"),
  placeholderTitle: document.getElementById("placeholder-title"),
  placeholderDescription: document.getElementById("placeholder-description"),
  classLevelLabel: document.getElementById("class-level-label"),
  joinButton: document.getElementById("join-class-btn"),
  raiseHandButton: document.getElementById("raise-hand-btn"),
  toggleMicButton: document.getElementById("toggle-mic-btn"),
  status: document.getElementById("viewer-status"),
  statusText: document.getElementById("viewer-status-text"),
  studentCanvas: document.getElementById("student-canvas"),
  chatBox: document.getElementById("chat-box"),
  chatEmpty: document.getElementById("chat-empty"),
  chatForm: document.getElementById("chat-form"),
  chatInput: document.getElementById("chat-input"),
  chatSendButton: document.getElementById("chat-send-btn"),
};

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

/**
 * Keep status text accessible and use explicit modes rather than injecting
 * server-provided strings as markup.
 */
function setViewerStatus(message, mode = "neutral") {
  elements.statusText.textContent = message;
  elements.status.classList.toggle("is-live", mode === "live");
  elements.status.classList.toggle("is-warning", mode === "warning");
  elements.status.classList.toggle("is-error", mode === "error");
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

function appendStudentChatMessage({ sender, message, kind }) {
  const safeMessage = normalizeChatMessage(message);
  if (!safeMessage || !elements.chatBox) {
    return;
  }

  elements.chatEmpty?.remove();

  const bubble = document.createElement("article");
  bubble.className = `student-chat-message ${kind === "teacher" ? "teacher-reply" : "own-message"}`;

  const senderLabel = document.createElement("strong");
  senderLabel.className = "student-chat-sender";
  senderLabel.textContent = sender;

  const body = document.createElement("span");
  body.className = "student-chat-body";
  body.textContent = safeMessage;

  bubble.append(senderLabel, body);
  elements.chatBox.append(bubble);
  elements.chatBox.scrollTop = elements.chatBox.scrollHeight;
}

function clearStudentChat() {
  if (!elements.chatBox) {
    return;
  }

  elements.chatBox.replaceChildren();
  const empty = document.createElement("p");
  empty.id = "chat-empty";
  empty.className = "student-chat-empty";
  empty.textContent = "اكتب سؤالك وسيظهر رد الأستاذ هنا.";
  elements.chatBox.append(empty);
  elements.chatEmpty = empty;
}

function updateChatControls() {
  const canSend = joinedClass && !isJoining && socket.connected;
  elements.chatInput.disabled = !canSend;
  elements.chatSendButton.disabled = !canSend || !normalizeChatMessage(elements.chatInput.value);
}

async function sendStudentChatMessage(event) {
  event.preventDefault();

  const message = normalizeChatMessage(elements.chatInput.value);
  if (!joinedClass || isJoining || !message) {
    return;
  }

  elements.chatSendButton.disabled = true;

  try {
    await emitWithAcknowledgement("student_send_message", {
      level,
      studentName,
      message,
    });

    appendStudentChatMessage({ sender: "أنا", message, kind: "student" });
    elements.chatInput.value = "";
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
  elements.raiseHandButton.disabled = waiting;
  elements.raiseHandButton.classList.toggle("hand-raised", waiting);
  setButtonLabel(
    elements.raiseHandButton,
    waiting ? "في انتظار موافقة الأستاذ..." : "رفع اليد"
  );
}

function updateMicControl() {
  const audioTrack = localAudioStream?.getAudioTracks()[0];
  const isEnabled = Boolean(audioTrack?.enabled);

  elements.toggleMicButton.style.display = microphonePermissionGranted
    ? "inline-flex"
    : "none";
  elements.toggleMicButton.disabled = !audioTrack;
  elements.toggleMicButton.classList.toggle("mic-active", isEnabled);
  setButtonLabel(elements.toggleMicButton, isEnabled ? "إيقاف المايك" : "تشغيل المايك");
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
  isRequestingMicrophone = false;
  updateMicControl();
}

function closePeerConnection() {
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
}

/**
 * The page is returned to its private idle state when the teacher ends class,
 * the socket disconnects, or the browser starts unloading.
 */
function resetViewerState({ message, mode = "neutral", showJoin = true } = {}) {
  clearHandResetTimer();
  closePeerConnection();
  stopLocalAudio();
  clearStudentBoard();
  joinedClass = false;
  isJoining = false;

  elements.remoteVideo.srcObject = null;
  elements.joinButton.hidden = !showJoin;
  elements.joinButton.disabled = false;
  setButtonLabel(elements.joinButton, "انضمام للحصة");

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
   * The teacher sends the screen and optional camera as separate MediaStreams.
   * The first received stream is the classroom display stream, so it becomes
   * the primary theater video. Later tracks do not replace it with the camera.
   */
  pc.ontrack = (event) => {
    const incomingStream = event.streams?.[0];

    if (incomingStream && !elements.remoteVideo.srcObject) {
      elements.remoteVideo.srcObject = incomingStream;
      requestAnimationFrame(resizeStudentCanvas);
      elements.placeholder.hidden = true;
      hideConnectionOverlay();
      setViewerStatus("البث المباشر متصل.", "live");

      elements.remoteVideo.play().catch(() => {
        // Playback may require the user to press the browser's native play
        // control, which is already available on the video element.
      });
    }
  };

  /**
   * Adding a microphone track after teacher approval triggers this callback.
   * It creates a follow-up offer routed only to the remembered teacher socket.
   */
  pc.onnegotiationneeded = async () => {
    if (
      !microphonePermissionGranted ||
      !teacherSocketId ||
      !pc ||
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
    } catch (error) {
      console.error("Unable to renegotiate the approved microphone track:", error);
      setViewerStatus("تعذر تشغيل المايك مع الحصة.", "error");
    } finally {
      isMakingRenegotiationOffer = false;
    }
  };

  pc.onconnectionstatechange = () => {
    if (!pc) {
      return;
    }

    if (pc.connectionState === "failed") {
      resetViewerState({
        message: "انقطع اتصال البث. أعد الانضمام للمحاولة مرة أخرى.",
        mode: "error",
        showJoin: true,
      });
      showConnectionOverlay("اتصال البث غير مستقر. يرجى إعادة الانضمام للحصة.");
    }
  };

  pc.oniceconnectionstatechange = () => {
    if (!pc) {
      return;
    }

    const { iceConnectionState } = pc;

    if (iceConnectionState === "connected" || iceConnectionState === "completed") {
      hideConnectionOverlay();
      return;
    }

    if (iceConnectionState === "disconnected") {
      showConnectionOverlay("اتصال البث غير مستقر. جاري محاولة استعادة الاتصال...", "warning");
      setViewerStatus("اتصال البث غير مستقر. جاري محاولة الاستعادة...", "warning");
      return;
    }

    if (iceConnectionState === "failed") {
      resetViewerState({
        message: "فشل اتصال البث. أعد الانضمام للمحاولة مرة أخرى.",
        mode: "error",
        showJoin: true,
      });
      showConnectionOverlay("فشل اتصال البث. يرجى إعادة الانضمام للحصة.");
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
    updateMicControl();
    return;
  }

  isRequestingMicrophone = true;
  updateMicControl();

  try {
    localAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // The peer might have been closed while the permission prompt was open.
    if (!pc || !teacherSocketId || !joinedClass) {
      stopLocalAudio();
      return;
    }

    localAudioStream.getAudioTracks().forEach((track) => {
      pc.addTrack(track, localAudioStream);
    });

    updateMicControl();
    setViewerStatus("تم تشغيل المايك بعد موافقة الأستاذ.", "live");
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

async function joinClass() {
  if (joinedClass || isJoining) {
    return;
  }

  if (!socket.connected) {
    setViewerStatus("تعذر الانضمام لأن الاتصال بالخادم غير متاح.", "error");
    return;
  }

  // Mark the local state before emitting. The server may notify the teacher,
  // who can send a direct WebRTC offer before the room-join acknowledgement
  // returns to this browser.
  joinedClass = true;
  isJoining = true;
  clearStudentChat();
  updateChatControls();
  hideConnectionOverlay();
  elements.joinButton.disabled = true;
  setButtonLabel(elements.joinButton, "جارٍ الانضمام…");
  setPlaceholder("بانتظار البث المباشر", "تم إرسال طلب الانضمام إلى الأستاذ.");
  setViewerStatus("بانتظار البث من الأستاذ…", "warning");

  try {
    await emitWithAcknowledgement("student_join_room", { level, studentId });

    isJoining = false;
    elements.joinButton.hidden = true;
    elements.raiseHandButton.hidden = false;
    setRaisedHandState({ waiting: false });
    updateChatControls();
    setViewerStatus("انضممت إلى الحصة. بانتظار البث…", "warning");
  } catch (error) {
    console.error("Unable to join classroom:", error);
    joinedClass = false;
    isJoining = false;
    elements.joinButton.disabled = false;
    setButtonLabel(elements.joinButton, "انضمام للحصة");
    updateChatControls();
    setViewerStatus(error.message || "تعذر الانضمام إلى الحصة.", "error");
    setPlaceholder("الحصة غير متاحة", "تأكد من أن الأستاذ بدأ الحصة ثم حاول مرة أخرى.");
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

    // The button is temporary by design: the student can ask again later if
    // the teacher does not respond, but cannot spam repeated requests.
    handResetTimer = window.setTimeout(() => {
      if (!microphonePermissionGranted) {
        setRaisedHandState({ waiting: false });
      }
    }, 20_000);
  });
}

function toggleMicrophone() {
  const audioTrack = localAudioStream?.getAudioTracks()[0];
  if (!audioTrack) {
    return;
  }

  audioTrack.enabled = !audioTrack.enabled;
  updateMicControl();
  setViewerStatus(audioTrack.enabled ? "تم تشغيل المايك." : "تم إيقاف المايك.", "live");
}

// --- Socket.io classroom and direct signaling events. ---

socket.on("connect", () => {
  if (didLoseSocketConnection) {
    didLoseSocketConnection = false;
    hideConnectionOverlay();
    setViewerStatus("عاد الاتصال بالخادم. يمكنك الانضمام إلى الحصة عند جاهزيتها.", "neutral");
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
    teacherSocketId = data.teacherSocketId || teacherSocketId;
    clearStudentBoard();
    requestAnimationFrame(resizeStudentCanvas);
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
    mode: "error",
    showJoin: true,
  });
});

/**
 * Exact WebRTC viewer answer sequence: build a connection, set the teacher's
 * offer as remote SDP, set an answer as local SDP, then relay the answer to the
 * only authorized remote peer: `fromSocketId`.
 */
socket.on("webrtc_offer", async (data = {}) => {
  const { fromSocketId, sdp } = data;

  if (!joinedClass || !fromSocketId || !sdp) {
    return;
  }

  try {
    teacherSocketId = fromSocketId;
    const peerConnection = createViewerPeerConnection();

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
    setViewerStatus("تعذر اتصال البث. حاول الانضمام مرة أخرى.", "error");
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
    setViewerStatus("صوت المايك متصل بالحصة.", "live");
  } catch (error) {
    console.error("Unable to apply microphone renegotiation answer:", error);
    setViewerStatus("تعذر تشغيل صوت المايك مع الحصة.", "error");
  }
});

socket.on("permission_granted", async () => {
  if (!joinedClass) {
    return;
  }

  microphonePermissionGranted = true;
  clearHandResetTimer();
  elements.raiseHandButton.hidden = true;
  updateMicControl();
  await enableApprovedMicrophone();
});

socket.on("teacher_disconnected", () => {
  resetViewerState({
    message: "انقطع الاتصال بالأستاذ. جاري الانتظار...",
    mode: "error",
    showJoin: true,
  });
  showConnectionOverlay("انقطع الاتصال بالأستاذ. جاري الانتظار...");
});

socket.on("class_ended", (data = {}) => {
  const teacherDisconnected = data.reason === "teacher_disconnected";

  resetViewerState({
    message: teacherDisconnected
      ? "انقطع اتصال الأستاذ، لذلك أُغلقت الحصة."
      : "أنهى الأستاذ الحصة المباشرة.",
    mode: teacherDisconnected ? "error" : "neutral",
    showJoin: true,
  });

  if (teacherDisconnected) {
    showConnectionOverlay("انقطع الاتصال بالأستاذ. جاري الانتظار...");
  } else {
    hideConnectionOverlay();
  }
});

socket.on("classroom_error", (data = {}) => {
  if (data.message) {
    setViewerStatus(data.message, "error");
  }
});

socket.on("disconnect", () => {
  didLoseSocketConnection = true;

  if (joinedClass || isJoining || pc) {
    resetViewerState({
      message: "انقطع الاتصال بالخادم. يرجى التحقق من الإنترنت.",
      mode: "error",
      showJoin: true,
    });
  }

  // Socket.io will attempt reconnection automatically; the connect handler
  // restores a ready state once a fresh signaling connection is available.
  showConnectionOverlay("انقطع الاتصال بالخادم. يرجى التحقق من الإنترنت.");
});

// --- Viewer controls ---

elements.joinButton.addEventListener("click", joinClass);
elements.raiseHandButton.addEventListener("click", raiseHand);
elements.toggleMicButton.addEventListener("click", toggleMicrophone);
elements.chatForm.addEventListener("submit", sendStudentChatMessage);
elements.chatInput.addEventListener("input", updateChatControls);
initializeStudentCanvas();

window.addEventListener("pagehide", () => {
  clearHandResetTimer();
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
  setPlaceholder("انضم إلى الحصة عند جاهزيتك", "ستظهر مشاركة الأستاذ هنا بعد بدء البث.");
  updateMicControl();
  updateChatControls();
  setViewerStatus("جاهز للانضمام", "neutral");
}
