import type { Locale } from "@/lib/i18n/config";
import type { RondleidingTeksten } from "@/lib/onboarding/rondleiding";

// ---------------------------------------------------------------------------
// De rondleiding door de werkgeversapp (15 nov 2026, eigenaar: "alles apart voor werkers en bedrijven"): dezelfde werking als die voor werkers
// (lib/onboarding/rondleiding.ts, components/app/Rondleiding.tsx), met eigen stappen, eigen teksten en een eigen bewaarsleutel, zodat wie
// beide apps gebruikt ze apart ziet. Puur bestand; de server kiest de taal (Nederlands of Engels, EMPLOYER_LOCALES) en geeft alleen die mee.
// Menunamen zijn precies die van de app (lib/i18n/dictionaries.ts, nav). Alleen het vraagteken heeft een plek om aan te wijzen
// (data-rondleiding="hulp" in components/app/HulpCentrum.tsx); de andere stappen staan in het midden.
// Machine-assisted translation (EN): native-speaker review recommended.
// ---------------------------------------------------------------------------

/** in de browser (localStorage), per toestel; apart van de rondleiding van de werker */
export const RONDLEIDING_BEDRIJF_KEY = "zf-rondleiding-bedrijf-v1";

export const RONDLEIDING_BEDRIJF_STAPPEN = ["welkom", "klus", "inplannen", "uren", "facturen", "chat", "hulp"] as const;
export type RondleidingBedrijfStap = (typeof RONDLEIDING_BEDRIJF_STAPPEN)[number];

export interface RondleidingBedrijfTeksten extends RondleidingTeksten {
  /** de regel in het hulpcentrum om hem opnieuw te starten */
  opnieuw: readonly [string, string];
  stappen: Record<RondleidingBedrijfStap, readonly [string, string]>;
}

const nl: RondleidingBedrijfTeksten = {
  stap: "Stap {n} van {m}",
  volgende: "Volgende",
  vorige: "Vorige",
  overslaan: "Overslaan",
  klaar: "Klaar",
  opnieuw: ["Rondleiding door de app", "Waar je alles vindt en hoe het werkt, in een paar stappen."],
  stappen: {
    welkom: ["Welkom bij ZekerFlex", "In een paar stappen laten we zien waar je alles vindt als bedrijf: klussen uitzetten, mensen kiezen, uren goedkeuren en betalen. Overslaan kan altijd."],
    klus: ["Een klus uitzetten", "Kies Klus uitzetten, vul in wat er moet gebeuren, wanneer en waar, en welk tarief je biedt. Daarna zien passende werkers hem. Je vindt al je klussen onder Klussen."],
    inplannen: ["Iemand inplannen", "Open een klus onder Klussen: daar zie je wie heeft gereageerd. Kies de werker die je wilt inplannen. Je kunt eerst een bericht sturen in de Chat. Kies je iemand en is je bedrijf nog niet gecontroleerd, dan vragen we eerst een paar bedrijfsgegevens; je keuze wordt bewaard."],
    uren: ["Uren goedkeuren", "Na afloop dient de werker zijn uren in. Onder Uren goedkeuren keur je ze goed of corrigeer je ze. Alleen goedgekeurde uren worden gefactureerd; automatisch goedkeuren kun je daar aanzetten."],
    facturen: ["Facturen en betalen", "Onder Facturen staan al je facturen. Betalen kan online of per bankoverschrijving; hoe, staat op de factuur en de betaalpagina."],
    chat: ["Chat met werkers", "Via Chat stuur je berichten, foto's en documenten, deel je een locatie, plan je een bericht in voor later of maak je een afspraak waarvoor mensen zich kunnen aanmelden."],
    hulp: ["Hulp en handleidingen", "Bij het vraagteken vind je veelgestelde vragen, nieuws, handleidingen en de chat met ons team. Ook staat Hulpcentrum in het menu. De rondleiding start je daar altijd opnieuw."],
  },
};

const en: RondleidingBedrijfTeksten = {
  stap: "Step {n} of {m}",
  volgende: "Next",
  vorige: "Back",
  overslaan: "Skip",
  klaar: "Done",
  opnieuw: ["Tour of the app", "Where to find everything and how it works, in a few steps."],
  stappen: {
    welkom: ["Welcome to ZekerFlex", "In a few steps we show you where to find everything as a company: posting jobs, choosing people, approving hours and paying. You can skip at any time."],
    klus: ["Post a job", "Choose Post a job, fill in what needs to be done, when and where, and the rate you offer. Suitable workers will then see it. You find all your jobs under Jobs."],
    inplannen: ["Schedule someone", "Open a job under Jobs: there you see who has responded. Choose the worker you want to schedule. You can message them first in Chat. If you choose someone and your company has not been checked yet, we first ask for a few company details; your choice is kept."],
    uren: ["Approve hours", "After a job the worker submits their hours. Under Approve hours you approve or correct them. Only approved hours are invoiced; you can switch on automatic approval there."],
    facturen: ["Invoices and paying", "Under Invoices you find all your invoices. You can pay online or by bank transfer; how is shown on the invoice and the payment page."],
    chat: ["Chat with workers", "In Chat you send messages, photos and documents, share a location, schedule a message for later or create an event people can sign up for."],
    hulp: ["Help and guides", "At the question mark you find frequently asked questions, news, guides and the chat with our team. Help centre is also in the menu. You can always restart the tour there."],
  },
};

export const RONDLEIDING_BEDRIJF_TEKSTEN = { nl, en } as const;

/** De teksten in de taal van de werkgeversapp (nl of en); elke andere taal valt terug op Nederlands. */
export function rondleidingBedrijf(locale: Locale): RondleidingBedrijfTeksten {
  return locale === "en" ? en : nl;
}
