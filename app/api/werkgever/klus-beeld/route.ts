import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, hasRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { getOrgProfileExtra, klusBeeldVan, saveOrgProfileExtra } from "@/lib/profile/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PUT /api/werkgever/klus-beeld { beeld: "foto" | "logo" } — wat de klus-kaarten van deze
// organisatie bovenaan tonen: de foto van de branche of het eigen logo (Bedrijf → foto).
// Geldt voor alle klussen van de organisatie, dus alleen voor een beheerder.

const schema = z.object({ beeld: z.enum(["foto", "logo"]) });

export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    if (!hasRole(p, "HQ_ADMIN", "PLATFORM_ADMIN")) throw AppError.forbidden("Alleen een beheerder van je organisatie kan dit wijzigen.");
    const tenantId = (await resolveEmployerScope(p)).tenantIds[0];
    if (!tenantId) throw AppError.forbidden("Geen organisatie gekoppeld aan dit account.");
    const { beeld } = schema.parse(await request.json().catch(() => ({})));
    const extra = await getOrgProfileExtra(tenantId);
    if (beeld === "logo" && !extra.photoUploadId) throw AppError.validation("Upload eerst je logo bij Bedrijf.");
    const next = await saveOrgProfileExtra(tenantId, { klusBeeld: beeld });
    return NextResponse.json({ beeld, useLogo: klusBeeldVan(tenantId, next).useLogo });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
