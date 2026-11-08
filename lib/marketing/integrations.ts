import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { z } from "zod";

// Schema voor CRM integratie
const crmIntegrationSchema = z.object({
  provider: z.enum(["hubspot", "salesforce", "pipedrive", "custom"]),
  apiKey: z.string(),
  syncEnabled: z.boolean().default(true),
  fieldMapping: z.record(z.string()).optional(),
});

export type CRMIntegrationInput = z.infer<typeof crmIntegrationSchema>;

// Opslag van CRM integratie
const integrations = new Map<
  string,
  { provider: string; apiKey: string; fieldMapping: Record<string, string> }
>();

// Setup CRM integratie
export async function setupCRMIntegration(
  tenantId: string,
  data: CRMIntegrationInput
) {
  const parsed = crmIntegrationSchema.parse(data);

  // Bewaar in geheugen (in productie zou dit in DB gaan)
  integrations.set(tenantId, {
    provider: parsed.provider,
    apiKey: parsed.apiKey,
    fieldMapping: parsed.fieldMapping ?? {},
  });

  return {
    tenantId,
    provider: parsed.provider,
    syncEnabled: parsed.syncEnabled,
  };
}

// Haal CRM integratie op
export async function getCRMIntegration(tenantId: string) {
  const integration = integrations.get(tenantId);

  if (!integration) {
    throw AppError.notFound("CRM integratie niet gevonden");
  }

  return integration;
}

// Verwijder CRM integratie
export async function removeCRMIntegration(tenantId: string) {
  integrations.delete(tenantId);
  return { deleted: true };
}

// Sync abonnees naar CRM
export async function syncSubscribersToCRM(
  tenantId: string,
  listId?: string
) {
  const integration = await getCRMIntegration(tenantId);

  const subscribers = await prisma.emailSubscriber.findMany({
    where: {
      tenantId,
      ...(listId && { listId }),
    },
  });

  const syncResults = [];

  for (const subscriber of subscribers) {
    try {
      await syncSubscriberToCRM(integration, subscriber);
      syncResults.push({
        subscriberId: subscriber.id,
        status: "synced",
      });
    } catch (error) {
      syncResults.push({
        subscriberId: subscriber.id,
        status: "failed",
        error: String(error),
      });
    }
  }

  return syncResults;
}

// Sync individuele abonnee naar CRM
async function syncSubscriberToCRM(integration: any, subscriber: any) {
  const { provider, fieldMapping } = integration;

  const data = {
    email: subscriber.email,
    firstName: subscriber.firstName,
    lastName: subscriber.lastName,
    ...((subscriber.metadata as any) ?? {}),
  };

  switch (provider) {
    case "hubspot":
      return syncToHubSpot(data, fieldMapping);
    case "salesforce":
      return syncToSalesforce(data, fieldMapping);
    case "pipedrive":
      return syncToPipedrive(data, fieldMapping);
    default:
      throw new Error(`Onbekende provider: ${provider}`);
  }
}

// Sync naar HubSpot
async function syncToHubSpot(data: any, fieldMapping: Record<string, string>) {
  // In productie zou dit daadwerkelijk de HubSpot API aanroepen
  console.log("Syncing to HubSpot:", data);
  return { success: true, provider: "hubspot" };
}

// Sync naar Salesforce
async function syncToSalesforce(
  data: any,
  fieldMapping: Record<string, string>
) {
  // In productie zou dit daadwerkelijk de Salesforce API aanroepen
  console.log("Syncing to Salesforce:", data);
  return { success: true, provider: "salesforce" };
}

// Sync naar Pipedrive
async function syncToPipedrive(data: any, fieldMapping: Record<string, string>) {
  // In productie zou dit daadwerkelijk de Pipedrive API aanroepen
  console.log("Syncing to Pipedrive:", data);
  return { success: true, provider: "pipedrive" };
}

// Lead scoring system
export async function calculateLeadScore(
  subscriberId: string,
  weights?: {
    engagement?: number;
    recency?: number;
    frequency?: number;
    monetaryValue?: number;
  }
) {
  const subscriber = await prisma.emailSubscriber.findUnique({
    where: { id: subscriberId },
    include: { sends: true },
  });

  if (!subscriber) {
    throw AppError.notFound("Abonnee niet gevonden");
  }

  const defaultWeights = {
    engagement: 0.3,
    recency: 0.25,
    frequency: 0.25,
    monetaryValue: 0.2,
  };

  const w = weights ?? defaultWeights;

  // Engagement score (0-100)
  const opens = subscriber.sends.filter((s) => s.opened).length;
  const clicks = subscriber.sends.filter((s) => s.clicked).length;
  const engagementScore = Math.min(100, (opens + clicks * 2) * 10);

  // Recency score (0-100): gebaseerd op laatste activiteit
  const lastEngagement = subscriber.lastEngagementAt
    ? (new Date().getTime() - new Date(subscriber.lastEngagementAt).getTime()) /
      (1000 * 60 * 60 * 24)
    : Infinity;
  const recencyScore = Math.max(
    0,
    100 - (lastEngagement > 30 ? 100 : (lastEngagement / 30) * 100)
  );

  // Frequency score (0-100): aantal opens
  const frequencyScore = Math.min(100, opens * 10);

  // Monetary value score (0-100): aantal conversies
  const conversions = subscriber.sends.filter((s) => s.converted).length;
  const monetaryScore = Math.min(100, conversions * 20);

  const totalScore =
    engagementScore * w.engagement +
    recencyScore * w.recency +
    frequencyScore * w.frequency +
    monetaryScore * w.monetaryValue;

  return {
    subscriberId,
    totalScore: parseFloat(totalScore.toFixed(2)),
    engagementScore: parseFloat(engagementScore.toFixed(2)),
    recencyScore: parseFloat(recencyScore.toFixed(2)),
    frequencyScore: parseFloat(frequencyScore.toFixed(2)),
    monetaryScore: parseFloat(monetaryScore.toFixed(2)),
    grade:
      totalScore >= 80
        ? "A"
        : totalScore >= 60
          ? "B"
          : totalScore >= 40
            ? "C"
            : totalScore >= 20
              ? "D"
              : "F",
  };
}

// Voeg lead score toe aan batch abonnees
export async function scoreBatchSubscribers(
  subscriberIds: string[]
) {
  return Promise.all(
    subscriberIds.map((id) => calculateLeadScore(id))
  );
}

// Haal top leads op
export async function getTopLeads(
  tenantId: string,
  listId?: string,
  limit: number = 10
) {
  const subscribers = await prisma.emailSubscriber.findMany({
    where: {
      tenantId,
      ...(listId && { listId }),
    },
    include: { sends: true },
    take: limit * 2, // Haal extra op vanwege filtering
  });

  const scored = await Promise.all(
    subscribers.map((sub) => calculateLeadScore(sub.id))
  );

  return scored
    .filter((score) => score.grade !== "F")
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, limit);
}

// Attribution: haal campagne op die conversie veroorzaakte
export async function getConversionAttribution(
  subscriberId: string
): Promise<{ campaignId: string; campaignName: string; type: string }[]> {
  const sends = await prisma.emailSend.findMany({
    where: {
      subscriberId,
      converted: true,
    },
    include: {
      campaign: true,
    },
    orderBy: { convertedAt: "desc" },
  });

  return sends.map((send) => ({
    campaignId: send.campaignId,
    campaignName: send.campaign.name,
    type: "conversion",
  }));
}

// Multi-touch attribution model
export async function getMultiTouchAttribution(subscriberId: string) {
  const sends = await prisma.emailSend.findMany({
    where: { subscriberId },
    include: { campaign: true },
    orderBy: { createdAt: "asc" },
  });

  const engagements = sends.filter((s) => s.opened || s.clicked);
  const conversions = sends.filter((s) => s.converted);

  if (conversions.length === 0) {
    return [];
  }

  // Linear model: elke betrokken campagne krijgt gelijk gewicht
  const weight = 1 / engagements.length;

  return engagements.map((send) => ({
    campaignId: send.campaignId,
    campaignName: send.campaign.name,
    touchType: send.opened ? "open" : "click",
    attributionWeight: weight,
  }));
}

// Haal campagne attributie op
export async function getCampaignAttribution(
  campaignId: string
): Promise<{
  directConversions: number;
  assistedConversions: number;
  conversionValue: number;
}> {
  const sends = await prisma.emailSend.findMany({
    where: { campaignId, converted: true },
  });

  const directConversions = sends.length;

  // Bereken assisted conversions (conversies waar deze campagne betrokken was)
  let assistedConversions = 0;
  for (const send of sends) {
    const otherEngagements = await prisma.emailSend.findMany({
      where: {
        subscriberId: send.subscriberId,
        campaignId: { not: campaignId },
        createdAt: { lt: send.createdAt },
        OR: [{ opened: true }, { clicked: true }],
      },
    });

    if (otherEngagements.length > 0) {
      assistedConversions++;
    }
  }

  const conversionValue = await prisma.emailConversionEvent.aggregate({
    where: {
      send: { campaignId },
    },
    _sum: { value: true },
  });

  return {
    directConversions,
    assistedConversions,
    conversionValue: (conversionValue._sum?.value ?? 0) / 100, // Converteer van cents naar euro
  };
}

// Export segmentgegevens voor analyse
export async function exportSegmentData(
  tenantId: string,
  segmentId: string,
  format: "csv" | "json" = "csv"
) {
  const segment = await prisma.emailSegment.findUnique({
    where: { id: segmentId },
  });

  if (!segment || segment.tenantId !== tenantId) {
    throw AppError.notFound("Segment niet gevonden");
  }

  const subscribers = await prisma.emailSubscriber.findMany({
    where: {
      tenantId,
      ...(segment.listId && { listId: segment.listId }),
    },
    include: { sends: { take: 1 } },
  });

  if (format === "json") {
    return subscribers;
  }

  // CSV format
  const headers = ["Email", "FirstName", "LastName", "Status", "EngagementScore", "SubscribedAt"];
  const rows = subscribers.map((sub) => [
    sub.email,
    sub.firstName ?? "",
    sub.lastName ?? "",
    sub.status,
    sub.engagementScore,
    sub.createdAt.toISOString(),
  ]);

  return {
    headers,
    rows,
  };
}
