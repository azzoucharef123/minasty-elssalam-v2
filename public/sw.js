self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: "أكاديمية التفوق", body: event.data?.text() || "لديك إشعار جديد." }; }
  event.waitUntil(self.registration.showNotification(data.title || "أكاديمية التفوق", { body: data.body || "لديك إشعار جديد.", icon: "/favicon.ico", badge: "/favicon.ico", dir: "rtl", lang: "ar", data: { link: data.link || "/academic-center.html" } }));
});
self.addEventListener("notificationclick", (event) => { event.notification.close(); event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => { const target = event.notification.data?.link || "/academic-center.html"; const existing = windows.find((client) => "focus" in client); return existing ? existing.focus().then(() => existing.navigate(target)) : clients.openWindow(target); })); });
