import { dateNl } from "@/lib/admin/format";
import { kvkZoekLink } from "@/lib/rekentools/btw-check";

// ---------------------------------------------------------------------------
// KVK-controle met de hand (22 nov 2026, besluit van de eigenaar: "oke dan doen we handmatige"). Het tegoed bij KVKBase is
// op en aanvullen lukt niet. De eigenaar zoekt een KVK-nummer zelf op kvk.nl/zoeken (gratis) en keurt het in Beheer goed,
// voor een bedrijf en voor een werker (zzp'er) die op een controle wacht (lib/kvk/tegoed-opslag.ts, "kvk-wacht").
//
// Dit bestand is puur (geen prisma of kv; de browser mag het laden): de invoer controleren, beslissen of dit mag, het
// vastleggen en de auditregel bouwen. Het schrijven zelf staat in lib/kvk/handmatig-server.ts. Het slaat KVKBase en de
// open dataset van KVK helemaal over: de geldigheid komt op waar zonder een aanroep naar buiten, en de beheerder, de datum,
// het nummer en zijn reden blijven vastgelegd, zodat een goedkeuring met de hand te onderscheiden is van een controle
// via KVKBase. Een bedrijf of werker merkt er zelf niets van.
// ---------------------------------------------------------------------------

/** Sleutel in de KV: `kvk-handmatig:<soort>:<id>` (id = userId bij een werker, tenantId bij een bedrijf). */
export const KVK_HANDMATIG_PREFIX = "kvk-handmatig:";

export type KvkSoort = "werker" | "bedrijf";
export type KvkActie = "goedkeuren" | "terugdraaien";

export const MIN_REDEN = 5;
export const MAX_REDEN = 500;
export const MAX_NAAM = 120;

export interface KvkBeheerder {
  id: string;
  naam: string;
}

export interface KvkTerugdraaiing {
  door: KvkBeheerder;
  /** ISO */
  op: string;
  reden: string;
}

/** Wat de beheerder vastlegde bij een goedkeuring met de hand. Interne beheergegevens: nooit naar de werker of het bedrijf. */
export interface KvkHandmatig {
  kvkNumber: string;
  /** de naam zoals de beheerder hem op kvk.nl zag (vrije tekst) */
  naam: string;
  /** de reden van de beheerder, bijvoorbeeld wat hij op kvk.nl zag */
  notitie: string;
  door: KvkBeheerder;
  /** ISO; ook het tijdstip waarop de geldigheid op waar kwam (kvkVerifiedAt bij een werker) */
  op: string;
  teruggedraaid?: KvkTerugdraaiing;
}

const SOORT_NAAM: Record<KvkSoort, string> = { werker: "werker", bedrijf: "bedrijf" };

/** Staat er een goedkeuring met de hand die niet is teruggedraaid? */
export function isActief(h: KvkHandmatig | null | undefined): h is KvkHandmatig {
  return Boolean(h && !h.teruggedraaid);
}

/** "12 345 678", "12.345.678" en "12345678" → "12345678"; alles wat geen 8 cijfers is (of alleen nullen) → null. */
export function normaliseerKvkNummer(invoer: unknown): string | null {
  if (typeof invoer !== "string") return null;
  const s = invoer.replace(/[\s.-]/g, "");
  return /^\d{8}$/.test(s) && !/^0{8}$/.test(s) ? s : null;
}

/** De link naar het gratis zoeken op kvk.nl, met het nummer alvast ingevuld (dezelfde vorm als de btw-check, lib/rekentools/btw-check.ts). */
export function kvkNlLink(nummer: string | null | undefined): string {
  const n = normaliseerKvkNummer(nummer ?? "");
  return n ? kvkZoekLink(n) : "https://www.kvk.nl/zoeken/";
}

const schoon = (v: unknown): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

export type KvkVeld = "kvkNumber" | "naam" | "notitie" | "bevestigd";
export type Controle<T> = { ok: true; waarde: T } | { ok: false; veld: KvkVeld; fout: string };

function controleerReden(v: unknown, veld: "notitie"): Controle<string> {
  const t = schoon(v);
  if (t.length < MIN_REDEN) return { ok: false, veld, fout: `Vul een reden in van minimaal ${MIN_REDEN} tekens, bijvoorbeeld wat je op kvk.nl zag.` };
  if (t.length > MAX_REDEN) return { ok: false, veld, fout: `De reden is te lang (hoogstens ${MAX_REDEN} tekens).` };
  return { ok: true, waarde: t };
}

/** De invoer van een goedkeuring: nummer (8 cijfers), naam, reden en de bevestiging dat de beheerder het op kvk.nl zag. */
export function controleerGoedkeuring(invoer: {
  kvkNumber?: unknown;
  naam?: unknown;
  notitie?: unknown;
  bevestigd?: unknown;
}): Controle<{ kvkNumber: string; naam: string; notitie: string }> {
  const kvkNumber = normaliseerKvkNummer(invoer.kvkNumber);
  if (!kvkNumber) return { ok: false, veld: "kvkNumber", fout: "Vul het KVK-nummer in zoals je het op kvk.nl zag: 8 cijfers." };
  const naam = schoon(invoer.naam);
  if (naam.length < 2) return { ok: false, veld: "naam", fout: "Vul de bedrijfsnaam in zoals die op kvk.nl staat." };
  if (naam.length > MAX_NAAM) return { ok: false, veld: "naam", fout: `De naam is te lang (hoogstens ${MAX_NAAM} tekens).` };
  const notitie = controleerReden(invoer.notitie, "notitie");
  if (!notitie.ok) return notitie;
  if (invoer.bevestigd !== true) {
    return { ok: false, veld: "bevestigd", fout: "Vink aan dat je op kvk.nl hebt gezien dat de inschrijving bestaat en actief is." };
  }
  return { ok: true, waarde: { kvkNumber, naam, notitie: notitie.waarde } };
}

/** De reden bij het terugdraaien: verplicht, minimaal 5 tekens. */
export function controleerTerugdraaien(reden: unknown): Controle<{ reden: string }> {
  const r = controleerReden(reden, "notitie");
  return r.ok ? { ok: true, waarde: { reden: r.waarde } } : r;
}

export interface KeuringContext {
  /** de rollen van de beheerder (principal.grants) */
  rollen: readonly string[];
  soort: KvkSoort;
  actie: KvkActie;
  /** het nummer dat de werker of het bedrijf zelf opgaf (profiel, bedrijf of de wacht); null = geen */
  bekendNummer: string | null;
  /** het nummer dat de beheerder invult (alleen bij goedkeuren) */
  invoerNummer?: string;
  /** er is al een geldige KVK-controle: kvkValid bij een werker, een gekoppelde inschrijving bij een bedrijf */
  alGeldig: boolean;
  /** wat er nu vastligt over een goedkeuring met de hand (ook een teruggedraaide) */
  handmatig: KvkHandmatig | null;
}

export type Beslissing =
  | { ok: true }
  | { ok: false; status: 409 | 422 | 423; code: "ALLEEN_PLATFORMBEHEER" | "AL_GEDAAN" | "GEEN_NUMMER" | "NUMMER_KOMT_NIET_OVEREEN" | "NIET_HANDMATIG"; bericht: string };

/**
 * Mag deze beheerder dit nu doen? Alleen een platformbeheerder (423, geen 403: CrowdSec telt een reeks 403's als inbraakpoging),
 * en alleen als de stand het toelaat. Een goedkeuring met de hand heeft dezelfde regel als de automatische controle: het nummer
 * dat de werker of het bedrijf opgaf is het nummer dat gecontroleerd wordt.
 */
export function beslisKeuring(c: KeuringContext): Beslissing {
  if (!c.rollen.includes("PLATFORM_ADMIN")) {
    return { ok: false, status: 423, code: "ALLEEN_PLATFORMBEHEER", bericht: "Alleen een platformbeheerder kan een KVK-controle met de hand goedkeuren of terugdraaien." };
  }
  if (c.actie === "terugdraaien") {
    return isActief(c.handmatig)
      ? { ok: true }
      : { ok: false, status: 409, code: "NIET_HANDMATIG", bericht: "Hier is niets met de hand goedgekeurd, dus er valt niets terug te draaien." };
  }
  if (c.alGeldig) {
    return isActief(c.handmatig)
      ? { ok: false, status: 409, code: "AL_GEDAAN", bericht: "Dit is al met de hand goedgekeurd. Draai het eerst terug als je iets wilt aanpassen." }
      : { ok: false, status: 409, code: "AL_GEDAAN", bericht: "De KVK-controle is hier al geslaagd; er hoeft niets met de hand." };
  }
  const wie = c.soort === "werker" ? "Deze werker" : "Dit bedrijf";
  if (c.soort === "werker" && !c.bekendNummer) {
    return { ok: false, status: 422, code: "GEEN_NUMMER", bericht: `${wie} heeft nog geen KVK-nummer van 8 cijfers ingevuld. Laat het eerst invullen.` };
  }
  if (c.bekendNummer && c.invoerNummer && c.bekendNummer !== c.invoerNummer) {
    return {
      ok: false,
      status: 422,
      code: "NUMMER_KOMT_NIET_OVEREEN",
      bericht: `${wie} gaf KVK-nummer ${c.bekendNummer} op, niet ${c.invoerNummer}. Controleer dat nummer op kvk.nl, of laat het opgegeven nummer eerst verbeteren.`,
    };
  }
  return { ok: true };
}

export function maakHandmatig(i: { kvkNumber: string; naam: string; notitie: string; door: KvkBeheerder; nu: Date }): KvkHandmatig {
  return { kvkNumber: i.kvkNumber, naam: i.naam, notitie: i.notitie, door: i.door, op: i.nu.toISOString() };
}

/** De goedkeuring terugdraaien: dezelfde gegevens, plus wie het terugdraaide, wanneer en waarom. */
export function draaiTerug(h: KvkHandmatig, i: { door: KvkBeheerder; reden: string; nu: Date }): KvkHandmatig {
  return { ...h, teruggedraaid: { door: i.door, op: i.nu.toISOString(), reden: i.reden } };
}

export interface AuditGegevens {
  action: string;
  summary: string;
  severity: "warning" | "info";
  metadata: Record<string, unknown>;
}

/**
 * De auditregel van een goedkeuring. Geen namen in de samenvatting (de hashketen is niet te wissen): het KVK-nummer is
 * openbaar, de beheerder staat in actorUserId. De reden staat in de metadata, niet in de samenvatting.
 */
export function auditGoedkeuring(i: { soort: KvkSoort; kvkNumber: string; notitie: string }): AuditGegevens {
  return {
    action: "kvk.handmatig_goedgekeurd",
    summary: `KVK-nummer ${i.kvkNumber} van een ${SOORT_NAAM[i.soort]} met de hand goedgekeurd (gecontroleerd op kvk.nl)`,
    severity: "warning",
    metadata: { soort: i.soort, kvkNumber: i.kvkNumber, reden: i.notitie, bron: "kvk.nl" },
  };
}

/** De auditregel van het terugdraaien; `geldigheidBlijft`: de controle was intussen opnieuw gedaan, dus de geldigheid bleef staan. */
export function auditTerugdraaien(i: { soort: KvkSoort; kvkNumber: string; reden: string; geldigheidBlijft: boolean }): AuditGegevens {
  return {
    action: "kvk.handmatig_teruggedraaid",
    summary: `Goedkeuring met de hand van KVK-nummer ${i.kvkNumber} (${SOORT_NAAM[i.soort]}) teruggedraaid`,
    severity: "warning",
    metadata: { soort: i.soort, kvkNumber: i.kvkNumber, reden: i.reden, geldigheidBlijft: i.geldigheidBlijft },
  };
}

/** "Handmatig gecontroleerd door Anna op 22 nov. 2026": zo staat het in Beheer, naast een controle via KVKBase. */
export function handmatigRegel(h: KvkHandmatig): string {
  return `Handmatig gecontroleerd door ${h.door.naam} op ${dateNl(h.op)}`;
}

/** "Teruggedraaid door Anna op 22 nov. 2026: reden". */
export function terugdraaiRegel(t: KvkTerugdraaiing): string {
  return `Teruggedraaid door ${t.door.naam} op ${dateNl(t.op)}: ${t.reden}`;
}

export type PaneelStand = "handmatig" | "automatisch" | "open";

/**
 * Wat het paneel "KVK-controle" in Beheer toont: met de hand gecontroleerd (alleen als het nummer nog hetzelfde is en de
 * geldigheid er echt staat), geslaagd via de automatische controle, of nog open.
 */
export function paneelStand(i: { geldig: boolean; handmatig: KvkHandmatig | null; huidigNummer: string | null }): PaneelStand {
  if (!i.geldig) return "open";
  return isActief(i.handmatig) && (!i.huidigNummer || i.handmatig.kvkNumber === i.huidigNummer) ? "handmatig" : "automatisch";
}

export type WachtStand = "wacht" | "opgegeven" | "nieuw";

/** Waar staat de automatische controle van dit nummer? Voor de lijst "KVK-wacht". */
export function standVanWacht(i: { inWacht: boolean; opgegevenNummer: string | null; nummer: string }): { stand: WachtStand; label: string; tone: "warn" | "crit" | "neutral" } {
  if (i.opgegevenNummer === i.nummer) return { stand: "opgegeven", label: "Niet gevonden bij de automatische controle", tone: "crit" };
  if (i.inWacht) return { stand: "wacht", label: "Wacht op de automatische controle", tone: "warn" };
  return { stand: "nieuw", label: "Nog niet in de wacht gezet", tone: "neutral" };
}
