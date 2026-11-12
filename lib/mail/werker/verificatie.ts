// Machine-assisted translations: native-speaker review recommended.
// De bevestigingsmail van een nieuw account, in de taal van de werker. Nederlands is letterlijk de oude tekst uit lib/mail/index.ts.
import type { MailInput } from "@/lib/mail";
import { vulIn } from "@/lib/i18n/vul-in";
import { button, escapeHtml, shell, type MailTaal } from "@/lib/mail/vorm";

interface Teksten {
  onderwerp: string;
  onderwerpMetCode: string;
  begroeting: string;
  tekstIntro: string;
  tekstCode: string;
  tekstGeldig: string;
  tekstGeenAccount: string;
  titel: string;
  htmlIntro: string;
  knop: string;
  codeUitleg: string;
  nietWerkt: string;
  htmlGeldig: string;
  preheaderCode: string;
  preheaderZonder: string;
}

const T: Record<MailTaal, Teksten> = {
  nl: {
    onderwerp: "Je ZekerFlex-bevestigingscode",
    onderwerpMetCode: "Je ZekerFlex-bevestigingscode: {code}",
    begroeting: "Hoi {naam},",
    tekstIntro: "Bevestig je e-mailadres om je ZekerFlex-account te activeren. Open daarvoor deze link:",
    tekstCode: "Typ op de bevestigingspagina deze code in: {code}",
    tekstGeldig:
      "De link en de code zijn 24 uur geldig. Is de link verlopen? Log in op zekerflex.com en vraag op het bevestigingsscherm een nieuwe aan.",
    tekstGeenAccount: "Heb je geen account bij ZekerFlex aangemaakt? Dan hoef je niets te doen: zonder bevestiging wordt er niets geactiveerd.",
    titel: "Bevestig je e-mailadres",
    htmlIntro: "Hoi {naam}, welkom bij ZekerFlex. Bevestig je e-mailadres om je account te activeren.",
    knop: "E-mailadres bevestigen",
    codeUitleg: "Liever een code? Typ deze in op de bevestigingspagina:",
    nietWerkt: "Werkt de knop niet? Kopieer deze link in je browser:",
    htmlGeldig: "De link en de code zijn 24 uur geldig. Is de link verlopen? Log in en vraag op het bevestigingsscherm een nieuwe aan.",
    preheaderCode: "Je code is {code}. Of klik op de knop om je account te activeren (24 uur geldig).",
    preheaderZonder: "Klik op de knop om je account te activeren (24 uur geldig).",
  },
  en: {
    onderwerp: "Your ZekerFlex confirmation code",
    onderwerpMetCode: "Your ZekerFlex confirmation code: {code}",
    begroeting: "Hi {naam},",
    tekstIntro: "Confirm your email address to activate your ZekerFlex account. Open this link:",
    tekstCode: "Enter this code on the confirmation page: {code}",
    tekstGeldig:
      "The link and the code are valid for 24 hours. Has the link expired? Log in at zekerflex.com and request a new one on the confirmation screen.",
    tekstGeenAccount: "Didn't create a ZekerFlex account? Then you don't need to do anything: nothing gets activated without confirmation.",
    titel: "Confirm your email address",
    htmlIntro: "Hi {naam}, welcome to ZekerFlex. Confirm your email address to activate your account.",
    knop: "Confirm email address",
    codeUitleg: "Prefer a code? Enter it on the confirmation page:",
    nietWerkt: "Button not working? Copy this link into your browser:",
    htmlGeldig: "The link and the code are valid for 24 hours. Has the link expired? Log in and request a new one on the confirmation screen.",
    preheaderCode: "Your code is {code}. Or click the button to activate your account (valid for 24 hours).",
    preheaderZonder: "Click the button to activate your account (valid for 24 hours).",
  },
  pl: {
    onderwerp: "Twój kod potwierdzający ZekerFlex",
    onderwerpMetCode: "Twój kod potwierdzający ZekerFlex: {code}",
    begroeting: "Cześć {naam},",
    tekstIntro: "Potwierdź swój adres e-mail, aby aktywować konto ZekerFlex. Otwórz ten link:",
    tekstCode: "Wpisz ten kod na stronie potwierdzenia: {code}",
    tekstGeldig:
      "Link i kod są ważne przez 24 godziny. Link wygasł? Zaloguj się na zekerflex.com i poproś o nowy na ekranie potwierdzenia.",
    tekstGeenAccount: "Nie zakładasz konta w ZekerFlex? Nie musisz nic robić: bez potwierdzenia nic nie zostanie aktywowane.",
    titel: "Potwierdź swój adres e-mail",
    htmlIntro: "Cześć {naam}, witaj w ZekerFlex. Potwierdź swój adres e-mail, aby aktywować konto.",
    knop: "Potwierdź adres e-mail",
    codeUitleg: "Wolisz kod? Wpisz go na stronie potwierdzenia:",
    nietWerkt: "Przycisk nie działa? Skopiuj ten link do przeglądarki:",
    htmlGeldig: "Link i kod są ważne przez 24 godziny. Link wygasł? Zaloguj się i poproś o nowy na ekranie potwierdzenia.",
    preheaderCode: "Twój kod to {code}. Albo kliknij przycisk, aby aktywować konto (ważne 24 godziny).",
    preheaderZonder: "Kliknij przycisk, aby aktywować konto (ważne 24 godziny).",
  },
  ro: {
    onderwerp: "Codul tău de confirmare ZekerFlex",
    onderwerpMetCode: "Codul tău de confirmare ZekerFlex: {code}",
    begroeting: "Salut {naam},",
    tekstIntro: "Confirmă-ți adresa de e-mail pentru a activa contul ZekerFlex. Deschide acest link:",
    tekstCode: "Introdu acest cod pe pagina de confirmare: {code}",
    tekstGeldig:
      "Linkul și codul sunt valabile 24 de ore. Linkul a expirat? Autentifică-te pe zekerflex.com și cere unul nou pe ecranul de confirmare.",
    tekstGeenAccount: "Nu ai creat un cont ZekerFlex? Atunci nu trebuie să faci nimic: fără confirmare nu se activează nimic.",
    titel: "Confirmă-ți adresa de e-mail",
    htmlIntro: "Salut {naam}, bine ai venit la ZekerFlex. Confirmă-ți adresa de e-mail pentru a-ți activa contul.",
    knop: "Confirmă adresa de e-mail",
    codeUitleg: "Preferi un cod? Introdu-l pe pagina de confirmare:",
    nietWerkt: "Butonul nu funcționează? Copiază acest link în browser:",
    htmlGeldig: "Linkul și codul sunt valabile 24 de ore. Linkul a expirat? Autentifică-te și cere unul nou pe ecranul de confirmare.",
    preheaderCode: "Codul tău este {code}. Sau apasă pe buton pentru a-ți activa contul (valabil 24 de ore).",
    preheaderZonder: "Apasă pe buton pentru a-ți activa contul (valabil 24 de ore).",
  },
  uk: {
    onderwerp: "Твій код підтвердження ZekerFlex",
    onderwerpMetCode: "Твій код підтвердження ZekerFlex: {code}",
    begroeting: "Привіт, {naam}!",
    tekstIntro: "Підтверди свою адресу електронної пошти, щоб активувати акаунт ZekerFlex. Відкрий це посилання:",
    tekstCode: "Введи цей код на сторінці підтвердження: {code}",
    tekstGeldig:
      "Посилання та код дійсні 24 години. Посилання прострочене? Увійди на zekerflex.com і запроси нове на екрані підтвердження.",
    tekstGeenAccount: "Ти не створював(ла) акаунт у ZekerFlex? Тоді нічого робити не треба: без підтвердження нічого не активується.",
    titel: "Підтверди свою адресу електронної пошти",
    htmlIntro: "Привіт, {naam}! Ласкаво просимо до ZekerFlex. Підтверди свою адресу електронної пошти, щоб активувати акаунт.",
    knop: "Підтвердити адресу",
    codeUitleg: "Віддаєш перевагу коду? Введи його на сторінці підтвердження:",
    nietWerkt: "Кнопка не працює? Скопіюй це посилання у браузер:",
    htmlGeldig: "Посилання та код дійсні 24 години. Посилання прострочене? Увійди й запроси нове на екрані підтвердження.",
    preheaderCode: "Твій код: {code}. Або натисни кнопку, щоб активувати акаунт (дійсний 24 години).",
    preheaderZonder: "Натисни кнопку, щоб активувати акаунт (дійсний 24 години).",
  },
};

export function verificationEmailT(fullName: string, link: string, code: string | undefined, taal: MailTaal): MailInput {
  const t = T[taal];
  const first = fullName.split(" ")[0] || fullName;
  const e = escapeHtml;
  const codeText = code ? `\n\n${vulIn(t.tekstCode, { code })}` : "";
  const codeHtml = code
    ? `<p style="margin:0 0 8px;font-size:13px;color:#667469">${t.codeUitleg}</p>
       <p style="margin:0 0 20px;font-size:30px;font-weight:700;letter-spacing:6px;color:#0E5C4A;font-family:Consolas,Menlo,monospace">${e(code)}</p>`
    : "";
  return {
    to: "",
    subject: code ? vulIn(t.onderwerpMetCode, { code }) : t.onderwerp,
    kind: "verification",
    text: `${vulIn(t.begroeting, { naam: first })}

${t.tekstIntro}
${link}${codeText}

${t.tekstGeldig}

${t.tekstGeenAccount}`,
    html: shell(
      t.titel,
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3C4A42">${vulIn(t.htmlIntro, { naam: e(first) })}</p>
       <p style="margin:0 0 20px">${button(link, t.knop)}</p>
       ${codeHtml}
       <p style="margin:0;font-size:12px;color:#667469">${t.nietWerkt}<br><span style="word-break:break-all">${e(link)}</span></p>
       <p style="margin:16px 0 0;font-size:12px;color:#667469">${t.htmlGeldig}</p>
       <p style="margin:16px 0 0;font-size:12px;color:#667469">${t.tekstGeenAccount}</p>`,
      code ? vulIn(t.preheaderCode, { code }) : t.preheaderZonder,
      taal,
    ),
  };
}
