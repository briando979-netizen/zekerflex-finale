import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { openUitzendVacancies } from "@/lib/recruiter/source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/recruiter — openstaande uitzend-vacatures om op te sourcen.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  return NextResponse.json({ vacancies: await openUitzendVacancies() });
});
