import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { requireApiKey } from "@/lib/api-keys/gateway";
import { rateLimitHeaders } from "@/lib/http/rate-limit-headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/public/v1/branches — de vestigingen van je organisatie, zodat je het
// branchId kunt opzoeken dat POST /shifts nodig heeft. Scope "shifts:read"; de
// sleutel moet aan een organisatie hangen (een platformbrede sleutel krijgt 412).
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { key, rate } = await requireApiKey(request, "shifts:read");
    if (!key.tenantId) throw AppError.precondition("Deze API-sleutel is niet aan een organisatie gekoppeld");
    const branches = await prisma.branch.findMany({
      where: { tenantId: key.tenantId },
      select: { id: true, name: true, city: true, postalCode: true },
      orderBy: { name: "asc" },
      take: 200,
    });
    return NextResponse.json({ data: branches }, { headers: rateLimitHeaders(rate) });
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    return NextResponse.json(body, { status, headers });
  }
}
