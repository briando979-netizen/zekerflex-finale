import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrincipal, assertBranchAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createTapToPayIntent } from "@/lib/billing/tap-to-pay";

const createSchema = z.object({
  branchId: z.string().min(1),
  amountCents: z.number().int().positive(),
  description: z.string().max(200),
  orderId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const p = await getPrincipal();
    if (!p) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

    const body = await request.json();
    const data = createSchema.parse(body);

    // Verify branch access
    const branch = await prisma.branch.findUnique({
      where: { id: data.branchId },
      select: { tenantId: true },
    });
    if (!branch) return NextResponse.json({ error: "Locatie niet gevonden" }, { status: 404 });

    assertBranchAccess(p, data.branchId, branch.tenantId);

    const session = await createTapToPayIntent({
      tenantId: branch.tenantId,
      branchId: data.branchId,
      amountCents: data.amountCents,
      description: data.description,
      orderId: data.orderId,
    });

    return NextResponse.json(session);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Ongeldige gegevens" }, { status: 400 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
