(() => {
  "use strict";

  const freeClassButton = document.getElementById("public-free-class-cta");
  const unavailableModal = document.getElementById("public-class-unavailable-modal");
  const closeModalButton = document.getElementById("close-public-class-modal");
  const closeModalAction = document.getElementById("public-class-modal-close-action");
  if (!freeClassButton) return;

  let activeRoomId = "";
  let lastFocusedElement = null;

  function openUnavailableModal() {
    if (!unavailableModal) return;
    lastFocusedElement = document.activeElement;
    unavailableModal.hidden = false;
    document.body.classList.add("public-class-modal-open");
    closeModalAction?.focus();
  }

  function closeUnavailableModal() {
    if (!unavailableModal) return;
    unavailableModal.hidden = true;
    document.body.classList.remove("public-class-modal-open");
    lastFocusedElement?.focus?.();
    lastFocusedElement = null;
  }

  async function refreshPublicClassStatus() {
    try {
      const response = await fetch("/api/public-class/status", {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("Unable to read public class status");
      const payload = await response.json();
      const roomId = typeof payload.roomId === "string" ? payload.roomId.trim() : "";
      activeRoomId = payload.active === true && roomId.length > 0 ? roomId : "";

      if (activeRoomId) {
        const url = new URL("./public-class.html", window.location.href);
        url.searchParams.set("room", activeRoomId);
        freeClassButton.href = url.toString();
        freeClassButton.dataset.active = "true";
        freeClassButton.querySelector("small")?.replaceChildren(
          document.createTextNode("مباشرة الآن — أدخل اسمك الحقيقي"),
        );
      } else {
        freeClassButton.href = "#";
        freeClassButton.dataset.active = "false";
        freeClassButton.querySelector("small")?.replaceChildren(
          document.createTextNode("تحقق من توفر حصة مفتوحة"),
        );
      }
    } catch (error) {
      activeRoomId = "";
      freeClassButton.href = "#";
      freeClassButton.dataset.active = "false";
      freeClassButton.querySelector("small")?.replaceChildren(
        document.createTextNode("تحقق من توفر حصة مفتوحة"),
      );
      console.warn("Unable to refresh public class status:", error);
    }
  }

  freeClassButton.addEventListener("click", (event) => {
    if (activeRoomId) return;
    event.preventDefault();
    openUnavailableModal();
  });
  closeModalButton?.addEventListener("click", closeUnavailableModal);
  closeModalAction?.addEventListener("click", closeUnavailableModal);
  unavailableModal?.addEventListener("click", (event) => {
    if (event.target instanceof HTMLElement && event.target.hasAttribute("data-close-public-modal")) {
      closeUnavailableModal();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && unavailableModal && !unavailableModal.hidden) {
      closeUnavailableModal();
    }
  });

  void refreshPublicClassStatus();
  window.setInterval(refreshPublicClassStatus, 15000);
})();
