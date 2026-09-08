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

function buildBody(lead: SalesLead, outreach: SalesOutreach): { text: string; html: string } {
  const bodyText = outreach.body.trim();
  const paras = bodyText.split(/\n{2,}/).map((p) => p.replace(/\n/g, "<br>"));
  const inner = paras
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#3C4A42">${p
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")}</p>`,
    )
    .join("");
  const cta = mailButton(`${env.APP_BASE_URL.replace(/\/+$/, "")}/voor-bedrijven`, "Bekijk ZekerFlex voor bedrijven");
  const html = mailShell(
    outreach.subject,
    `${inner}
     <p style="margin:18px 0 0">${cta}</p>
     <p style="margin:20px 0 0;font-size:12px;color:#8A938C">
       ZekerFlex B.V. · Amsterdam · Je ontvangt dit bericht als zakelijke introductie omdat
       ${lead.companyName} mogelijk baat heeft bij flexibele bezetting.
     </p>`,
  );
  const text = `${bodyText}\n\nMeer weten: ${env.APP_BASE_URL.replace(/\/+$/, "")}/voor-bedrijven\n\nZekerFlex B.V., Amsterdam`;
  return { text, html };
}

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

  const { text, html } = buildBody(lead, outreach);
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

  // sendMail never throws; a category opt-out comes back as `suppressed`.
  if (mailResult.suppressed) {
    await addSuppression(email, "category-opt-out", null);
    await prisma.$transaction([
      prisma.salesOutreach.update({
        where: { id: outreachId },
        data: { status: "SUPPRESSED", failReason: mailResult.suppressed },
      }),
      prisma.salesLead.update({
        where: { id: lead.id },
        data: { suppressed: true, suppressedReason: mailResult.suppressed, status: "UNSUBSCRIBED", nextActionAt: null },
      }),
    ]);
    return { status: "suppressed", reason: mailResult.suppressed, outreachId };
  }

  const now = new Date();
  const delay = campaign ? nextDelayDays(campaign, outreach.stepIndex) : null;
  const nextActionAt =
    delay !== null ? new Date(now.getTime() + delay * 24 * 60 * 60 * 1000) : null;

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
        sequenceStep: outreach.stepIndex + 1,
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
