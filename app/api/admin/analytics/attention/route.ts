import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { liveSnapshot } from "@/lib/analytics/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/analytics/attention — live visitors, time on page, exits, nudges.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => NextResponse.json(await liveSnapshot()));
