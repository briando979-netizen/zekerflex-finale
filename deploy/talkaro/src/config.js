// Alle instellingen op één plek. Alles komt uit de omgeving (zie .env.voorbeeld); niets is verplicht om lokaal te starten.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WORTEL = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const getal = (v, standaard, min, max) => { const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? n : standaard; };
const hostNetjes = (v) => { const h = String(v || '').trim().toLowerCase(); return /^[a-z0-9.-]+(:\d{1,5})?$/.test(h) ? h : ''; };

export function leesConfig(env = process.env, extra = {}) {
  const token = String(env.BEHEER_TOKEN || '');
  const mail = String(env.CONTACT_EMAIL || '').trim();
  const naam = String(env.SITE_NAAM || '').trim();
  return {
    // De productnaam staat alleen hier. Pagina's krijgen hem via {{NAAM}}, de scripts via <meta name="application-name">.
    naam: /^[\p{L}\p{N} .!-]{2,30}$/u.test(naam) ? naam : 'Talkaroo',
    poort: getal(env.PORT, 3000, 0, 65535),
    luisterOp: env.HOST || '0.0.0.0',
    // Het adres waarop de site draait (bijv. talkaro.zekerflex.com). Gezet: alleen die herkomst mag de WebSocket openen.
    siteHost: hostNetjes(env.SITE_HOST),
    // Alleen met TRUST_PROXY=1 geloven we X-Forwarded-For/X-Forwarded-Host (er staat dan precies één eigen proxy voor).
    vertrouwProxy: env.TRUST_PROXY === '1',
    // Een te kort geheim telt als geen geheim: de beheerpagina blijft dan dicht.
    beheerToken: token.length >= 16 ? token : '',
    beheerTokenTeKort: token.length > 0 && token.length < 16,
    contactEmail: /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(mail) && mail.length <= 120 ? mail : '',
    turnHost: hostNetjes(env.TURN_HOST).replace(/:\d+$/, ''),
    turnGeheim: String(env.TURN_SECRET || ''),
    turnPoort: getal(env.TURN_PORT, 3478, 1, 65535),
    turnGeldigSec: 3600,
    dataMap: env.DATA_DIR ? path.resolve(env.DATA_DIR) : path.join(WORTEL, 'data'),
    publiekMap: path.join(WORTEL, 'public'),
    certMap: path.join(WORTEL, 'certs'),
    ipZout: String(env.IP_ZOUT || ''),
    maxPerIp: getal(env.MAX_VERBINDINGEN_PER_IP, 8, 1, 1000),
    maxVerbindingen: getal(env.MAX_VERBINDINGEN, 2000, 2, 100000),
    // Tempo's: [emmer, aanvulling per seconde]. Wie erboven gaat, wordt genegeerd; wie blijft doorgaan, wordt verbroken.
    tempo: { find: [6, 0.2], msg: [8, 1.5], typing: [6, 2], signal: [80, 20], g: [12, 4], report: [3, 0.02], stop: [6, 1] },
    tempoIp: { find: [20, 0.5], report: [3, 1 / 200], ice: [20, 0.2], beheerFout: [8, 1 / 120] },
    wachtZonderInteresseMs: 5000,   // zo lang zoeken we eerst naar iemand met dezelfde interesse
    nietOpnieuwMs: 10 * 60 * 1000,  // zo lang word je niet opnieuw aan dezelfde gekoppeld
    meldenNaAfloopMs: 3 * 60 * 1000, // zo lang kun je iemand nog melden nadat het gesprek stopte
    priveWachtMs: 10 * 60 * 1000,    // zo lang blijft een uitnodiging voor een privégesprek geldig terwijl je wacht
    stil: false,
    ...extra,
  };
}
