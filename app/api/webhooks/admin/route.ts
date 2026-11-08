import { NextRequest, NextResponse } from "next/server";
import { requireRole, requirePrincipal } from "@/lib/auth";
import {
  createWebhook,
  updateWebhook,
  deleteWebhook,
  listWebhooks,
} from "@/lib/webhooks/manager";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const webhooks = await listWebhooks(principal.tenantId);
    return NextResponse.json({ webhooks });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();

    const webhook = await createWebhook(principal.tenantId, body);
    return NextResponse.json({ webhook }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const webhookId = request.nextUrl.searchParams.get("id");

    if (!webhookId) throw AppError.validation("webhookId required");

    const body = await request.json();
    await updateWebhook(principal.tenantId, webhookId, body);

    return NextResponse.json({ success: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const webhookId = request.nextUrl.searchParams.get("id");

    if (!webhookId) throw AppError.validation("webhookId required");

    await deleteWebhook(principal.tenantId, webhookId);
    return NextResponse.json({ success: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
