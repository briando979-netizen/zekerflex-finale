// ---------------------------------------------------------------------------
// Whisper verzint tekst bij stilte of ruis: een spraakbericht van 6 seconden kwam terug als ruim honderd keer
// "hey, hey, hey" (16 nov 2026, /berichten). Zo'n tekst tonen we niet; dan staat er "geen spraak gehoord".
// Puur (geen server-imports): de route die uitschrijft (app/api/inbox/[threadId]/transcript) en de chatbubbel
// (components/chat/MessageBubble.tsx, ook voor teksten die al bewaard zijn) gebruiken dezelfde controle.
// ---------------------------------------------------------------------------

/** Meer woorden per seconde kan niemand zeggen (snel praten is ongeveer drie per seconde). */
const MAX_WOORDEN_PER_SECONDE = 6;
/** Onder dit aantal woorden kijken we niet naar herhaling ("ja ja ja" kan gewoon). */
const MIN_WOORDEN_HERHALING = 10;

/**
 * Lijkt deze uitgeschreven tekst verzonnen? Ja als hij bijna alleen uit hetzelfde woord (of hetzelfde rijtje) bestaat,
 * of veel langer is dan in `duurSec` seconden te zeggen valt. Zonder duur alleen de controle op herhaling.
 */
export function lijktVerzonnen(tekst: string, duurSec?: number): boolean {
  const woorden = tekst.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
  if (woorden.length === 0) return false;
  if (duurSec !== undefined && Number.isFinite(duurSec) && duurSec > 0 && woorden.length > Math.max(12, duurSec * MAX_WOORDEN_PER_SECONDE)) return true;
  if (woorden.length < MIN_WOORDEN_HERHALING) return false;
  const telling = new Map<string, number>();
  let meest = 0;
  for (const w of woorden) {
    const n = (telling.get(w) ?? 0) + 1;
    telling.set(w, n);
    meest = Math.max(meest, n);
  }
  // één woord is het grootste deel, of een kort rijtje komt steeds terug ("dank je wel dank je wel …")
  return meest / woorden.length >= 0.6 || telling.size / woorden.length <= 0.2;
}

/** De tekst om te bewaren en te tonen: leeg als hij verzonnen lijkt (de bubbel zegt dan "geen spraak gehoord"). */
export function schoonTranscript(tekst: string, duurSec?: number): string {
  return lijktVerzonnen(tekst, duurSec) ? "" : tekst;
}
