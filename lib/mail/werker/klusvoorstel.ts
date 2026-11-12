import { vulIn } from "@/lib/i18n/vul-in";
import { button, escapeHtml, shell, type MailTaal } from "@/lib/mail/vorm";
import type { MailInput } from "@/lib/mail";

// ---------------------------------------------------------------------------
// Het klusvoorstel per mail aan een werker (lib/notifications/klus-mail.ts), in de app-taal van de werker. Puur: `when` en `rate`
// komen al opgemaakt binnen (de aanroeper maakt ze taalbewust op). In het Nederlands byte voor byte gelijk aan de oude mail.
// Machine-assisted translations: native-speaker review recommended.
// ---------------------------------------------------------------------------

interface Tekst {
  subject: string;
  titel: string;
  groet: string;
  intro: string;
  /** met {n} minuten reistijd */
  reis: string;
  tarief: string;
  bekijk: string;
  tip: string;
  htmlIntro: string;
  knop: string;
  tipHtml: string;
}

const TEKST: Record<MailTaal, Tekst> = {
  nl: {
    subject: "Er is een klus voor je: {title} in {city}",
    titel: "Er is een klus voor je",
    groet: "Hoi {naam},",
    intro: "Er is een klus die bij je past: {title} bij {branch} in {city}, {when}, {tarief}.",
    reis: ", ongeveer {n} minuten reizen",
    tarief: "{rate} per uur{reis}",
    bekijk: "Bekijk hem en reageer: {link}",
    tip: "Wie het eerst reageert, maakt de meeste kans. Wil je dit voortaan op je telefoon zien? Zet in de app meldingen aan.",
    htmlIntro: "Hoi {naam}, er is een klus die bij je past:",
    knop: "Bekijk de klus",
    tipHtml: "Wie het eerst reageert, maakt de meeste kans. Wil je dit voortaan meteen op je telefoon zien? Zet in de app meldingen aan.",
  },
  en: {
    subject: "There's a job for you: {title} in {city}",
    titel: "There's a job for you",
    groet: "Hi {naam},",
    intro: "There's a job that suits you: {title} at {branch} in {city}, {when}, {tarief}.",
    reis: ", about {n} minutes of travel",
    tarief: "{rate} per hour{reis}",
    bekijk: "Take a look and respond: {link}",
    tip: "Whoever responds first has the best chance. Want to see this on your phone from now on? Turn on notifications in the app.",
    htmlIntro: "Hi {naam}, there's a job that suits you:",
    knop: "View the job",
    tipHtml: "Whoever responds first has the best chance. Want to see this on your phone right away from now on? Turn on notifications in the app.",
  },
  pl: {
    subject: "Jest zlecenie dla Ciebie: {title} w {city}",
    titel: "Jest zlecenie dla Ciebie",
    groet: "Cześć {naam},",
    intro: "Jest zlecenie, które do Ciebie pasuje: {title} w {branch} w {city}, {when}, {tarief}.",
    reis: ", dojazd około {n} minut",
    tarief: "{rate} za godzinę{reis}",
    bekijk: "Zobacz je i odpowiedz: {link}",
    tip: "Kto odpowie pierwszy, ma największe szanse. Chcesz od teraz widzieć to na telefonie? Włącz powiadomienia w aplikacji.",
    htmlIntro: "Cześć {naam}, jest zlecenie, które do Ciebie pasuje:",
    knop: "Zobacz zlecenie",
    tipHtml: "Kto odpowie pierwszy, ma największe szanse. Chcesz od teraz od razu widzieć to na telefonie? Włącz powiadomienia w aplikacji.",
  },
  ro: {
    subject: "Este o lucrare pentru tine: {title} în {city}",
    titel: "Este o lucrare pentru tine",
    groet: "Salut {naam},",
    intro: "Este o lucrare care ți se potrivește: {title} la {branch} în {city}, {when}, {tarief}.",
    reis: ", aproximativ {n} minute de drum",
    tarief: "{rate} pe oră{reis}",
    bekijk: "Vezi-o și răspunde: {link}",
    tip: "Cine răspunde primul are cele mai mari șanse. Vrei să vezi asta de acum direct pe telefon? Activează notificările în aplicație.",
    htmlIntro: "Salut {naam}, este o lucrare care ți se potrivește:",
    knop: "Vezi lucrarea",
    tipHtml: "Cine răspunde primul are cele mai mari șanse. Vrei să vezi asta de acum imediat pe telefon? Activează notificările în aplicație.",
  },
  uk: {
    subject: "Є робота для тебе: {title} у {city}",
    titel: "Є робота для тебе",
    groet: "Привіт, {naam}!",
    intro: "Є робота, яка тобі підходить: {title} у {branch}, {city}, {when}, {tarief}.",
    reis: ", дорога близько {n} хвилин",
    tarief: "{rate} за годину{reis}",
    bekijk: "Переглянь і відгукнись: {link}",
    tip: "Хто відгукнеться першим, у того більше шансів. Хочеш відтепер бачити це на телефоні? Увімкни сповіщення в застосунку.",
    htmlIntro: "Привіт, {naam}! Є робота, яка тобі підходить:",
    knop: "Переглянути роботу",
    tipHtml: "Хто відгукнеться першим, у того більше шансів. Хочеш відтепер одразу бачити це на телефоні? Увімкни сповіщення в застосунку.",
  },
};

export function klusVoorstelEmailT(
  input: {
    fullName: string;
    title: string;
    branch: string;
    city: string;
    /** al opgemaakt in de taal van de werker, Nederlandse tijd */
    when: string;
    /** "€ 16,50" */
    rate: string;
    travelMinutes: number | null;
    link: string;
  },
  taal: MailTaal,
): MailInput {
  const t = TEKST[taal];
  const first = input.fullName.split(" ")[0] || input.fullName;
  const reis = input.travelMinutes && input.travelMinutes > 0 ? vulIn(t.reis, { n: input.travelMinutes }) : "";
  const tarief = vulIn(t.tarief, { rate: input.rate, reis });
  const e = escapeHtml;
  return {
    to: "",
    subject: vulIn(t.subject, { title: input.title, city: input.city }),
    kind: "klus-alert",
    text: `${vulIn(t.groet, { naam: first })}

${vulIn(t.intro, { title: input.title, branch: input.branch, city: input.city, when: input.when, tarief })}

${vulIn(t.bekijk, { link: input.link })}

${t.tip}`,
    html: shell(
      t.titel,
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3C4A42">${vulIn(t.htmlIntro, { naam: e(first) })}</p>
       <p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#17211C">${e(input.title)}</p>
       <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#3C4A42">${e(input.branch)}, ${e(input.city)}<br>${e(input.when)}<br>${e(tarief)}</p>
       <p style="margin:0">${button(input.link, t.knop)}</p>
       <p style="margin:20px 0 0;font-size:12px;color:#667469">${t.tipHtml}</p>`,
      undefined,
      taal,
    ),
  };
}
