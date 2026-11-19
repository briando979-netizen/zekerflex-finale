// De server zelf: koppelen, chat, WebRTC-signalen, melden en spelletjes over één WebSocket (/ws).
// maakApp(cfg) geeft { start, stop, ... } terug, zodat de tests een echte server op een vrije poort kunnen starten.
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';
import { GAMES } from '../games.js';
import { clientIp, ipSleutel, kort, herkomstKlopt, Tempo } from './net.js';
import { Opslag } from './opslag.js';
import { Moderatie, REGELS } from './moderatie.js';
import { kiesPartner } from './koppelen.js';
import { leesBoodschap } from './berichten.js';
import { maakHttp } from './http.js';

export function maakApp(cfg) {
  const nu = cfg.nu || Date.now;
  const opslag = new Opslag(cfg.dataMap);
  const moderatie = new Moderatie({ opslag, nu });
  // Het zout voor de adressleutels: uit de omgeving, anders één keer gemaakt en bewaard (zo overleven blokkades een herstart).
  let zout = cfg.ipZout || opslag.leesTekst('zout.txt');
  if (!zout) { zout = crypto.randomBytes(32).toString('hex'); opslag.schrijfTekst('zout.txt', zout); }

  // Logregels: wat er gebeurde en een korte sleutel. Nooit een adres voluit, nooit de inhoud van een bericht.
  const log = (wat, velden = {}) => {
    if (cfg.stil) return;
    const rest = Object.entries(velden).map(([k, v]) => `${k}=${k === 'adres' ? kort(v) : v}`).join(' ');
    console.log(`${new Date(nu()).toISOString()} ${wat}${rest ? ' ' + rest : ''}`);
  };

  const users = new Map();              // ws -> gebruiker
  const perAdres = new Map();           // sleutel -> aantal open verbindingen
  const rijen = { text: [], video: [] };
  const priveKamers = new Map();        // code -> de gebruiker die op zijn vriend wacht (alleen in het geheugen)
  const tempo = new Tempo(nu), tempoIp = new Tempo(nu);
  const staat = { zout, moderatie, tempoIp, beheerSlot: new Map(), nu, log, stopt: false, cijfers, schop };
  let volgendId = 1, gesprekkenNu = 0, laatsteTelling = -1;

  const stuur = (ws, obj) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); };
  function cijfers() { return { online: users.size, zoekend: rijen.text.length + rijen.video.length + priveKamers.size, gesprekkenNu }; }
  function uitRij(u) { for (const rij of Object.values(rijen)) { const i = rij.indexOf(u); if (i >= 0) rij.splice(i, 1); } }

  function verbreekPaar(u, reden = 'left') {
    const p = u.partner, paar = u.pair;
    if (!p || !paar) return;
    gesprekkenNu = Math.max(0, gesprekkenNu - 1);
    // Nog een paar minuten kunnen ze elkaar melden (wie iets ergs doet, klikt daarna vaak meteen weg). Daarna is alles weg.
    const tot = nu() + cfg.meldenNaAfloopMs;
    for (const x of paar.users) { const y = paar.users[1 - paar.users.indexOf(x)]; x.vorige = { sleutel: y.sleutel, log: paar.log, stoel: paar.users.indexOf(x), modus: paar.modus, tot }; }
    u.partner = null; p.partner = null; u.pair = null; p.pair = null;
    stuur(p.ws, { t: 'end', reason: reden });
  }

  function probeerKoppelen(u) {
    if (u.partner || !rijen[u.mode]?.includes(u)) return false;
    const t = nu();
    const gevonden = kiesPartner(u, rijen[u.mode], t, { wachtZonderInteresseMs: cfg.wachtZonderInteresseMs, nietOpnieuwMs: cfg.nietOpnieuwMs, magNietSamen: (a, b) => moderatie.magNietSamen(a, b) });
    if (!gevonden) return false;
    const o = gevonden.partner;
    uitRij(u); uitRij(o);
    u.partner = o; o.partner = u; u.vorige = null; o.vorige = null;
    u.pair = o.pair = { users: [u, o], game: null, gameId: null, invite: null, log: [], modus: u.mode };
    u.recent.set(o.id, t); o.recent.set(u.id, t);
    gesprekkenNu++; moderatie.tel('gesprekken');
    // de eerste van de twee doet het WebRTC-aanbod
    stuur(u.ws, { t: 'matched', common: gevonden.common, initiator: true, mode: u.mode });
    stuur(o.ws, { t: 'matched', common: gevonden.common, initiator: false, mode: u.mode });
    return true;
  }

  // Iedereen van dit adres eruit: gesprek stoppen, uit de rij, en vertellen hoe lang het duurt.
  function schop(sleutel) {
    const b = moderatie.blokkade(sleutel); if (!b) return;
    for (const u of users.values()) if (u.sleutel === sleutel) { verbreekPaar(u, 'left'); uitRij(u); verwijderUitPrive(u); stuur(u.ws, { t: 'banned', minutes: Math.ceil((b.tot - nu()) / 60000) }); }
  }

  // ---------------------------------------------------------------- privégesprek (Nodig een vriend uit)
  // Twee mensen met dezelfde code worden rechtstreeks aan elkaar gekoppeld, buiten de willekeurige wachtrij om.
  function verwijderUitPrive(u) { if (u.code && priveKamers.get(u.code) === u) priveKamers.delete(u.code); }
  function koppelPrive(u, o) {
    uitRij(u); uitRij(o);
    const modus = u.mode === 'video' && o.mode === 'video' ? 'video' : 'text'; // video alleen als allebei video koos
    u.partner = o; o.partner = u; u.vorige = null; o.vorige = null;
    u.pair = o.pair = { users: [u, o], game: null, gameId: null, invite: null, log: [], modus };
    const t = nu(); u.recent.set(o.id, t); o.recent.set(u.id, t);
    gesprekkenNu++; moderatie.tel('gesprekken');
    stuur(u.ws, { t: 'matched', common: [], initiator: true, mode: modus, prive: true });
    stuur(o.ws, { t: 'matched', common: [], initiator: false, mode: modus, prive: true });
  }
  function zoekPrive(u) {
    const w = priveKamers.get(u.code);
    const kan = w && w !== u && w.id !== u.id && users.has(w.ws) && !w.partner
      && !moderatie.magNietSamen(u.sleutel, w.sleutel) && !moderatie.blokkade(w.sleutel);
    if (kan) { priveKamers.delete(u.code); koppelPrive(u, w); return; }
    // Wacht op de vriend. Een eventuele oude wachtende met dezelfde code wordt afgelost (en krijgt een nette melding).
    if (w && w !== u && users.has(w.ws)) { w.code = null; stuur(w.ws, { t: 'prive-verlopen' }); }
    priveKamers.set(u.code, u); u.priveSinds = nu();
    stuur(u.ws, { t: 'searching', prive: true });
  }

  // ---------------------------------------------------------------- pauze (noodknop vanuit beheer)
  let pauze = !!(opslag.lees('pauze', { aan: false }) || {}).aan; // overleeft een herstart
  function pauzeAan() { return pauze; }
  function zetPauze(aan) {
    pauze = !!aan;
    opslag.schrijf('pauze', () => ({ aan: pauze, sinds: nu() }));
    if (pauze) {
      // Alles stilleggen: lopende gesprekken netjes afsluiten, iedereen uit de rij en uit de privékamers.
      for (const u of users.values()) { verbreekPaar(u, 'left'); uitRij(u); verwijderUitPrive(u); stuur(u.ws, { t: 'pauze', aan: true }); }
      priveKamers.clear();
    } else {
      for (const ws of users.keys()) stuur(ws, { t: 'pauze', aan: false });
    }
  }
  staat.pauzeAan = pauzeAan; staat.zetPauze = zetPauze;

  // ---------------------------------------------------------------- spelletjes
  function stuurSpel(paar) {
    paar.users.forEach((x, i) => stuur(x.ws, { t: 'g', a: 'state', game: paar.gameId, name: GAMES[paar.gameId].name, seat: i, v: paar.game.view(i) }));
  }
  function spel(u, m) {
    const paar = u.pair; if (!paar || !u.partner) return;
    const stoel = paar.users.indexOf(u), ander = paar.users[1 - stoel];
    switch (m.a) {
      case 'invite':
        if (paar.game) return stuur(u.ws, { t: 'g', a: 'bezig' }); // eerst het lopende spel stoppen
        paar.invite = { from: stoel, game: m.game };
        stuur(ander.ws, { t: 'g', a: 'invite', game: m.game, name: GAMES[m.game].name });
        stuur(u.ws, { t: 'g', a: 'invited', game: m.game, name: GAMES[m.game].name });
        return;
      case 'accept':
        if (!paar.invite || paar.invite.from === stoel || paar.game) return;
        paar.gameId = paar.invite.game; paar.game = GAMES[paar.gameId].make(); paar.invite = null;
        return stuurSpel(paar);
      case 'decline':
        if (!paar.invite || paar.invite.from === stoel) return;
        stuur(paar.users[paar.invite.from].ws, { t: 'g', a: 'declined', name: GAMES[paar.invite.game].name }); paar.invite = null;
        return;
      case 'move':
        if (!paar.game) return;
        try { paar.game.move(stoel, m.d); } catch (e) { log('spelfout', { spel: paar.gameId, fout: e.message }); }
        return stuurSpel(paar);
      case 'quit':
        if (!paar.game) return;
        paar.game = null; paar.gameId = null;
        paar.users.forEach((x) => stuur(x.ws, { t: 'g', a: 'quit', by: x === u ? 'jij' : 'vreemde' }));
        return;
    }
  }

  // ---------------------------------------------------------------- boodschappen
  function boodschap(u, ruw) {
    const m = leesBoodschap(ruw);
    const soort = m ? m.t : 'onzin';
    if (!m || !tempo.neem(`${u.id}:${soort}`, cfg.tempo[soort] || [10, 2])) {
      // Te snel of onleesbaar: negeren. Wie ermee doorgaat, wordt verbroken.
      if (nu() - u.laatsteFout > 60000) u.fouten = 0;
      u.laatsteFout = nu();
      if (++u.fouten > 150) { log('verbroken-tempo', { adres: u.sleutel }); u.ws.close(1008, 'te veel'); }
      else if (m && (soort === 'msg' || soort === 'find') && u.fouten % 5 === 1) stuur(u.ws, { t: 'fout', code: 'tempo' });
      return;
    }
    switch (m.t) {
      case 'find': {
        const blok = moderatie.blokkade(u.sleutel);
        if (blok) return stuur(u.ws, { t: 'banned', minutes: Math.ceil((blok.tot - nu()) / 60000) });
        if (!m.akkoord) return stuur(u.ws, { t: 'fout', code: 'akkoord' });
        // Staat de site op pauze, dan koppelen we niemand meer; de bezoeker krijgt een nette melding.
        if (pauze) { verbreekPaar(u, 'left'); uitRij(u); verwijderUitPrive(u); return stuur(u.ws, { t: 'pauze', aan: true }); }
        if (!tempoIp.neem('find:' + u.sleutel, cfg.tempoIp.find)) return stuur(u.ws, { t: 'fout', code: 'tempo' });
        verbreekPaar(u, 'left'); uitRij(u); verwijderUitPrive(u);
        u.mode = m.mode; u.interests = m.interests; u.since = nu();
        // Met een code: een privégesprek met je vriend, buiten de willekeurige rij om.
        if (m.code) { u.code = m.code; return zoekPrive(u); }
        u.code = null;
        rijen[u.mode].push(u);
        stuur(u.ws, { t: 'searching' });
        probeerKoppelen(u);
        return;
      }
      case 'msg': {
        if (!u.partner) return;
        const paar = u.pair;
        // De laatste berichten staan alleen in het geheugen, voor het geval iemand een melding doet.
        paar.log.push({ van: paar.users.indexOf(u), tekst: m.text }); if (paar.log.length > REGELS.maxBerichten) paar.log.shift();
        return stuur(u.partner.ws, { t: 'msg', text: m.text });
      }
      case 'typing': if (u.partner) stuur(u.partner.ws, { t: 'typing', on: m.on }); return;
      case 'signal': if (u.partner && u.pair.modus === 'video') stuur(u.partner.ws, { t: 'signal', data: m.data }); return;
      case 'stop': verbreekPaar(u, 'left'); uitRij(u); verwijderUitPrive(u); return;
      case 'g': return spel(u, m);
      case 'report': {
        const doel = u.partner ? { sleutel: u.partner.sleutel, log: u.pair.log, stoel: u.pair.users.indexOf(u), modus: u.pair.modus } : u.vorige && u.vorige.tot > nu() ? u.vorige : null;
        if (!doel) return stuur(u.ws, { t: 'reported', ok: false, code: 'niemand' });
        if (!tempoIp.neem('report:' + u.sleutel, cfg.tempoIp.report)) return stuur(u.ws, { t: 'reported', ok: false, code: 'te-veel' });
        const berichten = m.metBerichten ? doel.log.map((b) => ({ wie: b.van === doel.stoel ? 'melder' : 'gemeld', tekst: b.tekst })) : null;
        const r = moderatie.meld({ melder: u.sleutel, gemeld: doel.sleutel, reden: m.reden, toelichting: m.toelichting, berichten, modus: doel.modus });
        log('melding', { reden: m.reden, uitkomst: r.code, melder: kort(u.sleutel), adres: doel.sleutel, blok: r.blok ? 'ja' : 'nee' });
        verbreekPaar(u, 'left'); u.vorige = null;
        if (r.blok) schop(doel.sleutel);
        return stuur(u.ws, { t: 'reported', ok: r.ok, code: r.code });
      }
    }
  }

  // ---------------------------------------------------------------- http + websocket
  const verzoek = maakHttp(cfg, staat);
  const cert = path.join(cfg.certMap, 'cert.pem'), sleutelBestand = path.join(cfg.certMap, 'key.pem');
  // Optioneel https voor thuis (camera op een ander apparaat in je netwerk): zet cert.pem en key.pem in de map certs/.
  const metHttps = !cfg.geenHttps && fs.existsSync(cert) && fs.existsSync(sleutelBestand);
  const server = metHttps ? https.createServer({ cert: fs.readFileSync(cert), key: fs.readFileSync(sleutelBestand) }, verzoek) : http.createServer(verzoek);
  server.requestTimeout = 15000; server.headersTimeout = 10000; server.keepAliveTimeout = 5000;
  const wss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024, perMessageDeflate: false });

  const weiger = (socket, status, tekst) => { socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(tekst)}\r\n\r\n${tekst}`); socket.destroy(); };
  server.on('upgrade', (req, socket, head) => {
    socket.on('error', () => {});
    if ((req.url || '').split('?')[0] !== '/ws') return weiger(socket, '404 Not Found', 'Niet gevonden');
    // 400 en geen 403: een reeks 403's telt bij een inbraakfilter als aanval, en dan gaat het hele adres dicht.
    if (!herkomstKlopt(req, cfg)) { log('ws-herkomst-geweigerd'); return weiger(socket, '400 Bad Request', 'Verkeerde herkomst'); }
    if (staat.stopt) return weiger(socket, '503 Service Unavailable', 'Server stopt');
    const sleutel = ipSleutel(clientIp(req, cfg.vertrouwProxy), zout);
    if (users.size >= cfg.maxVerbindingen || (perAdres.get(sleutel) || 0) >= cfg.maxPerIp) { log('ws-vol', { adres: sleutel }); return weiger(socket, '429 Too Many Requests', 'Te veel verbindingen'); }
    wss.handleUpgrade(req, socket, head, (ws) => verbonden(ws, sleutel));
  });

  function verbonden(ws, sleutel) {
    const u = { id: volgendId++, ws, sleutel, mode: null, interests: [], partner: null, pair: null, since: 0, recent: new Map(), vorige: null, fouten: 0, laatsteFout: 0, leeft: true, code: null, priveSinds: 0 };
    users.set(ws, u); perAdres.set(sleutel, (perAdres.get(sleutel) || 0) + 1);
    stuur(ws, { t: 'count', n: users.size });
    const blok = moderatie.blokkade(sleutel);
    if (blok) stuur(ws, { t: 'banned', minutes: Math.ceil((blok.tot - nu()) / 60000) });
    ws.on('pong', () => { u.leeft = true; });
    ws.on('message', (ruw, binair) => { if (binair) return; try { boodschap(u, ruw.toString('utf8')); } catch (e) { log('fout-boodschap', { fout: e.message }); } });
    ws.on('close', () => {
      verbreekPaar(u, 'left'); uitRij(u); verwijderUitPrive(u); users.delete(ws);
      const n = (perAdres.get(sleutel) || 1) - 1; if (n > 0) perAdres.set(sleutel, n); else perAdres.delete(sleutel);
    });
    ws.on('error', () => {});
  }

  const timers = [
    setInterval(() => { for (const rij of Object.values(rijen)) for (const u of [...rij]) probeerKoppelen(u); }, 1000),
    // De teller gaat alleen rond als hij veranderd is.
    setInterval(() => { if (users.size !== laatsteTelling) { laatsteTelling = users.size; for (const ws of users.keys()) stuur(ws, { t: 'count', n: users.size }); } }, cfg.tellerMs || 3000),
    // Verbindingen die niet meer antwoorden opruimen.
    setInterval(() => { for (const [ws, u] of users) { if (!u.leeft) { ws.terminate(); continue; } u.leeft = false; try { ws.ping(); } catch (e) { /* al dicht */ } } }, 30000),
    setInterval(() => { tempo.ruimOp(10 * 60 * 1000); tempoIp.ruimOp(); moderatie.ruimOp(); for (const [k, t] of staat.beheerSlot) if (t < nu()) staat.beheerSlot.delete(k); }, 10 * 60 * 1000),
    // Wie te lang op zijn vriend wacht, lossen we op: de uitnodiging is verlopen.
    setInterval(() => { const t = nu(); for (const [code, u] of priveKamers) if (t - (u.priveSinds || 0) > cfg.priveWachtMs) { priveKamers.delete(code); u.code = null; stuur(u.ws, { t: 'prive-verlopen' }); } }, 30 * 1000),
  ];
  timers.forEach((t) => t.unref());

  return {
    server, moderatie, staat, cijfers, metHttps,
    start: () => new Promise((ok, fout) => { server.once('error', fout); server.listen(cfg.poort, cfg.luisterOp, () => ok(server.address().port)); }),
    // Netjes stoppen: geen nieuwe bezoekers, iedereen een bericht, alles wegschrijven.
    stop: () => new Promise((ok) => {
      staat.stopt = true; timers.forEach(clearInterval);
      for (const ws of users.keys()) { stuur(ws, { t: 'server', a: 'stopt' }); ws.close(1001, 'server stopt'); }
      opslag.nu();
      const klaar = setTimeout(() => { for (const ws of users.keys()) ws.terminate(); server.closeAllConnections?.(); }, 2000);
      server.close(() => { clearTimeout(klaar); opslag.nu(); ok(); });
      server.closeIdleConnections?.();
    }),
  };
}
