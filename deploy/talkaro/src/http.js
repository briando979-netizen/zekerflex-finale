// Het gewone webgedeelte: pagina's, bestanden, /health, /ice en de beheerpagina. Geen cookies: nergens.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { clientIp, ipSleutel, geheimKlopt } from './net.js';
import { iceServers } from './turn.js';
import { REDENEN } from './moderatie.js';

const SOORTEN = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json', '.bin': 'application/octet-stream', '.wasm': 'application/wasm' };
const PAGINAS = { '/': 'index.html', '/regels': 'regels.html', '/privacy': 'privacy.html', '/melden': 'melden.html' };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Het woordmerk volgt de naam: de o's aan het eind worden rondjes (talkar + oo). Verandert de naam, dan verandert dit mee.
export function merkHtml(naam) {
  const m = naam.toLowerCase().match(/^(.*?)(o{1,3})$/);
  return m ? `${esc(m[1])}<span class="oo" aria-hidden="true">${'<i></i>'.repeat(m[2].length)}</span>` : esc(naam.toLowerCase());
}

// Vult een pagina in: de naam, het woordmerk, en het contactadres (het blok verdwijnt als er geen adres is ingesteld).
export function vulPagina(html, cfg) {
  return html
    .replace(/<!--ALS_CONTACT-->([\s\S]*?)<!--EINDE-->/g, cfg.contactEmail ? '$1' : '')
    .replace(/<!--ALS_GEEN_CONTACT-->([\s\S]*?)<!--EINDE-->/g, cfg.contactEmail ? '' : '$1')
    .replaceAll('{{CONTACT_EMAIL}}', esc(cfg.contactEmail))
    .replaceAll('{{MERK}}', merkHtml(cfg.naam))
    .replaceAll('{{NAAM}}', esc(cfg.naam));
}

export function beveiligingsKoppen(req, cfg, evalToegestaan = false) {
  const host = cfg.siteHost || (/^[a-z0-9.:[\]-]+$/i.test(req.headers.host || '') ? req.headers.host : '');
  // 'self' dekt in oudere Safari de WebSocket niet; daarom staat het eigen adres er voluit bij.
  const ws = host ? ` ws://${host} wss://${host}` : '';
  // 'unsafe-eval' staat ALLEEN op de hoofdpagina (de chat/video), en alleen omdat TensorFlow.js — het model van de
  // automatische bloot-herkenning — intern new Function() gebruikt, ook met de WebGL-backend. De app voert zelf nooit
  // tekst als code uit: berichten van vreemden worden altijd als gewone tekst getoond (createTextNode), nooit als HTML.
  // De tekstpagina's, /beheer en alle API-antwoorden houden de strengere CSP zonder eval.
  const script = evalToegestaan ? "script-src 'self' 'unsafe-eval'" : "script-src 'self'";
  return {
    'Content-Security-Policy': `default-src 'self'; ${script}; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'${ws}; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=(), display-capture=(), payment=(), usb=(), bluetooth=(), browsing-topics=()',
    'X-Frame-Options': 'DENY',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
  };
}

export function maakHttp(cfg, staat) {
  // Alleen bestanden die bij het starten in public/ staan worden ooit uitgeleverd: een pad van buiten wijst nooit het bestandssysteem in.
  const bestanden = new Set(fs.readdirSync(cfg.publiekMap).filter((n) => fs.statSync(path.join(cfg.publiekMap, n)).isFile()));
  // Eén witte-lijst-submap: public/vendor/ (de zelfgehoste tfjs + het bloot-herkenningsmodel). Weer alleen de losse
  // bestanden die daar bij het starten in staan; een pad met "/", "\" of ".." komt er nooit doorheen.
  const vendorMap = path.join(cfg.publiekMap, 'vendor');
  let vendorBestanden = new Set();
  try { vendorBestanden = new Set(fs.readdirSync(vendorMap).filter((n) => fs.statSync(path.join(vendorMap, n)).isFile())); } catch (e) { /* geen vendor-map: dan is er niets te serveren */ }
  const klaar = (req, res, status, koppen, inhoud, evalToegestaan = false) => {
    res.writeHead(status, { ...beveiligingsKoppen(req, cfg, evalToegestaan), ...koppen });
    res.end(req.method === 'HEAD' ? undefined : inhoud);
  };
  const json = (req, res, status, data) => klaar(req, res, status, { 'Content-Type': SOORTEN['.json'], 'Cache-Control': 'no-store' }, JSON.stringify(data));
  const nietGevonden = (req, res) => klaar(req, res, 404, { 'Content-Type': SOORTEN['.html'], 'Cache-Control': 'no-store' },
    vulPagina('<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Niet gevonden – {{NAAM}}</title><link rel="stylesheet" href="/style.css"><script src="/thema.js"></script></head><body class="tekstpagina"><main class="blad"><h1>Deze pagina bestaat niet</h1><p><a href="/">Terug naar {{NAAM}}</a></p></main></body></html>', cfg));

  function stuurBestand(req, res, naam, alsPagina, map = cfg.publiekMap, witteLijst = bestanden) {
    if (!witteLijst.has(naam)) return nietGevonden(req, res);
    fs.readFile(path.join(map, naam), (fout, data) => {
      if (fout) return nietGevonden(req, res);
      const inhoud = alsPagina ? Buffer.from(vulPagina(data.toString('utf8'), cfg)) : data;
      const etag = '"' + crypto.createHash('sha1').update(inhoud).digest('base64url').slice(0, 20) + '"';
      // Altijd even navragen (ETag): na een nieuwe versie krijgt niemand een oud script bij een nieuwe pagina.
      const koppen = { 'Content-Type': SOORTEN[path.extname(naam)] || 'application/octet-stream', 'Cache-Control': 'no-cache', ETag: etag };
      // Alleen de hoofdpagina (index.html) mag 'unsafe-eval' hebben, voor TensorFlow.js van de bloot-herkenning.
      const evalOk = alsPagina && naam === 'index.html';
      if (req.headers['if-none-match'] === etag) return klaar(req, res, 304, koppen, undefined, evalOk);
      klaar(req, res, 200, koppen, inhoud, evalOk);
    });
  }

  function leesJson(req, max = 4096) {
    return new Promise((ok) => {
      let lengte = 0; const stukken = [];
      req.on('data', (c) => { lengte += c.length; if (lengte > max) { ok(null); req.destroy(); } else stukken.push(c); });
      req.on('end', () => { try { const o = JSON.parse(Buffer.concat(stukken).toString('utf8')); ok(o && typeof o === 'object' ? o : null); } catch (e) { ok(null); } });
      req.on('error', () => ok(null));
    });
  }

  // ---------------------------------------------------------------- beheer
  // Zonder BEHEER_TOKEN bestaat /beheer niet. Een fout geheim geeft 404 (geen 403: een reeks daarvan ziet een
  // inbraakfilter als aanval), en na te veel missers krijgt dat adres een tijdje alleen nog 404, ook met het goede geheim.
  async function beheer(req, res, pad, sleutel) {
    if (!cfg.beheerToken) return nietGevonden(req, res);
    if (pad === '/beheer' && (req.method === 'GET' || req.method === 'HEAD')) return stuurBestand(req, res, 'beheer.html', true);
    if (!pad.startsWith('/beheer/api/')) return nietGevonden(req, res);
    const gegeven = String(req.headers.authorization || '').replace(/^Bearer /, '');
    if (staat.beheerSlot.get(sleutel) > staat.nu()) return nietGevonden(req, res);
    if (!geheimKlopt(gegeven, cfg.beheerToken)) {
      if (!staat.tempoIp.neem('beheer:' + sleutel, cfg.tempoIp.beheerFout)) { staat.beheerSlot.set(sleutel, staat.nu() + 15 * 60 * 1000); staat.log('beheer-slot', { adres: sleutel }); }
      return nietGevonden(req, res);
    }
    if (pad === '/beheer/api/overzicht' && req.method === 'GET') return json(req, res, 200, { ...staat.cijfers(), ...staat.moderatie.overzicht(), redenen: REDENEN, naam: cfg.naam, pauze: staat.pauzeAan() });
    if (pad === '/beheer/api/actie' && req.method === 'POST') {
      if (!String(req.headers['content-type'] || '').startsWith('application/json')) return json(req, res, 400, { fout: 'vorm' });
      const b = await leesJson(req);
      if (!b) return json(req, res, 400, { fout: 'vorm' });
      const sleutelOk = typeof b.sleutel === 'string' && /^[0-9a-f]{20}$/.test(b.sleutel);
      if (b.actie === 'blokkeer' && sleutelOk) {
        const uren = Number.isFinite(b.uren) ? Math.min(Math.max(b.uren, 1), 24 * 365) : 24;
        staat.moderatie.blokkeer(b.sleutel, uren * 3600000, 'door beheer', 'beheer'); staat.schop(b.sleutel);
        staat.log('beheer-blokkeer', { adres: b.sleutel, uren }); return json(req, res, 200, { ok: true });
      }
      if (b.actie === 'deblokkeer' && sleutelOk) { const ok = staat.moderatie.deblokkeer(b.sleutel); staat.log('beheer-deblokkeer', { adres: b.sleutel }); return json(req, res, 200, { ok }); }
      if (b.actie === 'status' && typeof b.id === 'string') return json(req, res, 200, { ok: staat.moderatie.zetStatus(b.id, b.status) });
      // Noodknop: de hele site op pauze (of weer aan). Geen nieuwe koppelingen; lopende gesprekken worden netjes afgesloten.
      if (b.actie === 'pauze' && typeof b.aan === 'boolean') { staat.zetPauze(b.aan); staat.log(b.aan ? 'beheer-pauze-aan' : 'beheer-pauze-uit'); return json(req, res, 200, { ok: true, pauze: staat.pauzeAan() }); }
      return json(req, res, 400, { fout: 'onbekend' });
    }
    return nietGevonden(req, res);
  }

  return function verzoek(req, res) {
    let pad;
    try { pad = decodeURIComponent((req.url || '/').split('?')[0]); } catch (e) { return klaar(req, res, 400, { 'Content-Type': SOORTEN['.txt'] }, 'Ongeldig verzoek'); }
    if (pad.length > 1 && pad.endsWith('/')) pad = pad.slice(0, -1);
    const sleutel = ipSleutel(clientIp(req, cfg.vertrouwProxy), staat.zout);
    if (pad === '/beheer' || pad.startsWith('/beheer/')) return void beheer(req, res, pad, sleutel).catch(() => nietGevonden(req, res));
    if (req.method !== 'GET' && req.method !== 'HEAD') return klaar(req, res, 405, { 'Content-Type': SOORTEN['.txt'], Allow: 'GET, HEAD' }, 'Niet toegestaan');
    if (pad === '/health') return json(req, res, staat.stopt ? 503 : 200, { ok: !staat.stopt, sinds: Math.round(process.uptime()) });
    if (pad === '/ice') {
      if (!staat.tempoIp.neem('ice:' + sleutel, cfg.tempoIp.ice)) return json(req, res, 429, { fout: 'te-vaak' });
      return json(req, res, 200, iceServers(cfg));
    }
    if (Object.hasOwn(PAGINAS, pad)) return stuurBestand(req, res, PAGINAS[pad], true);
    // De vendor-submap: alleen losse bestanden die er bij het starten in staan, zonder padtraversal.
    if (pad.startsWith('/vendor/')) {
      const vnaam = pad.slice('/vendor/'.length);
      if (!vnaam || vnaam.includes('/') || vnaam.includes('\\') || vnaam.includes('..')) return nietGevonden(req, res);
      return stuurBestand(req, res, vnaam, false, vendorMap, vendorBestanden);
    }
    const naam = pad.slice(1);
    // Losse .html-bestanden gaan alleen via hun nette adres; zo is /beheer.html geen achterdeur.
    if (!naam || naam.includes('/') || naam.includes('\\') || naam.endsWith('.html')) return nietGevonden(req, res);
    return stuurBestand(req, res, naam, false);
  };
}
