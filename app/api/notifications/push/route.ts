import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import * as pushNotifications from "@/lib/notifications/push";
import * as notificationDelivery from "@/lib/notifications/delivery";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
  userAgent: z.string().optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();

    const action = request.nextUrl.searchParams.get("action");

    if (action === "subscribe") {
      const subscription = subscribeSchema.parse(body);
      const tenant = await (await import("@/lib/auth")).getTenant(principal);

      await pushNotifications.subscribeToNotifications(principal.userId, tenant.id, subscription);
      return NextResponse.json({ success: true });
    }

    if (action === "unsubscribe") {
      const { endpoint } = z.object({ endpoint: z.string() }).parse(body);
      await pushNotifications.unsubscribeFromNotifications(principal.userId, endpoint);
      return NextResponse.json({ success: true });
    }

    throw AppError.validation("Invalid action");
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const tenant = await (await import("@/lib/auth")).getTenant(principal);

    const logs = await pushNotifications.getPushLogs(principal.userId, tenant.id);
    return NextResponse.json({ logs });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
