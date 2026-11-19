// FlikFlak service worker: de app-schil offline beschikbaar, de rest (api, uploads) altijd vers van het net.
const VERSIE = 'ff-v2';
const SCHIL = ['/', '/index.html', '/app.css', '/app.js', '/meer.js', '/logo.svg', '/manifest.webmanifest'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSIE).then(c => c.addAll(SCHIL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSIE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/') || u.pathname.startsWith('/uploads/') || u.pathname === '/ws' || u.pathname.startsWith('/beheer')) return;
  // schil: netwerk eerst (zodat een uitrol meteen doorkomt), cache als het net wegvalt
  e.respondWith(fetch(e.request).then(r => { const k = r.clone(); caches.open(VERSIE).then(c => c.put(e.request, k)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('/'))));
});