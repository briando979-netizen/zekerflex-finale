import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { sendMail, mailShell, mailButton } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { CONTACTS } from "@/lib/seo";
import { dealVerlopen, getDeal } from "@/lib/scans/deal";
import { getScanLog, logStap } from "@/lib/scans/store";
import { isBounceOpschorting } from "@/lib/mail/bounce";
import { SOORT_LABEL, dealEuro, isTestEmail, laatstOpgevolgd, type ScanLog, type ScanSoort } from "@/lib/scans/model";

// ---------------------------------------------------------------------------
// Opvolgen vanuit Admin → Scans & deals: een mens van sales mailt het voorstel op
// maat naar het bedrijf achter een scan (nooit automatisch; AGENTS.md). De mail is
// een zakelijke introductie ("sales-outreach"): met afmeldlink, en wie zich
// afmeldde krijgt hem niet. Hooguit één keer per week per scan; nooit naar een
// testadres. In het logboek komt de stap "opgevolgd", in de lead een notitie.
// ---------------------------------------------------------------------------

export const OPVOLG_PAUZE_DAGEN = 7;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function leesSleutel(sleutel: string): { soort: ScanSoort; scanId: string } | null {
  const m = /^(website|reviews):([a-f0-9]{16})$/.exec(sleutel);
  return m ? { soort: m[1] as ScanSoort, scanId: m[2]! } : null;
}

export async function stuurVoorstel(sleutel: string, emailRuw: string, notitie: string, door: { userId: string; naam: string; email: string }, now = new Date()): Promise<ScanLog> {
  const k = leesSleutel(sleutel);
  if (!k) throw AppError.validation("Onbekende scan.");
  const log = await getScanLog(k.soort, k.scanId);
  if (!log) throw AppError.notFound("Deze scan staat niet in het logboek (van vóór 4 november).");
  if (!log.dealId) throw AppError.validation("Bij deze scan hoort geen voorstel.");
  const deal = await getDeal(log.dealId);
  if (!deal) throw AppError.validation("Het voorstel bestaat niet meer.");
  if (dealVerlopen(deal, now.getTime())) throw AppError.validation("Het voorstel is verlopen. Laat de scan opnieuw doen voor een voorstel met de prijzen van nu.");
  if (deal.status === "akkoord") throw AppError.validation("Dit bedrijf zei al ja op het voorstel.");
  const email = emailRuw.trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 200) throw AppError.validation("Vul een geldig e-mailadres in.");
  if (isTestEmail(email)) throw AppError.validation("Dit is een testadres; daar mailen we geen voorstel naar.");
  const vorige = laatstOpgevolgd(log);
  if (vorige && now.getTime() - Date.parse(vorige) < OPVOLG_PAUZE_DAGEN * 86_400_000) {
    throw AppError.conflict(`Het voorstel is al gemaild op ${new Date(vorige).toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "long" })}. Wacht een week voor je opnieuw mailt.`);
  }

  const base = env.APP_BASE_URL.replace(/\/+$/, "");
  const dealUrl = `${base}/deal/${deal.id}`;
  const aanbevolen = deal.opties.filter((o) => o.aanbevolen);
  const regel = (o: (typeof aanbevolen)[number]) => `${o.naam}${o.eenmaligCent ? ` (${dealEuro(o.eenmaligCent)} eenmalig)` : ""}${o.maandCent ? ` (${dealEuro(o.maandCent)} per maand)` : ""}${!o.eenmaligCent && !o.maandCent && o.prijsTekst ? ` (${o.prijsTekst})` : ""}`;
  const persoonlijk = notitie.trim().slice(0, 600);
  const intro = `Via de gratis ${SOORT_LABEL[log.soort].toLowerCase()} van ZekerFlex is ${log.host ?? log.naam} onlangs bekeken (score ${log.score} van 100). Op basis daarvan hebben we een voorstel op maat gemaakt voor ${log.naam}.`;
  const res = await sendMail({
    to: email,
    from: env.MAIL_FROM,
    replyTo: door.email || CONTACTS.sales,
    kind: "sales-outreach",
    subject: `Een voorstel op maat voor ${log.naam}`,
    text: `Goedendag,\n\n${intro}\n\n${persoonlijk ? `${persoonlijk}\n\n` : ""}Wat wij aanraden:\n${aanbevolen.map((o) => `- ${regel(o)}`).join("\n")}\n\nBekijk het voorstel; je vinkt zelf aan wat je wilt en ziet meteen wat het kost:\n${dealUrl}\n\nHet rapport met alle punten: ${base}${log.rapport}\n\nAlle bedragen exclusief btw. Een vraag? Antwoord gewoon op deze mail.\n\nMet vriendelijke groet,\n${door.naam}\nZekerFlex`,
    html: mailShell(
      `Een voorstel op maat voor ${esc(log.naam)}`,
      `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#3C4A42">Goedendag,</p>
       <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#3C4A42">${esc(intro)}</p>
       ${persoonlijk ? `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#3C4A42">${esc(persoonlijk)}</p>` : ""}
       <p style="margin:0 0 6px;font-size:14px;color:#17211C"><strong>Wat wij aanraden</strong></p>
       <ul style="margin:0 0 14px;padding-left:18px;font-size:14px;color:#3C4A42">${aanbevolen.map((o) => `<li style="margin:0 0 4px">${esc(regel(o))}</li>`).join("")}</ul>
       <p style="margin:0 0 14px">${mailButton(dealUrl, "Bekijk je voorstel")}</p>
       <p style="margin:0 0 12px;font-size:13px;color:#5A6B62">Je vinkt zelf aan wat je wilt en ziet meteen wat het kost. Alle bedragen exclusief btw. <a href="${base}${log.rapport}" style="color:#0E5C4A">Bekijk het rapport</a>.</p>
       <p style="margin:0;font-size:14px;color:#3C4A42">Met vriendelijke groet,<br>${esc(door.naam)}<br>ZekerFlex</p>`,
    ),
  });
  if (res.suppressed) {
    throw AppError.validation(
      isBounceOpschorting(res.suppressed)
        ? "Mail naar dit adres kwam eerder terug: het adres bestaat niet. We hebben niets verstuurd; zoek een ander adres van dit bedrijf."
        : "Dit adres heeft zich afgemeld voor zakelijke introducties; we hebben niets verstuurd.",
    );
  }
  if (res.error) throw AppError.upstream(`Versturen lukte niet: ${res.error}`);

  await logStap(k.soort, k.scanId, "opgevolgd", `${email} · ${door.naam}`, {}, now);
  if (log.leadId) {
    const lead = await prisma.salesLead.findUnique({ where: { id: log.leadId }, select: { notes: true, contactEmail: true } }).catch(() => null);
    if (lead) {
      const dag = now.toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "short" });
      await prisma.salesLead
        .update({
          where: { id: log.leadId },
          data: { notes: `[${dag}] Voorstel op maat gemaild naar ${email} door ${door.naam}.\n${lead.notes ?? ""}`.slice(0, 2000), lastContactedAt: now, ...(lead.contactEmail ? {} : { contactEmail: email }) },
        })
        .catch(() => undefined);
    }
  }
  await recordAudit({
    category: "SALES",
    action: "scan.voorstel.gemaild",
    actorUserId: door.userId,
    summary: `Voorstel op maat voor ${log.naam} gemaild naar ${email}`,
    targetType: "scan",
    targetId: sleutel,
  }).catch(() => undefined);
  return (await getScanLog(k.soort, k.scanId)) ?? log;
}
