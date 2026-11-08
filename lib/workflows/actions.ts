import { ActionConfig } from "./types";
import { sendMail } from "@/lib/email/sender";
import { sendSMS } from "@/lib/sms/sender";
import { prisma } from "@/lib/prisma";

export interface ActionExecutionContext {
  workflowId: string;
  nodeId: string;
  data: Record<string, unknown>;
}

export class EmailAction {
  static async execute(config: Record<string, unknown>, context: ActionExecutionContext): Promise<void> {
    const to = config.to as string;
    const subject = config.subject as string;
    const body = config.body as string;

    if (!to || !subject || !body) throw new Error("Missing required email fields");

    await sendMail({
      to,
      subject: interpolate(subject, context.data),
      html: interpolate(body, context.data),
    });
  }
}

export class SMSAction {
  static async execute(config: Record<string, unknown>, context: ActionExecutionContext): Promise<void> {
    const phone = config.phone as string;
    const message = config.message as string;

    if (!phone || !message) throw new Error("Missing required SMS fields");

    await sendSMS({
      phone,
      message: interpolate(message, context.data),
    });
  }
}

export class CreateRecordAction {
  static async execute(config: Record<string, unknown>, context: ActionExecutionContext): Promise<void> {
    const table = config.table as string;
    const fields = config.fields as Record<string, unknown>;

    if (!table || !fields) throw new Error("Missing required fields");

    const interpolatedFields = Object.entries(fields).reduce(
      (acc, [key, value]) => ({
        ...acc,
        [key]: typeof value === "string" ? interpolate(value, context.data) : value,
      }),
      {}
    );

    const model = (prisma as any)[table];
    if (!model) throw new Error(`Table not found: ${table}`);

    await model.create({ data: interpolatedFields });
  }
}

export class UpdateRecordAction {
  static async execute(config: Record<string, unknown>, context: ActionExecutionContext): Promise<void> {
    const table = config.table as string;
    const id = config.id as string;
    const fields = config.fields as Record<string, unknown>;

    if (!table || !id || !fields) throw new Error("Missing required fields");

    const model = (prisma as any)[table];
    if (!model) throw new Error(`Table not found: ${table}`);

    await model.update({
      where: { id },
      data: fields,
    });
  }
}

export class DeleteRecordAction {
  static async execute(config: Record<string, unknown>, _context: ActionExecutionContext): Promise<void> {
    const table = config.table as string;
    const id = config.id as string;

    if (!table || !id) throw new Error("Missing required fields");

    const model = (prisma as any)[table];
    if (!model) throw new Error(`Table not found: ${table}`);

    await model.delete({ where: { id } });
  }
}

export class WebhookAction {
  static async execute(config: Record<string, unknown>, context: ActionExecutionContext): Promise<void> {
    const url = config.url as string;
    const method = (config.method as string) || "POST";
    const headers = (config.headers as Record<string, string>) || {};
    const body = config.body as Record<string, unknown>;

    if (!url) throw new Error("Webhook URL required");

    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) throw new Error(`Webhook failed: ${response.statusText}`);
  }
}

export class NotificationAction {
  static async execute(config: Record<string, unknown>, context: ActionExecutionContext): Promise<void> {
    const userId = config.userId as string;
    const title = config.title as string;
    const message = config.message as string;

    if (!userId || !title || !message) throw new Error("Missing required fields");

    await prisma.notification.create({
      data: {
        userId,
        title,
        body: interpolate(message, context.data),
        type: "workflow",
        read: false,
      },
    });
  }
}

function interpolate(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(data[key] ?? ""));
}
