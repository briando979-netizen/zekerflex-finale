// ---------------------------------------------------------------------------
// De indeling van de vaste pagina's van de site (13 nov 2026, eigenaar: "alles moet ik kunnen verslepen"). Per pagina de
// onderdelen onder de kop: verslepen en verbergen in de Site-ontwerper (tabblad Pagina's, "Vaste pagina's indelen").
// Puur bestand: de regels hier, de opslag in lib/ontwerp/vaste-paginas-store.ts. De kop van een pagina staat altijd bovenaan.
// Zonder eigen indeling is een pagina precies zoals hij was: dezelfde onderdelen, in dezelfde volgorde.
// Een pagina toevoegen = hier een regel erbij en in de pagina zelf de onderdelen in een tabel zetten (zie /voor-bedrijven).
// ---------------------------------------------------------------------------

export interface VasteSectie {
  id: string;
  naam: string;
  uitleg: string;
}

export interface VastePagina {
  naam: string;
  /** het adres op de site */
  pad: string;
  /** de onderdelen onder de kop, in de oorspronkelijke volgorde */
  secties: readonly VasteSectie[];
}

export const VASTE_PAGINAS = {
  "voor-bedrijven": {
    naam: "Voor bedrijven",
    pad: "/voor-bedrijven",
    secties: [
      { id: "systeem", naam: "Het systeem", uitleg: "De kaarten met wat ZekerFlex voor een bedrijf regelt." },
      { id: "cijfers", naam: "Kosten in cijfers", uitleg: "De donkere band met € 3,50 per uur en € 0 opstartkosten." },
      { id: "rekentools", naam: "Rekentools", uitleg: "De kaarten met links naar de rekentools." },
      { id: "faq", naam: "Veelgestelde vragen", uitleg: "De vragen en antwoorden voor bedrijven." },
      { id: "slot", naam: "Slotoproep", uitleg: "De band onderaan met de knop om te beginnen." },
    ],
  },
  "voor-freelancers": {
    naam: "Voor freelancers",
    pad: "/voor-freelancers",
    secties: [
      { id: "voordelen", naam: "Wat je krijgt", uitleg: "De voordelen voor een freelancer, in een raster." },
      { id: "stappen", naam: "Zo werkt het", uitleg: "De zes stappen van aanmelden tot uitbetaling." },
      { id: "faq", naam: "Veelgestelde vragen", uitleg: "De vragen en antwoorden voor freelancers, met de link naar de rekentool." },
      { id: "slot", naam: "Slotoproep", uitleg: "De band onderaan met de knop om te beginnen." },
    ],
  },
  prijzen: {
    naam: "Prijzen",
    pad: "/prijzen",
    secties: [
      { id: "tarieven", naam: "De tarieven", uitleg: "De twee kaarten (freelancers en bedrijven) met de rekenhulp en de links eronder." },
      { id: "api", naam: "Koppeling voor ontwikkelaars", uitleg: "Het blok over de API, met de knop naar de pagina voor ontwikkelaars." },
      { id: "faq", naam: "Veelgestelde vragen", uitleg: "De vragen en antwoorden over de kosten." },
      { id: "slot", naam: "Slotoproep", uitleg: "De band onderaan met de knop om te beginnen." },
    ],
  },
  "over-ons": {
    naam: "Over ons",
    pad: "/over-ons",
    secties: [
      { id: "verhaal", naam: "Ons verhaal", uitleg: "De drie alinea's over waarom ZekerFlex bestaat." },
      { id: "oprichter", naam: "De oprichter", uitleg: "Het stuk over wie ZekerFlex heeft gebouwd." },
      { id: "uitgangspunten", naam: "Uitgangspunten", uitleg: "De drie kaarten: onafhankelijk, zeker en transparant." },
      { id: "werkenbij", naam: "Werken bij ZekerFlex", uitleg: "Het formulier voor een open sollicitatie." },
      { id: "slot", naam: "Slotoproep", uitleg: "De band onderaan met de knop om te beginnen." },
    ],
  },
} as const satisfies Record<string, VastePagina>;

export type VastePaginaId = keyof typeof VASTE_PAGINAS;

export const isVastePagina = (v: unknown): v is VastePaginaId => typeof v === "string" && Object.hasOwn(VASTE_PAGINAS, v);

export interface PaginaIndeling {
  /** alle onderdelen, van boven naar beneden */
  volgorde: string[];
  /** de onderdelen die niet getoond worden */
  verborgen: string[];
}

const ids = (pagina: VastePaginaId): string[] => VASTE_PAGINAS[pagina].secties.map((s) => s.id);

export const standaardPaginaIndeling = (pagina: VastePaginaId): PaginaIndeling => ({ volgorde: ids(pagina), verborgen: [] });

/**
 * Maakt van ongecontroleerde invoer een nette indeling voor deze pagina: onbekende en dubbele onderdelen vallen weg, en een
 * onderdeel dat ontbreekt (bijvoorbeeld een nieuw onderdeel dat er bij het bewaren nog niet was) komt achteraan.
 */
export function normalizePaginaIndeling(pagina: VastePaginaId, raw: unknown): PaginaIndeling {
  const bekend = ids(pagina);
  const o = raw && typeof raw === "object" ? (raw as { volgorde?: unknown; verborgen?: unknown }) : {};
  const volgorde: string[] = [];
  for (const v of Array.isArray(o.volgorde) ? o.volgorde : []) if (typeof v === "string" && bekend.includes(v) && !volgorde.includes(v)) volgorde.push(v);
  for (const id of bekend) if (!volgorde.includes(id)) volgorde.push(id);
  const verborgen = new Set<string>();
  for (const v of Array.isArray(o.verborgen) ? o.verborgen : []) if (typeof v === "string" && bekend.includes(v)) verborgen.add(v);
  // in de volgorde van de lijst, zodat twee gelijke indelingen ook gelijk worden bewaard
  return { volgorde, verborgen: bekend.filter((id) => verborgen.has(id)) };
}

export function isStandaardPaginaIndeling(pagina: VastePaginaId, i: PaginaIndeling): boolean {
  const n = normalizePaginaIndeling(pagina, i);
  const bekend = ids(pagina);
  return n.verborgen.length === 0 && n.volgorde.every((id, k) => id === bekend[k]);
}

/** Welke onderdelen de pagina toont, in volgorde. null = de standaard. */
export function zichtbareSecties(pagina: VastePaginaId, indeling: PaginaIndeling | null): string[] {
  const n = indeling ? normalizePaginaIndeling(pagina, indeling) : standaardPaginaIndeling(pagina);
  return n.volgorde.filter((id) => !n.verborgen.includes(id));
}
