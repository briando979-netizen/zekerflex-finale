// ---------------------------------------------------------------------------
// Wat een apparaat met zijn pushaanmelding doet bij elk bezoek (PushToggle.tsx, PushSelfHeal).
//
// Gemeten 12 nov 2026: de laptop van de eigenaar (Edge, pushdienst van Windows) raakte zijn
// aanmelding drie keer binnen een dag kwijt (27 okt, 5 nov, 10 nov). De server zet een aanmelding
// uit zodra de pushdienst zegt dat hij weg is, en het apparaat meldde zich daarna nooit vanzelf
// opnieuw aan: Admin → Systeem stond op "Storing" tot iemand weer op "Aanzetten" klikte.
// Nu meldt elk apparaat met toestemming zich bij elk bezoek stil opnieuw aan (zonder vraag: de
// toestemming is er al), behalve als je meldingen op dat apparaat zelf hebt uitgezet.
// Puur: de client leest dit, de test ook.
// ---------------------------------------------------------------------------

/** localStorage: "1" = je hebt meldingen op dit apparaat zelf uitgezet; dan niet stil weer aanmelden. */
export const ZELF_UIT_KEY = "zf-push-zelf-uit";

/**
 * niets      = geen toestemming, of zelf uitgezet: niets doen
 * aanmelden  = toestemming, maar de browser heeft geen aanmelding (meer): stil een nieuwe maken
 * vervangen  = de aanmelding hoort bij een andere VAPID-sleutel: weggooien en opnieuw
 * doorgeven  = de aanmelding is goed: opnieuw aan de server geven (die zet hem weer aan; zei de
 *              pushdienst eerder dat hij weg was, dan vervangt de client hem alsnog)
 */
export type AanmeldStap = "niets" | "aanmelden" | "vervangen" | "doorgeven";

export function volgendeStap(i: {
  toestemming: NotificationPermission;
  heeftAanmelding: boolean;
  zelfdeSleutel: boolean;
  zelfUitgezet: boolean;
}): AanmeldStap {
  if (i.toestemming !== "granted") return "niets";
  if (!i.heeftAanmelding) return i.zelfUitgezet ? "niets" : "aanmelden";
  return i.zelfdeSleutel ? "doorgeven" : "vervangen";
}
