import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrincipal, assertBranchAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createBulkShifts } from "@/lib/shifts/bulk-create";

const bulkSchema = z.object({
  branchId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  hourlyRateCents: z.number().int().positive(),
  breakMinutes: z.number().int().min(0).max(480),
  positions: z.number().int().min(1).max(50),
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1).max(100),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  viaUitzendbureau: z.boolean().optional(),
  requiredSkillId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const p = await getPrincipal();
    if (!p) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

    const body = await request.json();
    const data = bulkSchema.parse(body);

    const branch = await prisma.branch.findUnique({ where: { id: data.branchId }, select: { tenantId: true } });
    if (!branch) return NextResponse.json({ error: "Locatie niet gevonden" }, { status: 404 });

    assertBranchAccess(p, data.branchId, branch.tenantId);

    const result = await createBulkShifts({
      ...data,
      createdByUserId: p.userId,
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Ongeldige gegevens" }, { status: 400 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
