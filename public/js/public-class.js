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
    toggleHostMic: document.getElementById("toggle-host-mic"),
    chatMessages: document.getElementById("public-chat-messages"),
    chatForm: document.getElementById("public-chat-form"),
    chatInput: document.getElementById("public-chat-input"),
    attendance: document.getElementById("public-attendance"),
    attendanceList: document.getElementById("public-attendance-list"),
    attendanceCount: document.getElementById("attendance-count"),
    guestActions: document.getElementById("guest-actions"),
    paidRegistrationLink: document.getElementById("paid-registration-link"),
    raiseHand: document.getElementById("raise-public-hand"),
    guestMicStatus: document.getElementById("guest-mic-status"),
    nicknameOverlay: document.getElementById("public-nickname-overlay"),
    nicknameForm: document.getElementById("public-nickname-form"),
    nickname: document.getElementById("public-nickname"),
    guestAudio: document.getElementById("public-guest-audio"),
  };

  const peers = new Map();
  const guestIds = new Set();
  const attendees = new Map();
  const pendingCandidates = new Map();
  const hostAudioElements = new Map();
  const guestAudioSources = new Map();
  const offerInProgress = new Set();
  let localStream = null;
  let hostMicrophoneTracks = [];
  let guestMicStream = null;
  let remoteStream = null;
  let guestNickname = "";
  let guestHandRaised = false;
  let guestMicOpen = false;
  let guestJoined = false;
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

  function setHostMicUi() {
    const availableTracks = hostMicrophoneTracks.filter((track) => track.readyState === "live");
    const hasMicrophone = availableTracks.length > 0;
    const microphoneOpen = hasMicrophone && availableTracks.some((track) => track.enabled);
    elements.toggleHostMic.disabled = !hasMicrophone;
    elements.toggleHostMic.textContent = microphoneOpen ? "غلق مايك المضيف" : "تشغيل مايك المضيف";
    elements.toggleHostMic.classList.toggle("danger", microphoneOpen);
    elements.toggleHostMic.classList.toggle("ghost", !microphoneOpen);
  }

  function setGuestMicUi(open) {
    guestMicOpen = Boolean(open);
    elements.guestMicStatus.textContent = guestMicOpen ? "المايك مفتوح بقرار المضيف" : "المايك مغلق";
    elements.guestMicStatus.classList.toggle("closed", !guestMicOpen);
    elements.raiseHand.disabled = guestMicOpen;
    if (guestMicOpen) {
      elements.raiseHand.textContent = "المايك مفتوح";
    } else {
      elements.raiseHand.textContent = guestHandRaised ? "تنزيل اليد" : "رفع اليد";
    }
  }

  function renderAttendanceList() {
    if (!isHost || !elements.attendanceList) return;
    elements.attendanceCount.textContent = String(attendees.size);
    elements.attendanceList.replaceChildren();
    if (!attendees.size) {
      const empty = document.createElement("p");
      empty.className = "attendance-empty";
      empty.textContent = "لا يوجد حاضرون عبر رابط الدعوة حتى الآن.";
      elements.attendanceList.append(empty);
      return;
    }

    [...attendees.entries()].forEach(([socketId, attendee]) => {
      const row = document.createElement("article");
      row.className = "attendee";
      const identity = document.createElement("div");
      const name = document.createElement("div");
      name.className = "attendee-name";
      name.textContent = attendee.nickname || "ضيف";
      const meta = document.createElement("div");
      meta.className = "attendee-meta";
      if (attendee.handRaised) {
        const hand = document.createElement("span");
        hand.className = "state-pill hand";
        hand.textContent = "رفع اليد";
        meta.append(hand);
      }
      const mic = document.createElement("span");
      mic.className = `state-pill ${attendee.micOpen ? "mic-open" : ""}`.trim();
      mic.textContent = attendee.micOpen ? "مايك مفتوح" : "مايك مغلق";
      meta.append(mic);
      identity.append(name, meta);

      const control = document.createElement("button");
      control.type = "button";
      control.className = `attendee-control ${attendee.micOpen ? "close" : ""}`.trim();
      control.textContent = attendee.micOpen ? "غلق المايك" : "فتح المايك";
      control.addEventListener("click", () => {
        socket.emit("public_set_guest_mic", { targetSocketId: socketId, open: !attendee.micOpen }, (result) => {
          if (!result?.ok) setStatus(result?.error || "تعذر تغيير حالة المايك.", "error");
        });
      });
      row.append(identity, control);
      elements.attendanceList.append(row);
    });
  }

  function upsertAttendee(data = {}) {
    if (!data.socketId) return;
    const current = attendees.get(data.socketId) || { nickname: "ضيف", handRaised: false, micOpen: false };
    attendees.set(data.socketId, {
      nickname: typeof data.nickname === "string" && data.nickname.trim() ? data.nickname.trim() : current.nickname,
      handRaised: typeof data.handRaised === "boolean" ? data.handRaised : current.handRaised,
      micOpen: typeof data.micOpen === "boolean" ? data.micOpen : current.micOpen,
    });
    renderAttendanceList();
  }

  function addHostAudioElement(guestSocketId, stream) {
    if (!isHost) return;
    let audio = hostAudioElements.get(guestSocketId);
    if (!audio) {
      audio = document.createElement("audio");
      audio.autoplay = true;
      audio.playsInline = true;
      audio.className = "public-guest-audio-player";
      audio.hidden = true;
      document.body.append(audio);
      hostAudioElements.set(guestSocketId, audio);
    }
    audio.srcObject = stream;
    audio.play().catch(() => {
      setStatus("اضغط داخل صفحة الحصة لتشغيل صوت أحد الحاضرين.");
    });
  }

  function removeHostAudioElement(guestSocketId) {
    const audio = hostAudioElements.get(guestSocketId);
    if (audio) {
      audio.srcObject = null;
      audio.remove();
      hostAudioElements.delete(guestSocketId);
    }
  }

  async function flushCandidates(peerId, pc) {
    const candidates = pendingCandidates.get(peerId) || [];
    pendingCandidates.delete(peerId);
    for (const candidate of candidates) {
      try { await pc.addIceCandidate(candidate); } catch (error) { console.warn("ICE candidate rejected", error); }
    }
  }

  function sendIce(targetSocketId, candidate) {
    if (candidate) socket.emit("public_webrtc_ice", { targetSocketId, candidate });
  }

  function hasTrack(pc, track) {
    return pc.getSenders().some((sender) => sender.track === track);
  }

  function attachHostOutgoingTracks(pc, targetGuestId) {
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        if (!hasTrack(pc, track)) pc.addTrack(track, localStream);
      });
    }
    guestAudioSources.forEach(({ track, stream }, sourceGuestId) => {
      if (sourceGuestId !== targetGuestId && track.readyState === "live" && !hasTrack(pc, track)) {
        pc.addTrack(track, stream);
      }
    });
  }

  async function sendOffer(pc, targetSocketId) {
    if (!pc || pc.signalingState !== "stable" || offerInProgress.has(targetSocketId)) return;
    offerInProgress.add(targetSocketId);
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("public_webrtc_offer", { targetSocketId, sdp: pc.localDescription });
    } finally {
      offerInProgress.delete(targetSocketId);
    }
  }

  async function renegotiateHostPeer(guestSocketId) {
    const pc = peers.get(guestSocketId);
    if (!isHost || !pc || !pc.remoteDescription) return;
    try {
      await sendOffer(pc, guestSocketId);
    } catch (error) {
      console.warn("Unable to renegotiate public host peer", error);
    }
  }

  async function forwardGuestAudio(sourceGuestId, track, stream) {
    if (!isHost || track.kind !== "audio") return;
    guestAudioSources.set(sourceGuestId, { track, stream });
    const updates = [];
    peers.forEach((pc, targetGuestId) => {
      if (targetGuestId === sourceGuestId || hasTrack(pc, track)) return;
      pc.addTrack(track, stream);
      updates.push(renegotiateHostPeer(targetGuestId));
    });
    await Promise.allSettled(updates);
  }

  function stopForwardingGuestAudio(sourceGuestId) {
    const source = guestAudioSources.get(sourceGuestId);
    guestAudioSources.delete(sourceGuestId);
    if (!isHost || !source) return;
    peers.forEach((pc, targetGuestId) => {
      if (targetGuestId === sourceGuestId) return;
      const sender = pc.getSenders().find((candidate) => candidate.track === source.track);
      if (sender) {
        try { pc.removeTrack(sender); } catch (_) { /* Peer is already closing. */ }
        void renegotiateHostPeer(targetGuestId);
      }
    });
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
    offerInProgress.delete(peerId);
    if (isHost) {
      removeHostAudioElement(peerId);
      stopForwardingGuestAudio(peerId);
    }
  }

  function makeHostPeer(guestSocketId) {
    const old = peers.get(guestSocketId);
    if (old) closePeer(guestSocketId);
    const pc = new RTCPeerConnection(rtcConfig);
    peers.set(guestSocketId, pc);
    attachHostOutgoingTracks(pc, guestSocketId);
    pc.onicecandidate = ({ candidate }) => sendIce(guestSocketId, candidate);
    pc.ontrack = ({ track, streams }) => {
      if (track.kind !== "audio") return;
      const stream = streams[0] || new MediaStream([track]);
      addHostAudioElement(guestSocketId, stream);
      void forwardGuestAudio(guestSocketId, track, stream);
      track.addEventListener("ended", () => stopForwardingGuestAudio(guestSocketId), { once: true });
    };
    return pc;
  }

  async function offerGuest(guestSocketId) {
    if (!isHost || !localStream || !localStream.getTracks().length) return;
    const pc = makeHostPeer(guestSocketId);
    await sendOffer(pc, guestSocketId);
  }

  async function attachGuestMicrophoneToHost(pc, hostSocketId) {
    if (!guestMicStream || !pc) return false;
    let added = false;
    guestMicStream.getAudioTracks().forEach((track) => {
      if (!hasTrack(pc, track)) {
        pc.addTrack(track, guestMicStream);
        added = true;
      }
    });
    if (added && pc.remoteDescription && pc.signalingState === "stable") {
      await sendOffer(pc, hostSocketId);
    }
    return added;
  }

  async function ensureGuestMicrophone() {
    const activeTrack = guestMicStream?.getAudioTracks().find((track) => track.readyState === "live");
    if (activeTrack) return guestMicStream;
    guestMicStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    guestMicStream.getAudioTracks().forEach((track) => { track.enabled = false; });
    return guestMicStream;
  }

  async function applyGuestMicPermission(open) {
    if (!open && !guestMicStream) {
      setGuestMicUi(false);
      return;
    }
    try {
      const stream = await ensureGuestMicrophone();
      stream.getAudioTracks().forEach((track) => { track.enabled = Boolean(open); });
      const [hostSocketId, pc] = peers.entries().next().value || [];
      if (hostSocketId && pc) await attachGuestMicrophoneToHost(pc, hostSocketId);
      setGuestMicUi(open);
      if (open) setStatus("فتح المضيف المايك. يمكنك التحدث الآن.");
    } catch (error) {
      setGuestMicUi(false);
      setStatus("تعذر تشغيل المايك. امنح المتصفح إذن المايك ثم اطلب من المضيف فتحه مجددًا.", "error");
    }
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
      hostMicrophoneTracks = combined.getAudioTracks().filter((track) => !display.getAudioTracks().includes(track));
      elements.video.srcObject = localStream;
      elements.video.muted = true;
      elements.video.play().catch(() => {});
      elements.placeholder.hidden = true;
      elements.startShare.textContent = "المشاركة جارية";
      elements.startShare.disabled = true;
      setHostMicUi();
      setStatus("الحصة العامة بدأت. يمكن لأي شخص لديه الرابط الانضمام الآن.");
      display.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (!ended) setStatus("توقفت مشاركة الشاشة. يمكنك إنهاء الحصة أو إنشاء دعوة جديدة.", "error");
      });
      await Promise.allSettled([...guestIds].map((id) => offerGuest(id)));
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
    elements.attendance.hidden = false;
    elements.startShare.hidden = false;
    elements.toggleHostMic.hidden = false;
    elements.endClass.hidden = false;
    const url = new URL(window.location.href);
    url.search = `?room=${encodeURIComponent(roomId)}`;
    elements.inviteLink.value = url.toString();
    socket.emit("public_host_start", { roomId, hostToken }, async (result) => {
      if (!result?.ok) return setStatus(result?.error || "تعذر إنشاء رابط الدعوة.", "error");
      (result.guests || []).forEach((guest) => {
        if (guest?.socketId) {
          guestIds.add(guest.socketId);
          upsertAttendee(guest);
        }
      });
      renderAttendanceList();
      setStatus("رابط الدعوة جاهز. ابدأ مشاركة الشاشة لبدء الحصة.");
    });
  }

  function showGuestNicknamePrompt() {
    elements.role.textContent = "حاضر بدعوة عامة";
    elements.nicknameOverlay.hidden = false;
    elements.nickname.focus();
    setStatus("أدخل اسمك المستعار للانضمام إلى الحصة.");
  }

  function joinGuest(nickname, silent = false) {
    const name = String(nickname || "").trim();
    if (!name || name.length > 120 || ended) {
      if (!silent) setStatus("أدخل اسمًا مستعارًا صالحًا للانضمام.", "error");
      return;
    }
    socket.emit("public_join_room", { roomId, nickname: name }, (result) => {
      if (!result?.ok) return setStatus(result?.error || "تعذر فتح رابط الدعوة.", "error");
      guestNickname = name;
      guestJoined = true;
      elements.nicknameOverlay.hidden = true;
      elements.guestActions.hidden = false;
      elements.paidRegistrationLink.hidden = false;
      setGuestMicUi(guestMicOpen);
      setStatus(result.isLive ? "بانتظار استقبال البث…" : "بانتظار أن يبدأ الأستاذ الحصة…");
    });
  }

  socket.on("connect", () => {
    if (!roomPattern.test(roomId) || (isHost && !roomPattern.test(hostToken))) {
      setStatus("رابط الدعوة غير صالح.", "error");
      return;
    }
    if (isHost) {
      void initialiseHost();
    } else if (guestNickname) {
      joinGuest(guestNickname, true);
    } else {
      showGuestNicknamePrompt();
    }
  });

  socket.on("public_guest_joined", (guest) => {
    if (!isHost || !guest?.socketId) return;
    guestIds.add(guest.socketId);
    upsertAttendee(guest);
    offerGuest(guest.socketId).catch(() => setStatus("تعذر ربط أحد الحاضرين.", "error"));
  });

  socket.on("public_guest_left", ({ socketId }) => {
    if (!socketId) return;
    guestIds.delete(socketId);
    attendees.delete(socketId);
    renderAttendanceList();
    closePeer(socketId);
  });

  socket.on("public_guest_hand_state", (guest) => {
    if (!isHost) return;
    upsertAttendee(guest);
  });

  socket.on("public_guest_mic_state", (guest) => {
    if (!isHost) return;
    upsertAttendee(guest);
  });

  socket.on("public_mic_permission", ({ open }) => {
    if (isHost || !guestJoined) return;
    void applyGuestMicPermission(open === true);
  });

  socket.on("public_webrtc_offer", async ({ fromSocketId, sdp }) => {
    if (!fromSocketId || !sdp) return;
    try {
      if (isHost) {
        const pc = peers.get(fromSocketId);
        if (!pc) return;
        await pc.setRemoteDescription(sdp);
        await flushCandidates(fromSocketId, pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("public_webrtc_answer", { targetSocketId: fromSocketId, sdp: pc.localDescription });
        return;
      }

      closePeer(fromSocketId);
      const pc = new RTCPeerConnection(rtcConfig);
      peers.set(fromSocketId, pc);
      pc.onicecandidate = ({ candidate }) => sendIce(fromSocketId, candidate);
      pc.ontrack = ({ streams, track }) => {
        const stream = streams[0] || new MediaStream([track]);
        showRemoteStream(stream);
        setStatus("أنت الآن تشاهد الحصة العامة.");
      };
      await pc.setRemoteDescription(sdp);
      await attachGuestMicrophoneToHost(pc, fromSocketId);
      await flushCandidates(fromSocketId, pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("public_webrtc_answer", { targetSocketId: fromSocketId, sdp: pc.localDescription });
    } catch (error) {
      setStatus(isHost ? "تعذر استقبال صوت أحد الحاضرين." : "تعذر استقبال البث. أعد فتح الرابط إذا استمرت المشكلة.", "error");
    }
  });

  socket.on("public_webrtc_answer", async ({ fromSocketId, sdp }) => {
    const pc = peers.get(fromSocketId);
    if (!pc || !sdp) return;
    try {
      await pc.setRemoteDescription(sdp);
      await flushCandidates(fromSocketId, pc);
    } catch (error) {
      console.warn("Unable to apply public answer", error);
    }
  });

  socket.on("public_webrtc_ice", async ({ fromSocketId, candidate }) => {
    if (!fromSocketId || !candidate) return;
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
    hostMicrophoneTracks = [];
    setHostMicUi();
    guestMicStream?.getTracks().forEach((track) => track.stop());
    peers.forEach((_, peerId) => closePeer(peerId));
    elements.startShare.disabled = true;
    elements.endClass.disabled = true;
    elements.raiseHand.disabled = true;
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
  elements.toggleHostMic?.addEventListener("click", () => {
    const availableTracks = hostMicrophoneTracks.filter((track) => track.readyState === "live");
    if (!availableTracks.length || ended) return;
    const shouldOpen = !availableTracks.some((track) => track.enabled);
    availableTracks.forEach((track) => { track.enabled = shouldOpen; });
    setHostMicUi();
    setStatus(shouldOpen ? "تم تشغيل مايك المضيف." : "تم غلق مايك المضيف.");
  });
  elements.endClass?.addEventListener("click", endClass);
  elements.video?.addEventListener("click", () => {
    elements.video.play().catch(() => {});
    hostAudioElements.forEach((audio) => audio.play().catch(() => {}));
  });
  elements.nicknameForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    joinGuest(elements.nickname.value);
  });
  elements.raiseHand?.addEventListener("click", async () => {
    if (isHost || guestMicOpen || !guestJoined || ended) return;
    const raised = !guestHandRaised;
    if (raised) {
      try {
        await ensureGuestMicrophone();
        const [hostSocketId, pc] = peers.entries().next().value || [];
        if (hostSocketId && pc) await attachGuestMicrophoneToHost(pc, hostSocketId);
      } catch (error) {
        setStatus("تعذر تجهيز المايك. امنح المتصفح إذن المايك ثم حاول رفع اليد.", "error");
        return;
      }
    }
    socket.emit("public_raise_hand", { raised }, (result) => {
      if (!result?.ok) return setStatus(result?.error || "تعذر تحديث حالة اليد.", "error");
      guestHandRaised = result.handRaised === true;
      setGuestMicUi(false);
      setStatus(guestHandRaised ? "تم رفع اليد. في انتظار قرار المضيف." : "تم تنزيل اليد.");
    });
  });
  elements.chatForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const message = elements.chatInput.value.trim();
    if (!message || ended || (!isHost && !guestJoined)) return;
    socket.emit("public_chat_message", { message }, (result) => {
      if (!result?.ok) setStatus(result?.error || "تعذر إرسال الرسالة.", "error");
    });
    elements.chatInput.value = "";
  });
})();
