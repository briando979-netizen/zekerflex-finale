import type { OnboardingProgressTexts } from "@/components/app/OnboardingProgress";
import type { WerkgeverStapSleutel } from "@/lib/onboarding/voortgang";

// Teksten van de kaart "Jouw eerste klus" op het werkgever-startscherm: wat er na de grote checklist nog open staat (reacties
// bekijken, een freelancer kiezen). Nederlands en Engels, zoals de rest van de werkgeversapp. Er is geen stap voor het
// KVK-nummer: die controle komt pas bij het inplannen (lib/company/gecontroleerd.ts).

type StapTeksten = Record<WerkgeverStapSleutel, { title: string; why: string }>;

export const WERKGEVER_KAART: OnboardingProgressTexts = {
  title: "Jouw eerste klus",
  sub: (nog, totaal, min) => `Nog ${nog} van ${totaal} stappen, ongeveer ${min} min.`,
  stepOf: (n, totaal) => `Stap ${n} van ${totaal}`,
  minutes: (min) => (min === 0 ? "wij geven een seintje" : `± ${min} min`),
  optional: "tip",
  start: "Verder",
};

export const WERKGEVER_STAPPEN: StapTeksten = {
  org: {
    title: "Vertel wat voor bedrijf je bent",
    why: "Zo laten we je bij een nieuwe klus de passende kandidaten zien.",
  },
  adres: {
    title: "Bevestig het adres van je werklocatie",
    why: "Freelancers zien waar ze komen werken, en we berekenen hun reistijd naar jouw adres.",
  },
  profiel: {
    title: "Bekijk je bedrijfsprofiel",
    why: "Bedrijfsnaam, contactgegevens en logo: zo zien freelancers meteen wie je bent.",
  },
  email: {
    title: "Bevestig je e-mailadres",
    why: "Zo weten we dat het jouw adres is. Zonder bevestiging sturen we geen meldingen over reacties en uren.",
  },
  klus: {
    title: "Zet je eerste klus uit",
    why: "Een klus plaatsen duurt een paar minuten. Hij staat meteen live en freelancers in jouw regio kunnen erop reageren.",
  },
  reacties: {
    title: "Bekijk de reacties op je klus",
    why: "Zodra een freelancer reageert, krijg je een melding. Je ziet wie het is, hoe vaak hij kwam opdagen en wat hij vraagt.",
  },
  kiezen: {
    title: "Kies een freelancer",
    why: "Kies wie je wilt inplannen. We vragen dan nog een paar bedrijfsgegevens, en je keuze wordt bewaard.",
  },
  afronden: {
    title: "Rond je start af",
    why: "Zodra je iemand hebt ingepland, is je start klaar.",
  },
};

export const WERKGEVER_KAART_EN: OnboardingProgressTexts = {
  title: "Your first job",
  sub: (nog, totaal, min) => `${nog} of ${totaal} steps to go, about ${min} min.`,
  stepOf: (n, totaal) => `Step ${n} of ${totaal}`,
  minutes: (min) => (min === 0 ? "we will let you know" : `± ${min} min`),
  optional: "tip",
  start: "Continue",
};

export const WERKGEVER_STAPPEN_EN: StapTeksten = {
  org: {
    title: "Tell us what kind of company you are",
    why: "That way we show you the right candidates for a new job.",
  },
  adres: {
    title: "Confirm the address of your workplace",
    why: "Freelancers see where they will work, and we calculate their travel time to your address.",
  },
  profiel: {
    title: "Check your company profile",
    why: "Company name, contact details and logo: freelancers see right away who you are.",
  },
  email: {
    title: "Confirm your e-mail address",
    why: "That way we know it is your address. Without confirmation we send no messages about responses and hours.",
  },
  klus: {
    title: "Post your first job",
    why: "Posting a job takes a few minutes. It goes live straight away and freelancers in your area can respond to it.",
  },
  reacties: {
    title: "Look at the responses to your job",
    why: "As soon as a freelancer responds you get a message. You see who it is, how often they showed up and what they ask for.",
  },
  kiezen: {
    title: "Choose a freelancer",
    why: "Choose who you want to schedule. We then ask for a few company details, and your choice is kept.",
  },
  afronden: {
    title: "Finish your start",
    why: "Once you have scheduled someone, your start is complete.",
  },
};

/** De teksten van de kaart in de taal van de werkgeversapp. */
export function werkgeverKaartTeksten(locale: string): { kaart: OnboardingProgressTexts; stappen: StapTeksten } {
  return locale === "en" ? { kaart: WERKGEVER_KAART_EN, stappen: WERKGEVER_STAPPEN_EN } : { kaart: WERKGEVER_KAART, stappen: WERKGEVER_STAPPEN };
}
