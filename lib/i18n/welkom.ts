import type { Locale } from "@/lib/i18n/config";

// ---------------------------------------------------------------------------
// Teksten van de mobiele welkomstflow (/welkom) en de kop van de mobiele
// login/registreren-weergave, in de vijf talen van de werkerkant. Puur: geen
// imports behalve het type, dus veilig in server- én clientcode.
// Alleen wat waar is: gratis voor werkers, zelf kiezen, klussen in meerdere
// branches, uren en uitbetaling via ZekerFlex, en nog in opbouw (testklussen).
// ---------------------------------------------------------------------------

export interface WelkomSlideTekst {
  title: string;
  text: string;
  /** beschrijving van de foto voor schermlezers */
  alt: string;
}

export interface WelkomDict {
  lang: string;
  carousel: string;
  /** "{n}" en "{total}" worden ingevuld */
  slideOf: string;
  prev: string;
  next: string;
  slides: [WelkomSlideTekst, WelkomSlideTekst, WelkomSlideTekst];
  note: string;
  create: string;
  login: string;
  back: string;
  loginHero: { title: string; subtitle: string };
  registerHero: { title: string; subtitle: string };
}

const nl: WelkomDict = {
  lang: "Taal",
  carousel: "Welkom bij ZekerFlex",
  slideOf: "Slide {n} van {total}",
  prev: "Vorige",
  next: "Volgende",
  slides: [
    {
      title: "Werk waar en wanneer jij wilt",
      text: "Jij kiest welke klussen je doet, in jouw buurt en op jouw tijden.",
      alt: "Lachende medewerkster in een horecakeuken",
    },
    {
      title: "Klussen in veel branches",
      text: "Horeca, logistiek, retail, schoonmaak, zorg en meer. Bekijk wat er is en reageer in de app.",
      alt: "Medewerker in bodywarmer in een magazijn",
    },
    {
      title: "Uren en uitbetaling geregeld",
      text: "Je uren en je uitbetaling lopen via ZekerFlex. Voor werkers is het gratis.",
      alt: "Twee collega’s aan het werk in een magazijn",
    },
  ],
  note: "ZekerFlex is nog in opbouw: de klussen die je nu ziet zijn testklussen.",
  create: "Account aanmaken",
  login: "Inloggen",
  back: "Terug",
  loginHero: { title: "Welkom terug!", subtitle: "Log in om verder te gaan." },
  registerHero: { title: "Account aanmaken", subtitle: "Gratis voor werkers." },
};

const en: WelkomDict = {
  lang: "Language",
  carousel: "Welcome to ZekerFlex",
  slideOf: "Slide {n} of {total}",
  prev: "Previous",
  next: "Next",
  slides: [
    {
      title: "Work where and when you want",
      text: "You choose which jobs you take, near you and at your times.",
      alt: "Smiling worker in a restaurant kitchen",
    },
    {
      title: "Jobs in many sectors",
      text: "Hospitality, logistics, retail, cleaning, care and more. See what is available and respond in the app.",
      alt: "Worker in a bodywarmer in a warehouse",
    },
    {
      title: "Hours and payment taken care of",
      text: "Your hours and your payout run through ZekerFlex. It is free for workers.",
      alt: "Two colleagues working in a warehouse",
    },
  ],
  note: "ZekerFlex is still being built: the jobs you see now are test jobs.",
  create: "Create account",
  login: "Log in",
  back: "Back",
  loginHero: { title: "Welcome back!", subtitle: "Log in to continue." },
  registerHero: { title: "Create account", subtitle: "Free for workers." },
};

const pl: WelkomDict = {
  lang: "Język",
  carousel: "Witamy w ZekerFlex",
  slideOf: "Slajd {n} z {total}",
  prev: "Poprzedni",
  next: "Następny",
  slides: [
    {
      title: "Pracuj gdzie i kiedy chcesz",
      text: "Sam wybierasz, jakie zlecenia bierzesz, w swojej okolicy i w swoich godzinach.",
      alt: "Uśmiechnięta pracownica w kuchni restauracji",
    },
    {
      title: "Zlecenia w wielu branżach",
      text: "Gastronomia, logistyka, handel, sprzątanie, opieka i więcej. Zobacz, co jest dostępne, i zgłoś się w aplikacji.",
      alt: "Pracownik w kamizelce w magazynie",
    },
    {
      title: "Godziny i wypłata załatwione",
      text: "Twoje godziny i wypłata przechodzą przez ZekerFlex. Dla pracowników jest za darmo.",
      alt: "Dwoje współpracowników w magazynie",
    },
  ],
  note: "ZekerFlex jest jeszcze w budowie: zlecenia, które teraz widzisz, to zlecenia testowe.",
  create: "Utwórz konto",
  login: "Zaloguj się",
  back: "Wstecz",
  loginHero: { title: "Witaj ponownie!", subtitle: "Zaloguj się, aby kontynuować." },
  registerHero: { title: "Utwórz konto", subtitle: "Dla pracowników za darmo." },
};

const ro: WelkomDict = {
  lang: "Limbă",
  carousel: "Bun venit la ZekerFlex",
  slideOf: "Slide {n} din {total}",
  prev: "Înapoi",
  next: "Înainte",
  slides: [
    {
      title: "Lucrezi unde și când vrei",
      text: "Tu alegi ce lucrări faci, aproape de tine și la orele tale.",
      alt: "Angajată zâmbitoare într-o bucătărie de restaurant",
    },
    {
      title: "Lucrări în multe domenii",
      text: "HoReCa, logistică, retail, curățenie, îngrijire și altele. Vezi ce este disponibil și aplică în aplicație.",
      alt: "Angajat în vestă într-un depozit",
    },
    {
      title: "Orele și plata, rezolvate",
      text: "Orele tale și plata trec prin ZekerFlex. Pentru lucrători este gratuit.",
      alt: "Doi colegi la lucru într-un depozit",
    },
  ],
  note: "ZekerFlex este încă în construcție: lucrările pe care le vezi acum sunt lucrări de test.",
  create: "Creează cont",
  login: "Autentificare",
  back: "Înapoi",
  loginHero: { title: "Bine ai revenit!", subtitle: "Autentifică-te ca să continui." },
  registerHero: { title: "Creează cont", subtitle: "Gratuit pentru lucrători." },
};

const uk: WelkomDict = {
  lang: "Мова",
  carousel: "Ласкаво просимо до ZekerFlex",
  slideOf: "Слайд {n} з {total}",
  prev: "Назад",
  next: "Далі",
  slides: [
    {
      title: "Працюй де і коли хочеш",
      text: "Ти сам обираєш, які підробітки брати, поруч із тобою і в зручний час.",
      alt: "Усміхнена працівниця на кухні ресторану",
    },
    {
      title: "Підробітки в багатьох галузях",
      text: "Ресторани, логістика, роздріб, прибирання, догляд та інше. Дивись, що є, і відгукуйся в застосунку.",
      alt: "Працівник у жилеті на складі",
    },
    {
      title: "Години й виплата — вирішено",
      text: "Твої години та виплата проходять через ZekerFlex. Для працівників це безкоштовно.",
      alt: "Двоє колег працюють на складі",
    },
  ],
  note: "ZekerFlex ще створюється: підробітки, які ти бачиш зараз, є тестовими.",
  create: "Створити акаунт",
  login: "Увійти",
  back: "Назад",
  loginHero: { title: "З поверненням!", subtitle: "Увійди, щоб продовжити." },
  registerHero: { title: "Створити акаунт", subtitle: "Для працівників безкоштовно." },
};

export const WELKOM_DICTS: Record<Locale, WelkomDict> = { nl, en, pl, ro, uk };
