import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { overzichtGegevens } from "@/lib/boekhouding/scherm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/boekhouding/overzicht: administraties met wat er nagekeken moet worden en wat klanten nog schuldig zijn,
// plus "Wat je nog moet doen" (de deadlines). Alleen lezen.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => NextResponse.json(await overzichtGegevens()));
