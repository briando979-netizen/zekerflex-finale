// ---------------------------------------------------------------------------
// Staat een bedrijf dat een commissiepartner aanmeldt al in onze eigen verkoopmotor? (27 nov 2026)
// Het partnercontract sluit bedrijven uit die ZekerFlex al had, maar de code van de partnerkant kijkt alleen of een
// ÁNDERE partner het al aanmeldde (isAlGeregistreerd in lib/sales-partners/). Zonder deze vergelijking zou de eigenaar
// 154 leads uit zijn hoofd moeten kennen bij het koppelen, en een gemiste dubbele kost € 1 per gewerkt uur, zes maanden lang.
//
// Dit blokkeert NIETS en beslist NIETS: het levert alleen een waarschuwing, zodat de eigenaar met open ogen kiest.
// Puur bestand (geen prisma, geen kv): de server haalt de leads op en geeft ze hier door, de test doet hetzelfde.
// ---------------------------------------------------------------------------

import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { zakelijkDomein } from "@/lib/sales/vrije-maildomeinen";

/** Zo zeker weten we het. kvk = hetzelfde nummer, domein = hetzelfde e-maildomein, naam = alleen een vermoeden. */
export type MatchSoort = "kvk" | "domein" | "naam";

export interface LeadKort {
  id: string;
  companyName: string;
  kvkNumber: string | null;
  contactEmail: string | null;
  discoveredEmail: string | null;
  status: string;
  source: string;
  createdAt: Date;
}

export interface PartnerBedrijf {
  bedrijfsnaam: string;
  kvk: string | null;
  email: string | null;
}

export interface Overeenkomst {
  lead: LeadKort;
  soort: MatchSoort;
}

/** Alleen de acht cijfers; alles anders telt als "geen KVK-nummer". */
export function kvkCijfers(v: string | null | undefined): string | null {
  const cijfers = (v ?? "").replace(/\D/g, "");
  return cijfers.length === 8 ? cijfers : null;
}

/** Het zakelijke domein van een adres dat er ook niet hoeft te zijn; gratis diensten geven null (lib/sales/vrije-maildomeinen.ts). */
const domeinVan = (email: string | null | undefined): string | null => zakelijkDomein(email ?? "");

/**
 * Een bedrijfsnaam zo ver terugbrengen dat "Jansen B.V." en "Jansen BV" hetzelfde zijn, maar "Jansen Transport" niet.
 * Rechtsvormen en leestekens gaan eraf; de overgebleven woorden blijven staan.
 */
export function naamSleutel(naam: string): string {
  const RECHTSVORMEN = /\b(bv|b\.?v|nv|n\.?v|vof|v\.?o\.?f|cv|c\.?v|holding|beheer|groep|group|bedrijf|onderneming|eenmanszaak|stichting|vereniging)\b/g;
  // eerst de rechtsvormen weg, dán pas de leestekens: anders is "B.V." al "b v " en herkent `b\.?v` hem niet meer
  return naam
    .toLowerCase()
    .replace(RECHTSVORMEN, " ")
    .replace(/[.,'"`’&()\-\/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Een lead die niets meer oplevert telt niet als dubbel: die had ZekerFlex feitelijk niet meer. */
const AFGESLOTEN = new Set(["WON", "LOST", "DISQUALIFIED", "UNSUBSCRIBED"]);

/**
 * Welke van onze eigen leads lijken op dit aangemelde bedrijf? Hoogste zekerheid eerst (kvk, dan domein, dan naam),
 * elke lead hoogstens één keer. Leeg betekent: niets gevonden, geen waarschuwing tonen.
 */
export function alBekendeLeads(bedrijf: PartnerBedrijf, leads: readonly LeadKort[]): Overeenkomst[] {
  const kvk = kvkCijfers(bedrijf.kvk);
  const domein = domeinVan(bedrijf.email);
  const sleutel = naamSleutel(bedrijf.bedrijfsnaam);
  const gevonden = new Map<string, Overeenkomst>();
  const voegToe = (lead: LeadKort, soort: MatchSoort) => {
    if (AFGESLOTEN.has(lead.status) || gevonden.has(lead.id)) return;
    gevonden.set(lead.id, { lead, soort });
  };
  if (kvk) for (const l of leads) if (kvkCijfers(l.kvkNumber) === kvk) voegToe(l, "kvk");
  if (domein) {
    for (const l of leads) {
      if (domeinVan(l.contactEmail) === domein || domeinVan(l.discoveredEmail) === domein) voegToe(l, "domein");
    }
  }
  if (sleutel) for (const l of leads) if (naamSleutel(l.companyName) === sleutel) voegToe(l, "naam");
  return [...gevonden.values()];
}

/** Wat er bij de eigenaar op het scherm komt. Alleen een waarschuwing: hij koppelt of wijst af zoals altijd. */
export function waarschuwingTekst(o: Overeenkomst): string {
  // de server draait in UTC: een lead van 00:30 Amsterdamse tijd meldde anders de dag ervóór
  const datum = amsterdamDayKey(o.lead.createdAt);
  const hoe =
    o.soort === "kvk"
      ? "zelfde KVK-nummer"
      : o.soort === "domein"
        ? "zelfde e-maildomein"
        : "vrijwel dezelfde bedrijfsnaam";
  const zeker = o.soort === "naam" ? " Controleer dit zelf: een gelijke naam kan toeval zijn." : "";
  return `Let op: dit bedrijf staat al als eigen lead in de verkoopmotor (${hoe}), sinds ${datum}, bron ${o.lead.source}, status ${o.lead.status}.${zeker}`;
}
