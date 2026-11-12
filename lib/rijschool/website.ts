import { z } from "zod";

// ---------------------------------------------------------------------------
// De teksten en keuzes van de rijschoolwebsite (/rijschool/<slug>). Opgeslagen
// als JSON op Rijschool.website; wat ontbreekt vult `websiteVan` aan met
// standaardteksten, zodat een nieuwe rijschool meteen een complete site heeft.
// {naam} en {plaats} worden ingevuld. Client-veilig.
// ---------------------------------------------------------------------------

export interface Punt {
  titel: string;
  tekst: string;
}

export interface RijschoolWebsite {
  kop: string;
  intro: string;
  overOns: string;
  /** plaatsen waar de rijschool lesgeeft en ophaalt */
  werkgebied: string[];
  /** bijvoorbeeld 78; null = niet tonen */
  slagingspercentage: number | null;
  sterkePunten: Punt[];
  faq: { vraag: string; antwoord: string }[];
  /** 06-nummer voor de WhatsApp-knop; leeg = geen knop */
  whatsapp: string;
}

const kort = (max: number) => z.string().trim().max(max);

export const websiteSchema = z.object({
  kop: kort(120),
  intro: kort(400),
  overOns: kort(2000),
  werkgebied: z.array(kort(60).min(1)).max(40),
  slagingspercentage: z.number().int().min(1).max(100).nullable(),
  sterkePunten: z.array(z.object({ titel: kort(80).min(1), tekst: kort(300) })).max(8),
  faq: z.array(z.object({ vraag: kort(200).min(1), antwoord: kort(1000).min(1) })).max(20),
  whatsapp: z
    .string()
    .trim()
    .max(20)
    .regex(/^(\+?[0-9 -]{8,20})?$/, "Vul een telefoonnummer in, bijvoorbeeld 06 12345678."),
});

const STANDAARD: RijschoolWebsite = {
  kop: "Rijles in {plaats} bij {naam}",
  intro: "Rustige, persoonlijke rijlessen met een vaste instructeur. Plan je proefles online en volg je voortgang na elke les in de app.",
  overOns:
    "{naam} geeft rijles in {plaats} en omgeving. Je krijgt een vaste instructeur die je stap voor stap naar je examen begeleidt. Na elke les zie je in de app wat goed ging en waar je de volgende keer aan werkt, met uitleg om thuis voor te bereiden.",
  werkgebied: [],
  slagingspercentage: null,
  sterkePunten: [
    { titel: "Vaste instructeur", tekst: "Eén vast gezicht dat jou en je rijstijl kent, van de eerste les tot het examen." },
    { titel: "Voortgang in de app", tekst: "Na elke les zie je per onderdeel hoe ver je bent en wat je huiswerk is." },
    { titel: "Thuis oefenen", tekst: "Uitleg per onderdeel en theorievragen met uitleg, wanneer het jou uitkomt." },
    { titel: "Duidelijke prijzen", tekst: "Pakketten met een vaste prijs en je tegoed altijd in beeld. Geen verrassingen." },
  ],
  faq: [
    { vraag: "Hoe begin ik?", antwoord: "Plan online een proefles. Je instructeur kijkt dan samen met je hoeveel lessen je ongeveer nodig hebt." },
    { vraag: "Halen jullie me op?", antwoord: "Ja, we halen je op en brengen je terug binnen ons werkgebied, thuis, op school of op je werk." },
    { vraag: "Kan ik een les verzetten?", antwoord: "Ja, in de app kun je tot de afgesproken termijn kosteloos annuleren. Daarna bel je ons." },
    { vraag: "Hoeveel lessen heb ik nodig?", antwoord: "Dat verschilt per persoon. Gemiddeld zijn het er tussen de 30 en 40. Na de proefles krijg je een eerlijke inschatting." },
  ],
  whatsapp: "",
};

const vul = (s: string, r: { naam: string; plaats: string }) =>
  s
    .replaceAll("{naam}", r.naam || "onze rijschool")
    .replaceAll("{plaats} en omgeving", r.plaats ? `${r.plaats} en omgeving` : "de regio")
    .replaceAll("{plaats}", r.plaats || "de regio");

/** De website zoals de bezoeker hem ziet: opgeslagen keuzes, aangevuld met standaardteksten. */
export function websiteVan(json: unknown, r: { naam: string; plaats: string }): RijschoolWebsite {
  const opgeslagen = websiteSchema.partial().safeParse(json && typeof json === "object" ? json : {});
  const w = { ...STANDAARD, ...(opgeslagen.success ? stripUndefined(opgeslagen.data) : {}) };
  return {
    ...w,
    kop: vul(w.kop, r),
    intro: vul(w.intro, r),
    overOns: vul(w.overOns, r),
    sterkePunten: w.sterkePunten.map((p) => ({ titel: vul(p.titel, r), tekst: vul(p.tekst, r) })),
    faq: w.faq.map((q) => ({ vraag: vul(q.vraag, r), antwoord: vul(q.antwoord, r) })),
  };
}

/** De ruwe keuzes om te bewerken (met {naam}/{plaats} nog niet ingevuld). */
export function websiteBewerkbaar(json: unknown): RijschoolWebsite {
  const opgeslagen = websiteSchema.partial().safeParse(json && typeof json === "object" ? json : {});
  return { ...STANDAARD, ...(opgeslagen.success ? stripUndefined(opgeslagen.data) : {}) };
}

function stripUndefined<T extends object>(o: T): Partial<RijschoolWebsite> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<RijschoolWebsite>;
}

/** Staat in een eigen puur bestand zodat de browser geen zod meeneemt. */
export { whatsappNummer } from "@/lib/rijschool/whatsapp";
