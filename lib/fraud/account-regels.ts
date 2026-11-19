// Pure regels voor ZekerFlex FraudShield (lib/fraud/account.ts): losse signalen
// per account optellen tot één risicoscore (0-100). Geen prisma of netwerk.
// Het is een signaal voor een mens, geen automatisch oordeel: er wordt niemand
// vanzelf geblokkeerd.

export interface AccountSignalen {
  /** aantal andere accounts dat vanaf hetzelfde toestel incheckte */
  gedeeldApparaat: number;
  /** aantal andere accounts met hetzelfde identiteitsdocument */
  dubbelDocument: number;
  /** aantal andere accounts met hetzelfde rekeningnummer voor uitbetaling */
  gedeeldIban: number;
  /** het rekeningnummer is gewijzigd en nog niet opnieuw bevestigd */
  ibanWachtOpControle: boolean;
  /** staat op de zwarte lijst */
  geblokkeerd: boolean;
  /** hoogste collusiescore (0-100) van een paar waar dit account in zit, of 0 */
  collusie: number;
}

export interface Reden {
  code: string;
  label: string;
  punten: number;
}

export type RisicoNiveau = "laag" | "verhoogd" | "hoog";

/** De punten per signaal. Samen kunnen ze boven de 100 komen; de score is dan 100. */
export function redenen(s: AccountSignalen): Reden[] {
  const uit: Reden[] = [];
  if (s.dubbelDocument > 0) uit.push({ code: "dubbel-document", label: `Hetzelfde identiteitsbewijs bij ${s.dubbelDocument === 1 ? "nog 1 account" : `nog ${s.dubbelDocument} accounts`}`, punten: 40 });
  if (s.gedeeldIban > 0) uit.push({ code: "gedeeld-iban", label: `Hetzelfde rekeningnummer bij ${s.gedeeldIban === 1 ? "nog 1 account" : `nog ${s.gedeeldIban} accounts`}`, punten: 30 });
  if (s.gedeeldApparaat > 0) uit.push({ code: "gedeeld-apparaat", label: `Ingecheckt vanaf een toestel dat ook ${s.gedeeldApparaat === 1 ? "1 ander account" : `${s.gedeeldApparaat} andere accounts`} gebruikt`, punten: s.gedeeldApparaat >= 3 ? 25 : 15 });
  if (s.collusie >= 50) uit.push({ code: "collusie", label: `Opvallend patroon met één opdrachtgever (score ${Math.round(s.collusie)})`, punten: Math.round(s.collusie / 4) });
  if (s.geblokkeerd) uit.push({ code: "geblokkeerd", label: "Staat op de zwarte lijst", punten: 15 });
  if (s.ibanWachtOpControle) uit.push({ code: "iban-gewijzigd", label: "Rekeningnummer gewijzigd, nog niet opnieuw bevestigd", punten: 10 });
  return uit.sort((a, b) => b.punten - a.punten);
}

export function risicoScore(s: AccountSignalen): number {
  return Math.min(100, redenen(s).reduce((som, r) => som + r.punten, 0));
}

export function niveau(score: number): RisicoNiveau {
  if (score >= 60) return "hoog";
  if (score >= 30) return "verhoogd";
  return "laag";
}

export const LEEG: AccountSignalen = { gedeeldApparaat: 0, dubbelDocument: 0, gedeeldIban: 0, ibanWachtOpControle: false, geblokkeerd: false, collusie: 0 };

/**
 * Groepen van accounts die iets delen (een toestel, een document, een rekeningnummer)
 * omzetten naar "hoeveel anderen" per account. Een groep van één telt niet.
 */
export function anderenPerAccount(groepen: string[][]): Map<string, number> {
  const uit = new Map<string, number>();
  for (const g of groepen) {
    const uniek = [...new Set(g)];
    if (uniek.length < 2) continue;
    for (const id of uniek) uit.set(id, Math.max(uit.get(id) ?? 0, uniek.length - 1));
  }
  return uit;
}
