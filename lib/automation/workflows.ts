import { prisma } from "@/lib/prisma";
import { sendNotification } from "@/lib/notifications/dispatch";

export type WorkflowTrigger = "NEW_BOOKING" | "BOOKING_COMPLETED" | "CUSTOMER_INACTIVE" | "LOW_STOCK" | "ANNIVERSARY" | "SCHEDULED";

export type WorkflowAction = "SEND_EMAIL" | "SEND_SMS" | "CREATE_TASK" | "APPLY_DISCOUNT" | "SEND_REMINDER" | "SEND_FOLLOWUP";

export interface Workflow {
  naam: string;
  trigger: WorkflowTrigger;
  action: WorkflowAction;
  condition?: string;
  template?: string;
  delay?: number;
  enabled: boolean;
}

export async function createWorkflow(tenantId: string, workflow: Workflow) {
  return await prisma.workflow.create({
    data: {
      tenantId,
      ...workflow,
    },
  });
}

export async function triggerWorkflow(tenantId: string, trigger: WorkflowTrigger, data: any) {
  const workflows = await prisma.workflow.findMany({
    where: {
      tenantId,
      trigger,
      enabled: true,
    },
  });

  for (const workflow of workflows) {
    await executeWorkflow(workflow, data);
  }
}

async function executeWorkflow(workflow: any, data: any) {
  if (workflow.delay) {
    await new Promise((resolve) => setTimeout(resolve, workflow.delay));
  }

  switch (workflow.action) {
    case "SEND_EMAIL":
      await sendEmail(data.email, workflow.template, data);
      break;
    case "SEND_SMS":
      await sendSMS(data.telefoon, workflow.template);
      break;
    case "SEND_REMINDER":
      await sendNotification(data.userId, "message", "Herinnering", workflow.template);
      break;
    case "CREATE_TASK":
      await createTask(workflow.tenantId, workflow.template, data);
      break;
  }
}

async function sendEmail(email: string, template: string, data: any) {
  console.log(`Email verzonden naar ${email}: ${template}`);
}

async function sendSMS(telefoon: string, template: string) {
  console.log(`SMS verzonden naar ${telefoon}: ${template}`);
}

async function createTask(tenantId: string, title: string, data: any) {
  await prisma.task.create({
    data: {
      tenantId,
      titel: title,
      beschrijving: JSON.stringify(data),
      status: "OPEN",
    },
  });
}
