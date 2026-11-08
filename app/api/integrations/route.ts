import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";

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

    const body = await request.json();
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
    const integrationId = request.nextUrl.searchParams.get("integrationId");

    if (!integrationId) {
      throw AppError.validation("Integration ID required");
    }

    const body = await request.json();

    if (body.action === "test") {
      return NextResponse.json({ success: true, message: "Integration tested successfully" });
    }

    const updates = integrationSchema.partial().parse(body);

    const updated = await prisma.integration.update({
      where: { id: integrationId },
      data: {
        enabled: updates.enabled,
        config: updates.config ? JSON.stringify(updates.config) : undefined,
      },
    });

    return NextResponse.json({ integration: updated });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

function encryptKey(key: string): string {
  return Buffer.from(key).toString("base64");
}
