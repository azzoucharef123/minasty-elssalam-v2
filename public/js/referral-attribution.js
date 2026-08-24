(() => {
  const STORAGE_KEY = "minasatyReferralCode";
  const REFERRAL_QUERY_KEY = "ref";
  const VALID_CODE = /^[A-Z0-9]{6,20}$/;

  function normalize(value) {
    const code = String(value || "").trim().toUpperCase();
    return VALID_CODE.test(code) ? code : "";
  }

  function readStorage(storage) {
    try { return storage.getItem(STORAGE_KEY) || ""; } catch { return ""; }
  }

  function writeStorage(storage, value) {
    try { storage.setItem(STORAGE_KEY, value); } catch { /* Some private/in-app browsers block storage. */ }
  }

  function removeStorage(storage) {
    try { storage.removeItem(STORAGE_KEY); } catch { /* Ignore blocked storage cleanup. */ }
  }

  function getStoredCode() {
    return normalize(readStorage(localStorage) || readStorage(sessionStorage));
  }

  function saveCode(value) {
    const code = normalize(value);
    if (!code) return "";
    writeStorage(localStorage, code);
    writeStorage(sessionStorage, code);
    return code;
  }

  const incomingCode = normalize(new URLSearchParams(window.location.search).get(REFERRAL_QUERY_KEY));
  const referralCode = incomingCode || getStoredCode();
  if (incomingCode) saveCode(incomingCode);

  function withReferral(href) {
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) return href;
    try {
      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin) return href;
      if (!referralCode) return href;
      if (["/index.html", "/", "/parent-login.html", "/register.html"].includes(url.pathname)) {
        url.searchParams.set(REFERRAL_QUERY_KEY, referralCode);
      }
      return `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return href;
    }
  }

  function decorateLinks() {
    if (!referralCode) return;
    document.querySelectorAll("a[href]").forEach((link) => {
      link.setAttribute("href", withReferral(link.getAttribute("href")));
    });
  }

  window.getStoredReferralCode = getStoredCode;
  window.getReferralCode = () => referralCode || getStoredCode();
  window.withReferralCode = withReferral;
  window.saveReferralCode = saveCode;
  window.clearReferralCode = () => {
    removeStorage(localStorage);
    removeStorage(sessionStorage);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", decorateLinks, { once: true });
  else decorateLinks();
})();
