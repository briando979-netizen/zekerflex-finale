import { TriggerConfig, WorkflowTrigger } from "./types";
import cron from "node-cron";

export interface TriggerContext {
  workflowId: string;
  data: Record<string, unknown>;
  timestamp: Date;
}

type TriggerHandler = (context: TriggerContext) => Promise<void>;

const triggerHandlers = new Map<string, TriggerHandler>();

export function registerTriggerHandler(triggerId: string, handler: TriggerHandler): void {
  triggerHandlers.set(triggerId, handler);
}

export async function executeTrigger(triggerId: string, context: TriggerContext): Promise<void> {
  const handler = triggerHandlers.get(triggerId);
  if (!handler) throw new Error(`Trigger handler not found: ${triggerId}`);
  await handler(context);
}

export class WebhookTrigger {
  static async handle(config: Record<string, unknown>, context: TriggerContext): Promise<void> {
    const url = config.url as string;
    const method = (config.method as string) || "POST";
    const headers = (config.headers as Record<string, string>) || {};

    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(context.data),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      throw new Error(`Webhook trigger failed: ${error}`);
    }
  }
}

export class ScheduleTrigger {
  private static jobs = new Map<string, cron.ScheduledTask>();

  static schedule(triggerId: string, cronExpression: string, handler: () => Promise<void>): void {
    const task = cron.schedule(cronExpression, handler, { runOnInit: false });
    this.jobs.set(triggerId, task);
  }

  static unschedule(triggerId: string): void {
    const task = this.jobs.get(triggerId);
    if (task) {
      task.stop();
      this.jobs.delete(triggerId);
    }
  }
}

export class EventTrigger {
  static async handle(config: Record<string, unknown>, context: TriggerContext): Promise<void> {
    const eventType = config.eventType as string;
    const filters = (config.filters as Record<string, unknown>) || {};

    if (!eventType) throw new Error("eventType required");

    const matches = Object.entries(filters).every(([key, value]) => context.data[key] === value);

    if (!matches) throw new Error("Event does not match filter criteria");
  }
}

export class ManualTrigger {
  static async handle(_config: Record<string, unknown>, _context: TriggerContext): Promise<void> {
    return Promise.resolve();
  }
}

export class ConditionalTrigger {
  static async handle(config: Record<string, unknown>, context: TriggerContext): Promise<void> {
    const conditions = config.conditions as Array<{ field: string; operator: string; value: unknown }>;

    const allMatch = conditions.every(({ field, operator, value }) => {
      const fieldValue = context.data[field];

      switch (operator) {
        case "eq":
          return fieldValue === value;
        case "neq":
          return fieldValue !== value;
        case "gt":
          return (fieldValue as number) > (value as number);
        case "lt":
          return (fieldValue as number) < (value as number);
        case "contains":
          return String(fieldValue).includes(String(value));
        default:
          return false;
      }
    });

    if (!allMatch) throw new Error("Conditional trigger conditions not met");
  }
}

export class DataChangeTrigger {
  static async handle(config: Record<string, unknown>, context: TriggerContext): Promise<void> {
    const entityType = config.entityType as string;
    const action = config.action as "created" | "updated" | "deleted";
    const changeType = context.data.changeType as string;

    if (changeType !== action) throw new Error(`Expected ${action}, got ${changeType}`);
  }
}
