import { Prisma, type SalesLeadStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { announce } from "@/lib/voice/announce";
import { chatJson } from "@/lib/ai/client";
import { isKvkBaseEnabled, lookupCompany } from "@/lib/integrations/kvkbase";
import { LEAD_SCORE_SYSTEM } from "@/lib/sales/prompts";

// ---------------------------------------------------------------------------
// Sales lead pipeline. Leads are created, optionally enriched from the
// Handelsregister, and scored (LLM with a heuristic fallback). Outreach lives
// in lib/sales/outreach.ts and is never sent autonomously.
// ---------------------------------------------------------------------------

export interface CreateLeadInput {
  companyName: string;
  kvkNumber?: string | undefined;
  contactName?: string | undefined;
  contactEmail?: string | undefined;
  city?: string | undefined;
  sector?: string | undefined;
  source?: string | undefined;
  notes?: string | undefined;
  createdById: string;
}

export async function createLead(input: CreateLeadInput) {
  const lead = await prisma.salesLead.create({
    data: {
      companyName: input.companyName.trim(),
      kvkNumber: input.kvkNumber ?? null,
      contactName: input.contactName ?? null,
      contactEmail: input.contactEmail ?? null,
      city: input.city ?? null,
      sector: input.sector ?? null,
      source: input.source ?? "manual",
      notes: input.notes ?? null,
      createdById: input.createdById,
    },
  });
  await recordAudit({
    category: "SALES",
    action: "sales.lead.created",
    actorUserId: input.createdById,
    actorLabel: "user",
    summary: `Sales lead aangemaakt: ${lead.companyName}`,
    targetType: "salesLead",
    targetId: lead.id,
  });
  void announce({
    text: `Nieuwe sales-lead binnengekomen: ${lead.companyName}${lead.city ? ` uit ${lead.city}` : ""}.`,
    category: "sales",
    source: "sales-ai",
  });
  return lead;
}

export interface ListLeadsFilter {
  status?: SalesLeadStatus;
  limit: number;
}

export async function listLeads(filter: ListLeadsFilter) {
  return prisma.salesLead.findMany({
    where: filter.status ? { status: filter.status } : {},
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: filter.limit,
    include: {
      outreach: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, status: true, subject: true, updatedAt: true },
      },
    },
  });
}

export async function getLead(id: string) {
  const lead = await prisma.salesLead.findUnique({
    where: { id },
    include: { outreach: { orderBy: { createdAt: "desc" } } },
  });
  if (!lead) throw AppError.notFound("Sales lead not found");
  return lead;
}

const RETAIL_SBI_PREFIXES = ["47", "56", "49", "52", "53", "81", "82", "10", "55", "86", "88", "93"];

function heuristicScore(sector: string | null, sbiCodes: string[]): {
  score: number;
  rationale: string;
} {
  const hay = `${sector ?? ""} ${sbiCodes.join(" ")}`.toLowerCase();
  const hit =
    /retail|horeca|logistiek|winkel|supermarkt|events|zorg|schoonmaak|productie|magazijn|distributie/.test(
      hay,
    ) || sbiCodes.some((c) => RETAIL_SBI_PREFIXES.some((p) => c.startsWith(p)));
  return hit
    ? { score: 72, rationale: "Sector met piekbelasting en flexbehoefte (heuristiek)." }
    : { score: 38, rationale: "Weinig indicatie voor structurele flexbehoefte (heuristiek)." };
}

/** Enrich a lead from the Handelsregister when it carries a KVK number. */
export async function enrichLead(id: string, actorUserId: string) {
  const lead = await prisma.salesLead.findUnique({ where: { id } });
  if (!lead) throw AppError.notFound("Sales lead not found");
  if (!lead.kvkNumber || !isKvkBaseEnabled()) {
    return lead;
  }

  const profile = await lookupCompany(lead.kvkNumber, { enrich: true });
  const updated = await prisma.salesLead.update({
    where: { id },
    data: {
      companyName: profile.legalName || lead.companyName,
      city: profile.address.city ?? lead.city,
      sector:
        profile.activities.find((a) => a.isMain)?.description ?? lead.sector,
      status: lead.status === "NEW" ? "ENRICHED" : lead.status,
      enrichmentJson: {
        legalForm: profile.legalForm,
        sbiCodes: profile.sbiCodes,
        employeeCount: profile.employeeCount,
        isActive: profile.isActive,
      } as Prisma.InputJsonValue,
    },
  });
  await recordAudit({
    category: "SALES",
    action: "sales.lead.enriched",
    actorUserId,
    actorLabel: "user",
    summary: `Lead verrijkt via KVKBase: ${updated.companyName}`,
    targetType: "salesLead",
    targetId: id,
  });
  return updated;
}

/** Score a lead's fit (LLM, heuristic fallback). */
export async function scoreLead(id: string, actorUserId: string) {
  const lead = await prisma.salesLead.findUnique({ where: { id } });
  if (!lead) throw AppError.notFound("Sales lead not found");

  const enrichment = (lead.enrichmentJson ?? {}) as {
    sbiCodes?: string[];
    employeeCount?: number | null;
    legalForm?: string | null;
  };
  const sbiCodes = enrichment.sbiCodes ?? [];

  let score: number;
  let rationale: string;
  try {
    const out = await chatJson<{ score: number; rationale: string }>({
      messages: [
        { role: "system", content: LEAD_SCORE_SYSTEM },
        {
          role: "user",
          content: JSON.stringify({
            companyName: lead.companyName,
            city: lead.city,
            sector: lead.sector,
            legalForm: enrichment.legalForm ?? null,
            employeeCount: enrichment.employeeCount ?? null,
            sbiCodes,
          }),
        },
      ],
      temperature: 0,
      maxTokens: 200,
    });
    score = Math.max(0, Math.min(100, Math.round(out.score)));
    rationale = String(out.rationale).slice(0, 400);
  } catch (err) {
    logger.warn("lead scoring fell back to heuristic", {
      error: (err as Error).message,
    });
    ({ score, rationale } = heuristicScore(lead.sector, sbiCodes));
  }

  const updated = await prisma.salesLead.update({
    where: { id },
    data: { score, scoreRationale: rationale },
  });
  await recordAudit({
    category: "SALES",
    action: "sales.lead.scored",
    actorUserId,
    actorLabel: "user",
    summary: `Lead ${updated.companyName} gescoord: ${score}/100`,
    targetType: "salesLead",
    targetId: id,
    metadata: { score },
  });
  return updated;
}
