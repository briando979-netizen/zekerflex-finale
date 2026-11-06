import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { leesBeleidOpgeslagen, zetBeleid } from "@/lib/shop/winkel-ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => NextResponse.json({ beleid: await leesBeleidOpgeslagen() }));
export const PUT = withAdminAccess(["PLATFORM_ADMIN"], async (request) => NextResponse.json({ beleid: await zetBeleid(await request.json()) }));
