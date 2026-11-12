// De regels van de nachtelijke rondgang (lib/ops/rondgang.ts en het werkerdeel in rondgang-werker.ts): wanneer is een
// opgehaalde pagina kapot? Puur bestand, apart zodat beide delen hem gebruiken zonder elkaar te importeren.

export interface RondgangProbleem {
  route: string;
  status: number | null;
  reden: string;
}

/** Beoordeelt één antwoord: null = in orde, anders de reden. */
export function beoordeel(status: number | null, body: string, contentType = "text/html"): string | null {
  if (status === null) return "geen antwoord";
  if (status >= 500) return `serverfout ${status}`;
  if (status === 404) return "pagina bestaat niet (404)";
  if (status >= 400) return `fout ${status}`;
  if (!/text\/html/i.test(contentType)) return null;
  // zonder scripts en stijl: wat overblijft moet een echte pagina zijn
  const tekst = body
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/Application error|Sorry, dit onderdeel haperde|De pagina kon niet worden geladen/i.test(tekst)) return "toont de foutgrens";
  if (tekst.length < 300) return `bijna lege pagina (${tekst.length} tekens)`;
  return null;
}
