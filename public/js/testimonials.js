(() => {
  const videos = [...document.querySelectorAll("[data-testimonial-video]")];
  const moreButton = document.querySelector("[data-show-more-testimonials]");
  const moreCards = [...document.querySelectorAll(".testimonial-card.is-more")];

  videos.forEach((video) => {
    video.addEventListener("play", () => {
      videos.forEach((other) => {
        if (other !== video) other.pause();
      });
    });

    if (video.matches("[data-desktop-testimonial-video]")) {
      const togglePlayback = (event) => {
        event.preventDefault();
        if (video.paused) video.play().catch(() => {});
        else video.pause();
      };
      video.addEventListener("click", togglePlayback);
      video.addEventListener("contextmenu", (event) => event.preventDefault());
      video.addEventListener("dblclick", (event) => event.preventDefault());
      video.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") togglePlayback(event);
      });
    }
  });

  moreButton?.addEventListener("click", () => {
    const expanded = moreCards.some((card) => card.classList.contains("is-visible"));
    moreCards.forEach((card) => card.classList.toggle("is-visible", !expanded));
    moreButton.textContent = expanded ? "شاهد المزيد من آراء التلاميذ" : "إخفاء بعض الفيديوهات";
    moreButton.setAttribute("aria-expanded", String(!expanded));
  });
})();

const desktopScheduleImage = document.querySelector(".desktop-schedule-image");
const desktopScheduleModal = document.getElementById("desktop-schedule-image-modal");
const desktopScheduleModalImage = document.getElementById("desktop-schedule-image-modal-img");

if (desktopScheduleImage && desktopScheduleModal && desktopScheduleModalImage) {
  const closeScheduleImage = () => {
    desktopScheduleModal.hidden = true;
    document.body.classList.remove("desktop-schedule-modal-open");
  };

  desktopScheduleImage.addEventListener("click", () => {
    desktopScheduleModal.hidden = false;
    document.body.classList.add("desktop-schedule-modal-open");
  });
  desktopScheduleModal.addEventListener("click", closeScheduleImage);
  desktopScheduleModalImage.addEventListener("click", closeScheduleImage);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !desktopScheduleModal.hidden) closeScheduleImage();
  });
}

window.addEventListener("pagehide", () => {
  document.querySelectorAll("[data-testimonial-video]").forEach((video) => video.pause());
});
