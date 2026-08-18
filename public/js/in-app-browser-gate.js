(() => {
  "use strict";

  const DISMISSED_KEY = "inAppBrowserNoticeDismissed";
  const modal = document.getElementById("in-app-browser-modal");
  const openButton = document.getElementById("open-external-browser-btn");
  const continueButton = document.getElementById("continue-in-app-browser-btn");
  const copyButton = document.getElementById("copy-site-link-btn");
  const instruction = document.getElementById("in-app-browser-instruction");
  const status = document.getElementById("in-app-browser-status");

  if (!modal || !openButton || !continueButton) return;

  const userAgent = navigator.userAgent || "";
  const isAndroid = /Android/i.test(userAgent);
  const isIOS = /iPhone|iPad|iPod/i.test(userAgent);
  const isStandalone = Boolean(
    window.navigator.standalone === true ||
    window.matchMedia?.("(display-mode: standalone)").matches
  );
  const hasInAppToken = /(FBAN|FBAV|FB_IAB|Instagram|Messenger|Line\/|Twitter|Snapchat|TikTok|GSA\/)/i.test(userAgent);
  const isAndroidWebView = isAndroid && (/;\s*wv\)/i.test(userAgent) || /Version\/4\.0/i.test(userAgent) && /Chrome\//i.test(userAgent));
  const isIOSWebView = isIOS && !/Safari\//i.test(userAgent) && !/CriOS|FxiOS|OPiOS/i.test(userAgent);
  const isInAppBrowser = !isStandalone && (hasInAppToken || isAndroidWebView || isIOSWebView);

  if (!isInAppBrowser) return;

  const currentUrl = window.location.href;
  const encodedUrl = encodeURIComponent(currentUrl);

  if (isAndroid) {
    openButton.textContent = "فتح في Google Chrome";
    instruction.textContent = "إذا لم يفتح Chrome تلقائيًا، اضغط على النقاط الثلاث في Messenger ثم اختر «فتح في Chrome».";
    openButton.dataset.platform = "android";
  } else if (isIOS) {
    openButton.textContent = "فتح في Safari";
    instruction.textContent = "إذا لم يفتح Safari تلقائيًا، اضغط على زر المشاركة في المتصفح الداخلي ثم اختر «فتح في Safari».";
    openButton.dataset.platform = "ios";
  } else {
    openButton.textContent = "فتح في المتصفح الكامل";
    instruction.textContent = "افتح الرابط في Chrome أو Safari أو Firefox للاستفادة من كل خصائص الموقع.";
    openButton.dataset.platform = "other";
  }

  const showModal = () => {
    modal.hidden = false;
    modal.classList.add("is-open");
    document.body.classList.add("in-app-browser-notice-open");
    openButton.focus();
  };

  const closeModal = () => {
    modal.classList.remove("is-open");
    modal.hidden = true;
    document.body.classList.remove("in-app-browser-notice-open");
  };

  const markDismissed = () => {
    try {
      window.localStorage.setItem(DISMISSED_KEY, "1");
    } catch (_error) {
      // Private browsing may block localStorage; the notice can still be closed.
    }
  };

  openButton.addEventListener("click", async () => {
    markDismissed();
    if (isAndroid) {
      const intentUrl = `intent://${window.location.host}${window.location.pathname}${window.location.search}${window.location.hash}#Intent;scheme=https;package=com.android.chrome;end`;
      window.location.href = intentUrl;
      return;
    }
    if (isIOS) {
      try {
        await navigator.clipboard?.writeText(currentUrl);
      } catch (_error) {
        // Clipboard permissions are optional; the instruction remains visible.
      }
      if (status) status.textContent = "تم نسخ الرابط. افتح Safari ثم الصق الرابط في شريط العنوان.";
      return;
    }
    window.open(currentUrl, "_blank", "noopener,noreferrer");
  });

  copyButton?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(currentUrl);
      if (status) status.textContent = "تم نسخ رابط الموقع. افتحه الآن في Chrome أو Safari.";
    } catch (_error) {
      if (status) status.textContent = `انسخ هذا الرابط يدويًا: ${decodeURIComponent(encodedUrl)}`;
    }
  });

  continueButton.addEventListener("click", () => {
    markDismissed();
    closeModal();
  });

  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      markDismissed();
      closeModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      markDismissed();
      closeModal();
    }
  });

  let dismissed = false;
  try {
    dismissed = window.localStorage.getItem(DISMISSED_KEY) === "1";
  } catch (_error) {
    dismissed = false;
  }
  if (!dismissed) window.setTimeout(showModal, 120);
})();
