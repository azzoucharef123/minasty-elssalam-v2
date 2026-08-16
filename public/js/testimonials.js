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
  });

  moreButton?.addEventListener("click", () => {
    const expanded = moreCards.some((card) => card.classList.contains("is-visible"));
    moreCards.forEach((card) => card.classList.toggle("is-visible", !expanded));
    moreButton.textContent = expanded ? "شاهد المزيد من آراء التلاميذ" : "إخفاء بعض الفيديوهات";
    moreButton.setAttribute("aria-expanded", String(!expanded));
  });
})();

window.addEventListener("pagehide", () => {
  document.querySelectorAll("[data-testimonial-video]").forEach((video) => video.pause());
});
