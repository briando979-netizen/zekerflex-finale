import type { SalesCampaign, SalesSendMode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";

// ---------------------------------------------------------------------------
// Sales campaigns: a named target set + the hard limits the engine runs under.
// A campaign is created in REVIEW mode; switching it to AUTOPILOT is a
// deliberate, audited opt-in that also requires SALES_AUTOPILOT_ENABLED.
// ---------------------------------------------------------------------------

export interface CreateCampaignInput {
  name: string;
  targetSectors?: string[] | undefined;
  targetCities?: string[] | undefined;
  minScore?: number | undefined;
  dailyCap?: number | undefined;
  sendStartHour?: number | undefined;
  sendEndHour?: number | undefined;
  workdaysOnly?: boolean | undefined;
  fromAddress?: string | undefined;
  createdById: string;
}

const clampHour = (n: number) => Math.max(0, Math.min(23, Math.round(n)));

export async function createCampaign(input: CreateCampaignInput): Promise<SalesCampaign> {
  const campaign = await prisma.salesCampaign.create({
    data: {
      name: input.name.trim().slice(0, 160),
      targetSectors: (input.targetSectors ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 20),
      targetCities: (input.targetCities ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 20),
      minScore: Math.max(0, Math.min(100, Math.round(input.minScore ?? 55))),
      dailyCap: Math.max(1, Math.min(500, Math.round(input.dailyCap ?? 40))),
      sendStartHour: clampHour(input.sendStartHour ?? 8),
      sendEndHour: clampHour(input.sendEndHour ?? 18),
      workdaysOnly: input.workdaysOnly ?? true,
      fromAddress: input.fromAddress?.trim() || null,
      createdById: input.createdById,
    },
  });
  await recordAudit({
    category: "SALES",
    action: "sales.campaign.created",
    actorUserId: input.createdById,
    summary: `Sales-campagne aangemaakt: ${campaign.name}`,
    targetType: "salesCampaign",
    targetId: campaign.id,
  });
  return campaign;
}

export async function listCampaigns() {
  return prisma.salesCampaign.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      sources: { orderBy: { createdAt: "asc" } },
      _count: { select: { leads: true } },
    },
  });
}

export async function getCampaign(id: string): Promise<SalesCampaign> {
  const c = await prisma.salesCampaign.findUnique({ where: { id } });
  if (!c) throw AppError.notFound("Campagne niet gevonden");
  return c;
}

export interface UpdateCampaignInput {
  name?: string | undefined;
  targetSectors?: string[] | undefined;
  targetCities?: string[] | undefined;
  minScore?: number | undefined;
  dailyCap?: number | undefined;
  sendStartHour?: number | undefined;
  sendEndHour?: number | undefined;
  workdaysOnly?: boolean | undefined;
  fromAddress?: string | null | undefined;
}

export async function updateCampaign(id: string, patch: UpdateCampaignInput, actorUserId: string) {
  await getCampaign(id);
  const updated = await prisma.salesCampaign.update({
    where: { id },
    data: {
      ...(patch.name !== undefined ? { name: patch.name.trim().slice(0, 160) } : {}),
      ...(patch.targetSectors !== undefined
        ? { targetSectors: patch.targetSectors.map((s) => s.trim()).filter(Boolean).slice(0, 20) }
        : {}),
      ...(patch.targetCities !== undefined
        ? { targetCities: patch.targetCities.map((s) => s.trim()).filter(Boolean).slice(0, 20) }
        : {}),
      ...(patch.minScore !== undefined
        ? { minScore: Math.max(0, Math.min(100, Math.round(patch.minScore))) }
        : {}),
      ...(patch.dailyCap !== undefined
        ? { dailyCap: Math.max(1, Math.min(500, Math.round(patch.dailyCap))) }
        : {}),
      ...(patch.sendStartHour !== undefined ? { sendStartHour: clampHour(patch.sendStartHour) } : {}),
      ...(patch.sendEndHour !== undefined ? { sendEndHour: clampHour(patch.sendEndHour) } : {}),
      ...(patch.workdaysOnly !== undefined ? { workdaysOnly: patch.workdaysOnly } : {}),
      ...(patch.fromAddress !== undefined ? { fromAddress: patch.fromAddress?.trim() || null } : {}),
    },
  });
  await recordAudit({
    category: "SALES",
    action: "sales.campaign.updated",
    actorUserId,
    summary: `Sales-campagne bijgewerkt: ${updated.name}`,
    targetType: "salesCampaign",
    targetId: id,
  });
  return updated;
}

export async function activateCampaign(id: string, actorUserId: string) {
  const c = await getCampaign(id);
  const updated = await prisma.salesCampaign.update({
    where: { id },
    data: { status: "ACTIVE" },
  });
  await recordAudit({
    category: "SALES",
    action: "sales.campaign.activated",
    actorUserId,
    severity: c.mode === "AUTOPILOT" ? "warning" : "info",
    summary: `Sales-campagne geactiveerd (${c.mode}): ${updated.name}`,
    targetType: "salesCampaign",
    targetId: id,
  });
  return updated;
}

export async function pauseCampaign(id: string, actorUserId: string) {
  await getCampaign(id);
  const updated = await prisma.salesCampaign.update({ where: { id }, data: { status: "PAUSED" } });
  await recordAudit({
    category: "SALES",
    action: "sales.campaign.paused",
    actorUserId,
    summary: `Sales-campagne gepauzeerd: ${updated.name}`,
    targetType: "salesCampaign",
    targetId: id,
  });
  return updated;
}

/**
 * Switch a campaign between REVIEW and AUTOPILOT. AUTOPILOT is refused unless
 * the global master switch SALES_AUTOPILOT_ENABLED is on. The caller (the API
 * route) is responsible for the typed "AUTOPILOT AAN" confirmation.
 */
export async function setCampaignMode(id: string, mode: SalesSendMode, actorUserId: string) {
  await getCampaign(id);
  if (mode === "AUTOPILOT" && !env.SALES_AUTOPILOT_ENABLED) {
    throw AppError.precondition(
      "Autopilot staat globaal uit. Zet SALES_AUTOPILOT_ENABLED=true in de omgeving en herstart.",
    );
  }
  const updated = await prisma.salesCampaign.update({
    where: { id },
    data: {
      mode,
      ...(mode === "AUTOPILOT"
        ? { autopilotConfirmedAt: new Date(), autopilotConfirmedById: actorUserId }
        : { autopilotConfirmedAt: null, autopilotConfirmedById: null }),
    },
  });
  await recordAudit({
    category: "SALES",
    action: "sales.campaign.mode",
    actorUserId,
    severity: mode === "AUTOPILOT" ? "warning" : "info",
    summary: `Sales-campagne "${updated.name}" op ${mode}`,
    targetType: "salesCampaign",
    targetId: id,
    metadata: { mode },
  });
  return updated;
}

export async function deleteCampaign(id: string, actorUserId: string) {
  const c = await getCampaign(id);
  // Leads keep their history; the FK is ON DELETE SET NULL.
  await prisma.salesCampaign.delete({ where: { id } });
  await recordAudit({
    category: "SALES",
    action: "sales.campaign.deleted",
    actorUserId,
    summary: `Sales-campagne verwijderd: ${c.name}`,
    targetType: "salesCampaign",
    targetId: id,
  });
}

// ---- send-window + cap helpers --------------------------------------------

export function startOfToday(now = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function withinSendWindow(campaign: SalesCampaign, now = new Date()): boolean {
  const day = now.getDay(); // 0 = Sun, 6 = Sat
  if (campaign.workdaysOnly && (day === 0 || day === 6)) return false;
  const hour = now.getHours();
  const { sendStartHour: a, sendEndHour: b } = campaign;
  return a <= b ? hour >= a && hour < b : hour >= a || hour < b;
}

export async function campaignSendCountToday(campaignId: string, now = new Date()): Promise<number> {
  return prisma.salesOutreach.count({
    where: { sentAt: { gte: startOfToday(now) }, lead: { campaignId } },
  });
}

export async function globalSendCountToday(now = new Date()): Promise<number> {
  return prisma.salesOutreach.count({ where: { sentAt: { gte: startOfToday(now) } } });
}
