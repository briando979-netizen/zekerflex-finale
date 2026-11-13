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
  uitzendbureau: {
    naam: "Uitzendbureau",
    pad: "/uitzendbureau",
    secties: [
      { id: "pijlers", naam: "Waarom uitzendklussen", uitleg: "De drie kaarten met de voordelen van uitzendwerk." },
      { id: "verwachtingen", naam: "De verwachtingen", uitleg: "Wat je krijgt als uitzendkracht, punt voor punt." },
      { id: "stappen", naam: "Zo begin je", uitleg: "De vier stappen om te starten met uitzendklussen." },
      { id: "fasen", naam: "Het fasensysteem", uitleg: "De uitleg van de ABU-fasen, stap voor stap." },
      { id: "ervaring", naam: "Ervaring van een uitzendkracht", uitleg: "De donkere band met het citaat." },
      { id: "routes", naam: "Drie manieren om te werken", uitleg: "De drie kaarten: uitzendkracht, zzp en vaste baan." },
      { id: "verloning", naam: "Alles terug te lezen", uitleg: "Het blok over loonstroken en inzicht in je verdiensten." },
      { id: "werkgevers", naam: "Voor werkgevers", uitleg: "Het blok met het contactformulier voor bedrijven." },
      { id: "faq", naam: "Veelgestelde vragen", uitleg: "De vragen en antwoorden over uitzendklussen." },
      { id: "slot", naam: "Slotoproep", uitleg: "De band onderaan met de knop om te beginnen." },
    ],
  },
  beveiliging: {
    naam: "Beveiliging",
    pad: "/beveiliging",
    secties: [
      { id: "cijfers", naam: "Live cijfers", uitleg: "Wat de bescherming op dit moment tegenhoudt." },
      { id: "maatregelen", naam: "Zo is ZekerFlex beveiligd", uitleg: "De negen dingen die standaard geregeld zijn." },
      { id: "logboek", naam: "Wat we loggen", uitleg: "Welke gegevens we bijhouden en hoe lang." },
      { id: "melden", naam: "Een kwetsbaarheid melden", uitleg: "Hoe iemand een lek kan doorgeven." },
      { id: "slot", naam: "Slotoproep", uitleg: "De band onderaan met de knop naar de websites." },
    ],
  },
  contact: {
    naam: "Contact",
    pad: "/contact",
    secties: [
      { id: "email", naam: "E-mailadressen", uitleg: "De kaarten met per onderwerp het juiste e-mailadres." },
      { id: "direct", naam: "Direct praten", uitleg: "De knoppen om te bellen, een demo te vragen of een klacht in te dienen." },
      { id: "google", naam: "Review op Google", uitleg: "De oproep om een review te schrijven, met de link naar Google Maps." },
    ],
  },
  "voor-bureaus": {
    naam: "Voor bureaus",
    pad: "/voor-bureaus",
    secties: [
      { id: "pakketten", naam: "Pakketten", uitleg: "De pakketten waarmee een bureau ZekerFlex kan inzetten." },
      { id: "waarom", naam: "Waarom ZekerFlex", uitleg: "De redenen om voor ZekerFlex te kiezen." },
      { id: "faq", naam: "Veelgestelde vragen", uitleg: "De vragen en antwoorden voor bureaus." },
      { id: "slot", naam: "Slotoproep", uitleg: "De band onderaan met de knop om contact op te nemen." },
    ],
  },
  abonnementen: {
    naam: "Abonnementen",
    pad: "/abonnementen",
    secties: [
      { id: "pakketten", naam: "Pakketten", uitleg: "De abonnementen met hun prijzen en modules." },
      { id: "faq", naam: "Veelgestelde vragen", uitleg: "De vragen en antwoorden over de abonnementen." },
      { id: "slot", naam: "Slotoproep", uitleg: "De band onderaan met de knop om te beginnen." },
    ],
  },
  // het startscherm van de werkgevers-app (personeel); de marges staan in lib/werkgever/start-marges.ts
  "werkgever-start": {
    naam: "Startscherm werkgevers-app",
    pad: "/werkgever",
    secties: [
      { id: "cijfers", naam: "De vier cijfers", uitleg: "Open klussen, uren om goed te keuren, uitgaven deze maand en actieve freelancers." },
      { id: "volgers", naam: "Volgers", uitleg: "De regel met hoeveel werkers het bedrijf volgen; staat er alleen als er volgers zijn." },
      { id: "beoordelingen", naam: "Nog te beoordelen", uitleg: "De werkers die nog een beoordeling krijgen; staat er alleen als er iemand wacht." },
      { id: "werk", naam: "Komende klussen en uren", uitleg: "De twee panelen naast elkaar: de komende klussen en de uren die op goedkeuring wachten." },
      { id: "berichten", naam: "Laatste berichten", uitleg: "De nieuwste gesprekken uit de chat; staat er alleen als er berichten zijn." },
      { id: "facturen", naam: "Facturen", uitleg: "De laatste facturen met bedrag en status." },
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
