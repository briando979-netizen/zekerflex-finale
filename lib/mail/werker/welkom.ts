// Machine-assisted translations: native-speaker review recommended.
// De welkomstmail na het bevestigen van het e-mailadres (was welcomeEmail in lib/mail/index.ts), in de app-taal van de werker. Een
// opdrachtgever ("bedrijf") krijgt altijd Nederlands. In het Nederlands is de uitvoer byte voor byte gelijk aan vóór de vertaling
// (tests/mail-werker-nl.test.ts). Puur: importeer nooit uit "@/lib/mail" zelf (kringverwijzing), alleen het type.
import type { MailInput } from "@/lib/mail";
import { button, escapeHtml, shell, type MailTaal } from "@/lib/mail/vorm";
import { vulIn } from "@/lib/i18n/vul-in";

interface WelkomTekst {
  subject: string;
  hoi: string;
  bevestigd: string;
  volgende: string;
  inloggen: string;
  vragen: string;
  introHtml: string;
  nextBedrijf: string;
  nextUitzend: string;
  nextZzp: string;
  knop: string;
  preheader: string;
  goedOm: string;
  notitie: string;
}

const TEKST: Record<MailTaal, WelkomTekst> = {
  nl: {
    subject: "Welkom bij ZekerFlex",
    hoi: "Hoi {naam},",
    bevestigd: "Je e-mailadres is bevestigd en je ZekerFlex-account is klaar.",
    volgende: "Volgende stap:",
    inloggen: "Inloggen:",
    vragen: "Vragen? Mail support@zekerflex.com.",
    introHtml: "Hoi {naam}, je e-mailadres is bevestigd en je account is klaar. Fijn dat je er bent.",
    nextBedrijf: "Rond de onboarding van je organisatie af (KVK + eerste vestiging) en zet je eerste dienst uit.",
    nextUitzend: "Rond je verificatie af (identiteit + rekeningnummer — geen KVK nodig) en bekijk de eerste klussen die bij je passen.",
    nextZzp: "Rond je verificatie af (KVK of btw-nummer + identiteit) en bekijk de eerste klussen die bij je passen.",
    knop: "Naar ZekerFlex",
    preheader: "Je account is klaar. Dit is je volgende stap.",
    goedOm: "Goed om te weten",
    notitie:
      "ZekerFlex is nog in ontwikkeling. De klussen die je ziet zijn testklussen: geen echt werk, je hoeft er niet heen en er hoort geen betaling bij. Begin volgend jaar gaan we online. Je kunt nu al proeven en bekijken hoe het er straks uitziet.",
  },
  en: {
    subject: "Welcome to ZekerFlex",
    hoi: "Hi {naam},",
    bevestigd: "Your email address is confirmed and your ZekerFlex account is ready.",
    volgende: "Next step:",
    inloggen: "Log in:",
    vragen: "Questions? Email support@zekerflex.com.",
    introHtml: "Hi {naam}, your email address is confirmed and your account is ready. Great to have you here.",
    nextBedrijf: "Finish your organisation's onboarding (KVK + first location) and post your first shift.",
    nextUitzend: "Finish your verification (identity + bank account — no KVK needed) and have a look at the first jobs that suit you.",
    nextZzp: "Finish your verification (KVK or VAT number + identity) and have a look at the first jobs that suit you.",
    knop: "Go to ZekerFlex",
    preheader: "Your account is ready. This is your next step.",
    goedOm: "Good to know",
    notitie:
      "ZekerFlex is still in development. The jobs you see are test jobs: no real work, you don't have to go anywhere and there is no payment. We go online early next year. You can already try it out and see what it will look like.",
  },
  pl: {
    subject: "Witaj w ZekerFlex",
    hoi: "Cześć {naam},",
    bevestigd: "Twój adres e-mail jest potwierdzony, a Twoje konto ZekerFlex jest gotowe.",
    volgende: "Następny krok:",
    inloggen: "Zaloguj się:",
    vragen: "Pytania? Napisz na support@zekerflex.com.",
    introHtml: "Cześć {naam}, Twój adres e-mail jest potwierdzony, a Twoje konto jest gotowe. Miło, że jesteś.",
    nextBedrijf: "Dokończ wdrożenie swojej organizacji (KVK + pierwsza lokalizacja) i dodaj swoją pierwszą zmianę.",
    nextUitzend: "Dokończ weryfikację (tożsamość + numer konta — KVK nie jest potrzebny) i zobacz pierwsze zlecenia, które do Ciebie pasują.",
    nextZzp: "Dokończ weryfikację (KVK lub numer VAT + tożsamość) i zobacz pierwsze zlecenia, które do Ciebie pasują.",
    knop: "Przejdź do ZekerFlex",
    preheader: "Twoje konto jest gotowe. To Twój następny krok.",
    goedOm: "Warto wiedzieć",
    notitie:
      "ZekerFlex jest nadal w rozwoju. Zlecenia, które widzisz, to zlecenia testowe: bez prawdziwej pracy, nie musisz nigdzie jechać i nie ma żadnej płatności. Na początku przyszłego roku wystartujemy online. Już teraz możesz wszystko wypróbować i zobaczyć, jak to będzie wyglądać.",
  },
  ro: {
    subject: "Bun venit la ZekerFlex",
    hoi: "Salut {naam},",
    bevestigd: "Adresa ta de e-mail este confirmată și contul tău ZekerFlex este gata.",
    volgende: "Pasul următor:",
    inloggen: "Autentificare:",
    vragen: "Întrebări? Scrie la support@zekerflex.com.",
    introHtml: "Salut {naam}, adresa ta de e-mail este confirmată și contul tău este gata. Ne bucurăm că ești aici.",
    nextBedrijf: "Finalizează înregistrarea organizației tale (KVK + prima locație) și publică prima ta tură.",
    nextUitzend: "Finalizează verificarea (identitate + cont bancar — nu ai nevoie de KVK) și vezi primele joburi care ți se potrivesc.",
    nextZzp: "Finalizează verificarea (KVK sau cod de TVA + identitate) și vezi primele joburi care ți se potrivesc.",
    knop: "Mergi la ZekerFlex",
    preheader: "Contul tău este gata. Acesta este următorul tău pas.",
    goedOm: "Bine de știut",
    notitie:
      "ZekerFlex este încă în dezvoltare. Joburile pe care le vezi sunt joburi de test: fără muncă reală, nu trebuie să mergi nicăieri și nu există plată. Pornim online la începutul anului viitor. Poți încerca deja și vedea cum va arăta.",
  },
  uk: {
    subject: "Ласкаво просимо до ZekerFlex",
    hoi: "Привіт, {naam},",
    bevestigd: "Твою електронну адресу підтверджено, і твій обліковий запис ZekerFlex готовий.",
    volgende: "Наступний крок:",
    inloggen: "Увійти:",
    vragen: "Є запитання? Напиши на support@zekerflex.com.",
    introHtml: "Привіт, {naam}, твою електронну адресу підтверджено, і твій обліковий запис готовий. Радий, що ти з нами.",
    nextBedrijf: "Заверши реєстрацію своєї організації (KVK + перша локація) і додай свою першу зміну.",
    nextUitzend: "Заверши верифікацію (особа + банківський рахунок — KVK не потрібен) і подивись перші роботи, які тобі підходять.",
    nextZzp: "Заверши верифікацію (KVK або номер ПДВ + особа) і подивись перші роботи, які тобі підходять.",
    knop: "Перейти до ZekerFlex",
    preheader: "Твій обліковий запис готовий. Ось твій наступний крок.",
    goedOm: "Варто знати",
    notitie:
      "ZekerFlex ще в розробці. Роботи, які ти бачиш, — тестові: без справжньої роботи, їхати нікуди не треба, і оплати немає. Ми запускаємося онлайн на початку наступного року. Ти вже зараз можеш спробувати й побачити, як це виглядатиме.",
  },
};

// De korte regels in de andere talen onderaan de Nederlandse mail (een Nederlandse lezer kan een andere moedertaal hebben).
const ONTWIKKELING_TALEN: { taal: string; tekst: string }[] = [
  { taal: "English", tekst: "ZekerFlex is still in development and the jobs you see are test jobs: no real work, no payment. We go online early next year." },
  { taal: "Polski", tekst: "ZekerFlex jest nadal w rozwoju, a zlecenia, które widzisz, to zlecenia testowe: bez prawdziwej pracy i bez płatności. Na początku przyszłego roku wystartujemy online." },
  { taal: "Română", tekst: "ZekerFlex este încă în dezvoltare, iar joburile pe care le vezi sunt joburi de test: fără muncă reală și fără plată. Pornim online la începutul anului viitor." },
  { taal: "Українською", tekst: "ZekerFlex ще в розробці, а завдання, які ви бачите, — тестові: без справжньої роботи й без оплати. Ми запускаємося онлайн на початку наступного року." },
];

export function welcomeEmailT(
  fullName: string,
  type: "freelancer" | "bedrijf",
  appUrl: string,
  workerKind: "zzp" | "flexwerker" | "uitzendkracht" | undefined,
  opties: { ontwikkelingsnotitie?: boolean },
  taal: MailTaal,
): MailInput {
  // een opdrachtgever leest altijd Nederlands
  const lang: MailTaal = type === "bedrijf" ? "nl" : taal;
  const t = TEKST[lang];
  const first = fullName.split(" ")[0] || fullName;
  const base = appUrl.replace(/\/+$/, "");
  const next = type === "bedrijf" ? t.nextBedrijf : workerKind === "uitzendkracht" ? t.nextUitzend : t.nextZzp;
  const notitie = opties.ontwikkelingsnotitie === true;
  // alleen de Nederlandse mail toont de korte regels in de andere talen; een andere taal heeft de notitie al in zijn eigen taal
  const metTalen = lang === "nl";
  const notitieTekst = notitie
    ? `\n\n${t.goedOm}: ${t.notitie}${metTalen ? `\n\n${ONTWIKKELING_TALEN.map((x) => `${x.taal}: ${x.tekst}`).join("\n")}` : ""}`
    : "";
  const talenHtml = metTalen
    ? `
       ${ONTWIKKELING_TALEN.map((x) => `<p style="margin:8px 0 0;font-size:12px;line-height:1.5;color:#667469"><strong>${escapeHtml(x.taal)}:</strong> ${escapeHtml(x.tekst)}</p>`).join("")}`
    : "";
  const notitieHtml = notitie
    ? `<p style="margin:16px 0 0;padding:12px 14px;border-radius:8px;background:#F4F1E8;font-size:14px;line-height:1.6;color:#3C4A42"><strong>${t.goedOm}:</strong> ${escapeHtml(t.notitie)}</p>${talenHtml}`
    : "";
  return {
    to: "",
    subject: t.subject,
    kind: "welcome",
    text: `${vulIn(t.hoi, { naam: first })}

${t.bevestigd}

${t.volgende} ${next}

${t.inloggen} ${base}/login${notitieTekst}

${t.vragen}`,
    html: shell(
      t.subject,
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3C4A42">${vulIn(t.introHtml, { naam: escapeHtml(first) })}</p>
       <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3C4A42"><strong>${t.volgende}</strong> ${next}</p>
       <p style="margin:0">${button(`${base}/login`, t.knop)}</p>
       ${notitieHtml}
       <p style="margin:20px 0 0;font-size:12px;color:#667469">${t.vragen}</p>`,
      t.preheader,
      lang,
    ),
  };
}
