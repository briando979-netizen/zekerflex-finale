import { amsterdamClock, amsterdamDayKey } from "@/lib/time/amsterdam";

// Lange tekst in de chat (14 nov 2026, eigenaar: "zorg dat de chat meer tekstregels kan accepteren, en anders als het te veel
// tekst is maak er automatisch een tekstbestand van, zodat er lappen tekst kunnen worden gestuurd"). Tot BERICHT_MAX tekens
// is het een gewoon bericht; langer gaat het als .txt-bijlage (opslag in Postgres via /api/inbox/:id/media, niet in de KV-lijst
// van het gesprek, die bij elk bericht helemaal wordt herschreven). Vroeger kapte het veld een geplakte tekst stil af op 4000
// tekens (maxLength). Puur: geen server-imports, ook bruikbaar in de Composer.

/** Het maximum aantal tekens van één chatbericht (veld, route en opslag gebruiken dezelfde grens). */
export const BERICHT_MAX = 10_000;

/** Hoeveel tekens van een lang bericht als onderschrift bij het tekstbestand komen (de push toont er 140). */
export const VOORPROEF_MAX = 160;

/** Vanaf hoeveel tekens een bericht in de bubbel ingekort wordt, en hoeveel je dan eerst ziet ("Lees meer", zoals WhatsApp). */
export const INKORT_VANAF = 1500;
export const INKORT_TOON = 1000;

export function isTeLang(tekst: string): boolean {
  return tekst.trim().length > BERICHT_MAX;
}

/** Nooit een halve emoji aan het eind (een losse surrogaathelft geeft een vraagteken-blokje, foutenlogboek 12 nov). */
function heel(s: string): string {
  const c = s.charCodeAt(s.length - 1);
  return c >= 0xd800 && c <= 0xdbff ? s.slice(0, -1) : s;
}

/** Afkappen op een spatie of regeleinde als die niet te ver terug ligt, anders hard (maar heel). */
function knip(s: string, max: number): string {
  const stuk = s.slice(0, max);
  const grens = Math.max(stuk.lastIndexOf(" "), stuk.lastIndexOf("\n"));
  return heel(grens > max * 0.6 ? stuk.slice(0, grens) : stuk).trimEnd();
}

/** De eerste woorden van de tekst, op één regel: het onderschrift bij het bestand, zodat je ziet waar het over gaat. */
export function voorproef(tekst: string, max = VOORPROEF_MAX): string {
  const plat = tekst.replace(/\s+/g, " ").trim();
  if (plat.length <= max) return plat;
  return `${knip(plat, max)}…`;
}

/** Een lang bericht in de bubbel: het begin, en of er meer is. */
export function inkorten(tekst: string, vanaf = INKORT_VANAF, toon = INKORT_TOON): { kort: string; ingekort: boolean } {
  if (tekst.length <= vanaf) return { kort: tekst, ingekort: false };
  return { kort: knip(tekst, toon), ingekort: true };
}

/** "bericht-2026-11-14-0157.txt": Nederlandse tijd, zonder tekens die een besturingssysteem weigert. */
export function tekstBestandNaam(basis: string, nu: Date): string {
  const schoon = basis.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "bericht";
  return `${schoon}-${amsterdamDayKey(nu)}-${amsterdamClock(nu).replace(":", "")}.txt`;
}

/**
 * De tekst als .txt-bestand. Met een BOM vooraan: de chat serveert "text/plain" zonder charset, en zonder BOM toont een
 * browser letters als é en ë dan verkeerd. Regeleinden blijven zoals ze zijn.
 */
export function tekstAlsBestand(tekst: string, naam: string): File {
  return new File(["﻿", tekst], naam, { type: "text/plain" });
}
