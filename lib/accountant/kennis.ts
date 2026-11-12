import { bm25, buildIndex, type LexDoc } from "@/lib/rag/lexical";

// ---------------------------------------------------------------------------
// Kennisbank van de AI-accountant: een korte lijst regels, elk met een bron. Hier staat alleen wat
// we met een bron kunnen aanwijzen; de vraagbalk antwoordt nooit buiten deze lijst. Per regel staat
// of we de bron zelf hebben gelezen ("gelezen", met datum) of dat de regel uit algemene kennis komt
// en een mens hem nog moet bevestigen ("laten-bevestigen"): dat laat het scherm er altijd bij zien.
// Een regel toevoegen = hier een item bijzetten met een bron die iemand kan openen. Verzin niets.
// Eigen zoekindex (BM25, lib/rag/lexical.ts): deze kennis hoort niet bij de doelgroepen van de
// algemene kennisbank en komt dus ook nooit in het antwoord van een andere assistent terecht.
// ---------------------------------------------------------------------------

export interface Bron {
  naam: string;
  url: string;
}

export type Zekerheid = "gelezen" | "laten-bevestigen";

export interface KennisRegel extends LexDoc {
  /** Korte naam van het onderwerp (ook de titel in het zoeken). */
  title: string;
  /** Wat de regel zegt, in gewoon Nederlands. */
  text: string;
  bron: Bron;
  zekerheid: Zekerheid;
  /** Datum (jjjj-mm-dd) waarop de bron is gelezen; alleen bij "gelezen". */
  gelezen?: string;
  land: "US" | "NL" | "beide";
}

const DE = { naam: "Delaware Division of Corporations", url: "https://corp.delaware.gov/frtaxcalc/" };
const DE_BETALEN = { naam: "Delaware Division of Corporations: Pay taxes", url: "https://corp.delaware.gov/paytaxes/" };
const IRS_5472 = { naam: "IRS: Instructions for Form 5472", url: "https://www.irs.gov/instructions/i5472" };
const IRS_1120 = { naam: "IRS: Instructions for Form 1120", url: "https://www.irs.gov/instructions/i1120" };
const IRS_EIN = { naam: "IRS: Employer identification number", url: "https://www.irs.gov/businesses/small-businesses-self-employed/employer-id-numbers" };
const IRS_83B = { naam: "IRS: Form 15620, Section 83(b) Election", url: "https://www.irs.gov/pub/irs-pdf/f15620.pdf" };
const KVK = { naam: "KVK: Inschrijven buitenlandse rechtspersoon of vennootschap", url: "https://www.kvk.nl/inschrijven/inschrijven-buitenlandse-bedrijven-in-het-handelsregister/" };
const KVK_WAADI = { naam: "KVK: Inschrijven buitenlandse rechtsvorm met Waadi", url: "https://www.kvk.nl/inschrijven/inschrijven-buitenlandse-rechtsvorm-met-waadi/" };
const WFBV = { naam: "Wet op de formeel buitenlandse vennootschappen (wetten.overheid.nl)", url: "https://wetten.overheid.nl/BWBR0009191/" };
const WTTA = { naam: "Nederlandse Autoriteit Uitleenmarkt: toelatinguitleenmarkt.nl", url: "https://www.toelatinguitleenmarkt.nl/" };
const WTTA_WAARBORG = { naam: "Toelatinguitleenmarkt.nl: Waarborgsom", url: "https://www.toelatinguitleenmarkt.nl/uitleners/wat-zijn-de-eisen-voor-toelating/waarborgsom" };
const BD = { naam: "Belastingdienst: Aanmelding Onderneming buitenland", url: "https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/themaoverstijgend/programmas_en_formulieren/aanmelding-onderneming-buitenland" };
const AWR = { naam: "Algemene wet inzake rijksbelastingen, art. 4 (wetten.overheid.nl)", url: "https://wetten.overheid.nl/BWBR0002320/" };

export const KENNIS: KennisRegel[] = [
  {
    id: "de-franchise-methodes",
    title: "Delaware franchise tax: twee methodes",
    text:
      "Een Delaware corporation betaalt jaarlijks franchise tax en mag de goedkoopste van twee methodes kiezen. Authorized shares-methode: tot en met 5.000 aandelen $175, 5.001 tot en met 10.000 aandelen $250, en $85 per extra 10.000 aandelen of een deel daarvan. " +
      "Assumed par value capital-methode: $400 per $1.000.000 assumed par value capital (of een deel daarvan), minimaal $400. Het maximum is $200.000. " +
      "Met 10.000.000 geautoriseerde aandelen geeft de eerste methode $85.165; de tweede is bij weinig bezittingen meestal het minimum van $400. De aanslag die Delaware stuurt of op de rekening zet, gebruikt vaak de eerste methode. " +
      "Hebben de aandelen geen par value (nominale waarde), dan geldt volgens Delaware de eerste methode: \"For corporations having no par value stock the authorized shares method will always result in the lesser tax.\"",
    bron: DE,
    zekerheid: "gelezen",
    gelezen: "2026-11-12",
    land: "US",
  },
  {
    id: "de-assumed-par",
    title: "Delaware assumed par value berekenen en welke gegevens Delaware vraagt",
    text:
      "Assumed par = totale bezittingen (gross assets, de total assets uit Schedule L van Form 1120 voor het boekjaar dat eindigt in het kalenderjaar van het rapport) gedeeld door het aantal uitgegeven aandelen, inclusief eigen aandelen. " +
      "Daarmee wordt de assumed par value capital berekend. Voor de tweede methode geeft de corporation dus gross assets en uitgegeven aandelen op, per 31 december, bij het jaarlijks verslag dat uiterlijk 1 maart moet binnen zijn.",
    bron: DE,
    zekerheid: "gelezen",
    gelezen: "2026-11-12",
    land: "US",
  },
  {
    id: "de-jaarverslag",
    title: "Delaware jaarverslag annual report deadline 1 maart boete",
    text:
      "De franchise tax en het jaarverslag (annual report) van een Delaware corporation zijn elk jaar uiterlijk 1 maart verschuldigd. De annual report fee is $50 voor een gewone corporation. " +
      "Te laat indienen of betalen kost een boete van $200 plus 1,5% rente per maand over belasting en boete.",
    bron: DE_BETALEN,
    zekerheid: "gelezen",
    gelezen: "2026-11-12",
    land: "US",
  },
  {
    id: "irs-5472",
    title: "Form 5472 buitenlandse eigenaar Amerikaanse corporation boete",
    text:
      "Een Amerikaanse corporation die voor minstens 25% van een buitenlander is (een \"reporting corporation\") moet Form 5472 indienen als ze een \"reportable transaction\" had, zoals een transactie met de buitenlandse eigenaar. Form 5472 gaat als bijlage mee met de eigen aangifte (Form 1120), op de uiterste datum daarvan. " +
      "De IRS: \"A penalty of $25,000 will be assessed on any reporting corporation that fails to file Form 5472 when due.\" Welke transacties er bij ZekerFlex onder vallen, bevestigt een adviseur.",
    bron: IRS_5472,
    zekerheid: "gelezen",
    gelezen: "2026-11-12",
    land: "US",
  },
  {
    id: "irs-1120",
    title: "Form 1120 aangifte vennootschapsbelasting Amerikaanse corporation",
    text:
      "Een Delaware corporation is een Amerikaanse corporation en doet jaarlijks aangifte met Form 1120 bij de IRS. De IRS: \"a corporation must file its income tax return by the 15th day of the 4th month after the end of its tax year\" (bij een kalenderjaar: 15 april). " +
      "De AI-accountant zet de cijfers klaar; indienen doet de bestuurder of een adviseur.",
    bron: IRS_1120,
    zekerheid: "gelezen",
    gelezen: "2026-11-12",
    land: "US",
  },
  {
    id: "irs-83b",
    title: "83(b)-keuze aandelen binnen 30 dagen IRS",
    text:
      "De IRS: \"An 83(b) election must be filed no later than 30 days after the date the property was transferred.\" Valt de 30e dag in een weekend of op een feestdag, dan telt een poststempel van de eerstvolgende werkdag nog (IRC § 7503). " +
      "Het kan met Form 15620 of met een eigen verklaring volgens Treas. Reg. § 1.83-2. Bewaar een kopie en het bewijs van verzending.",
    bron: IRS_83B,
    zekerheid: "gelezen",
    gelezen: "2026-11-12",
    land: "US",
  },
  {
    id: "irs-ein",
    title: "EIN werkgeversnummer IRS aanvragen",
    text:
      "Een EIN (Employer Identification Number) is het belastingnummer van de corporation bij de IRS. Je hebt hem nodig voor aangiftes, een Amerikaanse bankrekening en de meeste betaalaccounts. Zolang de EIN niet binnen is, is de aanvraag nog niet klaar.",
    bron: IRS_EIN,
    zekerheid: "laten-bevestigen",
    land: "US",
  },
  {
    id: "nl-kvk",
    title: "KvK-inschrijving buitenlandse rechtspersoon Inc. met vestiging in Nederland",
    text:
      "Volgens de KVK moet elk buitenlands bedrijf met een vestiging in Nederland zich inschrijven in het Handelsregister. Dat gaat met formulier 6 (de vestiging) en formulier 11 (de bestuurder), met een bewijs van inschrijving in het buitenland van hooguit een maand oud plus de oprichtingsakte en statuten. " +
      "Is de Inc. een formeel buitenlandse vennootschap, dan zijn de bestuurders tot de inschrijving persoonlijk aansprakelijk (zie de regel over de Wfbv).",
    bron: KVK,
    zekerheid: "gelezen",
    gelezen: "2026-11-12",
    land: "NL",
  },
  {
    id: "nl-btw",
    title: "Btw-registratie omzetbelasting Nederland ondernemer",
    text:
      "Volgens de Belastingdienst moet een buitenlandse ondernemer die met Nederlandse btw te maken krijgt, zich in veel gevallen laten registreren. Dat gaat met het formulier \"Aanmelding Onderneming buitenland\", dat ook geldt voor de vennootschapsbelasting en de loonheffingen. " +
      "Met een vaste inrichting in Nederland geldt een buitenlandse ondernemer als Nederlandse ondernemer. Welke route voor ZekerFlex geldt (dit formulier of via de KVK-inschrijving), bevestigt een adviseur.",
    bron: BD,
    zekerheid: "gelezen",
    gelezen: "2026-11-12",
    land: "NL",
  },
  {
    id: "nl-vpb",
    title: "Vennootschapsbelasting Nederland fiscale vestiging werkelijke leiding",
    text:
      "AWR art. 4 lid 1: \"Waar iemand woont en waar een lichaam gevestigd is, wordt naar de omstandigheden beoordeeld.\" In de praktijk kijkt men daarbij vaak naar waar de werkelijke leiding zit. Dan kan een buitenlandse vennootschap in Nederland vennootschapsbelasting verschuldigd zijn; het belastingverdrag tussen Nederland en de VS bepaalt welk land mag heffen. " +
      "Een enige bestuurder die in Nederland woont en vanuit Nederland bestuurt, maakt dit een reële vraag. Dat moet een Nederlandse belastingadviseur beoordelen.",
    bron: AWR,
    zekerheid: "laten-bevestigen",
    land: "NL",
  },
  {
    id: "nl-wfbv",
    title: "Formeel buitenlandse vennootschap Wfbv hoofdelijk aansprakelijk bestuurder jaarrekening",
    text:
      "Wfbv art. 1: een formeel buitenlandse vennootschap is \"een naar een ander dan Nederlands recht opgerichte, rechtspersoonlijkheid bezittende kapitaalvennootschap die haar werkzaamheid geheel of nagenoeg geheel in Nederland verricht en voorts geen werkelijke band heeft met de staat waarbinnen het recht geldt waarnaar zij is opgericht.\" " +
      "Art. 4 lid 2: \"De bestuurders zijn naast de vennootschap hoofdelijk aansprakelijk voor elke tijdens hun bestuur verrichte rechtshandeling waardoor de vennootschap wordt verbonden in het tijdvak voordat is voldaan aan artikel 2, eerste lid.\" (artikel 2 gaat over de inschrijving in het handelsregister). " +
      "Art. 5 lid 2: \"De bestuurders zijn verplicht jaarlijks binnen vijf maanden na afloop van het boekjaar, behoudens verlenging van deze termijn een jaarrekening en een bestuursverslag op te maken.\" " +
      "Of zekerflex, Inc. hieronder valt, beoordeelt een jurist.",
    bron: WFBV,
    zekerheid: "gelezen",
    gelezen: "2026-11-12",
    land: "NL",
  },
  {
    id: "nl-waadi",
    title: "Waadi registratie uitlenen van personeel buitenlands bedrijf",
    text:
      "Een buitenlands bedrijf dat in Nederland tegen betaling personeel uitleent, registreert dat bij de KVK onder de Waadi (Wet allocatie arbeidskrachten door intermediairs), met formulier 6. Voor ZekerFlex (uitzenden) hoort dit bij de KVK-inschrijving.",
    bron: KVK_WAADI,
    zekerheid: "gelezen",
    gelezen: "2026-11-12",
    land: "NL",
  },
  {
    id: "nl-wtta",
    title: "Wtta toelating uitleenmarkt uitzenden aanmelden overgangsregeling waarborgsom",
    text:
      "Vanaf 1 januari 2027 geldt de Wet toelating terbeschikkingstelling arbeidskrachten (Wtta): personeel uitlenen mag dan alleen met een toelating. Bestaande uitleners melden zich voor de overgangsregeling: \"Aanmelden kan vanaf 1 november 2026 t/m 31 december 2026\" op toelatinguitleenmarkt.nl. " +
      "Daarna: \"1 mei 2027 tot en met 30 juni 2027: uitleners kunnen hun verplichte toelating aanvragen\", en \"Vanaf 1 januari 2028: de Nederlandse Arbeidsinspectie start met handhaven op de naleving van de toelatingsplicht.\"",
    bron: WTTA,
    zekerheid: "gelezen",
    gelezen: "2026-11-12",
    land: "NL",
  },
  {
    id: "nl-wtta-waarborgsom",
    title: "Wtta waarborgsom toelating uitlener starter 50.000 100.000",
    text:
      "Voor de toelating (Wtta) betaalt een uitlener een waarborgsom: \"€ 100.000 voor uitleners; € 50.000 voor startende uitleners bij de eerste aanvraag.\" Een starter krijgt eerst een voorlopige toelating van 6 maanden en vult bij de aanvraag voor de definitieve toelating aan tot € 100.000. " +
      "\"U betaalt de waarborgsom als uw aanvraag inhoudelijk is behandeld en de NAU van plan is om u toe te laten.\"",
    bron: WTTA_WAARBORG,
    zekerheid: "gelezen",
    gelezen: "2026-11-12",
    land: "NL",
  },
  {
    id: "algemeen-bankrekening",
    title: "Eigen bankrekening voor de Inc. privé en zakelijk gescheiden",
    text:
      "Een vennootschap is een eigen rechtspersoon: ontvangsten en uitgaven horen op een eigen zakelijke bankrekening van die vennootschap, niet op een privérekening van de eigenaar. Vermenging maakt de boekhouding onbetrouwbaar en kan de aansprakelijkheidsbescherming van de vennootschap schaden. " +
      "Zonder een eigen rekening op naam van de Inc. is er ook geen sluitend afschrift voor de boekhouding.",
    bron: { naam: "Algemene boekhoudregel (geen wettekst); laat bevestigen door een accountant", url: "/admin/accountant" },
    zekerheid: "laten-bevestigen",
    land: "beide",
  },
  {
    id: "zekerflex-stripe",
    title: "Stripe-account stichting of Inc. wie is de ontvanger van de betalingen",
    text:
      "Het live Stripe-account van ZekerFlex hoort bij een Nederlandse stichting en niet bij zekerflex, Inc.; Stripe heeft het account op 11 november 2026 dichtgezet. Betalingen die via dat account lopen, zijn dus inkomsten van de stichting en niet van de Inc. " +
      "Welke partij mag factureren en de betalingen ontvangen, moet duidelijk zijn voordat er geboekt wordt.",
    bron: { naam: "Intern: stand van zaken ZekerFlex (eigenaar)", url: "/admin/te-doen" },
    zekerheid: "laten-bevestigen",
    land: "beide",
  },
];

const INDEX = buildIndex(KENNIS);

export interface KennisHit {
  regel: KennisRegel;
  score: number;
  dekking: number;
}

/** Zoekt in de kennisbank. Een treffer telt pas mee als hij minstens de helft van de zoekwoorden dekt. */
export function zoekKennis(vraag: string, k = 4): KennisHit[] {
  return bm25(INDEX, vraag, k)
    .filter((h) => h.coverage >= 0.5 && h.score > 0)
    .map((h) => ({ regel: h.doc, score: h.score, dekking: h.coverage }));
}

export const kennisBeschrijving = (r: KennisRegel) =>
  r.zekerheid === "gelezen" ? `bron gelezen op ${r.gelezen ?? "?"}` : "uit algemene kennis, laten bevestigen";
