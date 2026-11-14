import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Versie van een gesprek voor de poll (14 nov 2026). De chat haalt elke 3 s GET /api/inbox/<id> op en kreeg altijd de hele
// lijst terug. Een "since" op alleen het laatste bericht-id is niet genoeg: bewerken, intrekken, reacties, gelezen-vinkjes
// en peilingen veranderen óók oude berichten. Daarom één versie over alles wat de client van de lijst toont; is die gelijk
// aan ?since=<versie>, dan antwoordt de route alleen met het kleine, veranderlijke deel (aanwezigheid) en hoeft de client
// niets te verwerken. Zonder since blijft het antwoord precies zoals het was, plus het veld `versie`. Serverkant (node:crypto);
// de clientlogica staat in lib/messaging/poll-since.ts (puur, zonder node).
// ---------------------------------------------------------------------------

/** 16 hex-tekens over de JSON van wat de lijst bepaalt; dezelfde invoer geeft dezelfde versie. */
export function lijstVersie(delen: unknown): string {
  return createHash("sha1").update(JSON.stringify(delen)).digest("hex").slice(0, 16);
}

const VERSIE = /^[0-9a-f]{16}$/;

/** De ?since= uit de URL, alleen als hij de vorm van een versie heeft; anders null (dan gewoon de hele lijst). */
export function sinceUitUrl(url: string): string | null {
  const v = new URL(url).searchParams.get("since");
  return v && VERSIE.test(v) ? v : null;
}
