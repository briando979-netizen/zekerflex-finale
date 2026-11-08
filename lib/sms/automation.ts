import { prisma } from "@/lib/prisma";
import { z } from "zod";

const triggerSchema = z.enum([
  "USER_SIGNUP",
  "PROFILE_COMPLETE",
  "FIRST_ORDER",
  "ABANDONMENT",
  "BIRTHDAY",
  "ANNIVERSARY",
  "CUSTOM_EVENT",
]);

const smsAutomationSchema = z.object({
  name: z.string(),
  trigger: triggerSchema,
  sequence: z.object({
    delay: z.number(), // minutes
    message: z.string(),
    condition: z.string().optional(),
    personalization: z.record(z.string()).optional(),
  }).array(),
  segment: z.string().optional(),
  timezoneOptimized: z.boolean().optional(),
  enabled: z.boolean(),
});

export type SMSAutomation = z.infer<typeof smsAutomationSchema>;

export async function createAutomation(data: SMSAutomation, tenantId: string) {
  const validated = smsAutomationSchema.parse(data);
  return prisma.smsAutomation.create({
    data: {
      ...validated,
      tenantId,
      sequenceJson: JSON.stringify(validated.sequence),
    },
  });
}

export async function triggerAutomation(userId: string, event: string, context?: Record<string, any>) {
  const automations = await prisma.smsAutomation.findMany({
    where: { trigger: event, enabled: true },
  });

  for (const automation of automations) {
    const sequence = JSON.parse(automation.sequenceJson);
    await scheduleSequence(userId, automation.id, sequence, context);
  }
}

async function scheduleSequence(userId: string, automationId: string, sequence: any[], context?: Record<string, any>) {
  for (let i = 0; i < sequence.length; i++) {
    const step = sequence[i];
    const delayMs = (step.delay || 0) * 60 * 1000;

    setTimeout(async () => {
      let message = step.message;

      if (step.personalization) {
        for (const [key, value] of Object.entries(step.personalization)) {
          message = message.replace(`{{${key}}}`, context?.[key] ?? "");
        }
      }

      await prisma.smsQueue.create({
        data: {
          userId,
          automationId,
          message,
          status: "PENDING",
          stepIndex: i,
        },
      });
    }, delayMs);
  }
}

export async function evaluateCondition(condition: string, context: Record<string, any>): Promise<boolean> {
  try {
    const func = new Function(...Object.keys(context), `return ${condition}`);
    return func(...Object.values(context));
  } catch {
    return false;
  }
}

export async function getAutomations(tenantId: string) {
  return prisma.smsAutomation.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });
}

export async function updateAutomation(id: string, tenantId: string, data: Partial<SMSAutomation>) {
  return prisma.smsAutomation.update({
    where: { id, tenantId },
    data: {
      ...data,
      sequenceJson: data.sequence ? JSON.stringify(data.sequence) : undefined,
      updatedAt: new Date(),
    },
  });
}
