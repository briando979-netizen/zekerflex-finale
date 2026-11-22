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
    nextUitzend: "Doorloop de 5 korte stappen bovenaan Ontdekken: je richting, branches, je gegevens, een ID-check en een profielfoto. Daarna zie je precies wat er nog nodig is voor je eerste klus.",
    nextZzp: "Doorloop de 5 korte stappen bovenaan Ontdekken: je richting, branches, je gegevens, een ID-check en een profielfoto. Daarna zie je precies wat er nog nodig is voor je eerste klus.",
    knop: "Naar ZekerFlex",
    preheader: "Je account is klaar. Dit is je volgende stap.",
    goedOm: "Goed om te weten",
    notitie:
      "ZekerFlex is nog in ontwikkeling. Begin volgend jaar gaan we online. Je kunt nu al proeven en bekijken hoe het er straks uitziet.",
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
    nextUitzend: "Go through the 5 short steps at the top of Discover: your direction, sectors, your details, an ID check and a profile photo. After that you'll see exactly what is still needed for your first job.",
    nextZzp: "Go through the 5 short steps at the top of Discover: your direction, sectors, your details, an ID check and a profile photo. After that you'll see exactly what is still needed for your first job.",
    knop: "Go to ZekerFlex",
    preheader: "Your account is ready. This is your next step.",
    goedOm: "Good to know",
    notitie:
      "ZekerFlex is still in development. We go online early next year. You can already try it out and see what it will look like.",
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
    nextUitzend: "Przejdź 5 krótkich kroków na górze zakładki Odkrywaj: kierunek, branże, Twoje dane, weryfikacja dokumentu i zdjęcie profilowe. Potem zobaczysz dokładnie, czego jeszcze potrzeba do pierwszego zlecenia.",
    nextZzp: "Przejdź 5 krótkich kroków na górze zakładki Odkrywaj: kierunek, branże, Twoje dane, weryfikacja dokumentu i zdjęcie profilowe. Potem zobaczysz dokładnie, czego jeszcze potrzeba do pierwszego zlecenia.",
    knop: "Przejdź do ZekerFlex",
    preheader: "Twoje konto jest gotowe. To Twój następny krok.",
    goedOm: "Warto wiedzieć",
    notitie:
      "ZekerFlex jest nadal w rozwoju. Na początku przyszłego roku wystartujemy online. Już teraz możesz wszystko wypróbować i zobaczyć, jak to będzie wyglądać.",
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
    nextUitzend: "Parcurge cei 5 pași scurți din partea de sus a paginii Descoperă: direcția, domeniile, datele tale, verificarea actului și o fotografie de profil. După aceea vezi exact ce mai este necesar pentru prima ta lucrare.",
    nextZzp: "Parcurge cei 5 pași scurți din partea de sus a paginii Descoperă: direcția, domeniile, datele tale, verificarea actului și o fotografie de profil. După aceea vezi exact ce mai este necesar pentru prima ta lucrare.",
    knop: "Mergi la ZekerFlex",
    preheader: "Contul tău este gata. Acesta este următorul tău pas.",
    goedOm: "Bine de știut",
    notitie:
      "ZekerFlex este încă în dezvoltare. Pornim online la începutul anului viitor. Poți încerca deja și vedea cum va arăta.",
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
    nextUitzend: "Пройди 5 коротких кроків угорі сторінки «Огляд»: напрям, галузі, твої дані, перевірка документа та фото профілю. Після цього ти точно побачиш, що ще потрібно для першої роботи.",
    nextZzp: "Пройди 5 коротких кроків угорі сторінки «Огляд»: напрям, галузі, твої дані, перевірка документа та фото профілю. Після цього ти точно побачиш, що ще потрібно для першої роботи.",
    knop: "Перейти до ZekerFlex",
    preheader: "Твій обліковий запис готовий. Ось твій наступний крок.",
    goedOm: "Варто знати",
    notitie:
      "ZekerFlex ще в розробці. Ми запускаємося онлайн на початку наступного року. Ти вже зараз можеш спробувати й побачити, як це виглядатиме.",
  },
};

// De korte regels in de andere talen onderaan de Nederlandse mail (een Nederlandse lezer kan een andere moedertaal hebben).
const ONTWIKKELING_TALEN: { taal: string; tekst: string }[] = [
  { taal: "English", tekst: "ZekerFlex is still in development. We go online early next year." },
  { taal: "Polski", tekst: "ZekerFlex jest nadal w rozwoju. Na początku przyszłego roku wystartujemy online." },
  { taal: "Română", tekst: "ZekerFlex este încă în dezvoltare. Pornim online la începutul anului viitor." },
  { taal: "Українською", tekst: "ZekerFlex ще в розробці. Ми запускаємося онлайн на початку наступного року." },
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
  // naar het eigen startscherm, niet naar /login: wie al ingelogd is, kreeg anders het formulier en dacht dat hij
  // uitgelogd was (13 nov); wie dat niet is, stuurt de layout zelf naar /login met terugkeer hierheen
  const thuis = `${base}${type === "bedrijf" ? "/werkgever" : "/dashboard"}`;
  const next =type === "bedrijf" ? t.nextBedrijf : workerKind === "uitzendkracht" ? t.nextUitzend : t.nextZzp;
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

${t.inloggen} ${thuis}${notitieTekst}

${t.vragen}`,
    html: shell(
      t.subject,
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3C4A42">${vulIn(t.introHtml, { naam: escapeHtml(first) })}</p>
       <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3C4A42"><strong>${t.volgende}</strong> ${next}</p>
       <p style="margin:0">${button(thuis, t.knop)}</p>
       ${notitieHtml}
       <p style="margin:20px 0 0;font-size:12px;color:#667469">${t.vragen}</p>`,
      t.preheader,
      lang,
    ),
  };
}
