import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { alertOwner, recentAlerts } from "@/lib/ops/alert";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/alerts — recent owner alerts (newest first).
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => NextResponse.json({ alerts: await recentAlerts() }));

// POST /api/admin/alerts — send a test alert to check that push + mail arrive.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (_req, { principal }) => {
  await alertOwner({
    key: `test:${principal.userId}:${Date.now()}`,
    title: "Testmelding",
    detail: `Dit is een test van ${principal.fullName}. Komt deze aan, dan werken de storingsmeldingen.`,
    severity: "warning",
  });
  const [alert] = await recentAlerts(1);
  return NextResponse.json({ alert });
});
