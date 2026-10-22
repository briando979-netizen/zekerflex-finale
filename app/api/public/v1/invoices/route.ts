import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toErrorBody } from "@/lib/errors";
import { requireApiKey } from "@/lib/api-keys/gateway";
import { rateLimitHeaders } from "@/lib/http/rate-limit-headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/public/v1/invoices?since=2026-10-01 — invoices addressed to the
// calling organization (newest first, max 200). Scope: "invoices:read".
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { key, rate } = await requireApiKey(request, "invoices:read");
    const since = new URL(request.url).searchParams.get("since");
    const rows = await prisma.invoice.findMany({
      where: {
        ...(key.tenantId ? { recipientTenantId: key.tenantId } : {}),
        ...(since && !Number.isNaN(Date.parse(since)) ? { issuedAt: { gte: new Date(since) } } : {}),
        status: { not: "DRAFT" },
      },
      select: {
        id: true,
        number: true,
        type: true,
        status: true,
        currency: true,
        subtotalCents: true,
        vatRate: true,
        vatCents: true,
        totalCents: true,
        issuedAt: true,
        paidAt: true,
        timesheetId: true,
      },
      orderBy: { issuedAt: "desc" },
      take: 200,
    });
    return NextResponse.json({ data: rows }, { headers: rateLimitHeaders(rate) });
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    return NextResponse.json(body, { status, headers });
  }
}
