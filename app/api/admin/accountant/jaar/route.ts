import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { jaarOverzicht } from "@/lib/accountant/jaar";
import { jaarUit } from "@/lib/accountant/jaar-kern";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/accountant/jaar?jaar=2026: conceptbalans, winst-en-verlies en de US-cijfers. Alleen lezen.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const jaar = jaarUit(request.url, Number(amsterdamDayKey(new Date()).slice(0, 4)));
  return NextResponse.json({ jaar, administraties: await jaarOverzicht(jaar) });
});
