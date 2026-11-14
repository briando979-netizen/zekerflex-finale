// ---------------------------------------------------------------------------
// Meten of een formulier zijn werk doet (14 nov 2026). Op /demo en /klus-plaatsen
// stond de verstuurknop uit tot alles was ingevuld; sinds 14 nov staat hij aan en
// zegt een melding "Vul nog in: …" wat ontbreekt. Om volgende week te zien of dat
// helpt, telt één anoniem INTERACTION-event per formulier:
//   formulier:<formulier>:melding:<veld>   de melding verscheen (één keer per veld per sessie)
//   formulier:<formulier>:verstuurd        het formulier is echt verstuurd
// Alleen codes ([a-z0-9-]), nooit wat iemand intypt. Puur: de browser (knoppen), de
// server (rapport) en de tests delen dit bestand.
// ---------------------------------------------------------------------------

export const FORMULIER_PREFIX = "formulier:";
const CODE = /^[a-z0-9][a-z0-9-]{0,39}$/;

export type FormulierNaam = "demo" | "klus-plaatsen";

export interface FormulierTelling {
  /** hoe vaak de melding "Vul nog in" is gezien (per sessie hooguit één keer per veld) */
  melding: number;
  /** per veld */
  velden: Record<string, number>;
  verstuurd: number;
}

/** Het label van het event; null als een code niet geldig is (dan niets sturen). */
export function formulierLabel(formulier: string, soort: "melding" | "verstuurd", veld?: string): string | null {
  if (!CODE.test(formulier)) return null;
  if (soort === "verstuurd") return `${FORMULIER_PREFIX}${formulier}:verstuurd`;
  if (!veld || !CODE.test(veld)) return null;
  return `${FORMULIER_PREFIX}${formulier}:melding:${veld}`;
}

/**
 * Hooguit één melding-event per veld per sessie: de eerste keer telt, daarna niet meer.
 * `gezien` is de sessielijst (in de browser via sessionStorage, zie components/analytics/formulier.ts).
 */
export function eersteMelding(gezien: Set<string>, formulier: string, veld: string): boolean {
  const label = formulierLabel(formulier, "melding", veld);
  if (!label || gezien.has(label)) return false;
  gezien.add(label);
  return true;
}

/** Een label uit de analytics terug naar formulier, soort en veld; null als het geen formulier-event is. */
export function leesFormulierLabel(label: string | null | undefined): { formulier: string; soort: "melding" | "verstuurd"; veld: string | null } | null {
  if (!label || !label.startsWith(FORMULIER_PREFIX)) return null;
  const delen = label.slice(FORMULIER_PREFIX.length).split(":");
  const [formulier, soort, veld] = delen;
  if (!formulier || !CODE.test(formulier)) return null;
  if (soort === "verstuurd" && delen.length === 2) return { formulier, soort, veld: null };
  if (soort === "melding" && delen.length === 3 && veld && CODE.test(veld)) return { formulier, soort, veld };
  return null;
}

/** De telling per formulier uit een lijst events (alleen het label is nodig). */
export function telFormulieren(events: readonly { label: string | null }[]): Record<string, FormulierTelling> {
  const uit: Record<string, FormulierTelling> = {};
  for (const e of events) {
    const f = leesFormulierLabel(e.label);
    if (!f) continue;
    const t = (uit[f.formulier] ??= { melding: 0, velden: {}, verstuurd: 0 });
    if (f.soort === "verstuurd") t.verstuurd += 1;
    else {
      t.melding += 1;
      t.velden[f.veld!] = (t.velden[f.veld!] ?? 0) + 1;
    }
  }
  return uit;
}
