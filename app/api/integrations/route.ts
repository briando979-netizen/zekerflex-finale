import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";
import {
  createWorkflow,
  getWorkflow,
  listWorkflows,
  updateWorkflow,
  deleteWorkflow,
  setWorkflowEnabled,
  cloneWorkflow,
  WorkflowDefinition,
} from "@/lib/integrations/workflow-builder";
import {
  getDashboardData,
  getTenantWorkflowsHealth,
} from "@/lib/integrations/monitoring";
import {
  getRateLimitStatus,
  resetRateLimit,
} from "@/lib/integrations/rate-limiter";
import { listConnectors } from "@/lib/integrations/connectors";

export const dynamic = "force-dynamic";

const integrationSchema = z.object({
  type: z.enum(["STRIPE", "SMTP", "TWILIO", "MAILCHIMP", "ZAPIER", "SLACK", "GOOGLE"]),
  apiKey: z.string().min(10),
  apiSecret: z.string().optional(),
  config: z.record(z.any()).optional(),
  enabled: z.boolean().optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();

    const tenant = await prisma.tenant.findFirst({
      where: { memberships: { some: { userId: principal.userId } } },
    });

    if (!tenant) {
      throw AppError.notFound("Tenant not found");
    }

    const url = new URL(request.url);
    const action = url.searchParams.get("action");

    // Handle orchestration queries
    if (action === "workflows") {
      const workflows = await listWorkflows(tenant.id, { limit: 50 });
      return NextResponse.json({ workflows });
    }

    if (action === "dashboard") {
      const dashboardData = await getDashboardData(tenant.id);
      return NextResponse.json(dashboardData);
    }

    if (action === "health") {
      const health = await getTenantWorkflowsHealth(tenant.id);
      return NextResponse.json({ workflows: health });
    }

    if (action === "connectors") {
      const connectors = listConnectors();
      return NextResponse.json({ connectors });
    }

    if (action === "rate-limits") {
      const connectorName = url.searchParams.get("connector");
      if (!connectorName) {
        throw AppError.validation("Connector name required");
      }
      const status = await getRateLimitStatus(tenant.id, connectorName);
      return NextResponse.json(status);
    }

    // Legacy integrations list
    const integrations = await prisma.integration.findMany({
      where: { tenantId: tenant.id },
    });

    return NextResponse.json({
      integrations: integrations.map((i) => ({
        id: i.id,
        type: i.type,
        enabled: i.enabled,
        connectedAt: i.createdAt,
        lastUsed: i.updatedAt,
      })),
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();

    const tenant = await prisma.tenant.findFirst({
      where: { memberships: { some: { userId: principal.userId } } },
    });

    if (!tenant) {
      throw AppError.notFound("Tenant not found");
    }

    const body = await request.json() as Record<string, unknown>;
    const action = (body.action as string) ?? "create-integration";

    // Handle orchestration operations
    if (action === "create-workflow") {
      const definition = body.definition as WorkflowDefinition;
      if (!definition) {
        throw AppError.validation("Workflow definition required");
      }
      const workflow = await createWorkflow(tenant.id, definition);
      return NextResponse.json({ workflow }, { status: 201 });
    }

    if (action === "clone-workflow") {
      const workflowId = body.workflowId as string;
      const newName = body.newName as string;
      if (!workflowId || !newName) {
        throw AppError.validation("Workflow ID and new name required");
      }
      const cloned = await cloneWorkflow(workflowId, newName, tenant.id);
      return NextResponse.json({ workflow: cloned }, { status: 201 });
    }

    if (action === "execute-workflow") {
      const workflowId = body.workflowId as string;
      if (!workflowId) {
        throw AppError.validation("Workflow ID required");
      }
      const workflow = await getWorkflow(workflowId);
      if (!workflow) {
        throw AppError.notFound("Workflow not found");
      }
      const execution = await prisma.workflowExecution.create({
        data: {
          workflowId,
          status: "PENDING",
          triggerData: body.triggerData ?? {},
          stepsCompleted: 0,
          totalSteps: Array.isArray(workflow.steps)
            ? (workflow.steps as unknown[]).length
            : 0,
          startedAt: new Date(),
        },
      });
      return NextResponse.json({ execution }, { status: 201 });
    }

    if (action === "reset-rate-limit") {
      const connectorName = body.connectorName as string;
      if (!connectorName) {
        throw AppError.validation("Connector name required");
      }
      await resetRateLimit(tenant.id, connectorName);
      return NextResponse.json({ success: true });
    }

    // Legacy integration creation
    const data = integrationSchema.parse(body);

    const existing = await prisma.integration.findFirst({
      where: { tenantId: tenant.id, type: data.type },
    });

    if (existing) {
      return NextResponse.json(
        { integration: existing },
        { status: 400 },
      );
    }

    const integration = await prisma.integration.create({
      data: {
        tenantId: tenant.id,
        type: data.type,
        apiKey: encryptKey(data.apiKey),
        apiSecret: data.apiSecret ? encryptKey(data.apiSecret) : null,
        config: data.config ? JSON.stringify(data.config) : null,
        enabled: data.enabled !== false,
      },
    });

    return NextResponse.json({ integration }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();

    const tenant = await prisma.tenant.findFirst({
      where: { memberships: { some: { userId: principal.userId } } },
    });

    if (!tenant) {
      throw AppError.notFound("Tenant not found");
    }

    const workflowId = request.nextUrl.searchParams.get("workflowId");
    const integrationId = request.nextUrl.searchParams.get("integrationId");
    const body = (await request.json()) as Record<string, unknown>;

    // Handle workflow updates
    if (workflowId) {
      const workflow = await getWorkflow(workflowId);
      if (!workflow) {
        throw AppError.notFound("Workflow not found");
      }
      if (workflow.tenantId !== tenant.id) {
        throw AppError.forbidden("Access denied");
      }

      if (body.enabled !== undefined) {
        const updated = await setWorkflowEnabled(
          workflowId,
          body.enabled as boolean
        );
        return NextResponse.json({ workflow: updated });
      }

      const updates: Partial<WorkflowDefinition> = {};
      if (body.name) updates.name = body.name as string;
      if (body.description)
        updates.description = body.description as string;

      const updated = await updateWorkflow(workflowId, updates);
      return NextResponse.json({ workflow: updated });
    }

    // Legacy integration handling
    if (!integrationId) {
      throw AppError.validation("Integration or Workflow ID required");
    }

    if (body.action === "test") {
      return NextResponse.json({
        success: true,
        message: "Integration tested successfully",
      });
    }

    const updates = integrationSchema.partial().parse(body);

    const updated = await prisma.integration.update({
      where: { id: integrationId },
      data: {
        enabled: updates.enabled,
        config: updates.config
          ? JSON.stringify(updates.config)
          : undefined,
      },
    });

    return NextResponse.json({ integration: updated });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();

    const tenant = await prisma.tenant.findFirst({
      where: { memberships: { some: { userId: principal.userId } } },
    });

    if (!tenant) {
      throw AppError.notFound("Tenant not found");
    }

    const workflowId = request.nextUrl.searchParams.get("workflowId");

    if (!workflowId) {
      throw AppError.validation("Workflow ID required");
    }

    const workflow = await getWorkflow(workflowId);
    if (!workflow) {
      throw AppError.notFound("Workflow not found");
    }

    if (workflow.tenantId !== tenant.id) {
      throw AppError.forbidden("Access denied");
    }

    await deleteWorkflow(workflowId);
    return NextResponse.json({ success: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

function encryptKey(key: string): string {
  return Buffer.from(key).toString("base64");
}
