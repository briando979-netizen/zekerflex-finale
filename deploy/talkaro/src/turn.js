// ICE-servers voor video. Met TURN_HOST en TURN_SECRET maken we tijdelijke inloggegevens voor de eigen coturn,
// volgens de gebruikelijke afspraak van coturn (--use-auth-secret, "REST API for TURN"):
//   gebruikersnaam = "<verloopt-op-unixtijd>:<id>", wachtwoord = base64(HMAC-SHA1(geheim, gebruikersnaam)).
// Dat is hetzelfde schema als de bestaande coturn op de server gebruikt. Zonder die instellingen geven we een lege
// lijst terug: video werkt dan op dezelfde computer en binnen één netwerk, zonder een dienst van buiten.
import crypto from 'node:crypto';

export function turnGegevens({ host, geheim, poort = 3478, geldigSec = 3600 }, id, nu = Date.now()) {
  if (!host || !geheim) return null;
  const username = `${Math.floor(nu / 1000) + geldigSec}:${id}`;
  const credential = crypto.createHmac('sha1', geheim).update(username).digest('base64');
  return { urls: [`turn:${host}:${poort}?transport=udp`, `turn:${host}:${poort}?transport=tcp`], username, credential };
}

export function iceServers(cfg, id = crypto.randomBytes(6).toString('hex'), nu = Date.now()) {
  const turn = turnGegevens({ host: cfg.turnHost, geheim: cfg.turnGeheim, poort: cfg.turnPoort, geldigSec: cfg.turnGeldigSec }, id, nu);
  if (!turn) return { iceServers: [], geldigSec: 0 };
  // coturn beantwoordt op dezelfde poort ook STUN: daarmee vinden twee browsers elkaar meestal rechtstreeks.
  return { iceServers: [{ urls: [`stun:${cfg.turnHost}:${cfg.turnPoort}`] }, turn], geldigSec: cfg.turnGeldigSec };
}
