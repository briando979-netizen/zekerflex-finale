import type { CampagneTekstInvoer } from "@/lib/sales/campagne-tekst";

// Partners in plaats van klanten (18 nov 2026, opdracht van de eigenaar: "mails voor samenwerkingen, uitzendbureau, verzekering,
// deals"). Drie soorten organisaties die ZekerFlex iets kunnen geven wat het zelf niet heeft: een toegelaten uitzender (ZekerFlex
// leent zelf niet uit), een partner voor aansprakelijkheid en arbeidsongeschiktheid (er is geen verzekeraar), en een
// administratiekantoor voor werkers en bedrijven. Elke soort is een eigen campagne van de verkoopmotor (lib/sales/campaign.ts) met een
// vaste, eerlijke tekst (lib/sales/campagne-tekst.ts) en eigen OpenStreetMap-kenmerken (lib/sales/discovery/osm-tags.ts).
//
// Vaste regels, ook in de teksten zelf: geen toezegging over prijs, marge, verzekering of voorwaarden ("daar heb ik nog geen vast
// voorstel voor"), niets over klanten die er nog niet zijn, en de cijfers zijn dezelfde als in de Partnerdeal-tekst. De campagnes
// beginnen als CONCEPT (stand REVIEW, status DRAFT): er gaat niets uit voor de eigenaar ze actief zet en elke mail zelf verstuurt,
// of zelf voor automatisch versturen kiest. Een antwoord van een partner komt via de info-ronde (lib/mail/info-ronde.ts) als reactie
// bij de eigenaar terecht. Puur bestand.

export type PartnerSoortId = "uitzendbureau" | "verzekeraar" | "accountant";

export interface PartnerSoort {
  id: PartnerSoortId;
  /** de naam van de campagne in Beheer, Sales */
  campagneNaam: string;
  /** de sector waarmee de motor in OpenStreetMap zoekt (lib/sales/discovery/osm-tags.ts) */
  sector: PartnerSoortId;
  label: string;
  /** waarom ZekerFlex deze partner zoekt, voor de eigenaar op het scherm */
  waarom: string;
  tekst: CampagneTekstInvoer;
}

const HANDTEKENING = ["Groet,", "Briando van Essen", "ZekerFlex", "+31 970 102 51797"].join("\n");

const INTRO =
  "Ik ben Briando van Essen van ZekerFlex, een Nederlands platform waar bedrijven flexwerkers, zzp'ers en freelancers vinden.";

const STAND =
  "We zijn nog in opbouw. Er hebben zich bijna 100 werkers aangemeld, van wie 35 met een gecontroleerd identiteitsbewijs, en bedrijven zoeken we nog. Het kan dus klein beginnen.";

export const PARTNER_SOORTEN: readonly PartnerSoort[] = [
  {
    id: "uitzendbureau",
    campagneNaam: "Partner: uitzendbureaus",
    sector: "uitzendbureau",
    label: "Uitzendbureaus en backoffice voor uitzenden",
    waarom: "ZekerFlex leent zelf geen mensen uit en heeft geen eigen toelating. Voor uitzendkrachten is een toegelaten uitzender nodig die de werkgever is.",
    tekst: {
      onderwerp: "Samenwerking tussen {bedrijf} en ZekerFlex",
      tekst: [
        "Beste {aanhef},",
        `${INTRO} Ik schrijf je omdat ik een uitzendpartner zoek, en {bedrijf} in {plaats} lijkt me daarvoor een goede kandidaat.`,
        "Waar het om gaat: ZekerFlex leent zelf geen mensen uit. Willen bedrijven werken met uitzendkrachten, dan is er een toegelaten uitzender nodig die de werkgever is en het loon, het verzuim en de regels rond uitzenden regelt. Dat is het deel dat ik graag met een partner wil oppakken.",
        "Wat wij inbrengen: een platform waar werkers zich aanmelden en bedrijven klussen plaatsen, met een eigen identiteitscontrole.",
        STAND,
        "Over de verdeling van de marge en de afspraken praat ik graag met je. Daar heb ik nog geen vast voorstel voor; dat bedenken we liever samen.",
        "Zullen we kennismaken? Antwoord op deze mail, of bel me.",
        HANDTEKENING,
      ].join("\n\n"),
      zonderVacature: true,
    },
  },
  {
    id: "verzekeraar",
    campagneNaam: "Partner: verzekeraars en tussenpersonen",
    sector: "verzekeraar",
    label: "Verzekeraars en tussenpersonen",
    waarom: "Er is geen verzekeraar. De site belooft daarom niets, en zzp'ers regelen hun eigen AVB. Een partner zou dat kunnen veranderen.",
    tekst: {
      onderwerp: "Een idee voor {bedrijf}: producten voor flexwerkers en bedrijven",
      tekst: [
        "Beste {aanhef},",
        `${INTRO} Ik schrijf {bedrijf} omdat ik een partner zoek bij een verzekeraar of een tussenpersoon.`,
        "Het punt: wie via ZekerFlex werkt of inhuurt, vraagt zich vaak af hoe het zit met aansprakelijkheid en met arbeidsongeschiktheid. ZekerFlex biedt zelf niets aan op dat gebied en doet daar ook geen beloftes over. Zzp'ers en flexwerkers regelen hun eigen AVB nu zelf.",
        "Wat ik me kan voorstellen: een product of een korting voor werkers en bedrijven op ons platform, onder jullie naam aangeboden, zonder dat wij zelf adviseren of bemiddelen. Of een andere vorm die bij {bedrijf} past; ik sta open voor jullie kant.",
        STAND,
        "Is dit iets om over te praten? Antwoord op deze mail of bel me, dan plannen we een kort gesprek in {plaats} of online.",
        HANDTEKENING,
      ].join("\n\n"),
      zonderVacature: true,
    },
  },
  {
    id: "accountant",
    campagneNaam: "Partner: administratiekantoren",
    sector: "accountant",
    label: "Accountants en administratiekantoren",
    waarom: "Zzp'ers en flexwerkers hebben vragen over btw, de kleineondernemersregeling en aangifte; bedrijven over facturatie. We verwijzen ze graag door.",
    tekst: {
      onderwerp: "Samenwerking met {bedrijf}: hulp voor zzp'ers en flexwerkers",
      tekst: [
        "Beste {aanhef},",
        `${INTRO} Ik schrijf {bedrijf} in {plaats} omdat ik administratiekantoren zoek die werkers en bedrijven op ons platform kunnen helpen.`,
        "Waarom: veel zzp'ers en flexwerkers beginnen zonder verstand van btw, de kleineondernemersregeling of hun aangifte, en bedrijven die voor het eerst met flexwerkers werken hebben vragen over facturatie en regelgeving. Die vragen komen bij ons binnen, en we verwijzen ze graag door naar een kantoor dat het goed doet.",
        "Wat ik voorstel: een kennismaking en, als het klikt, een plek bij ons als doorverwijspartner. Hoe we dat eerlijk voor beide kanten inrichten, bespreek ik graag met je.",
        STAND,
        "Zin in een kort gesprek? Antwoord op deze mail of bel me.",
        HANDTEKENING,
      ].join("\n\n"),
      zonderVacature: true,
    },
  },
];

export const partnerSoort = (id: string): PartnerSoort | null => PARTNER_SOORTEN.find((s) => s.id === id) ?? null;

/** Instellingen voor de campagne van een partnersoort: weinig per dag, geen minimale score (de score is voor klanten bedacht). */
export const PARTNER_CAMPAGNE = { dailyCap: 10, minScore: 0, workdaysOnly: true } as const;
