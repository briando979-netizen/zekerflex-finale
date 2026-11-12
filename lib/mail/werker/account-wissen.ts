// Machine-assisted translations: native-speaker review recommended.
// De bevestigingsmail voor het verwijderen van een account, in de taal van de werker. Nederlands is letterlijk de oude tekst uit lib/mail/index.ts.
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
    onderwerp: "Bevestig het verwijderen van je ZekerFlex-account",
    begroeting: "Hoi {naam},",
    tekst:
      "Je hebt gevraagd om je ZekerFlex-account te laten verwijderen. Klik op de link hieronder om dit te bevestigen; hij is 1 uur geldig. Je ziet daar precies welke gegevens meteen verwijderd worden en welke we (deels) moeten bewaren vanwege wettelijke bewaarplicht.",
    tekstNegeer: "Heb je dit niet aangevraagd? Dan kun je deze mail negeren — er verandert niets aan je account.",
    titel: "Account verwijderen bevestigen",
    htmlIntro:
      "Hoi {naam}, je hebt gevraagd om je ZekerFlex-account te laten verwijderen. Klik op de knop om dit te bevestigen; de link is 1 uur geldig. Daar zie je precies welke gegevens meteen verwijderd worden en welke we (deels) moeten bewaren vanwege wettelijke bewaarplicht.",
    knop: "Verwijdering bevestigen",
    nietWerkt: "Werkt de knop niet? Kopieer deze link:",
    htmlNegeer: "Heb je dit niet aangevraagd? Negeer deze mail — er verandert niets aan je account.",
  },
  en: {
    onderwerp: "Confirm the deletion of your ZekerFlex account",
    begroeting: "Hi {naam},",
    tekst:
      "You asked to have your ZekerFlex account deleted. Click the link below to confirm; it is valid for 1 hour. There you will see exactly which data is deleted right away and which we have to (partly) keep because of legal retention obligations.",
    tekstNegeer: "Didn't request this? You can ignore this email — nothing changes about your account.",
    titel: "Confirm account deletion",
    htmlIntro:
      "Hi {naam}, you asked to have your ZekerFlex account deleted. Click the button to confirm; the link is valid for 1 hour. There you will see exactly which data is deleted right away and which we have to (partly) keep because of legal retention obligations.",
    knop: "Confirm deletion",
    nietWerkt: "Button not working? Copy this link:",
    htmlNegeer: "Didn't request this? Ignore this email — nothing changes about your account.",
  },
  pl: {
    onderwerp: "Potwierdź usunięcie konta ZekerFlex",
    begroeting: "Cześć {naam},",
    tekst:
      "Poprosiłeś(-aś) o usunięcie swojego konta ZekerFlex. Kliknij link poniżej, aby to potwierdzić; jest ważny przez 1 godzinę. Zobaczysz tam dokładnie, które dane zostaną usunięte od razu, a które musimy (częściowo) zachować z powodu ustawowego obowiązku przechowywania.",
    tekstNegeer: "Nie prosiłeś(-aś) o to? Zignoruj tę wiadomość — nic się nie zmieni w Twoim koncie.",
    titel: "Potwierdź usunięcie konta",
    htmlIntro:
      "Cześć {naam}, poprosiłeś(-aś) o usunięcie swojego konta ZekerFlex. Kliknij przycisk, aby to potwierdzić; link jest ważny przez 1 godzinę. Zobaczysz tam dokładnie, które dane zostaną usunięte od razu, a które musimy (częściowo) zachować z powodu ustawowego obowiązku przechowywania.",
    knop: "Potwierdź usunięcie",
    nietWerkt: "Przycisk nie działa? Skopiuj ten link:",
    htmlNegeer: "Nie prosiłeś(-aś) o to? Zignoruj tę wiadomość — nic się nie zmieni w Twoim koncie.",
  },
  ro: {
    onderwerp: "Confirmă ștergerea contului tău ZekerFlex",
    begroeting: "Salut {naam},",
    tekst:
      "Ai cerut ștergerea contului tău ZekerFlex. Apasă pe linkul de mai jos pentru a confirma; este valabil 1 oră. Acolo vezi exact ce date se șterg imediat și pe care trebuie să le păstrăm (parțial) din cauza obligației legale de păstrare.",
    tekstNegeer: "Nu ai cerut tu asta? Poți ignora acest e-mail — nu se schimbă nimic la contul tău.",
    titel: "Confirmă ștergerea contului",
    htmlIntro:
      "Salut {naam}, ai cerut ștergerea contului tău ZekerFlex. Apasă pe buton pentru a confirma; linkul este valabil 1 oră. Acolo vezi exact ce date se șterg imediat și pe care trebuie să le păstrăm (parțial) din cauza obligației legale de păstrare.",
    knop: "Confirmă ștergerea",
    nietWerkt: "Butonul nu funcționează? Copiază acest link:",
    htmlNegeer: "Nu ai cerut tu asta? Ignoră acest e-mail — nu se schimbă nimic la contul tău.",
  },
  uk: {
    onderwerp: "Підтверди видалення акаунта ZekerFlex",
    begroeting: "Привіт, {naam}!",
    tekst:
      "Ти попросив(ла) видалити свій акаунт ZekerFlex. Натисни на посилання нижче, щоб підтвердити; воно дійсне 1 годину. Там ти побачиш, які саме дані видаляються одразу, а які ми (частково) мусимо зберігати через законний обов'язок зберігання.",
    tekstNegeer: "Ти цього не запитував(ла)? Тоді просто ігноруй цей лист — з твоїм акаунтом нічого не станеться.",
    titel: "Підтверди видалення акаунта",
    htmlIntro:
      "Привіт, {naam}! Ти попросив(ла) видалити свій акаунт ZekerFlex. Натисни кнопку, щоб підтвердити; посилання дійсне 1 годину. Там ти побачиш, які саме дані видаляються одразу, а які ми (частково) мусимо зберігати через законний обов'язок зберігання.",
    knop: "Підтвердити видалення",
    nietWerkt: "Кнопка не працює? Скопіюй це посилання:",
    htmlNegeer: "Ти цього не запитував(ла)? Ігноруй цей лист — з твоїм акаунтом нічого не станеться.",
  },
};

export function accountDeletionEmailT(fullName: string, link: string, taal: MailTaal): MailInput {
  const t = T[taal];
  const first = fullName.split(" ")[0] || fullName;
  const e = escapeHtml;
  return {
    to: "",
    subject: t.onderwerp,
    kind: "account-verwijdering-bevestiging",
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
