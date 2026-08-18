(() => {
  "use strict";

  const modal = document.getElementById("in-app-browser-modal");
  const openButton = document.getElementById("open-external-browser-btn");
  const instruction = document.getElementById("in-app-browser-instruction");

  if (!modal || !openButton) return;

  const userAgent = navigator.userAgent || "";
  const isAndroid = /Android/i.test(userAgent);
  const isIOS = /iPhone|iPad|iPod/i.test(userAgent);
  const isStandalone = Boolean(
    window.navigator.standalone === true ||
    window.matchMedia?.("(display-mode: standalone)").matches
  );
  const hasInAppToken = /(FBAN|FBAV|FB_IAB|Instagram|Messenger|Telegram|Line\/|Twitter|Snapchat|TikTok|GSA\/)/i.test(userAgent);
  const isAndroidWebView = isAndroid && (
    /;\s*wv\)/i.test(userAgent) ||
    (/Version\/4\.0/i.test(userAgent) && /Chrome\//i.test(userAgent))
  );
  const isIOSWebView = isIOS && !/Safari\//i.test(userAgent) && !/CriOS|FxiOS|OPiOS/i.test(userAgent);
  const isInAppBrowser = !isStandalone && (hasInAppToken || isAndroidWebView || isIOSWebView);

  if (!isInAppBrowser) return;

  const currentUrl = window.location.href;

  if (isAndroid) {
    instruction.textContent = "اضغط على الزر للانتقال إلى Google Chrome والاستفادة من جميع مزايا الموقع.";
  } else if (isIOS) {
    instruction.textContent = "اضغط على الزر لفتح الموقع في Safari والاستفادة من جميع مزايا الموقع.";
  } else {
    instruction.textContent = "اضغط على الزر لفتح الموقع في متصفح كامل.";
  }

  const showModal = () => {
    modal.hidden = false;
    modal.classList.add("is-open");
    document.body.classList.add("in-app-browser-notice-open");
    openButton.focus();
  };

  openButton.addEventListener("click", () => {
    if (isAndroid) {
      const intentUrl = `intent://${window.location.host}${window.location.pathname}${window.location.search}${window.location.hash}#Intent;scheme=https;package=com.android.chrome;end`;
      window.location.href = intentUrl;
      return;
    }

    // iOS and other in-app browsers may expose only a user-gesture-based new tab.
    window.open(currentUrl, "_blank", "noopener,noreferrer");
  });

  // Do not persist a dismissal flag: the notice must appear on every in-app visit.
  window.setTimeout(showModal, 120);
})();
