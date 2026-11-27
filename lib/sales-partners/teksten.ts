import {
  MODEL_A,
  MODEL_B,
  MODEL_KORT,
  MODEL_KORT_EN,
  MODEL_LABEL,
  STATUS_LABEL,
  STATUS_LABEL_EN,
  STATUS_UITLEG,
  type BedrijfStatus,
  type PartnerModel,
} from "@/lib/sales-partners/model";

// ---------------------------------------------------------------------------
// Teksten van het partnerdashboard (/partner) in het Nederlands en het Engels (27 nov 2026: de eerste partner leest
// Engels). De taal volgt het taalcookie van de app (zf_locale): Nederlands bij "nl" of zonder keuze, anders Engels (net
// als het werkgeversdeel). Puur bestand: de pagina geeft het tekstblok als gewone tekst door aan het formulier (client),
// met plaatshouders ({naam}, {velden}, {bedrag}, …) die vulIn() invult.
// ---------------------------------------------------------------------------

export type PartnerTaal = "nl" | "en";

export const partnerTaal = (locale: string | undefined | null): PartnerTaal => (!locale || locale === "nl" ? "nl" : "en");

/** "{naam} is geregistreerd." + { naam: "X" } → "X is geregistreerd." */
export function vulIn(tekst: string, waarden: Record<string, string | number>): string {
  return tekst.replace(/\{(\w+)\}/g, (heel, k: string) => (Object.hasOwn(waarden, k) ? String(waarden[k]) : heel));
}

export interface FormulierTeksten {
  velden: { bedrijfsnaam: string; kvk: string; contactnaam: string; email: string; telefoon: string };
  modelLegend: string;
  modelLabel: Record<PartnerModel, string>;
  vulNogIn: string;
  hetModel: string;
  geregistreerd: string;
  controleer: string;
  dubbel: string;
  mislukt: string;
  bezig: string;
  knop: string;
}

export interface PartnerTeksten {
  dateLocale: string;
  skipLink: string;
  naarApp: string;
  uitloggen: string;
  taal: string;
  titel: string;
  geenPartner: string;
  intro: string;
  kpi: { bedrijven: string; actief: string; uren: string; commissie: string; commissieSub: string };
  hoeTitel: string;
  hoeStappen: string[];
  regelsTitel: string;
  regels: string[];
  formTitel: string;
  formUitleg: string;
  tabelTitel: string;
  tabelLeeg: string;
  kop: { bedrijf: string; status: string; model: string; uren: string; verdiend: string };
  geregistreerdOp: string;
  tot: string;
  betaaldeUrenVan: string;
  uitbetaalbaar: string;
  gratisUren: string;
  statusLabel: Record<BedrijfStatus, string>;
  statusUitleg: Record<BedrijfStatus, string>;
  modelKort: Record<PartnerModel, string>;
  exportTitel: string;
  exportUitleg: string;
  maand: string;
  download: string;
  formulier: FormulierTeksten;
  fout: { geenPartner: string; kvk: string; verzoek: string; maand: string };
}

const INFO = "info@zekerflex.com";

export const PARTNER_TEKSTEN: Record<PartnerTaal, PartnerTeksten> = {
  nl: {
    dateLocale: "nl-NL",
    skipLink: "Naar hoofdinhoud",
    naarApp: "Naar de app",
    uitloggen: "Uitloggen",
    taal: "Taal",
    titel: "Partnerdashboard",
    geenPartner: "Dit dashboard is voor sales partners van ZekerFlex. Ben je partner geworden en zie je dit toch? Mail dan naar",
    intro: "Registreer de bedrijven die je naar ZekerFlex brengt en zie wat je verdient. Alle bedragen zijn exclusief btw.",
    kpi: {
      bedrijven: "Aangemelde bedrijven",
      actief: "Actieve klanten",
      uren: "Gewerkte uren via jouw klanten",
      commissie: "Opgebouwde commissie (excl. btw)",
      commissieSub: "Klaar om te factureren: {klaar} · wacht op betaling klant: {wacht}",
    },
    hoeTitel: "Zo werkt het",
    hoeStappen: [
      "Registreer een bedrijf hieronder vóórdat het zich aanmeldt op ZekerFlex, en kies het model voor dat bedrijf (A of B).",
      "Het bedrijf maakt zelf een gratis account op zekerflex.com/bedrijven. ZekerFlex koppelt dat account aan jouw registratie: de status wordt dan Aangemeld.",
      "Het bedrijf plaatst klussen, werkers doen de diensten en het bedrijf keurt de uren goed: de status wordt Actief en je ziet de uren en je commissie.",
      "Betaalt het bedrijf de platformkosten van die uren, dan is je commissie klaar om te factureren. Download aan het eind van de maand je overzicht en stuur je factuur naar " +
        INFO +
        ".",
    ],
    regelsTitel: "De afspraken",
    regels: [
      `Model A: € 1,00 per gewerkt uur, de eerste ${MODEL_A.maanden} maanden vanaf de eerste dienst van het bedrijf.`,
      `Model B: € 100,00 eenmalig zodra het bedrijf ${MODEL_B.naBetaaldeUren} uren heeft betaald.`,
      "Je kiest per bedrijf één model. Een bedrijf dat al op ZekerFlex staat of al door een ander is geregistreerd, telt niet.",
      "Geen resultaat, geen vergoeding: je verdient alleen over uren waarvoor het bedrijf de platformkosten echt heeft betaald. De gratis eerste maand van een bedrijf telt dus niet mee.",
    ],
    formTitel: "Nieuw bedrijf registreren",
    formUitleg: "Kies per bedrijf je model. Je verdient pas als het bedrijf een account op ZekerFlex heeft, wij het aan jouw registratie koppelen en er uren gewerkt en betaald worden.",
    tabelTitel: "Jouw bedrijven",
    tabelLeeg: "Je hebt nog geen bedrijven geregistreerd.",
    kop: { bedrijf: "Bedrijf", status: "Status", model: "Model", uren: "Gewerkte uren", verdiend: "Verdiend" },
    geregistreerdOp: "geregistreerd {datum}",
    tot: "tot {datum}",
    betaaldeUrenVan: "{uren} van {n} betaalde uren",
    uitbetaalbaar: "klaar om te factureren {bedrag}",
    gratisUren: "{uren} uur in de gratis maand (telt niet mee)",
    statusLabel: STATUS_LABEL,
    statusUitleg: STATUS_UITLEG,
    modelKort: MODEL_KORT,
    exportTitel: "Maandoverzicht voor je factuur",
    exportUitleg: "Download per maand je uren en commissie (CSV, opent in Excel). Factureer alleen het bedrag dat klaar is om te factureren: de commissie over uren waarvan de klant de factuur al betaalde.",
    maand: "Maand",
    download: "Download",
    formulier: {
      velden: {
        bedrijfsnaam: "Bedrijfsnaam",
        kvk: "KvK-nummer (optioneel)",
        contactnaam: "Naam contactpersoon",
        email: "E-mailadres",
        telefoon: "Telefoonnummer",
      },
      modelLegend: "Commissiemodel (verplicht)",
      modelLabel: MODEL_LABEL,
      vulNogIn: "Vul nog in: {velden}.",
      hetModel: "het model (A of B)",
      geregistreerd: "{naam} is geregistreerd.",
      controleer: "Controleer: {velden}.",
      dubbel: "Dit bedrijf is al geregistreerd door een sales partner (zelfde KvK-nummer of e-mailadres).",
      mislukt: "Opslaan lukte niet. Probeer het opnieuw.",
      bezig: "Bezig met opslaan…",
      knop: "Bedrijf registreren",
    },
    fout: {
      geenPartner: "Het partnerdashboard is alleen voor sales partners.",
      kvk: "Een KvK-nummer heeft 8 cijfers. Laat het veld leeg als je het niet weet.",
      verzoek: "Het verzoek kwam niet goed aan. Vernieuw de pagina en probeer het opnieuw.",
      maand: "Kies een maand.",
    },
  },
  en: {
    dateLocale: "en-GB",
    skipLink: "Skip to main content",
    naarApp: "Open the app",
    uitloggen: "Log out",
    taal: "Language",
    titel: "Partner dashboard",
    geenPartner: "This dashboard is for ZekerFlex sales partners. Did you become a partner and still see this? Email",
    intro: "Register the companies you bring to ZekerFlex and see what you earn. All amounts exclude VAT.",
    kpi: {
      bedrijven: "Registered companies",
      actief: "Active clients",
      uren: "Hours worked through your clients",
      commissie: "Commission earned (excl. VAT)",
      commissieSub: "Ready to invoice: {klaar} · waiting for client payment: {wacht}",
    },
    hoeTitel: "How it works",
    hoeStappen: [
      "Register a company below before it signs up on ZekerFlex, and choose the model for that company (A or B).",
      "The company creates its own free account at zekerflex.com/bedrijven. ZekerFlex links that account to your registration: the status changes to Signed up.",
      "The company posts shifts, workers do them and the company approves the hours: the status changes to Active and you see the hours and your commission.",
      "Once the company pays the platform fee for those hours, your commission is ready to invoice. At the end of the month, download your overview and send your invoice to " +
        INFO +
        ".",
    ],
    regelsTitel: "The agreement",
    regels: [
      `Model A: € 1.00 per worked hour, for the first ${MODEL_A.maanden} months from the company's first shift.`,
      `Model B: € 100.00 one-time bonus once the company has paid for ${MODEL_B.naBetaaldeUren} hours.`,
      "You choose one model per company. A company that is already on ZekerFlex, or already registered by someone else, does not count.",
      "No cure, no pay: you only earn on hours for which the company actually paid the platform fee. A company's free first month therefore does not count.",
    ],
    formTitel: "Register a new company",
    formUitleg: "Choose your model for each company. You earn once the company has a ZekerFlex account, we link it to your registration, and hours are worked and paid.",
    tabelTitel: "Your companies",
    tabelLeeg: "You have not registered any companies yet.",
    kop: { bedrijf: "Company", status: "Status", model: "Model", uren: "Hours worked", verdiend: "Earned" },
    geregistreerdOp: "registered {datum}",
    tot: "until {datum}",
    betaaldeUrenVan: "{uren} of {n} paid hours",
    uitbetaalbaar: "ready to invoice {bedrag}",
    gratisUren: "{uren} hours in the free month (not counted)",
    statusLabel: STATUS_LABEL_EN,
    statusUitleg: {
      geregistreerd: "Entered by you. ZekerFlex links it to a company account once the company signs up.",
      aangemeld: "The company has a ZekerFlex account. No hours worked yet.",
      actief: "Hours have been worked at this company.",
      afgewezen: "Not approved by ZekerFlex.",
    },
    modelKort: MODEL_KORT_EN,
    exportTitel: "Monthly overview for your invoice",
    exportUitleg: "Download your hours and commission per month (CSV, opens in Excel). Only invoice the amount that is ready to invoice: the commission on hours the client has already paid for.",
    maand: "Month",
    download: "Download",
    formulier: {
      velden: {
        bedrijfsnaam: "Company name",
        kvk: "KvK number (optional)",
        contactnaam: "Contact person",
        email: "Email address",
        telefoon: "Phone number",
      },
      modelLegend: "Commission model (required)",
      modelLabel: {
        A: `Model A: € 1.00 per worked hour (first ${MODEL_A.maanden} months)`,
        B: `Model B: € 100.00 one-time bonus (after ${MODEL_B.naBetaaldeUren} paid hours)`,
      },
      vulNogIn: "Please fill in: {velden}.",
      hetModel: "the model (A or B)",
      geregistreerd: "{naam} has been registered.",
      controleer: "Please check: {velden}.",
      dubbel: "This company has already been registered by a sales partner (same KvK number or email address).",
      mislukt: "Saving failed. Please try again.",
      bezig: "Saving…",
      knop: "Register company",
    },
    fout: {
      geenPartner: "The partner dashboard is only for sales partners.",
      kvk: "A KvK number has 8 digits. Leave the field empty if you don't know it.",
      verzoek: "The request did not arrive properly. Refresh the page and try again.",
      maand: "Choose a month.",
    },
  },
};
