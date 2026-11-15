// ---------------------------------------------------------------------------
// De berichten die Jarvis (beheer → ZekerFlex AI) naar het model stuurt, in een volgorde die het eigen model snel maakt
// (15 nov 2026). Gemeten op prod: met "alles gratis" draait alles op gemma3:4b op de CPU (5 kernen, OLLAMA_NUM_PARALLEL=1);
// die leest de vraag met ±55 stukjes per seconde, maar hergebruikt een begin dat hij net al las (1.943 stukjes in 1,5 s
// in plaats van 33 s, app/api/chat). Jarvis stuurde de live status (met tijdstip, dus elke keer anders) als tweede
// bericht, vóór de voorbeelden: dan valt er niets te hergebruiken behalve de persona. Een snelle vraag gaf zo op 15 nov
// "LLM gaf geen eerste woord binnen 50000ms"; gemiddeld duurde een vraag 36–50 s.
//
// Daarom: eerst wat vastligt (persona, dan de voorbeelden), daarna wat wisselt (status, gesprek, vraag). En met "alles
// gratis" korter: minder voorbeelden en gesprek, zoals de sitechat zijn kennis inkort. Puur, zodat het te testen is.
// ---------------------------------------------------------------------------

export type JarvisBericht = { role: "system" | "user" | "assistant"; content: string };

export interface JarvisInvoer {
  persona: string;
  /** de live status (jarvisStateLine); leeg = weglaten */
  status: string;
  voorbeelden: { q: string; a: string }[];
  geschiedenis: { role: "user" | "assistant"; content: string }[];
  vraag: string;
  /** "alles gratis" aan: het eigen model op de CPU, dus korter */
  gratis: boolean;
}

/** Met "alles gratis": hooguit zoveel voorbeelden en beurten (vraag + antwoord), en zo lang per stuk. */
export const GRATIS_GRENZEN = { voorbeelden: 0, beurten: 2, vraagTekens: 300, antwoordTekens: 500 } as const;

const kort = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/**
 * Een groet of praatje ("hallo", "bedankt", "ok", hooguit twee woorden): dan gaat de platformstatus niet mee. Het kleine
 * eigen model plakte hem anders gewoon terug (15 nov: "Hallo. Platform Status LIVE PLATFORMSTATUS (…): db=ok, …").
 */
export function isPraatje(vraag: string): boolean {
  const p = vraag.trim().toLowerCase();
  const woorden = p.split(/\s+/).filter(Boolean);
  return (
    woorden.length <= 2 ||
    /^(hoi|hai|hallo|hey|hi|yo|dag|goedemorgen|goedemiddag|goedenavond|goedenacht)\b/.test(p) ||
    /^(bedankt|dank je|dankje|dank u|thanks|top|oke|oké|ok|prima|super)\b/.test(p) ||
    /^(hoe gaat het|alles goed)\s*[?!.]*$/.test(p)
  );
}

/** De status als achtergrond, met de regel dat de cijfers alleen genoemd worden als ernaar gevraagd wordt. */
export const statusAlsAchtergrond = (status: string): string =>
  `Achtergrond, alleen voor als de beheerder ernaar vraagt (noem deze cijfers niet uit jezelf en niet bij een groet): ${status}`;

export function jarvisBerichten(i: JarvisInvoer): JarvisBericht[] {
  const g = GRATIS_GRENZEN;
  const voorbeelden = i.gratis
    ? i.voorbeelden.slice(0, g.voorbeelden).map((e) => ({ q: kort(e.q, g.vraagTekens), a: kort(e.a, g.antwoordTekens) }))
    : i.voorbeelden;
  // de geschiedenis komt in paren (vraag, antwoord); met gratis alleen de laatste beurten, ingekort
  const geschiedenis = i.gratis
    ? i.geschiedenis.slice(-g.beurten * 2).map((b) => ({ ...b, content: kort(b.content, b.role === "user" ? g.vraagTekens : g.antwoordTekens) }))
    : i.geschiedenis;
  const voorbeeldBlok = voorbeelden.length
    ? "Voorbeelden van goede eerdere antwoorden:\n" + voorbeelden.map((e, n) => `${n + 1}. V: ${e.q}\n   A: ${e.a}`).join("\n")
    : "";
  return [
    // vast: elke keer woord voor woord hetzelfde, zodat het model dit begin kan hergebruiken
    { role: "system", content: i.persona },
    ...(voorbeeldBlok ? [{ role: "system" as const, content: voorbeeldBlok }] : []),
    // wisselt: na het vaste begin; bij een groet of praatje geen status (het model plakte hem anders terug)
    ...(i.status && !isPraatje(i.vraag) ? [{ role: "system" as const, content: statusAlsAchtergrond(i.status) }] : []),
    ...geschiedenis,
    { role: "user", content: i.vraag },
  ];
}

/** Een technische fout van het model als gewone zin voor de beheerder (de techniek staat in het log). */
export function jarvisFoutTekst(melding: string): string {
  if (/eerste woord|afgebroken|onbereikbaar|timeout|aborted|ECONNREFUSED|fetch failed/i.test(melding)) {
    return "Het AI-model reageert nu niet snel genoeg. De server is waarschijnlijk druk (bijvoorbeeld tijdens een uitrol). Probeer het over een minuut opnieuw.";
  }
  return "Het AI-model gaf nu geen antwoord. Probeer het opnieuw; blijft het misgaan, kijk dan in Systeem → Foutmeldingen.";
}
