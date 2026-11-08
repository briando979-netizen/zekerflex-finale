import { type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { sendMail } from "@/lib/mail";

/**
 * Email Sequences — Automated drip campaigns, templates, personalization
 * Subsystem 3 of 6 in the Sales Funnel Engine
 */

export type SequenceType = "welcome" | "nurture" | "re_engagement" | "winback";

export interface EmailSequenceStep {
  stepNumber: number;
  subject: string;
  template: string;
  delayHours: number;
}

export interface SequenceTemplate {
  type: SequenceType;
  steps: EmailSequenceStep[];
  description: string;
}

// Sequence templates
const SEQUENCE_TEMPLATES: Record<SequenceType, SequenceTemplate> = {
  welcome: {
    type: "welcome",
    description: "Welkomstsequentie voor nieuwe leads",
    steps: [
      {
        stepNumber: 0,
        subject: "Welkom bij ZekerFlex - 10% korting",
        template: "welcome_day0",
        delayHours: 0,
      },
      {
        stepNumber: 1,
        subject: "Waarom kiezen 500+ bedrijven voor ZekerFlex?",
        template: "welcome_day1",
        delayHours: 24,
      },
      {
        stepNumber: 2,
        subject: "Gratis demo beschikbaar",
        template: "welcome_day3",
        delayHours: 72,
      },
    ],
  },
  nurture: {
    type: "nurture",
    description: "Voedingssequentie voor geïnteresseerde leads",
    steps: [
      {
        stepNumber: 0,
        subject: "Geld besparen: {{companySize}} bedrijven besparen €X per maand",
        template: "nurture_savings",
        delayHours: 0,
      },
      {
        stepNumber: 1,
        subject: "Geval van {{industry}}: +40% efficiency",
        template: "nurture_case_study",
        delayHours: 48,
      },
      {
        stepNumber: 2,
        subject: "Gratis consult reserveren",
        template: "nurture_consult",
        delayHours: 96,
      },
    ],
  },
  re_engagement: {
    type: "re_engagement",
    description: "Herverbindingssequentie voor inactieve leads",
    steps: [
      {
        stepNumber: 0,
        subject: "We missen je - kom terug voor speciale aanbieding",
        template: "reeng_comeback",
        delayHours: 0,
      },
      {
        stepNumber: 1,
        subject: "Wat is er veranderd sinds je wegging?",
        template: "reeng_updates",
        delayHours: 120,
      },
    ],
  },
  winback: {
    type: "winback",
    description: "Terugwinningssequentie voor voormalige klanten",
    steps: [
      {
        stepNumber: 0,
        subject: "Laten we het goedmaken - 30% korting",
        template: "winback_offer",
        delayHours: 0,
      },
      {
        stepNumber: 1,
        subject: "Wat kunnen we beter?",
        template: "winback_feedback",
        delayHours: 72,
      },
    ],
  },
};

/**
 * Start an email sequence for a lead.
 */
export async function startEmailSequence(
  leadCaptureId: string,
  sequenceType: SequenceType,
  campaignId?: string,
): Promise<void> {
  const lead = await prisma.leadCapture.findUnique({
    where: { id: leadCaptureId },
  });

  if (!lead) {
    throw AppError.validation("Lead niet gevonden.");
  }

  // Get sequence template
  const template = SEQUENCE_TEMPLATES[sequenceType];
  if (!template) {
    throw AppError.validation("Sequentietype niet ondersteund.");
  }

  // Create first sequence step
  const firstStep = template.steps[0];
  if (!firstStep) return;

  const scheduledFor = new Date(Date.now() + firstStep.delayHours * 3600000);

  const sequence = await prisma.emailSequence.create({
    data: {
      leadCaptureId,
      sequenceType,
      stepNumber: firstStep.stepNumber,
      subject: firstStep.subject,
      bodyTemplate: firstStep.template,
      campaignId: campaignId ?? null,
      status: "pending",
      scheduledFor,
      personalizationData: {
        name: lead.name ?? lead.contactName ?? "klant",
        company: lead.company ?? "uw bedrijf",
        email: lead.email,
      } as Prisma.InputJsonValue,
    },
  });

  await recordAudit({
    category: "SALES",
    action: "email_sequence.started",
    summary: `Email-sequentie "${sequenceType}" gestart voor ${lead.email}`,
    targetType: "emailSequence",
    targetId: sequence.id,
  });

  logger.info("Email sequence started", {
    leadId: leadCaptureId,
    type: sequenceType,
    firstStepId: sequence.id,
  });
}

/**
 * Send next email in sequence.
 */
export async function sendNextSequenceEmail(leadCaptureId: string): Promise<void> {
  const lead = await prisma.leadCapture.findUnique({
    where: { id: leadCaptureId },
    include: { sequences: { orderBy: { stepNumber: "desc" }, take: 1 } },
  });

  if (!lead) {
    throw AppError.validation("Lead niet gevonden.");
  }

  // Skip if opted out
  if (lead.status === "OPTED_OUT" || lead.status === "INVALID") {
    return;
  }

  const lastSequence = lead.sequences[0];
  if (!lastSequence) {
    // No sequence started yet
    return;
  }

  // Get the sequence type and current step
  const template = SEQUENCE_TEMPLATES[lastSequence.sequenceType as SequenceType];
  if (!template) return;

  const nextStepNumber = lastSequence.stepNumber + 1;
  const nextStep = template.steps.find((s) => s.stepNumber === nextStepNumber);

  if (!nextStep) {
    // Sequence complete
    logger.info("Email sequence complete", {
      leadId: leadCaptureId,
      type: lastSequence.sequenceType,
    });
    return;
  }

  // Create next sequence email
  const scheduledFor = new Date(Date.now() + nextStep.delayHours * 3600000);

  const nextSequence = await prisma.emailSequence.create({
    data: {
      leadCaptureId,
      sequenceType: lastSequence.sequenceType,
      stepNumber: nextStep.stepNumber,
      subject: nextStep.subject,
      bodyTemplate: nextStep.template,
      campaignId: lastSequence.campaignId,
      status: "pending",
      scheduledFor,
      personalizationData: lastSequence.personalizationData,
    },
  });

  logger.info("Next email sequence created", {
    leadId: leadCaptureId,
    stepNumber: nextStep.stepNumber,
  });
}

/**
 * Process pending emails and send them.
 */
export async function processPendingEmailSequences(): Promise<number> {
  const now = new Date();

  const pendingEmails = await prisma.emailSequence.findMany({
    where: {
      status: "pending",
      scheduledFor: {
        lte: now,
      },
    },
    include: { leadCapture: true },
    take: 100, // Process in batches
  });

  let sent = 0;

  for (const email of pendingEmails) {
    try {
      // Render body with personalization
      let body = email.bodyRendered || email.bodyTemplate;
      if (email.personalizationData && typeof email.personalizationData === "object") {
        const data = email.personalizationData as Record<string, unknown>;
        Object.entries(data).forEach(([key, value]) => {
          body = body.replace(new RegExp(`{{${key}}}`, "g"), String(value ?? ""));
        });
      }

      // Send email
      await sendMail({
        to: email.leadCapture.email,
        subject: email.subject,
        html: body,
        replyTo: "sales@zekerflex.com",
      });

      // Update sequence status
      await prisma.emailSequence.update({
        where: { id: email.id },
        data: {
          status: "sent",
          sentAt: new Date(),
          bodyRendered: body,
        },
      });

      // Create interaction record
      await prisma.leadInteraction.create({
        data: {
          leadCaptureId: email.leadCaptureId,
          type: "email_sent",
          description: `Email verzonden: ${email.subject}`,
          metadata: {
            sequenceId: email.id,
            sequenceType: email.sequenceType,
            stepNumber: email.stepNumber,
          } as Prisma.InputJsonValue,
        },
      });

      sent++;
      logger.info("Sequence email sent", {
        leadId: email.leadCaptureId,
        emailId: email.id,
        subject: email.subject,
      });
    } catch (error) {
      logger.error("Failed to send sequence email", {
        emailId: email.id,
        error,
      });

      await prisma.emailSequence.update({
        where: { id: email.id },
        data: {
          status: "failed",
        },
      });
    }

    // Continue to next email in sequence
    try {
      await sendNextSequenceEmail(email.leadCaptureId);
    } catch (error) {
      logger.warn("Failed to schedule next sequence email", {
        leadId: email.leadCaptureId,
        error,
      });
    }
  }

  return sent;
}

/**
 * Track email open (via tracking pixel).
 */
export async function trackEmailOpen(emailId: string): Promise<void> {
  const email = await prisma.emailSequence.findUnique({
    where: { id: emailId },
    include: { leadCapture: true },
  });

  if (!email) return;

  await prisma.emailSequence.update({
    where: { id: emailId },
    data: {
      status: "opened",
      openedAt: new Date(),
      openCount: { increment: 1 },
    },
  });

  // Update lead score
  const score = await prisma.leadScore.findUnique({
    where: { leadCaptureId: email.leadCaptureId },
  });

  if (score) {
    await prisma.leadScore.update({
      where: { id: score.id },
      data: {
        emailOpens: { increment: 1 },
      },
    });
  }

  // Record interaction
  await prisma.leadInteraction.create({
    data: {
      leadCaptureId: email.leadCaptureId,
      type: "email_open",
      description: `Email geopend: ${email.subject}`,
    },
  });
}

/**
 * Track email click (via tracking link).
 */
export async function trackEmailClick(
  emailId: string,
  url?: string,
): Promise<void> {
  const email = await prisma.emailSequence.findUnique({
    where: { id: emailId },
    include: { leadCapture: true },
  });

  if (!email) return;

  await prisma.emailSequence.update({
    where: { id: emailId },
    data: {
      status: "clicked",
      clickedAt: new Date(),
      clickCount: { increment: 1 },
    },
  });

  // Update lead score
  const score = await prisma.leadScore.findUnique({
    where: { leadCaptureId: email.leadCaptureId },
  });

  if (score) {
    await prisma.leadScore.update({
      where: { id: score.id },
      data: {
        linkClicks: { increment: 1 },
      },
    });
  }

  // Record interaction
  await prisma.leadInteraction.create({
    data: {
      leadCaptureId: email.leadCaptureId,
      type: "link_click",
      description: `Link geklikt in email: ${url ?? "onbekend"}`,
      url: url ?? null,
    },
  });
}

/**
 * Get email sequences for a lead.
 */
export async function getLeadEmailSequences(leadCaptureId: string) {
  return prisma.emailSequence.findMany({
    where: { leadCaptureId },
    orderBy: { createdAt: "desc" },
  });
}
