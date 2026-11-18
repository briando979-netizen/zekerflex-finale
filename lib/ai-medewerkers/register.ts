// ---------------------------------------------------------------------------
// De AI-medewerkers van ZekerFlex op één plek (15 nov 2026, eigenaar: "maak agenten aan voor ZekerFlex"). Er waren al
// zes losse systemen (autopilot, AI-teams, verkoopmotor, recruiter, automatisch matchen, websitechat), elk op een eigen
// beheerpagina; Beheer → ZekerFlex AI noemde er geen. Dit register zegt per medewerker wat hij doet, wanneer hij draait en
// of hij iets naar buiten stuurt, en zo ja of jij eerst goedkeurt. De pagina /admin/zekerflex-ai/medewerkers vult het aan
// met de live stand. Puur: geen prisma of kv.
// ---------------------------------------------------------------------------

/** Stuurt hij iets naar mensen buiten het beheer (mail, push, chat)? */
export type NaarBuiten = "nee" | "na-goedkeuring" | "zelf";

export interface AiMedewerker {
  id: string;
  naam: string;
  wat: string;
  wanneer: string;
  naarBuiten: NaarBuiten;
  /** wat er precies naar buiten gaat en onder welke voorwaarde */
  buiten: string;
  /** de beheerpagina waar je hem ziet en bijstuurt */
  pagina: string | null;
  /** nieuw sinds 15 nov 2026 */
  nieuw?: true;
}

export const AI_MEDEWERKERS: AiMedewerker[] = [
  {
    id: "welkomstcoach",
    naam: "Welkomstcoach",
    wat: "Ziet nieuwe bedrijven die zich 2 tot 30 dagen geleden aanmeldden en nog geen klus plaatsten, en zet een persoonlijke mail klaar met hulp bij de eerste klus.",
    wanneer: "Elke ochtend, met de AI-teams",
    naarBuiten: "na-goedkeuring",
    buiten: "Een mail aan de beheerder van het bedrijf, pas als jij hem uitvoert. Per bedrijf één keer.",
    pagina: "/admin/ai-teams",
    nieuw: true,
  },
  {
    id: "servicedesk",
    naam: "Servicedesk",
    wat: "Schrijft een conceptantwoord op vragen in de websitechat die langer dan 4 uur op antwoord wachten.",
    wanneer: "Elke ochtend, met de AI-teams (alleen met een taalmodel)",
    naarBuiten: "na-goedkeuring",
    buiten: "Het antwoord komt pas in de chat als jij het uitvoert. Hooguit 5 concepten per ronde.",
    pagina: "/admin/ai-teams",
    nieuw: true,
  },
  {
    id: "aanvragen-beantwoorder",
    naam: "Aanvragen-beantwoorder",
    wat: "Leest de postbus info@ mee. Een bedrijf dat naar kosten, zzp of uitzend, verzekering, annuleren of ziekte vraagt, krijgt een conceptantwoord uit het antwoordenpakket. Een lead die op een verkoopmail terugmailt, wordt herkend en de verkoopreeks stopt.",
    wanneer: "Elke 5 minuten, met de info-ronde (alleen als 'info-mail-afhandelen' aan staat; anders alleen opschrijven)",
    naarBuiten: "na-goedkeuring",
    buiten: "Het antwoord aan het bedrijf gaat vanaf info@ pas uit als jij het uitvoert. Bedrijfsmails krijgen nooit automatisch een antwoord.",
    pagina: "/admin/ai-teams",
    nieuw: true,
  },
  {
    id: "ai-teams",
    naam: "AI-teams",
    wat: "Vijftien teams die groei, storingen, planning, prijzen, kwaliteit, klantenservice en veiligheid bekijken en voorstellen klaarzetten.",
    wanneer: "Elke ochtend, of met de knop",
    naarBuiten: "na-goedkeuring",
    buiten: "Mails aan bedrijven, een webhook opnieuw versturen of een bedrijf goedkeuren: altijd eerst een voorstel.",
    pagina: "/admin/ai-teams",
  },
  {
    id: "autopilot",
    naam: "Autopilot",
    wat: "Vaste klusjes die vanzelf lopen: herinneringen voor uren, onbezette klussen, websitevoorstellen opvolgen en een dagrapport.",
    wanneer: "Twee keer per dag, of met de knop",
    naarBuiten: "zelf",
    buiten: "Herinneringen (push) gaan vanzelf, met een grens per ronde. Uren goedkeuren alleen bij bedrijven die dat zelf aanzetten.",
    pagina: "/admin/autopilot",
  },
  {
    id: "matching",
    naam: "Automatisch matchen",
    wat: "Zoekt bij elke nieuwe klus passende werkers en benadert ze in golven tot de klus vol is.",
    wanneer: "Bij elke nieuwe klus, en elke nacht",
    naarBuiten: "zelf",
    buiten: "Een push of mail met het klusvoorstel aan passende werkers.",
    pagina: null,
  },
  {
    id: "websitechat",
    naam: "Websitechat-assistent",
    wat: "Beantwoordt vragen van bezoekers op de website, en zwijgt zodra iemand van jullie het gesprek overneemt.",
    wanneer: "Bij elk bericht van een bezoeker",
    naarBuiten: "zelf",
    buiten: "Een antwoord in de websitechat.",
    pagina: "/admin/webchat",
  },
  {
    id: "verkoop",
    naam: "Verkoopmotor",
    wat: "Zoekt en scoort bedrijven als mogelijke klant en schrijft per bedrijf een reeks van drie mails.",
    wanneer: "Elke ochtend, als hij aan staat",
    naarBuiten: "na-goedkeuring",
    buiten: "Concepten wachten op Verstuur nu. Alleen met de automatische piloot aan gaat er zelf iets uit; die staat standaard uit.",
    pagina: "/admin/sales",
  },
  {
    id: "bellijst",
    naam: "Bellijst",
    wat: "Zet bedrijven met een telefoonnummer klaar, met een belscript en ruimte voor de uitkomst.",
    wanneer: "Altijd bij",
    naarBuiten: "nee",
    buiten: "Niets: jij belt.",
    pagina: "/admin/sales",
  },
  {
    id: "recruiter",
    naam: "AI-recruiter",
    wat: "Maakt voor een klus een shortlist uit de eigen werkers, met een conceptbericht.",
    wanneer: "Met de knop",
    naarBuiten: "na-goedkeuring",
    buiten: "Het bericht is een concept; een mens verstuurt het.",
    pagina: "/admin/recruiter",
  },
  {
    id: "jarvis",
    naam: "Beheer-AI",
    wat: "Je assistent in Beheer: beantwoordt vragen over het platform en voert opdrachten uit die jij geeft.",
    wanneer: "Als je hem iets vraagt",
    naarBuiten: "nee",
    buiten: "Alleen wat jij hem uitdrukkelijk opdraagt.",
    pagina: "/admin/zekerflex-ai",
  },
];

export const NAAR_BUITEN_LABEL: Record<NaarBuiten, string> = {
  nee: "Niets naar buiten",
  "na-goedkeuring": "Na jouw goedkeuring",
  zelf: "Gaat vanzelf",
};
