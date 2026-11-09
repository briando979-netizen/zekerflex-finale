import type { OnboardingProgressTexts } from "@/components/app/OnboardingProgress";
import type { WerkgeverStapSleutel } from "@/lib/onboarding/voortgang";

// Teksten van de "maak je bedrijf af"-kaart op het werkgever-startscherm (alleen Nederlands).

export const WERKGEVER_KAART: OnboardingProgressTexts = {
  title: "Maak je bedrijf af",
  sub: (nog, totaal, min) => `Nog ${nog} van ${totaal} stappen, ongeveer ${min} min.`,
  stepOf: (n, totaal) => `Stap ${n} van ${totaal}`,
  minutes: (min) => (min === 0 ? "wij doen dit" : `± ${min} min`),
  optional: "tip",
  start: "Verder",
};

export const WERKGEVER_STAPPEN: Record<WerkgeverStapSleutel, { title: string; why: string }> = {
  email: {
    title: "E-mailadres bevestigen",
    why: "Zo weten we dat het jouw adres is. Zonder bevestiging sturen we geen meldingen over reacties en uren.",
  },
  bedrijf: {
    title: "KVK-nummer en eerste vestiging",
    why: "Freelancers zien waar ze komen werken en opdrachtgevers weten dat het bedrijf echt bestaat.",
  },
  verificatie: {
    title: "Bedrijf laten verifiëren",
    why: "Zodra je bedrijf is geverifieerd kun je mensen inplannen. Tot die tijd kun je één testklus plaatsen.",
  },
  klus: {
    title: "Je eerste klus plaatsen",
    why: "Freelancers in jouw regio zien je klus direct en kunnen reageren. Plaatsen duurt een paar minuten.",
  },
};
