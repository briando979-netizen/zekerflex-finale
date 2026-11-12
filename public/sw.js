/* ZekerFlex service worker — push delivery + a minimal offline fallback.
 * Deliberately does NOT cache app HTML/JSON: this is an SSR app with a
 * per-request CSP nonce and auth-scoped data, so stale caches would be worse
 * than a spinner. Only a static offline page is precached. */

const OFFLINE_URL = "/offline.html";
const CACHE = "zf-shell-v3";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add(OFFLINE_URL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Ververs hier geen open vensters: activate draait ook bij iemands allereerste
  // bezoek, dus dat zou een half ingevuld formulier wissen.
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
  // Server payload: { title, body, data: { type, shiftId?, url?, tag?, ... } }
  // type: SHIFT_OFFER | CALL | CALL_MISSED | CHAT
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
  const ringing = d.type === "CALL";

  const options = {
    body: p.body || "",
    icon: p.icon || "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag,
    renotify: Boolean(tag),
    data: { url },
    // A ringing call stays on screen until it's handled, like a phone call.
    requireInteraction: ringing,
    vibrate: ringing ? [400, 200, 400, 200, 400, 200, 400] : [80, 40, 80],
    timestamp: Date.now(),
  };
  event.waitUntil(self.registration.showNotification(p.title || "ZekerFlex", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/start";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      for (const client of clients) {
        if (client.url.includes(target) && "focus" in client) return client.focus();
      }
      // Reuse an open ZekerFlex window rather than stacking new tabs.
      for (const client of clients) {
        if ("navigate" in client && "focus" in client) {
          try {
            const moved = await client.navigate(target);
            return (moved || client).focus();
          } catch (_e) {
            /* uncontrolled client — fall through to a new window */
          }
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
      return undefined;
    }),
  );
});

// De pushdienst heeft de aanmelding vervangen of ingetrokken: meteen zelf opnieuw aanmelden en de
// nieuwe aan de server geven, ook als er geen venster open is (vroeger ging er een bericht naar de
// vensters, maar daar luisterde niemand naar). De sleutel komt van de oude aanmelding of van de server.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const oud = event.oldSubscription || null;
      let nieuw = event.newSubscription || null;
      if (!nieuw) {
        let sleutel = oud && oud.options ? oud.options.applicationServerKey : null;
        if (!sleutel) {
          const r = await fetch("/api/me/push", { credentials: "same-origin", cache: "no-store" });
          const d = r.ok ? await r.json() : null;
          sleutel = d && d.vapidPublicKey ? d.vapidPublicKey : null;
        }
        if (!sleutel) return;
        nieuw = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: sleutel });
      }
      const json = nieuw.toJSON();
      const vorig = oud && oud.endpoint !== json.endpoint ? { vorig: oud.endpoint } : {};
      await fetch("/api/me/push", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, ...vorig }),
      });
    })().catch(() => undefined),
  );
});
