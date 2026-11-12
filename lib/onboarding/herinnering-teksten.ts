import type { Locale } from "@/lib/i18n/config";
import { gegevensMist, type GegevensStand } from "@/lib/onboarding/gegevens-mist";
import { vulIn } from "@/lib/i18n/vul-in";

// ---------------------------------------------------------------------------
// De herinnering aan een werker die zijn aanmelding niet afmaakte (12 nov 2026): noemt precies wat er mist, in de taal
// die de werker in de app koos, met per onderdeel een link naar de plek waar hij het doet. Puur bestand (geen prisma, kv of
// mail): de feiten komen van lib/onboarding/herinnering-mist.ts, de mail van onboardingReminderEmail, de push van
// sendLocalizedPush. Tweestapsverificatie is optioneel en wordt nooit genoemd. Nooit persoonsgegevens (BSN, ID-nummer) in de tekst.
// Machine-assisted translations: native-speaker review recommended.
// ---------------------------------------------------------------------------

export type MistStuk = "soort" | "branches" | "bsn" | "contract" | "btw" | "postcode" | "identiteit" | "foto";

export interface HerinneringFeitenWerker {
  soortGekozen: boolean;
  branchesGekozen: boolean;
  identiteitIngestuurd: boolean;
  fotoGezet: boolean;
  /** alleen van belang als de soort gekozen is en de gegevens niet klaar zijn */
  gegevens: GegevensStand | null;
}

/** Wat er nog mist, in de volgorde van de onboarding; leeg = niets te herinneren. */
export function herinneringMist(f: HerinneringFeitenWerker): MistStuk[] {
  const mist: MistStuk[] = [];
  if (!f.soortGekozen) mist.push("soort");
  if (!f.branchesGekozen) mist.push("branches");
  if (f.soortGekozen && f.gegevens) mist.push(...gegevensMist(f.gegevens));
  if (!f.identiteitIngestuurd) mist.push("identiteit");
  if (!f.fotoGezet) mist.push("foto");
  return mist;
}

/** Waar de werker dit invult (pad vanaf de root). */
export const MIST_HREF: Record<MistStuk, string> = {
  soort: "/dashboard/fiscaal",
  branches: "/dashboard/klussen",
  bsn: "/dashboard/verificatie",
  contract: "/dashboard/verificatie#uitzendovereenkomst",
  btw: "/dashboard/verificatie",
  postcode: "/dashboard/verificatie",
  identiteit: "/dashboard/verificatie",
  foto: "/dashboard/eerste-indruk?stap=foto",
};

export interface HerinneringTeksten {
  onderwerp: string;
  onderwerpLaatste: string;
  aanhef: string;
  intro: string;
  knop: string;
  hulp: string;
  preheader: string;
  duurt: string;
  pushTitel: string;
  pushBody: string;
  stuk: Record<MistStuk, string>;
}

export const HERINNERING_NL: HerinneringTeksten = {
  onderwerp: "Je ZekerFlex-account is bijna klaar",
  onderwerpLaatste: "Laatste herinnering: maak je ZekerFlex-account af",
  aanhef: "Hoi {naam},",
  intro: "Je ZekerFlex-account is nog niet af. Dit moet nog:",
  knop: "Account afmaken",
  hulp: "Vragen? Antwoord gewoon op deze mail.",
  preheader: "Nog een paar minuten werk: {lijst}.",
  duurt: "Het duurt een paar minuten. Daarna kun je op klussen reageren.",
  pushTitel: "Maak je account af",
  pushBody: "Nog te doen: {lijst}.",
  stuk: {
    soort: "kies je werkvorm (zzp'er, flexwerker of uitzendkracht)",
    branches: "kies in welke branches je wilt werken",
    bsn: "vul je BSN in",
    contract: "onderteken je uitzendovereenkomst",
    btw: "vul je KVK-, btw- of KOR-gegevens in",
    postcode: "vul je thuisbasis (postcode) in",
    identiteit: "bevestig je identiteit met een ID-scan",
    foto: "zet een profielfoto",
  },
};

const HERINNERING_EN: HerinneringTeksten = {
  onderwerp: "Your ZekerFlex account is almost ready",
  onderwerpLaatste: "Last reminder: finish your ZekerFlex account",
  aanhef: "Hi {naam},",
  intro: "Your ZekerFlex account is not finished yet. Still to do:",
  knop: "Finish my account",
  hulp: "Questions? Just reply to this email.",
  preheader: "A few minutes of work left: {lijst}.",
  duurt: "It takes a few minutes. After that you can apply for jobs.",
  pushTitel: "Finish your account",
  pushBody: "Still to do: {lijst}.",
  stuk: {
    soort: "choose your work type (freelancer, flex worker or temp worker)",
    branches: "choose the industries you want to work in",
    bsn: "enter your BSN (citizen service number)",
    contract: "sign your temporary-work agreement",
    btw: "enter your Chamber of Commerce, VAT or small-business (KOR) details",
    postcode: "enter your home base (postcode)",
    identiteit: "confirm your identity with an ID scan",
    foto: "add a profile photo",
  },
};

const HERINNERING_PL: HerinneringTeksten = {
  onderwerp: "Twoje konto ZekerFlex jest prawie gotowe",
  onderwerpLaatste: "Ostatnie przypomnienie: dokończ swoje konto ZekerFlex",
  aanhef: "Cześć {naam},",
  intro: "Twoje konto ZekerFlex nie jest jeszcze gotowe. Jeszcze do zrobienia:",
  knop: "Dokończ konto",
  hulp: "Pytania? Po prostu odpowiedz na tego maila.",
  preheader: "Jeszcze kilka minut pracy: {lijst}.",
  duurt: "To zajmie kilka minut. Potem możesz odpowiadać na zlecenia.",
  pushTitel: "Dokończ swoje konto",
  pushBody: "Jeszcze do zrobienia: {lijst}.",
  stuk: {
    soort: "wybierz formę pracy (freelancer, pracownik elastyczny lub pracownik tymczasowy)",
    branches: "wybierz branże, w których chcesz pracować",
    bsn: "wpisz swój numer BSN",
    contract: "podpisz umowę o pracę tymczasową",
    btw: "uzupełnij dane KVK, VAT lub KOR",
    postcode: "wpisz swoją bazę domową (kod pocztowy)",
    identiteit: "potwierdź tożsamość skanem dokumentu",
    foto: "dodaj zdjęcie profilowe",
  },
};

const HERINNERING_RO: HerinneringTeksten = {
  onderwerp: "Contul tău ZekerFlex este aproape gata",
  onderwerpLaatste: "Ultima reamintire: finalizează contul ZekerFlex",
  aanhef: "Salut {naam},",
  intro: "Contul tău ZekerFlex nu este încă finalizat. Mai ai de făcut:",
  knop: "Finalizează contul",
  hulp: "Întrebări? Răspunde pur și simplu la acest e-mail.",
  preheader: "Mai ai câteva minute de lucru: {lijst}.",
  duurt: "Durează câteva minute. După aceea poți aplica la lucrări.",
  pushTitel: "Finalizează-ți contul",
  pushBody: "Mai ai de făcut: {lijst}.",
  stuk: {
    soort: "alege forma de muncă (freelancer, lucrător flexibil sau muncitor temporar)",
    branches: "alege domeniile în care vrei să lucrezi",
    bsn: "introdu numărul tău BSN",
    contract: "semnează contractul de muncă temporară",
    btw: "completează datele KVK, TVA sau KOR",
    postcode: "introdu baza ta de domiciliu (cod poștal)",
    identiteit: "confirmă-ți identitatea cu o scanare a actului",
    foto: "adaugă o fotografie de profil",
  },
};

const HERINNERING_UK: HerinneringTeksten = {
  onderwerp: "Твій обліковий запис ZekerFlex майже готовий",
  onderwerpLaatste: "Останнє нагадування: заверши свій обліковий запис ZekerFlex",
  aanhef: "Привіт, {naam}!",
  intro: "Твій обліковий запис ZekerFlex ще не завершено. Залишилося:",
  knop: "Завершити обліковий запис",
  hulp: "Питання? Просто дай відповідь на цей лист.",
  preheader: "Залишилося кілька хвилин роботи: {lijst}.",
  duurt: "Це займе кілька хвилин. Після цього ти зможеш відгукуватися на роботи.",
  pushTitel: "Заверши свій обліковий запис",
  pushBody: "Залишилося: {lijst}.",
  stuk: {
    soort: "обери форму роботи (фрілансер, гнучкий працівник або тимчасовий працівник)",
    branches: "обери галузі, в яких хочеш працювати",
    bsn: "введи свій номер BSN",
    contract: "підпиши договір тимчасової роботи",
    btw: "заповни дані KVK, ПДВ або KOR",
    postcode: "введи свою домашню базу (поштовий індекс)",
    identiteit: "підтвердь особу скануванням документа",
    foto: "додай фото профілю",
  },
};

export const HERINNERING_TEKSTEN: Record<Locale, HerinneringTeksten> = {
  nl: HERINNERING_NL,
  en: HERINNERING_EN,
  pl: HERINNERING_PL,
  ro: HERINNERING_RO,
  uk: HERINNERING_UK,
};

export interface WerkerHerinnering {
  /** de taal van de mail (voor het lang-attribuut en de regel onderaan) */
  taal?: Locale;
  onderwerp: string;
  aanhef: string;
  intro: string;
  items: { tekst: string; href: string }[];
  duurt: string;
  knop: string;
  hulp: string;
  preheader: string;
  /** voor de push: de lijst als één regel */
  pushTitel: string;
  pushBody: string;
}

/** De herinnering in de taal van de werker, voor deze ontbrekende onderdelen; stap 3 of hoger = "laatste herinnering". */
export function werkerHerinnering(mist: MistStuk[], t: HerinneringTeksten, voornaam: string, stap: number, taal?: Locale): WerkerHerinnering {
  const items = mist.map((m) => ({ tekst: t.stuk[m], href: MIST_HREF[m] }));
  const lijst = items.map((i) => i.tekst).join("; ");
  return {
    ...(taal ? { taal } : {}),
    onderwerp: stap >= 3 ? t.onderwerpLaatste : t.onderwerp,
    aanhef: vulIn(t.aanhef, { naam: voornaam }),
    intro: t.intro,
    items,
    duurt: t.duurt,
    knop: t.knop,
    hulp: t.hulp,
    preheader: vulIn(t.preheader, { lijst }),
    pushTitel: t.pushTitel,
    pushBody: vulIn(t.pushBody, { lijst }),
  };
}
