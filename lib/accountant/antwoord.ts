import type { KennisHit } from "@/lib/accountant/kennis";

// ---------------------------------------------------------------------------
// Zuivere hulpjes van de vraagbalk: de eerlijke "dat weet ik niet zeker"-uitkomst en de controle dat
// een antwoord van het model geen bedragen of percentages bevat die niet in de gevonden bronnen staan.
// ---------------------------------------------------------------------------

export interface VraagAntwoord {
  soort: "antwoord" | "onbekend";
  tekst: string;
  bronnen: { naam: string; url: string; zekerheid: "gelezen" | "laten-bevestigen" }[];
  /** Bij "onbekend": de vraag, klaar om aan een menselijk accountant te sturen. */
  vraagVoorMens?: string;
  /** Wie het antwoord schreef: het model of de kennisbank zelf (zonder model). */
  door: "model" | "kennisbank";
}

export function onbekend(vraag: string): VraagAntwoord {
  return {
    soort: "onbekend",
    tekst:
      "Dit weet ik niet zeker: er staat geen regel met een bron over in mijn kennisbank, en ik verzin geen regels. Stel de vraag aan een menselijke accountant of belastingadviseur; hieronder staat hij klaar om te kopiëren.",
    bronnen: [],
    vraagVoorMens: `Vraag over zekerflex, Inc. (Delaware, bestuurder woont in Nederland): ${vraag.trim().slice(0, 400)}`,
    door: "kennisbank",
  };
}

/** Bedragen en percentages in een tekst, als losse cijferreeksen ("85.165" → "85165"). */
export function cijfersIn(tekst: string): string[] {
  const out: string[] = [];
  for (const m of tekst.matchAll(/[$€]\s?([\d.,]+\d)|(\d[\d.,]*)\s?%/g)) {
    const ruw = (m[1] ?? m[2] ?? "").replace(/[.,]/g, "");
    if (ruw) out.push(ruw);
  }
  return out;
}

/** Staat elk bedrag/percentage uit het antwoord ook in minstens één bron (of in de vraag zelf)? */
export function bedragenKloppen(antwoord: string, hits: KennisHit[], vraag = ""): boolean {
  const toegestaan = new Set(cijfersIn(`${vraag} ${hits.map((h) => h.regel.text).join(" ")}`).concat(hits.flatMap((h) => h.regel.text.match(/\d[\d.,]*/g)?.map((x) => x.replace(/[.,]/g, "")) ?? [])));
  return cijfersIn(antwoord).every((c) => toegestaan.has(c));
}

/** Het antwoord zonder model: de gevonden regels zelf, met hun bron. */
export function antwoordUitBronnen(hits: KennisHit[]): VraagAntwoord {
  const top = hits.slice(0, 2);
  return {
    soort: "antwoord",
    tekst: top.map((h) => h.regel.text).join("\n\n"),
    bronnen: top.map((h) => ({ naam: h.regel.bron.naam, url: h.regel.bron.url, zekerheid: h.regel.zekerheid })),
    door: "kennisbank",
  };
}
