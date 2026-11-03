// ---------------------------------------------------------------------------
// Een aanvraag (lead) inboeken als reservering: welke velden het
// reserveringsformulier in het beheer alvast krijgt. De activiteit alleen als
// het programma precies een activiteit is; de tijd kiest het team zelf. Puur,
// dus ook in de browser bruikbaar en los te testen.
// ---------------------------------------------------------------------------

export interface InboekStart {
  /** id van de aanvraag, die na het inboeken op "geboekt" gaat */
  aanvraag: string;
  activiteit: string;
  datum: string;
  personen: string;
  naam: string;
  email: string;
  telefoon: string;
  opmerking: string;
}

const MAX_OPMERKING = 300;

export function inboekVanAanvraag(
  a: { id: string; programma: string; gelegenheid: string; datum: string; personen: number; naam: string; email: string; telefoon: string; bericht: string },
  namen: Record<string, string>,
): InboekStart {
  const activiteit = Object.entries(namen).find(([, naam]) => naam === a.programma)?.[0] ?? "";
  const wat = [a.gelegenheid, a.bericht.trim()].filter(Boolean).join(": ");
  const opmerking = `Uit aanvraag${wat ? ` (${wat})` : ""}`;
  return {
    aanvraag: a.id,
    activiteit,
    datum: /^\d{4}-\d{2}-\d{2}$/.test(a.datum) ? a.datum : "",
    personen: a.personen > 0 ? String(a.personen) : "",
    naam: a.naam,
    email: a.email,
    telefoon: a.telefoon,
    opmerking: opmerking.length > MAX_OPMERKING ? `${opmerking.slice(0, MAX_OPMERKING - 1)}…` : opmerking,
  };
}
