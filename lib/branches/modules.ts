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
  /** waarom een gepland onderdeel nog niet gebouwd wordt (bijvoorbeeld een juridische vraag): dan staat het onderaan de bouwvolgorde */
  blokkade?: string | undefined;
}

const klaar = (sleutel: string, groep: ModuleGroep, naam: string, wat: string, href: string): BrancheModule => ({ sleutel, groep, naam, wat, status: "klaar", href });
const gepland = (sleutel: string, groep: ModuleGroep, naam: string, wat: string, blokkade?: string): BrancheModule => ({ sleutel, groep, naam, wat, status: "gepland", href: null, ...(blokkade ? { blokkade } : {}) });

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
  // klaar sinds 11 nov: lib/afspraken (boekpagina /boeken/<adres>, agenda, klantenkaart)
  klaar("afspraken", "klanten", "Afspraken boeken", "Klanten boeken online een tijd bij een medewerker; jij ziet de agenda per persoon.", "/werkgever/afspraken"),
  klaar("klantenkaart", "klanten", "Klantenkaart", "Per klant de geschiedenis en je eigen notities, met de mogelijkheid een klant te wissen.", "/werkgever/klanten"),
  // klaar sinds 11 nov (gebouwd door een vloot agenten, elk met eigen tests en een schone controle): zie lib/voorraad, lib/werkbonnen, lib/offertes, lib/checklists
  klaar("offertes", "geld", "Offertes", "Een offerte maken, een link delen en de klant laten akkoord gaan of afwijzen; zonder e-mail, je stuurt de link zelf.", "/werkgever/offertes"),
  klaar("voorraad", "plek", "Voorraad", "Wat er ligt, wat bijna op is, een logboek van elke wijziging en een bestellijst per leverancier.", "/werkgever/voorraad"),
  klaar("werkbonnen", "branche", "Werkbonnen en opdrachten", "Een opdracht met klant, planning, uren en materialen, met een afdrukbare werkbon.", "/werkgever/werkbonnen"),
  klaar("checklists", "branche", "Checklists en rondes", "Vaste taken per locatie of ronde, door personeel zonder account in te vullen, met een overzicht van wat gemist is.", "/werkgever/checklists"),
  gepland("lidmaatschappen", "branche", "Lidmaatschappen", "Abonnementen en strippenkaarten van je klanten, met automatische incasso."),
  gepland("ritten", "branche", "Ritten en voertuigen", "Ritten plannen, voertuigen en chauffeurs koppelen, uren per rit."),
  gepland("kamers", "branche", "Kamers en verblijven", "Kamers, beschikbaarheid en boekingen op één kalender."),
  gepland("dossier", "branche", "Dossier", "Een beveiligd dossier per cliënt; zware regels, dus pas na de eerste branches.", "Eerst een jurist: het zijn gezondheidsgegevens (bijzondere persoonsgegevens, AVG artikel 9)."),
];

const PER_SLEUTEL = new Map(MODULES.map((m) => [m.sleutel, m]));
export const moduleVan = (sleutel: string): BrancheModule | undefined => PER_SLEUTEL.get(sleutel);

export interface Koppeling {
  id: string;
  van: string;
  naar: string;
  /** wat de koppeling voor het bedrijf doet, gewone zinnen */
  wat: string;
  /**
   * Is de koppeling zelf gebouwd? Beide kanten klaar is niet genoeg: dat twee modules bestaan, betekent niet dat ze
   * elkaar iets doorgeven. Pas op true als je het in de code kunt aanwijzen; dit is wat een klant als "werkt al" leest.
   */
  gebouwd: boolean;
}

const koppel = (id: string, van: string, naar: string, wat: string, gebouwd: boolean): Koppeling => ({ id, van, naar, wat, gebouwd });

/**
 * Hoe de modules aan elkaar hangen. Of een koppeling werkt, zie koppelingWerkt(): gebouwd én beide kanten klaar.
 */
export const KOPPELINGEN: readonly Koppeling[] = [
  koppel("flexwerk-rooster", "flexwerk", "rooster", "Een aangenomen klus staat op het rooster.", true),
  koppel("rooster-inchecken", "rooster", "inchecken", "Wie op het rooster staat, checkt op de plek in.", true),
  koppel("inchecken-uren", "inchecken", "uren", "Een check-in wordt een urenstaat om goed te keuren.", true),
  koppel("uren-facturen", "uren", "facturen", "Goedgekeurde uren worden vanzelf een factuur.", true),
  koppel("certificaten-flexwerk", "certificaten", "flexwerk", "Bij het zoeken van werkers telt mee wie het juiste certificaat heeft.", true),
  koppel("horeca-flexwerk", "horeca-beheer", "flexwerk", "Personeel via ZekerFlex staat als onderdeel in je zaak.", true),
  koppel("horeca-kaart", "horeca-beheer", "kaart", "Een zaak met een openbare site staat als stip op de kaart.", true),
  koppel("rijschool-website", "rijschool-beheer", "website", "De site van de rijschool wordt in het beheer ingericht.", true),
  koppel("webshop-kassa", "webshop", "kassa-winkel", "Een verkoop aan de balie is dezelfde bestelling als een online bestelling.", true),
  koppel("afspraken-klantenkaart", "afspraken", "klantenkaart", "Elke afspraak komt op de kaart van de klant.", true),
  // ontwerp: nog niet gebouwd, ook niet waar beide kanten er al zijn
  koppel("afspraken-berichten", "afspraken", "berichten", "Een herinnering of verzetten gaat via de chat.", false),
  koppel("offertes-werkbonnen", "offertes", "werkbonnen", "Een geaccepteerde offerte wordt een werkbon.", false),
  koppel("werkbonnen-uren", "werkbonnen", "uren", "De uren op een werkbon worden uren om goed te keuren.", false),
  koppel("werkbonnen-facturen", "werkbonnen", "facturen", "Een afgeronde werkbon wordt een factuur.", false),
  koppel("lidmaatschappen-facturen", "lidmaatschappen", "facturen", "Een abonnement van een klant wordt elke periode een factuur.", false),
  koppel("voorraad-webshop", "voorraad", "webshop", "Wat uitverkocht is, kan niet meer besteld worden.", false),
  koppel("ritten-uren", "ritten", "uren", "De tijd van een rit wordt het urenstaatje van de chauffeur.", false),
];

/** Een koppeling werkt als hij zelf gebouwd is én beide kanten klaar zijn. */
export function koppelingWerkt(k: Koppeling): boolean {
  return k.gebouwd && moduleVan(k.van)?.status === "klaar" && moduleVan(k.naar)?.status === "klaar";
}
