import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { chatJson } from "@/lib/ai/client";
import { OUTREACH_SYSTEM, ZEKERFLEX_PITCH } from "@/lib/sales/prompts";

// ---------------------------------------------------------------------------
// LLM-drafted outreach. A draft is generated on demand; a human reviews,
// (optionally edits,) approves and then actually sends it from their own mail
// client. `markSent` only records that it went out - the platform never sends.
// ---------------------------------------------------------------------------

interface DraftShape {
  subject: string;
  body: string;
}

export async function draftOutreach(leadId: string, actorUserId: string) {
  const lead = await prisma.salesLead.findUnique({ where: { id: leadId } });
  if (!lead) throw AppError.notFound("Sales lead not found");

  const enrichment = (lead.enrichmentJson ?? {}) as Record<string, unknown>;
  const draft = await chatJson<DraftShape>({
    messages: [
      { role: "system", content: `${OUTREACH_SYSTEM}\n\nContext over ZekerFlex:\n${ZEKERFLEX_PITCH}` },
      {
        role: "user",
        content: JSON.stringify({
          companyName: lead.companyName,
          contactName: lead.contactName,
          city: lead.city,
          sector: lead.sector,
          enrichment,
        }),
      },
    ],
    temperature: 0.4,
    maxTokens: 500,
  });

  const subject = String(draft.subject ?? "").trim().slice(0, 200);
  const body = String(draft.body ?? "").trim().slice(0, 4000);
  if (!subject || !body) {
    throw AppError.upstream("Het model leverde geen bruikbare concepttekst");
  }

  const [outreach] = await prisma.$transaction([
    prisma.salesOutreach.create({
      data: {
        leadId,
        subject,
        body,
        status: "DRAFT",
        generatedByModel: "self-hosted-llm",
      },
    }),
    prisma.salesLead.update({
      where: { id: leadId },
      data: { status: lead.status === "SENT" ? lead.status : "DRAFTED" },
    }),
  ]);

  await recordAudit({
    category: "SALES",
    action: "sales.outreach.drafted",
    actorUserId,
    actorLabel: "user",
    summary: `Concept-outreach gegenereerd voor ${lead.companyName}`,
    targetType: "salesOutreach",
    targetId: outreach.id,
  });
  return outreach;
}

export interface EditOutreachInput {
  subject?: string;
  body?: string;
}

export async function editOutreach(
  id: string,
  patch: EditOutreachInput,
  actorUserId: string,
) {
  const outreach = await prisma.salesOutreach.findUnique({ where: { id } });
  if (!outreach) throw AppError.notFound("Outreach not found");
  if (outreach.status !== "DRAFT") {
    throw AppError.precondition("Alleen concepten kunnen worden bewerkt");
  }
  const updated = await prisma.salesOutreach.update({
    where: { id },
    data: {
      ...(patch.subject !== undefined
        ? { subject: patch.subject.trim().slice(0, 200) }
        : {}),
      ...(patch.body !== undefined
        ? { body: patch.body.trim().slice(0, 4000) }
        : {}),
      editedByHuman: true,
    },
  });
  await recordAudit({
    category: "SALES",
    action: "sales.outreach.edited",
    actorUserId,
    actorLabel: "user",
    summary: `Concept-outreach bewerkt (${updated.id})`,
    targetType: "salesOutreach",
    targetId: id,
  });
  return updated;
}

export async function approveOutreach(id: string, actorUserId: string) {
  const outreach = await prisma.salesOutreach.findUnique({ where: { id } });
  if (!outreach) throw AppError.notFound("Outreach not found");
  if (outreach.status !== "DRAFT") {
    throw AppError.precondition("Alleen een concept kan worden goedgekeurd");
  }
  const [updated] = await prisma.$transaction([
    prisma.salesOutreach.update({
      where: { id },
      data: { status: "APPROVED", approvedById: actorUserId, approvedAt: new Date() },
    }),
    prisma.salesLead.update({
      where: { id: outreach.leadId },
      data: { status: "APPROVED" },
    }),
  ]);
  await recordAudit({
    category: "SALES",
    action: "sales.outreach.approved",
    actorUserId,
    actorLabel: "user",
    severity: "info",
    summary: `Outreach goedgekeurd voor verzending (${id})`,
    targetType: "salesOutreach",
    targetId: id,
  });
  return updated;
}

/** Record that a human sent this outreach. The platform never sends mail. */
export async function markOutreachSent(id: string, actorUserId: string) {
  const outreach = await prisma.salesOutreach.findUnique({ where: { id } });
  if (!outreach) throw AppError.notFound("Outreach not found");
  if (outreach.status !== "APPROVED") {
    throw AppError.precondition(
      "Alleen goedgekeurde outreach kan als verzonden worden gemarkeerd",
    );
  }
  const now = new Date();
  const [updated] = await prisma.$transaction([
    prisma.salesOutreach.update({
      where: { id },
      data: { status: "SENT", sentById: actorUserId, sentAt: now },
    }),
    prisma.salesLead.update({
      where: { id: outreach.leadId },
      data: { status: "SENT", lastContactedAt: now },
    }),
  ]);
  await recordAudit({
    category: "SALES",
    action: "sales.outreach.sent",
    actorUserId,
    actorLabel: "user",
    summary: `Outreach gemarkeerd als verzonden (${id})`,
    targetType: "salesOutreach",
    targetId: id,
  });
  return updated;
}
