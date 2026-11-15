import type { MailInput } from "@/lib/mail";
import { button, escapeHtml, shell, type MailTaal } from "@/lib/mail/vorm";
import { vulIn } from "@/lib/i18n/vul-in";
import { personeelTeksten } from "@/lib/horeca-personeel/teksten";
import { UITNODIGING_DAGEN } from "@/lib/horeca-personeel/model";

// De mail aan een nieuwe medewerker met de link om een account te maken. Soort "team-uitnodiging": dezelfde soort als de
// uitnodiging van een collega-beheerder, dus dezelfde mailvoorkeuren en het zelfde (niet te weigeren) belang.
export function uitnodigingMail(input: { naam: string; zaak: string; beheerder: string; link: string; taal: MailTaal }): MailInput {
  const t = personeelTeksten(input.taal).mail;
  const hoi = vulIn(t.hoi, { naam: input.naam.split(" ")[0] || input.naam });
  const tekst = vulIn(t.tekst, { beheerder: input.beheerder, zaak: input.zaak });
  const geldig = vulIn(t.geldig, { dagen: UITNODIGING_DAGEN });
  const onderwerp = vulIn(t.onderwerp, { zaak: input.zaak });
  return {
    to: "",
    subject: onderwerp,
    kind: "team-uitnodiging",
    text: `${hoi}\n\n${tekst}\n\n${input.link}\n\n${geldig}`,
    html: shell(
      onderwerp,
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3C4A42">${escapeHtml(hoi)}</p>
       <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#3C4A42">${escapeHtml(tekst)}</p>
       <p style="margin:0 0 20px">${button(input.link, escapeHtml(t.knop))}</p>
       <p style="margin:0;font-size:12px;color:#667469">${escapeHtml(geldig)}</p>`,
      tekst,
      input.taal,
    ),
  };
}
