import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { addSuppression, normaliseEmail } from "@/lib/sales/suppression";

// ---------------------------------------------------------------------------
// Inbound signals that stop the outreach sequence for a lead:
//   - reply      -> a human took over; pause automation
//   - bounce     -> the address is bad; suppress it
//   - unsubscribe-> handled by the mail-prefs opt-out; we also suppress + stop
// (No IMAP polling yet — these are triggered from the admin UI or a future
//  webhook.)
// ---------------------------------------------------------------------------

async function cancelOpenOutreach(leadId: string): Promise<void> {
  await prisma.salesOutreach.updateMany({
    where: { leadId, status: { in: ["DRAFT", "SCHEDULED", "APPROVED"] } },
    data: { status: "DISCARDED" },
  });
}

export async function markLeadReplied(leadId: string, actorUserId: string | null) {
  const lead = await prisma.salesLead.findUnique({ where: { id: leadId } });
  if (!lead) throw AppError.notFound("Lead niet gevonden");
  await cancelOpenOutreach(leadId);
  const updated = await prisma.salesLead.update({
    where: { id: leadId },
    data: { status: "REPLIED", repliedAt: new Date(), nextActionAt: null },
  });
  await recordAudit({
    category: "SALES",
    action: "sales.lead.replied",
    actorUserId,
    actorLabel: actorUserId ? "user" : "sales-ai",
    summary: `Reactie ontvangen van ${lead.companyName} — sequence gestopt`,
    targetType: "salesLead",
    targetId: leadId,
  });
  return updated;
}

export async function markLeadBounced(leadId: string, actorUserId: string | null) {
  const lead = await prisma.salesLead.findUnique({ where: { id: leadId } });
  if (!lead) throw AppError.notFound("Lead niet gevonden");
  await cancelOpenOutreach(leadId);
  const email = lead.contactEmail || lead.discoveredEmail;
  if (email) await addSuppression(normaliseEmail(email), "bounce", actorUserId);
  const updated = await prisma.salesLead.update({
    where: { id: leadId },
    data: {
      status: "BOUNCED",
      bouncedAt: new Date(),
      nextActionAt: null,
      suppressed: true,
      suppressedReason: "e-mail bounce",
    },
  });
  await recordAudit({
    category: "SALES",
    action: "sales.lead.bounced",
    actorUserId,
    actorLabel: actorUserId ? "user" : "sales-ai",
    summary: `E-mail naar ${lead.companyName} bouncete — adres onderdrukt`,
    targetType: "salesLead",
    targetId: leadId,
  });
  return updated;
}

export async function suppressLead(leadId: string, actorUserId: string | null) {
  const lead = await prisma.salesLead.findUnique({ where: { id: leadId } });
  if (!lead) throw AppError.notFound("Lead niet gevonden");
  await cancelOpenOutreach(leadId);
  const email = lead.contactEmail || lead.discoveredEmail;
  if (email) await addSuppression(normaliseEmail(email), "manual", actorUserId);
  return prisma.salesLead.update({
    where: { id: leadId },
    data: {
      status: "DISQUALIFIED",
      suppressed: true,
      suppressedReason: "handmatig onderdrukt",
      nextActionAt: null,
    },
  });
}
