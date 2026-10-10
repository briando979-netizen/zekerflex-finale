import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/payroll/2026-W35/sepa-batch — downloads the pain.001 XML
// generated when that week was finalised (lib/payroll/sepa-export.ts).
export const GET = withAdminAccess<{ isoWeek: string }>(["PLATFORM_ADMIN"], async (_request, { params }) => {
  const batch = await prisma.payrollSepaBatch.findUnique({ where: { isoWeek: params.isoWeek } });
  if (!batch) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Geen betaalbestand voor deze week" } }, { status: 404 });
  }
  return new NextResponse(batch.xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "content-disposition": `attachment; filename="sepa-payroll-${params.isoWeek}.xml"`,
    },
  });
});
