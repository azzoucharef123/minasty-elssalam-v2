/* Desktop-only DOM organizer.
 * It moves existing nodes without changing IDs, event bindings, WebRTC, Socket.IO,
 * chat payloads, or modal lifecycles. Mobile restores the original DOM order. */
(() => {
  'use strict';

  const DESKTOP_QUERY = '(min-width: 901px)';
  let desktopLayout = null;

  function getNodes() {
    const shell = document.querySelector('.viewer-shell');
    const stage = shell?.querySelector(':scope > .viewer-stage');
    const header = shell?.querySelector(':scope > .viewer-header');
    const video = stage?.querySelector(':scope > .video-frame');
    const chat = stage?.querySelector(':scope > .student-chat-panel');
    const actions = stage?.querySelector(':scope > .viewer-actions-divider');
    if (!shell || !stage || !header || !video || !chat || !actions) return null;
    return { shell, stage, header, video, chat, actions };
  }

  function enterDesktopLayout() {
    if (desktopLayout || !window.matchMedia(DESKTOP_QUERY).matches) return;
    const nodes = getNodes();
    if (!nodes) return;

    const root = document.createElement('div');
    root.className = 'student-desktop-root';
    root.setAttribute('data-layout-mode', 'desktop');

    const broadcast = document.createElement('main');
    broadcast.className = 'student-desktop-broadcast';
    broadcast.setAttribute('aria-label', 'شاشة بث الأستاذ');

    const sidebar = document.createElement('aside');
    sidebar.className = 'student-desktop-sidebar';
    sidebar.setAttribute('aria-label', 'لوحة تحكم التلميذ');

    nodes.shell.insertBefore(root, nodes.header);
    root.append(broadcast, sidebar);
    broadcast.append(nodes.video);
    sidebar.append(nodes.header, nodes.chat, nodes.actions);
    nodes.stage.hidden = true;

    desktopLayout = { ...nodes, root, broadcast, sidebar };
  }

  function leaveDesktopLayout() {
    if (!desktopLayout || window.matchMedia(DESKTOP_QUERY).matches) return;
    const { shell, stage, header, video, chat, actions, root } = desktopLayout;
    stage.hidden = false;
    stage.append(video, actions, chat);
    shell.insertBefore(header, stage);
    root.remove();
    desktopLayout = null;
  }

  function syncLayout() {
    if (window.matchMedia(DESKTOP_QUERY).matches) {
      enterDesktopLayout();
    } else {
      leaveDesktopLayout();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncLayout, { once: true });
  } else {
    syncLayout();
  }

  window.addEventListener('resize', syncLayout, { passive: true });
})();
