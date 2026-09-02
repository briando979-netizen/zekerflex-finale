import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { claimsForEmployer } from "@/lib/claims/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/werkgever/claims — cancellation claims against this employer's shifts.
export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const scope = await resolveEmployerScope(p);
    const branches = await prisma.branch.findMany({
      where: { tenantId: { in: scope.tenantIds } },
      select: { name: true },
    });
    const claims = await claimsForEmployer(
      [p.userId],
      branches.map((b) => b.name),
    );
    return NextResponse.json({ claims });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
