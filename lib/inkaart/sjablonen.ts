import { RASTER_LENGTE, dagVan, deelVan, legeBezetting, leegBedrijf, type BedrijfInKaart, type PersoneelGroep, type Ruimte, type Soort } from "@/lib/inkaart/model";

// ---------------------------------------------------------------------------
// Voorbeeldsets per soort bedrijf (lib/inkaart/model.ts), in Nederlands en Engels: een snelle start. Ze vullen alleen de NAMEN en soorten in (welke
// ruimtes en welke groepen personeel bij zo'n bedrijf horen), met aantal 1 en zonder oppervlakte, bezetting of kosten: de aantallen en cijfers zijn
// van het bedrijf zelf en worden nooit geraden. Puur, zonder zod of opslag; ook de browser mag dit importeren.
// Machine-assisted translation (EN): native-speaker review recommended.
// ---------------------------------------------------------------------------

export type Taal = "nl" | "en";
type Tweetalig = { nl: string; en: string };

interface RuimteVoorbeeld {
  naam: Tweetalig;
  soort: Tweetalig;
  afdeling: Tweetalig;
}

interface Voorbeeld {
  naam: Tweetalig;
  groepen: Tweetalig[];
  ruimtes: RuimteVoorbeeld[];
  /** wanneer het bedrijf open is; zonder opgave de standaard (maandag tot en met vrijdag, ochtend en middag) */
  open?: "altijd" | "dag-en-avond" | "week-en-zaterdag";
}

const t = (nl: string, en: string): Tweetalig => ({ nl, en });
const r = (naam: Tweetalig, soort: Tweetalig, afdeling: Tweetalig): RuimteVoorbeeld => ({ naam, soort, afdeling });

const SPREEK = t("Spreekkamer", "Consulting room");
const BEHANDEL = t("Behandelkamer", "Treatment room");
const WACHT = t("Wachtruimte", "Waiting area");
const KANTOOR = t("Kantoor", "Office");
const VERGADER = t("Vergaderruimte", "Meeting room");

export const VOORBEELDEN: Record<Soort, Voorbeeld> = {
  ziekenhuis: {
    naam: t("Ziekenhuis of kliniek", "Hospital or clinic"),
    groepen: [t("Artsen", "Doctors"), t("Verpleegkundigen", "Nurses"), t("Paramedici", "Allied health professionals"), t("Ondersteuning en administratie", "Support and administration")],
    ruimtes: [
      r(SPREEK, SPREEK, t("Polikliniek", "Outpatient clinic")),
      r(BEHANDEL, BEHANDEL, t("Polikliniek", "Outpatient clinic")),
      r(WACHT, WACHT, t("Polikliniek", "Outpatient clinic")),
      r(t("Operatiekamer", "Operating theatre"), t("Operatiekamer", "Operating theatre"), t("OK", "Surgery")),
      r(t("Eenpersoonskamer", "Single room"), t("Verpleegkamer", "Ward room"), t("Verpleegafdeling", "Ward")),
      r(t("Meerpersoonskamer", "Shared room"), t("Verpleegkamer", "Ward room"), t("Verpleegafdeling", "Ward")),
      r(t("Kantoor en vergaderruimte", "Office and meeting room"), KANTOOR, t("Ondersteuning", "Support")),
    ],
    open: "altijd",
  },
  praktijk: {
    naam: t("Praktijk (huisarts, tandarts, fysio en dergelijke)", "Practice (GP, dentist, physio and similar)"),
    groepen: [t("Behandelaars", "Practitioners"), t("Assistenten", "Assistants"), t("Balie en administratie", "Reception and administration")],
    ruimtes: [
      r(SPREEK, SPREEK, t("Praktijk", "Practice")),
      r(BEHANDEL, BEHANDEL, t("Praktijk", "Practice")),
      r(t("Wachtkamer", "Waiting room"), WACHT, t("Praktijk", "Practice")),
      r(t("Balie", "Reception desk"), t("Balie", "Reception desk"), t("Praktijk", "Practice")),
      r(KANTOOR, KANTOOR, t("Praktijk", "Practice")),
    ],
  },
  kantoor: {
    naam: t("Kantoor", "Office"),
    groepen: [t("Medewerkers", "Employees"), t("Leidinggevenden", "Managers"), t("Ondersteuning", "Support")],
    ruimtes: [
      r(t("Werkplekken", "Workstations"), t("Werkplek", "Workstation"), KANTOOR),
      r(VERGADER, VERGADER, KANTOOR),
      r(t("Belruimte of stilteruimte", "Call room or quiet room"), t("Stilteruimte", "Quiet room"), KANTOOR),
      r(t("Pantry en lunchruimte", "Pantry and lunch room"), t("Pantry", "Pantry"), KANTOOR),
    ],
  },
  school: {
    naam: t("School of opleiding", "School or training"),
    groepen: [t("Docenten", "Teachers"), t("Onderwijsondersteuners", "Teaching assistants"), t("Directie en administratie", "Management and administration")],
    ruimtes: [
      r(t("Lokaal", "Classroom"), t("Lokaal", "Classroom"), t("Onderwijs", "Education")),
      r(t("Praktijkruimte", "Practical room"), t("Praktijkruimte", "Practical room"), t("Onderwijs", "Education")),
      r(t("Gymzaal", "Gym"), t("Gymzaal", "Gym"), t("Onderwijs", "Education")),
      r(t("Aula", "Assembly hall"), t("Aula", "Assembly hall"), t("Algemeen", "General")),
      r(t("Teamkamer", "Staff room"), t("Teamkamer", "Staff room"), t("Algemeen", "General")),
    ],
    open: "week-en-zaterdag",
  },
  horeca: {
    naam: t("Horeca", "Hospitality"),
    groepen: [t("Bediening", "Service"), t("Keuken", "Kitchen"), t("Leiding", "Management")],
    ruimtes: [
      r(t("Restaurant (tafels)", "Restaurant (tables)"), t("Restaurant", "Restaurant"), t("Zaal", "Dining room")),
      r(t("Bar", "Bar"), t("Bar", "Bar"), t("Zaal", "Dining room")),
      r(t("Terras", "Terrace"), t("Terras", "Terrace"), t("Zaal", "Dining room")),
      r(t("Keuken", "Kitchen"), t("Keuken", "Kitchen"), t("Achter", "Back of house")),
      r(t("Opslag", "Storage"), t("Opslag", "Storage"), t("Achter", "Back of house")),
    ],
    open: "dag-en-avond",
  },
  winkel: {
    naam: t("Winkel", "Shop"),
    groepen: [t("Verkoop", "Sales"), t("Magazijn", "Warehouse"), t("Leiding", "Management")],
    ruimtes: [
      r(t("Verkoopvloer", "Sales floor"), t("Verkoopvloer", "Sales floor"), t("Winkel", "Shop")),
      r(t("Magazijn", "Warehouse"), t("Magazijn", "Warehouse"), t("Achter", "Back of house")),
      r(t("Pashokjes", "Fitting rooms"), t("Pashokje", "Fitting room"), t("Winkel", "Shop")),
      r(KANTOOR, KANTOOR, t("Achter", "Back of house")),
    ],
    open: "week-en-zaterdag",
  },
  hotel: {
    naam: t("Hotel of verblijf", "Hotel or accommodation"),
    groepen: [t("Receptie", "Reception"), t("Housekeeping", "Housekeeping"), t("Horeca", "Food and beverage"), t("Leiding", "Management")],
    ruimtes: [
      r(t("Kamers", "Rooms"), t("Hotelkamer", "Hotel room"), t("Verblijf", "Accommodation")),
      r(t("Restaurant en ontbijtzaal", "Restaurant and breakfast room"), t("Restaurant", "Restaurant"), t("Horeca", "Food and beverage")),
      r(t("Vergaderzaal", "Conference room"), VERGADER, t("Zakelijk", "Business")),
      r(t("Receptie en lobby", "Reception and lobby"), t("Receptie", "Reception"), t("Verblijf", "Accommodation")),
    ],
    open: "altijd",
  },
  overig: { naam: t("Anders (leeg beginnen)", "Other (start empty)"), groepen: [], ruimtes: [] },
};

/** De naam van een soort bedrijf in de gekozen taal, voor het keuzeveld. */
export const soortNaam = (soort: Soort, taal: Taal): string => VOORBEELDEN[soort].naam[taal];

function openVoor(soort: Soort): boolean[] {
  const v = VOORBEELDEN[soort].open;
  if (v === "altijd") return Array.from({ length: RASTER_LENGTE }, () => true);
  if (v === "dag-en-avond") return Array.from({ length: RASTER_LENGTE }, (_, i) => deelVan(i) !== 0); // middag en avond, elke dag
  if (v === "week-en-zaterdag") return Array.from({ length: RASTER_LENGTE }, (_, i) => dagVan(i) < 6 && deelVan(i) < 2);
  return leegBedrijf().open;
}

/** De ruimtes en groepen van een voorbeeldset: alleen namen, met aantal 1 en niets ingevuld. */
export function voorbeeldRegels(soort: Soort, taal: Taal = "nl"): { groepen: PersoneelGroep[]; ruimtes: Ruimte[]; open: boolean[] } {
  const v = VOORBEELDEN[soort];
  return {
    groepen: v.groepen.map((naam, i): PersoneelGroep => ({ id: `g${i + 1}`, naam: naam[taal], fte: 0, kostenJaar: null })),
    ruimtes: v.ruimtes.map(
      (x, i): Ruimte => ({ id: `r${i + 1}`, naam: x.naam[taal], soort: x.soort[taal], aantal: 1, m2: null, plekken: null, afdeling: x.afdeling[taal], verdieping: "", bezetting: legeBezetting(), notitie: "" }),
    ),
    open: openVoor(soort),
  };
}

/** Een bedrijf met de voorbeeldset van `soort` (jaar en tijdstip van `nu`). */
export function bedrijfMetVoorbeeld(soort: Soort, nu: Date, taal: Taal = "nl"): BedrijfInKaart {
  const basis = leegBedrijf(soort, nu);
  const regels = voorbeeldRegels(soort, taal);
  return { ...basis, open: regels.open, groepen: regels.groepen, ruimtes: regels.ruimtes };
}
