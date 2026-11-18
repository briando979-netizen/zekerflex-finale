import type { SalesCampaign, SalesLead, SalesOutreach } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { sendMail, mailShell, mailButton } from "@/lib/mail";
import {
  campaignSendCountToday,
  globalSendCountToday,
  withinSendWindow,
} from "@/lib/sales/campaign";
import { addSuppression, isSuppressed, normaliseEmail } from "@/lib/sales/suppression";
import { isBounceOpschorting } from "@/lib/mail/bounce";
import { zonderAdressen } from "@/lib/mail/log-domein";
import { CAMPAGNE_TEKST_MODEL, knopVan } from "@/lib/sales/campagne-tekst";
import { leesCampagneTekst } from "@/lib/sales/campagne-tekst-opslag";

// ---------------------------------------------------------------------------
// The one place that actually sends a sales-outreach mail. Re-checks every
// guard at send time (suppression, send window, daily caps) so a late opt-out
// or a cap reached mid-run still stops the mail. sendMail() adds the
// List-Unsubscribe header + the "why you got this / unsubscribe" footer
// automatically because "sales-outreach" is an optional mail category.
// ---------------------------------------------------------------------------

export type SendVia = "autopilot" | "manual";

export interface SendOutcome {
  status: "sent" | "suppressed" | "skipped" | "failed";
  reason?: string | undefined;
  outreachId: string;
}

function nextDelayDays(campaign: SalesCampaign, sentStepIndex: number): number | null {
  const delays = campaign.stepDelaysDays;
  const nextStep = sentStepIndex + 1;
  if (nextStep >= delays.length) return null; // sequence complete
  const cur = delays[sentStepIndex] ?? 0;
  const nxt = delays[nextStep] ?? cur + 5;
  return Math.max(1, nxt - cur);
}

const veilig = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/**
 * De mail zoals een bedrijf hem krijgt: de tekst, een knop en de voetregel. Zonder eigen knop (een campagne met een vaste
 * tekst kan er een hebben, lib/sales/campagne-tekst.ts) is het de gewone knop naar /voor-bedrijven. De voorbeeldmail aan
 * de beheerder (app/api/admin/sales/campaigns/[id]/testmail) bouwt hiermee precies dezelfde mail.
 */
export function bouwOutreachMail(input: {
  companyName: string;
  subject: string;
  body: string;
  knop?: { url: string; tekst: string } | null;
  /** een extra regel onderaan (alleen de voorbeeldmail gebruikt dit) */
  naschrift?: string;
}): { text: string; html: string } {
  const bodyText = input.body.trim();
  const paras = bodyText.split(/\n{2,}/).map((p) => veilig(p).replace(/\n/g, "<br>"));
  const inner = paras
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#3C4A42">${p}</p>`)
    .join("");
  const basis = env.APP_BASE_URL.replace(/\/+$/, "");
  const knop = input.knop ?? { url: `${basis}/voor-bedrijven`, tekst: "Bekijk ZekerFlex voor bedrijven" };
  const cta = mailButton(knop.url, veilig(knop.tekst));
  const html = mailShell(
    input.subject,
    `${inner}
     <p style="margin:18px 0 0">${cta}</p>
     <p style="margin:20px 0 0;font-size:12px;color:#8A938C">
       Zekerflex, Inc. · Je ontvangt dit bericht als zakelijke introductie omdat
       ${veilig(input.companyName)} mogelijk baat heeft bij flexibele bezetting.
     </p>${input.naschrift ? `\n     <p style="margin:12px 0 0;font-size:12px;color:#8A938C">${veilig(input.naschrift)}</p>` : ""}`,
  );
  const meer = input.knop ? `${knop.tekst}: ${knop.url}` : `Meer weten: ${knop.url}`;
  const text = `${bodyText}\n\n${meer}\n\nZekerflex, Inc.${input.naschrift ? `\n\n${input.naschrift}` : ""}`;
  return { text, html };
}

function buildBody(lead: SalesLead, outreach: SalesOutreach, knop: { url: string; tekst: string } | null): { text: string; html: string } {
  return bouwOutreachMail({ companyName: lead.companyName, subject: outreach.subject, body: outreach.body, knop });
}

/** Zo vaak mag de verzending aan één bedrijf mislukken voordat de motor het niet meer vanzelf probeert. */
const MAX_MISLUKT = 3;

export async function sendOutreachMail(outreachId: string, via: SendVia): Promise<SendOutcome> {
  const outreach = await prisma.salesOutreach.findUnique({
    where: { id: outreachId },
    include: { lead: { include: { campaign: true } } },
  });
  if (!outreach) throw AppError.notFound("Outreach niet gevonden");
  if (!["APPROVED", "SCHEDULED", "DRAFT"].includes(outreach.status)) {
    return { status: "skipped", reason: `status ${outreach.status}`, outreachId };
  }

  const lead = outreach.lead;
  const to = lead.contactEmail || lead.discoveredEmail;
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    await prisma.salesOutreach.update({
      where: { id: outreachId },
      data: { status: "FAILED", failReason: "geen geldig e-mailadres" },
    });
    return { status: "failed", reason: "geen e-mailadres", outreachId };
  }
  const email = normaliseEmail(to);

  // Suppression — the hard stop.
  const sup = await isSuppressed(email);
  if (sup.blocked) {
    await prisma.$transaction([
      prisma.salesOutreach.update({
        where: { id: outreachId },
        data: { status: "SUPPRESSED", failReason: sup.detail ?? sup.reason ?? "onderdrukt" },
      }),
      prisma.salesLead.update({
        where: { id: lead.id },
        data: {
          suppressed: true,
          suppressedReason: sup.detail ?? sup.reason ?? "onderdrukt",
          status: sup.reason === "category-opt-out" || sup.reason === "unsubscribe" ? "UNSUBSCRIBED" : lead.status,
          nextActionAt: null,
        },
      }),
    ]);
    return { status: "suppressed", reason: sup.detail ?? sup.reason, outreachId };
  }

  // Send window + caps (only enforced for autopilot; a human clicking "send"
  // in review mode has made a deliberate choice).
  const campaign = lead.campaign;
  if (via === "autopilot") {
    if (!campaign) return { status: "skipped", reason: "geen campagne", outreachId };
    if (!withinSendWindow(campaign)) {
      return { status: "skipped", reason: "buiten verzendvenster", outreachId };
    }
    const [campToday, globalToday] = await Promise.all([
      campaignSendCountToday(campaign.id),
      globalSendCountToday(),
    ]);
    if (campToday >= campaign.dailyCap) {
      return { status: "skipped", reason: "campagne-dagcap bereikt", outreachId };
    }
    if (globalToday >= env.SALES_DAILY_CAP_GLOBAL) {
      return { status: "skipped", reason: "globale dagcap bereikt", outreachId };
    }
  }

  // Een concept uit de vaste tekst van de campagne (lib/sales/campagne-tekst.ts) krijgt de knop van die campagne; staat
  // er geen (geldige) knop bij, dan de gewone. Het is ook de enige mail van de reeks: na verzending loopt de lead af.
  const vasteTekst = campaign && outreach.generatedByModel === CAMPAGNE_TEKST_MODEL ? await leesCampagneTekst(campaign.id) : null;
  const eenmalig = outreach.generatedByModel === CAMPAGNE_TEKST_MODEL;
  const { text, html } = buildBody(lead, outreach, knopVan(vasteTekst, env.APP_BASE_URL));
  const from = campaign?.fromAddress?.trim() || env.MAIL_SALES_FROM;

  let mailResult;
  try {
    mailResult = await sendMail({
      to: email,
      subject: outreach.subject,
      text,
      html,
      kind: "sales-outreach",
      from,
      replyTo: env.MAIL_SALES_FROM,
    });
  } catch (err) {
    await prisma.salesOutreach.update({
      where: { id: outreachId },
      data: { status: "FAILED", failReason: (err as Error).message.slice(0, 300) },
    });
    return { status: "failed", reason: (err as Error).message, outreachId };
  }

  // sendMail never throws; a category opt-out comes back as `suppressed`, and so does an address that
  // bounced hard (lib/mail/bounce.ts) — that one is a bounce, not an unsubscribe.
  if (mailResult.suppressed) {
    const bounce = isBounceOpschorting(mailResult.suppressed);
    await addSuppression(email, bounce ? "bounce" : "category-opt-out", null);
    await prisma.$transaction([
      prisma.salesOutreach.update({
        where: { id: outreachId },
        data: { status: "SUPPRESSED", failReason: mailResult.suppressed },
      }),
      prisma.salesLead.update({
        where: { id: lead.id },
        data: bounce
          ? { suppressed: true, suppressedReason: "e-mail bounce", status: "BOUNCED", bouncedAt: new Date(), nextActionAt: null }
          : { suppressed: true, suppressedReason: mailResult.suppressed, status: "UNSUBSCRIBED", nextActionAt: null },
      }),
    ]);
    return { status: "suppressed", reason: mailResult.suppressed, outreachId };
  }

  const now = new Date();

  // De mailserver weigerde de mail of was onbereikbaar (sendMail probeerde het al drie keer): de mail staat alleen in de
  // eigen postbus en is NIET aangekomen. Dat is geen SENT (18 nov 2026: zo'n mail telde als verstuurd en de reeks liep
  // door). Een testadres (.test/.example/.invalid) of een omgeving zonder mailserver houdt de mail bewust in de postbus
  // (transport "mailbox"): dat geldt als gelukt. De stap schuift niet door; de motor probeert het morgen opnieuw met een
  // nieuw concept, hooguit MAX_MISLUKT keer (anders bleef de lead voorgoed op zijn stap hangen).
  if (!mailResult.delivered && mailResult.transport === "smtp") {
    const reden = `Verzenden mislukt: ${zonderAdressen(mailResult.error ?? "de mailserver gaf geen antwoord").slice(0, 240)}`;
    const eerder = await prisma.salesOutreach.count({ where: { leadId: lead.id, status: "FAILED" } }).catch(() => MAX_MISLUKT);
    await prisma.$transaction([
      prisma.salesOutreach.update({
        where: { id: outreachId },
        data: { status: "FAILED", failReason: reden, mailId: mailResult.id },
      }),
      prisma.salesLead.update({
        where: { id: lead.id },
        data: { nextActionAt: eerder + 1 >= MAX_MISLUKT ? null : new Date(now.getTime() + 24 * 60 * 60 * 1000) },
      }),
    ]);
    logger.warn("sales outreach niet bezorgd", { outreachId, via, pogingen: eerder + 1 });
    return { status: "failed", reason: reden, outreachId };
  }

  const delay = campaign && !eenmalig ? nextDelayDays(campaign, outreach.stepIndex) : null;
  const nextActionAt =
    delay !== null ? new Date(now.getTime() + delay * 24 * 60 * 60 * 1000) : null;
  // na de ene vaste aanbodmail is de reeks klaar, net als na de laatste stap
  const volgendeStap = eenmalig && campaign ? Math.max(outreach.stepIndex + 1, campaign.stepDelaysDays.length) : outreach.stepIndex + 1;

  await prisma.$transaction([
    prisma.salesOutreach.update({
      where: { id: outreachId },
      data: {
        status: "SENT",
        sentAt: now,
        sentVia: via,
        mailId: mailResult.id,
        ...(outreach.status === "DRAFT" ? { approvedAt: now } : {}),
      },
    }),
    prisma.salesLead.update({
      where: { id: lead.id },
      data: {
        status: "SENT",
        sequenceStep: volgendeStap,
        nextActionAt,
        lastContactedAt: now,
      },
    }),
  ]);

  await recordAudit({
    category: "SALES",
    action: "sales.outreach.sent",
    actorLabel: via === "autopilot" ? "sales-ai" : "user",
    severity: "info",
    summary: `Outreach (stap ${outreach.stepIndex + 1}) verzonden naar ${lead.companyName} <${email}> via ${via}`,
    targetType: "salesOutreach",
    targetId: outreachId,
    metadata: { via, delivered: mailResult.delivered, transport: mailResult.transport },
  });
  logger.info("sales outreach sent", { outreachId, via, delivered: mailResult.delivered });

  return { status: "sent", outreachId };
}
