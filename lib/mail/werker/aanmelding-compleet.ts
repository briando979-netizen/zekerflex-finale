// Machine-assisted translations: native-speaker review recommended.
// De mail "aanmelding compleet" (was aanmeldingCompleetEmail in lib/mail/index.ts), in de app-taal van de werker. De `reden` komt al als
// tekst binnen (de aanroeper vertaalt hem met FOUTEN uit lib/i18n/fouten.ts). Nederlands is byte voor byte gelijk aan vóór de vertaling
// (tests/mail-werker-nl.test.ts). Over de eigen account: altijd bezorgd (geen optionele categorie).
import type { MailInput } from "@/lib/mail";
import { button, escapeHtml, shell, type MailTaal } from "@/lib/mail/vorm";
import { vulIn } from "@/lib/i18n/vul-in";

export type AanmeldingCompleetSoort = "kan-reageren" | "nog-iets" | "id-in-controle";

interface CompleetTekst {
  hoi: string;
  subjectKan: string;
  subjectNog: string;
  subjectId: string;
  compleetIdOk: string;
  kanReageren: string;
  /** met {reden} */
  nogEen: string;
  nogEenZonder: string;
  bedankt: string;
  controle: string;
  knopKan: string;
  knopNog: string;
  knopId: string;
  tip: string;
}

const TEKST: Record<MailTaal, CompleetTekst> = {
  nl: {
    hoi: "Hoi {naam},",
    subjectKan: "Je aanmelding is compleet: je kunt reageren op klussen",
    subjectNog: "Je aanmelding is compleet: nog één ding",
    subjectId: "We hebben je gegevens ontvangen",
    compleetIdOk: "Je gegevens zijn compleet en je ID is geverifieerd.",
    kanReageren: "Je kunt vanaf nu reageren op klussen.",
    nogEen: "Nog één ding voordat je kunt reageren op klussen: {reden}",
    nogEenZonder: "Nog één ding voordat je kunt reageren op klussen: open de app, daar zie je wat er nog nodig is.",
    bedankt: "Bedankt, je aanmelding is compleet.",
    controle: "We controleren nu je ID. Zodra dat klaar is, krijg je van ons een mail. Je kunt alvast rondkijken welke klussen er zijn.",
    knopKan: "Bekijk de klussen",
    knopNog: "Open ZekerFlex",
    knopId: "Kijk alvast rond",
    tip: "Met een duidelijke profielfoto en je werkervaring kiezen opdrachtgevers sneller voor jou.",
  },
  en: {
    hoi: "Hi {naam},",
    subjectKan: "Your registration is complete: you can apply for jobs",
    subjectNog: "Your registration is complete: one more thing",
    subjectId: "We have received your details",
    compleetIdOk: "Your details are complete and your ID is verified.",
    kanReageren: "You can now apply for jobs.",
    nogEen: "One more thing before you can apply for jobs: {reden}",
    nogEenZonder: "One more thing before you can apply for jobs: open the app to see what is still needed.",
    bedankt: "Thanks, your registration is complete.",
    controle: "We are now checking your ID. As soon as that is done, we will send you an email. In the meantime you can already look around at the available jobs.",
    knopKan: "View the jobs",
    knopNog: "Open ZekerFlex",
    knopId: "Have a look around",
    tip: "With a clear profile photo and your work experience, employers choose you faster.",
  },
  pl: {
    hoi: "Cześć {naam},",
    subjectKan: "Twoja rejestracja jest kompletna: możesz odpowiadać na zlecenia",
    subjectNog: "Twoja rejestracja jest kompletna: jeszcze jedna rzecz",
    subjectId: "Otrzymaliśmy Twoje dane",
    compleetIdOk: "Twoje dane są kompletne, a Twój dokument tożsamości został zweryfikowany.",
    kanReageren: "Od teraz możesz odpowiadać na zlecenia.",
    nogEen: "Jeszcze jedna rzecz, zanim zaczniesz odpowiadać na zlecenia: {reden}",
    nogEenZonder: "Jeszcze jedna rzecz, zanim zaczniesz odpowiadać na zlecenia: otwórz aplikację, tam zobaczysz, czego jeszcze brakuje.",
    bedankt: "Dziękujemy, Twoja rejestracja jest kompletna.",
    controle: "Teraz sprawdzamy Twój dokument tożsamości. Gdy skończymy, dostaniesz od nas e-mail. Możesz już się rozejrzeć, jakie są zlecenia.",
    knopKan: "Zobacz zlecenia",
    knopNog: "Otwórz ZekerFlex",
    knopId: "Rozejrzyj się",
    tip: "Z wyraźnym zdjęciem profilowym i doświadczeniem zawodowym zleceniodawcy szybciej wybiorą Ciebie.",
  },
  ro: {
    hoi: "Salut {naam},",
    subjectKan: "Înregistrarea ta este completă: poți aplica la joburi",
    subjectNog: "Înregistrarea ta este completă: încă un lucru",
    subjectId: "Am primit datele tale",
    compleetIdOk: "Datele tale sunt complete și actul tău de identitate este verificat.",
    kanReageren: "De acum poți aplica la joburi.",
    nogEen: "Încă un lucru înainte să poți aplica la joburi: {reden}",
    nogEenZonder: "Încă un lucru înainte să poți aplica la joburi: deschide aplicația, acolo vezi ce mai este necesar.",
    bedankt: "Mulțumim, înregistrarea ta este completă.",
    controle: "Acum îți verificăm actul de identitate. Imediat ce terminăm, primești de la noi un e-mail. Poți să te uiți deja la joburile disponibile.",
    knopKan: "Vezi joburile",
    knopNog: "Deschide ZekerFlex",
    knopId: "Aruncă o privire",
    tip: "Cu o fotografie de profil clară și experiența ta, angajatorii te aleg mai repede.",
  },
  uk: {
    hoi: "Привіт, {naam},",
    subjectKan: "Твою реєстрацію завершено: ти можеш відгукуватися на роботи",
    subjectNog: "Твою реєстрацію завершено: ще одна річ",
    subjectId: "Ми отримали твої дані",
    compleetIdOk: "Твої дані повні, а твій документ підтверджено.",
    kanReageren: "Відтепер ти можеш відгукуватися на роботи.",
    nogEen: "Ще одна річ, перш ніж ти зможеш відгукуватися на роботи: {reden}",
    nogEenZonder: "Ще одна річ, перш ніж ти зможеш відгукуватися на роботи: відкрий застосунок, там видно, що ще потрібно.",
    bedankt: "Дякуємо, твою реєстрацію завершено.",
    controle: "Зараз ми перевіряємо твій документ. Щойно закінчимо, ти отримаєш від нас лист. Можеш уже подивитися, які є роботи.",
    knopKan: "Переглянути роботи",
    knopNog: "Відкрити ZekerFlex",
    knopId: "Подивитися навколо",
    tip: "З чітким фото профілю та досвідом роботи замовники швидше обирають тебе.",
  },
};

export function aanmeldingCompleetEmailT(
  input: {
    fullName: string;
    appUrl: string;
    soort: AanmeldingCompleetSoort;
    /** bij "nog-iets": wat er nog ontbreekt, in gewone taal en al in de taal van de mail */
    reden?: string | null;
  },
  taal: MailTaal,
): MailInput {
  const t = TEKST[taal];
  const first = input.fullName.split(" ")[0] || input.fullName;
  const basis = input.appUrl.replace(/\/+$/, "");
  const klussen = `${basis}/dashboard/klussen`;
  const subject = input.soort === "kan-reageren" ? t.subjectKan : input.soort === "nog-iets" ? t.subjectNog : t.subjectId;
  const alineas =
    input.soort === "kan-reageren"
      ? [t.compleetIdOk, t.kanReageren]
      : input.soort === "nog-iets"
        ? [t.compleetIdOk, input.reden ? vulIn(t.nogEen, { reden: input.reden }) : t.nogEenZonder]
        : [t.bedankt, t.controle];
  const knop = input.soort === "kan-reageren" ? t.knopKan : input.soort === "nog-iets" ? t.knopNog : t.knopId;
  const tip = t.tip;
  return {
    to: "",
    subject,
    kind: "aanmelding-compleet",
    text: `${vulIn(t.hoi, { naam: first })}

${alineas.join("\n\n")}

${tip}

${klussen}`,
    html: shell(
      subject,
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3C4A42">${vulIn(t.hoi, { naam: escapeHtml(first) })}</p>
       ${alineas.map((a) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3C4A42">${escapeHtml(a)}</p>`).join("\n       ")}
       <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#3C4A42">${escapeHtml(tip)}</p>
       <p style="margin:0">${button(klussen, knop)}</p>`,
      alineas[alineas.length - 1] ?? subject,
      taal,
    ),
  };
}
