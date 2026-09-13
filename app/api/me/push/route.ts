import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { jsonError } from "@/lib/http/errors";
import { isWebPushEnabled } from "@/lib/notifications/push/web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function freelancerId(userId: string): Promise<string> {
  const fp = await prisma.freelancerProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!fp) throw AppError.validation("Meldingen zijn nu alleen voor freelancers.");
  return fp.id;
}

// GET /api/me/push — what the client needs to (un)subscribe.
export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const fp = await prisma.freelancerProfile.findUnique({
      where: { userId: p.userId },
      select: { id: true },
    });
    const subscribed = fp
      ? (await prisma.webPushSubscription.count({
          where: { freelancerId: fp.id, disabledAt: null },
        })) > 0
      : false;
    return NextResponse.json({
      configured: isWebPushEnabled(),
      vapidPublicKey: env.WEBPUSH_VAPID_PUBLIC_KEY ?? null,
      supported: Boolean(fp),
      subscribed,
    });
  } catch (err) {
    return jsonError(err);
  }
}

const subscribeSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
});

// POST /api/me/push — register (or refresh) a Web Push subscription.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const fid = await freelancerId(p.userId);
    const body = subscribeSchema.parse(await request.json().catch(() => ({})));

    await prisma.webPushSubscription.upsert({
      where: { endpoint: body.endpoint },
      create: {
        freelancerId: fid,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        authKey: body.keys.auth,
        userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
      },
      update: {
        freelancerId: fid,
        p256dh: body.keys.p256dh,
        authKey: body.keys.auth,
        disabledAt: null,
        lastSeenAt: new Date(),
        userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}

const unsubSchema = z.object({ endpoint: z.string().url().max(2000) });

// DELETE /api/me/push — drop a subscription (browser-side unsubscribe).
export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const fid = await freelancerId(p.userId);
    const { endpoint } = unsubSchema.parse(await request.json().catch(() => ({})));
    await prisma.webPushSubscription.deleteMany({
      where: { endpoint, freelancerId: fid },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
