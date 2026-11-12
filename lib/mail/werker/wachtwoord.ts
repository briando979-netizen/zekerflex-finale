// Machine-assisted translations: native-speaker review recommended.
// De mail om het wachtwoord opnieuw in te stellen, in de taal van de werker. Nederlands is letterlijk de oude tekst uit lib/mail/index.ts.
import type { MailInput } from "@/lib/mail";
import { vulIn } from "@/lib/i18n/vul-in";
import { button, escapeHtml, shell, type MailTaal } from "@/lib/mail/vorm";

interface Teksten {
  onderwerp: string;
  begroeting: string;
  tekst: string;
  tekstNegeer: string;
  titel: string;
  htmlIntro: string;
  knop: string;
  nietWerkt: string;
  htmlNegeer: string;
}

const T: Record<MailTaal, Teksten> = {
  nl: {
    onderwerp: "Stel je ZekerFlex-wachtwoord opnieuw in",
    begroeting: "Hoi {naam},",
    tekst: "Je hebt gevraagd om je wachtwoord opnieuw in te stellen. Klik op de link hieronder; hij is 1 uur geldig.",
    tekstNegeer: "Heb je dit niet aangevraagd? Dan kun je deze mail negeren — je wachtwoord blijft ongewijzigd.",
    titel: "Wachtwoord opnieuw instellen",
    htmlIntro: "Hoi {naam}, je hebt gevraagd om je wachtwoord opnieuw in te stellen. De link is 1 uur geldig.",
    knop: "Wachtwoord opnieuw instellen",
    nietWerkt: "Werkt de knop niet? Kopieer deze link:",
    htmlNegeer: "Heb je dit niet aangevraagd? Negeer deze mail — je wachtwoord blijft ongewijzigd.",
  },
  en: {
    onderwerp: "Reset your ZekerFlex password",
    begroeting: "Hi {naam},",
    tekst: "You asked to reset your password. Click the link below; it is valid for 1 hour.",
    tekstNegeer: "Didn't request this? You can ignore this email — your password stays unchanged.",
    titel: "Reset your password",
    htmlIntro: "Hi {naam}, you asked to reset your password. The link is valid for 1 hour.",
    knop: "Reset password",
    nietWerkt: "Button not working? Copy this link:",
    htmlNegeer: "Didn't request this? Ignore this email — your password stays unchanged.",
  },
  pl: {
    onderwerp: "Ustaw nowe hasło do ZekerFlex",
    begroeting: "Cześć {naam},",
    tekst: "Poprosiłeś(-aś) o ustawienie nowego hasła. Kliknij link poniżej; jest ważny przez 1 godzinę.",
    tekstNegeer: "Nie prosiłeś(-aś) o to? Zignoruj tę wiadomość — Twoje hasło pozostanie bez zmian.",
    titel: "Ustaw nowe hasło",
    htmlIntro: "Cześć {naam}, poprosiłeś(-aś) o ustawienie nowego hasła. Link jest ważny przez 1 godzinę.",
    knop: "Ustaw nowe hasło",
    nietWerkt: "Przycisk nie działa? Skopiuj ten link:",
    htmlNegeer: "Nie prosiłeś(-aś) o to? Zignoruj tę wiadomość — Twoje hasło pozostanie bez zmian.",
  },
  ro: {
    onderwerp: "Setează din nou parola ZekerFlex",
    begroeting: "Salut {naam},",
    tekst: "Ai cerut resetarea parolei. Apasă pe linkul de mai jos; este valabil 1 oră.",
    tekstNegeer: "Nu ai cerut tu asta? Poți ignora acest e-mail — parola ta rămâne neschimbată.",
    titel: "Setează din nou parola",
    htmlIntro: "Salut {naam}, ai cerut resetarea parolei. Linkul este valabil 1 oră.",
    knop: "Setează din nou parola",
    nietWerkt: "Butonul nu funcționează? Copiază acest link:",
    htmlNegeer: "Nu ai cerut tu asta? Ignoră acest e-mail — parola ta rămâne neschimbată.",
  },
  uk: {
    onderwerp: "Встанови новий пароль ZekerFlex",
    begroeting: "Привіт, {naam}!",
    tekst: "Ти попросив(ла) скинути пароль. Натисни на посилання нижче; воно дійсне 1 годину.",
    tekstNegeer: "Ти цього не запитував(ла)? Тоді просто ігноруй цей лист — твій пароль залишиться без змін.",
    titel: "Встанови новий пароль",
    htmlIntro: "Привіт, {naam}! Ти попросив(ла) скинути пароль. Посилання дійсне 1 годину.",
    knop: "Встановити новий пароль",
    nietWerkt: "Кнопка не працює? Скопіюй це посилання:",
    htmlNegeer: "Ти цього не запитував(ла)? Ігноруй цей лист — твій пароль залишиться без змін.",
  },
};

export function passwordResetEmailT(fullName: string, link: string, taal: MailTaal): MailInput {
  const t = T[taal];
  const first = fullName.split(" ")[0] || fullName;
  const e = escapeHtml;
  return {
    to: "",
    subject: t.onderwerp,
    kind: "wachtwoord-reset",
    text: `${vulIn(t.begroeting, { naam: first })}\n\n${t.tekst}\n\n${link}\n\n${t.tekstNegeer}`,
    html: shell(
      t.titel,
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3C4A42">${vulIn(t.htmlIntro, { naam: e(first) })}</p>
       <p style="margin:0 0 20px">${button(link, t.knop)}</p>
       <p style="margin:0;font-size:12px;color:#667469">${t.nietWerkt}<br><span style="word-break:break-all">${e(link)}</span></p>
       <p style="margin:16px 0 0;font-size:12px;color:#667469">${t.htmlNegeer}</p>`,
      undefined,
      taal,
    ),
  };
}
