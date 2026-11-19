// Netwerkhulpjes: het echte adres van een bezoeker, een onherkenbare sleutel daarvan, de herkomstcontrole en tempogrenzen.
import crypto from 'node:crypto';

// Het adres van de bezoeker. Achter onze eigen proxy (TRUST_PROXY=1) is dat het LAATSTE adres in X-Forwarded-For:
// dat heeft de proxy er zelf achter gezet; alles ervoor kan de bezoeker verzonnen hebben.
export function clientIp(req, vertrouwProxy) {
  let ip = req.socket?.remoteAddress || '';
  if (vertrouwProxy) {
    const xff = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
    const laatste = xff[xff.length - 1];
    if (laatste && /^[0-9a-fA-F:.]{3,45}$/.test(laatste)) ip = laatste;
  }
  return normaliseerIp(ip);
}

// IPv4 blijft heel; van IPv6 tellen alleen de eerste vier groepen (/64): de rest kiest een bezoeker zelf.
export function normaliseerIp(ip) {
  let s = String(ip || '').trim().toLowerCase().replace(/%.*$/, '');
  const v4in6 = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4in6) s = v4in6[1];
  if (!s.includes(':')) return s || 'onbekend';
  const [links, rechts] = s.split('::');
  const l = links ? links.split(':') : [], r = rechts !== undefined && rechts ? rechts.split(':') : [];
  const vol = rechts === undefined ? l : [...l, ...Array(Math.max(0, 8 - l.length - r.length)).fill('0'), ...r];
  return vol.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':') + '::/64';
}

// Een sleutel per adres die niet terug te rekenen is zonder het zout. Die bewaren en loggen we, nooit het adres zelf.
export const ipSleutel = (ip, zout) => crypto.createHmac('sha256', zout).update(String(ip)).digest('hex').slice(0, 20);
export const kort = (sleutel) => String(sleutel).slice(0, 8);

// Herkomstcontrole op de WebSocket: de pagina die verbindt moet van dit adres zelf komen.
// Achter de proxy is de Host van het verzoek "app:3000"; daarom tellen SITE_HOST en (met TRUST_PROXY) X-Forwarded-Host.
export function herkomstKlopt(req, cfg) {
  const origin = String(req.headers.origin || '');
  let host;
  try { const u = new URL(origin); if (u.protocol !== 'http:' && u.protocol !== 'https:') return false; host = u.host.toLowerCase(); } catch (e) { return false; }
  if (cfg.siteHost) return host === cfg.siteHost;
  const toegestaan = [String(req.headers.host || '').toLowerCase()];
  if (cfg.vertrouwProxy && req.headers['x-forwarded-host']) toegestaan.push(String(req.headers['x-forwarded-host']).split(',').pop().trim().toLowerCase());
  return toegestaan.filter(Boolean).includes(host);
}

// Emmer met fiches: `emmer` in één keer, daarna `perSec` erbij. neem() zegt of het nog mag.
export class Tempo {
  constructor(nu = Date.now) { this.nu = nu; this.emmers = new Map(); }
  neem(sleutel, [emmer, perSec]) {
    const t = this.nu();
    let e = this.emmers.get(sleutel);
    if (!e) { e = { n: emmer, t }; this.emmers.set(sleutel, e); }
    e.n = Math.min(emmer, e.n + ((t - e.t) / 1000) * perSec); e.t = t;
    if (e.n < 1) return false;
    e.n -= 1; return true;
  }
  // Volle emmers van lang geleden weggooien, anders groeit de lijst met elk adres dat ooit langskwam.
  ruimOp(ouderDanMs = 60 * 60 * 1000) { const t = this.nu(); for (const [k, e] of this.emmers) if (t - e.t > ouderDanMs) this.emmers.delete(k); }
}

// Twee geheimen vergelijken zonder dat de duur iets verraadt (ook niet de lengte).
export function geheimKlopt(gegeven, echt) {
  if (!echt || typeof gegeven !== 'string') return false;
  const a = crypto.createHash('sha256').update(gegeven).digest(), b = crypto.createHash('sha256').update(echt).digest();
  return crypto.timingSafeEqual(a, b);
}
