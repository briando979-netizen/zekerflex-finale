import type { ContractSjabloon } from "@/lib/belgie/klus-kern";

// ---------------------------------------------------------------------------
// De contractsjablonen voor een klus in België (28 nov 2026, spec-belgie.md 1.1, 1.2, 9 en 10): de studentenovereenkomst, de
// raamovereenkomst flexi-job en de flexi-arbeidsovereenkomst, als platte tekst met de gegevens van de klus al ingevuld. Puur
// bestand (de route app/api/werkgever/diensten/[shiftId]/belgie/contract levert ze, de tests lezen ze).
//
// Spelregels:
//   • bovenaan altijd SJABLOON_KOP: het bedrijf laat de tekst nakijken door zijn sociaal secretariaat;
//   • alleen de verplichte vermeldingen uit de specificatie, geen verzonnen wetsartikelen;
//   • in het Nederlands (Vlaanderen, de exploitatiezetel van de klus; spec 9). Een vertaling mag erbij, het Nederlands gaat voor;
//   • geen veld voor het rijksregisternummer (spec 8): dat zet het bedrijf zelf in de Dimona, niet via ZekerFlex;
//   • ZekerFlex is geen partij en niet de werkgever; het bedrijf en de werker tekenen.
// ---------------------------------------------------------------------------

export const SJABLOON_KOP = "Sjabloon. Laat het nakijken door je sociaal secretariaat voordat je tekent.";

/** Wat de route invult; alles is al tekst (datum en tijden in de tijd van de werkplek, die van Amsterdam en Brussel is dezelfde). */
export interface ContractGegevens {
  bedrijf: { naam: string; btwNummer: string | null };
  /** de gekozen werker, of null: dan blijven zijn regels leeg om met de hand in te vullen */
  werker: { naam: string } | null;
  klus: {
    titel: string;
    omschrijving: string | null;
    /** "Meir 1, 2000 Antwerpen, België" */
    werkplek: string;
    /** "vrijdag 5 december 2026" */
    datum: string;
    /** "09:00" */
    van: string;
    tot: string;
    pauzeMinuten: number;
    /** gewerkte uren zonder pauze, bv. 7,5 */
    uren: number;
    uurloonCents: number;
  };
}

const LEEG = "________________________";

export const SJABLOON_TITEL: Record<ContractSjabloon, string> = {
  student: "Studentenovereenkomst",
  "flexi-raam": "Raamovereenkomst flexi-job",
  "flexi-arbeid": "Flexi-arbeidsovereenkomst",
};

const SJABLOON_BESTAND: Record<ContractSjabloon, string> = {
  student: "studentenovereenkomst",
  "flexi-raam": "raamovereenkomst-flexi",
  "flexi-arbeid": "flexi-arbeidsovereenkomst",
};

export function euroTekst(cents: number): string {
  return `€ ${(cents / 100).toFixed(2).replace(".", ",")}`;
}

function urenTekst(uren: number): string {
  return (Math.round(uren * 100) / 100).toString().replace(".", ",");
}

function ofLeeg(v: string | null | undefined): string {
  const t = (v ?? "").trim();
  return t ? t : LEEG;
}

/** "studentenovereenkomst-bediening-terras.txt": alleen kleine letters, cijfers en streepjes. */
export function contractBestandsnaam(sjabloon: ContractSjabloon, klusTitel: string): string {
  const deel = klusTitel
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return `${SJABLOON_BESTAND[sjabloon]}${deel ? `-${deel}` : ""}.txt`;
}

function partijen(g: ContractGegevens, werkerRol: string): string[] {
  return [
    "Tussen",
    "",
    "De werkgever",
    `  Naam: ${g.bedrijf.naam}`,
    `  Ondernemingsnummer of btw-nummer: ${ofLeeg(g.bedrijf.btwNummer)}`,
    `  Adres van de maatschappelijke zetel: ${LEEG}`,
    `  Vertegenwoordigd door: ${LEEG}`,
    "",
    "en",
    "",
    `De ${werkerRol}`,
    `  Naam en voornaam: ${ofLeeg(g.werker?.naam)}`,
    `  Adres: ${LEEG}`,
    `  Geboortedatum: ${LEEG}`,
    "",
  ];
}

function tewerkstelling(g: ContractGegevens): string[] {
  const k = g.klus;
  return [
    `  Werkplaats: ${k.werkplek}`,
    `  Functie: ${k.titel}`,
    `  Omschrijving van het werk: ${ofLeeg(k.omschrijving)}`,
    `  Datum: ${k.datum}`,
    `  Uurrooster: van ${k.van} tot ${k.tot}, met ${k.pauzeMinuten} minuten pauze: ${urenTekst(k.uren)} uur.`,
  ];
}

const SLOT_TAAL = [
  "Taal",
  "Deze overeenkomst is opgesteld in het Nederlands. Een vertaling mag erbij; bij verschil geldt de Nederlandse tekst.",
  "",
];

const SLOT_ZEKERFLEX = [
  "ZekerFlex",
  "Deze overeenkomst kwam tot stand via ZekerFlex. ZekerFlex bemiddelt: het is geen partij bij deze overeenkomst en niet de werkgever.",
  "",
];

function handtekeningen(werkerRol: string, exemplaren: string): string[] {
  return [
    `Opgemaakt te ${LEEG} op ${LEEG}, ${exemplaren}`,
    "",
    "Handtekening werkgever:                      " + `Handtekening ${werkerRol}:`,
    "",
    "",
    "____________________________                 ____________________________",
  ];
}

function student(g: ContractGegevens): string[] {
  return [
    "Studentenovereenkomst",
    "(arbeidsovereenkomst voor studenten, Titel VII van de wet van 3 juli 1978 betreffende de arbeidsovereenkomsten)",
    "",
    ...partijen(g, "student"),
    `  Onderwijsinstelling en studierichting: ${LEEG}`,
    "",
    "komen het volgende overeen.",
    "",
    "1. Begin en einde",
    `  De student werkt voor een bepaalde duur: van ${g.klus.datum} tot en met ${g.klus.datum}.`,
    "",
    "2. Plaats, functie en uurrooster",
    ...tewerkstelling(g),
    "  Werkt de student meer dagen, vul dan elke dag met zijn uren in.",
    "",
    "3. Loon",
    `  Brutoloon: ${euroTekst(g.klus.uurloonCents)} per uur.`,
    `  De werkgever betaalt het loon op rekeningnummer ${LEEG}, uiterlijk op ${LEEG}.`,
    "",
    "4. Paritair comité",
    `  Paritair comité van de werkgever: ${LEEG}`,
    "",
    "5. Studentenarbeid",
    "  - De student bezorgt de werkgever het attest uit Student@work, zodat de werkgever het resterende urenpakket van 650 uur per kalenderjaar nakijkt.",
    "  - De student bezorgt de werkgever een inschrijvingsattest voor het lopende schooljaar.",
    "  - De werkgever doet uiterlijk op de eerste werkdag de Dimona van het type STU bij de RSZ, met de uren uit deze overeenkomst.",
    "",
    ...SLOT_ZEKERFLEX,
    ...SLOT_TAAL,
    ...handtekeningen("student", "in twee exemplaren, uiterlijk op de eerste werkdag. Elke partij ontvangt een exemplaar."),
  ];
}

function flexiRaam(g: ContractGegevens): string[] {
  return [
    "Raamovereenkomst flexi-job",
    "",
    ...partijen(g, "flexi-werker"),
    "komen het volgende overeen.",
    "",
    "1. Voorwerp",
    "  Deze raamovereenkomst gaat vooraf aan elke flexi-arbeidsovereenkomst tussen de partijen.",
    "",
    "2. Hoe en wanneer de werkgever werk voorstelt",
    `  De werkgever stelt een flexi-arbeidsovereenkomst voor via ${LEEG} (bijvoorbeeld de app ZekerFlex, e-mail of telefoon),`,
    `  uiterlijk ${LEEG} vóór het begin van de tewerkstelling. De flexi-werker kan een voorstel aannemen of weigeren.`,
    "",
    "3. Korte functiebeschrijving",
    `  ${g.klus.titel}${g.klus.omschrijving?.trim() ? `: ${g.klus.omschrijving.trim()}` : ""}`,
    "",
    "4. Flexiloon",
    `  Flexiloon: ${euroTekst(g.klus.uurloonCents)} per uur.`,
    "  Het flexivakantiegeld is 7,67 % van het flexiloon en wordt samen met het loon betaald.",
    "  Het bedrag hierboven bevat het flexivakantiegeld al: ja / nee (schrappen wat niet past).",
    "",
    "5. Voorwaarden om flexi te mogen werken",
    "  De flexi-werker had in het derde kwartaal vóór het kwartaal van de tewerkstelling bij een of meer andere werkgevers",
    "  minstens 4/5 van een voltijdse tewerkstelling, of is gepensioneerd.",
    "  In het kwartaal van de tewerkstelling heeft de flexi-werker geen andere arbeidsovereenkomst bij deze werkgever en is hij",
    "  of zij niet in opzeg bij deze werkgever.",
    "  De flexi-werker meldt het de werkgever meteen als hij of zij niet meer aan deze voorwaarden voldoet.",
    "  De RSZ controleert de voorwaarden bij de Dimona van het type FLX.",
    "",
    "6. Bewaren en registreren",
    "  De werkgever bewaart deze raamovereenkomst en elke flexi-arbeidsovereenkomst op de arbeidsplaats, en houdt van elke",
    "  tewerkstelling het exacte begin- en einduur bij.",
    "",
    "7. Duur",
    `  Deze raamovereenkomst geldt vanaf ${LEEG} tot ${LEEG} (of: voor onbepaalde tijd).`,
    "",
    ...SLOT_ZEKERFLEX,
    ...SLOT_TAAL,
    ...handtekeningen("flexi-werker", "vóór de eerste flexi-arbeidsovereenkomst, in twee exemplaren. Elke partij ontvangt een exemplaar."),
  ];
}

function flexiArbeid(g: ContractGegevens): string[] {
  return [
    "Flexi-arbeidsovereenkomst",
    "",
    ...partijen(g, "flexi-werker"),
    "komen het volgende overeen.",
    "",
    `Deze flexi-arbeidsovereenkomst valt onder de raamovereenkomst flexi-job van ${LEEG} (datum) tussen dezelfde partijen.`,
    "",
    "1. Tewerkstelling voor een bepaalde duur",
    ...tewerkstelling(g),
    "",
    "2. Flexiloon",
    `  Flexiloon: ${euroTekst(g.klus.uurloonCents)} per uur, met het flexivakantiegeld van 7,67 % zoals in de raamovereenkomst.`,
    "",
    "3. Dimona en registratie",
    "  De werkgever doet de Dimona van het type FLX vóór het begin van de tewerkstelling en houdt het exacte begin- en einduur bij.",
    "",
    ...SLOT_ZEKERFLEX,
    ...SLOT_TAAL,
    ...handtekeningen("flexi-werker", "in twee exemplaren. Elke partij ontvangt een exemplaar."),
  ];
}

/** De volledige tekst van een sjabloon, met SJABLOON_KOP bovenaan. */
export function contractTekst(sjabloon: ContractSjabloon, g: ContractGegevens): string {
  const romp = sjabloon === "student" ? student(g) : sjabloon === "flexi-raam" ? flexiRaam(g) : flexiArbeid(g);
  return [SJABLOON_KOP, "=".repeat(SJABLOON_KOP.length), "", ...romp, ""].join("\n");
}
