import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { buildCockpit } from "@/lib/admin/cockpit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/cockpit — live revenue, volume, growth, users, shifts and bank numbers.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => NextResponse.json(await buildCockpit()));
