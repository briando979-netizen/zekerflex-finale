import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrincipal, assertBranchAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { bulkApproveTimesheets, bulkRejectTimesheets } from "@/lib/timesheets/bulk-approve";

const bulkApproveSchema = z.object({
  action: z.enum(["approve", "reject"]),
  timesheetIds: z.array(z.string()).min(1).max(50),
  branchId: z.string().min(1),
  reason: z.string().max(500).optional(),
  overrideGpsCheck: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const p = await getPrincipal();
    if (!p) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

    const body = await request.json();
    const data = bulkApproveSchema.parse(body);

    // Controleer branch access
    const branch = await prisma.branch.findUnique({
      where: { id: data.branchId },
      select: { tenantId: true },
    });
    if (!branch) return NextResponse.json({ error: "Locatie niet gevonden" }, { status: 404 });

    assertBranchAccess(p, data.branchId, branch.tenantId);

    if (data.action === "approve") {
      const result = await bulkApproveTimesheets(
        {
          timesheetIds: data.timesheetIds,
          branchId: data.branchId,
          overrideGpsCheck: data.overrideGpsCheck,
        },
        p,
      );
      return NextResponse.json(result);
    } else {
      if (!data.reason) {
        return NextResponse.json({ error: "Reden vereist" }, { status: 400 });
      }
      const result = await bulkRejectTimesheets(data.timesheetIds, data.reason, data.branchId);
      return NextResponse.json(result);
    }
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Ongeldige gegevens" }, { status: 400 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
