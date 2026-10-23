import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { buildIcpOpgave, icpConfigured, listIcpPeriods, previousQuarter, saveIcpOpgave } from "@/lib/billing/icp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/icp?period=2026-Q3 — ICP-opgave voor een kwartaal + bekende tijdvakken.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const period = new URL(request.url).searchParams.get("period") ?? previousQuarter();
  const [periods, opgave] = await Promise.all([listIcpPeriods(), buildIcpOpgave(period)]);
  await saveIcpOpgave(opgave).catch(() => undefined);
  const known = new Set(periods);
  known.add(period);
  return NextResponse.json({ periods: [...known].sort().reverse(), opgave, deliveryConfigured: icpConfigured() });
});
