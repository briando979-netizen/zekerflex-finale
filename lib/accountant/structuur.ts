// ---------------------------------------------------------------------------
// Structuurcheck: de vaste lijst van dingen die voor zekerflex, Inc. (Delaware, bestuurder woont in
// Nederland) geregeld moeten zijn. Zuiver (geen database): het scherm toont de lijst en bewaart
// alleen de status per punt (lib/accountant/store.ts). De status zet een mens; de accountant raadt niet.
// De uitleg is bewust voorzichtig: waar de eigenaar de feiten nog niet heeft, staat "laten bevestigen".
// ---------------------------------------------------------------------------

export type StructuurStatus = "open" | "bezig" | "klaar";
export const STRUCTUUR_STATUSSEN: StructuurStatus[] = ["open", "bezig", "klaar"];

export interface StructuurPunt {
  id: string;
  titel: string;
  /** Wat het is, in gewoon Nederlands. */
  wat: string;
  /** Waarom het telt. */
  waarom: string;
  /** Wat de volgende stap is als het nog niet klaar is. */
  volgende: string;
  /** Voorgestelde beginstatus op basis van wat de eigenaar zelf meldde (12 nov 2026). */
  start: StructuurStatus;
  /** Uiterste datum als er een vaste is (jjjj-mm-dd). */
  uiterlijk?: string;
  bronId?: string;
}

export const STRUCTUUR: StructuurPunt[] = [
  {
    id: "kvk",
    titel: "KvK-inschrijving als buitenlandse rechtspersoon",
    wat: "Inschrijven van zekerflex, Inc. in het Nederlandse handelsregister, omdat de bestuurder en het kantoor in Nederland zitten.",
    waarom:
      "Volgens de KVK moet elk buitenlands bedrijf met een vestiging in Nederland ingeschreven staan. Is de Inc. een formeel buitenlandse vennootschap, dan zijn de bestuurders tot de inschrijving naast de vennootschap hoofdelijk aansprakelijk voor elke rechtshandeling (Wfbv art. 4 lid 2).",
    volgende:
      "Formulier 6 (de vestiging) en formulier 11 (de bestuurder), met een bewijs van inschrijving in Delaware van hooguit een maand oud plus de oprichtingsakte en statuten. Afspraak bij de KVK met DigiD.",
    start: "open",
    bronId: "nl-kvk",
  },
  {
    id: "wfbv",
    titel: "Formeel buitenlandse vennootschap (Wfbv)",
    wat: "Een vennootschap naar buitenlands recht die (nagenoeg) al haar werk in Nederland doet en geen werkelijke band heeft met het land van oprichting (Wfbv art. 1).",
    waarom:
      "Dan gelden extra regels: hoofdelijke aansprakelijkheid van de bestuurders tot de inschrijving (art. 4 lid 2) en een jaarrekening met bestuursverslag binnen vijf maanden na het boekjaar (art. 5 lid 2).",
    volgende: "Laat een jurist beoordelen of zekerflex, Inc. hieronder valt: de bestuurder woont in Nederland en het werk gebeurt hier.",
    start: "open",
    bronId: "nl-wfbv",
  },
  {
    id: "wtta",
    titel: "Melden voor de toelating uitleenmarkt (Wtta)",
    wat: "Vanaf 1 januari 2027 mag personeel uitlenen alleen met een toelating. Bestaande uitleners melden zich nu voor de overgangsregeling.",
    waarom:
      "Aanmelden kan van 1 november t/m 31 december 2026. Daarna volgt de aanvraag (1 mei t/m 30 juni 2027) en vanaf 1 januari 2028 handhaaft de Arbeidsinspectie. Voor de toelating hoort een waarborgsom van € 100.000 (starter: eerst € 50.000).",
    volgende: "Melden op toelatinguitleenmarkt.nl vóór 1 januari 2027.",
    start: "open",
    uiterlijk: "2026-12-31",
    bronId: "nl-wtta",
  },
  {
    id: "waadi",
    titel: "Waadi-registratie bij de KVK",
    wat: "Een buitenlands bedrijf dat in Nederland tegen betaling personeel uitleent, registreert dat bij de KVK (Waadi).",
    waarom: "ZekerFlex leent personeel uit (uitzenden). Zonder deze registratie mag dat niet.",
    volgende: "Samen met de KVK-inschrijving regelen (formulier 6).",
    start: "open",
    bronId: "nl-waadi",
  },
  {
    id: "btw",
    titel: "Btw-registratie in Nederland",
    wat: "Een btw-nummer van de Belastingdienst voor de Inc., zodat er btw op facturen mag en aangifte kan worden gedaan.",
    waarom: "Een buitenlandse ondernemer die met Nederlandse btw te maken krijgt, moet zich volgens de Belastingdienst in veel gevallen laten registreren. Met een vaste inrichting hier geldt de Inc. als Nederlandse ondernemer.",
    volgende: "Formulier \"Aanmelding Onderneming buitenland\" of via de KVK-inschrijving; een adviseur bevestigt welke route geldt.",
    start: "open",
    bronId: "nl-btw",
  },
  {
    id: "fiscaal",
    titel: "Fiscale vestiging: waar betaalt de Inc. belasting?",
    wat: "Vaststellen of de werkelijke leiding in Nederland zit. Zo ja, dan is de Inc. vennootschapsbelastingplichtig in Nederland, naast de Amerikaanse aangifte.",
    waarom: "De enige bestuurder woont in Nederland en stuurt vanuit Nederland. Dat kan betekenen dat Nederland mag heffen, met het belastingverdrag als scheidsrechter.",
    volgende: "Leg de feiten (woonplaats bestuurder, waar beslissingen vallen) voor aan een Nederlandse belastingadviseur voordat het eerste boekjaar sluit.",
    start: "open",
    bronId: "nl-vpb",
  },
  {
    id: "83b",
    titel: "83(b)-verklaring bij de IRS",
    wat: "Een keuze over de aandelen die de oprichter kreeg, die binnen 30 dagen na de overdracht bij de IRS moet zijn.",
    waarom: "Zonder tijdige keuze kan de IRS later over de waardestijging van de aandelen belasting heffen. De termijn is niet te verlengen.",
    volgende: "De verklaring is getekend. Verstuur hem aangetekend met bewijs van verzending, uiterlijk op de datum hiernaast, en bewaar het bewijs.",
    start: "bezig",
    uiterlijk: "2026-12-09",
    bronId: "irs-83b",
  },
  {
    id: "ein",
    titel: "EIN (belastingnummer bij de IRS)",
    wat: "Het nummer waarmee de IRS de Inc. kent. De aanvraag is gedaan.",
    waarom: "Je hebt hem nodig voor de aangifte, een Amerikaanse bankrekening en de meeste betaaldiensten.",
    volgende: "Wacht op de bevestiging (brief CP 575 of de bevestiging uit de aanvraag) en bewaar die in het dossier.",
    start: "bezig",
    bronId: "irs-ein",
  },
  {
    id: "bank",
    titel: "Eigen bankrekening voor de Inc.",
    wat: "Een zakelijke rekening op naam van zekerflex, Inc., gescheiden van privé.",
    waarom: "Een vennootschap hoort eigen geld te hebben. Zonder eigen rekening klopt de boekhouding niet en wordt aansprakelijkheid lastiger te verdedigen.",
    volgende: "Open een rekening bij een bank die een Delaware-Inc. met Nederlandse bestuurder accepteert; daarvoor heb je meestal het uittreksel, de EIN en een identiteitsbewijs nodig.",
    start: "open",
    bronId: "algemeen-bankrekening",
  },
  {
    id: "stripe",
    titel: "Stripe: stichting of Inc.?",
    wat: "Het live Stripe-account hoort bij een Nederlandse stichting en niet bij de Inc. Sinds 11 nov 2026 staat het dicht.",
    waarom: "Betalingen via dat account zijn inkomsten van de stichting. De Inc. mag er niet over factureren zonder dat dit klopt in de contracten.",
    volgende: "Kies welke partij de klanten factureert en open daarvoor een passend Stripe-account (of een andere betaaldienst); leg de keuze vast in het dossier.",
    start: "open",
    bronId: "zekerflex-stripe",
  },
];

export const structuurPunt = (id: string) => STRUCTUUR.find((p) => p.id === id);

export type StructuurToestand = Record<string, StructuurStatus>;

/** Beginstatus uit de lijst, overschreven door wat een mens koos. Onbekende of verouderde waarden worden genegeerd. */
export function structuurToestand(opgeslagen: Record<string, unknown> | null | undefined): StructuurToestand {
  const out: StructuurToestand = {};
  for (const p of STRUCTUUR) {
    const v = opgeslagen?.[p.id];
    out[p.id] = typeof v === "string" && (STRUCTUUR_STATUSSEN as string[]).includes(v) ? (v as StructuurStatus) : p.start;
  }
  return out;
}

/** Dagen tot een uiterste datum (hele dagen, afgerond naar boven; negatief als verlopen). */
export function dagenTot(datum: string, nu: Date): number {
  const doel = Date.parse(`${datum}T23:59:59+01:00`);
  return Math.ceil((doel - nu.getTime()) / 86_400_000);
}
