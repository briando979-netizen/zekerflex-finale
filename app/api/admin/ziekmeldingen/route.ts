import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { listZiekmeldingen } from "@/lib/uitzend/ziekmelding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/ziekmeldingen — alle ziekmeldingen (uitzendtak).
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  return NextResponse.json({ ziekmeldingen: await listZiekmeldingen(200) });
});
