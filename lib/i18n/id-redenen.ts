import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "@/lib/i18n/config";
import { vulIn } from "@/lib/i18n/vul-in";

// ---------------------------------------------------------------------------
// De redenen van een ID-controle in de app-taal van de werker (13 nov 2026). De werker-app is vijftalig, maar de controles
// (lib/onboarding/verify.ts, lib/kyc/gezicht/) schrijven Nederlands: een Poolse werker las "De naam op het document wijkt af
// van je accountnaam". Gemeten over 30 dagen (echte werkers): dit zijn de redenen die het vaakst faalden, plus de reden van de
// AI-beoordeling die bijna iedereen zag. rawPayload en het beheer houden de Nederlandse tekst; alleen wat naar de werker gaat
// (het antwoord van /api/onboarding, de kaart "Vorige poging") wordt vertaald. Zoals lib/i18n/fouten.ts: de Nederlandse tekst
// hier is gelijk aan die op de plek waar hij ontstaat (tests/id-redenen.test.ts bewaakt dat), een onbekende tekst blijft
// Nederlands. Een plaatshouder {x} komt in elke taal terug; vertaalIdTekst vult hem uit de Nederlandse tekst.
// Puur (geen prisma, geen kv), en niet in de client-bundel nodig: de server vertaalt.
// Machine-assisted translations: native-speaker review recommended.
// ---------------------------------------------------------------------------

type Tekst = Record<Locale, string>;

/** De uitleg bij een controle die faalde (detail) en de redenen van de AI-beoordeling. */
export const ID_REDENEN = {
  "gezicht.twijfel": {
    nl: "Het gezicht op de selfie lijkt op de pasfoto, maar niet zeker genoeg. Een medewerker kijkt mee.",
    en: "The face in the selfie looks like the passport photo, but not certainly enough. A team member will take a look.",
    pl: "Twarz na selfie przypomina zdjęcie z dokumentu, ale nie na tyle pewnie. Sprawdzi to pracownik.",
    ro: "Fața din selfie seamănă cu fotografia din document, dar nu suficient de sigur. Un coleg va verifica.",
    uk: "Обличчя на селфі схоже на фото в документі, але недостатньо впевнено. Співробітник перевірить.",
  },
  "naam.wijktAf": {
    nl: "De naam op het document wijkt af van je accountnaam",
    en: "The name on the document differs from your account name",
    pl: "Imię i nazwisko na dokumencie różni się od nazwy Twojego konta",
    ro: "Numele de pe document diferă de numele contului tău",
    uk: "Ім'я в документі відрізняється від імені твого облікового запису",
  },
  "mrz.nietGevonden": {
    nl: "De code onderop het document is niet gevonden. Maak de foto recht van boven, zonder glans. Een medewerker kijkt mee.",
    en: "The code at the bottom of the document was not found. Take the photo straight from above, without glare. A team member will take a look.",
    pl: "Nie znaleziono kodu na dole dokumentu. Zrób zdjęcie prosto z góry, bez odblasków. Sprawdzi to pracownik.",
    ro: "Codul din partea de jos a documentului nu a fost găsit. Fă fotografia drept de sus, fără reflexii. Un coleg va verifica.",
    uk: "Код унизу документа не знайдено. Сфотографуй рівно згори, без відблисків. Співробітник перевірить.",
  },
  "beweging.nietGedraaid": {
    nl: "Je hoofd was op de tweede selfie niet duidelijk gedraaid. Draai het een klein stukje opzij, naar links of rechts, en maak de foto opnieuw.",
    en: "Your head was not clearly turned in the second selfie. Turn it slightly to the side, left or right, and take the photo again.",
    pl: "Na drugim selfie głowa nie była wyraźnie odwrócona. Odwróć ją lekko w bok, w lewo lub w prawo, i zrób zdjęcie ponownie.",
    ro: "Pe al doilea selfie capul nu era clar întors. Întoarce-l puțin într-o parte, la stânga sau la dreapta, și fă din nou fotografia.",
    uk: "На другому селфі голову не було чітко повернуто. Поверни її трохи вбік, ліворуч або праворуч, і зроби фото ще раз.",
  },
  "beweging.nietAangeleverd": {
    nl: "Er is geen tweede selfie met een gedraaid hoofd. Een medewerker kijkt mee.",
    en: "There is no second selfie with a turned head. A team member will take a look.",
    pl: "Brak drugiego selfie z odwróconą głową. Sprawdzi to pracownik.",
    ro: "Nu există un al doilea selfie cu capul întors. Un coleg va verifica.",
    uk: "Немає другого селфі з повернутою головою. Співробітник перевірить.",
  },
  "beweging.onnatuurlijk": {
    nl: "Het gezicht op de tweede selfie ziet er platgedrukt uit. Maak de foto opnieuw, draai alleen je hoofd en houd de camera recht voor je.",
    en: "The face in the second selfie looks flattened. Take the photo again, turn only your head and hold the camera straight in front of you.",
    pl: "Twarz na drugim selfie wygląda na spłaszczoną. Zrób zdjęcie ponownie, odwróć tylko głowę i trzymaj aparat prosto przed sobą.",
    ro: "Fața din al doilea selfie pare turtită. Fă din nou fotografia, întoarce doar capul și ține camera drept în fața ta.",
    uk: "Обличчя на другому селфі виглядає сплющеним. Зроби фото ще раз, повертай лише голову й тримай камеру рівно перед собою.",
  },
  "kvk.nietBereikbaar": {
    nl: "Het KVK-register was even niet bereikbaar. Een medewerker kijkt mee.",
    en: "The KVK business register was briefly unavailable. A team member will take a look.",
    pl: "Rejestr KVK był chwilowo niedostępny. Sprawdzi to pracownik.",
    ro: "Registrul KVK a fost temporar indisponibil. Un coleg va verifica.",
    uk: "Реєстр KVK був тимчасово недоступний. Співробітник перевірить.",
  },
  // tegoed op of minuutlimiet bij de KVK-dienst: de controle wacht en een cron probeert hem later (lib/kvk/herkansing.ts)
  "kvk.later": {
    nl: "We controleren je KVK-nummer later; je kunt verder met je aanmelding.",
    en: "We will check your KVK number later; you can continue with your sign-up.",
    pl: "Sprawdzimy Twój numer KVK później; możesz kontynuować rejestrację.",
    ro: "Îți vom verifica numărul KVK mai târziu; poți continua înregistrarea.",
    uk: "Ми перевіримо твій номер KVK пізніше; ти можеш продовжити реєстрацію.",
  },
  "vies.ongeldig": {
    nl: "{nummer} is volgens de EU-database (VIES) niet geldig.",
    en: "According to the EU database (VIES), {nummer} is not valid.",
    pl: "Według bazy danych UE (VIES) numer {nummer} jest nieważny.",
    ro: "Conform bazei de date a UE (VIES), {nummer} nu este valid.",
    uk: "За базою даних ЄС (VIES) номер {nummer} недійсний.",
  },
  "ai.nietBeschikbaar": {
    nl: "De automatische beoordeling was tijdelijk niet beschikbaar; een controleur kijkt ernaar.",
    en: "The automatic review was temporarily unavailable; a reviewer will look at it.",
    pl: "Automatyczna ocena była chwilowo niedostępna; sprawdzi to weryfikator.",
    ro: "Evaluarea automată a fost temporar indisponibilă; un verificator se va uita.",
    uk: "Автоматична перевірка була тимчасово недоступна; її перегляне перевіряльник.",
  },
} as const satisfies Record<string, Tekst>;

/** De namen van de controles bij die redenen (het uitslagscherm toont naam en uitleg samen). */
export const ID_LABELS = {
  "label.gezicht": {
    nl: "Gezicht komt overeen met de pasfoto op het document (gezichtscontrole)",
    en: "Face matches the photo on the document (face check)",
    pl: "Twarz zgadza się ze zdjęciem w dokumencie (kontrola twarzy)",
    ro: "Fața corespunde cu fotografia din document (verificarea feței)",
    uk: "Обличчя збігається з фото в документі (перевірка обличчя)",
  },
  "label.naam": {
    nl: "Naam komt overeen",
    en: "Name matches",
    pl: "Imię i nazwisko się zgadzają",
    ro: "Numele corespunde",
    uk: "Ім'я збігається",
  },
  "label.naamDocument": {
    nl: "Naam op het document komt overeen met je account",
    en: "Name on the document matches your account",
    pl: "Imię i nazwisko na dokumencie zgadzają się z Twoim kontem",
    ro: "Numele de pe document corespunde cu contul tău",
    uk: "Ім'я в документі збігається з твоїм обліковим записом",
  },
  "label.mrz": {
    nl: "Code op het document gelezen (MRZ)",
    en: "Code on the document read (MRZ)",
    pl: "Odczytano kod z dokumentu (MRZ)",
    ro: "Codul de pe document a fost citit (MRZ)",
    uk: "Код у документі прочитано (MRZ)",
  },
  "label.beweging": {
    nl: "Hoofd gedraaid op de tweede selfie (bewegingscontrole)",
    en: "Head turned in the second selfie (movement check)",
    pl: "Głowa odwrócona na drugim selfie (kontrola ruchu)",
    ro: "Capul întors pe al doilea selfie (verificarea mișcării)",
    uk: "Голову повернуто на другому селфі (перевірка руху)",
  },
  "label.kvk": {
    nl: "KVK Handelsregister",
    en: "KVK business register",
    pl: "Rejestr handlowy KVK",
    ro: "Registrul comerțului KVK",
    uk: "Торговий реєстр KVK",
  },
  "label.vies": {
    nl: "Btw-nummer (EU, VIES)",
    en: "VAT number (EU, VIES)",
    pl: "Numer VAT (UE, VIES)",
    ro: "Cod de TVA (UE, VIES)",
    uk: "Номер ПДВ (ЄС, VIES)",
  },
  // de overige namen van controles die de werker ziet (de interne, intern: true, gaan nooit naar de werker)
  "label.thuisbasis": {
    nl: "Thuisbasis",
    en: "Home base",
    pl: "Miejsce zamieszkania",
    ro: "Baza de acasă",
    uk: "Домашня база",
  },
  "label.werkvorm": {
    nl: "Werkvorm",
    en: "Work type",
    pl: "Forma pracy",
    ro: "Formă de muncă",
    uk: "Форма роботи",
  },
  "label.fotos": {
    nl: "Documentfoto's (voor-, achterkant, selfie)",
    en: "Document photos (front, back, selfie)",
    pl: "Zdjęcia dokumentu (przód, tył, selfie)",
    ro: "Fotografiile documentului (față, verso, selfie)",
    uk: "Фото документа (лицьовий бік, зворотний бік, селфі)",
  },
  "label.documentnummer": {
    nl: "Documentnummer",
    en: "Document number",
    pl: "Numer dokumentu",
    ro: "Numărul documentului",
    uk: "Номер документа",
  },
  "label.geldigheid": {
    nl: "Geldigheid document",
    en: "Document validity",
    pl: "Ważność dokumentu",
    ro: "Valabilitatea documentului",
    uk: "Чинність документа",
  },
  "label.nummerOvereen": {
    nl: "Documentnummer komt overeen met het document",
    en: "Document number matches the document",
    pl: "Numer dokumentu zgadza się z dokumentem",
    ro: "Numărul documentului corespunde cu documentul",
    uk: "Номер документа збігається з документом",
  },
  "label.echtheid": {
    nl: "Documentfoto-echtheid (beeldcontrole)",
    en: "Document photo authenticity (image check)",
    pl: "Autentyczność zdjęcia dokumentu (kontrola obrazu)",
    ro: "Autenticitatea fotografiei documentului (verificarea imaginii)",
    uk: "Справжність фото документа (перевірка зображення)",
  },
  "label.gezichtBeeld": {
    nl: "Gezicht komt overeen met document (beeldcontrole)",
    en: "Face matches the document (image check)",
    pl: "Twarz zgadza się z dokumentem (kontrola obrazu)",
    ro: "Fața corespunde cu documentul (verificarea imaginii)",
    uk: "Обличчя збігається з документом (перевірка зображення)",
  },
  "label.spoof": {
    nl: "Spoof-controle op de selfie (heuristisch, geen echte liveness-check)",
    en: "Spoof check on the selfie (heuristic, not a real liveness check)",
    pl: "Kontrola podróbki na selfie (heurystyczna, nie prawdziwa kontrola żywotności)",
    ro: "Verificare anti-falsificare a selfie-ului (euristică, nu o verificare reală a prezenței)",
    uk: "Перевірка селфі на підробку (евристична, не справжня перевірка живості)",
  },
  "label.chip": {
    nl: "Chip van het document gelezen (NFC)",
    en: "Document chip read (NFC)",
    pl: "Odczytano chip dokumentu (NFC)",
    ro: "Cipul documentului a fost citit (NFC)",
    uk: "Чип документа прочитано (NFC)",
  },
  "label.werkrecht": {
    nl: "Recht om te werken in Nederland",
    en: "Right to work in the Netherlands",
    pl: "Prawo do pracy w Holandii",
    ro: "Dreptul de a lucra în Țările de Jos",
    uk: "Право на роботу в Нідерландах",
  },
  "label.leeftijd": {
    nl: "Leeftijd",
    en: "Age",
    pl: "Wiek",
    ro: "Vârstă",
    uk: "Вік",
  },
  "label.telefoon": {
    nl: "Ingestuurd vanaf je telefoon",
    en: "Sent from your phone",
    pl: "Wysłano z telefonu",
    ro: "Trimis de pe telefon",
    uk: "Надіслано з телефона",
  },
  "label.telefoonEerder": {
    nl: "Eerder via je telefoon ingestuurd",
    en: "Sent earlier via your phone",
    pl: "Wcześniej wysłano przez telefon",
    ro: "Trimis anterior prin telefon",
    uk: "Раніше надіслано через телефон",
  },
  "label.wallet": {
    nl: "Digitale ID-wallet",
    en: "Digital ID wallet",
    pl: "Cyfrowy portfel ID",
    ro: "Portofel digital de identitate",
    uk: "Цифровий ID-гаманець",
  },
} as const satisfies Record<string, Tekst>;

export type IdRedenSleutel = keyof typeof ID_REDENEN | keyof typeof ID_LABELS;

/**
 * Oudere Nederlandse (of Engelse) teksten die al in rawPayload staan, met de sleutel van nu: een poging van vóór een
 * tekstwijziging wordt dan ook vertaald.
 */
const OUD: Record<string, IdRedenSleutel> = {
  "Je hoofd was op de tweede selfie niet duidelijk gedraaid. Draai het een kwartslag naar links of rechts en maak de foto opnieuw.": "beweging.nietGedraaid",
  // de technische melding van de KVK-dienst kwam tot 13 nov rechtstreeks bij de werker (in het Engels)
  "KVKBase rate limit reached, retry shortly": "kvk.nietBereikbaar",
  "KVKBase token quota exhausted": "kvk.nietBereikbaar",
};

const ALLES: Record<string, Tekst> = { ...ID_REDENEN, ...ID_LABELS };

/** De Nederlandse tekst van een sleutel: voor de plek waar de reden ontstaat (één bron, geen tweede kopie). */
export function idRedenNl(sleutel: keyof typeof ID_REDENEN): string {
  return ID_REDENEN[sleutel].nl;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Per sleutel een patroon van de Nederlandse tekst, met een groep per plaatshouder. */
const PATRONEN: { sleutel: IdRedenSleutel; namen: string[]; re: RegExp }[] = Object.entries(ALLES)
  .filter(([, t]) => /\{\w+\}/.test(t.nl))
  .map(([sleutel, t]) => {
    const namen = [...t.nl.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? "");
    const re = new RegExp(`^${escape(t.nl).replace(/\\\{\w+\\\}/g, "(.+?)")}$`, "u");
    return { sleutel: sleutel as IdRedenSleutel, namen, re };
  });

/** Welke sleutel hoort bij deze (Nederlandse) tekst, met de waarden van de plaatshouders; null = onbekend. */
export function idRedenSleutel(nl: string): { sleutel: IdRedenSleutel; waarden: Record<string, string> } | null {
  const tekst = nl.trim();
  for (const [sleutel, t] of Object.entries(ALLES)) if (t.nl === tekst) return { sleutel: sleutel as IdRedenSleutel, waarden: {} };
  if (Object.hasOwn(OUD, tekst)) return { sleutel: OUD[tekst] as IdRedenSleutel, waarden: {} };
  for (const p of PATRONEN) {
    const m = p.re.exec(tekst);
    if (m) return { sleutel: p.sleutel, waarden: Object.fromEntries(p.namen.map((n, i) => [n, m[i + 1] ?? ""])) };
  }
  return null;
}

/** De tekst in de taal van de werker; een onbekende tekst (of Nederlands) blijft zoals hij is. */
export function vertaalIdTekst(nl: string, locale: Locale): string {
  if (locale === "nl") return nl;
  const gevonden = idRedenSleutel(nl);
  if (!gevonden) return nl;
  const tekst = ALLES[gevonden.sleutel]?.[locale];
  return tekst ? vulIn(tekst, gevonden.waarden) : nl;
}

/** De app-taal uit de cookie van dit verzoek (zonder next/headers, dus ook los te testen); anders Nederlands. */
export function taalVanVerzoek(request: Request): Locale {
  for (const deel of (request.headers.get("cookie") ?? "").split(";")) {
    const i = deel.indexOf("=");
    if (i > 0 && deel.slice(0, i).trim() === LOCALE_COOKIE) {
      const waarde = deel.slice(i + 1).trim();
      return isLocale(waarde) ? waarde : DEFAULT_LOCALE;
    }
  }
  return DEFAULT_LOCALE;
}

interface Controle {
  label: string;
  ok: boolean;
  detail: string;
}

/**
 * Het antwoord van een ID-controle voor de werker: de naam en uitleg van elke controle en de redenen vertaald, met de
 * sleutel erbij (een client kan er zelf op vertalen). Al het andere blijft zoals het is.
 */
export function idUitslagVoorWerker<T extends { checks?: Controle[]; reasons?: string[] }>(uitslag: T, locale: Locale): T {
  if (locale === "nl") return uitslag;
  return {
    ...uitslag,
    ...(uitslag.checks
      ? {
          checks: uitslag.checks.map((c) => {
            const sleutel = idRedenSleutel(c.detail)?.sleutel;
            return { ...c, label: vertaalIdTekst(c.label, locale), detail: vertaalIdTekst(c.detail, locale), ...(sleutel ? { sleutel } : {}) };
          }),
        }
      : {}),
    ...(uitslag.reasons ? { reasons: uitslag.reasons.map((r) => vertaalIdTekst(r, locale)) } : {}),
  };
}
