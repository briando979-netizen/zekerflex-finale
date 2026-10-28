import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { chatJson } from "@/lib/ai/client";
import { logger } from "@/lib/logger";
import {
  OUTREACH_STEP_SYSTEM,
  OUTREACH_SYSTEM,
  ZEKERFLEX_PITCH,
} from "@/lib/sales/prompts";

// ---------------------------------------------------------------------------
// LLM-drafted outreach. A draft is generated on demand. In REVIEW mode a human
// reviews / edits / approves it and the recruiter motor (or the human) sends
// it via lib/sales/send.ts. In AUTOPILOT mode the engine approves + sends
// automatically within the campaign's hard caps.
// ---------------------------------------------------------------------------

interface DraftShape {
  subject: string;
  body: string;
}

/**
 * Hand-written fallback per sequence step, personalised with what we know.
 * Used when the model is unreachable or returns nothing usable, so the
 * recruiter motor keeps running instead of stalling on every lead.
 */
export function templateDraft(
  lead: { companyName: string; contactName: string | null; city: string | null; sector: string | null; vacancySignal: string | null },
  step: number,
): DraftShape {
  const hi = lead.contactName ? `Beste ${lead.contactName.split(" ")[0]},` : `Beste team van ${lead.companyName},`;
  const where = lead.city ? ` in ${lead.city}` : "";
  const sector = lead.sector ? ` in de ${lead.sector.toLowerCase()}` : "";
  const hook = lead.vacancySignal
    ? `Ik zag dat jullie op zoek zijn naar mensen (${lead.vacancySignal.slice(0, 120)}).`
    : `Veel bedrijven${sector}${where} hebben moeite om pieken en uitval op te vangen.`;
  const sign = "\n\nMet vriendelijke groet,\nTeam ZekerFlex\nzekerflex.com";
  if (step === 1) {
    return {
      subject: `Nog even over flexibele krachten voor ${lead.companyName}`,
      body: `${hi}\n\nVorige week stuurde ik je een bericht over ZekerFlex. Misschien is het ondergesneeuwd, dus kort: je plaatst een dienst en passende zzp'ers en uitzendkrachten uit de buurt kunnen reageren — zonder inschrijfkosten, je betaalt alleen per gewerkt uur.\n\nZal ik je een proefaccount klaarzetten? Dan kun je deze week nog je eerste dienst plaatsen.${sign}`,
    };
  }
  if (step >= 2) {
    return {
      subject: `Zal ik ${lead.companyName} van de lijst halen?`,
      body: `${hi}\n\nIk wil je niet blijven mailen als het nu niet speelt. Als jullie later toch snel mensen nodig hebben, staat ZekerFlex klaar: diensten plaatsen is gratis en je betaalt alleen voor gewerkte uren.\n\nLaat het gerust weten als ik je mag helpen — anders hoor je niets meer van me.${sign}`,
    };
  }
  return {
    subject: `Snel personeel voor ${lead.companyName}${where}`,
    body: `${hi}\n\n${hook}\n\nMet ZekerFlex plaats je een dienst en kunnen passende zzp'ers en uitzendkrachten uit de buurt reageren als ze beschikbaar zijn. Contracten, uren en facturen regelen we automatisch, en je betaalt alleen per gewerkt uur — geen abonnement, geen inschrijfkosten.\n\nZin om het te proberen? Ik zet graag een gratis account voor je klaar.${sign}`,
  };
}

/**
 * Generate a draft for a given sequence step (0 = intro, 1 = reminder,
 * 2 = breakup). Falls back to the generic prompt for out-of-range steps.
 */
export async function draftOutreach(
  leadId: string,
  actorUserId: string | null,
  stepIndex = 0,
) {
  const lead = await prisma.salesLead.findUnique({ where: { id: leadId } });
  if (!lead) throw AppError.notFound("Sales lead not found");

  const step = Math.max(0, Math.min(OUTREACH_STEP_SYSTEM.length - 1, stepIndex));
  const system = OUTREACH_STEP_SYSTEM[step] ?? OUTREACH_SYSTEM;

  const enrichment = (lead.enrichmentJson ?? {}) as Record<string, unknown>;
  let model = "self-hosted-llm";
  const draft = await chatJson<DraftShape>({
    messages: [
      { role: "system", content: `${system}\n\nContext over ZekerFlex:\n${ZEKERFLEX_PITCH}` },
      {
        role: "user",
        content: JSON.stringify({
          companyName: lead.companyName,
          contactName: lead.contactName,
          city: lead.city,
          sector: lead.sector,
          vacancySignal: lead.vacancySignal,
          stepIndex: step,
          enrichment,
        }),
      },
    ],
    temperature: 0.4,
    maxTokens: 500,
    purpose: "sales-outreach",
    retry: false,
  }).catch((err) => {
    logger.warn("outreach draft fell back to template", { leadId, error: (err as Error).message });
    model = "template";
    return templateDraft(lead, step);
  });

  let subject = String(draft.subject ?? "").trim().slice(0, 200);
  let body = String(draft.body ?? "").trim().slice(0, 4000);
  if (!subject || !body) {
    ({ subject, body } = templateDraft(lead, step));
    model = "template";
  }

  const [outreach] = await prisma.$transaction([
    prisma.salesOutreach.create({
      data: {
        leadId,
        subject,
        body,
        stepIndex: step,
        status: "DRAFT",
        generatedByModel: model,
      },
    }),
    prisma.salesLead.update({
      where: { id: leadId },
      data: {
        status: ["SENT", "REPLIED", "WON"].includes(lead.status) ? lead.status : "DRAFTED",
      },
    }),
  ]);

  await recordAudit({
    category: "SALES",
    action: "sales.outreach.drafted",
    actorUserId,
    actorLabel: actorUserId ? "user" : "sales-ai",
    summary: `Concept-outreach (stap ${step + 1}) gegenereerd voor ${lead.companyName}`,
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

export async function approveOutreach(id: string, actorUserId: string | null) {
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
    actorLabel: actorUserId ? "user" : "sales-ai",
    severity: "info",
    summary: `Outreach goedgekeurd voor verzending (${id})`,
    targetType: "salesOutreach",
    targetId: id,
  });
  return updated;
}

/** Drop a draft/approved/scheduled outreach without sending it. */
export async function discardOutreach(id: string, actorUserId: string | null) {
  const outreach = await prisma.salesOutreach.findUnique({ where: { id } });
  if (!outreach) throw AppError.notFound("Outreach not found");
  if (["SENT"].includes(outreach.status)) {
    throw AppError.precondition("Een verzonden mail kan niet worden weggegooid");
  }
  const updated = await prisma.salesOutreach.update({
    where: { id },
    data: { status: "DISCARDED" },
  });
  await recordAudit({
    category: "SALES",
    action: "sales.outreach.discarded",
    actorUserId,
    actorLabel: actorUserId ? "user" : "sales-ai",
    summary: `Concept-outreach weggegooid (${id})`,
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
