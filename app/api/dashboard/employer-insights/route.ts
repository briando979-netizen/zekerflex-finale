import { NextRequest, NextResponse } from "next/server";
import { getPrincipal, assertBranchAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEmployerInsights } from "@/lib/dashboard/employer-insights";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const p = await getPrincipal();
    if (!p) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

    const branchId = request.nextUrl.searchParams.get("branchId");
    if (!branchId) return NextResponse.json({ error: "branchId vereist" }, { status: 400 });

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { tenantId: true },
    });
    if (!branch) return NextResponse.json({ error: "Locatie niet gevonden" }, { status: 404 });

    assertBranchAccess(p, branchId, branch.tenantId);

    const insights = await getEmployerInsights(branchId);
    return NextResponse.json(insights);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
