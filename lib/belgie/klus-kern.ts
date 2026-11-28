import { landVanVestiging } from "@/lib/geo/vestiging-land";
import type { BelgischLoonContract } from "@/lib/belgie/lonen";

// ---------------------------------------------------------------------------
// Een klus op een Belgische werklocatie (28 nov 2026, spec-belgie.md hoofdstuk 1, 3, 8 en 10). Puur bestand: de kluspagina
// van het bedrijf, het klusformulier, de server en de tests delen het.
//
// In België is het bedrijf de werkgever (student of flexi-job), zoals een uitzendpartner in Nederland: het bedrijf sluit het
// contract, doet de Dimona (bij de RSZ) en betaalt het loon. ZekerFlex bemiddelt en rekent alleen de platformkosten.
// ZekerFlex verwerkt nooit een rijksregisternummer (spec 8): het bedrijf zet dat zelf in de Dimona; hier staat hoogstens het
// bevestigingsnummer van die Dimona, en een invoer die op een rijksregisternummer lijkt, weigeren we.
// ---------------------------------------------------------------------------

/** Een klus ligt in België als zijn werklocatie een Belgische postcode heeft ("BE-2000", lib/geo/vestiging-land.ts). */
export function isBelgischeKlus(postalCode: string | null | undefined): boolean {
  return landVanVestiging(postalCode) === "BE";
}

/** De soorten contract die een bedrijf nu kiest (spec 12, fase 2): student of flexi-job. */
export const BELGISCHE_CONTRACTEN = ["student", "flexi"] as const satisfies readonly BelgischLoonContract[];
export type BelgischContract = (typeof BELGISCHE_CONTRACTEN)[number];

/** Nog niet te kiezen (spec 12, fase 4 en 5): het formulier toont ze uitgeschakeld met "volgt later". */
export const LATERE_CONTRACTEN = ["uitzend", "zelfstandige"] as const;
export type LaterContract = (typeof LATERE_CONTRACTEN)[number];

export function isBelgischContract(v: unknown): v is BelgischContract {
  return v === "student" || v === "flexi";
}

/** Het type Dimona dat het bedrijf bij de RSZ doet (spec 1.1 en 1.2). */
export const DIMONA_TYPE = { student: "STU", flexi: "FLX" } as const satisfies Record<BelgischContract, string>;
export type DimonaType = (typeof DIMONA_TYPE)[BelgischContract];

/** De officiële en andere bronnen die de checklist noemt (spec 1.1, 1.2 en 3). */
export const BELGIE_BRONNEN = {
  studentAtWork: "https://www.socialsecurity.be/site_nl/employer/applics/studentatwork/index.htm",
  student: "https://www.socialsecurity.be/employer/instructions/dmfa/nl/latest/instructions/persons/specific/students.html",
  studentContract: "https://www.student.be/nl/student-life/studentencontract-in-belgie-alles-wat-elke-werkgever-moet-weten-in-2026",
  dimona: "https://www.socialsecurity.be/site_nl/employer/applics/dimona/general/who.htm",
  flexi: "https://www.socialsecurity.be/site_nl/employer/infos/flexi-jobs.htm",
  flexiBrochure: "https://a.storyblok.com/f/287812274129017/x/644c4c9a5b/flexi-jobs-infobrochure-vanaf-1-juli-2026.pdf",
  bemiddeling: "https://www.vlaanderen.be/bureaus-private-arbeidsbemiddeling/private-arbeidsbemiddelaar-worden",
} as const;
export type BelgieBron = keyof typeof BELGIE_BRONNEN;

/** De vinkjes van de checklist per soort contract; de tekst staat in lib/i18n/dictionaries.ts → belgie.vinkjes. */
export const BELGIE_CHECKLIST = {
  student: [
    { id: "saldo", bron: "studentAtWork" },
    { id: "studentenovereenkomst", bron: "studentContract" },
    { id: "dimonaStu", bron: "dimona" },
  ],
  flexi: [
    { id: "raamovereenkomst", bron: "flexiBrochure" },
    { id: "flexiOvereenkomst", bron: "flexi" },
    { id: "dimonaFlx", bron: "dimona" },
    { id: "flexiVoorwaarden", bron: "flexi" },
  ],
} as const satisfies Record<BelgischContract, readonly { id: string; bron: BelgieBron }[]>;
export type BelgieVinkje = (typeof BELGIE_CHECKLIST)[BelgischContract][number]["id"];

const ALLE_VINKJES: ReadonlySet<string> = new Set(Object.values(BELGIE_CHECKLIST).flatMap((l) => l.map((v) => v.id)));

export function isBelgieVinkje(soort: BelgischContract, id: unknown): id is BelgieVinkje {
  return BELGIE_CHECKLIST[soort].some((v) => v.id === id);
}

/** De contractsjablonen per soort (lib/belgie/contracten.ts). */
export const SJABLONEN_PER_SOORT = {
  student: ["student"],
  flexi: ["flexi-raam", "flexi-arbeid"],
} as const satisfies Record<BelgischContract, readonly string[]>;
export type ContractSjabloon = (typeof SJABLONEN_PER_SOORT)[BelgischContract][number];

export function isContractSjabloon(v: unknown): v is ContractSjabloon {
  return v === "student" || v === "flexi-raam" || v === "flexi-arbeid";
}

/** Wat ZekerFlex per Belgische klus bewaart (KV belgie:klus:<shiftId>, lib/belgie/klus.ts). Geen gegevens over een werker. */
export interface BelgieKlus {
  /** null: nog niet gekozen (een klus die niet via het klusformulier is geplaatst) */
  soort: BelgischContract | null;
  /** flexi-job in de horeca (paritair comité 302): dan geldt de ondergrens van lib/belgie/lonen.ts */
  horeca: boolean;
  /** het bedrijf bevestigde dat het de werkgever is en de Dimona doet; vervalt als de soort verandert */
  bevestiging: { door: string; op: string; dimona: DimonaType } | null;
  /** de aangevinkte stappen van de checklist */
  vinkjes: BelgieVinkje[];
}

export const LEGE_BELGIE_KLUS: BelgieKlus = { soort: null, horeca: false, bevestiging: null, vinkjes: [] };

/** Leest een bewaarde waarde soepel: wat niet klopt, valt weg (een oude of beschadigde rij breekt de pagina niet). */
export function leesBelgieKlus(v: unknown): BelgieKlus {
  const r = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const soort = isBelgischContract(r.soort) ? r.soort : null;
  const b = (r.bevestiging && typeof r.bevestiging === "object" ? r.bevestiging : null) as Record<string, unknown> | null;
  const bevestiging =
    soort && b && typeof b.door === "string" && typeof b.op === "string" && b.dimona === DIMONA_TYPE[soort] ? { door: b.door, op: b.op, dimona: DIMONA_TYPE[soort] } : null;
  const vinkjes = soort && Array.isArray(r.vinkjes) ? [...new Set(r.vinkjes.filter((id): id is BelgieVinkje => isBelgieVinkje(soort, id)))] : [];
  return { soort, horeca: soort === "flexi" && r.horeca === true, bevestiging, vinkjes };
}

/** Een andere soort contract: de bevestiging en de vinkjes horen bij de oude soort en vervallen. */
export function metSoort(klus: BelgieKlus, soort: BelgischContract, horeca: boolean): BelgieKlus {
  const zelfde = klus.soort === soort;
  return {
    soort,
    horeca: soort === "flexi" && horeca,
    bevestiging: zelfde ? klus.bevestiging : null,
    vinkjes: zelfde ? klus.vinkjes : [],
  };
}

export function metVinkje(klus: BelgieKlus, id: BelgieVinkje, aan: boolean): BelgieKlus {
  if (!klus.soort || !isBelgieVinkje(klus.soort, id)) return klus;
  const rest = klus.vinkjes.filter((v) => v !== id);
  return { ...klus, vinkjes: aan ? [...rest, id] : rest };
}

/** Waarom het bedrijf nog niemand kan kiezen: eerst de soort contract, dan de bevestiging. Null = kiezen mag. */
export function belgieKiesReden(klus: BelgieKlus): "soort" | "bevestiging" | null {
  if (!klus.soort) return "soort";
  if (!klus.bevestiging) return "bevestiging";
  return null;
}

/** Hoeveel stappen van de checklist zijn afgevinkt (voor de kop van het paneel). */
export function checklistStand(klus: BelgieKlus): { klaar: number; totaal: number } {
  if (!klus.soort) return { klaar: 0, totaal: 0 };
  const lijst = BELGIE_CHECKLIST[klus.soort];
  return { klaar: lijst.filter((v) => klus.vinkjes.includes(v.id)).length, totaal: lijst.length };
}

/** Het vinkje bestaat (voor een formulier dat een id doorgeeft). */
export function isBekendVinkje(id: unknown): id is BelgieVinkje {
  return typeof id === "string" && ALLE_VINKJES.has(id);
}

// --- het Dimona-nummer -------------------------------------------------------------------------------------------------

/**
 * Een rijksregisternummer (en een BIS-nummer, zelfde opbouw): 11 cijfers, de laatste twee zijn 97 min de rest van de eerste
 * negen bij deling door 97; voor wie na 1999 geboren is, staat er een 2 voor die negen cijfers.
 */
export function lijktRijksregisternummer(cijfers: string): boolean {
  if (!/^\d{11}$/.test(cijfers)) return false;
  const basis = Number(cijfers.slice(0, 9));
  const controle = Number(cijfers.slice(9));
  return 97 - (basis % 97) === controle || 97 - ((2_000_000_000 + basis) % 97) === controle;
}

export type DimonaInvoer = { ok: true; nummer: string } | { ok: false; reden: "leeg" | "vorm" | "rijksregister" };

/**
 * Het bevestigingsnummer van een Dimona zoals het bedrijf het overtypt: spaties, punten, streepjes en schuine strepen
 * vallen weg; daarna 6 tot 20 cijfers of letters. Wat op een rijksregisternummer lijkt, weigeren we: dat bewaart ZekerFlex niet.
 */
export function leesDimonaNummer(invoer: string): DimonaInvoer {
  const schoon = invoer.trim().replace(/[\s./-]+/g, "").toUpperCase();
  if (!schoon) return { ok: false, reden: "leeg" };
  if (lijktRijksregisternummer(schoon)) return { ok: false, reden: "rijksregister" };
  if (!/^[0-9A-Z]{6,20}$/.test(schoon)) return { ok: false, reden: "vorm" };
  return { ok: true, nummer: schoon };
}

/** Het antwoord van de acties op de kluspagina (app/werkgever/diensten/[shiftId]/belgie-actions.ts): met de stand van de server. */
export interface BelgieActieUitslag {
  ok: boolean;
  message: string;
  klus?: BelgieKlus;
  /** alleen bij het Dimona-nummer: het bewaarde nummer, of null als het gewist is */
  dimona?: string | null;
}
