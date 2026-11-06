import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { bewaarConcept, bewaarSchema } from "@/lib/shop/winkel-ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST /api/admin/shop-ai/opslaan — het (bijgestelde) concept opslaan als UITGEZET product met varianten.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const d = bewaarSchema.parse(await request.json());
  return NextResponse.json(await bewaarConcept(d, principal.userId));
});
