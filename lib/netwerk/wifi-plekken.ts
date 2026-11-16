// ---------------------------------------------------------------------------
// De plekken onder "Wifi instellen" (Werkgever → Wifi en VPN). Elke klus op een los adres krijgt een
// eigen eenmalige vestiging (lib/shifts/create.ts, kind AD_HOC), dus hetzelfde adres stond er per klus
// opnieuw, elk met een eigen formulier (16 nov: Grote Houtstraat in Haarlem 4×, Hoge Rot in Hernen 3×).
// Puur: de pagina (server) geeft de vestigingen en weet welke al wifi hebben.
// ---------------------------------------------------------------------------

export interface WifiPlek {
  id: string;
  naam: string;
  plaats: string;
  /** de adresregel (bij een eenmalige locatie het hele adres) */
  adres: string;
  /** een eenmalige locatie van een klus, geen vaste vestiging */
  eenmalig: boolean;
}

/** Hetzelfde adres, ook als hoofdletters, spaties of komma's verschillen. */
function adresSleutel(p: WifiPlek): string {
  return `${p.adres || p.naam} ${p.plaats}`.toLowerCase().replace(/[\s,]+/g, " ").trim();
}

/**
 * Elke vaste vestiging, en elk eenmalig adres één keer, in dezelfde volgorde. Staat er bij een adres al wifi
 * op een of meer van die vestigingen, dan blijven precies die staan (zo verdwijnt er geen instelling); anders
 * de eerste.
 */
export function wifiPlekken<T extends WifiPlek>(rijen: readonly T[], heeftWifi: (id: string) => boolean): T[] {
  const metWifi = new Set(rijen.filter((r) => r.eenmalig && heeftWifi(r.id)).map(adresSleutel));
  const gezien = new Set<string>();
  return rijen.filter((r) => {
    if (!r.eenmalig) return true;
    const sleutel = adresSleutel(r);
    if (metWifi.has(sleutel)) return heeftWifi(r.id);
    if (gezien.has(sleutel)) return false;
    gezien.add(sleutel);
    return true;
  });
}
