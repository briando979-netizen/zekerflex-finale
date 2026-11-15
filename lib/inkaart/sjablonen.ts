import { RASTER_LENGTE, legeBezetting, leegBedrijf, type BedrijfInKaart, type PersoneelGroep, type Ruimte, type Soort } from "@/lib/inkaart/model";

// ---------------------------------------------------------------------------
// Voorbeeldsets per soort bedrijf (lib/inkaart/model.ts): een snelle start. Ze vullen alleen de NAMEN en soorten in (welke ruimtes en welke
// groepen personeel bij zo'n bedrijf horen), met aantal 1 en zonder oppervlakte, bezetting of kosten: de aantallen en cijfers zijn van het
// bedrijf zelf en worden nooit geraden. Puur, zonder zod of opslag; ook de browser mag dit importeren.
// ---------------------------------------------------------------------------

interface RuimteVoorbeeld {
  naam: string;
  soort: string;
  afdeling: string;
}

interface Voorbeeld {
  naam: string;
  groepen: string[];
  ruimtes: RuimteVoorbeeld[];
  /** wanneer het bedrijf open is; zonder opgave de standaard (maandag tot en met vrijdag, ochtend en middag) */
  open?: "altijd" | "dag-en-avond" | "week-en-zaterdag";
}

export const VOORBEELDEN: Record<Soort, Voorbeeld> = {
  ziekenhuis: {
    naam: "Ziekenhuis of kliniek",
    groepen: ["Artsen", "Verpleegkundigen", "Paramedici", "Ondersteuning en administratie"],
    ruimtes: [
      { naam: "Spreekkamer", soort: "Spreekkamer", afdeling: "Polikliniek" },
      { naam: "Behandelkamer", soort: "Behandelkamer", afdeling: "Polikliniek" },
      { naam: "Wachtruimte", soort: "Wachtruimte", afdeling: "Polikliniek" },
      { naam: "Operatiekamer", soort: "Operatiekamer", afdeling: "OK" },
      { naam: "Eenpersoonskamer", soort: "Verpleegkamer", afdeling: "Verpleegafdeling" },
      { naam: "Meerpersoonskamer", soort: "Verpleegkamer", afdeling: "Verpleegafdeling" },
      { naam: "Kantoor en vergaderruimte", soort: "Kantoor", afdeling: "Ondersteuning" },
    ],
    open: "altijd",
  },
  praktijk: {
    naam: "Praktijk (huisarts, tandarts, fysio en dergelijke)",
    groepen: ["Behandelaars", "Assistenten", "Balie en administratie"],
    ruimtes: [
      { naam: "Spreekkamer", soort: "Spreekkamer", afdeling: "Praktijk" },
      { naam: "Behandelkamer", soort: "Behandelkamer", afdeling: "Praktijk" },
      { naam: "Wachtkamer", soort: "Wachtruimte", afdeling: "Praktijk" },
      { naam: "Balie", soort: "Balie", afdeling: "Praktijk" },
      { naam: "Kantoor", soort: "Kantoor", afdeling: "Praktijk" },
    ],
  },
  kantoor: {
    naam: "Kantoor",
    groepen: ["Medewerkers", "Leidinggevenden", "Ondersteuning"],
    ruimtes: [
      { naam: "Werkplekken", soort: "Werkplek", afdeling: "Kantoor" },
      { naam: "Vergaderruimte", soort: "Vergaderruimte", afdeling: "Kantoor" },
      { naam: "Belruimte of stilteruimte", soort: "Stilteruimte", afdeling: "Kantoor" },
      { naam: "Pantry en lunchruimte", soort: "Pantry", afdeling: "Kantoor" },
    ],
  },
  school: {
    naam: "School of opleiding",
    groepen: ["Docenten", "Onderwijsondersteuners", "Directie en administratie"],
    ruimtes: [
      { naam: "Lokaal", soort: "Lokaal", afdeling: "Onderwijs" },
      { naam: "Praktijkruimte", soort: "Praktijkruimte", afdeling: "Onderwijs" },
      { naam: "Gymzaal", soort: "Gymzaal", afdeling: "Onderwijs" },
      { naam: "Aula", soort: "Aula", afdeling: "Algemeen" },
      { naam: "Teamkamer", soort: "Teamkamer", afdeling: "Algemeen" },
    ],
    open: "week-en-zaterdag",
  },
  horeca: {
    naam: "Horeca",
    groepen: ["Bediening", "Keuken", "Leiding"],
    ruimtes: [
      { naam: "Restaurant (tafels)", soort: "Restaurant", afdeling: "Zaal" },
      { naam: "Bar", soort: "Bar", afdeling: "Zaal" },
      { naam: "Terras", soort: "Terras", afdeling: "Zaal" },
      { naam: "Keuken", soort: "Keuken", afdeling: "Achter" },
      { naam: "Opslag", soort: "Opslag", afdeling: "Achter" },
    ],
    open: "dag-en-avond",
  },
  winkel: {
    naam: "Winkel",
    groepen: ["Verkoop", "Magazijn", "Leiding"],
    ruimtes: [
      { naam: "Verkoopvloer", soort: "Verkoopvloer", afdeling: "Winkel" },
      { naam: "Magazijn", soort: "Magazijn", afdeling: "Achter" },
      { naam: "Pashokjes", soort: "Pashokje", afdeling: "Winkel" },
      { naam: "Kantoor", soort: "Kantoor", afdeling: "Achter" },
    ],
    open: "week-en-zaterdag",
  },
  hotel: {
    naam: "Hotel of verblijf",
    groepen: ["Receptie", "Housekeeping", "Horeca", "Leiding"],
    ruimtes: [
      { naam: "Kamers", soort: "Hotelkamer", afdeling: "Verblijf" },
      { naam: "Restaurant en ontbijtzaal", soort: "Restaurant", afdeling: "Horeca" },
      { naam: "Vergaderzaal", soort: "Vergaderruimte", afdeling: "Zakelijk" },
      { naam: "Receptie en lobby", soort: "Receptie", afdeling: "Verblijf" },
    ],
    open: "altijd",
  },
  overig: { naam: "Anders (leeg beginnen)", groepen: [], ruimtes: [] },
};

function openVoor(soort: Soort): boolean[] {
  const v = VOORBEELDEN[soort].open;
  const basis = leegBedrijf().open;
  if (v === "altijd") return Array.from({ length: RASTER_LENGTE }, () => true);
  if (v === "dag-en-avond") return Array.from({ length: RASTER_LENGTE }, (_, i) => i % 3 !== 0); // middag en avond, elke dag
  if (v === "week-en-zaterdag") return Array.from({ length: RASTER_LENGTE }, (_, i) => Math.floor(i / 3) < 6 && i % 3 < 2);
  return basis;
}

/** De ruimtes en groepen van een voorbeeldset: alleen namen, met aantal 1 en niets ingevuld. */
export function voorbeeldRegels(soort: Soort): { groepen: PersoneelGroep[]; ruimtes: Ruimte[]; open: boolean[] } {
  const v = VOORBEELDEN[soort];
  return {
    groepen: v.groepen.map((naam, i): PersoneelGroep => ({ id: `g${i + 1}`, naam, fte: 0, kostenJaar: null })),
    ruimtes: v.ruimtes.map(
      (r, i): Ruimte => ({ id: `r${i + 1}`, naam: r.naam, soort: r.soort, aantal: 1, m2: null, plekken: null, afdeling: r.afdeling, verdieping: "", bezetting: legeBezetting(), notitie: "" }),
    ),
    open: openVoor(soort),
  };
}

/** Een bedrijf met de voorbeeldset van `soort` (jaar en tijdstip van `nu`). */
export function bedrijfMetVoorbeeld(soort: Soort, nu: Date): BedrijfInKaart {
  const basis = leegBedrijf(soort, nu);
  const regels = voorbeeldRegels(soort);
  return { ...basis, open: regels.open, groepen: regels.groepen, ruimtes: regels.ruimtes };
}
