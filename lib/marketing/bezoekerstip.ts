// ---------------------------------------------------------------------------
// De teksten van de bezoekerstip (components/marketing/VisitorNudge.tsx) in vijf talen, en welke tekst bij welke tip hoort.
// Puur bestand: de tip (client) en de tests lezen het allebei.
// ---------------------------------------------------------------------------

export type Kind = "bedrijf" | "werk" | "exit";

// 22 nov 2026 (gebruikersonderzoek punt 2): geen beloftes die niet kloppen. "werk" en "exit" (met de knop naar de open klussen)
// alleen als er echt een klus open staat (lib/marketing/echte-klussen.ts); anders de eerlijke "werkStart"/"exitStart". Nergens
// meer de belofte dat je meteen kunt reageren: eerst zijn er de ID-check en de stappen. Bedrijven: hun klus komt bij werkers in de buurt, zonder "direct".
export type CopyKey = Kind | "werkStart" | "exitStart";
export type Copy = { title: string; body: string; cta: string; href: string };
export const COPY: Record<string, Record<CopyKey, Copy>> = {
  nl: {
    bedrijf: { title: "Zet je eerste klus uit", body: "Plaats een dienst: je klus komt bij geverifieerde flexkrachten in de buurt. Je betaalt alleen € 3,50 per gewerkt uur.", cta: "Plaats een klus", href: "/klus-plaatsen" },
    werk: { title: "Er staan klussen open", body: "Maak in 2 minuten gratis je profiel. Na je ID-check kun je reageren.", cta: "Maak gratis je profiel", href: "/register?type=freelancer" },
    werkStart: { title: "We starten nu in jouw regio", body: "Meld je aan en hoor als eerste van nieuwe klussen.", cta: "Maak gratis je profiel", href: "/register?type=freelancer" },
    exit: { title: "Nog even, voor je gaat…", body: "Werken via ZekerFlex is gratis — ook zonder KVK, als uitzendkracht via een aangesloten uitzendbureau.", cta: "Bekijk open klussen", href: "/klussen" },
    exitStart: { title: "Nog even, voor je gaat…", body: "Werken via ZekerFlex is gratis — ook zonder KVK, als uitzendkracht via een aangesloten uitzendbureau.", cta: "Maak gratis je profiel", href: "/register?type=freelancer" },
  },
  en: {
    bedrijf: { title: "Post your first job", body: "Post a shift: your job reaches verified flex workers nearby. You only pay € 3.50 per hour worked.", cta: "Post a job", href: "/klus-plaatsen" },
    werk: { title: "Jobs are open now", body: "Create your free profile in 2 minutes. After your ID check you can respond.", cta: "Create your free profile", href: "/register?type=freelancer" },
    werkStart: { title: "We're starting in your region now", body: "Sign up and be the first to hear about new jobs.", cta: "Create your free profile", href: "/register?type=freelancer" },
    exit: { title: "One moment before you go…", body: "Working through ZekerFlex is free — even without a KVK, as a temp worker via an affiliated staffing agency.", cta: "See open jobs", href: "/klussen" },
    exitStart: { title: "One moment before you go…", body: "Working through ZekerFlex is free — even without a KVK, as a temp worker via an affiliated staffing agency.", cta: "Create your free profile", href: "/register?type=freelancer" },
  },
  pl: {
    bedrijf: { title: "Dodaj pierwsze zlecenie", body: "Dodaj zmianę: zlecenie trafi do zweryfikowanych pracowników w okolicy. Płacisz tylko € 3,50 za przepracowaną godzinę.", cta: "Dodaj zlecenie", href: "/klus-plaatsen" },
    werk: { title: "Są otwarte zlecenia", body: "Załóż darmowy profil w 2 minuty. Po sprawdzeniu dokumentu tożsamości możesz się zgłaszać.", cta: "Załóż darmowy profil", href: "/register?type=freelancer" },
    werkStart: { title: "Właśnie startujemy w Twoim regionie", body: "Zarejestruj się i jako pierwszy dowiedz się o nowych zleceniach.", cta: "Załóż darmowy profil", href: "/register?type=freelancer" },
    exit: { title: "Chwilka, zanim wyjdziesz…", body: "Praca przez ZekerFlex jest darmowa — także bez KVK, jako pracownik tymczasowy przez współpracującą agencję pracy.", cta: "Zobacz zlecenia", href: "/klussen" },
    exitStart: { title: "Chwilka, zanim wyjdziesz…", body: "Praca przez ZekerFlex jest darmowa — także bez KVK, jako pracownik tymczasowy przez współpracującą agencję pracy.", cta: "Załóż darmowy profil", href: "/register?type=freelancer" },
  },
  ro: {
    bedrijf: { title: "Publică primul job", body: "Publică o tură: jobul ajunge la lucrători verificați din zonă. Plătești doar € 3,50 pe oră lucrată.", cta: "Publică un job", href: "/klus-plaatsen" },
    werk: { title: "Sunt joburi deschise", body: "Creează-ți gratuit profilul în 2 minute. După verificarea actului de identitate poți aplica.", cta: "Creează profil gratuit", href: "/register?type=freelancer" },
    werkStart: { title: "Acum pornim în regiunea ta", body: "Înscrie-te și află primul despre joburile noi.", cta: "Creează profil gratuit", href: "/register?type=freelancer" },
    exit: { title: "O clipă, înainte să pleci…", body: "Munca prin ZekerFlex este gratuită — și fără KVK, ca lucrător temporar printr-o agenție de muncă parteneră.", cta: "Vezi joburile", href: "/klussen" },
    exitStart: { title: "O clipă, înainte să pleci…", body: "Munca prin ZekerFlex este gratuită — și fără KVK, ca lucrător temporar printr-o agenție de muncă parteneră.", cta: "Creează profil gratuit", href: "/register?type=freelancer" },
  },
  uk: {
    bedrijf: { title: "Розмісти першу роботу", body: "Розмісти зміну: її побачать перевірені працівники поруч. Платиш лише € 3,50 за відпрацьовану годину.", cta: "Розмістити роботу", href: "/klus-plaatsen" },
    werk: { title: "Є відкриті роботи", body: "Створи безкоштовний профіль за 2 хвилини. Після перевірки документа можна відгукуватися.", cta: "Створити профіль", href: "/register?type=freelancer" },
    werkStart: { title: "Ми саме починаємо у твоєму регіоні", body: "Зареєструйся й першим дізнавайся про нові роботи.", cta: "Створити профіль", href: "/register?type=freelancer" },
    exit: { title: "Хвилинку, перш ніж піти…", body: "Робота через ZekerFlex безкоштовна — навіть без KVK, як тимчасовий працівник через агенцію-партнера.", cta: "Переглянути роботи", href: "/klussen" },
    exitStart: { title: "Хвилинку, перш ніж піти…", body: "Робота через ZekerFlex безкоштовна — навіть без KVK, як тимчасовий працівник через агенцію-партнера.", cta: "Створити профіль", href: "/register?type=freelancer" },
  },
};

/** Welke tekst bij deze tip hoort: zonder echte open klus nooit een belofte van klussen (puur, voor de test). */
export function copyKeyVoor(kind: Kind, echteKlussen: boolean): CopyKey {
  if (kind === "werk") return echteKlussen ? "werk" : "werkStart";
  if (kind === "exit") return echteKlussen ? "exit" : "exitStart";
  return kind;
}
