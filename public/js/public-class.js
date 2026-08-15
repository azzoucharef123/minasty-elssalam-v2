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
  const socket = io({ transports: ["websocket", "polling"], autoConnect: false });
  const elements = {
    role: document.getElementById("public-role"),
    video: document.getElementById("public-video"),
    placeholder: document.getElementById("public-placeholder"),
    status: document.getElementById("public-status"),
    inviteBox: document.getElementById("invite-box"),
    inviteLink: document.getElementById("public-invite-link"),
    copyInviteLink: document.getElementById("copy-public-link"),
    startShare: document.getElementById("start-public-share"),
    recordClass: document.getElementById("record-public-class"),
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
    chromeOnlyOverlay: document.getElementById("chrome-only-overlay"),
  };

  const peers = new Map();
  const guestIds = new Set();
  const attendees = new Map();
  const pendingCandidates = new Map();
  const hostAudioElements = new Map();
  const guestAudioSources = new Map();
  const publicAudioSources = new Map();
  const publicMixDestinations = new Map();
  const publicRecordingSourceNodes = new Map();
  const offerInProgress = new Set();
  let publicAudioContext = null;
  let publicRecordingAudioContext = null;
  let publicRecordingAudioDestination = null;
  let publicRecordingMixedAudioTrack = null;
  let publicRecordingSourceSyncTimer = null;
  let publicRecordingMediaRecorder = null;
  let publicRecordingStream = null;
  let publicRecordingChunks = [];
  let localStream = null;
  let hostMicrophoneTracks = [];
  let guestMicStream = null;
  let remoteStream = null;
  let guestNickname = "";
  let guestHandRaised = false;
  let guestMicOpen = false;
  let guestJoined = false;
  let guestApproved = false;
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
      const status = document.createElement("span");
      status.className = `state-pill ${attendee.approvalStatus === "approved" ? "approved" : "pending"}`.trim();
      status.textContent = attendee.approvalStatus === "approved" ? "تم القبول" : "في انتظار الموافقة";
      meta.append(status);
      if (attendee.approvalStatus === "approved") {
        const mic = document.createElement("span");
        mic.className = `state-pill ${attendee.micOpen ? "mic-open" : ""}`.trim();
        mic.textContent = attendee.micOpen ? "مايك مفتوح" : "مايك مغلق";
        meta.append(mic);
      }
      identity.append(name, meta);

      const controls = document.createElement("div");
      controls.className = "attendee-controls";
      if (attendee.approvalStatus !== "approved") {
        const approve = document.createElement("button");
        approve.type = "button";
        approve.className = "attendee-control approve";
        approve.textContent = "قبول الدخول";
        approve.addEventListener("click", () => {
          socket.emit("public_approve_guest", { targetSocketId: socketId }, (result) => {
            if (!result?.ok) setStatus(result?.error || "تعذر قبول طلب الدخول.", "error");
          });
        });
        const reject = document.createElement("button");
        reject.type = "button";
        reject.className = "attendee-control close";
        reject.textContent = "رفض";
        reject.addEventListener("click", () => {
          socket.emit("public_reject_guest", { targetSocketId: socketId }, (result) => {
            if (!result?.ok) setStatus(result?.error || "تعذر رفض طلب الدخول.", "error");
          });
        });
        controls.append(approve, reject);
      } else {
        const control = document.createElement("button");
        control.type = "button";
        control.className = `attendee-control ${attendee.micOpen ? "close" : ""}`.trim();
        control.textContent = attendee.micOpen ? "غلق المايك" : "فتح المايك";
        control.addEventListener("click", () => {
          socket.emit("public_set_guest_mic", { targetSocketId: socketId, open: !attendee.micOpen }, (result) => {
            if (!result?.ok) setStatus(result?.error || "تعذر تغيير حالة المايك.", "error");
          });
        });
        controls.append(control);
      }
      row.append(identity, controls);
      elements.attendanceList.append(row);
    });
  }

  function upsertAttendee(data = {}) {
    if (!data.socketId) return;
    const current = attendees.get(data.socketId) || { nickname: "", approvalStatus: "pending", handRaised: false, micOpen: false };
    attendees.set(data.socketId, {
      nickname: typeof data.nickname === "string" && data.nickname.trim() ? data.nickname.trim() : current.nickname,
      approvalStatus: typeof data.approvalStatus === "string" ? data.approvalStatus : current.approvalStatus,
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

  function rebuildPublicAudioGraph() {
    publicAudioSources.forEach(({ node }) => {
      try { node.disconnect(); } catch (_) { /* already disconnected */ }
    });

    publicMixDestinations.forEach((destination, destinationGuestId) => {
      publicAudioSources.forEach((source, sourceGuestId) => {
        if (source.enabled && sourceGuestId !== destinationGuestId) {
          source.node.connect(destination);
        }
      });
    });
  }

  function addPublicAudioSource(sourceGuestId, stream, enabled = true) {
    if (!publicAudioContext || !stream?.getAudioTracks?.().length || !sourceGuestId) return false;
    const existing = publicAudioSources.get(sourceGuestId);
    if (existing?.stream === stream) {
      existing.enabled = Boolean(enabled);
      rebuildPublicAudioGraph();
      return true;
    }
    if (existing) {
      try { existing.node.disconnect(); } catch (_) { /* already disconnected */ }
    }

    try {
      const node = publicAudioContext.createMediaStreamSource(stream);
      publicAudioSources.set(sourceGuestId, { node, stream, enabled: Boolean(enabled) });
      rebuildPublicAudioGraph();
      return true;
    } catch (error) {
      console.warn("Unable to add public-class audio source:", error);
      return false;
    }
  }

  function setPublicAudioSourceEnabled(sourceGuestId, enabled) {
    const source = publicAudioSources.get(sourceGuestId);
    if (!source) return;
    source.enabled = Boolean(enabled);
    rebuildPublicAudioGraph();
  }

  function removePublicAudioSource(sourceGuestId) {
    const source = publicAudioSources.get(sourceGuestId);
    if (!source) return;
    try { source.node.disconnect(); } catch (_) { /* already disconnected */ }
    publicAudioSources.delete(sourceGuestId);
    rebuildPublicAudioGraph();
  }

  function ensurePublicMixDestination(guestSocketId) {
    if (!publicAudioContext || !guestSocketId) return null;
    const existing = publicMixDestinations.get(guestSocketId);
    if (existing?.stream?.getAudioTracks?.().some((track) => track.readyState === "live")) {
      return existing;
    }
    const destination = publicAudioContext.createMediaStreamDestination();
    const track = destination.stream.getAudioTracks()[0];
    if (!track) return null;
    track.contentHint = "speech";
    publicMixDestinations.set(guestSocketId, destination);
    rebuildPublicAudioGraph();
    return destination;
  }

  function removePublicMixDestination(guestSocketId) {
    const destination = publicMixDestinations.get(guestSocketId);
    if (!destination) return;
    destination.stream.getTracks().forEach((track) => track.stop());
    publicMixDestinations.delete(guestSocketId);
    rebuildPublicAudioGraph();
  }

  function getPublicMixSender(pc) {
    return pc?.getSenders?.().find((sender) => sender.__publicMixMinusAudio === true) || null;
  }

  function ensurePublicMixSender(pc, guestSocketId) {
    const destination = ensurePublicMixDestination(guestSocketId);
    const track = destination?.stream?.getAudioTracks?.()[0];
    if (!pc || !destination || !track) return null;

    const existing = getPublicMixSender(pc);
    if (existing) {
      if (existing.track !== track) void existing.replaceTrack(track);
      return existing;
    }

    const sender = pc.addTrack(track, destination.stream);
    sender.__publicMixMinusAudio = true;
    return sender;
  }

  function initialisePublicAudioMix() {
    if (!window.AudioContext && !window.webkitAudioContext) return false;
    if (publicAudioContext && publicAudioContext.state !== "closed") return true;
    try {
      const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
      publicAudioContext = new AudioContextConstructor();
      if (publicAudioContext.state === "suspended") publicAudioContext.resume().catch(() => {});
      addPublicAudioSource("__host_audio__", localStream, true);
      return true;
    } catch (error) {
      publicAudioContext = null;
      console.warn("Unable to initialize public-class audio mix:", error);
      return false;
    }
  }

  function stopPublicAudioMix() {
    publicAudioSources.forEach(({ node }) => {
      try { node.disconnect(); } catch (_) { /* already disconnected */ }
    });
    publicAudioSources.clear();
    publicMixDestinations.forEach((destination) => {
      destination.stream.getTracks().forEach((track) => track.stop());
    });
    publicMixDestinations.clear();
    const context = publicAudioContext;
    publicAudioContext = null;
    if (context && context.state !== "closed") context.close().catch(() => {});
  }

  function attachHostOutgoingTracks(pc, targetGuestId) {
    if (localStream) {
      localStream.getVideoTracks().forEach((track) => {
        if (!hasTrack(pc, track)) pc.addTrack(track, localStream);
      });
    }

    if (publicAudioContext) {
      ensurePublicMixSender(pc, targetGuestId);
      return;
    }

    // Legacy fallback for a browser without Web Audio.
    localStream?.getAudioTracks().forEach((track) => {
      if (!hasTrack(pc, track)) pc.addTrack(track, localStream);
    });
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

    if (publicAudioContext) {
      addPublicAudioSource(
        sourceGuestId,
        stream,
        attendees.get(sourceGuestId)?.micOpen === true
      );
      return;
    }

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
    removePublicAudioSource(sourceGuestId);
    if (!isHost || !source || publicAudioContext) return;
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
      removePublicMixDestination(peerId);
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
    guestMicStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });
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
        const microphone = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
          },
        });
        microphone.getAudioTracks().forEach((track) => combined.addTrack(track));
      } catch (_) {
        // The screen stream can still be broadcast if the host declines microphone access.
      }
      localStream?.getTracks().forEach((track) => track.stop());
      localStream = combined;
      hostMicrophoneTracks = combined.getAudioTracks().filter((track) => !display.getAudioTracks().includes(track));
      initialisePublicAudioMix();
      elements.video.srcObject = localStream;
      elements.video.muted = true;
      elements.video.play().catch(() => {});
      elements.placeholder.hidden = true;
      elements.startShare.textContent = "المشاركة جارية";
      elements.startShare.disabled = true;
      elements.recordClass.disabled = false;
      setHostMicUi();
      setStatus("الحصة العامة بدأت. سيظهر زر الدخول في الصفحة الرئيسية للزوار.");
      display.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (!ended) setStatus("توقفت مشاركة الشاشة. يمكنك إنهاء الحصة أو إنشاء دعوة جديدة.", "error");
      });
      await Promise.allSettled([...guestIds].map((id) => offerGuest(id)));
    } catch (error) {
      setStatus("تعذر بدء المشاركة. امنح المتصفح إذن مشاركة الشاشة ثم حاول مرة أخرى.", "error");
    }
  }

  function getPublicRecordingMimeType() {
    if (typeof window.MediaRecorder !== "function" || typeof MediaRecorder.isTypeSupported !== "function") return "";
    return [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ].find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) || "";
  }

  function syncPublicRecordingAudioSources() {
    if (!publicRecordingAudioContext || !publicRecordingAudioDestination) return;
    const activeSources = new Map(
      Array.from(publicAudioSources.entries())
        .filter(([, source]) => source?.enabled !== false)
        .map(([sourceKey, source]) => [sourceKey, source?.stream])
        .filter(([, stream]) => stream?.getAudioTracks?.().some((track) => track.readyState === "live"))
    );

    publicRecordingSourceNodes.forEach(({ stream, node }, sourceKey) => {
      if (activeSources.get(sourceKey) === stream) return;
      try { node.disconnect(); } catch (_) { /* already disconnected */ }
      publicRecordingSourceNodes.delete(sourceKey);
    });

    activeSources.forEach((stream, sourceKey) => {
      if (publicRecordingSourceNodes.has(sourceKey)) return;
      try {
        const node = publicRecordingAudioContext.createMediaStreamSource(stream);
        node.connect(publicRecordingAudioDestination);
        publicRecordingSourceNodes.set(sourceKey, { stream, node });
      } catch (error) {
        console.warn("Unable to add public guest audio to recording:", error);
      }
    });
  }

  function disposePublicRecordingResources() {
    if (publicRecordingSourceSyncTimer) {
      window.clearInterval(publicRecordingSourceSyncTimer);
      publicRecordingSourceSyncTimer = null;
    }
    publicRecordingSourceNodes.forEach(({ node }) => {
      try { node.disconnect(); } catch (_) { /* already disconnected */ }
    });
    publicRecordingSourceNodes.clear();
    publicRecordingMixedAudioTrack?.stop();
    publicRecordingMixedAudioTrack = null;
    publicRecordingAudioDestination = null;
    publicRecordingStream = null;
    const context = publicRecordingAudioContext;
    publicRecordingAudioContext = null;
    if (context && context.state !== "closed") context.close().catch(() => {});
  }

  function startPublicRecording() {
    if (!isHost || ended || publicRecordingMediaRecorder || !localStream) return;
    const videoTrack = localStream.getVideoTracks().find((track) => track.readyState === "live");
    if (!videoTrack || typeof window.MediaRecorder !== "function") {
      setStatus("تعذر بدء التسجيل المحلي في هذا المتصفح.", "error");
      return;
    }

    try {
      const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextConstructor) throw new Error("Web Audio unavailable");
      const recordingStream = new MediaStream([videoTrack]);
      const audioContext = new AudioContextConstructor();
      const destination = audioContext.createMediaStreamDestination();
      publicRecordingAudioContext = audioContext;
      publicRecordingAudioDestination = destination;
      publicRecordingSourceNodes.clear();
      syncPublicRecordingAudioSources();
      publicRecordingSourceSyncTimer = window.setInterval(syncPublicRecordingAudioSources, 500);
      if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
      publicRecordingMixedAudioTrack = destination.stream.getAudioTracks()[0] || null;
      if (publicRecordingMixedAudioTrack) recordingStream.addTrack(publicRecordingMixedAudioTrack);

      const mimeType = getPublicRecordingMimeType();
      const recorder = new MediaRecorder(
        recordingStream,
        mimeType ? { mimeType, videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 128_000 } : undefined
      );
      publicRecordingStream = recordingStream;
      publicRecordingChunks = [];
      publicRecordingMediaRecorder = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data?.size) publicRecordingChunks.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(publicRecordingChunks, { type: recorder.mimeType || mimeType || "video/webm" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `حصة-عامة-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        publicRecordingMediaRecorder = null;
        publicRecordingChunks = [];
        disposePublicRecordingResources();
        if (!ended) setStatus("تم حفظ تسجيل الحصة العامة على جهازك.");
        if (elements.recordClass) {
          elements.recordClass.textContent = "بدء تسجيل الحصة";
          elements.recordClass.classList.remove("danger");
        }
      };
      recorder.start(1_000);
      elements.recordClass.textContent = "إيقاف التسجيل وحفظه";
      elements.recordClass.classList.add("danger");
      setStatus("جارٍ تسجيل الحصة العامة مع أصوات المضيف والضيوف.");
    } catch (error) {
      console.warn("Unable to start public class recording:", error);
      publicRecordingMediaRecorder = null;
      disposePublicRecordingResources();
      setStatus("تعذر بدء التسجيل المحلي. استخدم Chrome أو متصفحًا حديثًا.", "error");
    }
  }

  function stopPublicRecording() {
    if (publicRecordingMediaRecorder?.state === "recording") {
      publicRecordingMediaRecorder.stop();
    }
  }

  function togglePublicRecording() {
    if (publicRecordingMediaRecorder?.state === "recording") stopPublicRecording();
    else startPublicRecording();
  }

  function endClass() {
    if (!isHost || ended) return;
    stopPublicRecording();
    socket.emit("public_host_end", {}, (result) => {
      if (!result?.ok) setStatus(result?.error || "تعذر إنهاء الحصة.", "error");
    });
  }

  async function initialiseHost() {
    elements.role.textContent = "أنت المضيف";
    if (elements.inviteBox) elements.inviteBox.hidden = true;
    elements.attendance.hidden = false;
    elements.startShare.hidden = false;
    elements.recordClass.hidden = false;
    elements.recordClass.disabled = true;
    elements.toggleHostMic.hidden = false;
    elements.endClass.hidden = false;
    socket.emit("public_host_start", { roomId, hostToken }, async (result) => {
      if (!result?.ok) return setStatus(result?.error || "تعذر فتح الحصة العامة.", "error");
      (result.guests || []).forEach((guest) => {
        if (guest?.socketId) {
          guestIds.add(guest.socketId);
          upsertAttendee(guest);
        }
      });
      renderAttendanceList();
      setStatus("تم فتح الحصة العامة. سيظهر زر الدخول في الصفحة الرئيسية بعد بدء الاستضافة.");
    });
  }

  function isValidRealName(value) {
    const name = String(value || "").trim().replace(/\s+/g, " ");
    return name.length >= 5 && name.length <= 120 && name.split(" ").length >= 2 &&
      /^[\p{L}\p{M}]+(?:[\s'’-]+[\p{L}\p{M}]+)+$/u.test(name);
  }

  function showGuestNicknamePrompt(message = "") {
    elements.role.textContent = "طلب دخول الحصة العامة";
    elements.nicknameOverlay.hidden = false;
    elements.nickname.focus();
    if (message) setStatus(message, "error");
    else setStatus("أدخل اسمك الحقيقي الكامل، ثم انتظر موافقة الأستاذ.");
  }

  function joinGuest(realName, silent = false) {
    const name = String(realName || "").trim().replace(/\s+/g, " ");
    if (!isValidRealName(name) || ended) {
      if (!silent) setStatus("أدخل اسمك الحقيقي الكامل، مثل الاسم واللقب.", "error");
      return;
    }
    socket.emit("public_join_room", { roomId, realName: name }, (result) => {
      if (!result?.ok) return setStatus(result?.error || "تعذر طلب الدخول.", "error");
      guestNickname = name;
      guestJoined = true;
      guestApproved = false;
      elements.nicknameOverlay.hidden = true;
      elements.guestActions.hidden = true;
      elements.paidRegistrationLink.hidden = true;
      setStatus("تم إرسال طلب الدخول. انتظر موافقة الأستاذ…");
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

  socket.on("public_guest_join_request", (guest) => {
    if (!isHost || !guest?.socketId) return;
    guestIds.add(guest.socketId);
    upsertAttendee({ ...guest, approvalStatus: "pending" });
    setStatus(`طلب دخول جديد من ${guest.nickname || "حاضر"}. راجع قائمة الحضور.`);
  });

  socket.on("public_guest_approved", (guest) => {
    if (!isHost || !guest?.socketId) return;
    guestIds.add(guest.socketId);
    upsertAttendee({ ...guest, approvalStatus: "approved" });
    offerGuest(guest.socketId).catch(() => setStatus("تعذر ربط أحد الحاضرين.", "error"));
  });

  socket.on("public_guest_rejected", ({ socketId }) => {
    if (!isHost || !socketId) return;
    guestIds.delete(socketId);
    attendees.delete(socketId);
    renderAttendanceList();
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
    setPublicAudioSourceEnabled(guest.socketId, guest.micOpen === true);
  });

  socket.on("public_mic_permission", ({ open }) => {
    if (isHost || !guestJoined || !guestApproved) return;
    void applyGuestMicPermission(open === true);
  });

  socket.on("public_guest_approval", ({ approved, message }) => {
    if (isHost) return;
    if (approved === true) {
      guestApproved = true;
      elements.guestActions.hidden = false;
      elements.paidRegistrationLink.hidden = false;
      setGuestMicUi(guestMicOpen);
      setStatus(message || "تم قبول دخولك. أنت الآن داخل الحصة.");
      return;
    }
    guestApproved = false;
    guestJoined = false;
    elements.guestActions.hidden = true;
    elements.paidRegistrationLink.hidden = true;
    peers.forEach((_, peerId) => closePeer(peerId));
    showGuestNicknamePrompt(message || "يجب إدخال اسمك الحقيقي الكامل حتى يسمح لك الأستاذ بالدخول.");
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
      remoteStream = new MediaStream();
      elements.video.srcObject = remoteStream;
      const pc = new RTCPeerConnection(rtcConfig);
      peers.set(fromSocketId, pc);
      pc.onicecandidate = ({ candidate }) => sendIce(fromSocketId, candidate);
      pc.ontrack = ({ track }) => {
        if (!remoteStream.getTracks().some((currentTrack) => currentTrack.id === track.id)) {
          remoteStream.addTrack(track);
        }
        showRemoteStream(remoteStream);
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
    stopPublicRecording();
    stopPublicAudioMix();
    localStream?.getTracks().forEach((track) => track.stop());
    hostMicrophoneTracks = [];
    setHostMicUi();
    guestMicStream?.getTracks().forEach((track) => track.stop());
    peers.forEach((_, peerId) => closePeer(peerId));
    elements.startShare.disabled = true;
    elements.recordClass.disabled = true;
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
  elements.recordClass?.addEventListener("click", togglePublicRecording);
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
    if (isHost || guestMicOpen || !guestJoined || !guestApproved || ended) return;
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
    if (!message || ended || (!isHost && (!guestJoined || !guestApproved))) return;
    socket.emit("public_chat_message", { message }, (result) => {
      if (!result?.ok) setStatus(result?.error || "تعذر إرسال الرسالة.", "error");
    });
    elements.chatInput.value = "";
  });

  if (!roomPattern.test(roomId) || (isHost && !roomPattern.test(hostToken))) {
    setStatus("رابط الحصة العامة غير صالح.", "error");
  } else if (!window.RTCPeerConnection) {
    setStatus("هذا المتصفح لا يدعم البث المباشر. افتح الرابط في متصفح حديث مثل Chrome أو Firefox أو Safari.", "error");
  } else {
    socket.connect();
  }
})();
