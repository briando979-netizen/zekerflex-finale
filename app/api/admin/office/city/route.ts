import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { getCityData } from "@/lib/admin/city-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/office/city — de cijfers achter de 3D-stad rond het live kantoor.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => NextResponse.json(await getCityData()));
