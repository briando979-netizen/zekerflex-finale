// ---------------------------------------------------------------------------
// De service worker op het subdomein van een ontwerpvoorstel (/sw.js; de
// root-layout registreert dat adres op elke pagina). Standaard een lege die
// zichzelf meteen uitschakelt: geen ZekerFlex-cache op het voorstel. SmileyApp
// is ook een app (PWA): die krijgt een kleine eigen worker die niets bewaart en
// alleen bij een pagina zonder internet een nette offline-melding toont in
// plaats van de foutpagina van de browser. Edge-veilig: alleen tekst.
// ---------------------------------------------------------------------------

const UITSCHAKELEN =
  "self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',()=>self.registration.unregister());";

const SMILEYAPP_OFFLINE =
  '<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Smileyapp · offline</title>' +
  "<style>body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;font-family:system-ui,sans-serif;background:#0E2A20;color:#fff;text-align:center}h1{font-size:1.6rem;margin:16px 0 8px}p{margin:0 0 20px;opacity:.85}a{display:inline-block;border-radius:999px;background:#FDD11A;color:#0E2A20;padding:12px 22px;font-weight:700;text-decoration:none}</style></head>" +
  '<body><main><svg width="96" height="96" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="40" fill="none" stroke="#5ABA8E" stroke-width="8"/><circle cx="38" cy="42" r="5" fill="#FDD11A"/><circle cx="62" cy="42" r="5" fill="#FDD11A"/><path d="M34 70 Q50 58 66 70" fill="none" stroke="#FDD11A" stroke-width="7" stroke-linecap="round"/></svg>' +
  '<h1>Je bent offline</h1><p>Smileyapp heeft internet nodig. Probeer het opnieuw zodra je weer verbinding hebt.</p><a href="">Opnieuw proberen</a></main></body></html>';

const SMILEYAPP_SW = [
  `const OFFLINE=${JSON.stringify(SMILEYAPP_OFFLINE)};`,
  "self.addEventListener('install',()=>self.skipWaiting());",
  "self.addEventListener('activate',(e)=>e.waitUntil(self.clients.claim()));",
  "self.addEventListener('fetch',(e)=>{if(e.request.mode!=='navigate')return;e.respondWith(fetch(e.request).catch(()=>new Response(OFFLINE,{headers:{'Content-Type':'text/html; charset=utf-8'}})));});",
].join("");

/** De inhoud van /sw.js voor het voorstel met deze naam (de kop x-zf-voorstel). */
export function voorstelServiceWorker(naam: string | null): string {
  return naam?.trim().toLowerCase() === "smileyapp" ? SMILEYAPP_SW : UITSCHAKELEN;
}
