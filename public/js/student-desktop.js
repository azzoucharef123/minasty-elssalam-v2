/* Desktop-only CSS mode marker.
 * No DOM nodes are moved or reparented. WebRTC, Socket.IO, and event bindings
 * continue to use the original document structure unchanged. */
(() => {
  'use strict';

  const DESKTOP_QUERY = '(min-width: 901px)';
  const root = document.documentElement;

  function syncDesktopMode() {
    root.classList.toggle('student-desktop-mode', window.matchMedia(DESKTOP_QUERY).matches);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncDesktopMode, { once: true });
  } else {
    syncDesktopMode();
  }

  window.addEventListener('resize', syncDesktopMode, { passive: true });
})();
