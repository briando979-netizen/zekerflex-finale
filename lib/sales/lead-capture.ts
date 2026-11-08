import { Prisma, type LeadCaptureStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { validateEmail } from "@/lib/email";

/**
 * Lead Capture — Web forms, landing pages, email capture (optin tracking)
 * Subsystem 1 of 6 in the Sales Funnel Engine
 */

export interface CreateLeadCaptureInput {
  email: string;
  name?: string | undefined;
  company?: string | undefined;
  phone?: string | undefined;
  source: string; // "web_form", "landing_page", "import", "api"
  formId?: string | undefined;

  // Contact
  contactName?: string | undefined;
  contactTitle?: string | undefined;
  contactPhone?: string | undefined;

  // Company
  kvkNumber?: string | undefined;
  industry?: string | undefined;
  companySize?: string | undefined;

  // Engagement
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
  referrer?: string | undefined;
  utmSource?: string | undefined;
  utmMedium?: string | undefined;
  utmCampaign?: string | undefined;

  metadata?: Record<string, unknown> | undefined;
}

/**
 * Capture a lead from a form submission or landing page.
 */
export async function captureLead(
  input: CreateLeadCaptureInput,
  actorId?: string,
): Promise<{ lead: typeof result; isNew: boolean }> {
  // Validate email
  if (!validateEmail(input.email)) {
    throw AppError.validation("Ongeldig e-mailadres.");
  }

  // Check if lead already exists
  const existing = await prisma.leadCapture.findUnique({
    where: { email: input.email },
  });

  if (existing) {
    // Update engagement data
    const updated = await prisma.leadCapture.update({
      where: { email: input.email },
      data: {
        visitCount: { increment: 1 },
        lastVisitAt: new Date(),
        // Update UTM if provided
        ...(input.utmSource && { utmSource: input.utmSource }),
        ...(input.utmMedium && { utmMedium: input.utmMedium }),
        ...(input.utmCampaign && { utmCampaign: input.utmCampaign }),
      },
    });

    await recordAudit({
      category: "SALES",
      action: "lead.capture.updated",
      actorUserId: actorId,
      summary: `Lead ${input.email} engagement bijgewerkt`,
      targetType: "leadCapture",
      targetId: existing.id,
    });

    return { lead: updated, isNew: false };
  }

  // Create new lead
  const result = await prisma.leadCapture.create({
    data: {
      email: input.email.toLowerCase(),
      name: input.name?.trim() ?? null,
      company: input.company?.trim() ?? null,
      phone: input.phone?.trim() ?? null,
      source: input.source,
      formId: input.formId ?? null,

      contactName: input.contactName?.trim() ?? null,
      contactTitle: input.contactTitle?.trim() ?? null,
      contactPhone: input.contactPhone?.trim() ?? null,

      kvkNumber: input.kvkNumber?.trim() ?? null,
      industry: input.industry?.trim() ?? null,
      companySize: input.companySize ?? null,

      firstVisitAt: new Date(),
      lastVisitAt: new Date(),
      visitCount: 1,

      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      referrer: input.referrer ?? null,
      utmSource: input.utmSource ?? null,
      utmMedium: input.utmMedium ?? null,
      utmCampaign: input.utmCampaign ?? null,

      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });

  // Create initial lead score
  await prisma.leadScore.create({
    data: {
      leadCaptureId: result.id,
      engagementScore: 10, // initial engagement
      totalScore: 10,
      qualificationRating: "LOW",
    },
  });

  // Create initial attribution record
  await prisma.leadAttribution.create({
    data: {
      leadCaptureId: result.id,
      firstTouchChannel: input.source,
      firstTouchDate: new Date(),
      firstTouchSource: input.utmCampaign ?? null,
    },
  });

  await recordAudit({
    category: "SALES",
    action: "lead.capture.created",
    actorUserId: actorId,
    summary: `Nieuw lead ${input.email} vastgelegd (bron: ${input.source})`,
    targetType: "leadCapture",
    targetId: result.id,
  });

  logger.info("Lead captured", { email: input.email, source: input.source });

  return { lead: result, isNew: true };
}

/**
 * Verify lead email by clicking a verification link.
 */
export async function verifyLead(leadId: string): Promise<void> {
  const lead = await prisma.leadCapture.findUnique({
    where: { id: leadId },
  });

  if (!lead) {
    throw AppError.validation("Lead niet gevonden.");
  }

  await prisma.leadCapture.update({
    where: { id: leadId },
    data: {
      status: "VERIFIED" as LeadCaptureStatus,
      verifiedAt: new Date(),
    },
  });

  await recordAudit({
    category: "SALES",
    action: "lead.verified",
    summary: `Lead ${lead.email} geverifieerd`,
    targetType: "leadCapture",
    targetId: leadId,
  });
}

/**
 * Mark lead as opted out.
 */
export async function optOutLead(leadId: string, reason?: string): Promise<void> {
  const lead = await prisma.leadCapture.findUnique({
    where: { id: leadId },
  });

  if (!lead) {
    throw AppError.validation("Lead niet gevonden.");
  }

  await prisma.leadCapture.update({
    where: { id: leadId },
    data: {
      status: "OPTED_OUT" as LeadCaptureStatus,
      metadata: {
        ...(typeof lead.metadata === "object" && lead.metadata !== null
          ? lead.metadata
          : {}),
        optedOutAt: new Date().toISOString(),
        optedOutReason: reason ?? "unknown",
      } as Prisma.InputJsonValue,
    },
  });

  await recordAudit({
    category: "SALES",
    action: "lead.opted_out",
    summary: `Lead ${lead.email} opted-out (reden: ${reason ?? "onbekend"})`,
    targetType: "leadCapture",
    targetId: leadId,
  });
}

/**
 * Mark lead email as invalid.
 */
export async function markLeadInvalid(
  leadId: string,
  reason: string,
): Promise<void> {
  const lead = await prisma.leadCapture.findUnique({
    where: { id: leadId },
  });

  if (!lead) {
    throw AppError.validation("Lead niet gevonden.");
  }

  await prisma.leadCapture.update({
    where: { id: leadId },
    data: {
      status: "INVALID" as LeadCaptureStatus,
      invalidReason: reason,
    },
  });

  await recordAudit({
    category: "SALES",
    action: "lead.marked_invalid",
    summary: `Lead ${lead.email} gemarkeerd als ongeldig (${reason})`,
    targetType: "leadCapture",
    targetId: leadId,
  });
}

/**
 * Get lead by ID with full relationships.
 */
export async function getLead(leadId: string) {
  return prisma.leadCapture.findUnique({
    where: { id: leadId },
    include: {
      leads: true,
      interactions: true,
      funnel: true,
      sequences: true,
      attribution: true,
    },
  });
}

/**
 * List leads with filters.
 */
export async function listLeads(
  filters: {
    status?: LeadCaptureStatus | undefined;
    source?: string | undefined;
    industry?: string | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
  } = {},
) {
  const limit = Math.min(filters.limit ?? 50, 200);
  const offset = filters.offset ?? 0;

  return prisma.leadCapture.findMany({
    where: {
      ...(filters.status && { status: filters.status }),
      ...(filters.source && { source: filters.source }),
      ...(filters.industry && { industry: filters.industry }),
    },
    include: {
      leads: { select: { totalScore: true, qualificationRating: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
  });
}
