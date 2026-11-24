import { vulIn } from "@/lib/i18n/vul-in";
import { button, escapeHtml, shell, type MailTaal } from "@/lib/mail/vorm";
import type { MailInput } from "@/lib/mail";

// Mail aan een werker als hij/zij is uitgekozen (ingepland) voor een klus, in zijn/haar app-taal.
// Machine-assisted translations: native-speaker review recommended.

interface Tekst {
  subject: string;
  titel: string;
  groet: string;
  intro: string;
  knop: string;
  tip: string;
}

const TEKST: Record<MailTaal, Tekst> = {
  nl: {
    subject: "Je bent uitgekozen voor: {title}",
    titel: "Je bent uitgekozen!",
    groet: "Hoi {naam},",
    intro: "Goed nieuws! {bedrijf} heeft je ingepland voor <strong>{title}</strong>, {when}.",
    knop: "Bekijk je klus",
    tip: "Zet de klus in je agenda zodat je hem niet mist.",
  },
  en: {
    subject: "You've been selected for: {title}",
    titel: "You've been selected!",
    groet: "Hi {naam},",
    intro: "Great news! {bedrijf} has scheduled you for <strong>{title}</strong>, {when}.",
    knop: "View your job",
    tip: "Add the job to your calendar so you don't miss it.",
  },
  pl: {
    subject: "Zostałeś(aś) wybrany(a) do: {title}",
    titel: "Zostałeś(aś) wybrany(a)!",
    groet: "Cześć {naam},",
    intro: "Świetna wiadomość! {bedrijf} zaplanował(a) Cię na <strong>{title}</strong>, {when}.",
    knop: "Zobacz zlecenie",
    tip: "Dodaj zlecenie do kalendarza, żeby o nim nie zapomnieć.",
  },
  ro: {
    subject: "Ai fost ales(ă) pentru: {title}",
    titel: "Ai fost ales(ă)!",
    groet: "Salut {naam},",
    intro: "Veste bună! {bedrijf} te-a programat pentru <strong>{title}</strong>, {when}.",
    knop: "Vezi lucrarea",
    tip: "Adaugă lucrarea în calendar ca să nu o ratezi.",
  },
  uk: {
    subject: "Тебе вибрали на: {title}",
    titel: "Тебе вибрано!",
    groet: "Привіт, {naam}!",
    intro: "Чудові новини! {bedrijf} поставив(ла) тебе в графік на <strong>{title}</strong>, {when}.",
    knop: "Переглянути роботу",
    tip: "Додай роботу до календаря, щоб не пропустити.",
  },
};

export function uitgekozenEmailT(
  input: {
    fullName: string;
    title: string;
    bedrijf: string;
    /** al opgemaakt in de taal van de werker, bv. "do 5 dec 09:00–17:00" */
    when: string;
    link: string;
  },
  taal: MailTaal,
): MailInput {
  const t = TEKST[taal];
  const first = input.fullName.split(" ")[0] ?? input.fullName;
  const e = escapeHtml;
  return {
    to: "",
    subject: vulIn(t.subject, { title: input.title }),
    kind: "uitgekozen",
    text: `${vulIn(t.groet, { naam: first })}\n\n${vulIn(t.intro.replace(/<[^>]+>/g, ""), { bedrijf: input.bedrijf, title: input.title, when: input.when })}\n\n${input.link}\n\n${t.tip}`,
    html: shell(
      t.titel,
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3C4A42">${vulIn(t.groet, { naam: e(first) })}</p>
       <p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#17211C">${e(input.title)}</p>
       <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#3C4A42">${e(input.bedrijf)}<br>${e(input.when)}</p>
       <p style="margin:0 0 20px">${button(input.link, t.knop)}</p>
       <p style="margin:0;font-size:12px;color:#667469">${t.tip}</p>`,
      undefined,
      taal,
    ),
  };
}
