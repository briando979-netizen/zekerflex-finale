// Machine-assisted translations: native-speaker review recommended.
// De mail "kies je branches" (15 nov 2026): de terugval voor werkers die de push niet kunnen ontvangen
// (lib/onboarding/branches-melding.ts). Geen bijlage: alleen wat er mist en een link naar de brancheskeuze. Soort "onboarding-reminder":
// dezelfde soort als de andere herinneringen aan een aanmelding die nog niet af is.
import type { MailInput } from "@/lib/mail";
import { button, escapeHtml, shell, type MailTaal } from "@/lib/mail/vorm";
import { vulIn } from "@/lib/i18n/vul-in";
import { BRANCHES_MELDING } from "@/lib/onboarding/branches-melding-teksten";
import { herinneringHref } from "@/lib/onboarding/herinnering-teksten";

export function branchesMeldingEmailT(fullName: string, appUrl: string, taal: MailTaal): MailInput {
  const t = BRANCHES_MELDING[taal];
  const first = fullName.split(" ")[0] || fullName;
  const href = `${appUrl.replace(/\/+$/, "")}${herinneringHref("branches")}`;
  const hoi = vulIn(t.hoi, { naam: first });
  return {
    to: "",
    subject: t.subject,
    kind: "onboarding-reminder",
    text: `${hoi}\n\n${t.alinea1}\n\n${t.alinea2}\n\n${href}`,
    html: shell(
      t.subject,
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3C4A42">${escapeHtml(hoi)}</p>
       <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#3C4A42">${escapeHtml(t.alinea1)}</p>
       <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#3C4A42">${escapeHtml(t.alinea2)}</p>
       <p style="margin:0">${button(href, escapeHtml(t.knop))}</p>`,
      t.alinea2,
      taal,
    ),
  };
}
