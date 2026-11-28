import { metMachineTalen, type Locale } from "@/lib/i18n/config";

// De melding "kies je branches" (15 nov 2026) aan werkers die zich tussen 6 en 9 november aanmeldden, vóór de stap "branches" bestond
// (10 nov) en nog geen keuze maakten (lib/onboarding/branches-melding.ts): als push en als mail, in de taal van de werker. Puur bestand.
// Machine-assisted translations: native-speaker review recommended.

export interface BranchesMeldingTekst {
  pushTitel: string;
  pushBody: string;
  subject: string;
  hoi: string;
  alinea1: string;
  alinea2: string;
  knop: string;
}

export const BRANCHES_MELDING: Record<Locale, BranchesMeldingTekst> = metMachineTalen({
  nl: {
    pushTitel: "Kies je branches",
    pushBody: "Kies in welke branches je wilt werken, dan zie je eerst de klussen die bij je passen.",
    subject: "Kies je branches voor klussen die bij je passen",
    hoi: "Hoi {naam},",
    alinea1: "Sinds 10 november kies je bij je aanmelding in welke branches je wilt werken. Jouw keuze ontbreekt nog.",
    alinea2: "Kies je branches, dan zie je eerst de klussen die bij je passen.",
    knop: "Branches kiezen",
  },
  en: {
    pushTitel: "Choose your industries",
    pushBody: "Choose the industries you want to work in, and you see the jobs that fit you first.",
    subject: "Choose your industries for jobs that fit you",
    hoi: "Hi {naam},",
    alinea1: "Since 10 November you choose the industries you want to work in when you sign up. Your choice is still missing.",
    alinea2: "Choose your industries, and you see the jobs that fit you first.",
    knop: "Choose industries",
  },
  pl: {
    pushTitel: "Wybierz branże",
    pushBody: "Wybierz branże, w których chcesz pracować, a najpierw zobaczysz zlecenia, które do Ciebie pasują.",
    subject: "Wybierz branże i zobacz zlecenia, które do Ciebie pasują",
    hoi: "Cześć {naam},",
    alinea1: "Od 10 listopada przy rejestracji wybiera się branże, w których chcesz pracować. Twojego wyboru jeszcze brakuje.",
    alinea2: "Wybierz branże, a najpierw zobaczysz zlecenia, które do Ciebie pasują.",
    knop: "Wybierz branże",
  },
  ro: {
    pushTitel: "Alege domeniile",
    pushBody: "Alege domeniile în care vrei să lucrezi și vei vedea mai întâi lucrările potrivite pentru tine.",
    subject: "Alege domeniile pentru lucrări potrivite pentru tine",
    hoi: "Salut {naam},",
    alinea1: "Din 10 noiembrie, la înscriere alegi domeniile în care vrei să lucrezi. Alegerea ta încă lipsește.",
    alinea2: "Alege domeniile și vei vedea mai întâi lucrările potrivite pentru tine.",
    knop: "Alege domeniile",
  },
  uk: {
    pushTitel: "Обери галузі",
    pushBody: "Обери галузі, в яких хочеш працювати, і спершу побачиш роботи, які тобі підходять.",
    subject: "Обери галузі для робіт, які тобі підходять",
    hoi: "Привіт, {naam}!",
    alinea1: "З 10 листопада під час реєстрації обирають галузі, в яких хочуть працювати. Твого вибору ще немає.",
    alinea2: "Обери галузі, і спершу побачиш роботи, які тобі підходять.",
    knop: "Обрати галузі",
  },
});
