import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { z } from "zod";

// Schema voor automation workflowstappen
const workflowStepSchema = z.object({
  id: z.string(),
  campaignId: z.string(),
  delayMinutes: z.number().default(0),
  condition: z
    .object({
      type: z.enum(["none", "engagement", "tag", "custom"]),
      value: z.any().optional(),
    })
    .optional(),
});

const automationWorkflowSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  triggerEvent: z.string(), // e.g., "subscriber.added", "user.signup"
  triggerDelay: z.number().default(0), // Minuten
  steps: z.array(workflowStepSchema),
  enabled: z.boolean().default(true),
  maxExecutions: z.number().optional(), // Limiet per abonnee
});

export type AutomationWorkflowInput = z.infer<typeof automationWorkflowSchema>;
export type WorkflowStep = z.infer<typeof workflowStepSchema>;

// Maak een automation workflow aan
export async function createAutomationWorkflow(
  tenantId: string,
  data: AutomationWorkflowInput
) {
  const parsed = automationWorkflowSchema.parse(data);

  const automation = await prisma.emailAutomation.create({
    data: {
      tenantId,
      name: parsed.name,
      type: "CUSTOM",
      triggerEvent: parsed.triggerEvent,
      triggerDelay: parsed.triggerDelay,
      enabled: parsed.enabled,
    },
  });

  return automation;
}

// Haal workflows op
export async function getAutomationWorkflows(tenantId: string) {
  return prisma.emailAutomation.findMany({
    where: { tenantId },
    include: { campaign: true },
    orderBy: { createdAt: "desc" },
  });
}

// Haal één workflow op
export async function getAutomationWorkflow(
  tenantId: string,
  automationId: string
) {
  const automation = await prisma.emailAutomation.findUnique({
    where: { id: automationId },
  });

  if (!automation || automation.tenantId !== tenantId) {
    throw AppError.notFound("Workflow niet gevonden");
  }

  return automation;
}

// Werk workflow bij
export async function updateAutomationWorkflow(
  tenantId: string,
  automationId: string,
  data: Partial<AutomationWorkflowInput>
) {
  const automation = await getAutomationWorkflow(tenantId, automationId);
  const partial = automationWorkflowSchema.partial().parse(data);

  return prisma.emailAutomation.update({
    where: { id: automationId },
    data: partial,
  });
}

// Verwijder workflow
export async function deleteAutomationWorkflow(
  tenantId: string,
  automationId: string
) {
  const automation = await getAutomationWorkflow(tenantId, automationId);

  await prisma.emailAutomation.delete({ where: { id: automationId } });
  return { deleted: true };
}

// Enable/Disable workflow
export async function toggleAutomationWorkflow(
  tenantId: string,
  automationId: string
) {
  const automation = await getAutomationWorkflow(tenantId, automationId);

  return prisma.emailAutomation.update({
    where: { id: automationId },
    data: { enabled: !automation.enabled },
  });
}

// Voer workflow stap uit voor een abonnee
export async function executeWorkflowStep(
  automationId: string,
  subscriberId: string,
  stepIndex: number
) {
  const automation = await prisma.emailAutomation.findUnique({
    where: { id: automationId },
  });

  if (!automation || !automation.enabled) {
    throw AppError.validation("Workflow niet gevonden of niet ingeschakeld");
  }

  const subscriber = await prisma.emailSubscriber.findUnique({
    where: { id: subscriberId },
  });

  if (!subscriber) {
    throw AppError.notFound("Abonnee niet gevonden");
  }

  // Zet de volgende stap in de wachtrij (in production zou dit via een job queue gaan)
  const sendTime = new Date(
    Date.now() + (automation.triggerDelay ?? 0) * 60 * 1000
  );

  return {
    automationId,
    subscriberId,
    stepIndex,
    scheduled: true,
    sendTime,
  };
}

// Voer volledige workflow uit voor een abonnee
export async function executeFullWorkflow(
  automationId: string,
  subscriberId: string
) {
  const automation = await prisma.emailAutomation.findUnique({
    where: { id: automationId },
  });

  if (!automation || !automation.enabled) {
    throw AppError.validation("Workflow niet gevonden of niet ingeschakeld");
  }

  // Schedule elk stap met de juiste vertraging
  const steps = []; // In production zou dit de workflow steps zijn
  const scheduled = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepResult = await executeWorkflowStep(automationId, subscriberId, i);
    scheduled.push(stepResult);
  }

  return scheduled;
}

// Voorgedefinieerde workflows
export const PREDEFINED_WORKFLOWS = {
  welcomeSeries: {
    name: "Welkomstmail serie",
    description: "Automatische welkomstserie voor nieuwe abonnees",
    triggerEvent: "subscriber.added",
    steps: [
      { id: "welcome", delayMinutes: 0 },
      { id: "follow24h", delayMinutes: 1440 }, // 24 uur later
      { id: "offer", delayMinutes: 4320 }, // 3 dagen later
    ],
  },
  abandonedCart: {
    name: "Verlaten winkelwagen",
    description: "Recover verlaten winkels",
    triggerEvent: "cart.abandoned",
    steps: [
      { id: "reminder", delayMinutes: 60 }, // 1 uur later
      { id: "discount", delayMinutes: 1440 }, // 24 uur later
      { id: "lastChance", delayMinutes: 4320 }, // 3 dagen later
    ],
  },
  reEngagement: {
    name: "Heruitnodiging",
    description: "Heruitnodigingscampagne voor inactieve abonnees",
    triggerEvent: "email.no_engagement",
    triggerDelay: 2880, // 2 dagen voordat het begint
    steps: [
      { id: "winBack", delayMinutes: 0 },
      { id: "specialOffer", delayMinutes: 2880 }, // 2 dagen later
    ],
  },
  postPurchase: {
    name: "Na aankoop",
    description: "Automatische na-aankoop workflow",
    triggerEvent: "order.completed",
    steps: [
      { id: "thankYou", delayMinutes: 0 },
      { id: "review", delayMinutes: 2880 }, // 2 dagen later
      { id: "upsell", delayMinutes: 10080 }, // 1 week later
    ],
  },
  winBack: {
    name: "Terugwinnen",
    description: "Campagne om inactieve klanten terug te winnen",
    triggerEvent: "user.inactive",
    triggerDelay: 4320, // 3 dagen voordat het begint
    steps: [
      { id: "missYou", delayMinutes: 0 },
      { id: "comeback", delayMinutes: 1440 }, // 24 uur later
      { id: "lastOffer", delayMinutes: 4320 }, // 3 dagen later
    ],
  },
} as const;

// Maak een voorgedefinieerde workflow
export async function createPredefinedWorkflow(
  tenantId: string,
  workflowKey: keyof typeof PREDEFINED_WORKFLOWS
) {
  const definition = PREDEFINED_WORKFLOWS[workflowKey];

  return createAutomationWorkflow(tenantId, {
    name: definition.name,
    description: definition.description,
    triggerEvent: definition.triggerEvent,
    triggerDelay: definition.triggerDelay || 0,
    steps: definition.steps,
    enabled: true,
  });
}

// Voer een trigger uit (bijv. wanneer een gebruiker zich aanmeldt)
export async function triggerWorkflowEvent(
  tenantId: string,
  eventName: string,
  subscriberId: string,
  context?: Record<string, any>
) {
  const workflows = await prisma.emailAutomation.findMany({
    where: {
      tenantId,
      triggerEvent: eventName,
      enabled: true,
    },
  });

  const results = [];

  for (const workflow of workflows) {
    const execution = await executeFullWorkflow(workflow.id, subscriberId);
    results.push(execution);
  }

  return results;
}

// Haal actieve workflows op voor een tenant
export async function getActiveWorkflows(tenantId: string) {
  return prisma.emailAutomation.findMany({
    where: {
      tenantId,
      enabled: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

// Haal werkflow-uitvoeringsgeschiedenis op
export async function getWorkflowExecutionHistory(
  automationId: string,
  limit: number = 100
) {
  return prisma.emailSend.findMany({
    where: {
      campaign: {
        automations: {
          some: { id: automationId },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
