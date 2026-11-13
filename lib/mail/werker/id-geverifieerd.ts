// Machine-assisted translations: native-speaker review recommended.
// "Je ID is geverifieerd" (was idGeverifieerdEmail in lib/mail/index.ts), in de app-taal van de werker. Nederlands is byte voor byte
// gelijk aan vóór de vertaling (tests/mail-werker-nl.test.ts). Valt onder "Tips" (kind "onboarding").
import type { MailInput } from "@/lib/mail";
import { button, escapeHtml, shell, type MailTaal } from "@/lib/mail/vorm";
import { vulIn } from "@/lib/i18n/vul-in";

interface IdTekst {
  subject: string;
  hoi: string;
  intro: string;
  introHtml: string;
  standJa: string;
  standNee: string;
  tip: string;
  knop: string;
  /** de knop naar de eerste open stap van de aanmelding (13 nov 2026) */
  knopVolgende: string;
}

const TEKST: Record<MailTaal, IdTekst> = {
  nl: {
    subject: "Je ID is geverifieerd",
    hoi: "Hoi {naam},",
    intro: "Je ID is geverifieerd.",
    introHtml: "Hoi {naam}, je ID is geverifieerd.",
    standJa: "Je kunt vanaf nu reageren op klussen.",
    standNee: "Je kunt op klussen reageren zodra de rest van je aanmelding klopt.",
    tip: "Met een duidelijke profielfoto en je werkervaring kunnen opdrachtgevers je beter inschatten. Beide stappen zijn optioneel en kosten een paar minuten",
    knop: "Maak een goede eerste indruk",
    knopVolgende: "Verder met je aanmelding",
  },
  en: {
    subject: "Your ID is verified",
    hoi: "Hi {naam},",
    intro: "Your ID is verified.",
    introHtml: "Hi {naam}, your ID is verified.",
    standJa: "You can now apply for jobs.",
    standNee: "You can apply for jobs as soon as the rest of your registration is in order.",
    tip: "With a clear profile photo and your work experience, employers can judge you better. Both steps are optional and take a few minutes",
    knop: "Make a good first impression",
    knopVolgende: "Continue your sign-up",
  },
  pl: {
    subject: "Twój dokument tożsamości został zweryfikowany",
    hoi: "Cześć {naam},",
    intro: "Twój dokument tożsamości został zweryfikowany.",
    introHtml: "Cześć {naam}, Twój dokument tożsamości został zweryfikowany.",
    standJa: "Od teraz możesz odpowiadać na zlecenia.",
    standNee: "Na zlecenia możesz odpowiadać, gdy reszta Twojej rejestracji będzie w porządku.",
    tip: "Z wyraźnym zdjęciem profilowym i doświadczeniem zawodowym zleceniodawcy lepiej Cię ocenią. Oba kroki są opcjonalne i zajmują kilka minut",
    knop: "Zrób dobre pierwsze wrażenie",
    knopVolgende: "Kontynuuj rejestrację",
  },
  ro: {
    subject: "Actul tău de identitate este verificat",
    hoi: "Salut {naam},",
    intro: "Actul tău de identitate este verificat.",
    introHtml: "Salut {naam}, actul tău de identitate este verificat.",
    standJa: "De acum poți aplica la joburi.",
    standNee: "Poți aplica la joburi imediat ce restul înregistrării tale este în regulă.",
    tip: "Cu o fotografie de profil clară și experiența ta, angajatorii te pot evalua mai bine. Ambii pași sunt opționali și durează câteva minute",
    knop: "Fă o primă impresie bună",
    knopVolgende: "Continuă înregistrarea",
  },
  uk: {
    subject: "Твій документ підтверджено",
    hoi: "Привіт, {naam},",
    intro: "Твій документ підтверджено.",
    introHtml: "Привіт, {naam}, твій документ підтверджено.",
    standJa: "Відтепер ти можеш відгукуватися на роботи.",
    standNee: "Ти зможеш відгукуватися на роботи, щойно решта твоєї реєстрації буде в порядку.",
    tip: "З чітким фото профілю та досвідом роботи замовники зможуть краще тебе оцінити. Обидва кроки необов’язкові й займають кілька хвилин",
    knop: "Зроби гарне перше враження",
    knopVolgende: "Продовжити реєстрацію",
  },
};

/**
 * Met `volgende` (er staat nog een stap van de aanmelding open): in één zin wat er nog moet en een knop naar die stap, in plaats
 * van "eerste indruk" (die pagina stuurt terug zolang gegevens of branches open staan). Zonder blijft de mail zoals hij was.
 */
export function idGeverifieerdEmailT(
  fullName: string,
  appUrl: string,
  kanReageren: boolean,
  taal: MailTaal,
  volgende?: { zin: string; pad: string },
): MailInput {
  const t = TEKST[taal];
  const first = fullName.split(" ")[0] || fullName;
  if (volgende) {
    const naar = `${appUrl.replace(/\/+$/, "")}${volgende.pad}`;
    return {
      to: "",
      subject: t.subject,
      kind: "onboarding",
      text: `${vulIn(t.hoi, { naam: first })}

${t.intro} ${volgende.zin}

${t.knopVolgende}: ${naar}`,
      html: shell(
        t.subject,
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3C4A42">${vulIn(t.introHtml, { naam: escapeHtml(first) })}</p>
       <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#3C4A42">${escapeHtml(volgende.zin)}</p>
       <p style="margin:0">${button(naar, t.knopVolgende)}</p>`,
        volgende.zin,
        taal,
      ),
    };
  }
  const href = `${appUrl.replace(/\/+$/, "")}/dashboard/eerste-indruk`;
  const stand = kanReageren ? t.standJa : t.standNee;
  return {
    to: "",
    subject: t.subject,
    kind: "onboarding",
    text: `${vulIn(t.hoi, { naam: first })}

${t.intro} ${stand}

${t.tip}: ${href}`,
    html: shell(
      t.subject,
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3C4A42">${vulIn(t.introHtml, { naam: escapeHtml(first) })}</p>
       <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3C4A42">${stand}</p>
       <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#3C4A42">${t.tip}.</p>
       <p style="margin:0">${button(href, t.knop)}</p>`,
      stand,
      taal,
    ),
  };
}
