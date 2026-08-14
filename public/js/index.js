(() => {
  "use strict";

  const freeClassButton = document.getElementById("public-free-class-cta");
  if (!freeClassButton) return;

  async function refreshPublicClassStatus() {
    try {
      const response = await fetch("/api/public-class/status", {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("Unable to read public class status");
      const payload = await response.json();
      const roomId = typeof payload.roomId === "string" ? payload.roomId.trim() : "";
      const active = payload.active === true && roomId.length > 0;

      freeClassButton.hidden = !active;
      if (active) {
        const url = new URL("./public-class.html", window.location.href);
        url.searchParams.set("room", roomId);
        freeClassButton.href = url.toString();
      } else {
        freeClassButton.removeAttribute("href");
      }
    } catch (error) {
      freeClassButton.hidden = true;
      freeClassButton.removeAttribute("href");
      console.warn("Unable to refresh public class status:", error);
    }
  }

  void refreshPublicClassStatus();
  window.setInterval(refreshPublicClassStatus, 15000);
})();
