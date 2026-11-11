// ---------------------------------------------------------------------------
// De branchemotor (11 nov 2026, eigenaar: "bewijs dat alle branches hun eigen modules en dashboards kunnen
// krijgen, aan elkaar gekoppeld, en bouw het"). Eén lijst met modules en een lijst met branches die ze kiezen:
// een nieuwe branche is een stuk configuratie, een nieuwe module verschijnt vanzelf in elke branche die hem nodig
// heeft. Puur (geen prisma, kv of React): de beheerpagina, het dashboard van een bedrijf en de tests gebruiken het.
//
// Eerlijk over de stand: een module is "klaar" als er een echte pagina is waar het bedrijf mee werkt, en dat controleert
// tests/branches.test.ts tegen de bestanden in app/. Alles anders is "gepland": nog niet gebouwd, en dat zegt het ook.
// ---------------------------------------------------------------------------

export type ModuleStatus = "klaar" | "gepland";

export type ModuleGroep = "personeel" | "geld" | "online" | "plek" | "klanten" | "branche";

export const GROEP_NAAM: Record<ModuleGroep, string> = {
  personeel: "Personeel",
  geld: "Geld en administratie",
  online: "Online gevonden worden",
  plek: "De plek zelf",
  klanten: "Klanten en contact",
  branche: "Voor jouw soort bedrijf",
};

export interface BrancheModule {
  sleutel: string;
  naam: string;
  /** één zin in gewoon Nederlands: wat het bedrijf ermee doet */
  wat: string;
  groep: ModuleGroep;
  status: ModuleStatus;
  /** de pagina waar het bedrijf ermee werkt; alleen bij "klaar" */
  href: string | null;
}

const klaar = (sleutel: string, groep: ModuleGroep, naam: string, wat: string, href: string): BrancheModule => ({ sleutel, groep, naam, wat, status: "klaar", href });
const gepland = (sleutel: string, groep: ModuleGroep, naam: string, wat: string): BrancheModule => ({ sleutel, groep, naam, wat, status: "gepland", href: null });

export const MODULES: readonly BrancheModule[] = [
  // personeel
  klaar("flexwerk", "personeel", "Flexwerkers inhuren", "Een klus plaatsen, werkers vinden en aannemen.", "/werkgever/diensten"),
  klaar("rooster", "personeel", "Rooster en planner", "Diensten inplannen en een week vullen.", "/werkgever/planner"),
  klaar("inchecken", "personeel", "Inchecken op locatie", "Met QR, NFC of telefoon; je ziet wie er is.", "/werkgever/inchecken"),
  klaar("uren", "personeel", "Uren goedkeuren", "De uren van je mensen nakijken en goedkeuren.", "/werkgever/uren"),
  klaar("certificaten", "personeel", "Certificaten en documenten", "Diploma's en bewijzen van je mensen, en wat er verloopt.", "/werkgever/compliance"),
  // geld
  klaar("facturen", "geld", "Facturen", "Facturen en betalingen op één plek.", "/werkgever/facturen"),
  klaar("rapportages", "geld", "Rapportages", "Cijfers over uren, kosten en klussen.", "/werkgever/rapportages"),
  // online
  klaar("website", "online", "Website", "Je website ontwerpen en online zetten.", "/studio/website"),
  klaar("webshop", "online", "Webshop", "Producten verkopen, verzenden en betalen.", "/studio/webshop"),
  klaar("kaart", "online", "Op de kaart", "Gratis vermeld op ZekerFlex Kaart, met adres, openingstijden en website.", "/werkgever/kaart"),
  klaar("reviews", "online", "Reviews verzamelen", "Klanten om een Google-review vragen met een eigen link.", "/werkgever/google-reviews"),
  // plek
  klaar("netwerk", "plek", "Wifi, VPN en 5G", "Netwerk voor je vestiging, personeel en terrein.", "/werkgever/netwerk"),
  klaar("op-locatie", "plek", "Op locatie", "Portofoon, toegang op kenteken, sleutelkluis en badges printen.", "/werkgever/op-locatie"),
  klaar("telefonie", "plek", "Nummer en bellen", "Een eigen nummer met opties voor klanten en personeel.", "/werkgever/telefonie"),
  // klanten
  klaar("berichten", "klanten", "Berichten", "Chat met klanten en werkers, ook bellen.", "/werkgever/berichten"),
  // klaar, voor één soort bedrijf
  klaar("horeca-beheer", "branche", "Horeca-beheer", "Reserveringen, menukaart, bestellen met QR, kassa, keukenscherm en takenlijsten.", "/werkgever/horeca"),
  klaar("rijschool-beheer", "branche", "Rijschool-beheer", "Lesagenda, leerlingen, betalingen, pakketten, instructeurs en je eigen app.", "/werkgever/rijschool"),
  klaar("kassa-winkel", "branche", "Kassa in de winkel", "Contant of pin afrekenen; een verkoop aan de balie is dezelfde bestelling als online.", "/studio/webshop"),
  // gepland
  gepland("afspraken", "klanten", "Afspraken boeken", "Klanten boeken online een tijd bij een medewerker; jij ziet de agenda per persoon."),
  gepland("klantenkaart", "klanten", "Klantenkaart", "Per klant de geschiedenis, notities en een herinnering vooraf."),
  gepland("offertes", "geld", "Offertes", "Een offerte maken, versturen en na akkoord omzetten in een opdracht."),
  gepland("voorraad", "plek", "Voorraad", "Wat er ligt, wat bijna op is, en bestellen bij de leverancier."),
  gepland("werkbonnen", "branche", "Werkbonnen en opdrachten", "Een opdracht met adres, planning, foto's, handtekening en uren, die een factuur wordt."),
  gepland("checklists", "branche", "Checklists en rondes", "Vaste taken per locatie of ronde, met bewijs dat ze gedaan zijn."),
  gepland("lidmaatschappen", "branche", "Lidmaatschappen", "Abonnementen en strippenkaarten van je klanten, met automatische incasso."),
  gepland("ritten", "branche", "Ritten en voertuigen", "Ritten plannen, voertuigen en chauffeurs koppelen, uren per rit."),
  gepland("kamers", "branche", "Kamers en verblijven", "Kamers, beschikbaarheid en boekingen op één kalender."),
  gepland("dossier", "branche", "Dossier", "Een beveiligd dossier per cliënt; zware regels, dus pas na de eerste branches."),
];

const PER_SLEUTEL = new Map(MODULES.map((m) => [m.sleutel, m]));
export const moduleVan = (sleutel: string): BrancheModule | undefined => PER_SLEUTEL.get(sleutel);

export interface Koppeling {
  id: string;
  van: string;
  naar: string;
  /** wat de koppeling voor het bedrijf doet, gewone zinnen */
  wat: string;
}

/**
 * Hoe de modules aan elkaar hangen. Alleen wat echt zo werkt, of (bij een gepland uiteinde) wat het ontwerp is.
 * Of een koppeling al werkt, volgt uit de status van beide kanten: zie koppelingWerkt().
 */
export const KOPPELINGEN: readonly Koppeling[] = [
  { id: "flexwerk-rooster", van: "flexwerk", naar: "rooster", wat: "Een aangenomen klus staat op het rooster." },
  { id: "rooster-inchecken", van: "rooster", naar: "inchecken", wat: "Wie op het rooster staat, checkt op de plek in." },
  { id: "inchecken-uren", van: "inchecken", naar: "uren", wat: "Een check-in wordt een urenstaat om goed te keuren." },
  { id: "uren-facturen", van: "uren", naar: "facturen", wat: "Goedgekeurde uren worden vanzelf een factuur." },
  { id: "certificaten-flexwerk", van: "certificaten", naar: "flexwerk", wat: "Bij het zoeken van werkers telt mee wie het juiste certificaat heeft." },
  { id: "horeca-flexwerk", van: "horeca-beheer", naar: "flexwerk", wat: "Personeel via ZekerFlex staat als onderdeel in je zaak." },
  { id: "horeca-kaart", van: "horeca-beheer", naar: "kaart", wat: "Een zaak met een openbare site staat als stip op de kaart." },
  { id: "rijschool-website", van: "rijschool-beheer", naar: "website", wat: "De site van de rijschool wordt in het beheer ingericht." },
  { id: "webshop-kassa", van: "webshop", naar: "kassa-winkel", wat: "Een verkoop aan de balie is dezelfde bestelling als een online bestelling." },
  // ontwerp: werkt zodra de gebouwde en geplande kant er allebei zijn
  { id: "afspraken-klantenkaart", van: "afspraken", naar: "klantenkaart", wat: "Elke afspraak komt op de kaart van de klant." },
  { id: "afspraken-berichten", van: "afspraken", naar: "berichten", wat: "Een herinnering of verzetten gaat via de chat." },
  { id: "offertes-werkbonnen", van: "offertes", naar: "werkbonnen", wat: "Een geaccepteerde offerte wordt een werkbon." },
  { id: "werkbonnen-uren", van: "werkbonnen", naar: "uren", wat: "De uren op een werkbon worden uren om goed te keuren." },
  { id: "werkbonnen-facturen", van: "werkbonnen", naar: "facturen", wat: "Een afgeronde werkbon wordt een factuur." },
  { id: "lidmaatschappen-facturen", van: "lidmaatschappen", naar: "facturen", wat: "Een abonnement van een klant wordt elke periode een factuur." },
  { id: "voorraad-webshop", van: "voorraad", naar: "webshop", wat: "Wat uitverkocht is, kan niet meer besteld worden." },
  { id: "ritten-uren", van: "ritten", naar: "uren", wat: "De tijd van een rit wordt het urenstaatje van de chauffeur." },
];

/** Een koppeling werkt pas als beide kanten klaar zijn. */
export function koppelingWerkt(k: Koppeling): boolean {
  return moduleVan(k.van)?.status === "klaar" && moduleVan(k.naar)?.status === "klaar";
}
