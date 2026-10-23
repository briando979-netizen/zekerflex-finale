import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { buildPensioenAangifte } from "@/lib/pensioen/aangifte";
import { aangifteCsv } from "@/lib/pensioen/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/pensioen/<period>/export — the StiPP aangifte as CSV (semicolon + BOM).
export const GET = withAdminAccess<{ period: string }>(["PLATFORM_ADMIN"], async (_req, { params }) => {
  const { period } = params;
  if (!/^\d{4}-\d{2}$/.test(period)) return NextResponse.json({ error: { code: "VALIDATION", message: "Ongeldig tijdvak" } }, { status: 400 });
  const aangifte = await buildPensioenAangifte(period);
  return new Response(aangifteCsv(aangifte), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="stipp-aangifte-${period}.csv"`,
      "cache-control": "no-store",
    },
  });
});
