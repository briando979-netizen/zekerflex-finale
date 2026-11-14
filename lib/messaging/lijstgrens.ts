// ---------------------------------------------------------------------------
// De grens van één gesprekslijst in KV (14 nov 2026). Een gesprek staat als één JSON-lijst in KeyValueStore
// (chat-messages:<id>) en elk bericht leest en herschrijft die hele rij; de poll leest hem elke 3 s. Sinds de berichtgrens
// 10.000 tekens is, kan de oude grens van 5.000 berichten op ±51 MB uitkomen (gemeten 14 nov: grootste lijst 12,7 kB,
// 258 bytes per bericht). Daarom twee grenzen: hooguit MAX_BERICHTEN én hooguit MAX_BYTES JSON; de oudste berichten
// vallen weg (dat deden ze bij 5.000 al). Het nieuwste bericht blijft altijd staan, ook als dat alleen al te groot is.
// Puur: geen kv, geen logger; de aanroeper logt alleen aantallen (lib/messaging/store.ts, bewaarLijst).
// ---------------------------------------------------------------------------

export const MAX_BERICHTEN = 5000;
export const MAX_BYTES = 4 * 1024 * 1024;

export interface Snede<T> {
  lijst: T[];
  /** hoeveel berichten er aan de oude kant afvielen */
  verwijderd: number;
  /** true als de bytegrens (en niet alleen het aantal) de reden was */
  opBytes: boolean;
  /** de JSON-grootte van de bewaarde lijst in bytes (UTF-8) */
  bytes: number;
}

const bytesVan = (v: unknown): number => Buffer.byteLength(JSON.stringify(v), "utf8");

/**
 * De lijst die bewaard mag worden: de nieuwste berichten, binnen beide grenzen. Eerst het aantal (goedkoop), dan de bytes:
 * pas als de hele lijst te groot is, meten we per bericht van achteren naar voren hoeveel er nog passen (de komma's en de
 * haken tellen mee). Minstens één bericht blijft staan.
 */
export function begrensLijst<T>(lijst: T[], max: { berichten?: number; bytes?: number } = {}): Snede<T> {
  const maxBerichten = max.berichten ?? MAX_BERICHTEN;
  const maxBytes = max.bytes ?? MAX_BYTES;
  const opAantal = lijst.length > maxBerichten ? lijst.slice(lijst.length - maxBerichten) : lijst;
  const totaal = bytesVan(opAantal);
  if (totaal <= maxBytes) return { lijst: opAantal, verwijderd: lijst.length - opAantal.length, opBytes: false, bytes: totaal };

  // van achteren naar voren bijtellen: 2 voor de haken, per bericht zijn eigen JSON plus 1 voor de komma
  let som = 2;
  let houd = 0;
  for (let i = opAantal.length - 1; i >= 0; i--) {
    const b = bytesVan(opAantal[i]) + (houd > 0 ? 1 : 0);
    if (houd > 0 && som + b > maxBytes) break;
    som += b;
    houd += 1;
  }
  const bewaard = opAantal.slice(opAantal.length - houd);
  return { lijst: bewaard, verwijderd: lijst.length - bewaard.length, opBytes: true, bytes: som };
}
