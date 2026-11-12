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
const IRS_5472 = { naam: "IRS: About Form 5472", url: "https://www.irs.gov/forms-pubs/about-form-5472" };
const IRS_EIN = { naam: "IRS: Employer ID numbers", url: "https://www.irs.gov/businesses/small-businesses-self-employed/employer-id-numbers" };
const IRS_83B = { naam: "Treasury Regulation 1.83-2 (83(b)-keuze)", url: "https://www.law.cornell.edu/cfr/text/26/1.83-2" };
const KVK = { naam: "Kamer van Koophandel", url: "https://www.kvk.nl/" };
const BD = { naam: "Belastingdienst", url: "https://www.belastingdienst.nl/" };

export const KENNIS: KennisRegel[] = [
  {
    id: "de-franchise-methodes",
    title: "Delaware franchise tax: twee methodes",
    text:
      "Een Delaware corporation betaalt jaarlijks franchise tax en mag de goedkoopste van twee methodes kiezen. Authorized shares-methode: tot en met 5.000 aandelen $175, 5.001 tot en met 10.000 aandelen $250, en $85 per extra 10.000 aandelen of een deel daarvan. " +
      "Assumed par value capital-methode: $400 per $1.000.000 assumed par value capital (of een deel daarvan), minimaal $400. Het maximum is $200.000. " +
      "Met 10.000.000 geautoriseerde aandelen geeft de eerste methode $85.165; de tweede is bij weinig bezittingen meestal het minimum van $400. De aanslag die Delaware stuurt of op de rekening zet, gebruikt vaak de eerste methode.",
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
      "Een Amerikaanse corporation die voor minstens 25% van een buitenlander is (of een buitenlandse eigenaar met een eenpersoons-US-entiteit) moet Form 5472 invullen over transacties met de eigenaar of gelieerde partijen, ook als er geen inkomsten zijn. Het formulier gaat mee met de aangifte (Form 1120, bij een lege aangifte als 'pro forma'). " +
      "Bij niet of onvolledig indienen hoort een boete van $25.000 per formulier. Of ZekerFlex hieronder valt hangt af van wie de aandeelhouder is en waar die belastingplichtig is: een US tax preparer moet dat bevestigen.",
    bron: IRS_5472,
    zekerheid: "laten-bevestigen",
    land: "US",
  },
  {
    id: "irs-1120",
    title: "Form 1120 aangifte vennootschapsbelasting Amerikaanse corporation",
    text:
      "Een Delaware corporation is een Amerikaanse corporation en dient daarom jaarlijks een Form 1120 in bij de IRS, ook als er geen winst of omzet is. De gebruikelijke datum is de 15e dag van de vierde maand na het einde van het boekjaar (voor een kalenderjaar: 15 april), met uitstel mogelijk via Form 7004. " +
      "Alleen een US tax preparer mag dit voor de corporation indienen.",
    bron: { naam: "IRS: Instructions for Form 1120", url: "https://www.irs.gov/forms-pubs/about-form-1120" },
    zekerheid: "laten-bevestigen",
    land: "US",
  },
  {
    id: "irs-83b",
    title: "83(b)-keuze aandelen binnen 30 dagen IRS",
    text:
      "Een 83(b)-verklaring bij aandelen die de oprichter krijgt, moet uiterlijk 30 dagen na de overdracht van de aandelen bij de IRS zijn. Is de termijn gemist, dan kan dat meestal niet meer worden hersteld. Gewoonlijk stuur je hem aangetekend met bewijs van verzending.",
    bron: IRS_83B,
    zekerheid: "laten-bevestigen",
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
      "Een buitenlandse rechtspersoon (zoals een Delaware Inc.) die in Nederland een onderneming drijft of daar zijn feitelijke leiding heeft, moet zich volgens de Handelsregisterwet in het handelsregister van de KvK laten inschrijven. " +
      "Daarnaast bestaat de Wet op de formeel buitenlandse vennootschappen: wie namens zo'n vennootschap optreedt zonder dat die ingeschreven is, kan persoonlijk aansprakelijk zijn. De exacte voorwaarden en gevolgen moet een Nederlandse adviseur of de KvK bevestigen.",
    bron: KVK,
    zekerheid: "laten-bevestigen",
    land: "NL",
  },
  {
    id: "nl-btw",
    title: "Btw-registratie omzetbelasting Nederland ondernemer",
    text:
      "Een ondernemer die in Nederland btw-plichtige diensten levert, krijgt een btw-identificatienummer van de Belastingdienst en doet aangifte (meestal per kwartaal). Voor een buitenlandse rechtspersoon met een vestiging of werkzaamheden in Nederland geldt hetzelfde. " +
      "Zolang er geen btw-nummer is, mag er geen btw op facturen staan. Hoe dit precies voor ZekerFlex uitpakt moet een adviseur bevestigen.",
    bron: BD,
    zekerheid: "laten-bevestigen",
    land: "NL",
  },
  {
    id: "nl-vpb",
    title: "Vennootschapsbelasting Nederland fiscale vestiging werkelijke leiding",
    text:
      "Een buitenlandse vennootschap kan in Nederland belasting verschuldigd zijn voor vennootschapsbelasting als de werkelijke leiding (waar de directeur de beslissingen neemt) in Nederland zit of als er een vaste inrichting is. Tussen Nederland en de VS bestaat een belastingverdrag dat bepaalt welk land mag heffen. " +
      "Een enige directeur die in Nederland woont en vanuit Nederland bestuurt, maakt dit een reële vraag. Dat moet een Nederlandse belastingadviseur beoordelen.",
    bron: BD,
    zekerheid: "laten-bevestigen",
    land: "NL",
  },
  {
    id: "algemeen-bankrekening",
    title: "Eigen bankrekening voor de Inc. privé en zakelijk gescheiden",
    text:
      "Een vennootschap is een eigen rechtspersoon: ontvangsten en uitgaven horen op een eigen zakelijke bankrekening van die vennootschap, niet op een privérekening van de eigenaar. Vermenging maakt de boekhouding onbetrouwbaar en kan de aansprakelijkheidsbescherming van de vennootschap schaden. " +
      "Zonder een eigen rekening op naam van de Inc. is er ook geen sluitend afschrift voor de boekhouding.",
    bron: { naam: "Algemene boekhoudregel; laat bevestigen door een accountant", url: "https://www.kvk.nl/" },
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
