// Elke boodschap van een browser wordt hier nagekeken op vorm en grootte en opnieuw opgebouwd.
// Wat niet klopt geeft null; de server stuurt nooit iets door wat hij niet zelf zo heeft samengesteld.
import { schoonInteresses, geldigeCode } from './koppelen.js';
import { REDENEN } from './moderatie.js';
import { filterTekst } from './scheldwoorden.js';

const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const tekst = (x, max) => (typeof x === 'string' && x.length <= max ? x : null);
// Stuurtekens eruit (behalve regeleinde en tab), zodat niemand het scherm van de ander kan ontregelen.
const schoon = (s) => s.replace(/[\u0000-\u0008\u000b-\u001f\u007f‪-‮⁦-⁩]/g, '');

const SPELLEN = ['tod', 'drink', 'poker', 'ttt', 'c4', 'rps'];
const ZET_VELDEN = { i: 'getal', col: 'getal', to: 'getal', again: 'waar', next: 'waar', roll: 'waar', lose: 'waar', skipSelf: 'waar',
  c: ['steen', 'papier', 'schaar'], kind: ['doen', 'durven', 'waarheid'], judge: ['done', 'skip'], a: ['wel', 'nooit', 'fold', 'check', 'call', 'raise', 'allin'], g: ['hoger', 'lager'] };

function zet(d) {
  if (!isObject(d)) return null;
  const uit = {};
  for (const [k, v] of Object.entries(d)) {
    if (!Object.hasOwn(ZET_VELDEN, k)) return null;
    const soort = ZET_VELDEN[k];
    if (soort === 'getal') { if (!Number.isSafeInteger(v) || v < 0 || v > 1e9) return null; }
    else if (soort === 'waar') { if (v !== true) return null; }
    else if (!soort.includes(v)) return null;
    uit[k] = v;
  }
  return uit;
}

// WebRTC-signalen: een aanbod/antwoord (SDP), een ICE-kandidaat, of de vraag om opnieuw te verbinden.
function signaal(d) {
  if (!isObject(d)) return null;
  if (d.herstart === true) return { herstart: true };
  if (isObject(d.sdp)) {
    const type = ['offer', 'answer'].includes(d.sdp.type) ? d.sdp.type : null, sdp = tekst(d.sdp.sdp, 20000);
    return type && sdp && sdp.startsWith('v=0') ? { sdp: { type, sdp } } : null;
  }
  if (isObject(d.ice)) {
    const candidate = tekst(d.ice.candidate, 1000);
    if (candidate === null || (candidate !== '' && !/^(a=)?candidate:/.test(candidate))) return null;
    const uit = { candidate };
    if (d.ice.sdpMid !== undefined && d.ice.sdpMid !== null) { const mid = tekst(d.ice.sdpMid, 32); if (mid === null) return null; uit.sdpMid = mid; }
    if (d.ice.sdpMLineIndex !== undefined && d.ice.sdpMLineIndex !== null) { if (!Number.isInteger(d.ice.sdpMLineIndex) || d.ice.sdpMLineIndex < 0 || d.ice.sdpMLineIndex > 16) return null; uit.sdpMLineIndex = d.ice.sdpMLineIndex; }
    if (d.ice.usernameFragment !== undefined && d.ice.usernameFragment !== null) { const uf = tekst(d.ice.usernameFragment, 256); if (uf === null) return null; uit.usernameFragment = uf; }
    return { ice: uit };
  }
  return null;
}

export function leesBoodschap(ruw) {
  let m; try { m = JSON.parse(ruw); } catch (e) { return null; }
  if (!isObject(m) || typeof m.t !== 'string') return null;
  switch (m.t) {
    case 'find': {
      // Een privégesprek via een deelbare code loopt buiten de willekeurige wachtrij om. Zonder (geldige) code is het een gewoon gesprek.
      const code = geldigeCode(m.code) ? m.code : null;
      return { t: 'find', mode: m.mode === 'video' ? 'video' : 'text', interests: code ? [] : schoonInteresses(m.interests), akkoord: m.akkoord === true, code };
    }
    // De ergste scheldwoorden worden hier, aan de serverkant, uit het bericht gehaald voordat het naar de ander gaat.
    case 'msg': { const s = tekst(m.text, 1000); if (s === null) return null; const t = filterTekst(schoon(s).trim()); return t ? { t: 'msg', text: t } : null; }
    case 'typing': return { t: 'typing', on: m.on === true };
    case 'signal': { const data = signaal(m.data); return data ? { t: 'signal', data } : null; }
    case 'stop': return { t: 'stop' };
    case 'report': {
      if (typeof m.reden !== 'string' || !Object.hasOwn(REDENEN, m.reden)) return null;
      const toelichting = m.toelichting === undefined ? '' : tekst(m.toelichting, 300);
      if (toelichting === null) return null;
      return { t: 'report', reden: m.reden, toelichting: schoon(toelichting).trim(), metBerichten: m.metBerichten === true };
    }
    case 'g': {
      if (m.a === 'invite') return SPELLEN.includes(m.game) ? { t: 'g', a: 'invite', game: m.game } : null;
      if (m.a === 'accept' || m.a === 'decline' || m.a === 'quit') return { t: 'g', a: m.a };
      if (m.a === 'move') { const d = zet(m.d); return d ? { t: 'g', a: 'move', d } : null; }
      return null;
    }
    default: return null;
  }
}
