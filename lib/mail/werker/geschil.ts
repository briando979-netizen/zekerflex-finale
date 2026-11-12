import { vulIn } from "@/lib/i18n/vul-in";
import { button, escapeHtml, shell, type MailTaal } from "@/lib/mail/vorm";
import type { MailInput } from "@/lib/mail";

// ---------------------------------------------------------------------------
// Het voorstel van een opdrachtgever om de uren van een werker te corrigeren (lib/disputes/raise.ts), in de app-taal van de werker.
// De mail gaat alleen naar de werker. In het Nederlands byte voor byte gelijk aan de oude mail.
// Machine-assisted translations: native-speaker review recommended.
// ---------------------------------------------------------------------------

interface Tekst {
  /** als de dienst geen titel heeft */
  dienst: string;
  subject: string;
  titel: string;
  tekst: string;
  htmlIntro: string;
  knop: string;
  kopieer: string;
  weiger: string;
}

const TEKST: Record<MailTaal, Tekst> = {
  nl: {
    dienst: "je dienst",
    subject: "Voorstel voor correctie van je uren — {dienst}",
    titel: "Voorstel voor correctie van je uren",
    tekst: 'Hoi {naam},\n\nDe opdrachtgever van "{dienst}" wil je ingediende uren corrigeren: van {van} naar {naar} uur. Dit gaat pas door als jij hiermee akkoord gaat.\n\nBekijk het voorstel en reageer:\n{link}\n\n{weiger}',
    htmlIntro: "Hoi {naam}, de opdrachtgever van <strong>{dienst}</strong> wil je ingediende uren corrigeren: van <strong>{van}</strong> naar <strong>{naar}</strong> uur. Dit gaat pas door als jij hiermee akkoord gaat.",
    knop: "Bekijk voorstel",
    kopieer: "Werkt de knop niet? Kopieer deze link:",
    weiger: "Ben je het er niet mee eens? Dan kun je weigeren — het gaat dan naar ZekerFlex voor een onafhankelijke beoordeling.",
  },
  en: {
    dienst: "your shift",
    subject: "Proposal to correct your hours — {dienst}",
    titel: "Proposal to correct your hours",
    tekst: 'Hi {naam},\n\nThe client of "{dienst}" wants to correct the hours you submitted: from {van} to {naar} hours. This only goes ahead if you agree.\n\nView the proposal and respond:\n{link}\n\n{weiger}',
    htmlIntro: "Hi {naam}, the client of <strong>{dienst}</strong> wants to correct the hours you submitted: from <strong>{van}</strong> to <strong>{naar}</strong> hours. This only goes ahead if you agree.",
    knop: "View proposal",
    kopieer: "Button not working? Copy this link:",
    weiger: "Don't agree? Then you can decline — it then goes to ZekerFlex for an independent review.",
  },
  pl: {
    dienst: "Twoja zmiana",
    subject: "Propozycja korekty Twoich godzin — {dienst}",
    titel: "Propozycja korekty Twoich godzin",
    tekst: 'Cześć {naam},\n\nZleceniodawca „{dienst}” chce poprawić godziny, które zgłosiłeś/zgłosiłaś: z {van} na {naar} godz. Zmiana wejdzie w życie dopiero, gdy się zgodzisz.\n\nZobacz propozycję i odpowiedz:\n{link}\n\n{weiger}',
    htmlIntro: "Cześć {naam}, zleceniodawca <strong>{dienst}</strong> chce poprawić godziny, które zgłosiłeś/zgłosiłaś: z <strong>{van}</strong> na <strong>{naar}</strong> godz. Zmiana wejdzie w życie dopiero, gdy się zgodzisz.",
    knop: "Zobacz propozycję",
    kopieer: "Przycisk nie działa? Skopiuj ten link:",
    weiger: "Nie zgadzasz się? Możesz odmówić — sprawa trafi wtedy do ZekerFlex do niezależnej oceny.",
  },
  ro: {
    dienst: "tura ta",
    subject: "Propunere de corectare a orelor tale — {dienst}",
    titel: "Propunere de corectare a orelor tale",
    tekst: 'Salut {naam},\n\nClientul pentru „{dienst}” vrea să corecteze orele pe care le-ai trimis: de la {van} la {naar} ore. Se aplică doar dacă ești de acord.\n\nVezi propunerea și răspunde:\n{link}\n\n{weiger}',
    htmlIntro: "Salut {naam}, clientul pentru <strong>{dienst}</strong> vrea să corecteze orele pe care le-ai trimis: de la <strong>{van}</strong> la <strong>{naar}</strong> ore. Se aplică doar dacă ești de acord.",
    knop: "Vezi propunerea",
    kopieer: "Butonul nu funcționează? Copiază acest link:",
    weiger: "Nu ești de acord? Poți refuza — cazul ajunge atunci la ZekerFlex pentru o evaluare independentă.",
  },
  uk: {
    dienst: "твоя зміна",
    subject: "Пропозиція виправити твої години — {dienst}",
    titel: "Пропозиція виправити твої години",
    tekst: 'Привіт, {naam}!\n\nЗамовник «{dienst}» хоче виправити години, які ти подав/подала: з {van} на {naar} год. Це набуде чинності, лише якщо ти погодишся.\n\nПереглянь пропозицію й відповідай:\n{link}\n\n{weiger}',
    htmlIntro: "Привіт, {naam}! Замовник <strong>{dienst}</strong> хоче виправити години, які ти подав/подала: з <strong>{van}</strong> на <strong>{naar}</strong> год. Це набуде чинності, лише якщо ти погодишся.",
    knop: "Переглянути пропозицію",
    kopieer: "Кнопка не працює? Скопіюй це посилання:",
    weiger: "Не погоджуєшся? Тоді можеш відмовитися — справа піде до ZekerFlex на незалежний розгляд.",
  },
};

export function hoursCorrectionProposedEmailT(
  fullName: string,
  link: string,
  shiftTitle: string | null,
  claimedHours: number,
  proposedHours: number,
  taal: MailTaal,
): MailInput {
  const t = TEKST[taal];
  const first = fullName.split(" ")[0] || fullName;
  const dienst = shiftTitle ?? t.dienst;
  const van = claimedHours.toFixed(2).replace(".", ",");
  const naar = proposedHours.toFixed(2).replace(".", ",");
  const e = escapeHtml;
  return {
    to: "",
    subject: vulIn(t.subject, { dienst }),
    kind: "uren-correctie-voorstel",
    text: vulIn(t.tekst, { naam: first, dienst, van, naar, link, weiger: t.weiger }),
    html: shell(
      t.titel,
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3C4A42">${vulIn(t.htmlIntro, { naam: e(first), dienst: e(dienst), van, naar })}</p>
       <p style="margin:0 0 20px">${button(link, t.knop)}</p>
       <p style="margin:0;font-size:12px;color:#667469">${t.kopieer}<br><span style="word-break:break-all">${link}</span></p>
       <p style="margin:16px 0 0;font-size:12px;color:#667469">${t.weiger}</p>`,
      undefined,
      taal,
    ),
  };
}
