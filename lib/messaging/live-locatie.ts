// ---------------------------------------------------------------------------
// Live locatie in de chat (15 nov 2026), zoals in WhatsApp: je deelt je plek 15 minuten, een uur of acht uur, en de
// ander ziet hem meeschuiven. Het bericht is een gewoon locatiebericht met `live` erbij; alleen de afzender werkt het bij,
// hooguit eens per MIN_TUSSEN_SEC, en alleen zolang het niet verlopen of gestopt is. Bijwerken gebeurt vanuit de browser
// zolang ZekerFlex open is (een webapp kan niet op de achtergrond blijven meten); dat staat er ook eerlijk bij.
// Puur: geen opslag, geen node; de server (lib/messaging/store.ts) en de chat gebruiken dezelfde regels.
// ---------------------------------------------------------------------------

/** Hoe lang je kunt delen, in minuten: 15 min, 1 uur, 8 uur (zoals WhatsApp). */
export const LIVE_DUREN = [15, 60, 480] as const;
export type LiveDuur = (typeof LIVE_DUREN)[number];

/** Vaker bijwerken dan dit heeft geen zin (en kost de server schrijfwerk voor niets). */
export const MIN_TUSSEN_SEC = 10;

export interface LiveLocatie {
  /** tot wanneer (ISO, UTC) */
  tot: string;
  /** laatste plek ontvangen (ISO, UTC) */
  bijgewerkt: string;
  /** vroeg gestopt door de afzender (ISO, UTC) */
  gestopt?: string;
}

export interface Plek {
  lat: number;
  lng: number;
  label?: string;
  live?: LiveLocatie;
}

export function isLiveDuur(n: number): n is LiveDuur {
  return (LIVE_DUREN as readonly number[]).includes(n);
}

/** Een nieuwe live-deling vanaf nu; null bij een duur die we niet aanbieden. */
export function startLive(minuten: number, nu = new Date()): LiveLocatie | null {
  if (!isLiveDuur(minuten)) return null;
  return { tot: new Date(nu.getTime() + minuten * 60_000).toISOString(), bijgewerkt: nu.toISOString() };
}

/** Loopt deze deling nog? */
export function isLiveActief(live: LiveLocatie | undefined, nu = new Date()): boolean {
  return Boolean(live && !live.gestopt && nu.getTime() < new Date(live.tot).getTime());
}

export type BijwerkUitkomst = { plek: Plek; opgeslagen: boolean } | { fout: "geen-live" | "voorbij" };

/**
 * Een nieuwe plek voor een lopende deling. Te snel na de vorige: de plek blijft zoals hij was (opgeslagen: false), zonder
 * fout, zodat een browser die vaak meet niet telkens een melding krijgt. Voorbij (verlopen of gestopt): een fout, dan
 * stopt de browser met sturen.
 */
export function werkLiveBij(plek: Plek, lat: number, lng: number, nu = new Date()): BijwerkUitkomst {
  const live = plek.live;
  if (!live) return { fout: "geen-live" };
  if (!isLiveActief(live, nu)) return { fout: "voorbij" };
  if (nu.getTime() - new Date(live.bijgewerkt).getTime() < MIN_TUSSEN_SEC * 1000) return { plek, opgeslagen: false };
  return { plek: { ...plek, lat, lng, live: { ...live, bijgewerkt: nu.toISOString() } }, opgeslagen: true };
}

/** Vroeg stoppen; een deling die al voorbij is, blijft zoals hij was. */
export function stopLive(plek: Plek, nu = new Date()): Plek {
  if (!plek.live || !isLiveActief(plek.live, nu)) return plek;
  return { ...plek, live: { ...plek.live, gestopt: nu.toISOString() } };
}

/** Doorsturen: alleen de plek van dat moment, nooit de live-deling (die werkt alleen de afzender bij, in het eigen gesprek). */
export function vastePlek(plek: Plek): Plek {
  return { lat: plek.lat, lng: plek.lng, ...(plek.label ? { label: plek.label } : {}) };
}
