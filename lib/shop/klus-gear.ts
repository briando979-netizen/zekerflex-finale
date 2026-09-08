import { shiftCategory, type ShiftCategoryKey } from "@/lib/shifts/category";

// ---------------------------------------------------------------------------
// "Dit heb je nodig voor deze klus" — koppelt het werktype van een klus aan
// werkkleding/PBM uit de webshop. Geen DB-koppeling: een statische mapping op
// productslug (zie migratie 20260904090000_shop_workgear). De klusdetailpagina
// haalt de bijbehorende, nog actieve producten op en toont ze.
// ---------------------------------------------------------------------------

export interface GearHint {
  slug: string;
  reason: string;
  /** true = doorgaans verplicht door de opdrachtgever / arbo */
  required?: boolean;
}

const GEAR: Record<ShiftCategoryKey, GearHint[]> = {
  logistiek: [
    { slug: "veiligheidsschoenen-s3", reason: "Verplicht in het magazijn — bescherming tegen vallende dozen en heftrucks.", required: true },
    { slug: "veiligheidshesje", reason: "Zichtbaar blijven tussen heftrucks en transportbanden.", required: true },
    { slug: "werkhandschoenen-grip", reason: "Grip en minder blaren bij tillen en inpakken." },
    { slug: "softshell-werkjas", reason: "Koele magazijnen en laaddocks." },
    { slug: "vca-basis-boek", reason: "Handig als de opdrachtgever een VCA-diploma vraagt." },
  ],
  bouw: [
    { slug: "veiligheidshelm", reason: "Verplicht op vrijwel elke bouwplaats.", required: true },
    { slug: "veiligheidsschoenen-s3", reason: "Stalen neus en doortreedbescherming.", required: true },
    { slug: "veiligheidsbril-helder", reason: "Stof, spatten en slijpwerk." },
    { slug: "gehoorbescherming-oordoppen", reason: "Machines en gereedschap boven 80 dB." },
    { slug: "werkbroek-kniezakken", reason: "Verstevigde knieën, ruimte voor kniebeschermers." },
    { slug: "vca-basis-boek", reason: "VCA is op de bouw bijna altijd vereist.", required: true },
  ],
  horeca: [
    { slug: "antislip-werkschoenen-ob", reason: "Vette, natte keukenvloeren — SRC antislip.", required: true },
    { slug: "snijbestendige-handschoenen", reason: "Snijwerk, glas en afwas." },
    { slug: "werk-tshirt-2pack", reason: "Warme keuken, lange diensten." },
  ],
  schoonmaak: [
    { slug: "kniebeschermers", reason: "Vloeren, sanitair en laag werk." },
    { slug: "werkhandschoenen-grip", reason: "Reinigingsmiddelen en vuil werk." },
    { slug: "antislip-werkschoenen-ob", reason: "Natte vloeren." },
  ],
  evenement: [
    { slug: "veiligheidshesje", reason: "Herkenbaar als crew, zichtbaar in het donker.", required: true },
    { slug: "gehoorbescherming-oordoppen", reason: "Podia en geluidsinstallaties." },
    { slug: "veiligheidssneakers-s1p", reason: "Lang staan en lopen, lichte bescherming." },
  ],
  retail: [
    { slug: "veiligheidssneakers-s1p", reason: "Lange sta-diensten, comfortabel én beschermend." },
    { slug: "werkhandschoenen-grip", reason: "Vakken vullen en pallets." },
  ],
  zorg: [
    { slug: "antislip-werkschoenen-ob", reason: "Gladde vloeren op de afdeling." },
  ],
  kantoor: [],
  algemeen: [
    { slug: "veiligheidssneakers-s1p", reason: "Prettig bij een dienst waar je veel op de been bent." },
  ],
};

export function gearForShift(title: string, skill: string | null): GearHint[] {
  const key = shiftCategory(title, skill).key;
  return GEAR[key] ?? [];
}
