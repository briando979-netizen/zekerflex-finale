import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { maandcontroleNu } from "@/lib/accountant/maandcontrole";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/accountant/maandcontrole: wat er niet klopt in de boekhouding van vorige maand,
// plus de komende termijnen. Alleen lezen.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => NextResponse.json(await maandcontroleNu()));
