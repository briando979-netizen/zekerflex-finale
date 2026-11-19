// FlikFlak service worker: de app-schil offline beschikbaar, de rest (api, uploads) altijd vers van het net.
const VERSIE = 'ff-v4';
const SCHIL = ['/', '/index.html', '/app.css', '/app.js', '/meer.js', '/instellingen.js', '/logo.svg', '/manifest.webmanifest'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSIE).then(c => c.addAll(SCHIL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSIE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/') || u.pathname.startsWith('/uploads/') || u.pathname === '/ws' || u.pathname.startsWith('/beheer')) return;
  // schil: netwerk eerst (zodat een uitrol meteen doorkomt), cache als het net wegvalt
  e.respondWith(fetch(e.request).then(r => { const k = r.clone(); caches.open(VERSIE).then(c => c.put(e.request, k)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('/'))));
});
// meldingen op het apparaat (web push): de server stuurt { title, body, url, tag, icon }
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'FlikFlak', { body: d.body || '', icon: d.icon || '/iconen/192.png', badge: '/iconen/192.png', tag: d.tag || 'ff', renotify: true, data: { url: d.url || '/' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    const open = cs.find(c => c.url.startsWith(self.location.origin));
    if (open) { open.navigate(url); return open.focus(); }
    return self.clients.openWindow(url);
  }));
});