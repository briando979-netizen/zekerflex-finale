import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { z } from "zod";

// Schema voor segmentregels
const segmentRuleSchema = z.object({
  field: z.string(),
  operator: z.enum([
    "equals",
    "not_equals",
    "contains",
    "not_contains",
    "greater_than",
    "less_than",
    "in",
    "not_in",
  ]),
  value: z.any(),
});

const segmentSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  rules: z.array(segmentRuleSchema),
  combinationLogic: z.enum(["AND", "OR"]).default("AND"),
  listId: z.string().optional(),
});

export type SegmentInput = z.infer<typeof segmentSchema>;
export type SegmentRule = z.infer<typeof segmentRuleSchema>;

// Maak een nieuw segment aan
export async function createSegment(tenantId: string, data: SegmentInput) {
  const parsed = segmentSchema.parse(data);

  const segment = await prisma.emailSegment.create({
    data: {
      tenantId,
      name: parsed.name,
      description: parsed.description,
      rules: parsed.rules,
      combinationLogic: parsed.combinationLogic,
      listId: parsed.listId,
    },
  });

  return segment;
}

// Haal alle segmenten op
export async function getSegments(tenantId: string) {
  return prisma.emailSegment.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });
}

// Haal één segment op
export async function getSegment(tenantId: string, segmentId: string) {
  const segment = await prisma.emailSegment.findUnique({
    where: { id: segmentId },
  });

  if (!segment || segment.tenantId !== tenantId) {
    throw AppError.notFound("Segment niet gevonden");
  }

  return segment;
}

// Werk segment bij
export async function updateSegment(
  tenantId: string,
  segmentId: string,
  data: Partial<SegmentInput>
) {
  const segment = await getSegment(tenantId, segmentId);
  const parsed = segmentSchema.partial().parse(data);

  return prisma.emailSegment.update({
    where: { id: segmentId },
    data: parsed,
  });
}

// Verwijder segment
export async function deleteSegment(tenantId: string, segmentId: string) {
  const segment = await getSegment(tenantId, segmentId);

  await prisma.emailSegment.delete({ where: { id: segmentId } });
  return { deleted: true };
}

// Verkrijg abonnees in een segment
export async function getSegmentSubscribers(
  tenantId: string,
  segmentId: string
) {
  const segment = await getSegment(tenantId, segmentId);

  // Haal alle abonnees op uit de list
  const subscribers = await prisma.emailSubscriber.findMany({
    where: {
      tenantId,
      ...(segment.listId && { listId: segment.listId }),
    },
  });

  // Filter op segmentregels
  return filterSubscribersByRules(
    subscribers as any[],
    segment.rules as SegmentRule[],
    segment.combinationLogic
  );
}

// Filter abonnees op basis van regels
export function filterSubscribersByRules(
  subscribers: any[],
  rules: SegmentRule[],
  logic: "AND" | "OR"
): any[] {
  return subscribers.filter((subscriber) => {
    const results = rules.map((rule) =>
      evaluateRule(subscriber, rule)
    );

    return logic === "AND" ? results.every((r) => r) : results.some((r) => r);
  });
}

// Evalueer een regel tegen een abonnee
function evaluateRule(subscriber: any, rule: SegmentRule): boolean {
  const value = getNestedValue(subscriber, rule.field);

  switch (rule.operator) {
    case "equals":
      return value === rule.value;
    case "not_equals":
      return value !== rule.value;
    case "contains":
      return String(value).includes(String(rule.value));
    case "not_contains":
      return !String(value).includes(String(rule.value));
    case "greater_than":
      return Number(value) > Number(rule.value);
    case "less_than":
      return Number(value) < Number(rule.value);
    case "in":
      return Array.isArray(rule.value) && rule.value.includes(value);
    case "not_in":
      return !Array.isArray(rule.value) || !rule.value.includes(value);
    default:
      return false;
  }
}

// Verkrijg geneste waarde uit object
function getNestedValue(obj: any, path: string): any {
  return path.split(".").reduce((acc, part) => acc?.[part], obj);
}

// Voorgedefinieerde segmenten
export const PREDEFINED_SEGMENTS = {
  active: {
    name: "Actieve abonnees",
    rules: [
      {
        field: "status",
        operator: "equals",
        value: "SUBSCRIBED",
      },
    ],
  },
  inactive: {
    name: "Inactieve abonnees",
    rules: [
      {
        field: "status",
        operator: "in",
        value: ["UNSUBSCRIBED", "BOUNCED", "INACTIVE"],
      },
    ],
  },
  engaged: {
    name: "Betrokken abonnees",
    rules: [
      {
        field: "engagementScore",
        operator: "greater_than",
        value: 50,
      },
      {
        field: "status",
        operator: "equals",
        value: "SUBSCRIBED",
      },
    ],
    combinationLogic: "AND",
  },
  notEngaged: {
    name: "Niet-betrokken abonnees",
    rules: [
      {
        field: "engagementScore",
        operator: "less_than",
        value: 20,
      },
    ],
  },
  recentSignup: {
    name: "Recente registratie",
    rules: [
      {
        field: "createdAt",
        operator: "greater_than",
        value: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Afgelopen 7 dagen
      },
    ],
  },
} as const;

// Maak een voorgedefinieerd segment
export async function createPredefinedSegment(
  tenantId: string,
  segmentKey: keyof typeof PREDEFINED_SEGMENTS,
  listId?: string
) {
  const definition = PREDEFINED_SEGMENTS[segmentKey];

  return createSegment(tenantId, {
    name: definition.name,
    rules: definition.rules,
    combinationLogic: definition.combinationLogic || "AND",
    listId,
  });
}

// Bereken segmentgrootte
export async function getSegmentSize(
  tenantId: string,
  segmentId: string
): Promise<number> {
  const segment = await getSegment(tenantId, segmentId);
  const subscribers = await getSegmentSubscribers(tenantId, segmentId);
  return subscribers.length;
}

// Voeg metadata toe aan abonnee voor geavanceerde segmentatie
export async function updateSubscriberMetadata(
  tenantId: string,
  subscriberId: string,
  metadata: Record<string, any>
) {
  const subscriber = await prisma.emailSubscriber.findUnique({
    where: { id: subscriberId },
  });

  if (!subscriber || subscriber.tenantId !== tenantId) {
    throw AppError.notFound("Abonnee niet gevonden");
  }

  const currentMetadata = (subscriber.metadata ?? {}) as Record<string, any>;

  return prisma.emailSubscriber.update({
    where: { id: subscriberId },
    data: {
      metadata: {
        ...currentMetadata,
        ...metadata,
      },
    },
  });
}

// Voeg meerdere abonnees toe aan een segment via tags
export async function tagSubscribers(
  tenantId: string,
  subscriberIds: string[],
  tag: string
) {
  const updates = subscriberIds.map((id) =>
    updateSubscriberMetadata(tenantId, id, {
      tags: [tag],
    })
  );

  return Promise.all(updates);
}

// Haal abonnees met een specifieke tag op
export async function getSubscribersByTag(
  tenantId: string,
  tag: string,
  listId?: string
) {
  const subscribers = await prisma.emailSubscriber.findMany({
    where: {
      tenantId,
      ...(listId && { listId }),
    },
  });

  return subscribers.filter((sub) => {
    const metadata = (sub.metadata ?? {}) as any;
    const tags = metadata.tags ?? [];
    return tags.includes(tag);
  });
}
