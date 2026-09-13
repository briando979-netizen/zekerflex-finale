/* ZekerFlex service worker — push delivery + a minimal offline fallback.
 * Deliberately does NOT cache app HTML/JSON: this is an SSR app with a
 * per-request CSP nonce and auth-scoped data, so stale caches would be worse
 * than a spinner. Only a static offline page is precached. */

const OFFLINE_URL = "/offline.html";
const CACHE = "zf-shell-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add(OFFLINE_URL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Only intercept top-level navigations; everything else goes straight to the
// network. If the network is down, show the offline page.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.mode !== "navigate") return;
  event.respondWith(
    fetch(request).catch(() => caches.match(OFFLINE_URL, { ignoreSearch: true })),
  );
});

// --- Web Push (RFC 8291) — payload is JSON from lib/notifications/push -------
self.addEventListener("push", (event) => {
  // Server payload: { title, body, data: { type, shiftId, url?, ... } }
  let p = {};
  try {
    p = event.data ? event.data.json() : {};
  } catch (_e) {
    p = { title: "ZekerFlex", body: event.data ? event.data.text() : "" };
  }
  const d = p.data || {};
  const url =
    d.url ||
    (d.type === "SHIFT_OFFER" ? "/dashboard/klussen" : "/start");
  const tag = d.shiftId || d.tag || undefined;

  const options = {
    body: p.body || "",
    icon: p.icon || "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag,
    renotify: Boolean(tag),
    data: { url },
    vibrate: [80, 40, 80],
    timestamp: Date.now(),
  };
  event.waitUntil(self.registration.showNotification(p.title || "ZekerFlex", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/start";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(target) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
      return undefined;
    }),
  );
});

// The push service told us the subscription is dead; ask a window to re-subscribe.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    self.clients.matchAll({ includeUncontrolled: true }).then((clients) => {
      clients.forEach((c) => c.postMessage({ type: "pushsubscriptionchange" }));
    }),
  );
});
