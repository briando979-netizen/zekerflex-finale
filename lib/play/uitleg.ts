import { AppError } from "@/lib/errors";
import { PlayFout } from "@/lib/play/api";

// ---------------------------------------------------------------------------
// Fouten van Google Play in gewoon Nederlands, met wat de eigenaar eraan kan
// doen. Onbekende fouten krijgen de tekst van Google erbij, zodat niets
// verdwijnt. Pure functie, zodat hij te testen is.
// ---------------------------------------------------------------------------

export function uitlegPlayFout(err: PlayFout, ctx: { pakket: string; serviceEmail: string | null }): string {
  const m = err.message;
  if (/only releases with status draft may be created on draft app/i.test(m)) {
    return "Je app staat bij Google Play nog in concept. Zet de eerste versie één keer zelf live in Play Console (Testen → Interne test → Release maken). Daarna kan alles hier.";
  }
  if (/version code .* has already been used|apk specifies a version code that has already been used/i.test(m)) {
    return "Deze versie staat al in Google Play. Bouw een nieuwe versie en probeer het opnieuw.";
  }
  if (err.status === 404 || /package not found|applicationNotFound/i.test(m)) {
    return `Google Play kent nog geen app met pakketnaam ${ctx.pakket}. Maak de app aan in Play Console en upload de eerste versie zelf (stap 3). Controleer ook of de pakketnaam klopt.`;
  }
  if (err.status === 403 || /permission|forbidden|caller does not have/i.test(m)) {
    return ctx.serviceEmail
      ? `ZekerFlex heeft (nog) geen toegang tot deze app. Nodig ${ctx.serviceEmail} uit in Play Console → Gebruikers en rechten, en geef rechten voor deze app (stap 4).`
      : "ZekerFlex heeft (nog) geen toegang tot deze app in Google Play.";
  }
  if (/package name .* (does not match|mismatch)|incorrect package name/i.test(m)) {
    return "Het app-bestand hoort bij een andere pakketnaam dan de app in Google Play.";
  }
  if (/production|not allowed to (publish|release) to production|apply for production access/i.test(m) && /access|allowed/i.test(m)) {
    return "Je account mag nog niet naar productie. Nieuwe persoonlijke accounts moeten eerst 14 dagen testen met minstens 12 testers en daarna in Play Console toegang tot productie aanvragen.";
  }
  if (/googleGroups|google group|testers/i.test(m)) {
    return `Google accepteert de testersgroep niet. Gebruik het adres van een Google Group (bijvoorbeeld naam@googlegroups.com). Google meldt: ${m}`;
  }
  if (err.status === 429) return "Google Play krijgt even te veel verzoeken. Probeer het over een paar minuten opnieuw.";
  if (err.status >= 500) return "Google Play is even niet bereikbaar. Probeer het over een paar minuten opnieuw.";
  return `Google Play meldt: ${m}`;
}

/** Zet een Play-fout om in een AppError met uitleg; andere fouten blijven zoals ze zijn. */
export function alsAppFout(err: unknown, ctx: { pakket: string; serviceEmail: string | null }): unknown {
  if (err instanceof PlayFout) return AppError.upstream(uitlegPlayFout(err, ctx));
  return err;
}
