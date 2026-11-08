import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { generateWebhookSecret, signWebhookPayload } from "@/lib/api/enterprise";
import { z } from "zod";

export const dynamic = "force-dynamic";

const webhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string()).min(1),
  active: z.boolean().optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requireRole("ADMIN");
    const principal = await requirePrincipal();

    const webhooks = await prisma.webhook.findMany({
      where: { userId: principal.userId },
      select: {
        id: true,
        url: true,
        events: true,
        active: true,
        createdAt: true,
        lastTriggeredAt: true,
      },
    });

    return NextResponse.json({ webhooks });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await requireRole("ADMIN");
    const principal = await requirePrincipal();
    const body = await request.json();
    const { url, events, active = true } = webhookSchema.parse(body);

    const secret = generateWebhookSecret();

    const webhook = await prisma.webhook.create({
      data: {
        userId: principal.userId,
        url,
        events,
        active,
        secret,
      },
      select: {
        id: true,
        url: true,
        events: true,
        active: true,
        createdAt: true,
      },
    });

    return NextResponse.json(webhook, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    await requireRole("ADMIN");
    const webhookId = request.nextUrl.searchParams.get("id");

    if (!webhookId) {
      throw AppError.validation("Webhook ID required");
    }

    const body = await request.json();
    const updates = webhookSchema.partial().parse(body);

    const webhook = await prisma.webhook.update({
      where: { id: webhookId },
      data: updates,
      select: {
        id: true,
        url: true,
        events: true,
        active: true,
      },
    });

    return NextResponse.json(webhook);
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    await requireRole("ADMIN");
    const webhookId = request.nextUrl.searchParams.get("id");

    if (!webhookId) {
      throw AppError.validation("Webhook ID required");
    }

    await prisma.webhook.delete({
      where: { id: webhookId },
    });

    return NextResponse.json({ deleted: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
