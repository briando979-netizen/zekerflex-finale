import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { draaiWinkelAgent, leesAgentRapport } from "@/lib/shop/winkel-agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => NextResponse.json({ rapport: await leesAgentRapport() }));
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async () => NextResponse.json({ rapport: await draaiWinkelAgent() }));
