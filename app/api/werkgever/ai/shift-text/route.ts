import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { prisma } from "@/lib/prisma";
import { draftShiftText } from "@/lib/ai/writer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().max(1000).optional(),
  dresscode: z.string().max(500).optional(),
  branchId: z.string().max(128).optional(),
  city: z.string().max(100).optional(),
  startsAt: z.string().max(40).optional(),
  endsAt: z.string().max(40).optional(),
  breakMinutes: z.coerce.number().int().min(0).max(240).optional(),
  viaUitzendbureau: z.boolean().optional(),
});

// POST /api/werkgever/ai/shift-text — ✨ draft the omschrijving + kledingvoorschriften for a new klus.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const scope = await resolveEmployerScope(principal);
    const tenantId = scope.tenantIds[0];
    if (!tenantId) throw AppError.precondition("Geen organisatie gekoppeld aan je account");
    await enforceRateLimit({ name: "ai-shift-text", identifier: principal.userId, limit: 40, windowSeconds: 3600, message: "Even rustig aan met de schrijfhulp." });
    const input = schema.parse(await request.json().catch(() => ({})));

    const [tenant, branch] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
      input.branchId
        ? prisma.branch.findFirst({ where: { id: input.branchId, tenantId: { in: scope.tenantIds } }, select: { name: true, city: true } })
        : null,
    ]);

    return NextResponse.json(
      await draftShiftText({
        ...input,
        company: tenant?.name,
        branchName: branch?.name,
        city: branch?.city ?? input.city,
      }),
    );
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
