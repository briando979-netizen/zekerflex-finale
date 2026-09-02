import { NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { env } from "@/lib/env";
import { smtpConfigured } from "@/lib/mail";
import { listCampaigns, listSubscribers, subscriberStats } from "@/lib/newsletter/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/nieuwsbrief — subscribers, stats, campaign history. Read-only.
export async function GET(): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");

    const [stats, subscribers, campaigns] = await Promise.all([
      subscriberStats(),
      listSubscribers(),
      listCampaigns(30),
    ]);

    return NextResponse.json({
      stats,
      smtp: smtpConfigured(),
      from: env.MAIL_NIEUWSBRIEF_FROM,
      subscribers: subscribers.slice(0, 500).map((s) => ({
        email: s.email,
        status: s.status,
        source: s.source,
        createdAt: s.createdAt,
        confirmedAt: s.confirmedAt ?? null,
      })),
      campaigns,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
