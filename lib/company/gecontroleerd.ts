import { controleerBuitenlandInvoer, landSoort, normaliseerLand } from "@/lib/onboarding/buitenland";

// ---------------------------------------------------------------------------
// Wat mag een bedrijf dat nog niet is gecontroleerd? (23 nov 2026, eigenaar: zoals bij YoungOnes)
//
//   plaatsen, reacties zien   → altijd: een nieuw bedrijf zet meteen klussen uit, ze staan live en werkers reageren
//   inplannen, uitbetalen,    → pas na de controle: ZekerFlex weet dan wie het bedrijf is (KVK-nummer of, buiten Nederland,
//   overeenkomst laten tekenen  btw- of registratienummer, een contactpersoon, wie tekent)
//
// De controle komt dus op het moment dat het bedrijf iemand wil kiezen ("Nog een paar laatste checks"), niet in de onboarding.
// Dit bestand is puur (geen prisma, kv of zod): de server-regels in lib/company/verified.ts en het venster in de browser
// gebruiken dezelfde beslissing en dezelfde veldcontrole. Wat een aanvraag bewaart staat in OrgProfileExtra.controle.
// ---------------------------------------------------------------------------

/** De herkenbare code (en 423-fout, lib/errors.ts) voor "dit bedrijf is nog niet gecontroleerd". */
export const BEDRIJF_NOG_NIET_GECONTROLEERD = "BEDRIJF_NOG_NIET_GECONTROLEERD" as const;

export type BedrijfActie = "plaatsen" | "reacties-zien" | "inplannen" | "uitbetalen" | "overeenkomst-tekenen";

const VRIJ_VOOR_ELK_BEDRIJF: ReadonlySet<BedrijfActie> = new Set<BedrijfActie>(["plaatsen", "reacties-zien"]);

/** De ene beslissing: mag dit bedrijf dit doen? Een gecontroleerd bedrijf alles; een nieuw bedrijf plaatsen en reacties zien. */
export function bedrijfMagDoen(gecontroleerd: boolean, actie: BedrijfActie): boolean {
  return gecontroleerd || VRIJ_VOOR_ELK_BEDRIJF.has(actie);
}

/** De zin bij een geweigerde actie (server en venster); de klus en de reacties blijven staan. */
export const NOG_NIET_GECONTROLEERD_TEKST =
  "Je bedrijf is nog niet gecontroleerd. Je klus staat live en de reacties komen binnen, en je keuze wordt bewaard. Inplannen kan zodra we je bedrijfsgegevens hebben nagekeken.";

/** Zo lang wachten kost het bedrijf niets: dit staat in de mail en op het scherm. */
export const CONTROLE_MELDING_TEKST = "Je ontvangt een melding zodra je kunt inplannen.";

// --- de aanvraag --------------------------------------------------------------------------------------------------------

/** Wat het bedrijf invult bij "Nog een paar laatste checks". */
export interface ControleInvoer {
  /** ISO-landcode; leeg = Nederland */
  land: string;
  kvkNumber: string;
  btwNummer: string;
  registratieNummer: string;
  /** de bedrijfsnaam zoals die is geregistreerd */
  bedrijfsnaam: string;
  contactNaam: string;
  contactFunctie: string;
  telefoon: string;
  /** de contactpersoon tekent de overeenkomst zelf */
  tekentZelf: boolean;
  tekenaarNaam: string;
}

export type ControleVeld =
  | "land"
  | "kvkNumber"
  | "btwNummer"
  | "registratieNummer"
  | "bedrijfsnaam"
  | "contactNaam"
  | "contactFunctie"
  | "telefoon"
  | "tekenaarNaam";

/** "leeg" = niet ingevuld, "ongeldig" = ingevuld maar onbruikbaar; het venster zet er een tekst in zijn taal bij. */
export type ControleFout = "leeg" | "ongeldig";
export type ControleFouten = Partial<Record<ControleVeld, ControleFout>>;

const tekst = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Ruwe invoer (formulier of verzoek) netjes: alles tekst, afgekapt op een redelijke lengte. */
export function maakControleInvoer(raw: Record<string, unknown>): ControleInvoer {
  return {
    land: tekst(raw.land, 2).toUpperCase(),
    kvkNumber: tekst(raw.kvkNumber, 20),
    btwNummer: tekst(raw.btwNummer, 24),
    registratieNummer: tekst(raw.registratieNummer, 40),
    bedrijfsnaam: tekst(raw.bedrijfsnaam, 120),
    contactNaam: tekst(raw.contactNaam, 80),
    contactFunctie: tekst(raw.contactFunctie, 80),
    telefoon: tekst(raw.telefoon, 30),
    tekentZelf: raw.tekentZelf === true || raw.tekentZelf === "1" || raw.tekentZelf === "on",
    tekenaarNaam: tekst(raw.tekenaarNaam, 80),
  };
}

/** Een telefoonnummer: 8 tot 15 cijfers, met +, spaties, streepjes en haakjes erbij. */
export function isTelefoon(v: string): boolean {
  const cijfers = v.replace(/\D/g, "");
  return /^\+?[\d\s().-]+$/.test(v.trim()) && cijfers.length >= 8 && cijfers.length <= 15;
}

export function controleerControleInvoer(i: ControleInvoer): { ok: true } | { ok: false; fouten: ControleFouten } {
  const fouten: ControleFouten = {};
  const soort = landSoort(i.land);
  if (soort === null) {
    fouten.land = "ongeldig";
  } else if (soort === "NL") {
    const kvk = i.kvkNumber.replace(/\D/g, "");
    if (!kvk) fouten.kvkNumber = "leeg";
    else if (kvk.length !== 8) fouten.kvkNumber = "ongeldig";
  } else {
    const c = controleerBuitenlandInvoer({ land: normaliseerLand(i.land), btwNummer: i.btwNummer, registratieNummer: i.registratieNummer });
    if (!c.ok) fouten[soort === "EU" ? "btwNummer" : "registratieNummer"] = (soort === "EU" ? i.btwNummer : i.registratieNummer).trim() ? "ongeldig" : "leeg";
  }
  const naam = (veld: "bedrijfsnaam" | "contactNaam" | "contactFunctie", min: number) => {
    const v = i[veld];
    if (!v) fouten[veld] = "leeg";
    else if (v.length < min) fouten[veld] = "ongeldig";
  };
  naam("bedrijfsnaam", 2);
  naam("contactNaam", 2);
  naam("contactFunctie", 2);
  if (!i.telefoon) fouten.telefoon = "leeg";
  else if (!isTelefoon(i.telefoon)) fouten.telefoon = "ongeldig";
  if (!i.tekentZelf) {
    if (!i.tekenaarNaam) fouten.tekenaarNaam = "leeg";
    else if (i.tekenaarNaam.length < 2) fouten.tekenaarNaam = "ongeldig";
  }
  return Object.keys(fouten).length === 0 ? { ok: true } : { ok: false, fouten };
}

/** De bewaarde aanvraag (in het organisatieprofiel, OrgProfileExtra.controle). */
export interface ControleAanvraag {
  /** wanneer de aanvraag binnenkwam (ISO) */
  op: string;
  land: string;
  kvkNumber: string | null;
  btwNummer: string | null;
  registratieNummer: string | null;
  bedrijfsnaam: string;
  contactNaam: string;
  contactFunctie: string;
  telefoon: string;
  /** wie de overeenkomst tekent; null = de contactpersoon zelf */
  tekenaarNaam: string | null;
  /** de gekozen reacties: ze blijven openstaan en worden bewaard tot het bedrijf is gecontroleerd */
  keuzes: { offerId: string; shiftId: string }[];
  /** wanneer het bedrijf bericht kreeg dat het kan inplannen (ISO), of null: zo gaat dat bericht maar één keer */
  gemeldOp: string | null;
}

/** Hoeveel gekozen reacties we bewaren (een rem tegen een volgelopen profiel). */
export const MAX_BEWAARDE_KEUZES = 50;

/** Voeg keuzes samen: geen dubbelen, de nieuwste achteraan, hoogstens MAX_BEWAARDE_KEUZES. */
export function voegKeuzesSamen(
  bestaand: readonly { offerId: string; shiftId: string }[],
  nieuw: readonly { offerId: string; shiftId: string }[],
): { offerId: string; shiftId: string }[] {
  const gezien = new Set<string>();
  const uit: { offerId: string; shiftId: string }[] = [];
  for (const k of [...bestaand, ...nieuw]) {
    if (!k.offerId || !k.shiftId || gezien.has(k.offerId)) continue;
    gezien.add(k.offerId);
    uit.push({ offerId: k.offerId, shiftId: k.shiftId });
  }
  return uit.slice(-MAX_BEWAARDE_KEUZES);
}

export function maakAanvraag(
  i: ControleInvoer,
  keuzes: readonly { offerId: string; shiftId: string }[],
  nu: Date,
  bestaand?: ControleAanvraag | null,
): ControleAanvraag {
  const nl = landSoort(i.land) === "NL";
  const eu = landSoort(i.land) === "EU";
  return {
    op: nu.toISOString(),
    land: normaliseerLand(i.land),
    kvkNumber: nl ? i.kvkNumber.replace(/\D/g, "") : null,
    btwNummer: eu ? i.btwNummer.replace(/\s/g, "").toUpperCase() : null,
    registratieNummer: !nl && !eu ? i.registratieNummer : null,
    bedrijfsnaam: i.bedrijfsnaam,
    contactNaam: i.contactNaam,
    contactFunctie: i.contactFunctie,
    telefoon: i.telefoon,
    tekenaarNaam: i.tekentZelf ? null : i.tekenaarNaam,
    keuzes: voegKeuzesSamen(bestaand?.keuzes ?? [], keuzes),
    gemeldOp: null,
  };
}

export type ControleStand = "open" | "aangevraagd" | "gecontroleerd";

/** Waar staat het bedrijf: nog niets gevraagd, aangevraagd (wacht op ZekerFlex) of gecontroleerd. */
export function controleStand(f: { gecontroleerd: boolean; aanvraag: ControleAanvraag | null | undefined }): ControleStand {
  if (f.gecontroleerd) return "gecontroleerd";
  return f.aanvraag ? "aangevraagd" : "open";
}

/** De bewaarde keuzes die nog bij een open reactie horen (een reactie die intussen is afgehandeld telt niet meer). */
export function openKeuzes(aanvraag: ControleAanvraag | null | undefined, openOfferIds: ReadonlySet<string>): string[] {
  return (aanvraag?.keuzes ?? []).map((k) => k.offerId).filter((id) => openOfferIds.has(id));
}
