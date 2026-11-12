// ---------------------------------------------------------------------------
// Boekhouding: gedeelde namen en vormen (puur, zonder prisma). De waarden zijn gelijk aan de enums in
// prisma/schema.prisma (BoekBron, BoekDagboek, BoekAdministratieSoort); hier als gewone teksten, zodat deze
// bestanden zonder database te testen zijn.
// ---------------------------------------------------------------------------

export const BOEK_BRONNEN = [
  "FACTUUR",
  "FACTUUR_BETALING",
  "BON",
  "BANK",
  "MEMORIAAL",
  "OPENING",
  "TEGENBOEKING",
] as const;
export type BoekBronNaam = (typeof BOEK_BRONNEN)[number];

export const BOEK_DAGBOEKEN = ["VERKOOP", "INKOOP", "BANK", "MEMORIAAL"] as const;
export type BoekDagboekNaam = (typeof BOEK_DAGBOEKEN)[number];

export const BOEK_SOORTEN = ["ECHT", "TEST"] as const;
export type BoekAdministratieSoortNaam = (typeof BOEK_SOORTEN)[number];

/** Een regel van een boeking zoals de aanroeper hem aanlevert: precies een van debet/credit is groter dan 0 (in centen). */
export interface RegelInvoer {
  rekeningId: string;
  debetCents?: number | undefined;
  creditCents?: number | undefined;
  /** alleen nummers, geen persoonsgegevens */
  omschrijving?: string | undefined;
  btwCodeId?: string | undefined;
  /** op een omzet-/kostenregel de grondslag (positief); op de btw-regel zelf isBtwRegel */
  btwBasisCents?: number | undefined;
  isBtwRegel?: boolean | undefined;
  /** open post, bv. "factuur:<invoiceId>": dezelfde sleutel op de debiteurregel en de betaalregel */
  postSleutel?: string | undefined;
  /** vreemde valuta, alleen informatief */
  origineleValuta?: string | undefined;
  origineelCents?: number | undefined;
  koersMicro?: number | undefined;
}

export interface BoekInvoer {
  administratieId: string;
  dagboek: BoekDagboekNaam;
  /** de Amsterdamse boekdag, "2026-04-10" (lib/time/amsterdam: amsterdamDayKey) */
  datum: string;
  bron: BoekBronNaam;
  /** idempotentiesleutel samen met bron en administratie; nooit leeg */
  bronId: string;
  /** opgebouwd uit nummers: omschrijvingVoor(bron, nummer) */
  omschrijving: string;
  /** valuta van de regelbedragen; moet gelijk zijn aan de functionele valuta van de administratie */
  valuta: string;
  regels: RegelInvoer[];
  /** verplicht bij MEMORIAAL en TEGENBOEKING; geen persoonsgegevens */
  reden?: string | undefined;
  bronHash?: string | undefined;
  /** userId of "systeem" (standaard) */
  aangemaaktDoor?: string | undefined;
  /** alleen voor keerOm(): de boeking die hiermee wordt opgeheven */
  keertBoekingId?: string | undefined;
}

export interface BoekResultaat {
  boekingId: string;
  boekstuk: string;
  /** false = deze boeking bestond al (idempotent): er is niets nieuws geschreven */
  nieuw: boolean;
}
