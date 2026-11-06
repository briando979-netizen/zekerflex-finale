import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { maakInkoopAdvies } from "@/lib/shop/winkel-ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/shop-ai/inkoop — wat er besteld moet worden (voorstel; er wordt niets besteld of betaald).
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => NextResponse.json(await maakInkoopAdvies()));
