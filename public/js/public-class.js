(() => {
  "use strict";

  const params = new URLSearchParams(window.location.search);
  const hostRoomId = (params.get("host") || "").trim();
  const hostToken = (params.get("token") || "").trim();
  const guestRoomId = (params.get("room") || "").trim();
  const isHost = Boolean(hostRoomId);
  const roomId = hostRoomId || guestRoomId;
  const roomPattern = /^[a-zA-Z0-9_-]{16,128}$/;
  const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
  const socket = io({ transports: ["websocket", "polling"] });
  const elements = {
    role: document.getElementById("public-role"),
    video: document.getElementById("public-video"),
    placeholder: document.getElementById("public-placeholder"),
    status: document.getElementById("public-status"),
    inviteBox: document.getElementById("invite-box"),
    inviteLink: document.getElementById("public-invite-link"),
    copyInviteLink: document.getElementById("copy-public-link"),
    startShare: document.getElementById("start-public-share"),
    endClass: document.getElementById("end-public-class"),
    chatMessages: document.getElementById("public-chat-messages"),
    chatForm: document.getElementById("public-chat-form"),
    chatInput: document.getElementById("public-chat-input"),
  };

  const peers = new Map();
  const guestIds = new Set();
  const pendingCandidates = new Map();
  let localStream = null;
  let remoteStream = null;
  let ended = false;

  function setStatus(text, kind = "") {
    elements.status.textContent = text;
    elements.status.className = `status ${kind}`.trim();
  }

  function addMessage(sender, message) {
    const item = document.createElement("article");
    item.className = "message";
    const label = document.createElement("strong");
    label.textContent = sender;
    const body = document.createElement("span");
    body.textContent = message;
    item.append(label, body);
    elements.chatMessages.append(item);
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
  }

  function showRemoteStream(stream) {
    remoteStream = stream;
    elements.video.srcObject = stream;
    elements.video.muted = false;
    elements.video.play().catch(() => {
      setStatus("اضغط على شاشة البث لتشغيل الصوت.");
    });
    elements.placeholder.hidden = true;
  }

  async function flushCandidates(peerId, pc) {
    const candidates = pendingCandidates.get(peerId) || [];
    pendingCandidates.delete(peerId);
    for (const candidate of candidates) {
      try { await pc.addIceCandidate(candidate); } catch (error) { console.warn("ICE candidate rejected", error); }
    }
  }

  function sendIce(targetSocketId, candidate) {
    socket.emit("public_webrtc_ice", { targetSocketId, candidate });
  }

  function closePeer(peerId) {
    const pc = peers.get(peerId);
    if (pc) {
      pc.ontrack = null;
      pc.onicecandidate = null;
      pc.close();
    }
    peers.delete(peerId);
    pendingCandidates.delete(peerId);
  }

  function makeHostPeer(guestSocketId) {
    closePeer(guestSocketId);
    const pc = new RTCPeerConnection(rtcConfig);
    peers.set(guestSocketId, pc);
    if (localStream) localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
    pc.onicecandidate = ({ candidate }) => sendIce(guestSocketId, candidate);
    return pc;
  }

  async function offerGuest(guestSocketId) {
    if (!isHost || !localStream || !localStream.getTracks().length) return;
    const pc = makeHostPeer(guestSocketId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("public_webrtc_offer", { targetSocketId: guestSocketId, sdp: pc.localDescription });
  }

  async function startShare() {
    if (!isHost || ended) return;
    try {
      setStatus("اختر الشاشة وفعّل مشاركة الصوت إن رغبت…");
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const combined = new MediaStream();
      display.getTracks().forEach((track) => combined.addTrack(track));
      try {
        const microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
        microphone.getAudioTracks().forEach((track) => combined.addTrack(track));
      } catch (_) {
        // The screen stream can still be broadcast if the host declines microphone access.
      }
      localStream?.getTracks().forEach((track) => track.stop());
      localStream = combined;
      // The host needs a local preview too. Mute it locally to prevent an
      // audio feedback loop; remote guests still receive all broadcast tracks.
      elements.video.srcObject = localStream;
      elements.video.muted = true;
      elements.video.play().catch(() => {});
      elements.placeholder.hidden = true;
      elements.startShare.textContent = "المشاركة جارية";
      elements.startShare.disabled = true;
      setStatus("الحصة العامة بدأت. يمكن لأي شخص لديه الرابط الانضمام الآن.");
      display.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (!ended) setStatus("توقفت مشاركة الشاشة. يمكنك إنهاء الحصة أو إنشاء دعوة جديدة.", "error");
      });
      await Promise.all([...guestIds].map((id) => offerGuest(id)));
    } catch (error) {
      setStatus("تعذر بدء المشاركة. امنح المتصفح إذن مشاركة الشاشة ثم حاول مرة أخرى.", "error");
    }
  }

  function endClass() {
    if (!isHost || ended) return;
    socket.emit("public_host_end", {}, (result) => {
      if (!result?.ok) setStatus(result?.error || "تعذر إنهاء الحصة.", "error");
    });
  }

  async function initialiseHost() {
    elements.role.textContent = "أنت المضيف";
    elements.inviteBox.hidden = false;
    elements.startShare.hidden = false;
    elements.endClass.hidden = false;
    const url = new URL(window.location.href);
    url.search = `?room=${encodeURIComponent(roomId)}`;
    elements.inviteLink.value = url.toString();
    socket.emit("public_host_start", { roomId, hostToken }, async (result) => {
      if (!result?.ok) return setStatus(result?.error || "تعذر إنشاء رابط الدعوة.", "error");
      (result.guests || []).forEach((id) => guestIds.add(id));
      setStatus("رابط الدعوة جاهز. ابدأ مشاركة الشاشة لبدء الحصة.");
    });
  }

  function initialiseGuest() {
    elements.role.textContent = "حاضر بدعوة عامة";
    socket.emit("public_join_room", { roomId }, (result) => {
      if (!result?.ok) return setStatus(result?.error || "تعذر فتح رابط الدعوة.", "error");
      setStatus(result.isLive ? "بانتظار استقبال البث…" : "بانتظار أن يبدأ الأستاذ الحصة…");
    });
  }

  socket.on("connect", () => {
    if (!roomPattern.test(roomId) || (isHost && !roomPattern.test(hostToken))) {
      setStatus("رابط الدعوة غير صالح.", "error");
      return;
    }
    if (isHost) initialiseHost(); else initialiseGuest();
  });

  socket.on("public_guest_joined", ({ socketId }) => {
    if (!isHost || !socketId) return;
    guestIds.add(socketId);
    offerGuest(socketId).catch(() => setStatus("تعذر ربط أحد الحاضرين.", "error"));
  });

  socket.on("public_guest_left", ({ socketId }) => {
    guestIds.delete(socketId);
    closePeer(socketId);
  });

  socket.on("public_webrtc_offer", async ({ fromSocketId, sdp }) => {
    if (isHost || !fromSocketId || !sdp) return;
    try {
      closePeer(fromSocketId);
      const pc = new RTCPeerConnection(rtcConfig);
      peers.set(fromSocketId, pc);
      pc.onicecandidate = ({ candidate }) => sendIce(fromSocketId, candidate);
      pc.ontrack = ({ streams }) => {
        const stream = streams[0] || new MediaStream();
        showRemoteStream(stream);
        setStatus("أنت الآن تشاهد الحصة العامة.");
      };
      await pc.setRemoteDescription(sdp);
      await flushCandidates(fromSocketId, pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("public_webrtc_answer", { targetSocketId: fromSocketId, sdp: pc.localDescription });
    } catch (error) {
      setStatus("تعذر استقبال البث. أعد فتح الرابط إذا استمرت المشكلة.", "error");
    }
  });

  socket.on("public_webrtc_answer", async ({ fromSocketId, sdp }) => {
    const pc = peers.get(fromSocketId);
    if (!isHost || !pc || !sdp) return;
    try {
      await pc.setRemoteDescription(sdp);
      await flushCandidates(fromSocketId, pc);
    } catch (error) {
      console.warn("Unable to apply public answer", error);
    }
  });

  socket.on("public_webrtc_ice", async ({ fromSocketId, candidate }) => {
    if (!fromSocketId) return;
    const pc = peers.get(fromSocketId);
    if (!pc || !pc.remoteDescription) {
      const queue = pendingCandidates.get(fromSocketId) || [];
      queue.push(candidate);
      pendingCandidates.set(fromSocketId, queue);
      return;
    }
    try { await pc.addIceCandidate(candidate); } catch (error) { console.warn("Unable to add public ICE", error); }
  });

  socket.on("public_chat_message", ({ sender, message }) => addMessage(sender || "ضيف", message || ""));
  socket.on("public_room_ended", () => {
    ended = true;
    localStream?.getTracks().forEach((track) => track.stop());
    peers.forEach((_, peerId) => closePeer(peerId));
    elements.startShare.disabled = true;
    elements.endClass.disabled = true;
    setStatus("أنهى الأستاذ الحصة العامة.", "error");
  });
  socket.on("classroom_error", ({ message }) => { if (message) setStatus(message, "error"); });
  socket.on("disconnect", () => { if (!ended) setStatus("انقطع الاتصال. جارٍ إعادة المحاولة…", "error"); });

  elements.copyInviteLink?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(elements.inviteLink.value);
      setStatus("تم نسخ رابط الدعوة.");
    } catch (_) {
      elements.inviteLink.select();
      document.execCommand("copy");
      setStatus("تم نسخ رابط الدعوة.");
    }
  });
  elements.startShare?.addEventListener("click", () => { void startShare(); });
  elements.endClass?.addEventListener("click", endClass);
  elements.video?.addEventListener("click", () => elements.video.play().catch(() => {}));
  elements.chatForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const message = elements.chatInput.value.trim();
    if (!message || ended) return;
    socket.emit("public_chat_message", { message }, (result) => {
      if (!result?.ok) setStatus(result?.error || "تعذر إرسال الرسالة.", "error");
    });
    elements.chatInput.value = "";
  });
})();
