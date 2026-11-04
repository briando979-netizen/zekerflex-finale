import type { ShiftCategoryKey } from "@/lib/shifts/category";

// ---------------------------------------------------------------------------
// De vaste klus-sjablonen voor elke werkgever (functie, richttarief, pauze,
// omschrijving), per branche. Puur: ook de klusformulieren in de browser en
// /klus-plaatsen lezen dit. Eigen sjablonen per organisatie staan apart in
// lib/shifts/templates.ts.
//
// Regels:
// - de titel valt via shiftCategory() in zijn eigen `branche` (die bepaalt de
//   foto op de klus-kaart); tests/shift-catalogus.test.ts bewaakt dat;
// - een bestaande `key` nooit hernoemen: sectorpagina's en klusconcepten
//   verwijzen ernaar (lib/klusconcept/concept.ts, SECTOR_TEMPLATE);
// - richttarieven liggen op of boven het minimum (MIN_SHIFT_RATE_CENTS, 1620);
// - werk waarvoor een diploma, pas of VOG verplicht is, zegt dat in de omschrijving.
// ---------------------------------------------------------------------------

export interface ShiftTemplate {
  key: string;
  label: string;
  hourlyRateCents: number;
  breakMinutes: number;
  description: string;
  skillName: string | null;
  /** de branche van de foto en het filter in de galerij */
  branche?: ShiftCategoryKey;
  /** voorstel voor het veld Kledingvoorschriften */
  dresscode?: string;
}

type Sjabloon = ShiftTemplate & { branche: ShiftCategoryKey };

const s = (branche: ShiftCategoryKey, key: string, label: string, hourlyRateCents: number, breakMinutes: number, description: string, dresscode?: string): Sjabloon => ({
  key,
  label,
  hourlyRateCents,
  breakMinutes,
  description,
  skillName: null,
  branche,
  ...(dresscode ? { dresscode } : {}),
});

export const SHIFT_TEMPLATES: Sjabloon[] = [
  // Retail
  s("retail", "vakkenvuller", "Vakkenvuller", 1620, 30, "Vakken vullen, schappen aanvullen en netjes houden tijdens de dienst."),
  s("retail", "kassa", "Kassamedewerker", 1650, 30, "Klanten gastvrij afrekenen en de kassa bemannen."),
  s("retail", "verkoop", "Verkoopmedewerker", 1680, 30, "Klanten helpen en adviseren op de winkelvloer, de winkel netjes houden en afrekenen.", "Nette, verzorgde kleding."),
  s("retail", "bakkerij-verkoop", "Verkoopmedewerker bakkerij", 1650, 15, "Brood en banket verkopen, klanten helpen en de toonbank aanvullen.", "Schort wordt verstrekt; haar vast."),
  s("retail", "inventarisatie", "Inventarisatiemedewerker", 1700, 30, "Voorraad tellen en scannen, vaak 's avonds of vroeg in de ochtend vóór opening."),
  // Horeca
  s("horeca", "horeca", "Bediening / horeca", 1700, 30, "Gasten bedienen, bestellingen opnemen en uitserveren."),
  s("horeca", "barista", "Barista / barmedewerker", 1720, 30, "Koffie en drankjes maken, gasten aan de bar helpen en afrekenen."),
  s("horeca", "runner", "Runner", 1620, 30, "Gerechten en drankjes naar de tafels brengen, afruimen en opnieuw dekken."),
  s("horeca", "afwas", "Afwasser", 1620, 30, "Vaat, pannen en keukengerei schoonmaken en de spoelkeuken op orde houden.", "Antislipschoenen."),
  s("horeca", "keukenhulp", "Keukenhulp", 1680, 30, "Groenten snijden, mise-en-place voorbereiden en de koks ondersteunen.", "Koksbuis en antislipschoenen; haar vast."),
  s("horeca", "kok", "Zelfstandig werkend kok", 1950, 30, "Gerechten bereiden volgens de kaart, een station draaien en de hygiëne (HACCP) bewaken.", "Koksbuis, koksbroek en antislipschoenen."),
  s("horeca", "catering", "Cateringmedewerker", 1700, 30, "Buffetten opbouwen, op locatie uitserveren en na afloop alles opruimen.", "Zwarte broek en zwarte schoenen; shirt wordt verstrekt."),
  // Logistiek
  s("logistiek", "magazijn", "Magazijnmedewerker", 1700, 30, "Goederen ontvangen, orderpicken en het magazijn op orde houden.", "Veiligheidsschoenen (S3) verplicht."),
  s("logistiek", "orderpicker", "Orderpicker", 1700, 30, "Orders verzamelen met een handscanner en klaarzetten voor verzending.", "Veiligheidsschoenen (S3) verplicht."),
  s("logistiek", "heftruck", "Heftruckchauffeur", 1820, 30, "Pallets laden, lossen en wegzetten met de heftruck of reachtruck. Heftruckcertificaat vereist.", "Veiligheidsschoenen (S3) en veiligheidshesje."),
  s("logistiek", "inpakker", "Inpakker", 1650, 30, "Producten inpakken, labelen en klaarmaken voor transport."),
  s("logistiek", "bezorger", "Bezorger / koerier", 1700, 30, "Pakketten of maaltijden bezorgen in de regio, met een fiets of busje van de opdrachtgever."),
  s("logistiek", "chauffeur-c", "Chauffeur rijbewijs C", 2150, 45, "Goederen vervoeren met een vrachtwagen. Rijbewijs C, code 95 en een bestuurderskaart vereist."),
  s("logistiek", "verhuizer", "Verhuizer", 1800, 30, "Meubels en dozen sjouwen, inpakken en de verhuiswagen laden en lossen.", "Werkschoenen en werkhandschoenen."),
  // Productie & industrie
  s("productie", "productie", "Productiemedewerker", 1680, 30, "Meewerken aan de productielijn: producten maken, controleren en klaarzetten.", "Veiligheidsschoenen; werkkleding wordt vaak verstrekt."),
  s("productie", "voedingsmiddelen", "Productiemedewerker voedingsmiddelen", 1700, 30, "Aan de lijn werken in de voedingsmiddelenindustrie: sorteren, inpakken en controleren volgens de hygiëneregels.", "Haarnet en werkkleding worden verstrekt; geen sieraden."),
  s("productie", "machine-operator", "Machineoperator", 1850, 30, "Productiemachines instellen, bedienen en bewaken, en kleine storingen verhelpen.", "Veiligheidsschoenen en gehoorbescherming."),
  s("productie", "kwaliteit", "Kwaliteitscontroleur productie", 1850, 30, "Producten steekproefsgewijs controleren, afwijkingen vastleggen en melden."),
  // Schoonmaak
  s("schoonmaak", "schoonmaak", "Schoonmaakmedewerker", 1650, 15, "Schoonmaakronde volgens checklist: sanitair, kantines en algemene ruimtes."),
  s("schoonmaak", "housekeeping", "Housekeeping hotel", 1650, 30, "Hotelkamers schoonmaken en opmaken volgens de checklist van het hotel.", "Uniform wordt verstrekt; dichte, platte schoenen."),
  s("schoonmaak", "glazenwasser", "Glazenwasser", 1800, 30, "Ramen en gevels wassen, binnen en buiten, ook op hoogte met hoogwerker of mast."),
  s("schoonmaak", "oplevering", "Opleveringsschoonmaak", 1750, 30, "Een nieuwbouwpand of verbouwing bouwschoon maken voor de oplevering.", "Veiligheidsschoenen op de bouwplaats."),
  // Evenementen
  s("evenement", "eventcrew", "Op- en afbouwcrew", 1800, 30, "Podia, tenten, hekken en stands opbouwen en na afloop weer afbreken.", "Veiligheidsschoenen en werkhandschoenen."),
  s("evenement", "steward", "Steward / host", 1700, 30, "Bezoekers ontvangen, de weg wijzen en tickets of polsbandjes controleren.", "Zwarte broek; shirt of hesje wordt verstrekt."),
  s("evenement", "festivalbar", "Barmedewerker festival", 1700, 30, "Drankjes tappen en verkopen aan een festival- of evenementenbar."),
  s("evenement", "garderobe", "Garderobemedewerker", 1620, 15, "Jassen en tassen aannemen, ophangen en weer meegeven."),
  // Promotie & sales
  s("promotie", "promotie", "Promotiemedewerker", 1650, 30, "Producten of diensten onder de aandacht brengen in winkels, op beurzen of op straat.", "Promotiekleding wordt verstrekt."),
  s("promotie", "sampling", "Samplingmedewerker", 1650, 15, "Proefmonsters uitdelen en mensen enthousiast maken voor een nieuw product."),
  s("promotie", "beurspromotor", "Beurspromotor", 1750, 30, "Bezoekers op de beursstand ontvangen, informeren en contactgegevens noteren.", "Zakelijke kleding."),
  s("promotie", "straatwerver", "Straatwerver", 1720, 30, "Voor een goed doel of bedrijf mensen op straat of aan de deur aanspreken en donateurs of klanten werven."),
  // Beveiliging
  s("beveiliging", "beveiliger", "Beveiliger", 1950, 30, "Een object of winkel beveiligen, rondes lopen en toegang controleren. Diploma Beveiliger 2 en beveiligingspas vereist.", "Uniform wordt verstrekt."),
  s("beveiliging", "evenementenbeveiliger", "Evenementenbeveiliger", 1950, 30, "Toegangscontrole, fouilleren en toezicht bij evenementen. Diploma (event)beveiliger en beveiligingspas vereist.", "Uniform of hesje wordt verstrekt."),
  s("beveiliging", "portier", "Portier", 1900, 30, "Gasten bij de deur ontvangen, de toegang regelen en de sfeer bewaken. Diploma Horecaportier en pas vereist.", "Zwarte, nette kleding."),
  s("beveiliging", "verkeersregelaar", "Verkeersregelaar", 1800, 30, "Verkeer regelen bij evenementen of wegwerkzaamheden. Aanstelling als verkeersregelaar vereist.", "Verkeersregelaarshesje wordt verstrekt."),
  // Zorg (geen medische of voorbehouden handelingen)
  s("zorg", "huishoudelijke-hulp", "Huishoudelijke hulp thuiszorg", 1720, 15, "Schoonmaken en opruimen bij cliënten thuis, zodat zij zelfstandig kunnen blijven wonen. VOG vereist."),
  s("zorg", "gastvrouw-zorg", "Gastvrouw / gastheer zorg", 1680, 30, "Bewoners en bezoekers ontvangen, koffie en maaltijden rondbrengen en een praatje maken."),
  s("zorg", "zorghulp", "Zorghulp (niet-medisch)", 1700, 30, "Helpen bij eten, aankleden en dagelijkse activiteiten, zonder medische handelingen. VOG vereist."),
  s("zorg", "activiteitenbegeleider", "Activiteitenbegeleider", 1750, 30, "Activiteiten organiseren en begeleiden voor bewoners of cliënten. VOG vereist."),
  // Kinderopvang & onderwijs
  s("kinderopvang", "tso", "Overblijfmedewerker (TSO)", 1650, 0, "Toezicht houden tijdens de lunchpauze op school en buitenspelen begeleiden. VOG vereist."),
  s("kinderopvang", "pedagogisch", "Pedagogisch medewerker (invalkracht)", 1900, 30, "Invallen op een groep in de kinderopvang of BSO. Passend diploma, VOG en inschrijving in het Personenregister Kinderopvang vereist."),
  s("kinderopvang", "onderwijsassistent", "Onderwijsassistent", 1850, 30, "De leerkracht ondersteunen in de klas, kleine groepjes begeleiden en lesmateriaal klaarzetten. VOG vereist."),
  // Kantoor
  s("kantoor", "receptie", "Receptiemedewerker", 1800, 30, "Bezoekers ontvangen, telefoon en post afhandelen.", "Zakelijke kleding."),
  s("kantoor", "administratie", "Administratief medewerker", 1850, 30, "Facturen en documenten verwerken, gegevens invoeren en de administratie bijhouden."),
  s("kantoor", "klantenservice", "Klantenservicemedewerker", 1750, 30, "Klanten te woord staan via telefoon, chat en mail en vragen of klachten oplossen."),
  s("kantoor", "data-entry", "Data-entrymedewerker", 1700, 30, "Gegevens nauwkeurig invoeren en controleren in het systeem van de opdrachtgever."),
  // Bouw & techniek
  s("bouw", "bouwplaats", "Bouwplaatsmedewerker", 1900, 30, "Helpen op de bouwplaats: materiaal sjouwen, opruimen en de vakmensen ondersteunen. VCA vereist.", "Veiligheidsschoenen (S3), helm en hesje."),
  s("bouw", "schilder", "Schilder", 2200, 30, "Binnen- en buitenschilderwerk: schuren, plamuren en schilderen.", "Werkkleding die vies mag worden."),
  s("bouw", "elektromonteur", "Elektromonteur", 2300, 30, "Elektrische installaties aanleggen en aansluiten in woningen of bedrijfspanden. MBO-diploma elektrotechniek en VCA vereist.", "Veiligheidsschoenen (S3)."),
  s("bouw", "installatiemonteur", "Installatiemonteur", 2250, 30, "Verwarming, water en ventilatie installeren en onderhouden. VCA vereist.", "Veiligheidsschoenen (S3)."),
  // Auto & fiets
  s("auto", "wasstraat", "Medewerker wasstraat", 1650, 30, "Auto's voorwassen, de wasstraat bedienen en interieurs stofzuigen.", "Waterdichte, antislip schoenen."),
  s("auto", "autopoetser", "Autopoetser", 1700, 30, "Auto's binnen en buiten grondig reinigen en poetsen voor aflevering of verkoop."),
  s("auto", "bandenwissel", "Bandenwisselaar", 1750, 30, "Winter- en zomerbanden wisselen, balanceren en de bandenspanning controleren. Druk in het wisselseizoen.", "Werkschoenen en werkhandschoenen."),
  s("auto", "automonteur", "Automonteur", 2200, 30, "Onderhoud en reparaties aan personenauto's. MBO-diploma autotechniek vereist.", "Overall en veiligheidsschoenen."),
  s("auto", "fietsenmaker", "Fietsenmaker", 1800, 30, "Fietsen repareren en onderhouden: banden plakken, remmen en versnellingen afstellen."),
  // Land- & tuinbouw
  s("agrarisch", "oogst", "Oogstmedewerker", 1620, 30, "Groente of fruit oogsten, sorteren en in kratten klaarzetten.", "Kleding die tegen weer en vuil kan; laarzen."),
  s("agrarisch", "kaswerk", "Kasmedewerker", 1620, 30, "Werken in de kas: planten, oogsten, toppen en verpakken."),
  s("agrarisch", "bloemen", "Bloemenbinder", 1650, 30, "Bloemen sorteren, bossen binden en klaarmaken voor de veiling of de winkel."),
  s("agrarisch", "hovenier", "Hovenier / tuinman", 1850, 30, "Tuinen aanleggen en onderhouden: snoeien, maaien, bestraten en planten.", "Werkschoenen en werkhandschoenen."),
  // Overig
  s("algemeen", "allround", "Allround medewerker", 1650, 30, "Waar nodig de handen uit de mouwen: sjouwen, opruimen, klaarzetten en helpen."),
];

/** De branches die een sjabloon hebben, in de volgorde van de galerij. */
export function sjabloonBranches(templates: readonly ShiftTemplate[], volgorde: readonly ShiftCategoryKey[]): ShiftCategoryKey[] {
  const met = new Set(templates.map((t) => t.branche).filter((b): b is ShiftCategoryKey => Boolean(b)));
  return volgorde.filter((k) => met.has(k));
}
