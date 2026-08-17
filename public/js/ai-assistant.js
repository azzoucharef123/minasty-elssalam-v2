(() => {
  "use strict";

  if (window.__aiAssistantLoaded) return;
  window.__aiAssistantLoaded = true;

  const root = document.createElement("div");
  root.className = "ai-assistant-root";
  root.innerHTML = `
    <button class="ai-assistant-fab" type="button" aria-label="فتح مساعد الأكاديمية" title="مساعد الأكاديمية">
      <span class="ai-assistant-fab-icon" aria-hidden="true">✦</span>
      <span class="ai-assistant-fab-label">اسقسي المساعد</span>
    </button>
    <div class="ai-assistant-backdrop" hidden>
      <section class="ai-assistant-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-assistant-title">
        <header class="ai-assistant-head">
          <div class="ai-assistant-head-copy">
            <h2 id="ai-assistant-title">مساعد أكاديمية التفوق</h2>
            <p>نعاونك بالدارجة الجزائرية في الموقع والدروس</p>
          </div>
          <div class="ai-assistant-head-actions">
            <button class="ai-assistant-clear" type="button" title="مسح الحوار" aria-label="مسح الحوار">↺</button>
            <button class="ai-assistant-close" type="button" title="إغلاق" aria-label="إغلاق المساعد">×</button>
          </div>
        </header>
        <div class="ai-assistant-messages" aria-live="polite"></div>
        <form class="ai-assistant-compose">
          <div class="ai-assistant-attachment" hidden>
            <span class="ai-assistant-attachment-name"></span>
            <button class="ai-assistant-remove-file" type="button">حذف</button>
          </div>
          <div class="ai-assistant-compose-row">
            <button class="ai-assistant-photo" type="button" title="تصوير تمرين" aria-label="تصوير تمرين">▣</button>
            <textarea class="ai-assistant-input" rows="1" maxlength="2200" placeholder="اكتب سؤالك بالدارجة..."></textarea>
            <button class="ai-assistant-send" type="submit" aria-label="إرسال السؤال">➤</button>
          </div>
          <input class="ai-assistant-file" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" />
        </form>
      </section>
    </div>
  `;
  document.body.appendChild(root);

  const fab = root.querySelector(".ai-assistant-fab");
  const label = root.querySelector(".ai-assistant-fab-label");
  const backdrop = root.querySelector(".ai-assistant-backdrop");
  const dialog = root.querySelector(".ai-assistant-dialog");
  const closeButton = root.querySelector(".ai-assistant-close");
  const clearButton = root.querySelector(".ai-assistant-clear");
  const messages = root.querySelector(".ai-assistant-messages");
  const compose = root.querySelector(".ai-assistant-compose");
  const input = root.querySelector(".ai-assistant-input");
  const sendButton = root.querySelector(".ai-assistant-send");
  const photoButton = root.querySelector(".ai-assistant-photo");
  const fileInput = root.querySelector(".ai-assistant-file");
  const attachment = root.querySelector(".ai-assistant-attachment");
  const attachmentName = root.querySelector(".ai-assistant-attachment-name");
  const removeFileButton = root.querySelector(".ai-assistant-remove-file");
  const history = [];
  let selectedImage = null;
  let dragState = null;

  function currentPageContext() {
    const title = document.title || "صفحة من المنصة";
    const page = document.body?.getAttribute("data-ai-page") || location.pathname.split("/").pop() || "الصفحة الرئيسية";
    return `${title} — ${page}`.slice(0, 120);
  }

  function addMessage(role, text) {
    const bubble = document.createElement("div");
    bubble.className = `ai-assistant-message ${role}`;
    bubble.textContent = text;
    messages.appendChild(bubble);
    messages.scrollTop = messages.scrollHeight;
    return bubble;
  }

  function addWelcome() {
    if (messages.childElementCount) return;
    addMessage("assistant", "مرحبا بيك، أنا مساعد الأكاديمية. اسقسيني على التسجيل والحصص والأسعار، ولا صوّرلي تمرين ونشرحلك بالهنا.");
  }

  function setOpen(open) {
    if (open) {
      backdrop.hidden = false;
      requestAnimationFrame(() => backdrop.classList.add("is-open"));
      addWelcome();
      setTimeout(() => input.focus(), 80);
    } else {
      backdrop.classList.remove("is-open");
      setTimeout(() => { backdrop.hidden = true; }, 220);
    }
  }

  function clearConversation() {
    history.length = 0;
    messages.replaceChildren();
    addWelcome();
  }

  function updateAttachment() {
    if (!selectedImage) {
      attachment.hidden = true;
      attachmentName.textContent = "";
      return;
    }
    attachment.hidden = false;
    attachmentName.textContent = `صورة جاهزة: ${selectedImage.name}`;
  }

  function chooseImage() {
    fileInput.click();
  }

  function setImage(file) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      addMessage("system", "اختار صورة بصيغة JPG ولا PNG ولا WEBP باش نقدر نقراها.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      addMessage("system", "الصورة كبيرة شوية. صغّرها وخليها أقل من خمسة ميغابايت من فضلك.");
      return;
    }
    selectedImage = file;
    updateAttachment();
  }

  async function sendMessage(event) {
    event?.preventDefault();
    const text = input.value.trim();
    if (!text && !selectedImage) {
      addMessage("system", "اكتب سؤالك ولا صوّر التمرين باش نقدر نعاونك مليح.");
      return;
    }

    const imageForRequest = selectedImage;
    const userDisplay = text || "صوّرتلك تمرين، شوفه واشرحهولي من فضلك.";
    addMessage("user", imageForRequest ? `${userDisplay}\n[صورة مرفقة]` : userDisplay);
    history.push({ role: "user", text: userDisplay });
    input.value = "";
    selectedImage = null;
    updateAttachment();
    sendButton.disabled = true;
    const typing = document.createElement("div");
    typing.className = "ai-assistant-message assistant";
    typing.innerHTML = '<span class="ai-assistant-typing"><i></i><i></i><i></i> راهي تجيني الإجابة...</span>';
    messages.appendChild(typing);
    messages.scrollTop = messages.scrollHeight;

    try {
      const body = new FormData();
      body.append("message", text);
      body.append("page", currentPageContext());
      body.append("history", JSON.stringify(history.slice(-10)));
      if (imageForRequest) body.append("image", imageForRequest, imageForRequest.name);
      const token = sessionStorage.getItem("teacherToken") || sessionStorage.getItem("parentToken") || "";
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const response = await fetch("/api/ai/chat", { method: "POST", headers, body });
      const payload = await response.json().catch(() => ({}));
      typing.remove();
      if (!response.ok) throw new Error(payload.error || "تعذر جلب الإجابة حاليا.");
      const answer = String(payload.answer || "").trim();
      if (!answer) throw new Error("المساعد رجع جواب فارغ، عاود صياغة السؤال.");
      addMessage("assistant", answer);
      history.push({ role: "assistant", text: answer });
    } catch (error) {
      typing.remove();
      addMessage("system", error.message || "وقع مشكل مؤقت. عاود المحاولة من فضلك.");
    } finally {
      sendButton.disabled = false;
      input.focus();
    }
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function saveFabPosition(left, top) {
    localStorage.setItem("aiAssistantFabPosition", JSON.stringify({ left, top }));
  }

  function restoreFabPosition() {
    try {
      const stored = JSON.parse(localStorage.getItem("aiAssistantFabPosition") || "null");
      if (!stored) return;
      const rect = fab.getBoundingClientRect();
      fab.style.left = `${clamp(Number(stored.left) || 0, 6, window.innerWidth - rect.width - 6)}px`;
      fab.style.top = `${clamp(Number(stored.top) || 0, 6, window.innerHeight - rect.height - 6)}px`;
      fab.style.right = "auto";
      fab.style.bottom = "auto";
    } catch { /* ignore malformed local storage */ }
  }

  fab.addEventListener("pointerdown", (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    const rect = fab.getBoundingClientRect();
    dragState = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, left: rect.left, top: rect.top, moved: false };
    fab.setPointerCapture?.(event.pointerId);
  });
  fab.addEventListener("pointermove", (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const dx = event.clientX - dragState.startX;
    const dy = event.clientY - dragState.startY;
    if (Math.abs(dx) + Math.abs(dy) > 5) dragState.moved = true;
    const rect = fab.getBoundingClientRect();
    fab.style.left = `${clamp(dragState.left + dx, 6, window.innerWidth - rect.width - 6)}px`;
    fab.style.top = `${clamp(dragState.top + dy, 6, window.innerHeight - rect.height - 6)}px`;
    fab.style.right = "auto";
    fab.style.bottom = "auto";
  });
  fab.addEventListener("pointerup", (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const rect = fab.getBoundingClientRect();
    const distanceToLeft = rect.left;
    const distanceToRight = window.innerWidth - rect.right;
    const left = distanceToLeft <= distanceToRight ? 6 : window.innerWidth - rect.width - 6;
    fab.style.left = `${left}px`;
    fab.style.top = `${clamp(rect.top, 6, window.innerHeight - rect.height - 6)}px`;
    fab.style.right = "auto";
    fab.style.bottom = "auto";
    saveFabPosition(left, Number.parseFloat(fab.style.top));
    const moved = dragState.moved;
    dragState = null;
    if (moved) fab.dataset.skipClick = "true";
  });
  fab.addEventListener("click", () => {
    if (fab.dataset.skipClick === "true") {
      delete fab.dataset.skipClick;
      return;
    }
    setOpen(true);
  });

  closeButton.addEventListener("click", () => setOpen(false));
  clearButton.addEventListener("click", clearConversation);
  photoButton.addEventListener("click", chooseImage);
  removeFileButton.addEventListener("click", () => { selectedImage = null; fileInput.value = ""; updateAttachment(); });
  fileInput.addEventListener("change", () => setImage(fileInput.files?.[0]));
  compose.addEventListener("submit", sendMessage);
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop) setOpen(false); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && backdrop.classList.contains("is-open")) setOpen(false); });
  window.addEventListener("resize", () => {
    const rect = fab.getBoundingClientRect();
    if (rect.left < 0 || rect.right > window.innerWidth || rect.top < 0 || rect.bottom > window.innerHeight) {
      const left = clamp(rect.left, 6, window.innerWidth - rect.width - 6);
      const top = clamp(rect.top, 6, window.innerHeight - rect.height - 6);
      fab.style.left = `${left}px`;
      fab.style.top = `${top}px`;
      fab.style.right = "auto";
      fab.style.bottom = "auto";
      saveFabPosition(left, top);
    }
  });

  requestAnimationFrame(restoreFabPosition);
  if (window.innerWidth < 440) fab.classList.add("is-compact");
})();
