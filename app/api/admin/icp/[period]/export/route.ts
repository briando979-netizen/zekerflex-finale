import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { buildIcpOpgave } from "@/lib/billing/icp";
import { icpCsv } from "@/lib/billing/icp-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAdminAccess<{ period: string }>(["PLATFORM_ADMIN"], async (_req, { params }) => {
  const { period } = params;
  if (!/^\d{4}-Q[1-4]$/.test(period)) return NextResponse.json({ error: { code: "VALIDATION", message: "Ongeldig tijdvak" } }, { status: 400 });
  const o = await buildIcpOpgave(period);
  return new Response(icpCsv(o), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="icp-${period}.csv"`, "cache-control": "no-store" },
  });
});
