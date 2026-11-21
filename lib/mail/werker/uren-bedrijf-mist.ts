import { vulIn } from "@/lib/i18n/vul-in";
import { button, escapeHtml, shell, type MailTaal } from "@/lib/mail/vorm";
import type { MailInput } from "@/lib/mail";

// ---------------------------------------------------------------------------
// Uren goedkeuren lukt niet: de werker heeft geen geldig KVK- of btw-nummer en geen KOR (lib/timesheets/approve.ts). Naast de
// push (die alleen aankomt als hij meldingen aan heeft) deze mail, in zijn app-taal, één keer per urenbriefje. Zo klopt de
// zin die de werkgever leest ("We hebben hem een bericht gestuurd", lib/timesheets/bulk-goedkeuren.ts) altijd.
// Machine-assisted translations: native-speaker review recommended.
// ---------------------------------------------------------------------------

interface Tekst {
  subject: string;
  titel: string;
  tekst: string;
  htmlIntro: string;
  knop: string;
  kopieer: string;
}

const TEKST: Record<MailTaal, Tekst> = {
  nl: {
    subject: "Je uren staan klaar: vul je bedrijfsgegevens in",
    titel: "Je uren wachten op je bedrijfsgegevens",
    tekst:
      "Hoi {naam},\n\nJe opdrachtgever wil je uren goedkeuren, maar daarvoor hebben we eerst je bedrijfsgegevens nodig: een KVK-nummer of btw-nummer, of de kleineondernemersregeling (KOR) als je die gebruikt. Zonder die gegevens kunnen we geen factuur op je naam maken en je niet uitbetalen.\n\nVul ze hier in:\n{link}\n\nDaarna kan je opdrachtgever je uren goedkeuren en krijg je je geld.",
    htmlIntro:
      "Hoi {naam}, je opdrachtgever wil je uren goedkeuren, maar daarvoor hebben we eerst je bedrijfsgegevens nodig: een <strong>KVK-nummer</strong> of <strong>btw-nummer</strong>, of de <strong>kleineondernemersregeling (KOR)</strong> als je die gebruikt. Zonder die gegevens kunnen we geen factuur op je naam maken en je niet uitbetalen. Daarna kan je opdrachtgever je uren goedkeuren en krijg je je geld.",
    knop: "Gegevens invullen",
    kopieer: "Werkt de knop niet? Kopieer deze link:",
  },
  en: {
    subject: "Your hours are ready: enter your business details",
    titel: "Your hours are waiting for your business details",
    tekst:
      "Hi {naam},\n\nYour client wants to approve your hours, but first we need your business details: a KVK number or VAT number, or the Dutch small business scheme (KOR) if you use it. Without these details we cannot make an invoice in your name or pay you.\n\nEnter them here:\n{link}\n\nAfter that your client can approve your hours and you get your money.",
    htmlIntro:
      "Hi {naam}, your client wants to approve your hours, but first we need your business details: a <strong>KVK number</strong> or <strong>VAT number</strong>, or the <strong>Dutch small business scheme (KOR)</strong> if you use it. Without these details we cannot make an invoice in your name or pay you. After that your client can approve your hours and you get your money.",
    knop: "Enter details",
    kopieer: "Button not working? Copy this link:",
  },
  pl: {
    subject: "Twoje godziny czekają: uzupełnij dane firmy",
    titel: "Twoje godziny czekają na dane Twojej firmy",
    tekst:
      "Cześć {naam},\n\nTwój zleceniodawca chce zatwierdzić Twoje godziny, ale najpierw potrzebujemy danych Twojej firmy: numeru KVK lub numeru VAT albo informacji, że korzystasz z holenderskiego zwolnienia dla małych przedsiębiorców (KOR). Bez tych danych nie możemy wystawić faktury w Twoim imieniu ani wypłacić Ci pieniędzy.\n\nUzupełnij je tutaj:\n{link}\n\nPotem zleceniodawca może zatwierdzić Twoje godziny i dostaniesz pieniądze.",
    htmlIntro:
      "Cześć {naam}, Twój zleceniodawca chce zatwierdzić Twoje godziny, ale najpierw potrzebujemy danych Twojej firmy: <strong>numeru KVK</strong> lub <strong>numeru VAT</strong> albo informacji, że korzystasz z <strong>holenderskiego zwolnienia dla małych przedsiębiorców (KOR)</strong>. Bez tych danych nie możemy wystawić faktury w Twoim imieniu ani wypłacić Ci pieniędzy. Potem zleceniodawca może zatwierdzić Twoje godziny i dostaniesz pieniądze.",
    knop: "Uzupełnij dane",
    kopieer: "Przycisk nie działa? Skopiuj ten link:",
  },
  ro: {
    subject: "Orele tale sunt gata: completează datele firmei",
    titel: "Orele tale așteaptă datele firmei tale",
    tekst:
      "Salut {naam},\n\nClientul tău vrea să-ți aprobe orele, dar mai întâi avem nevoie de datele firmei tale: un număr KVK sau un cod de TVA, ori regimul olandez pentru întreprinderi mici (KOR), dacă îl folosești. Fără aceste date nu putem emite o factură pe numele tău și nu te putem plăti.\n\nCompletează-le aici:\n{link}\n\nApoi clientul îți poate aproba orele și îți primești banii.",
    htmlIntro:
      "Salut {naam}, clientul tău vrea să-ți aprobe orele, dar mai întâi avem nevoie de datele firmei tale: un <strong>număr KVK</strong> sau un <strong>cod de TVA</strong>, ori <strong>regimul olandez pentru întreprinderi mici (KOR)</strong>, dacă îl folosești. Fără aceste date nu putem emite o factură pe numele tău și nu te putem plăti. Apoi clientul îți poate aproba orele și îți primești banii.",
    knop: "Completează datele",
    kopieer: "Butonul nu funcționează? Copiază acest link:",
  },
  uk: {
    subject: "Твої години готові: введи дані свого бізнесу",
    titel: "Твої години чекають на дані твого бізнесу",
    tekst:
      "Привіт, {naam}!\n\nЗамовник хоче схвалити твої години, але спершу нам потрібні дані твого бізнесу: номер KVK або номер ПДВ, або нідерландський режим для малих підприємців (KOR), якщо ти ним користуєшся. Без цих даних ми не можемо виставити рахунок від твого імені й виплатити тобі гроші.\n\nВведи їх тут:\n{link}\n\nПісля цього замовник зможе схвалити твої години, і ти отримаєш гроші.",
    htmlIntro:
      "Привіт, {naam}! Замовник хоче схвалити твої години, але спершу нам потрібні дані твого бізнесу: <strong>номер KVK</strong> або <strong>номер ПДВ</strong>, або <strong>нідерландський режим для малих підприємців (KOR)</strong>, якщо ти ним користуєшся. Без цих даних ми не можемо виставити рахунок від твого імені й виплатити тобі гроші. Після цього замовник зможе схвалити твої години, і ти отримаєш гроші.",
    knop: "Ввести дані",
    kopieer: "Кнопка не працює? Скопіюй це посилання:",
  },
};

/** De mail "vul je bedrijfsgegevens in" bij uren die op goedkeuren wachten; `link` gaat naar Verificatie. */
export function urenBedrijfMistEmailT(fullName: string, link: string, taal: MailTaal): MailInput {
  const t = TEKST[taal];
  const first = fullName.split(" ")[0] || fullName;
  const e = escapeHtml;
  return {
    to: "",
    subject: t.subject,
    kind: "uren-bedrijf-mist",
    text: vulIn(t.tekst, { naam: first, link }),
    html: shell(
      t.titel,
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3C4A42">${vulIn(t.htmlIntro, { naam: e(first) })}</p>
       <p style="margin:0 0 20px">${button(link, t.knop)}</p>
       <p style="margin:0;font-size:12px;color:#667469">${t.kopieer}<br><span style="word-break:break-all">${link}</span></p>`,
      undefined,
      taal,
    ),
  };
}
