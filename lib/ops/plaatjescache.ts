// De plaatjescache van Next (28 nov 2026). Next optimaliseert elke afbeelding één keer en bewaart het resultaat in
// .next/cache/images, maar ruimt daar zelf nooit iets op: op 28 november stonden er 83.213 bestanden en 4,2 GB in, gegroeid
// sinds 2 november (±160 MB per dag). Op een schijf van 96 GB is dat de grootste stille groeier, en bij 85 procent begint
// lib/ops/schijfreeks.ts te waarschuwen. Daarom ruimt de cron hem elke week op: eerst alles ouder dan MAX_DAGEN, en als het
// daarna nog te groot is de oudste bestanden tot het onder MAX_BYTES zit.
//
// Weggooien is veilig: een plaatje dat weg is wordt bij het volgende verzoek opnieuw gemaakt. Next schrijft via een tijdelijk
// bestand en hernoemt, dus een compleet bestand weghalen onderbreekt nooit een halve schrijfactie.
//
// Dit bestand is puur (geen fs, geen kv, geen tijd van buiten): de schijf komt uit
// app/api/internal/onderhoud/plaatjescache/route.ts.

/** Eén bestand in de cache, zoals de schijf het geeft. */
export interface CacheBestand {
  pad: string;
  bytes: number;
  /** laatst gewijzigd, in ms sinds 1970 */
  gewijzigd: number;
}

export interface OpruimKeuze {
  /** de paden die weg mogen, oudste eerst */
  weg: string[];
  bytesWeg: number;
  /** wat er daarna nog staat */
  bytesOver: number;
  /** hoeveel ervan wegging omdat ze te oud waren */
  teOud: number;
  /** hoeveel ervan wegging omdat de cache daarna nog te groot was */
  teGroot: number;
}

/** Zoveel dagen mag een geoptimaliseerd plaatje blijven staan zonder dat iemand het opvroeg. */
export const MAX_DAGEN = 30;
/** En hoe groot de hele cache daarna nog mag zijn. */
export const MAX_BYTES = 2 * 1024 ** 3;
const DAG_MS = 86_400_000;

/**
 * Welke bestanden mogen weg. Twee regels na elkaar: te oud, en daarna te groot (oudste eerst). `maxDagen` of `maxBytes`
 * op 0 of lager zet die regel uit, zodat een meting zonder opruimen ook kan.
 */
export function kiesOpruiming(
  bestanden: readonly CacheBestand[],
  nu: number,
  maxDagen: number = MAX_DAGEN,
  maxBytes: number = MAX_BYTES,
): OpruimKeuze {
  // oudste eerst: zo gaat bij "te groot" altijd het langst ongebruikte plaatje als eerste
  const oplopend = [...bestanden].sort((a, b) => a.gewijzigd - b.gewijzigd);
  const grens = maxDagen > 0 ? nu - maxDagen * DAG_MS : null;

  const weg: string[] = [];
  let bytesWeg = 0;
  let teOud = 0;
  const blijft: CacheBestand[] = [];

  for (const b of oplopend) {
    if (grens !== null && b.gewijzigd < grens) {
      weg.push(b.pad);
      bytesWeg += b.bytes;
      teOud += 1;
    } else {
      blijft.push(b);
    }
  }

  let bytesOver = blijft.reduce((som, b) => som + b.bytes, 0);
  let teGroot = 0;
  if (maxBytes > 0) {
    let i = 0;
    while (bytesOver > maxBytes && i < blijft.length) {
      const b = blijft[i] ?? null;
      i += 1;
      if (b === null) break;
      weg.push(b.pad);
      bytesWeg += b.bytes;
      bytesOver -= b.bytes;
      teGroot += 1;
    }
  }

  return { weg, bytesWeg, bytesOver, teOud, teGroot };
}

/** Een getal uit de omgeving, met een standaard als hij ontbreekt of onzin is. Negatief wordt 0 (regel uit). */
export function uitOmgeving(waarde: string | undefined, standaard: number): number {
  if (waarde === undefined || waarde.trim() === "") return standaard;
  const n = Number(waarde);
  if (!Number.isFinite(n)) return standaard;
  return n < 0 ? 0 : n;
}
