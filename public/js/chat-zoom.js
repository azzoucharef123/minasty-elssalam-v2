(() => {
  const range = document.getElementById("chat-zoom-range");
  const output = document.getElementById("chat-zoom-value");
  const reset = document.getElementById("chat-zoom-reset");
  const chatBox = document.getElementById("chat-box");
  if (!range || !output || !reset || !chatBox) return;

  const scope = window.location.pathname.includes("teacher-live") ? "teacher" : "student";
  const storageKey = `live-chat-zoom-${scope}`;
  const clamp = (value) => Math.min(200, Math.max(100, Number(value) || 100));

  function applyZoom(value, persist = true) {
    const zoom = clamp(value);
    range.value = String(zoom);
    output.value = `${zoom}%`;
    output.textContent = `${zoom}%`;
    chatBox.style.setProperty("--chat-zoom", String(zoom / 100));
    if (persist) {
      try {
        window.localStorage.setItem(storageKey, String(zoom));
      } catch {
        // Private browsing or storage restrictions should not disable zoom.
      }
    }
  }

  let initialZoom = 100;
  try {
    initialZoom = clamp(window.localStorage.getItem(storageKey));
  } catch {
    initialZoom = 100;
  }

  applyZoom(initialZoom, false);
  range.addEventListener("input", () => applyZoom(range.value));
  reset.addEventListener("click", () => {
    applyZoom(100);
    range.focus();
  });
})();
