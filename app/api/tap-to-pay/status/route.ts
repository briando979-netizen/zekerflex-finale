import { NextRequest, NextResponse } from "next/server";
import { getPrincipal } from "@/lib/auth";
import { getTapToPayStatus } from "@/lib/billing/tap-to-pay";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const p = await getPrincipal();
    if (!p) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

    const intentId = request.nextUrl.searchParams.get("intentId");
    const branchId = request.nextUrl.searchParams.get("branchId");

    if (!intentId || !branchId) {
      return NextResponse.json({ error: "intentId en branchId vereist" }, { status: 400 });
    }

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { tenantId: true, tenant: { select: { stripeConnectAccountId: true } } },
    });

    if (!branch || !branch.tenant.stripeConnectAccountId) {
      return NextResponse.json({ error: "Lokatie niet geconfigureerd" }, { status: 404 });
    }

    const status = await getTapToPayStatus(branch.tenantId, intentId, branch.tenant.stripeConnectAccountId);
    return NextResponse.json(status);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
