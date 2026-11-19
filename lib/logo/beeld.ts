import { letterMeter, maakPng, watermerkLaag } from "@/lib/advertentie/beeld";
import { LOGO_VLAK, LOGO_WATERMERK_LETTER, logoBoom2, logoTinten, type Ondergrond } from "@/lib/logo/ontwerp2";
import type { LogoInvoer, LogoNr } from "@/lib/logo/regels";

// Een logo van versie 2 als PNG (alleen voor de server). Met watermerk komt de watermerklaag als kant-en-klaar plaatje
// uit het geheugen (lib/advertentie/beeld.ts watermerkLaag), zodat een voorbeeld bijna net zo snel is als een schoon beeld.

export async function maakLogoPng(nr: LogoNr, invoer: LogoInvoer, ondergrond: Ondergrond, breedte: number, metWatermerk: boolean, hoeklabel = false): Promise<ArrayBuffer> {
  const meet = await letterMeter();
  // een voorbeeld met watermerk is altijd op een thema (donker, licht, kleur); bij een variant is er geen watermerk
  const laag = metWatermerk && ondergrond.soort === "thema" ? await watermerkLaag(LOGO_VLAK.breedte, LOGO_VLAK.hoogte, breedte, LOGO_WATERMERK_LETTER, logoTinten(invoer, ondergrond.thema)) : undefined;
  const { boom, hoogte } = logoBoom2(nr, invoer, ondergrond, breedte, metWatermerk, meet, hoeklabel, laag);
  return maakPng(boom, breedte, hoogte);
}
