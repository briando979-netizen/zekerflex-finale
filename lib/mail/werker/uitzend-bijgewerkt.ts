// Machine-assisted translations: native-speaker review recommended.
// De mail "je uitzendovereenkomst is bijgewerkt" (12 nov 2026): de terugval voor werkers die de push niet kunnen ontvangen
// (lib/agreements/uitzend-melding.ts). Geen bijlage en geen contracttekst: alleen wat er is en een link naar de contractstap op Verificatie,
// waar de werker eerst leest en dan tekent. Kind "uitzend-bijgewerkt" valt onder de essentiële mails (over het eigen contract).
import type { MailInput } from "@/lib/mail";
import { button, escapeHtml, shell, type MailTaal } from "@/lib/mail/vorm";
import { vulIn } from "@/lib/i18n/vul-in";

interface Tekst {
  subject: string;
  hoi: string;
  alinea1: string;
  alinea2: string;
  knop: string;
  slot: string;
}

const TEKST: Record<MailTaal, Tekst> = {
  nl: {
    subject: "Je uitzendovereenkomst is bijgewerkt",
    hoi: "Hoi {naam},",
    alinea1: "De tekst en de gegevens van de werkgever in je uitzendovereenkomst zijn aangepast.",
    alinea2: "Lees de nieuwe versie en teken opnieuw. Zolang je dat niet hebt gedaan, kun je niet op klussen reageren.",
    knop: "Overeenkomst lezen en tekenen",
    slot: "Je oude overeenkomst blijft zoals je hem hebt getekend; je kunt hem terugvinden op dezelfde pagina.",
  },
  en: {
    subject: "Your temporary-work agreement has been updated",
    hoi: "Hi {naam},",
    alinea1: "The text and the employer's details in your temporary-work agreement have changed.",
    alinea2: "Read the new version and sign again. Until you have, you cannot apply for jobs.",
    knop: "Read and sign the agreement",
    slot: "Your old agreement stays exactly as you signed it; you can find it on the same page.",
  },
  pl: {
    subject: "Twoja umowa o pracę tymczasową została zaktualizowana",
    hoi: "Cześć {naam},",
    alinea1: "Zmienił się tekst i dane pracodawcy w Twojej umowie o pracę tymczasową.",
    alinea2: "Przeczytaj nową wersję i podpisz ją ponownie. Dopóki tego nie zrobisz, nie możesz odpowiadać na zlecenia.",
    knop: "Przeczytaj i podpisz umowę",
    slot: "Twoja stara umowa pozostaje dokładnie taka, jak ją podpisałeś; znajdziesz ją na tej samej stronie.",
  },
  ro: {
    subject: "Contractul tău de muncă temporară a fost actualizat",
    hoi: "Salut {naam},",
    alinea1: "Textul și datele angajatorului din contractul tău de muncă temporară s-au schimbat.",
    alinea2: "Citește noua versiune și semnează din nou. Până atunci nu poți aplica la lucrări.",
    knop: "Citește și semnează contractul",
    slot: "Vechiul tău contract rămâne exact așa cum l-ai semnat; îl găsești pe aceeași pagină.",
  },
  uk: {
    subject: "Твій договір тимчасової роботи оновлено",
    hoi: "Привіт, {naam}!",
    alinea1: "Текст і дані роботодавця у твоєму договорі тимчасової роботи змінилися.",
    alinea2: "Прочитай нову версію і підпиши ще раз. Доки цього не зроблено, ти не можеш відгукуватися на роботи.",
    knop: "Прочитати й підписати договір",
    slot: "Твій старий договір залишається саме таким, яким ти його підписав(-ла); його можна знайти на тій самій сторінці.",
  },
};

export function uitzendBijgewerktEmailT(fullName: string, appUrl: string, taal: MailTaal): MailInput {
  const t = TEKST[taal];
  const first = fullName.split(" ")[0] || fullName;
  const href = `${appUrl.replace(/\/+$/, "")}/dashboard/verificatie#uitzendovereenkomst`;
  const hoi = vulIn(t.hoi, { naam: first });
  return {
    to: "",
    subject: t.subject,
    kind: "uitzend-bijgewerkt",
    text: `${hoi}\n\n${t.alinea1}\n\n${t.alinea2}\n\n${href}\n\n${t.slot}`,
    html: shell(
      t.subject,
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3C4A42">${escapeHtml(hoi)}</p>
       <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#3C4A42">${escapeHtml(t.alinea1)}</p>
       <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#3C4A42">${escapeHtml(t.alinea2)}</p>
       <p style="margin:0 0 16px">${button(href, escapeHtml(t.knop))}</p>
       <p style="margin:0;font-size:12px;color:#667469">${escapeHtml(t.slot)}</p>`,
      t.alinea2,
      taal,
    ),
  };
}
